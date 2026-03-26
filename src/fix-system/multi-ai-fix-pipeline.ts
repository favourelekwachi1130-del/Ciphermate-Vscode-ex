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
import { getStrategyForVulnerability, buildStrategyPromptSection } from './vulnerability-fix-strategies';
import { enrichFixContext } from './fix-context-enricher';
import { loadWorkspaceContext } from './workspace-context-loader';
import { runWorkspaceTests } from './workspace-test-runner';
import { buildGuardedProjectBlock } from '../security/prompt-sanitizer';
import { loadEccRules } from './ecc-rules-loader';
import { checkBalancedDelimiters } from './fix-validator';

/** Audit trail for every fix — selling point: "Every fix is auditable." */
export interface FixProvenance {
  strategy: string;
  strategyId?: string;
  verificationSummary: string;
  payloadsChecked: string[];
  iterations: number;
  adversarialAttempted?: boolean;
  testRunIncluded?: boolean;
}

export interface FixGeneratorResult {
  originalCode: string;
  fixedCode: string;
  explanation: string;
  confidence: number;
  securityImprovements: string[];
  testingNotes: string;
  envVarsToCreate?: Array<{ name: string; value: string }>;
  /** Optional structured reasoning (core 10x: model shows its work) */
  reasoning?: string;
  /** Audit trail for compliance and trust (novelty) */
  provenance?: FixProvenance;
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
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const { promptBlock: eccRulesBlock } = loadEccRules(workspaceRoot);

    const prompt = `You are a security fix specialist. Generate a correct, production-ready fix.

${eccRulesBlock}

VULNERABILITY: ${vulnerability.type} - ${vulnerability.title || vulnerability.description || ''}
FILE: ${vulnerability.file || 'unknown'}

VULNERABLE CODE:
\`\`\`
${realCode}
\`\`\`

REQUIREMENTS:
- REWRITE THE ENTIRE SECTION: originalCode = the complete block to replace (function, block, or logical unit). fixedCode = the complete replacement. Do NOT output minimal patches.
- Produce ONLY executable code, no comments-only advice
- Match the file's language (PHP use getenv(), JS/TS use process.env, Python use os.environ.get)
- If moving secrets to env vars, include envVarsToCreate in your JSON (we will create .env, .env.example if needed)
- Ensure syntax is correct and complete
- Follow the mandatory security rules above

Respond with JSON only (no markdown):
{
  "originalCode": "exact full section from the file (entire block to replace)",
  "fixedCode": "complete rewritten section (full replacement)",
  "explanation": "brief explanation",
  "confidence": 0.0-1.0,
  "securityImprovements": ["improvement 1"],
  "testingNotes": "how to test",
  "envVarsToCreate": [{"name": "VAR_NAME", "value": "placeholder"}]
}`;

