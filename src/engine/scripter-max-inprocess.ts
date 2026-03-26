/**
 * Scripter Max In-Process Engine
 *
 * Multi-phase deep analysis: triage → sub-agents (parallel) → synthesis.
 * Pro: 2 sub-agents. Max: 4 sub-agents. Makes Pro/Max obviously better than single-call.
 *
 * Works with CipherMate token only — no external server or user API keys required.
 * Same interface as ScripterMaxEngine so the router can use either engine.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { ScripterMaxTask, ScripterMaxRequest, ScripterMaxResponse, ScripterMaxChunk, ScripterMaxStreamCallback } from './scripter-max-engine';
import { runSubAgentOrchestrator } from './scripter-subagent-orchestrator';
import { getScripterEngine } from './scripter-engine';
import type { ScripterTierForDepth } from './scripter-max-phases';
import { composeSkills } from '../core/skill-composition';
import type { SecurityIntent } from '../ai-agent/intent-recognizer';

const SKILL_DIR = 'skills';
const MAX_SKILL_CHARS = 8000;
const DEEP_TASKS: ScripterMaxTask[] = ['vulnerability-analysis', 'pentest-strategy', 'security-audit', 'code-fix-expert'];

export class ScripterMaxInProcess {
  private context: vscode.ExtensionContext;
  private aiService: any = null;
  private initPromise: Promise<void> | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  private async ensureAI(): Promise<boolean> {
    if (this.aiService) { return true; }
    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          const module = await import('../ai-agent/multi-provider-service');
          this.aiService = new module.MultiProviderAIService(this.context);
        } catch (e) {
          console.warn('ScripterMaxInProcess: AI service init failed', e);
        }
      })();
    }
    await this.initPromise;
    return !!this.aiService;
  }

  /**
   * Resolve path to skill markdown. Prefer extension directory, then workspace.
   */
  private getSkillPath(task: ScripterMaxTask): string | null {
    const extDir = this.context.extensionPath;
    const inExt = path.join(extDir, SKILL_DIR, task, 'SKILL.md');
    if (fs.existsSync(inExt)) { return inExt; }
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      const inWorkspace = path.join(workspaceRoot, SKILL_DIR, task, 'SKILL.md');
      if (fs.existsSync(inWorkspace)) { return inWorkspace; }
    }
    return null;
  }

  /**
   * Load skill content via composition layer (Option C).
   * Composes primary + context/intent-based skills for higher quality.
   */
  private loadSkillContent(req: ScripterMaxRequest): string {
    const config = vscode.workspace.getConfiguration('ciphermate');
    const useComposition = config.get<boolean>('skills.useComposition', true);
    const useAntigravity = config.get<boolean>('skills.useAntigravity', true);
    const maxChars = config.get<number>('skills.maxComposedChars', 16_000);

    if (useComposition) {
      const result = composeSkills(req.task, req.message, {
        extensionPath: this.context.extensionPath,
        workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        maxTotalChars: maxChars,
        useAntigravity,
        intent: req.intent as SecurityIntent | undefined,
      });
      if (result.content.trim().length > 0) {
        return result.content;
      }
    }

    // Fallback: single-skill load (legacy behavior)
    const skillPath = this.getSkillPath(req.task);
    if (!skillPath) {
      return this.getBuiltInSkillStub(req.task);
    }
    try {
      const raw = fs.readFileSync(skillPath, 'utf-8');
      return raw.length > MAX_SKILL_CHARS
        ? raw.slice(0, MAX_SKILL_CHARS) + '\n\n[... skill truncated for context ...]'
        : raw;
    } catch {
      return this.getBuiltInSkillStub(req.task);
    }
  }

  private getBuiltInSkillStub(task: ScripterMaxTask): string {
    const stubs: Record<ScripterMaxTask, string> = {
      'vulnerability-analysis': `# Vulnerability Analysis (in-process)
Perform deep security vulnerability analysis: precise classification (e.g. error-based vs blind SQLi, reflected vs stored XSS),
STRIDE categorisation, attack surface assessment, taint path from source to sink, CVE/cwe references, and remediation with code.`,
      'pentest-strategy': `# Pentest Strategy (in-process)
Build an offensive security assessment plan: reconnaissance, MITRE ATT&CK mapping, prioritized attack vectors,
injection/auth/SSRF/business-logic checks, and chain-exploit discovery.`,
      'security-audit': `# Security Audit (in-process)
Full codebase audit: dependency CVEs, secret detection, auth architecture, injection and crypto review,
OWASP ASVS alignment, compliance gaps, and remediation roadmap.`,
      'code-fix-expert': `# Code Fix Expert (in-process)
Generate production-ready security fixes: full file context, impact analysis, language-specific patterns
(parameterized queries, env vars, encoding), and verification steps.`,
      'general': `# General security analysis (in-process)
Provide thorough, structured security analysis and actionable recommendations.`,
    };
    return stubs[task] || stubs['general'];
  }

  /**
   * Run deep analysis: Pro/Max use multi-phase sub-agent orchestrator (DeerFlow-style);
   * others use single-call with skill context.
   */
  async run(
    req: ScripterMaxRequest,
    onChunk?: ScripterMaxStreamCallback
  ): Promise<ScripterMaxResponse> {
    const threadId = req.threadId ?? `cm-ip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();

    const emit = (chunk: ScripterMaxChunk) => onChunk?.(chunk);
    const emitSimple = (type: ScripterMaxChunk['type'], text: string, agentName?: string) => {
      onChunk?.({ type, text, ...(agentName ? { agentName } : {}) });
    };

    const hasAI = await this.ensureAI();
    if (!hasAI || !this.aiService) {
      const err = 'Scripter Max (in-process): AI service not available. Activate your CipherMate plan or add an API key.';
      emitSimple('error', err);
      throw new Error(err);
    }

    const tier = getScripterEngine(this.context).getActiveTier();
    const useOrchestrator = DEEP_TASKS.includes(req.task) && tier === 'scripter';

    if (useOrchestrator) {
      emitSimple('thinking', `Scripter: multi-phase deep analysis (${this.taskLabel(req.task)})...`);
      try {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const config = vscode.workspace.getConfiguration('ciphermate');
        const useComposition = config.get<boolean>('skills.useComposition', true);
        const skillContext = useComposition
          ? composeSkills(req.task, req.message, {
              extensionPath: this.context.extensionPath,
              workspaceRoot,
              useAntigravity: config.get<boolean>('skills.useAntigravity', true),
              maxTotalChars: config.get<number>('skills.maxComposedChars', 12_000),
              intent: req.intent as SecurityIntent | undefined,
            }).content
          : undefined;
        const result = await runSubAgentOrchestrator({
          task: req.task,
          message: req.message,
          vulnerabilityContext: req.vulnerabilityContext,
          tier: tier as ScripterTierForDepth,
          aiService: this.aiService,
          emit,
          workspaceRoot,
          skillContext,
        });
        if (result.content) { emitSimple('content', result.content); }
        emitSimple('done', result.content);
        return { content: result.content, threadId, skill: req.task, durationMs: result.durationMs };
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        emitSimple('error', err);
        throw e;
      }
    }

    // Single-call path (general task or 1x/2x tier)
    emitSimple('thinking', `Running ${this.taskLabel(req.task)}...`);
    const skillContent = this.loadSkillContent(req);
    const systemPrompt = `You are Scripter Max, CipherMate's deep security analysis engine. Execute the following skill. Respond with a comprehensive, structured analysis. Use markdown tables and code blocks where appropriate.

## Skill to execute
${skillContent}

## Instructions
- Follow the phases and quality rules described in the skill.
- If vulnerability context is provided below, use it to focus your analysis.
- Output a complete, actionable report.`;

    const vulnContext = req.vulnerabilityContext
      ? `\n## Vulnerability context\n\`\`\`json\n${JSON.stringify(req.vulnerabilityContext, null, 2)}\n\`\`\`\n`
      : '';
    const userMessage = `${vulnContext}${req.message}`;

    try {
      const response = await this.aiService.callAI({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 16000,
      });

      const content = (response?.content ?? '').trim();
      if (content) { emitSimple('content', content); }
      emitSimple('done', content);
      return { content, threadId, skill: req.task, durationMs: Date.now() - startTime };
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      emitSimple('error', err);
      throw e;
    }
  }

  private taskLabel(task: ScripterMaxTask): string {
    const labels: Record<ScripterMaxTask, string> = {
      'vulnerability-analysis': 'deep vulnerability analysis',
      'pentest-strategy': 'pentest strategy',
      'security-audit': 'full security audit',
      'code-fix-expert': 'expert fix generation',
      'general': 'analysis',
    };
    return labels[task] ?? 'analysis';
  }
}

let _instance: ScripterMaxInProcess | null = null;

export function getScripterMaxInProcess(context?: vscode.ExtensionContext): ScripterMaxInProcess {
  if (!_instance) {
    if (!context) { throw new Error('ScripterMaxInProcess: context required for first init'); }
    _instance = new ScripterMaxInProcess(context);
  }
  return _instance;
}
