/**
 * Benchmark Runner - Run CipherMate SAST and report metrics
 * Use with OWASP Benchmark or any workspace to measure scanner output
 */

import * as vscode from 'vscode';
import * as path from 'path';

export interface BenchmarkResult {
  durationMs: number;
  total: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
  byScanner: Record<string, number>;
}

export async function runBenchmark(
  workspacePath: string,
  context: vscode.ExtensionContext
): Promise<BenchmarkResult> {
  const start = Date.now();
  const { RepositoryScanner } = await import('../scanners/repository-scanner');
  const scanner = new RepositoryScanner(workspacePath);
  const scanResult = await scanner.scan();

  const vulns = scanner.getAllVulnerabilities(scanResult.results);
  const bySeverity: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const byScanner: Record<string, number> = {};

  for (const v of vulns) {
    bySeverity[v.severity] = (bySeverity[v.severity] || 0) + 1;
    byType[v.type || 'unknown'] = (byType[v.type || 'unknown'] || 0) + 1;
    const s = (v.metadata as any)?.scanner || v.type || 'unknown';
    byScanner[s] = (byScanner[s] || 0) + 1;
  }

  return {
    durationMs: Date.now() - start,
    total: vulns.length,
    bySeverity,
    byType,
    byScanner,
  };
}

export function formatBenchmarkReport(result: BenchmarkResult): string {
  const lines = [
    '═'.repeat(50),
    'CipherMate SAST Benchmark Report',
    '═'.repeat(50),
    `Duration: ${(result.durationMs / 1000).toFixed(2)}s`,
    `Total findings: ${result.total}`,
    '',
    'By Severity:',
    ...Object.entries(result.bySeverity).map(([k, v]) => `  ${k}: ${v}`),
    '',
    'By Type:',
    ...Object.entries(result.byType).map(([k, v]) => `  ${k}: ${v}`),
    '',
    'By Scanner:',
    ...Object.entries(result.byScanner).map(([k, v]) => `  ${k}: ${v}`),
    '═'.repeat(50),
  ];
  return lines.join('\n');
}
