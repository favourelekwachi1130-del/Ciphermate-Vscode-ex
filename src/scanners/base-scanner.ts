/**
 * Base scanner interface for all repository scanners
 */

import * as vscode from 'vscode';
import { ScanResult, Vulnerability } from './types';

export abstract class BaseScanner {
  protected workspacePath: string;
  protected config: vscode.WorkspaceConfiguration;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.config = vscode.workspace.getConfiguration('ciphermate');
  }

  /**
   * Get the scanner name
   */
  abstract getName(): string;

  /**
   * Check if scanner is available/enabled
   */
  abstract isAvailable(): Promise<boolean>;

  /**
   * Perform the scan
   */
  abstract scan(): Promise<ScanResult>;

  /**
   * Get scanner description
   */
  abstract getDescription(): string;

  /**
   * Calculate summary from vulnerabilities
   */
  protected calculateSummary(vulnerabilities: Vulnerability[]): ScanResult['summary'] {
    const summary = {
      total: vulnerabilities.length,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    for (const vuln of vulnerabilities) {
      summary[vuln.severity]++;
    }

    return summary;
  }

  /**
   * Generate unique ID for vulnerability
   */
  protected generateVulnId(type: string, file: string, line?: number): string {
    const hash = `${type}-${file}-${line || 0}`;
    return Buffer.from(hash).toString('base64').substring(0, 16);
  }
}

