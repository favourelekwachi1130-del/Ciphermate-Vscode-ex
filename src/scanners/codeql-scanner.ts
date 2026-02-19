/**
 * CodeQL Scanner - SAST via GitHub CodeQL CLI
 * Replaces: GitHub Advanced Security (CodeQL)
 * Uses: codeql database create + codeql database analyze
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseScanner } from './base-scanner';
import { ScanResult, Vulnerability, Severity } from './types';

const execAsync = promisify(exec);

interface SarifResult {
  runs?: Array<{
    results?: Array<{
      ruleId?: string;
      message?: { text?: string };
      locations?: Array<{
        physicalLocation?: {
          artifactLocation?: { uri?: string };
          region?: { startLine?: number };
        };
      }>;
      level?: string;
    }>;
  }>;
}

export class CodeQLScanner extends BaseScanner {
  private dbPath: string;

  constructor(workspacePath: string) {
    super(workspacePath);
    this.dbPath = path.join(workspacePath, '.codeql', 'db');
  }

  getName(): string {
    return 'codeql';
  }

  getDescription(): string {
    return 'GitHub CodeQL static analysis - Replaces GitHub Advanced Security';
  }

  async isAvailable(): Promise<boolean> {
    const enabled = this.config.get<boolean>('scanners.enableCodeQL', false);
    if (!enabled) return false;
    try {
      await execAsync('codeql version', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async scan(): Promise<ScanResult> {
    const startTime = Date.now();
    const vulnerabilities: Vulnerability[] = [];

    try {
      const languages = await this.detectLanguages();
      if (languages.length === 0) {
        return this.emptyResult(startTime);
      }

      for (const lang of languages.slice(0, 2)) {
        await this.createDb(lang);
        const vulns = await this.analyzeDb(lang);
        vulnerabilities.push(...vulns);
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

  private async detectLanguages(): Promise<string[]> {
    const langs: string[] = [];
    if (fs.existsSync(path.join(this.workspacePath, 'package.json'))) langs.push('javascript');
    const pyFiles = await vscode.workspace.findFiles('**/*.py', '**/node_modules/**', 1);
    if (pyFiles.length > 0 || fs.existsSync(path.join(this.workspacePath, 'requirements.txt'))) {
      langs.push('python');
    }
    return [...new Set(langs)];
  }

  private async createDb(language: string): Promise<void> {
    const db = path.join(this.dbPath, language);
    if (fs.existsSync(db)) return;
    const langFlag = language === 'javascript' ? '--language=javascript' : '--language=python';
    await execAsync(`codeql database create "${db}" ${langFlag} --source-root="${this.workspacePath}"`, {
      cwd: this.workspacePath,
      timeout: 300000,
    });
  }

  private async analyzeDb(language: string): Promise<Vulnerability[]> {
    const vulnerabilities: Vulnerability[] = [];
    const db = path.join(this.dbPath, language);
    const outPath = path.join(this.workspacePath, '.codeql', 'results.sarif');

    try {
      await execAsync(
        `codeql database analyze "${db}" security-and-quality --format=sarif-latest --output="${outPath}"`,
        { cwd: this.workspacePath, timeout: 180000 }
      );
    } catch {
      return [];
    }

    if (!fs.existsSync(outPath)) return [];
    const sarif: SarifResult = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
    const runs = sarif.runs || [];

    for (const run of runs) {
      for (const r of run.results || []) {
        const loc = r.locations?.[0]?.physicalLocation;
        const uri = loc?.artifactLocation?.uri || '';
        const filePath = uri ? path.join(this.workspacePath, decodeURIComponent(uri)) : this.workspacePath;
        const line = loc?.region?.startLine || 1;
        const severity = this.mapLevel(r.level);
        vulnerabilities.push({
          id: this.generateVulnId('codeql', filePath, line),
          type: 'sast',
          severity,
          title: r.ruleId || 'CodeQL Finding',
          description: r.message?.text || 'Security finding from CodeQL',
          file: filePath,
          line,
          metadata: { scanner: 'codeql', ruleId: r.ruleId },
        });
      }
    }
    return vulnerabilities;
  }

  private mapLevel(level?: string): Severity {
    const l = (level || '').toLowerCase();
    if (l === 'error') return 'critical';
    if (l === 'warning') return 'high';
    return 'medium';
  }

  private emptyResult(startTime: number): ScanResult {
    return {
      scanner: this.getName(),
      success: true,
      vulnerabilities: [],
      summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      duration: Date.now() - startTime,
      timestamp: new Date(),
    };
  }
}
