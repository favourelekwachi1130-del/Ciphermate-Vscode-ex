/**
 * Mastra Tool: Detect Secrets
 * 
 * Orchestration only - calls CipherMate Core SecretDetectionService
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

import { getSecretDetectionService } from '../../core/secret-detection-service';

export const detectSecretsTool = createTool ? createTool({
  id: 'detect-secrets',
  description: 'Detect hardcoded secrets, API keys, and credentials in code using CipherMate Core',
  inputSchema: z.object({
    code: z.string(),
    filePath: z.string().optional(),
  }),
  outputSchema: z.object({
    secrets: z.array(z.any()),
    total: z.number(),
    bySeverity: z.object({
      critical: z.number(),
      high: z.number(),
      medium: z.number(),
      low: z.number(),
    }),
  }),
  execute: async ({ inputData }: { inputData: any }) => {
    // Mastra ONLY calls CipherMate Core service
    const service = getSecretDetectionService();
    return service.detectSecrets(inputData.code, inputData.filePath);
  },
}) : null;
