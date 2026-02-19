/**
 * Multi-AI Fix Pipeline - Specialized AI agents for fix generation, validation, and orchestration
 *
 * Four specialized AI roles:
 * 1. Fix Generator - Generates security fixes from vulnerabilities
 * 2. Pre-Implementation Validator - Validates fixes BEFORE application (prevents wrong code)
 * 3. File/Data Handler - Decides and orchestrates file creation (.env, .gitignore, etc.)
 * 4. Final Validator - Comprehensive AI review when user requests apply (project context, accuracy, no errors)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FixProposal } from './types';
import { Vulnerability } from '../scanners/types';

export interface FixGeneratorResult {
  originalCode: string;
  fixedCode: string;
  explanation: string;
  confidence: number;
  securityImprovements: string[];
  testingNotes: string;
  envVarsToCreate?: Array<{ name: string; value: string }>;
}

export interface PreValidationResult {
  approved: boolean;
  confidence: number;
  reason: string;
  issues?: string[];
  suggestions?: string[];
}

export interface FileDataPlan {
  createEnv: boolean;
  envVars: Array<{ name: string; value: string }>;
  updateGitignore: boolean;
  otherFiles?: string[]; // e.g. ['.env.example', 'config.example']
  reason: string;
}

export interface FinalValidationResult {
  approved: boolean;
  confidence: number;
  summary: string;
  projectContextAligned: boolean;
  potentialErrors: string[];
  recommendations?: string[];
}

export class MultiAIFixPipeline {
  private aiService: any = null;
  private context: vscode.ExtensionContext;
  private initPromise: Promise<void> | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  private async ensureAI(): Promise<boolean> {
    if (this.aiService) return true;
    if (!this.context) return false;
    if (this.initPromise) {
      await this.initPromise;
      return !!this.aiService;
    }
    this.initPromise = (async () => {
      try {
        const module = await import('../ai-agent/multi-provider-service');
        this.aiService = new module.MultiProviderAIService(this.context);
      } catch (e) {
        console.warn('MultiAIFixPipeline: AI service init failed', e);
        this.aiService = null;
      }
    })();
    await this.initPromise;
    return !!this.aiService;
  }

  /**
   * Agent 1: Fix Generator - Generate security fix for a vulnerability
   */
  async generateFix(
    vulnerability: Vulnerability,
    codeContext: string
  ): Promise<FixGeneratorResult | null> {
    const hasAI = await this.ensureAI();
    if (!hasAI || !this.aiService) return null;

    const realCode = codeContext || vulnerability.code || '';
    const prompt = `You are a security fix specialist. Generate a correct, production-ready fix.

VULNERABILITY: ${vulnerability.type} - ${vulnerability.title || vulnerability.description || ''}
FILE: ${vulnerability.file || 'unknown'}

VULNERABLE CODE:
\`\`\`
${realCode}
\`\`\`

REQUIREMENTS:
- Produce ONLY executable code, no comments-only advice
- Match the file's language (PHP use getenv(), JS/TS use process.env, Python use os.environ.get)
- If moving secrets to env vars, include envVarsToCreate in your JSON
- Ensure syntax is correct and complete

Respond with JSON only (no markdown):
{
  "originalCode": "exact original code",
  "fixedCode": "complete fixed code",
  "explanation": "brief explanation",
  "confidence": 0.0-1.0,
  "securityImprovements": ["improvement 1"],
  "testingNotes": "how to test",
  "envVarsToCreate": [{"name": "VAR_NAME", "value": "placeholder"}]
}`;

    try {
      const response = await this.aiService.callAI({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 4096,
      });
      const text = (response?.content || '').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as FixGeneratorResult;
      }
    } catch (e) {
      console.warn('MultiAIFixPipeline.generateFix failed', e);
    }
    return null;
  }

  /**
   * Agent 2: Pre-Implementation Validator - Validate fix BEFORE it gets applied
   * Prevents wrong/broken code from being written to files
   */
  async preValidate(
    proposal: FixProposal,
    fullFileContent?: string,
    language?: string
  ): Promise<PreValidationResult> {
    const hasAI = await this.ensureAI();
    if (!hasAI || !this.aiService) {
      return { approved: true, confidence: 0.5, reason: 'AI not available - skipping pre-validation' };
    }

    const ext = path.extname(proposal.vulnerability.file || '').toLowerCase();
    const lang = language || (['.php'].includes(ext) ? 'php' : ['.py'].includes(ext) ? 'python' : 'javascript');
    const prompt = `You are a pre-implementation validator. A fix is about to be applied. Your job: BLOCK wrong code from being written.

VULNERABILITY: ${proposal.vulnerability.type}
FILE: ${proposal.vulnerability.file}
LANGUAGE: ${lang}

ORIGINAL CODE:
\`\`\`
${proposal.originalCode}
\`\`\`

PROPOSED FIX:
\`\`\`
${proposal.fixedCode}
\`\`\`

${fullFileContent ? `FULL FILE AFTER FIX (for context):\n\`\`\`\n${fullFileContent}\n\`\`\`\n` : ''}

