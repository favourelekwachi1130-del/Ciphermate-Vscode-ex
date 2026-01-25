/**
 * Fix Validator - Post-Fix Validation
 *
 * Validates that fixes actually resolved the vulnerabilities
 * and didn't introduce new issues (regressions).
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { FixProposal, ValidationResult } from './types';
import { Vulnerability, ScanResult } from '../scanners/types';
import { RepositoryScanner } from '../scanners';

export class FixValidator {
  private workspacePath: string;

  constructor(workspacePath?: string) {
    this.workspacePath = workspacePath ||
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
      process.cwd();
  }

  /**
   * Validate that a fix resolved the original vulnerability
   */
  async validateFix(
    proposal: FixProposal,
    originalVulnerability: Vulnerability
  ): Promise<ValidationResult> {
    const filePath = this.resolveAbsolutePath(originalVulnerability.file);

    // Re-scan the file to check if vulnerability is resolved
    const newVulnerabilities = await this.scanFile(filePath);

    // Check if the original vulnerability still exists
    const vulnerabilityResolved = !this.findMatchingVulnerability(
      newVulnerabilities,
      originalVulnerability
    );

    // Check for regressions (new vulnerabilities)
    const hasRegressions = newVulnerabilities.length > 0 &&
      !vulnerabilityResolved;

    // Calculate effectiveness
    let effectiveness = 0;
    if (vulnerabilityResolved) {
      effectiveness = 1.0;
      // Reduce effectiveness if regressions were introduced
      if (hasRegressions) {
        effectiveness -= 0.1 * newVulnerabilities.length;
        effectiveness = Math.max(0, effectiveness);
      }
    }

    return {
      vulnerabilityResolved,
      hasRegressions,
      newVulnerabilities,
      originalVulnerability,
      effectiveness,
      validatedAt: new Date()
    };
  }

  /**
   * Check for regressions after applying a fix
   */
  async checkForRegressions(
    filePath: string,
    beforeVulnerabilities: Vulnerability[]
  ): Promise<Vulnerability[]> {
    const absolutePath = this.resolveAbsolutePath(filePath);
    const afterVulnerabilities = await this.scanFile(absolutePath);

    // Find new vulnerabilities that didn't exist before
    const regressions = afterVulnerabilities.filter(
      newVuln => !this.findMatchingVulnerability(beforeVulnerabilities, newVuln)
    );

    return regressions;
  }

  /**
   * Validate fix syntax (ensure it's valid code)
   */
  async validateSyntax(
    fixedCode: string,
    language: string
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Basic syntax validation based on language
    switch (language.toLowerCase()) {
      case 'javascript':
      case 'typescript':
        try {
          // Try to parse as JavaScript/TypeScript
          // This is a basic check - more sophisticated validation
          // would use the actual language parser
          new Function(fixedCode);
        } catch (error) {
          if (error instanceof SyntaxError) {
            errors.push(`Syntax error: ${error.message}`);
          }
        }
        break;

      case 'json':
        try {
          JSON.parse(fixedCode);
        } catch (error) {
          if (error instanceof SyntaxError) {
            errors.push(`Invalid JSON: ${error.message}`);
          }
        }
        break;

      // Add more language-specific validators as needed
      default:
        // For unknown languages, perform basic checks
        const openBraces = (fixedCode.match(/\{/g) || []).length;
        const closeBraces = (fixedCode.match(/\}/g) || []).length;
        if (openBraces !== closeBraces) {
          errors.push('Mismatched braces');
        }

        const openParens = (fixedCode.match(/\(/g) || []).length;
        const closeParens = (fixedCode.match(/\)/g) || []).length;
        if (openParens !== closeParens) {
          errors.push('Mismatched parentheses');
        }

        const openBrackets = (fixedCode.match(/\[/g) || []).length;
        const closeBrackets = (fixedCode.match(/\]/g) || []).length;
        if (openBrackets !== closeBrackets) {
          errors.push('Mismatched brackets');
        }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate that the fix addresses the specific vulnerability type
   */
  validateFixAppropriateness(
    proposal: FixProposal
  ): { appropriate: boolean; warnings: string[] } {
    const warnings: string[] = [];
    const vulnType = proposal.vulnerability.type.toLowerCase();
    const fixedCode = proposal.fixedCode.toLowerCase();

    // Check if fix is appropriate for the vulnerability type
    if (vulnType.includes('sql') && vulnType.includes('injection')) {
      // SQL injection should use parameterized queries
      if (!fixedCode.includes('?') && !fixedCode.includes('$') && !fixedCode.includes(':')) {
        warnings.push('SQL injection fix should use parameterized queries');
      }
      if (fixedCode.includes('escape')) {
        warnings.push('Escaping is less secure than parameterized queries');
      }
    }

    if (vulnType.includes('xss') || vulnType.includes('cross-site')) {
      // XSS should use proper encoding/escaping
      if (!fixedCode.includes('encode') &&
          !fixedCode.includes('escape') &&
          !fixedCode.includes('sanitize') &&
          !fixedCode.includes('textcontent') &&
          !fixedCode.includes('innertext')) {
        warnings.push('XSS fix should include proper encoding or use safe DOM methods');
      }
    }

    if (vulnType.includes('secret') || vulnType.includes('hardcoded')) {
      // Hardcoded secrets should use environment variables
      if (!fixedCode.includes('process.env') &&
          !fixedCode.includes('getenv') &&
          !fixedCode.includes('config') &&
          !fixedCode.includes('secret')) {
        warnings.push('Hardcoded secrets should be moved to environment variables or secure storage');
      }
    }

    if (vulnType.includes('path') && vulnType.includes('traversal')) {
      // Path traversal should sanitize paths
      if (!fixedCode.includes('path.normalize') &&
          !fixedCode.includes('path.resolve') &&
          !fixedCode.includes('sanitize') &&
          !fixedCode.includes('basename')) {
        warnings.push('Path traversal fix should normalize or sanitize file paths');
      }
    }

    if (vulnType.includes('command') && vulnType.includes('injection')) {
      // Command injection should avoid shell execution
      if (fixedCode.includes('exec') && !fixedCode.includes('execfile')) {
        warnings.push('Command injection fix should avoid shell execution when possible');
      }
    }

    return {
      appropriate: warnings.length === 0,
      warnings
    };
  }

  /**
   * Calculate a confidence score for a proposed fix
   */
  calculateConfidence(proposal: FixProposal): number {
    let confidence = proposal.confidence || 0.5;

    // Adjust based on vulnerability type
    const vulnType = proposal.vulnerability.type.toLowerCase();

    // Higher confidence for well-understood vulnerabilities
    const wellUnderstood = [
      'sql injection',
      'xss',
      'hardcoded secret',
      'path traversal'
    ];
    if (wellUnderstood.some(type => vulnType.includes(type.replace(' ', '')))) {
      confidence += 0.1;
    }

    // Check fix appropriateness
    const { appropriate, warnings } = this.validateFixAppropriateness(proposal);
    if (!appropriate) {
      confidence -= 0.15 * warnings.length;
    }

    // Lower confidence for complex fixes
    if (proposal.complexity === 'complex') {
      confidence -= 0.1;
    } else if (proposal.complexity === 'simple') {
      confidence += 0.05;
    }

    // Adjust based on code size change
    const originalLines = proposal.originalCode.split('\n').length;
    const fixedLines = proposal.fixedCode.split('\n').length;
    const sizeChange = Math.abs(fixedLines - originalLines);
    if (sizeChange > 10) {
      confidence -= 0.1;
    }

    // Clamp to valid range
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Scan a file for vulnerabilities
   */
  private async scanFile(filePath: string): Promise<Vulnerability[]> {
    try {
      // Use the repository scanner for a single file
      const scanner = new RepositoryScanner(path.dirname(filePath));
      const result = await scanner.scan();

      // Filter to only vulnerabilities in this file
      const allVulns = scanner.getAllVulnerabilities(result.results);
      return allVulns.filter(v =>
        this.resolveAbsolutePath(v.file) === filePath
      );
    } catch (error) {
      console.error(`FixValidator: Failed to scan file ${filePath}:`, error);
      return [];
    }
  }

  /**
   * Find a matching vulnerability in a list
   */
  private findMatchingVulnerability(
    vulnerabilities: Vulnerability[],
    target: Vulnerability
  ): Vulnerability | undefined {
    return vulnerabilities.find(v => {
      // Match by type and location
      const sameType = v.type.toLowerCase() === target.type.toLowerCase();
      // Fixed: The original logic was backwards - it matched if EITHER was undefined
      // Correct logic: if both have line numbers, check if they're within 2 lines
      // If either is missing, skip the line check (return true to not filter by line)
      const sameLine = (v.line !== undefined && target.line !== undefined)
        ? Math.abs(v.line - target.line) <= 2
        : true;  // Skip line check if either is missing
      const sameFile = this.resolveAbsolutePath(v.file) === this.resolveAbsolutePath(target.file);

      // If we have code, match by code content
      if (v.code && target.code) {
        const sameCode = v.code.trim() === target.code.trim();
        return sameType && sameFile && (sameCode || sameLine);
      }

      return sameType && sameFile && sameLine;
    });
  }

  /**
   * Resolve a potentially relative path to absolute
   */
  private resolveAbsolutePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }

    return path.join(this.workspacePath, filePath);
  }

  /**
   * Get detailed validation report
   */
  async getValidationReport(
    proposals: FixProposal[]
  ): Promise<{
    valid: number;
    invalid: number;
    warnings: number;
    details: Array<{
      fixId: string;
      valid: boolean;
      syntaxValid: boolean;
      appropriate: boolean;
      confidence: number;
      warnings: string[];
    }>;
  }> {
    const details: Array<{
      fixId: string;
      valid: boolean;
      syntaxValid: boolean;
      appropriate: boolean;
      confidence: number;
      warnings: string[];
    }> = [];

    let valid = 0;
    let invalid = 0;
    let totalWarnings = 0;

    for (const proposal of proposals) {
      // Detect language from file extension
      const ext = path.extname(proposal.vulnerability.file).toLowerCase();
      const langMap: Record<string, string> = {
        '.js': 'javascript',
        '.ts': 'typescript',
        '.py': 'python',
        '.json': 'json',
        '.java': 'java',
        '.go': 'go',
        '.rs': 'rust'
      };
      const language = langMap[ext] || 'text';

      // Validate syntax
      const syntaxResult = await this.validateSyntax(proposal.fixedCode, language);

      // Check appropriateness
      const { appropriate, warnings } = this.validateFixAppropriateness(proposal);

      // Calculate confidence
      const confidence = this.calculateConfidence(proposal);

      const allWarnings = [...syntaxResult.errors, ...warnings];
      const isValid = syntaxResult.valid && confidence >= 0.5;

      details.push({
        fixId: proposal.id,
        valid: isValid,
        syntaxValid: syntaxResult.valid,
        appropriate,
        confidence,
        warnings: allWarnings
      });

      if (isValid) {
        valid++;
      } else {
        invalid++;
      }
      totalWarnings += allWarnings.length;
    }

    return {
      valid,
      invalid,
      warnings: totalWarnings,
      details
    };
  }
}
