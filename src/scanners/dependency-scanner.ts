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
import { cveLookupService } from './cve-lookup-service';

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
    fixedVersion?: string;
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
    // Check if scanner is enabled in settings
    const enabled = this.config.get<boolean>('scanners.enableDependency', true);
    if (!enabled) {
      return false;
    }
    
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

      // Scan each dependency file type with progress reporting
      for (let i = 0; i < dependencyFiles.length; i++) {
        const file = dependencyFiles[i];
        console.log(`Scanning dependency file ${i + 1}/${dependencyFiles.length}: ${path.basename(file)}`);
        
        // Yield to event loop between files
        await new Promise(resolve => setTimeout(resolve, 0));
        
        const fileVulns = await this.scanDependencyFile(file);
        vulnerabilities.push(...fileVulns);
      }

      // Skip CVE enrichment by default to prevent hanging - can be enabled via settings
      const cveEnabled = this.config.get<boolean>('cve.enabled', false); // Default to false
      if (cveEnabled && vulnerabilities.length > 0) {
        try {
          // Use shorter timeout and skip if too many vulnerabilities
          if (vulnerabilities.length > 20) {
            console.log('Skipping CVE enrichment - too many vulnerabilities to enrich efficiently');
          } else {
            await Promise.race([
              this.enrichWithCVEData(vulnerabilities),
              new Promise<void>((_, reject) => 
                setTimeout(() => reject(new Error('CVE enrichment timed out')), 30000) // 30 second timeout
              )
            ]);
          }
        } catch (error) {
          console.warn('CVE enrichment failed or timed out, continuing without CVE data:', error);
          // Continue without CVE enrichment rather than failing entire scan
        }
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

    // Helper function to yield control to event loop
    const yieldToEventLoop = (): Promise<void> => {
      return new Promise(resolve => setTimeout(resolve, 0));
    };

    // Find package.json (npm/Node.js)
    const packageJsonFiles = await vscode.workspace.findFiles(
      '**/package.json',
      '**/node_modules/**'
    );
    files.push(...packageJsonFiles.map(f => f.fsPath));
    await yieldToEventLoop();

    // Find requirements.txt (Python)
    const requirementsFiles = await vscode.workspace.findFiles(
      '**/requirements*.txt',
      '**/{node_modules,venv,.venv}/**'
    );
    files.push(...requirementsFiles.map(f => f.fsPath));
    await yieldToEventLoop();

    // Find Pipfile (Python)
    const pipfiles = await vscode.workspace.findFiles(
      '**/Pipfile',
      '**/{node_modules,venv,.venv}/**'
    );
    files.push(...pipfiles.map(f => f.fsPath));
    await yieldToEventLoop();

    // Find Cargo.toml (Rust)
    const cargoFiles = await vscode.workspace.findFiles(
      '**/Cargo.toml',
      '**/target/**'
    );
    files.push(...cargoFiles.map(f => f.fsPath));
    await yieldToEventLoop();

    // Find go.mod (Go)
    const goModFiles = await vscode.workspace.findFiles(
      '**/go.mod',
      '**/vendor/**'
    );
    files.push(...goModFiles.map(f => f.fsPath));
    await yieldToEventLoop();

    // Find pom.xml (Maven/Java)
    const pomFiles = await vscode.workspace.findFiles(
      '**/pom.xml',
      '**/target/**'
    );
    files.push(...pomFiles.map(f => f.fsPath));
    await yieldToEventLoop();

    // Find Gemfile (Ruby)
    const gemfiles = await vscode.workspace.findFiles(
      '**/Gemfile',
      '**/vendor/**'
    );
    files.push(...gemfiles.map(f => f.fsPath));
    await yieldToEventLoop();

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
      // Check if retire.js scanning is enabled (can be slow on large repos)
      const retireEnabled = this.config.get<boolean>('scanners.enableRetire', true);
      
      if (!retireEnabled) {
        console.log('retire.js scanning disabled, skipping npm dependency scan');
        return vulnerabilities;
      }

      // Add timeout to prevent hanging (30 seconds for retire.js - shorter timeout)
      const RETIRE_TIMEOUT = 30 * 1000; // 30 seconds
      
      // Try to use retire.js if available
      const execPromise = execAsync(
        `npx retire --path "${path.dirname(filePath)}" --outputformat json --colors off`,
        { maxBuffer: 10 * 1024 * 1024, timeout: RETIRE_TIMEOUT }
      ).catch((error: any) => {
        // retire exits with code 13 if vulnerabilities found
        if (error.code === 13 && error.stdout) {
          return { stdout: error.stdout };
        }
        // Timeout or other error
        if (error.signal === 'SIGTERM' || error.message?.includes('timeout')) {
          console.log('retire.js timed out, skipping npm vulnerability scan');
        }
        return { stdout: null };
      });

      // Race against timeout
      const timeoutPromise = new Promise<{ stdout: null }>((resolve) => {
        setTimeout(() => {
          console.log('retire.js execution timed out after 30 seconds');
          resolve({ stdout: null });
        }, RETIRE_TIMEOUT);
      });

      const { stdout } = await Promise.race([execPromise, timeoutPromise]);

      if (stdout) {
        try {
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
                line: 0, // Will be resolved when applying fix
                cve: vuln.cve,
                fix: vuln.fix,
                references: vuln.info,
                metadata: {
                  component: component.component,
                  version: component.version,
                  fixedVersion: vuln.fixedVersion, // For one-click upgrade
                },
              });
            }
          }
        } catch (parseError) {
          console.error('Failed to parse retire.js output:', parseError);
        }
      }
    } catch (error) {
      // retire.js not available or failed, continue without it
      console.log('retire.js not available or failed, skipping npm vulnerability scan:', error);
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
              vulnerabilities: (result.vulnerabilities || []).map((v: any) => {
                const fixedVersion = v.below || v.upgrade || v.fixed;
                return {
                  severity: this.mapSeverity(v.severity || 'medium'),
                  cve: v.identifiers?.CVE || [],
                  summary: v.identifiers?.summary,
                  fix: fixedVersion ? `Upgrade to ${fixedVersion} or higher` : undefined,
                  fixedVersion, // For one-click SCA autofix
                  info: v.info || [],
                };
              }),
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

  /**
   * Enrich vulnerabilities with CVE data
   */
  private async enrichWithCVEData(vulnerabilities: Vulnerability[]): Promise<void> {
    // Check if CVE enrichment is enabled
    const cveEnabled = this.config.get<boolean>('cve.enabled', true);
    if (!cveEnabled) {
      return;
    }
    
    // Collect all CVE IDs
    const cveIds: string[] = [];
    const vulnCveMap = new Map<Vulnerability, string[]>();

    for (const vuln of vulnerabilities) {
      if (vuln.cve && vuln.cve.length > 0) {
        cveIds.push(...vuln.cve);
        vulnCveMap.set(vuln, vuln.cve);
      }
    }

    if (cveIds.length === 0) {
      return;
    }

    // Lookup all CVEs
    const cveDataMap = await cveLookupService.lookupMultipleCVEs([...new Set(cveIds)]);

    // Enrich vulnerabilities with CVE data
    for (const [vuln, cveIds] of vulnCveMap.entries()) {
      const enrichedCVEs: string[] = [];
      const cveReferences: string[] = [];

      for (const cveId of cveIds) {
        const cveData = cveDataMap.get(cveId);
        if (cveData) {
          enrichedCVEs.push(cveId);
          
          // Add CVSS score to description if available
          if (cveData.cvss?.v3 || cveData.cvss?.v2) {
            const cvss = cveData.cvss.v3 || cveData.cvss.v2;
            if (cvss) {
              const existingDesc = vuln.description || '';
              vuln.description = `${existingDesc}\n\nCVE ${cveId}: CVSS ${cvss.score} (${cvss.severity})`;
            }
          }

          // Add remediation if not already present
          if (cveData.remediation && !vuln.fix) {
            vuln.fix = cveData.remediation;
          }

          // Add references
          if (cveData.references) {
            cveReferences.push(...cveData.references);
          }
        }
      }

      // Update CVE list and references
      if (enrichedCVEs.length > 0) {
        vuln.cve = enrichedCVEs;
      }
      
      if (cveReferences.length > 0) {
        vuln.references = [...(vuln.references || []), ...cveReferences];
      }

      // Add CVE data to metadata
      if (!vuln.metadata) {
        vuln.metadata = {};
      }
      vuln.metadata.cveEnriched = true;
    }
  }
}