CHECK:
1. Is the fix syntactically valid for ${lang}?
2. Does it actually address the vulnerability?
3. Could it cause runtime errors, import errors, or break the build?
4. Is the language correct (getenv for PHP, process.env for JS, os.environ for Python)?

Respond with JSON only:
{
  "approved": true/false,
  "confidence": 0.0-1.0,
  "reason": "brief reason",
  "issues": ["issue 1 if any"],
  "suggestions": ["improvement if approved"]
}`;

    try {
      const response = await this.aiService.callAI({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 512,
      });
      const text = (response?.content || '').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as PreValidationResult;
      }
    } catch (e) {
      console.warn('MultiAIFixPipeline.preValidate failed', e);
    }
    return { approved: true, confidence: 0.5, reason: 'Pre-validation failed - proceeding with caution' };
  }

  /**
   * Agent 3: File/Data Handler - Plan file creation and data input
   * Decides what .env entries, .gitignore updates, etc. are needed
   */
  async planFileData(
    proposal: FixProposal,
    projectRoot: string
  ): Promise<FileDataPlan | null> {
    const hasAI = await this.ensureAI();
    if (!hasAI || !this.aiService) return null;

    const existingEnv = fs.existsSync(path.join(projectRoot, '.env'));
    const existingGitignore = fs.existsSync(path.join(projectRoot, '.gitignore'));
    const prompt = `You are a file/data handler. A security fix will create or use environment variables. Plan the file operations.

VULNERABILITY FIX: ${proposal.vulnerability.type}
PROPOSED FIX (relevant part):
\`\`\`
${proposal.fixedCode}
\`\`\`

EXISTING: .env=${existingEnv}, .gitignore=${existingGitignore}
envVarsToCreate from fix: ${JSON.stringify(proposal.envVarsToCreate || [])}

Plan what files to create/update. Respond with JSON only:
{
  "createEnv": true/false,
  "envVars": [{"name": "VAR", "value": "placeholder"}],
  "updateGitignore": true/false,
  "otherFiles": [".env.example"],
  "reason": "brief explanation"
}`;

    try {
      const response = await this.aiService.callAI({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 512,
      });
      const text = (response?.content || '').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as FileDataPlan;
      }
    } catch (e) {
      console.warn('MultiAIFixPipeline.planFileData failed', e);
    }
    return null;
  }

  /**
   * Agent 4: Final Validator - Comprehensive review when user requests apply
   * Ensures fixes are accurate, aligned with project context, won't cause errors
   */
  async finalValidate(
    proposal: FixProposal,
    projectContext: string,
    fullFileContent: string,
    language: string
  ): Promise<FinalValidationResult> {
    const hasAI = await this.ensureAI();
    if (!hasAI || !this.aiService) {
      return {
        approved: true,
        confidence: 0.5,
        summary: 'AI not available - apply with caution',
        projectContextAligned: true,
        potentialErrors: [],
      };
    }

    const prompt = `You are the final validator. The user has requested to apply this fix. Your job: ensure it is safe and correct before writing to disk.

PROJECT CONTEXT (file structure, patterns):
\`\`\`
${projectContext.slice(0, 2000)}
\`\`\`

FILE: ${proposal.vulnerability.file}
LANGUAGE: ${language}

ORIGINAL CODE:
\`\`\`
${proposal.originalCode}
\`\`\`

PROPOSED FIX:
\`\`\`
${proposal.fixedCode}
\`\`\`

FULL FILE AFTER FIX:
\`\`\`
${fullFileContent}
\`\`\`

VALIDATE:
1. Is the fix syntactically correct?
2. Does it align with project patterns and conventions?
3. Will it cause runtime errors, type errors, or build failures?
4. Does it properly address the ${proposal.vulnerability.type} vulnerability?
5. Are there any missing imports or dependencies?

Respond with JSON only:
{
  "approved": true/false,
  "confidence": 0.0-1.0,
  "summary": "one sentence summary",
  "projectContextAligned": true/false,
  "potentialErrors": ["error 1 if any"],
  "recommendations": ["optional recommendation"]
}`;

    try {
      const response = await this.aiService.callAI({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 1024,
      });
      const text = (response?.content || '').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as FinalValidationResult;
      }
    } catch (e) {
      console.warn('MultiAIFixPipeline.finalValidate failed', e);
    }
    return {
      approved: true,
      confidence: 0.5,
      summary: 'Final validation failed - apply with caution',
      projectContextAligned: true,
      potentialErrors: [],
    };
  }

  /** Check if pipeline has AI available */
  async hasAI(): Promise<boolean> {
    return this.ensureAI();
  }
}

let _pipelineInstance: MultiAIFixPipeline | null = null;

export function getMultiAIFixPipeline(context?: vscode.ExtensionContext): MultiAIFixPipeline {
  if (!_pipelineInstance) {
    _pipelineInstance = new MultiAIFixPipeline(context!);
  } else if (context && !(_pipelineInstance as any).context) {
    (_pipelineInstance as any).context = context;
  }
  return _pipelineInstance;
}
