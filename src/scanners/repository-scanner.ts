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
import { RepositoryScanResult, ScanResult, Vulnerability } from './types';

export class RepositoryScanner {
  private workspacePath: string;
  private scanners: BaseScanner[] = [];

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.initializeScanners();
  }

  /**
   * Initialize all available scanners
   */
  private initializeScanners(): void {
    // Core scanners (always enabled)
    this.scanners.push(new DependencyScanner(this.workspacePath));
    this.scanners.push(new SecretsScanner(this.workspacePath));
    this.scanners.push(new SmartContractScanner(this.workspacePath));
    this.scanners.push(new CodePatternScanner(this.workspacePath));

    // TODO: Add more scanners
    // this.scanners.push(new SSLAnalyzer(this.workspacePath));
    // this.scanners.push(new LogAnalyzer(this.workspacePath));
  }

  /**
   * Perform comprehensive repository scan
   */
  async scan(options?: {
    scanners?: string[];
    skipScanners?: string[];
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

    // Check availability and run scanners
    for (const scanner of scannersToRun) {
      try {
        const isAvailable = await scanner.isAvailable();
        if (!isAvailable) {
          console.log(`Scanner ${scanner.getName()} is not available, skipping...`);
          continue;
        }

        console.log(`Running scanner: ${scanner.getName()}...`);
        const result = await scanner.scan();
        results.push(result);
      } catch (error: any) {
        console.error(`Scanner ${scanner.getName()} failed:`, error);
        results.push({
          scanner: scanner.getName(),
          success: false,
          vulnerabilities: [],
          summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          duration: 0,
          timestamp: new Date(),
          error: error.message,
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

