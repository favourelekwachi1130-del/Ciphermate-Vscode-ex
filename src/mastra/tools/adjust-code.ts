/**
 * Mastra Tool: Adjust Code
 * 
 * Orchestration only - calls CipherMate Core CodeAdjustmentService
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

import { getCodeAdjustmentService } from '../../core/code-adjustment-service';

export const adjustCodeTool = createTool ? createTool({
  id: 'adjust-code',
  description: 'Adjust code for enterprise-grade security using CipherMate Core',
  inputSchema: z.object({
    code: z.string(),
    language: z.string().default('javascript'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    adjustments: z.array(z.any()),
    errors: z.array(z.string()).optional(),
  }),
  execute: async ({ inputData }: { inputData: any }) => {
    // Mastra ONLY calls CipherMate Core service
    const service = getCodeAdjustmentService();
    return service.adjustCode(inputData.code, inputData.language);
  },
}) : null;
