/**
 * Mastra Tool: Hash Data
 * 
 * Orchestration only - calls CipherMate Core HashingService
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

import { getHashingService } from '../../core/hashing-service';

export const hashDataTool = createTool ? createTool({
  id: 'hash-data',
  description: 'Generate hash for data using CipherMate Core',
  inputSchema: z.object({
    data: z.string(),
    algorithm: z.enum(['sha256', 'sha512']).default('sha256'),
  }),
  outputSchema: z.object({
    hash: z.string(),
  }),
  execute: async ({ inputData }: { inputData: any }) => {
    // Mastra ONLY calls CipherMate Core service
    const service = getHashingService();
    if (inputData.algorithm === 'sha256') {
      return { hash: service.sha256(inputData.data) };
    } else {
      return { hash: service.sha512(inputData.data) };
    }
  },
}) : null;
