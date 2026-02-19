/**
 * DAST CI Integration - Run from scripts, GitHub Actions, etc.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/dast/ci-integration.ts --url https://api.example.com
 *
 * Outputs SARIF to stdout or file for GitHub Code Scanning, DefectDojo, etc.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface CiDastOptions {
  url: string;
  outputFile?: string;
  outputFormat?: 'sarif' | 'json';
  maxEndpoints?: number;
  concurrency?: number;
  failOnCritical?: boolean;
}

/** Run DAST from CI - requires extension context in VS Code; for standalone use export scan logic */
export async function runCiScan(
  options: CiDastOptions,
  context?: { /* ExtensionContext for AI */ }
): Promise<{ success: boolean; exitCode: number; sarif?: object }> {
  const { url, outputFile, outputFormat = 'sarif', failOnCritical = true } = options;

  try {
    const { DastScanner } = await import('./dast-scanner');
    const { toSarif } = await import('./report-generator');

    const scanner = new DastScanner(context as any);
    const result = await scanner.scan({
      targetUrl: url,
      discoverFromWorkspace: !!process.cwd(),
      enableAIResponseAnalysis: false,
      maxEndpoints: options.maxEndpoints ?? 20,
      concurrency: options.concurrency ?? 3,
      enableGraphQL: true,
      enableJwtOAuth: true,
      enableIdor: true,
    });

    if (!result.success) {
      return { success: false, exitCode: 1 };
    }

    const output = outputFormat === 'sarif' ? result.sarif : result;
    const outputStr = JSON.stringify(output, null, 2);

    if (outputFile) {
      fs.mkdirSync(path.dirname(outputFile), { recursive: true });
      fs.writeFileSync(outputFile, outputStr, 'utf8');
    } else {
      console.log(outputStr);
    }

    const criticalCount = result.vulnerabilities.filter(v => v.severity === 'critical').length;
    const exitCode = failOnCritical && criticalCount > 0 ? 1 : 0;
    return { success: exitCode === 0, exitCode, sarif: result.sarif as object };
  } catch (e) {
    console.error('DAST CI scan failed:', e);
    return { success: false, exitCode: 1 };
  }
}
