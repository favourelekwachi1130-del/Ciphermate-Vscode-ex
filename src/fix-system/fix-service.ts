/**
 * Fix Service - Main Orchestrator
 *
 * Coordinates the entire fix workflow:
 * 1. Fix generation (via AI)
 * 2. Diff preview
 * 3. User confirmation
 * 4. Backup creation
 * 5. Fix application (via WorkspaceEdit API)
 * 6. Validation (re-scan)
 * 7. Undo tracking
 */

import * as vscode from 'vscode';
import * as path from 'path';
import {
  FixProposal,
  FixDiff,
  FixResult,
  BatchFixResult,
  FixServiceConfig,
  ValidationResult,
  FixRiskLevel,
  FixComplexity
} from './types';
import { Vulnerability } from '../scanners/types';
import { BackupManager } from './backup-manager';
import { DiffGenerator } from './diff-generator';
import { FixApplicator } from './fix-applicator';
import { FixValidator } from './fix-validator';
import { UndoManager } from './undo-manager';
import { RuleBasedFixer, getRuleBasedFixer } from './rule-based-fixer';

export class FixService {
  private context: vscode.ExtensionContext;
  private backupManager: BackupManager;
  private diffGenerator: DiffGenerator;
  private fixApplicator: FixApplicator;
  private fixValidator: FixValidator;
  private undoManager: UndoManager;
  private ruleBasedFixer: RuleBasedFixer;
  private config: FixServiceConfig;
  private aiService: any; // Multi-provider AI service

  // Pending fix proposals awaiting user confirmation
  private pendingProposals: Map<string, FixProposal> = new Map();

  // Event emitter for fix results - allows other components to listen
  private _onFixComplete = new vscode.EventEmitter<{
    type: 'single' | 'batch';
    result: FixResult | BatchFixResult;
    summary: string;
    proposals: FixProposal[];
  }>();
  public readonly onFixComplete = this._onFixComplete.event;

  // Cleanup interval handle
  private cleanupIntervalId: NodeJS.Timeout | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;

    // Initialize components
    this.backupManager = new BackupManager(context);
    this.diffGenerator = new DiffGenerator();
    this.fixApplicator = new FixApplicator(this.backupManager);
    this.fixValidator = new FixValidator();
    this.undoManager = new UndoManager(context, this.backupManager);
    this.ruleBasedFixer = getRuleBasedFixer();

    // Load configuration
    this.config = this.loadConfig();

    // Initialize AI service asynchronously
    this.initializeAIService();

