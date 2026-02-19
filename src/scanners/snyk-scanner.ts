/**
 * Snyk Scanner - SCA via Snyk CLI
 * Replaces: Snyk (dependency scanning)
 * Uses: snyk test (requires snyk CLI + optional auth for full CVE DB)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseScanner } from './base-scanner';
import { ScanResult, Vulnerability, Severity } from './types';

const execAsync = promisify(exec);

interface SnykVuln {
  id?: string;
  title?: string;
  severity?: string;
  description?: string;
  package?: string;
  version?: string;
  fix?: string;
  upgradePath?: string[];
  identifiers?: { CVE?: string[] };
}

interface SnykOutput {
  vulnerabilities?: SnykVuln[];
  ok?: boolean;
}

export class SnykScanner extends BaseScanner {
  getName(): string {
    return 'snyk';
  }

  getDescription(): string {
    return 'Snyk dependency scanning (npm, Python, etc.) - Replaces Snyk, GitHub Advanced Security for SCA';
  }

  async isAvailable(): Promise<boolean> {
    const enabled = this.config.get<boolean>('scanners.enableSnyk', false);
    if (!enabled) return false;
    try {
      await execAsync('snyk --version', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async scan(): Promise<ScanResult> {
    const startTime = Date.now();
    const vulnerabilities: Vulnerability[] = [];

    try {
      const packageJsonPath = path.join(this.workspacePath, 'package.json');
      const fs = await import('fs');
      const hasPackage = fs.existsSync(packageJsonPath);

      if (!hasPackage) {
        return {
          scanner: this.getName(),
          success: true,
          vulnerabilities: [],
          summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          duration: Date.now() - startTime,
          timestamp: new Date(),
        };
      }

      const { stdout, stderr } = await execAsync(
        'snyk test --json',
        { cwd: this.workspacePath, maxBuffer: 10 * 1024 * 1024, timeout: 120000 }
      ).catch((err: any) => {
        if (err.stdout) return { stdout: err.stdout, stderr: err.stderr || '' };
        throw err;
      });

      const data: SnykOutput = JSON.parse(stdout || '{}');
      const vulns = data.vulnerabilities || [];

      for (const v of vulns) {
        const severity = this.mapSeverity(v.severity || 'medium');
        vulnerabilities.push({
          id: this.generateVulnId('snyk', packageJsonPath),
          type: 'dependency-vulnerability',
          severity,
          title: v.title || `Vulnerable: ${v.package}@${v.version}`,
          description: v.description || 'Known vulnerability in dependency',
          file: packageJsonPath,
          line: 0,
          cve: v.identifiers?.CVE,
          fix: v.fix || (v.upgradePath?.length ? `Upgrade to ${v.upgradePath[v.upgradePath.length - 1]}` : undefined),
          metadata: { scanner: 'snyk', package: v.package, version: v.version, upgradePath: v.upgradePath },
        });
      }
    } catch (error: any) {
      if (error.message?.includes('Authentication required')) {
        console.log('Snyk: Run "snyk auth" to enable full scanning');
      }
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
    if (n.includes('medium') || n.includes('moderate')) return 'medium';
    if (n.includes('low')) return 'low';
    return 'info';
  }
}