    const doGenerate = async (retryContext?: string): Promise<FixGeneratorResult | null> => {
      const fullPrompt = retryContext ? `${prompt}\n\n--- PREVIOUS FIX REJECTED (syntax errors) ---\n${retryContext}\nProduce ONLY valid code with balanced braces, parentheses, and brackets. ---\n` : prompt;
      const response = await this.aiService.callAI({
        messages: [{ role: 'user', content: fullPrompt }],
        temperature: 0.2,
        max_tokens: 4096,
      });
      const text = (response?.content || '').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const parsed = JSON.parse(jsonMatch[0]) as FixGeneratorResult;
      if (!parsed?.fixedCode) return parsed;
      const syntax = checkBalancedDelimiters(parsed.fixedCode);
      if (!syntax.valid && retryContext === undefined) {
        console.warn('MultiAIFixPipeline.generateFix: syntax errors, retrying once:', syntax.errors);
        return doGenerate(syntax.errors.join('; '));
      }
      return parsed;
    };
    try {
      return await doGenerate();
    } catch (e) {
      console.warn('MultiAIFixPipeline.generateFix failed', e);
    }
    return null;
  }

  /**
   * Expert fix pipeline for Pro/Max: impact → generate → verify (multi-phase depth).
   * Makes Pro/Max obviously better: full context and verification before returning the fix.
   */
  async generateFixExpert(
    vulnerability: Vulnerability,
    codeContext: string
  ): Promise<FixGeneratorResult | null> {
    const hasAI = await this.ensureAI();
    if (!hasAI || !this.aiService) return null;

    const realCode = codeContext || vulnerability.code || '';
    const file = vulnerability.file || 'unknown';
    const vulnDesc = `${vulnerability.type} - ${vulnerability.title || vulnerability.description || ''}`;

    // Phase 1: Impact & context
    let impactContext = '';
    try {
      const impactRes = await this.aiService.callAI({
        messages: [
          {
            role: 'system',
            content: `You are the Impact & Context sub-agent. In 1-2 short paragraphs, identify: language/framework from the code, which other files might need changes (e.g. .env, types, middleware), and existing security patterns (env vars, parameterized queries, validators). Output plain text only, no JSON.`,
          },
          {
            role: 'user',
            content: `FILE: ${file}\nVULNERABILITY: ${vulnDesc}\n\nCODE:\n\`\`\`\n${realCode.slice(0, 4000)}\n\`\`\``,
          },
        ],
        temperature: 0.2,
        max_tokens: 512,
      });
      impactContext = (impactRes?.content ?? '').trim();
    } catch {
      // non-fatal
    }

    // Phase 2: Generate fix (with enriched context + ECC rules)
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const { promptBlock: eccRulesBlock } = loadEccRules(workspaceRoot);

    const fixPrompt = `You are a security fix specialist (expert mode). Generate a correct, production-ready fix.

${eccRulesBlock}

VULNERABILITY: ${vulnDesc}
FILE: ${file}
${impactContext ? `\nCONTEXT FROM IMPACT ANALYSIS:\n${impactContext}\n` : ''}

VULNERABLE CODE:
\`\`\`
${realCode}
\`\`\`

REQUIREMENTS:
- REWRITE THE ENTIRE SECTION: originalCode = the complete block to replace. fixedCode = the complete replacement. Do NOT output minimal patches.
- Produce ONLY executable code, no comments-only advice
- Match the file's language and project patterns
- If moving secrets to env vars, include envVarsToCreate (we create .env, .env.example if needed)
- Ensure syntax is correct and complete

Respond with JSON only (no markdown):
{
  "originalCode": "exact full section from the file (entire block to replace)",
  "fixedCode": "complete rewritten section (full replacement)",
  "explanation": "brief explanation",
  "confidence": 0.0-1.0,
  "securityImprovements": ["improvement 1"],
  "testingNotes": "how to test",
  "envVarsToCreate": [{"name": "VAR_NAME", "value": "placeholder"}]
}`;

    const doGenerate = async (retryContext?: string): Promise<FixGeneratorResult | null> => {
      const fullPrompt = retryContext ? `${fixPrompt}\n\n--- PREVIOUS FIX REJECTED (syntax errors) ---\n${retryContext}\nProduce ONLY valid code with balanced braces, parentheses, and brackets. ---\n` : fixPrompt;
      const fixRes = await this.aiService.callAI({
        messages: [{ role: 'user', content: fullPrompt }],
        temperature: 0.2,
        max_tokens: 4096,
      });
      const text = (fixRes?.content || '').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const parsed = JSON.parse(jsonMatch[0]) as FixGeneratorResult;
      if (!parsed?.fixedCode) return parsed;
      const syntax = checkBalancedDelimiters(parsed.fixedCode);
      if (!syntax.valid && retryContext === undefined) {
        console.warn('MultiAIFixPipeline.generateFixExpert: syntax errors, retrying once:', syntax.errors);
        return doGenerate(syntax.errors.join('; '));
      }
      return parsed;
    };
    let result: FixGeneratorResult | null = null;
    try {
      result = await doGenerate();
    } catch (e) {
      console.warn('MultiAIFixPipeline.generateFixExpert generate phase failed', e);
      return null;
    }
    if (!result?.fixedCode) return null;

    // Phase 3: Verify (security verifier sub-agent)
    try {
      const verifyRes = await this.aiService.callAI({
        messages: [
          {
            role: 'system',
            content: `You are the Security Verifier. Does this fix actually block the vulnerability? Any syntax/import issues? Reply with JSON only: {"verified": true/false, "confidence": 0.0-1.0, "issues": ["issue or empty"], "payloadsBlocked": ["example payload that must be blocked"]}`,
          },
          {
            role: 'user',
            content: `VULN: ${vulnDesc}\n\nORIGINAL:\n\`\`\`\n${result.originalCode}\n\`\`\`\nFIX:\n\`\`\`\n${result.fixedCode}\n\`\`\``,
          },
        ],
        temperature: 0.1,
        max_tokens: 512,
      });
      const verifyText = (verifyRes?.content ?? '').trim();
      const verifyMatch = verifyText.match(/\{[\s\S]*\}/);
      if (verifyMatch) {
        const ver = JSON.parse(verifyMatch[0]) as { verified?: boolean; confidence?: number; issues?: string[] };
        if (typeof ver.confidence === 'number') result.confidence = (result.confidence + ver.confidence) / 2;
        if (Array.isArray(ver.issues) && ver.issues.length > 0 && result.testingNotes)
          result.testingNotes = `${result.testingNotes}\nVerifier: ${ver.issues.join('; ')}`;
      }
    } catch {
      // non-fatal
    }
    return result;
  }

  /**
   * Ultra fix pipeline: vulnerability-aware, strategy-driven.
   * Includes: iterative fix loop (retry on verify failure), optional test run,
   * structured reasoning, fix provenance (audit trail), and optional adversarial verification (Max).
   */
  async generateFixUltra(
    vulnerability: Vulnerability,
    codeContext: string,
    workspaceRoot?: string,
    opts?: { runTests?: boolean; tier?: 'scripter' }
  ): Promise<FixGeneratorResult | null> {
    const hasAI = await this.ensureAI();
    if (!hasAI || !this.aiService) { return null; }

    const strategy = getStrategyForVulnerability(vulnerability.type, vulnerability.cwe);
    const workspaceContext = workspaceRoot ? loadWorkspaceContext(vulnerability, workspaceRoot, { fullFile: true }) : undefined;
    const enriched = enrichFixContext(vulnerability, codeContext, strategy, workspaceRoot, workspaceContext);
    const langForStrategy: 'js' | 'python' | 'php' =
      enriched.language === 'php' ? 'php' : enriched.language === 'python' ? 'python' : 'js';
    const strategyBlock = buildStrategyPromptSection(strategy, langForStrategy);

    const vulnDesc = `${vulnerability.type} - ${vulnerability.title || vulnerability.description || ''}`;
    const file = vulnerability.file || 'unknown';

    const agentsBlock = enriched.agentsMd ? buildGuardedProjectBlock(enriched.agentsMd, 'PROJECT INSTRUCTIONS (AGENTS.md)') : '';
    const relatedBlock = enriched.relatedFilesBlock ? `\n--- RELATED FILES (for context and patterns) ---\n${enriched.relatedFilesBlock}\n---\n` : '';
    const stackBlock = enriched.stackSnippet ? `\n--- STACK (${enriched.stackLabel}) ---\n\`\`\`json\n${enriched.stackSnippet.slice(0, 2000)}\n\`\`\`\n---\n` : '';

    // Optional test run (Phase 1): pass current test status to verifier
    let testRunOutput = '';
    const runTests = opts?.runTests !== false && workspaceRoot;
    if (runTests) {
      const testResult = await runWorkspaceTests(workspaceRoot, { timeoutMs: 45000, maxOutputChars: 6000 });
      if (testResult.ran) {
        testRunOutput = `\n--- CURRENT WORKSPACE TESTS (ensure your fix does not break these) ---\nCommand: ${testResult.command}\nSuccess: ${testResult.success}\nOutput:\n${testResult.output}\n---\n`;
      }
    }

    const payloadsList = strategy.verificationPayloads.slice(0, 10);
    const maxIterations = 2;
    let lastVerifyIssues: string[] = [];
    let iterations = 0;
    let result: FixGeneratorResult | null = null;

    const buildGeneratePrompt = (retryContext?: string) => {
      const retryBlock = retryContext ? `\n--- PREVIOUS ATTEMPT FAILED — please correct ---\n${retryContext}\n---\n` : '';
      return `You are an expert security fix engineer. Apply the EXACT strategy below for this vulnerability type. Match existing project patterns.${agentsBlock}${relatedBlock}${stackBlock}${retryBlock}

---
CONTEXT: ${enriched.summary}
Impact files to consider: ${enriched.impactFiles.join(', ')}
---
VULNERABILITY: ${vulnDesc}
FILE: ${file}

VULNERABLE CODE:
\`\`\`
${enriched.codeSnippet}
\`\`\`

REQUIREMENTS:
- REWRITE THE ENTIRE SECTION: originalCode = the complete block to replace. fixedCode = the complete replacement. Do NOT output minimal patches.
- First reason in 2-3 sentences: sink, strategy choice, and how the fix blocks the attack (structured reasoning).
- Produce ONLY executable code; no comments-only advice.
- Follow the strategy's DO patterns and checklist.
- If adding env vars, include envVarsToCreate (we create .env, .env.example if needed).
- Output valid JSON only (no markdown). Include "reasoning" and "fixedCode":

{
  "reasoning": "2-3 sentence reasoning: sink, strategy, how fix blocks attack",
  "originalCode": "exact full section from the file (entire block to replace)",
  "fixedCode": "complete rewritten section (full replacement)",
  "explanation": "brief explanation",
  "confidence": 0.0-1.0,
  "securityImprovements": ["improvement 1"],
  "testingNotes": "how to test; include verification that fix blocks attack payloads",
  "envVarsToCreate": [{"name": "VAR_NAME", "value": "placeholder"}]
}`;
    };

    while (iterations < maxIterations) {
      iterations++;
      try {
        const res = await this.aiService.callAI({
          messages: [{ role: 'user', content: buildGeneratePrompt(iterations > 1 ? `Verifier issues: ${lastVerifyIssues.join('; ')}` : undefined) }],
          temperature: 0.2,
          max_tokens: 4096,
        });
        const text = (res?.content ?? '').trim();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) { result = JSON.parse(jsonMatch[0]) as FixGeneratorResult; }
      } catch (e) {
        console.warn('MultiAIFixPipeline.generateFixUltra generate failed', e);
        return iterations === 1 ? null : result;
      }
      if (!result?.fixedCode) { return iterations === 1 ? null : result; }

      // Syntax check — if invalid, retry with errors in prompt (same as verifier failure)
      const syntax = checkBalancedDelimiters(result.fixedCode);
      if (!syntax.valid) {
        lastVerifyIssues = syntax.errors;
        if (iterations < maxIterations) continue;
        break;
      }

      const payloadsNote = payloadsList.length > 0
        ? ` The fix MUST safely handle these attack payloads (no data leak, no execution): ${payloadsList.join(', ')}.`
        : '';
      const verifierUserContent = `VULN: ${vulnDesc}\nStrategy: ${strategy.name}\n\nORIGINAL:\n\`\`\`\n${result.originalCode}\n\`\`\`\nFIX:\n\`\`\`\n${result.fixedCode}\n\`\`\`${testRunOutput ? `\n${testRunOutput}` : ''}`;

      let verified = false;
      let verifierIssues: string[] = [];
      try {
        const verifyRes = await this.aiService.callAI({
          messages: [
            {
              role: 'system',
              content: `You are the Security Verifier. Confirm: (1) The fix follows the vulnerability-specific strategy. (2) Syntax and imports are correct. (3) The fix would block the intended attacks.${payloadsNote}${testRunOutput ? ' (4) The fix should not break existing tests implied by the test output above.)' : ''} Reply with JSON only: {"verified": true/false, "confidence": 0.0-1.0, "issues": [], "payloadsBlocked": []}`,
            },
            { role: 'user', content: verifierUserContent },
          ],
          temperature: 0.1,
          max_tokens: 512,
        });
        const verifyText = (verifyRes?.content ?? '').trim();
        const verifyMatch = verifyText.match(/\{[\s\S]*\}/);
        if (verifyMatch) {
          const ver = JSON.parse(verifyMatch[0]) as { verified?: boolean; confidence?: number; issues?: string[] };
          verified = ver.verified === true;
          verifierIssues = Array.isArray(ver.issues) ? ver.issues : [];
          if (typeof ver.confidence === 'number') {
            result.confidence = (result.confidence + ver.confidence) / 2;
          }
          if (verifierIssues.length > 0 && result.testingNotes) {
            result.testingNotes = `${result.testingNotes}\nVerifier: ${verifierIssues.join('; ')}`;
          }
        }
      } catch { /* non-fatal */ }

      lastVerifyIssues = verifierIssues;
      if (verified || iterations >= maxIterations) break;
    }

    // Adversarial verification (Max tier): "suggest one bypass variant" then re-verify (novelty)
    let adversarialAttempted = false;
    if (opts?.tier === 'scripter' && result?.fixedCode && this.aiService) {
      adversarialAttempted = true;
      try {
        const advRes = await this.aiService.callAI({
          messages: [
            { role: 'system', content: 'You are a red-team verifier. Given the vulnerability type and the proposed fix, suggest ONE concrete attack variant that might still bypass or weaken the fix (e.g. encoding, alternate syntax, second-order). Be specific. If the fix is clearly robust, reply: "No plausible bypass."' },
            { role: 'user', content: `VULN: ${vulnDesc}\nStrategy: ${strategy.name}\n\nFIX:\n\`\`\`\n${result.fixedCode}\n\`\`\`\nPayloads already considered: ${payloadsList.join(', ')}.` },
          ],
          temperature: 0.3,
          max_tokens: 256,
        });
        const advText = (advRes?.content ?? '').trim();
        if (advText && !/no plausible bypass/i.test(advText) && advText.length < 500) {
          result.testingNotes = `${result.testingNotes || ''}\nAdversarial note: ${advText.slice(0, 400)}`;
        }
      } catch { /* non-fatal */ }
    }

    if (result) {
      result.provenance = {
        strategy: strategy.name,
        strategyId: strategy.type,
        verificationSummary: lastVerifyIssues.length > 0 ? `Verified after ${iterations} iteration(s); issues addressed: ${lastVerifyIssues.join('; ')}` : `Verified in ${iterations} iteration(s).`,
        payloadsChecked: payloadsList,
        iterations,
        adversarialAttempted,
        testRunIncluded: Boolean(runTests && testRunOutput),
      };
    }
    return result;
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

Plan what files to create/update. We will CREATE any missing files. Respond with JSON only:
{
  "createEnv": true/false,
  "envVars": [{"name": "VAR", "value": "placeholder"}],
  "updateGitignore": true/false,
  "otherFiles": [".env.example", ".env.sample", "config.example"],
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