    // Start cleanup interval for expired proposals
    this.startProposalCleanup();
  }

  /**
   * Start periodic cleanup of expired fix proposals
   */
  private startProposalCleanup(): void {
    // Run every 5 minutes
    this.cleanupIntervalId = setInterval(() => {
      const now = Date.now();
      const maxAgeMs = 30 * 60 * 1000; // 30 minutes
      let cleaned = 0;

      // Use Array.from for ES5 compatibility
      const entries = Array.from(this.pendingProposals.entries());
      for (let i = 0; i < entries.length; i++) {
        const [id, proposal] = entries[i];
        const age = now - proposal.createdAt.getTime();
        if (age > maxAgeMs) {
          this.pendingProposals.delete(id);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        console.log(`FixService: Cleaned up ${cleaned} expired proposals`);
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Get count of pending proposals (for diagnostics)
   */
  public getPendingCount(): number {
    return this.pendingProposals.size;
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
    this._onFixComplete.dispose();
  }

  /**
   * Generate a fix proposal for a vulnerability
   */
  async generateFix(vulnerability: Vulnerability): Promise<FixProposal> {
    // Get the surrounding code context
    const codeContext = await this.getCodeContext(vulnerability);

    // Generate fix using AI
    const aiResponse = await this.callAIForFix(vulnerability, codeContext);

    // Create fix proposal
    const proposal: FixProposal = {
      id: `fix-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      vulnerabilityId: vulnerability.id,
      vulnerability,
      originalCode: aiResponse.originalCode || vulnerability.code || '',
      fixedCode: aiResponse.fixedCode,
      explanation: aiResponse.explanation,
      confidence: aiResponse.confidence || 0.8,
      riskLevel: this.assessRiskLevel(vulnerability, aiResponse),
      complexity: this.assessComplexity(aiResponse),
      securityImprovements: aiResponse.securityImprovements || [],
      testingNotes: aiResponse.testingNotes,
      startLine: vulnerability.line || 1,
      endLine: (vulnerability.line || 1) + (vulnerability.code?.split('\n').length || 1) - 1,
      createdAt: new Date()
    };

    // Recalculate confidence using validator
    proposal.confidence = this.fixValidator.calculateConfidence(proposal);

    // Store as pending
    this.pendingProposals.set(proposal.id, proposal);

    return proposal;
  }

  /**
   * Preview a fix (generate diff)
   */
  async previewFix(proposal: FixProposal): Promise<FixDiff> {
    const diff = this.diffGenerator.generateUnifiedDiff(
      proposal.originalCode,
      proposal.fixedCode,
      proposal.vulnerability.file
    );

    return diff;
  }

  /**
   * Apply a fix after user confirmation
   */
  async applyFix(proposal: FixProposal, confirmed: boolean = false): Promise<FixResult> {
    // Check if confirmation is required
    if (this.config.requireConfirmation && !confirmed) {
      return {
        success: false,
        fixId: proposal.id,
        backupId: '',
        validated: false,
        error: 'User confirmation required',
        status: 'pending',
        appliedAt: new Date(),
        filePath: proposal.vulnerability.file
      };
    }

    // Check minimum confidence
    if (proposal.confidence < this.config.minConfidence) {
      const proceed = await vscode.window.showWarningMessage(
        `This fix has low confidence (${Math.round(proposal.confidence * 100)}%). Proceed anyway?`,
        'Yes, Apply',
        'Cancel'
      );

      if (proceed !== 'Yes, Apply') {
        return {
          success: false,
          fixId: proposal.id,
          backupId: '',
          validated: false,
          error: 'Fix confidence too low - user cancelled',
          status: 'failed',
          appliedAt: new Date(),
          filePath: proposal.vulnerability.file
        };
      }
    }

    // Apply the fix
    const result = await this.fixApplicator.applyFix(proposal);

    if (result.success) {
      // Get backup for undo manager
      const backup = await this.backupManager.getBackup(result.backupId);
      if (backup) {
        await this.undoManager.pushFix(result, backup);
      }

      // Validate if configured
      if (this.config.validateAfterFix) {
        const validation = await this.fixValidator.validateFix(proposal, proposal.vulnerability);
        result.validated = validation.vulnerabilityResolved;
        result.regressions = validation.newVulnerabilities;

        if (!validation.vulnerabilityResolved) {
          vscode.window.showWarningMessage(
            'Fix applied but vulnerability may still be present. Consider reviewing manually.'
          );
        }

        if (validation.hasRegressions) {
          vscode.window.showWarningMessage(
            `Fix may have introduced ${validation.newVulnerabilities.length} new issue(s).`
          );
        }
      }

      // Remove from pending
      this.pendingProposals.delete(proposal.id);

      // Show success notification
      vscode.window.showInformationMessage(
        `Successfully applied fix to ${path.basename(proposal.vulnerability.file)}`
      );

      // Generate and emit detailed summary for chat display
      const summary = this.generateSingleFixSummary(result, proposal);
      this._onFixComplete.fire({
        type: 'single',
        result,
        summary,
        proposals: [proposal]
      });
    } else {
      // Emit failure summary
      const summary = this.generateSingleFixSummary(result, proposal);
      this._onFixComplete.fire({
        type: 'single',
        result,
        summary,
        proposals: [proposal]
      });
    }

    return result;
  }

  /**
   * Generate detailed summary for a single fix operation
   */
  private generateSingleFixSummary(result: FixResult, proposal: FixProposal): string {
    const lines: string[] = [];
    const vuln = proposal.vulnerability;
    const language = this.getLanguageFromPath(vuln.file);

    if (result.success) {
      const confidenceLabel = this.getConfidenceLabel(proposal.confidence);
      const riskLabel = this.capitalizeFirst(proposal.riskLevel || 'low');

      lines.push(`## Fix Applied Successfully ✓\n`);
      lines.push(`### ${vuln.type || 'Security Issue'} - \`${path.basename(vuln.file)}:${vuln.line || '?'}\``);
      lines.push(`**Confidence:** ${confidenceLabel} | **Risk:** ${riskLabel}\n`);

      // Before code block
      if (proposal.originalCode && proposal.originalCode.trim()) {
        lines.push('**Before:**');
        lines.push('```' + language);
        lines.push(this.truncateCode(proposal.originalCode.trim(), 15));
        lines.push('```\n');
      }

      // After code block
      if (proposal.fixedCode && proposal.fixedCode.trim()) {
        lines.push('**After:**');
        lines.push('```' + language);
        lines.push(this.truncateCode(proposal.fixedCode.trim(), 15));
        lines.push('```\n');
      }

      // Security improvement explanation
      if (proposal.securityImprovements && proposal.securityImprovements.length > 0) {
        lines.push(`**Security Improvement:** ${proposal.securityImprovements[0]}`);
      } else if (proposal.explanation) {
        lines.push(`**What Changed:** ${proposal.explanation}`);
      }

      lines.push('');
      lines.push(`**File Modified:** [\`${path.basename(vuln.file)}\`](file://${vuln.file})`);

      if (result.validated) {
        lines.push('\n✓ Fix validated - vulnerability resolved');
      }

      if (result.regressions && result.regressions.length > 0) {
        lines.push(`\n⚠️ ${result.regressions.length} potential regression(s) detected. Review recommended.`);
      }
    } else {
      lines.push(`## Fix Failed ✗\n`);
      lines.push(`### ${vuln.type || 'Security Issue'} - \`${path.basename(vuln.file)}:${vuln.line || '?'}\``);
      lines.push(`**Error:** ${result.error || 'Unknown error'}\n`);

      // Add suggestion
      const suggestion = this.getSuggestionForError(result.error || '', vuln.type || '');
      if (suggestion) {
        lines.push(`**Suggestion:** ${suggestion}`);
      }
    }

    lines.push('\n*Use "CipherMate: Undo Last Fix" to rollback this change.*');

    return lines.join('\n');
  }

  /**
   * Apply multiple fixes in batch
   */
  async applyBatchFixes(proposals: FixProposal[], confirmed: boolean = false): Promise<BatchFixResult> {
    if (this.config.requireConfirmation && !confirmed) {
      return {
        total: proposals.length,
        successful: 0,
        failed: proposals.length,
        results: [],
        modifiedFiles: [],
        allValidated: false
      };
    }

    // Filter proposals by minimum confidence
    const validProposals = proposals.filter(p => p.confidence >= this.config.minConfidence);
    const rejectedCount = proposals.length - validProposals.length;

    if (rejectedCount > 0) {
      vscode.window.showWarningMessage(
        `${rejectedCount} fix(es) skipped due to low confidence.`
      );
    }

    // Apply all fixes
    const results = await this.fixApplicator.applyBatchFixes(validProposals);

    // Track successful fixes in undo manager
    for (const result of results) {
      if (result.success) {
        const backup = await this.backupManager.getBackup(result.backupId);
        if (backup) {
          await this.undoManager.pushFix(result, backup);
        }

        // Validate each fix
        if (this.config.validateAfterFix) {
          const proposal = validProposals.find(p => p.id === result.fixId);
          if (proposal) {
            const validation = await this.fixValidator.validateFix(proposal, proposal.vulnerability);
            result.validated = validation.vulnerabilityResolved;
            result.regressions = validation.newVulnerabilities;
          }
        }

        // Remove from pending
        this.pendingProposals.delete(result.fixId);
      }
    }

    // Compile batch result
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const modifiedFiles = [...new Set(results.filter(r => r.success).map(r => r.filePath))];
    const allValidated = results.every(r => r.validated);

    // Collect regressions
    const allRegressions: Vulnerability[] = [];
    for (const result of results) {
      if (result.regressions) {
        allRegressions.push(...result.regressions);
      }
    }

    const batchResult: BatchFixResult = {
      total: proposals.length,
      successful,
      failed: failed + rejectedCount,
      results,
      modifiedFiles,
      allValidated,
      regressionSummary: allRegressions.length > 0 ? {
        count: allRegressions.length,
        vulnerabilities: allRegressions
      } : undefined
    };

    // Show summary
    vscode.window.showInformationMessage(
      `Batch fix complete: ${successful} applied, ${failed} failed out of ${proposals.length} total.`
    );

    // Generate summary and emit event for listeners
    const summary = this.generateDetailedSummary(batchResult, proposals);
    this._onFixComplete.fire({
      type: 'batch',
      result: batchResult,
      summary,
      proposals
    });

    return batchResult;
  }

  /**
   * Generate detailed human-readable summary of fix results
   * Includes before/after code diffs, confidence levels, and security improvements
   */
  public generateDetailedSummary(result: BatchFixResult, proposals: FixProposal[]): string {
    const lines: string[] = [];

    // Header with status indicators
    lines.push(`## Fix Results Summary\n`);
    lines.push(`**Total:** ${result.total} vulnerabilities processed`);
    lines.push(`**Successful:** ${result.successful} fixes applied ✓`);
    lines.push(`**Failed:** ${result.failed} fixes failed ✗`);
    lines.push('\n---\n');

    // Group by result status
    const successful = result.results.filter(r => r.success);
    const failed = result.results.filter(r => !r.success);

    // Successfully fixed - with detailed before/after diffs
    if (successful.length > 0) {
      lines.push(`### Successfully Fixed:\n`);

      let fixNumber = 1;
      for (const fixResult of successful) {
        const proposal = proposals.find(p => p.id === fixResult.fixId);
        if (!proposal) continue;

        const vuln = proposal.vulnerability;
        const confidenceLabel = this.getConfidenceLabel(proposal.confidence);
        const riskLabel = this.capitalizeFirst(proposal.riskLevel || 'low');
        const language = this.getLanguageFromPath(vuln.file);

        // Fix header with metadata
        lines.push(`#### ${fixNumber}. ${vuln.type || 'Security Issue'} - \`${path.basename(vuln.file)}:${vuln.line || '?'}\``);
        lines.push(`**Confidence:** ${confidenceLabel} | **Risk:** ${riskLabel}\n`);

        // Before code block
        if (proposal.originalCode && proposal.originalCode.trim()) {
          lines.push('**Before:**');
          lines.push('```' + language);
          lines.push(this.truncateCode(proposal.originalCode.trim(), 15));
          lines.push('```\n');
        }

        // After code block
        if (proposal.fixedCode && proposal.fixedCode.trim()) {
          lines.push('**After:**');
          lines.push('```' + language);
          lines.push(this.truncateCode(proposal.fixedCode.trim(), 15));
          lines.push('```\n');
        }

        // Security improvement explanation
        if (proposal.securityImprovements && proposal.securityImprovements.length > 0) {
          lines.push(`**Security Improvement:** ${proposal.securityImprovements[0]}`);
        } else if (proposal.explanation) {
          lines.push(`**What Changed:** ${proposal.explanation}`);
        }

        lines.push('\n---\n');
        fixNumber++;
      }
    }

    // Failed fixes - with actionable suggestions
    if (failed.length > 0) {
      lines.push(`### Failed to Fix:\n`);

      for (const fixResult of failed) {
        const proposal = proposals.find(p => p.id === fixResult.fixId);
        const vulnType = proposal?.vulnerability?.type || 'Unknown';
        const filePath = fixResult.filePath || proposal?.vulnerability?.file || 'unknown file';
        const line = proposal?.vulnerability?.line;

        lines.push(`- **${vulnType}** - \`${path.basename(filePath)}${line ? ':' + line : ''}\``);
        lines.push(`  - **Reason:** ${fixResult.error || 'Unknown error'}`);

        // Add suggestion based on error type
        const suggestion = this.getSuggestionForError(fixResult.error || '', vulnType);
        if (suggestion) {
          lines.push(`  - **Suggestion:** ${suggestion}`);
        }
      }
      lines.push('');
    }

    // Regressions warning
    if (result.regressionSummary && result.regressionSummary.count > 0) {
      lines.push(`### ⚠️ Regressions Detected:\n`);
      lines.push(`${result.regressionSummary.count} new issue(s) may have been introduced. Review the changes carefully.\n`);
    }

    // Modified files with clickable links
    if (result.modifiedFiles.length > 0) {
      lines.push(`### Files Modified:`);
      const fileCounts = this.countFixesByFile(successful, proposals);
      for (const file of result.modifiedFiles) {
        const count = fileCounts.get(file) || 0;
        lines.push(`- [\`${path.basename(file)}\`](file://${file})${count > 1 ? ` (${count} changes)` : ''}`);
      }
      lines.push('');
    }

    lines.push(`*Use "CipherMate: Undo Last Fix" or "CipherMate: Show Fix History" to rollback changes.*`);

    return lines.join('\n');
  }

  /**
   * Get human-readable confidence label from numeric confidence value
   */
  private getConfidenceLabel(confidence: number): string {
    const percentage = Math.round(confidence * 100);
    if (confidence >= 0.9) {
      return `High (${percentage}%)`;
    }
    if (confidence >= 0.7) {
      return `Medium (${percentage}%)`;
    }
    return `Low (${percentage}%)`;
  }

  /**
   * Get programming language identifier from file path for syntax highlighting
   */
  private getLanguageFromPath(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.sol': 'solidity',
      '.java': 'java',
      '.go': 'go',
      '.rb': 'ruby',
      '.php': 'php',
      '.cs': 'csharp',
      '.cpp': 'cpp',
      '.c': 'c',
      '.rs': 'rust',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.sh': 'bash',
      '.sql': 'sql',
      '.html': 'html',
      '.css': 'css',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.xml': 'xml'
    };
    return languageMap[ext] || '';
  }

  /**
   * Truncate code to a maximum number of lines for display
   */
  private truncateCode(code: string, maxLines: number): string {
    const lines = code.split('\n');
    if (lines.length <= maxLines) {
      return code;
    }
    return lines.slice(0, maxLines).join('\n') + '\n// ... (' + (lines.length - maxLines) + ' more lines)';
  }

  /**
   * Capitalize first letter of a string
   */
  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Get actionable suggestion based on error type
   */
  private getSuggestionForError(error: string, vulnType: string): string | null {
    const errorLower = error.toLowerCase();

    if (errorLower.includes('complex') || errorLower.includes('manual')) {
      return 'This pattern requires manual review. Consider refactoring the surrounding code.';
    }
    if (errorLower.includes('confidence') || errorLower.includes('low')) {
      return 'Configure a more capable AI provider for higher confidence fixes.';
    }
    if (errorLower.includes('file') || errorLower.includes('not found')) {
      return 'Ensure the file exists and is accessible.';
    }
    if (errorLower.includes('permission') || errorLower.includes('access')) {
      return 'Check file permissions and try again.';
    }
    if (vulnType.toLowerCase().includes('ssrf')) {
      return 'Add URL allowlist validation before making external requests.';
    }
    if (vulnType.toLowerCase().includes('injection')) {
      return 'Use parameterized queries or prepared statements.';
    }

    return null;
  }

  /**
   * Count fixes per file for summary display
   */
  private countFixesByFile(results: FixResult[], proposals: FixProposal[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const result of results) {
      const proposal = proposals.find(p => p.id === result.fixId);
      const file = result.filePath || proposal?.vulnerability?.file;
      if (file) {
        counts.set(file, (counts.get(file) || 0) + 1);
      }
    }
    return counts;
  }

  /**
   * Undo the last applied fix
   */
  async undoLastFix(): Promise<boolean> {
    const result = await this.undoManager.undoLastFix();
    return result.success;
  }

  /**
   * Undo a specific fix
   */
  async undoFix(fixId: string): Promise<boolean> {
    const result = await this.undoManager.undoFix(fixId);
    return result.success;
  }

  /**
   * Undo all applied fixes
   */
  async undoAll(): Promise<{ success: number; failed: number }> {
    const result = await this.undoManager.undoAll();
    return { success: result.success, failed: result.failed };
  }

  /**
   * Check if undo is available
   */
  async canUndo(): Promise<boolean> {
    return this.undoManager.canUndo();
  }

  /**
   * Get undo history
   */
  async getUndoHistory() {
    return this.undoManager.getUndoHistory();
  }

  /**
   * Get pending proposals awaiting confirmation
   */
  getPendingProposals(): FixProposal[] {
    return Array.from(this.pendingProposals.values());
  }

  /**
   * Cancel a pending proposal
   */
  cancelProposal(fixId: string): boolean {
    return this.pendingProposals.delete(fixId);
  }

  /**
   * Generate batch preview for multiple fixes
   */
  async generateBatchPreview(proposals: FixProposal[]): Promise<{
    proposals: FixProposal[];
    diffs: FixDiff[];
    summary: {
      totalFiles: number;
      totalChanges: number;
      totalAdditions: number;
      totalDeletions: number;
      overallConfidence: number;
    };
  }> {
    const diffs: FixDiff[] = [];
    let totalAdditions = 0;
    let totalDeletions = 0;
    let confidenceSum = 0;

    for (const proposal of proposals) {
      const diff = await this.previewFix(proposal);
      diffs.push(diff);
      totalAdditions += diff.additions;
      totalDeletions += diff.deletions;
      confidenceSum += proposal.confidence;
    }

    const files = new Set(proposals.map(p => p.vulnerability.file));

    return {
      proposals,
      diffs,
      summary: {
        totalFiles: files.size,
        totalChanges: totalAdditions + totalDeletions,
        totalAdditions,
        totalDeletions,
        overallConfidence: proposals.length > 0 ? confidenceSum / proposals.length : 0
      }
    };
  }

  /**
   * Get the current configuration
   */
  getConfig(): FixServiceConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<FixServiceConfig>): void {
    this.config = { ...this.config, ...updates };

    // Save to VS Code settings
    const config = vscode.workspace.getConfiguration('ciphermate');
    if (updates.requireConfirmation !== undefined) {
      config.update('fixes.requireConfirmation', updates.requireConfirmation, vscode.ConfigurationTarget.Global);
    }
    if (updates.autoBackup !== undefined) {
      config.update('fixes.autoBackup', updates.autoBackup, vscode.ConfigurationTarget.Global);
    }
    if (updates.validateAfterFix !== undefined) {
      config.update('fixes.validateAfterFix', updates.validateAfterFix, vscode.ConfigurationTarget.Global);
    }
    if (updates.minConfidence !== undefined) {
      config.update('fixes.minConfidence', updates.minConfidence, vscode.ConfigurationTarget.Global);
    }
    if (updates.backupRetentionDays !== undefined) {
      config.update('fixes.backupRetentionDays', updates.backupRetentionDays, vscode.ConfigurationTarget.Global);
    }
  }

  /**
   * Clean up old backups
   */
  async cleanupBackups(): Promise<number> {
    return this.backupManager.cleanupOldBackups(this.config.backupRetentionDays);
  }

  /**
   * Get validation report for proposals
   */
  async getValidationReport(proposals: FixProposal[]) {
    return this.fixValidator.getValidationReport(proposals);
  }

  // Private helper methods

  /**
   * Load configuration from VS Code settings
   */
  private loadConfig(): FixServiceConfig {
    const config = vscode.workspace.getConfiguration('ciphermate');

    return {
      requireConfirmation: config.get('fixes.requireConfirmation', true),
      autoBackup: config.get('fixes.autoBackup', true),
      validateAfterFix: config.get('fixes.validateAfterFix', true),
      minConfidence: config.get('fixes.minConfidence', 0.7),
      backupRetentionDays: config.get('fixes.backupRetentionDays', 7),
      stopOnError: config.get('fixes.stopOnError', false)
    };
  }

  /**
   * Initialize AI service
   */
  private async initializeAIService(): Promise<void> {
    try {
      const module = await import('../ai-agent/multi-provider-service');
      this.aiService = new module.MultiProviderAIService(this.context);
    } catch (error) {
      console.error('FixService: Failed to initialize AI service:', error);
    }
  }

  /**
   * Get code context around a vulnerability
   */
  private async getCodeContext(vulnerability: Vulnerability): Promise<string> {
    // Add null check - some vulnerabilities may not have a file path
    if (!vulnerability.file) {
      console.log('FixService: No file path in vulnerability, using empty context');
      return vulnerability.code || '';
    }

    const filePath = vulnerability.file;
    const line = vulnerability.line || 1;

    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));

      // Get surrounding lines (5 lines before and after)
      const startLine = Math.max(0, line - 6);
      const endLine = Math.min(document.lineCount - 1, line + 5);

      const lines: string[] = [];
      for (let i = startLine; i <= endLine; i++) {
        lines.push(document.lineAt(i).text);
      }

      return lines.join('\n');
    } catch (error) {
      console.error('FixService: Failed to get code context:', error);
      return vulnerability.code || '';
    }
  }

  /**
   * Call AI service to generate a fix
   */
  private async callAIForFix(
    vulnerability: Vulnerability,
    codeContext: string
  ): Promise<{
    originalCode: string;
    fixedCode: string;
    explanation: string;
    confidence: number;
    securityImprovements: string[];
    testingNotes: string;
  }> {
    // Simplified prompt for small models - avoid complex JSON with nested quotes
    const codeSnippet = vulnerability.code || 'Code not provided';
    const prompt = `Fix this ${vulnerability.type} security vulnerability.

CODE TO FIX:
${codeSnippet}

CONTEXT:
${codeContext}

Provide the fixed code inside a code block. Example format:

\`\`\`javascript
// your fixed code here
\`\`\`

Then briefly explain what you changed and why it's more secure.`;

    if (!this.aiService) {
      // Fallback if AI service not available
      return {
        originalCode: vulnerability.code || '',
        fixedCode: vulnerability.fix || vulnerability.code || '',
        explanation: 'AI service not available. Using suggested fix from scanner.',
        confidence: 0.5,
        securityImprovements: ['Based on scanner recommendation'],
        testingNotes: 'Manual review recommended'
      };
    }

    try {
      const response = await this.aiService.callAI({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 2000
      });

      // Robust JSON parsing with multiple fallback strategies
      const parsed = this.parseAIResponse(response.content, vulnerability);
      if (parsed) {
        return parsed;
      }
    } catch (error) {
      console.error('FixService: AI call failed:', error);
    }

    // Try rule-based fixer as fallback
    console.log('FixService: Attempting rule-based fix for:', vulnerability.type);
    const ruleBasedFix = this.ruleBasedFixer.generateFix(vulnerability);
    if (ruleBasedFix) {
      console.log('FixService: Rule-based fix generated successfully');
      return {
        originalCode: ruleBasedFix.originalCode,
        fixedCode: ruleBasedFix.fixedCode,
        explanation: ruleBasedFix.explanation + ' (Generated using rule-based patterns - no AI required)',
        confidence: ruleBasedFix.confidence,
        securityImprovements: ruleBasedFix.securityImprovements,
        testingNotes: ruleBasedFix.testingNotes
      };
    }

    // Final fallback - use scanner-provided fix if available
    console.log('FixService: No rule-based fix available, using scanner suggestion');
    return {
      originalCode: vulnerability.code || '',
      fixedCode: vulnerability.fix || vulnerability.code || '',
      explanation: 'Using suggested fix from scanner. Configure an AI provider for more accurate fixes.',
      confidence: 0.5,
      securityImprovements: ['Based on scanner recommendation'],
      testingNotes: 'Manual review strongly recommended. Configure AI provider in CipherMate settings for better fixes.'
    };
  }

  /**
   * Parse AI response with robust error handling for small/inconsistent models
   * Handles malformed JSON, markdown code blocks, and partial responses
   */
  private parseAIResponse(content: string, vulnerability: Vulnerability): {
    originalCode: string;
    fixedCode: string;
    explanation: string;
    confidence: number;
    securityImprovements: string[];
    testingNotes: string;
  } | null {
    if (!content || typeof content !== 'string') {
      console.log('FixService: Empty or invalid AI response');
      return null;
    }

    // Strategy 1: Try to extract JSON from markdown code blocks first
    const jsonCodeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonCodeBlockMatch) {
      try {
        const parsed = JSON.parse(jsonCodeBlockMatch[1].trim());
        console.log('FixService: Successfully parsed JSON from code block');
        return this.normalizeAIResponse(parsed, vulnerability);
      } catch (e) {
        console.log('FixService: Failed to parse JSON from code block, trying other strategies');
      }
    }

    // Strategy 2: Try to find JSON object directly
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log('FixService: Successfully parsed JSON object');
        return this.normalizeAIResponse(parsed, vulnerability);
      } catch (e) {
        // Strategy 3: Try to clean and repair common JSON issues
        const cleaned = this.cleanMalformedJSON(jsonMatch[0]);
        try {
          const parsed = JSON.parse(cleaned);
          console.log('FixService: Successfully parsed cleaned JSON');
          return this.normalizeAIResponse(parsed, vulnerability);
        } catch (e2) {
          console.log('FixService: JSON repair failed:', (e2 as Error).message);
        }
      }
    }

    // Strategy 4: Try to extract key-value pairs from plain text
    const extracted = this.extractFromPlainText(content, vulnerability);
    if (extracted && extracted.fixedCode) {
      console.log('FixService: Extracted fix from plain text response');
      return extracted;
    }

    // Strategy 5: If response contains code blocks, use the last one as the fix
    const codeBlocks = content.match(/```[\w]*\n([\s\S]*?)\n```/g);
    if (codeBlocks && codeBlocks.length > 0) {
      const lastBlock = codeBlocks[codeBlocks.length - 1];
      const codeMatch = lastBlock.match(/```[\w]*\n([\s\S]*?)\n```/);
      if (codeMatch) {
        console.log('FixService: Using code block as fix');
        return {
          originalCode: vulnerability.code || '',
          fixedCode: codeMatch[1].trim(),
          explanation: 'Fix extracted from AI response code block',
          confidence: 0.6,
          securityImprovements: ['AI-suggested fix'],
          testingNotes: 'Manual review recommended - parsed from non-JSON response'
        };
      }
    }

    console.log('FixService: Could not parse AI response');
    return null;
  }

  /**
   * Normalize AI response to ensure all required fields exist
   */
  private normalizeAIResponse(parsed: any, vulnerability: Vulnerability): {
    originalCode: string;
    fixedCode: string;
    explanation: string;
    confidence: number;
    securityImprovements: string[];
    testingNotes: string;
  } {
    return {
      originalCode: parsed.originalCode || parsed.original_code || parsed.vulnerable_code || vulnerability.code || '',
      fixedCode: parsed.fixedCode || parsed.fixed_code || parsed.fix || parsed.secure_code || parsed.secureCode || vulnerability.fix || '',
      explanation: parsed.explanation || parsed.description || parsed.reason || 'Fix generated by AI',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
      securityImprovements: Array.isArray(parsed.securityImprovements) ? parsed.securityImprovements :
                            Array.isArray(parsed.security_improvements) ? parsed.security_improvements :
                            Array.isArray(parsed.improvements) ? parsed.improvements : [],
      testingNotes: parsed.testingNotes || parsed.testing_notes || parsed.notes || ''
    };
  }

  /**
   * Clean common malformed JSON issues from small models
   */
  private cleanMalformedJSON(json: string): string {
    let cleaned = json;

    // Remove trailing commas before closing braces/brackets
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

    // NOTE: Don't replace single quotes globally - they might be in code strings
    // The original line `cleaned = cleaned.replace(/'/g, '"');` was breaking
    // valid code that contained single quotes (e.g., JavaScript strings)
    // Instead, we only fix single-quoted property names in JSON
    cleaned = cleaned.replace(/([{,]\s*)'([^']+)'\s*:/g, '$1"$2":');
    // And single-quoted simple values (but not multi-line code blocks)
    cleaned = cleaned.replace(/:\s*'([^'\n]{1,50})'\s*([,}])/g, ':"$1"$2');

    // Remove control characters
    cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, ' ');

    // Fix unquoted property names
    cleaned = cleaned.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');

    // Fix trailing text after JSON
    const lastBrace = cleaned.lastIndexOf('}');
    if (lastBrace !== -1 && lastBrace < cleaned.length - 1) {
      cleaned = cleaned.substring(0, lastBrace + 1);
    }

    return cleaned;
  }

  /**
   * Extract fix information from plain text response
   */
  private extractFromPlainText(content: string, vulnerability: Vulnerability): {
    originalCode: string;
    fixedCode: string;
    explanation: string;
    confidence: number;
    securityImprovements: string[];
    testingNotes: string;
  } | null {
    // Look for common patterns like "Fixed code:" or "Secure version:"
    const fixPatterns = [
      /(?:fixed|secure|corrected|patched)\s*(?:code|version)?:?\s*\n?```[\w]*\n?([\s\S]*?)```/i,
      /(?:replace|change)\s*(?:with|to):?\s*\n?```[\w]*\n?([\s\S]*?)```/i,
      /(?:should be|use instead):?\s*\n?```[\w]*\n?([\s\S]*?)```/i
    ];

    for (const pattern of fixPatterns) {
      const match = content.match(pattern);
      if (match) {
        return {
          originalCode: vulnerability.code || '',
          fixedCode: match[1].trim(),
          explanation: 'Fix extracted from AI response',
          confidence: 0.6,
          securityImprovements: ['AI-suggested fix'],
          testingNotes: 'Manual review recommended'
        };
      }
    }

    return null;
  }

  /**
   * Assess the risk level of a fix
   */
  private assessRiskLevel(vulnerability: Vulnerability, aiResponse: any): FixRiskLevel {
    // Higher severity vulnerabilities have higher risk fixes
    if (vulnerability.severity === 'critical') {
      return 'high';
    }

    // Low confidence fixes are higher risk
    if ((aiResponse.confidence || 0) < 0.7) {
      return 'medium';
    }

    // Large changes are higher risk
    const originalLines = (aiResponse.originalCode || '').split('\n').length;
    const fixedLines = (aiResponse.fixedCode || '').split('\n').length;
    if (Math.abs(originalLines - fixedLines) > 10) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Assess the complexity of a fix
   */
  private assessComplexity(aiResponse: any): FixComplexity {
    const fixedCode = aiResponse.fixedCode || '';
    const lines = fixedCode.split('\n').length;

    if (lines <= 3) {
      return 'simple';
    }

    if (lines <= 10) {
      return 'moderate';
    }

    return 'complex';
  }
}
