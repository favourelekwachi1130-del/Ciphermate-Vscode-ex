/**
 * CipherMate SAST - Our own AI-powered static analysis (no paid tools)
 * Replaces: Checkmarx, complements Semgrep with AI depth
 * Uses: AI analysis + CipherMate pattern rules. 100% open source.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BaseScanner } from './base-scanner';
import { ScanResult, Vulnerability, Severity } from './types';
import { getAISecurityAnalyzer } from '../core/ai-security-analyzer';

export class CipherMateSASTScanner extends BaseScanner {
  getName(): string {
    return 'ciphermate-sast';
  }

  getDescription(): string {
    return 'CipherMate AI SAST - Semantic security analysis (our own, no paid tools)';
  }

  async isAvailable(): Promise<boolean> {
    return this.config.get<boolean>('scanners.enableCipherMateSAST', true);
  }

  async scan(): Promise<ScanResult> {
    const startTime = Date.now();
    const vulnerabilities: Vulnerability[] = [];

    try {
      const files = await this.findCodeFiles();
      const analyzer = getAISecurityAnalyzer();

      const maxFiles = this.config.get<number>('scanners.cipherMateSASTMaxFiles', 50);
      for (const file of files.slice(0, maxFiles)) {
        try {
          const content = await fs.promises.readFile(file, 'utf-8');
          if (content.length > 2 * 1024 * 1024) continue;

          const minConf = this.config.get<number>('scanners.cipherMateSASTMinConfidence', 40);
          const result = await analyzer.analyzeCode(content, file, {
            validateWithAI: true,
            minConfidence: minConf,
          });

          for (const issue of result.issues) {
            vulnerabilities.push({
              id: this.generateVulnId('ciphermate-sast', file, issue.line),
              type: issue.type || 'sast',
              severity: this.mapSeverity(issue.severity),
              title: issue.description,
              description: [issue.description, issue.explanation].filter(Boolean).join('. '),
              file,
              line: issue.line,
              fix: issue.fix,
              metadata: { scanner: 'ciphermate-sast', confidence: issue.confidence },
            });
          }
        } catch (e) {
          // Skip file on error
        }
      }
    } catch (error: any) {
      return {
        scanner: this.getName(),
        success: false,
        vulnerabilities: [],
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        duration: Date.now() - startTime,
        timestamp: new Date(),
        error: error.message || String(error),
      };
    }

    return {
      scanner: this.getName(),
      success: true,
      vulnerabilities,
      summary: this.calculateSummary(vulnerabilities),
      duration: Date.now() - startTime,
      timestamp: new Date(),
    };
  }

  private mapSeverity(s: string): Severity {
    const n = (s || '').toLowerCase();
    if (n.includes('critical')) return 'critical';
    if (n.includes('high')) return 'high';
    if (n.includes('medium')) return 'medium';
    if (n.includes('low')) return 'low';
    return 'info';
  }

  private async findCodeFiles(): Promise<string[]> {
    const exts = ['.js', '.ts', '.jsx', '.tsx', '.py', '.php', '.java', '.c', '.cpp', '.cs', '.go', '.rb'];
    const exclude = ['node_modules', '.git', 'dist', 'build', 'vendor', '.venv', 'venv'];
    const files: string[] = [];

    const walk = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            if (!exclude.includes(e.name) && !e.name.startsWith('.')) walk(full);
          } else if (exts.includes(path.extname(e.name).toLowerCase())) {
            files.push(full);
          }
        }
      } catch (_) {}
    };
    walk(this.workspacePath);
    return files;
  }
}
