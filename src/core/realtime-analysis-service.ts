/**
 * Real-Time Analysis Service
 * 
 * Performs static analysis on code as files are saved.
 * Shows code adjustments in chat with reply/reference capabilities.
 * 
 * NO dependencies on Mastra or AI frameworks.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { getSecretDetectionService, SecretDetectionService } from './secret-detection-service';
import { getPolicyEnforcementService, PolicyEnforcementService } from './policy-enforcement-service';
import { getCodeAdjustmentService, CodeAdjustmentService, CodeAdjustment } from './code-adjustment-service';

// Extended CodeAdjustment with additional properties for realtime analysis
export interface ExtendedCodeAdjustment extends CodeAdjustment {
  line: number;
  diff?: string;
}
import { getFileOperationsService, FileOperationsService } from './file-operations-service';
import { getCodeDiffingService, CodeDiffingService } from './code-diffing-service';

export interface AnalysisResult {
  filePath: string;
  timestamp: Date;
  issues: AnalysisIssue[];
  adjustments: ExtendedCodeAdjustment[];
  hasIssues: boolean;
}

export interface AnalysisIssue {
  type: 'secret' | 'policy-violation' | 'security-risk';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  line: number;
  column: number;
  code: string;
  suggestion?: string;
}

// Use CodeAdjustment from code-adjustment-service to avoid duplicate export

export interface ChatMessageReference {
  messageId: string;
  filePath: string;
  line: number;
  type: 'analysis' | 'adjustment';
  data: any;
}

export class RealtimeAnalysisService {
  private secretService: SecretDetectionService;
  private policyService: PolicyEnforcementService;
  private adjustmentService: CodeAdjustmentService;
  private fileService: FileOperationsService;
  private diffService: CodeDiffingService;
  private fileWatcher: vscode.FileSystemWatcher | null = null;
  private saveDisposable: vscode.Disposable | null = null;
  private chatInterface: any = null; // ChatInterface reference
  private enabled: boolean = true;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private messageIdCounter: number = 0;

  constructor() {
    this.secretService = getSecretDetectionService();
    this.policyService = getPolicyEnforcementService();
    this.adjustmentService = getCodeAdjustmentService();
    this.fileService = getFileOperationsService();
    this.diffService = getCodeDiffingService();
  }

  /**
   * Initialize real-time analysis
   */
  initialize(context: vscode.ExtensionContext, chatInterface: any): void {
    this.chatInterface = chatInterface;
    this.setupFileWatchers(context);
    this.setupSaveListener();
  }

  /**
   * Set chat interface reference
   */
  setChatInterface(chatInterface: any): void {
    this.chatInterface = chatInterface;
  }

  /**
   * Enable/disable real-time analysis
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Setup file watchers for code files
   */
  private setupFileWatchers(context: vscode.ExtensionContext): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }

    workspaceFolders.forEach(folder => {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, '**/*.{js,ts,jsx,tsx,py,php,java,c,cpp,cs,go,rs,rb,sh}')
      );

      watcher.onDidChange(async (uri) => {
        await this.handleFileChange(uri);
      });

      watcher.onDidCreate(async (uri) => {
        await this.handleFileChange(uri);
      });

      context.subscriptions.push(watcher);
    });
  }

  /**
   * Setup save listener
   */
  private setupSaveListener(): void {
    this.saveDisposable = vscode.workspace.onDidSaveTextDocument(async (document) => {
      if (!this.enabled) {
        return;
      }

      // Only analyze code files
      const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.php', '.java', '.c', '.cpp', '.cs', '.go', '.rs', '.rb', '.sh'];
      const ext = path.extname(document.uri.fsPath).toLowerCase();
      
      if (!codeExtensions.includes(ext)) {
        return;
      }

      await this.analyzeFile(document.uri.fsPath, document.getText());
    });
  }

  /**
   * Handle file change (debounced)
   */
  private async handleFileChange(uri: vscode.Uri): Promise<void> {
    if (!this.enabled) {
      return;
    }

    // Debounce rapid changes
    const existingTimer = this.debounceTimers.get(uri.fsPath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(uri.fsPath);
      try {
        const content = await this.fileService.readFile(uri.fsPath);
        await this.analyzeFile(uri.fsPath, content);
      } catch (error) {
        console.error(`Failed to analyze file ${uri.fsPath}:`, error);
      }
    }, 1000); // 1 second debounce

    this.debounceTimers.set(uri.fsPath, timer);
  }

  /**
   * Analyze file and show results in chat
   */
  private async analyzeFile(filePath: string, content: string): Promise<void> {
    try {
      const result = await this.performAnalysis(filePath, content);

      if (result.hasIssues || result.adjustments.length > 0) {
        await this.showAnalysisInChat(result);
      }
    } catch (error) {
      console.error(`Error analyzing file ${filePath}:`, error);
    }
  }

  /**
   * Perform static analysis on file
   */
  async performAnalysis(filePath: string, content: string): Promise<AnalysisResult> {
    const issues: AnalysisIssue[] = [];
    const adjustments: ExtendedCodeAdjustment[] = [];

    // Detect secrets
    const secretResult = this.secretService.detectSecrets(content, filePath);
    for (const secret of secretResult.secrets) {
      const lines = content.split('\n');
      const lineContent = lines[secret.line - 1] || '';
      
      issues.push({
        type: 'secret',
        severity: secret.severity,
        message: `${secret.patternName}: ${secret.maskedValue}`,
        line: secret.line,
        column: secret.column,
        code: lineContent,
        suggestion: 'Move secret to environment variable or secure storage',
      });
    }

    // Check policy violations
    const policyResult = this.policyService.evaluateCode(content, filePath);
    for (const violation of policyResult.violations) {
      const lines = content.split('\n');
      const lineMatch = content.substring(0, violation.context?.filePath ? 0 : content.length).match(/\n/g);
      const line = lineMatch ? lineMatch.length + 1 : 1;
      const lineContent = lines[line - 1] || '';

      issues.push({
        type: 'policy-violation',
        severity: violation.severity,
        message: violation.message,
        line,
        column: 0,
        code: lineContent,
        suggestion: 'Review security policy and apply recommended fix',
      });
    }

    // Generate code adjustments
    const language = this.detectLanguage(filePath);
    const adjustmentResult = this.adjustmentService.adjustCode(content, language);
    
    if (adjustmentResult.success && adjustmentResult.adjustments.length > 0) {
      for (const adj of adjustmentResult.adjustments) {
        // Find line number for adjustment
        const originalLines = content.split('\n');
        const adjustedLines = adj.adjustedCode.split('\n');
        const diff = this.diffService.generateDiff(content, adj.adjustedCode, filePath);
        
        // Find first changed line
        let changeLine = 1;
        if (diff.hunks.length > 0) {
          changeLine = diff.hunks[0].oldStart;
        }

        adjustments.push({
          originalCode: adj.originalCode,
          adjustedCode: adj.adjustedCode,
          reason: adj.reason,
          securityImprovements: adj.securityImprovements,
          confidence: adj.confidence,
          line: changeLine,
          diff: diff.unified,
        });
      }
    }

    return {
      filePath,
      timestamp: new Date(),
      issues,
      adjustments,
      hasIssues: issues.length > 0 || adjustments.length > 0,
    };
  }

  /**
   * Show analysis results in chat
   */
  private async showAnalysisInChat(result: AnalysisResult): Promise<void> {
    if (!this.chatInterface) {
      return;
    }

    const messageId = `analysis-${Date.now()}-${++this.messageIdCounter}`;
    const fileName = path.basename(result.filePath);

    // Build message content
    let content = `🔍 **Real-time Analysis: ${fileName}**\n\n`;

    if (result.issues.length > 0) {
      content += `**Issues Found:** ${result.issues.length}\n\n`;
      
      for (const issue of result.issues.slice(0, 5)) { // Limit to 5 issues
        const severityIcon = this.getSeverityIcon(issue.severity);
        content += `${severityIcon} **Line ${issue.line}**: ${issue.message}\n`;
        content += `\`\`\`${this.detectLanguage(result.filePath)}\n${issue.code.trim()}\n\`\`\`\n`;
        if (issue.suggestion) {
          content += `💡 *${issue.suggestion}*\n\n`;
        }
      }

      if (result.issues.length > 5) {
        content += `*...and ${result.issues.length - 5} more issues*\n\n`;
      }
    }

    if (result.adjustments.length > 0) {
      content += `**Code Adjustments Available:** ${result.adjustments.length}\n\n`;
      
      for (const adj of result.adjustments.slice(0, 3)) { // Limit to 3 adjustments
        content += `📝 **Line ${adj.line}**: ${adj.reason}\n`;
        content += `\`\`\`diff\n${adj.diff || this.generateSimpleDiff(adj.originalCode, adj.adjustedCode)}\n\`\`\`\n`;
        content += `**Security Improvements:**\n`;
        for (const improvement of adj.securityImprovements) {
          content += `  • ${improvement}\n`;
        }
        content += `\n`;
      }

      if (result.adjustments.length > 3) {
        content += `*...and ${result.adjustments.length - 3} more adjustments*\n\n`;
      }
    }

    // Add reference data
    const reference: ChatMessageReference = {
      messageId,
      filePath: result.filePath,
      line: result.issues.length > 0 ? result.issues[0].line : result.adjustments[0]?.line || 1,
      type: result.adjustments.length > 0 ? 'adjustment' : 'analysis',
      data: result,
    };

    // Send to chat with reference
    this.chatInterface.addMessageWithReference('assistant', content, reference);
  }

  /**
   * Generate simple diff for display
   */
  private generateSimpleDiff(original: string, adjusted: string): string {
    const originalLines = original.split('\n');
    const adjustedLines = adjusted.split('\n');
    const maxLines = Math.max(originalLines.length, adjustedLines.length);
    const diff: string[] = [];

    for (let i = 0; i < maxLines; i++) {
      const orig = originalLines[i] || '';
      const adj = adjustedLines[i] || '';

      if (orig !== adj) {
        if (orig) diff.push(`-${orig}`);
        if (adj) diff.push(`+${adj}`);
      } else if (orig) {
        diff.push(` ${orig}`);
      }
    }

    return diff.join('\n');
  }

  /**
   * Get severity icon
   */
  private getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'critical':
        return '🔴';
      case 'high':
        return '🟠';
      case 'medium':
        return '🟡';
      case 'low':
        return '🟢';
      default:
        return '⚪';
    }
  }

  /**
   * Detect language from file path
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const langMap: Record<string, string> = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.jsx': 'javascript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.php': 'php',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.cs': 'csharp',
      '.go': 'go',
      '.rs': 'rust',
      '.rb': 'ruby',
      '.sh': 'bash',
    };
    return langMap[ext] || 'text';
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.saveDisposable?.dispose();
    this.fileWatcher?.dispose();
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
  }
}

// Singleton instance
let realtimeAnalysisServiceInstance: RealtimeAnalysisService | null = null;

export function getRealtimeAnalysisService(): RealtimeAnalysisService {
  if (!realtimeAnalysisServiceInstance) {
    realtimeAnalysisServiceInstance = new RealtimeAnalysisService();
  }
  return realtimeAnalysisServiceInstance;
}
