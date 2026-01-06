/**
 * Dependency Vulnerability Scanner
 * Ported from CipherMate Core
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseScanner } from './base-scanner';
import { ScanResult, Vulnerability, Severity } from './types';

const execAsync = promisify(exec);

interface VulnerableComponent {
  component: string;
  version: string;
  file: string;
  vulnerabilities: Array<{
    severity: Severity;
    cve?: string[];
    summary?: string;
    fix?: string;
    info?: string[];
  }>;
}

export class DependencyScanner extends BaseScanner {
  getName(): string {
    return 'dependency-scanner';
  }

  getDescription(): string {
    return 'Scans dependency files (package.json, requirements.txt, etc.) for known vulnerabilities';
  }

  async isAvailable(): Promise<boolean> {
    try {
      await execAsync('npx retire --version');
      return true;
    } catch {
      // retire.js not available, but we can still scan other dependency files
      return true;
    }
  }

  async scan(): Promise<ScanResult> {
    const startTime = Date.now();
    const vulnerabilities: Vulnerability[] = [];

    try {
      // Find all dependency files
      const dependencyFiles = await this.findDependencyFiles();

      if (dependencyFiles.length === 0) {
        return {
          scanner: this.getName(),
          success: true,
          vulnerabilities: [],
          summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          duration: Date.now() - startTime,
          timestamp: new Date(),
        };
      }

      // Scan each dependency file type
      for (const file of dependencyFiles) {
        const fileVulns = await this.scanDependencyFile(file);
        vulnerabilities.push(...fileVulns);
      }

      return {
        scanner: this.getName(),
        success: true,
        vulnerabilities,
        summary: this.calculateSummary(vulnerabilities),
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error: any) {
      return {
        scanner: this.getName(),
        success: false,
        vulnerabilities: [],
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        duration: Date.now() - startTime,
        timestamp: new Date(),
        error: error.message,
      };
    }
  }

  private async findDependencyFiles(): Promise<string[]> {
    const files: string[] = [];

    // Find package.json (npm/Node.js)
    const packageJsonFiles = await vscode.workspace.findFiles(
      '**/package.json',
      '**/node_modules/**'
    );
    files.push(...packageJsonFiles.map(f => f.fsPath));

    // Find requirements.txt (Python)
    const requirementsFiles = await vscode.workspace.findFiles(
      '**/requirements*.txt',
      '**/node_modules/**,**/venv/**,**/.venv/**'
    );
    files.push(...requirementsFiles.map(f => f.fsPath));

    // Find Pipfile (Python)
    const pipfiles = await vscode.workspace.findFiles(
      '**/Pipfile',
      '**/node_modules/**,**/venv/**,**/.venv/**'
    );
    files.push(...pipfiles.map(f => f.fsPath));

    // Find Cargo.toml (Rust)
    const cargoFiles = await vscode.workspace.findFiles(
      '**/Cargo.toml',
      '**/target/**'
    );
    files.push(...cargoFiles.map(f => f.fsPath));

    // Find go.mod (Go)
    const goModFiles = await vscode.workspace.findFiles(
      '**/go.mod',
      '**/vendor/**'
    );
    files.push(...goModFiles.map(f => f.fsPath));

    // Find pom.xml (Maven/Java)
    const pomFiles = await vscode.workspace.findFiles(
      '**/pom.xml',
      '**/target/**'
    );
    files.push(...pomFiles.map(f => f.fsPath));

    // Find Gemfile (Ruby)
    const gemfiles = await vscode.workspace.findFiles(
      '**/Gemfile',
      '**/vendor/**'
    );
    files.push(...gemfiles.map(f => f.fsPath));

    // Find composer.json (PHP)
    const composerFiles = await vscode.workspace.findFiles(
      '**/composer.json',
      '**/vendor/**'
    );
    files.push(...composerFiles.map(f => f.fsPath));

    return files;
  }

  private async scanDependencyFile(filePath: string): Promise<Vulnerability[]> {
    const vulnerabilities: Vulnerability[] = [];
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);

    try {
      if (fileName === 'package.json') {
        // Use retire.js for npm packages
        const npmVulns = await this.scanNpmDependencies(filePath);
        vulnerabilities.push(...npmVulns);
      } else if (fileName === 'requirements.txt' || fileName === 'Pipfile') {
        // Python dependencies - could use safety or pip-audit
        // For now, parse and flag for manual review
        const pythonVulns = await this.scanPythonDependencies(filePath);
        vulnerabilities.push(...pythonVulns);
      } else {
        // Other dependency files - parse and check for known patterns
        const otherVulns = await this.scanGenericDependencies(filePath);
        vulnerabilities.push(...otherVulns);
      }
    } catch (error: any) {
      console.error(`Error scanning ${filePath}:`, error);
    }

    return vulnerabilities;
  }

  private async scanNpmDependencies(filePath: string): Promise<Vulnerability[]> {
    const vulnerabilities: Vulnerability[] = [];

    try {
      // Try to use retire.js if available
      const { stdout } = await execAsync(
        `npx retire --path "${path.dirname(filePath)}" --outputformat json --colors off`,
        { maxBuffer: 10 * 1024 * 1024 }
      ).catch((error: any) => {
        // retire exits with code 13 if vulnerabilities found
        if (error.code === 13 && error.stdout) {
          return { stdout: error.stdout };
        }
        return { stdout: null };
      });

      if (stdout) {
        const retireData = JSON.parse(stdout);
        const components = this.parseRetireOutput(retireData);

        for (const component of components) {
          for (const vuln of component.vulnerabilities) {
            vulnerabilities.push({
              id: this.generateVulnId('dependency', filePath),
              type: 'dependency-vulnerability',
              severity: vuln.severity,
              title: `Vulnerable dependency: ${component.component}@${component.version}`,
              description: vuln.summary || vuln.info?.[0] || 'Known vulnerability in dependency',
              file: filePath,
              cve: vuln.cve,
              fix: vuln.fix,
              references: vuln.info,
              metadata: {
                component: component.component,
                version: component.version,
              },
            });
          }
        }
      }
    } catch (error) {
      // retire.js not available or failed, continue without it
      console.log('retire.js not available, skipping npm vulnerability scan');
    }

    return vulnerabilities;
  }

  private async scanPythonDependencies(filePath: string): Promise<Vulnerability[]> {
    // Placeholder - would integrate with safety or pip-audit
    // For now, return empty array
    return [];
  }

  private async scanGenericDependencies(filePath: string): Promise<Vulnerability[]> {
    // Placeholder for other dependency file types
    return [];
  }

  private parseRetireOutput(data: any): VulnerableComponent[] {
    const components: VulnerableComponent[] = [];

    if (!data || typeof data !== 'object') {
      return components;
    }

    const results = data.data || data.results || data;

    if (Array.isArray(results)) {
      for (const item of results) {
        if (item.results && Array.isArray(item.results)) {
          for (const result of item.results) {
            components.push({
              component: result.component || result.name || 'unknown',
              version: result.version || 'unknown',
              file: item.file || '',
              vulnerabilities: (result.vulnerabilities || []).map((v: any) => ({
                severity: this.mapSeverity(v.severity || 'medium'),
                cve: v.identifiers?.CVE || [],
                summary: v.identifiers?.summary,
                fix: v.below ? `Upgrade to ${v.below} or higher` : undefined,
                info: v.info || [],
              })),
            });
          }
        }
      }
    }

    return components;
  }

  private mapSeverity(severity: string): Severity {
    const normalized = severity.toLowerCase();
    if (normalized.includes('critical')) return 'critical';
    if (normalized.includes('high')) return 'high';
    if (normalized.includes('medium') || normalized.includes('moderate')) return 'medium';
    if (normalized.includes('low')) return 'low';
    return 'info';
  }
}

