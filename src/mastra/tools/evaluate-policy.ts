/**
 * Mastra Tool: Evaluate Policy
 * 
 * Orchestration only - calls CipherMate Core PolicyEnforcementService
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

import { getPolicyEnforcementService } from '../../core/policy-enforcement-service';

export const evaluatePolicyTool = createTool ? createTool({
  id: 'evaluate-policy',
  description: 'Evaluate code against security policies using CipherMate Core',
  inputSchema: z.object({
    code: z.string(),
    filePath: z.string().optional(),
  }),
  outputSchema: z.object({
    passed: z.boolean(),
    violations: z.array(z.any()),
    evaluatedPolicies: z.number(),
  }),
  execute: async ({ inputData }: { inputData: any }) => {
    // Mastra ONLY calls CipherMate Core service
    const service = getPolicyEnforcementService();
    return service.evaluateCode(inputData.code, inputData.filePath);
  },
}) : null;
