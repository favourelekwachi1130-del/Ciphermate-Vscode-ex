/**
 * Live Diagnostics Service
 *
 * Always-on static analysis that watches code as developers work.
 * Shows security issues as IDE squiggles (Problems panel) - no AI required.
 */

import * as vscode from 'vscode';
import { getSecretDetectionService } from './secret-detection-service';
import { getPolicyEnforcementService } from './policy-enforcement-service';

const DIAGNOSTIC_SOURCE = 'CipherMate';
const DEBOUNCE_MS = 500;

export interface LiveDiagnostic {
  range: vscode.Range;
  message: string;
  severity: vscode.DiagnosticSeverity;
  code: string;
  source: string;
}

export class LiveDiagnosticsService {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private secretService = getSecretDetectionService();
  private policyService = getPolicyEnforcementService();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private enabled = true;

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  }

  /**
   * Enable or disable live diagnostics
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.diagnosticCollection.clear();
    }
  }

  /**
   * Clear all diagnostics
   */
  clear(): void {
    this.diagnosticCollection.clear();
  }

  /**
   * Dispose of the diagnostic collection
   */
  dispose(): void {
    this.debounceTimers.forEach(t => clearTimeout(t));
    this.debounceTimers.clear();
    this.diagnosticCollection.dispose();
  }

  /**
   * Analyze document and update diagnostics (debounced)
   */
  analyzeDocument(document: vscode.TextDocument): void {
    if (!this.enabled) return;
    if (document.uri.scheme !== 'file') return;
    if (!this.isCodeFile(document.fileName)) return;

    const key = document.uri.toString();
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      try {
        const diagnostics = this.runStaticAnalysis(document);
        this.diagnosticCollection.set(document.uri, diagnostics);
      } catch (e) {
        console.error('LiveDiagnostics: analysis failed', e);
        this.diagnosticCollection.set(document.uri, []);
      }
    }, DEBOUNCE_MS);
    this.debounceTimers.set(key, timer);
  }

  /**
   * Run static analysis and return diagnostics
   */
  private runStaticAnalysis(document: vscode.TextDocument): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const content = document.getText();
    const lines = content.split('\n');
    const filePath = document.uri.fsPath;

    // 1. Secret detection (has line/column)
    const secretResult = this.secretService.detectSecrets(content, filePath);
    for (const s of secretResult.secrets) {
      const line = Math.min(s.line - 1, lines.length - 1);
      const lineText = lines[line] || '';
      diagnostics.push(
        new vscode.Diagnostic(
          new vscode.Range(line, 0, line, lineText.length),
          `[SECURITY] ${s.patternName}: ${s.maskedValue}. Move to environment variable.`,
          this.severityToDiagnostic(s.severity)
        )
      );
    }

    // 2. Policy violations (evaluate per-line for accurate positions)
    const policies = this.policyService.getAllPolicies?.() || [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const policy of policies) {
        for (const rule of policy.rules || []) {
          if (!rule.enabled) continue;
          const pattern = typeof rule.pattern === 'string' ? new RegExp(rule.pattern, 'i') : rule.pattern;
          const match = line.match(pattern);
          if (match) {
            const startCol = match.index ?? 0;
            const endCol = startCol + (match[0]?.length ?? line.length);
            diagnostics.push(
              new vscode.Diagnostic(
                new vscode.Range(i, startCol, i, endCol),
                `[SECURITY] ${rule.name}: ${rule.message}`,
                this.severityToDiagnostic(rule.severity)
              )
            );
          }
        }
      }
    }

    // 3. Additional inline patterns (SQL, XSS, eval, etc.) not in policy
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineDiag = this.checkInlinePatterns(line, i);
      diagnostics.push(...lineDiag);
    }

    for (const d of diagnostics) {
      (d as vscode.Diagnostic & { source?: string }).source = DIAGNOSTIC_SOURCE;
    }
    return diagnostics;
  }

  private checkInlinePatterns(line: string, lineIndex: number): vscode.Diagnostic[] {
    const out: vscode.Diagnostic[] = [];

    // SQL injection
    if (/SELECT|INSERT|UPDATE|DELETE/i.test(line) && /\+.*['"`]|\.concat\s*\(|`\$\{.*\}`/.test(line)) {
      out.push(this.makeDiagnostic(lineIndex, line, 'SQL Injection: Use parameterized queries.', vscode.DiagnosticSeverity.Warning));
    }
    // XSS
    if (/\.innerHTML\s*=/.test(line) || /dangerouslySetInnerHTML/.test(line)) {
      out.push(this.makeDiagnostic(lineIndex, line, 'XSS risk: Sanitize user input before assigning to innerHTML.', vscode.DiagnosticSeverity.Warning));
    }
    // eval
    if (/\beval\s*\(/.test(line) && !/\/\*.*eval.*\*\//.test(line)) {
      out.push(this.makeDiagnostic(lineIndex, line, 'eval() is dangerous. Avoid dynamic code execution.', vscode.DiagnosticSeverity.Warning));
    }
    // document.write
    if (/document\.write\s*\(/.test(line)) {
      out.push(this.makeDiagnostic(lineIndex, line, 'document.write can introduce XSS. Use safer DOM APIs.', vscode.DiagnosticSeverity.Information));
    }
    // Math.random for security
    if (/Math\.random\s*\(\s*\)/.test(line) && /password|token|secret|key|salt/i.test(line)) {
      out.push(this.makeDiagnostic(lineIndex, line, 'Use crypto.getRandomValues() for security-sensitive randomness.', vscode.DiagnosticSeverity.Warning));
    }
    // exec/spawn with user input
    if (/(exec|spawn|execSync|spawnSync)\s*\(/.test(line) && /\+|`\$\{|\.concat/.test(line)) {
      out.push(this.makeDiagnostic(lineIndex, line, 'Command injection risk: Pass args as array, avoid shell interpolation.', vscode.DiagnosticSeverity.Warning));
    }

    return out;
  }

  private makeDiagnostic(lineIndex: number, lineText: string, message: string, severity: vscode.DiagnosticSeverity): vscode.Diagnostic {
    return new vscode.Diagnostic(
      new vscode.Range(lineIndex, 0, lineIndex, lineText.length),
      `[SECURITY] ${message}`,
      severity
    );
  }

  private severityToDiagnostic(s: string): vscode.DiagnosticSeverity {
    switch ((s || '').toLowerCase()) {
      case 'critical': return vscode.DiagnosticSeverity.Error;
      case 'high': return vscode.DiagnosticSeverity.Warning;
      case 'medium': return vscode.DiagnosticSeverity.Warning;
      case 'low': return vscode.DiagnosticSeverity.Information;
      default: return vscode.DiagnosticSeverity.Warning;
    }
  }

  private isCodeFile(fileName: string): boolean {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    return [
      'js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs',
      'py', 'php', 'java', 'c', 'cpp', 'cs',
      'go', 'rs', 'rb', 'sh', 'bash', 'sql'
    ].includes(ext);
  }
}

let _instance: LiveDiagnosticsService | null = null;

export function getLiveDiagnosticsService(): LiveDiagnosticsService {
  if (!_instance) _instance = new LiveDiagnosticsService();
  return _instance;
}
