/**
 * Eagle Eye Service - Advanced silent save watcher
 * AI-powered analysis + pattern matching. No Semgrep dependency.
 * Runs on every save, surfaces findings in dashboard.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getAISecurityAnalyzer } from './ai-security-analyzer';

export interface EagleEyeFinding {
  filePath: string;
  line: number;
  message: string;
  severity: string;
  tool: string;
  ruleId?: string;
  timestamp: Date;
}

class EagleEyeService {
  private saveDisposable: vscode.Disposable | null = null;
  private sessionFindings: EagleEyeFinding[] = [];
  private enabled = true;
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private onFindingsChanged: ((findings: EagleEyeFinding[]) => void) | null = null;
  private context: vscode.ExtensionContext | null = null;

  initialize(context: vscode.ExtensionContext): void {
    this.context = context;
    getAISecurityAnalyzer().init(context);

    const config = vscode.workspace.getConfiguration('ciphermate');
    this.enabled = config.get<boolean>('eagleEye.enabled', true);

    this.saveDisposable = vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (!this.enabled) return;

      const ext = path.extname(doc.uri.fsPath).toLowerCase();
      const codeExts = ['.js', '.ts', '.jsx', '.tsx', '.py', '.php', '.java', '.c', '.cpp', '.cs'];
      if (!codeExts.includes(ext)) return;

      await this.scanFileSilently(doc.uri.fsPath, doc.getText());
    });

    context.subscriptions.push(this.saveDisposable);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setOnFindingsChanged(cb: (findings: EagleEyeFinding[]) => void): void {
    this.onFindingsChanged = cb;
  }

  getSessionFindings(): EagleEyeFinding[] {
    return [...this.sessionFindings];
  }

  clearSession(): void {
    this.sessionFindings = [];
    this.onFindingsChanged?.(this.sessionFindings);
  }

  private async scanFileSilently(filePath: string, content?: string): Promise<void> {
    const timer = this.debounceTimers.get(filePath);
    if (timer) clearTimeout(timer);

    const t = setTimeout(async () => {
      this.debounceTimers.delete(filePath);
      try {
        const text = content ?? (await fs.promises.readFile(filePath, 'utf-8'));
        const findings = await this.runAdvancedAnalysis(filePath, text);
        if (findings.length > 0) {
          this.sessionFindings.push(...findings);
          this.onFindingsChanged?.(this.sessionFindings);
        }
      } catch (_) {
        // Silent
      }
    }, 2500);
    this.debounceTimers.set(filePath, t);
  }

  private async runAdvancedAnalysis(filePath: string, content: string): Promise<EagleEyeFinding[]> {
    const analyzer = getAISecurityAnalyzer();
    // Eagle Eye: patterns only for speed; full scan uses AI validation
    const result = await analyzer.analyzeCode(content, filePath, { validateWithAI: false, minConfidence: 35 });

    return result.issues.map((i) => ({
      filePath,
      line: i.line,
      message: i.description,
      severity: i.severity,
      tool: 'Eagle Eye',
      ruleId: i.type,
      timestamp: new Date(),
    }));
  }

  dispose(): void {
    this.saveDisposable?.dispose();
    this.debounceTimers.forEach((t) => clearTimeout(t));
    this.debounceTimers.clear();
  }
}

let instance: EagleEyeService | null = null;

export function getEagleEyeService(): EagleEyeService {
  if (!instance) instance = new EagleEyeService();
  return instance;
}
