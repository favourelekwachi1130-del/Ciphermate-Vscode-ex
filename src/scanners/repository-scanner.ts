/**
 * Unified Repository Scanner
 * Orchestrates all scanning tools for comprehensive repository security analysis
 */

import * as vscode from 'vscode';
import { BaseScanner } from './base-scanner';
import { DependencyScanner } from './dependency-scanner';
import { SecretsScanner } from './secrets-scanner';
import { SmartContractScanner } from './smart-contract-scanner';
import { CodePatternScanner } from './code-pattern-scanner';
import { SnykScanner } from './snyk-scanner';
import { CodeQLScanner } from './codeql-scanner';
import { CipherMateSASTScanner } from './ciphermate-sast-scanner';
import { IacScanner } from './iac-scanner';
import { ContainerScanner } from './container-scanner';
import { RepositoryScanResult, ScanResult, Vulnerability } from './types';

export class RepositoryScanner {
  private workspacePath: string;
  private scanners: BaseScanner[] = [];

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.initializeScanners();
  }

  /**
   * Initialize all available scanners based on settings
   */
  private initializeScanners(): void {
    const config = vscode.workspace.getConfiguration('ciphermate');
    
    // Initialize scanners based on settings
    if (config.get<boolean>('scanners.enableDependency', true)) {
      this.scanners.push(new DependencyScanner(this.workspacePath));
    }
    
    if (config.get<boolean>('scanners.enableSecrets', true)) {
      this.scanners.push(new SecretsScanner(this.workspacePath));
    }
    
    if (config.get<boolean>('scanners.enableSmartContract', true)) {
      this.scanners.push(new SmartContractScanner(this.workspacePath));
    }
    
    if (config.get<boolean>('scanners.enableCodePattern', true)) {
      this.scanners.push(new CodePatternScanner(this.workspacePath));
    }

    if (config.get<boolean>('scanners.enableSnyk', false)) {
      this.scanners.push(new SnykScanner(this.workspacePath));
    }

    if (config.get<boolean>('scanners.enableCodeQL', false)) {
      this.scanners.push(new CodeQLScanner(this.workspacePath));
    }

    if (config.get<boolean>('scanners.enableCipherMateSAST', true)) {
      this.scanners.push(new CipherMateSASTScanner(this.workspacePath));
    }

    if (config.get<boolean>('scanners.enableIac', true)) {
      this.scanners.push(new IacScanner(this.workspacePath));
    }

    if (config.get<boolean>('scanners.enableContainer', true)) {
      this.scanners.push(new ContainerScanner(this.workspacePath));
    }
  }

  /**
   * Human-readable step names for progress reporting
   */
  private getScannerStepName(scannerName: string): { step: string; detail: string } {
    const steps: Record<string, { step: string; detail: string }> = {
      'dependency-scanner': { step: 'Checking dependencies', detail: 'Scanning package.json, requirements.txt for known CVEs' },
      'secrets-scanner': { step: 'Scanning for secrets', detail: 'Detecting hardcoded keys, passwords, tokens, and credentials' },
      'smart-contract-scanner': { step: 'Scanning smart contracts', detail: 'Analyzing Solidity files for vulnerabilities' },
      'code-pattern-scanner': { step: 'Analyzing code patterns', detail: 'Detecting insecure patterns (SQLi, XSS, path traversal)' },
      'snyk-scanner': { step: 'Running Snyk analysis', detail: 'Checking dependencies against Snyk vulnerability database' },
      'codeql-scanner': { step: 'Running CodeQL', detail: 'Semantic code analysis for security issues' },
      'ciphermate-sast-scanner': { step: 'Running SAST analysis', detail: 'AI-powered static analysis for security flaws' },
      'iac-scanner': { step: 'Scanning Infrastructure as Code', detail: 'Terraform, CloudFormation & Kubernetes misconfigurations' },
      'container-scanner': { step: 'Scanning container images', detail: 'Dockerfile analysis & OS package vulnerabilities (Trivy)' },
    };
    return steps[scannerName] || { step: `Running ${scannerName}`, detail: 'Analyzing codebase' };
  }

  /**
   * Perform comprehensive repository scan
   */
  async scan(options?: {
    scanners?: string[];
    skipScanners?: string[];
    onProgress?: (step: string, detail: string) => void;
  }): Promise<RepositoryScanResult> {
    const startTime = Date.now();
    const results: ScanResult[] = [];

    // Filter scanners based on options
    let scannersToRun = this.scanners;

    if (options?.scanners) {
      scannersToRun = this.scanners.filter(s => options.scanners!.includes(s.getName()));
    }

    if (options?.skipScanners) {
      scannersToRun = scannersToRun.filter(s => !options.skipScanners!.includes(s.getName()));
    }

    // Helper function to yield control to event loop
    const yieldToEventLoop = (): Promise<void> => {
      return new Promise(resolve => setTimeout(resolve, 0));
    };

    // Check availability and run scanners with timeout
    for (const scanner of scannersToRun) {
      try {
        // Yield control before starting each scanner
        await yieldToEventLoop();
        
        const isAvailable = await scanner.isAvailable();
        if (!isAvailable) {
          console.log(`Scanner ${scanner.getName()} is not available, skipping...`);
          continue;
        }

        // Report progress before running scanner
        const { step, detail } = this.getScannerStepName(scanner.getName());
        options?.onProgress?.(step, detail);

        console.log(`Running scanner: ${scanner.getName()}...`);
        
        // Add timeout to prevent hanging (10 minutes per scanner - generous for large repos)
        const SCANNER_TIMEOUT = 10 * 60 * 1000; // 10 minutes
        const result = await Promise.race([
          scanner.scan(),
          new Promise<ScanResult>((_, reject) => 
            setTimeout(() => reject(new Error(`Scanner ${scanner.getName()} timed out after ${SCANNER_TIMEOUT / 1000} seconds`)), SCANNER_TIMEOUT)
          )
        ]);
        
        results.push(result);
        
        // Yield control after each scanner completes
        await yieldToEventLoop();
      } catch (error: any) {
        console.error(`Scanner ${scanner.getName()} failed:`, error);
        // Add informative vulnerability when scanner times out
        const timeoutVuln: Vulnerability | null = error.message?.includes('timed out') ? {
          id: `timeout-${scanner.getName()}-${Date.now()}`,
          type: 'scan-timeout',
          severity: 'info',
          title: `Scanner Timeout: ${scanner.getName()}`,
          description: `The ${scanner.getName()} scanner timed out after 10 minutes. This may indicate a very large repository. Consider scanning specific directories or disabling this scanner in settings.`,
          file: this.workspacePath,
          line: 0,
          column: 0,
          code: '',
          metadata: {
            scanner: scanner.getName(),
            timeout: true,
          },
        } : null;

        results.push({
          scanner: scanner.getName(),
          success: false,
          vulnerabilities: timeoutVuln ? [timeoutVuln] : [],
          summary: timeoutVuln ? { total: 1, critical: 0, high: 0, medium: 0, low: 0, info: 1 } : { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          duration: 0,
          timestamp: new Date(),
          error: error.message || String(error),
        });
      }
    }

    // Aggregate results
    const aggregated = this.aggregateResults(results);

    return {
      success: true,
      results,
      aggregated,
      duration: Date.now() - startTime,
      timestamp: new Date(),
      workspacePath: this.workspacePath,
    };
  }

  /**
   * Aggregate results from all scanners
   */
  private aggregateResults(results: ScanResult[]): RepositoryScanResult['aggregated'] {
    const aggregated = {
      total: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    for (const result of results) {
      aggregated.total += result.summary.total;
      aggregated.critical += result.summary.critical;
      aggregated.high += result.summary.high;
      aggregated.medium += result.summary.medium;
      aggregated.low += result.summary.low;
      aggregated.info += result.summary.info;
    }

    return aggregated;
  }

  /**
   * Get all vulnerabilities from scan results
   */
  getAllVulnerabilities(results: ScanResult[]): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];

    for (const result of results) {
      vulnerabilities.push(...result.vulnerabilities);
    }

    // Sort by severity (critical first)
    const severityOrder: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      info: 4,
    };

    return vulnerabilities.sort((a, b) => {
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Get list of available scanners
   */
  getAvailableScanners(): Array<{ name: string; description: string }> {
    return this.scanners.map(s => ({
      name: s.getName(),
      description: s.getDescription(),
    }));
  }
}

