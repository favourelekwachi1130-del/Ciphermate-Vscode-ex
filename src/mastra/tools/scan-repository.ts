/**
 * Mastra Tool: Scan Repository
 * 
 * Orchestration only - calls CipherMate Core RepositoryScanner
 */

// Optional Mastra imports
let createTool: any = null;
let z: any = null;

try {
  const mastraTools = require('@mastra/core/tools');
  createTool = mastraTools.createTool;
  z = require('zod').z;
} catch (error) {
  console.warn('Mastra tools not available:', error);
}

import { RepositoryScanner } from '../../scanners/repository-scanner';

// Export tool only if Mastra is available
export const scanRepositoryTool = createTool ? createTool({
  id: 'scan-repository',
  description: 'Scan a repository for security vulnerabilities using CipherMate scanners',
  inputSchema: z.object({
    path: z.string().optional(),
    scanners: z.array(z.string()).optional(),
    skipScanners: z.array(z.string()).optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    vulnerabilities: z.array(z.any()),
    summary: z.object({
      total: z.number(),
      critical: z.number(),
      high: z.number(),
      medium: z.number(),
      low: z.number(),
      info: z.number(),
    }),
    duration: z.number(),
    timestamp: z.date(),
  }),
  execute: async ({ inputData }: { inputData: any }) => {
    // Mastra ONLY calls CipherMate Core service
    const workspacePath = inputData.path || process.cwd();
    const scanner = new RepositoryScanner(workspacePath);
    
    const result = await scanner.scan({
      scanners: inputData.scanners,
      skipScanners: inputData.skipScanners,
    });

    // Convert to tool output format
    const vulnerabilities = scanner.getAllVulnerabilities(result.results);
    
    return {
      success: result.success,
      vulnerabilities,
      summary: result.aggregated,
      duration: result.duration,
      timestamp: result.timestamp,
    };
  },
}) : null;
