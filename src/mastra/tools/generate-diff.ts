/**
 * Mastra Tool: Generate Diff
 * 
 * Orchestration only - calls CipherMate Core CodeDiffingService
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

import { getCodeDiffingService } from '../../core/code-diffing-service';

export const generateDiffTool = createTool ? createTool({
  id: 'generate-diff',
  description: 'Generate unified diff between two code versions using CipherMate Core',
  inputSchema: z.object({
    original: z.string(),
    modified: z.string(),
    filePath: z.string(),
  }),
  outputSchema: z.object({
    filePath: z.string(),
    unified: z.string(),
    hunks: z.array(z.any()),
    additions: z.number(),
    deletions: z.number(),
    changes: z.number(),
  }),
  execute: async ({ inputData }: { inputData: any }) => {
    // Mastra ONLY calls CipherMate Core service
    const service = getCodeDiffingService();
    return service.generateDiff(
      inputData.original,
      inputData.modified,
      inputData.filePath
    );
  },
}) : null;
