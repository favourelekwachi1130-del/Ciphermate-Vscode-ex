/**
 * Kode Engine Adapter - Bridge to Kode Agent for code adjustment
 *
 * Uses Kode (https://github.com/shareAI-lab/Kode-Agent) as the core fix engine.
 * CipherMate's pipeline (Idea → Access → Review → Fix → Production) orchestrates
 * the flow; this adapter delegates fix generation and validation to Kode.
 *
 * Integration: CLI mode (kode -p "prompt") - no ACP required for v1.
 */

import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Vulnerability } from '../scanners/types';
import type {
  FixGeneratorResult,
  PreValidationResult,
  FinalValidationResult } from './multi-ai-fix-pipeline';
import type { FixProposal } from './types';

const CIPHERMATE_API_V1 = 'https://api.ciphermate.ai/v1';
const CIPHERMATE_TOKEN_PREFIX = 'cm-';

function isCiphermateToken(token: string | undefined): boolean {
  return !!token && token.startsWith(CIPHERMATE_TOKEN_PREFIX);
}

export interface KodeEngineConfig {
  kodePath: string;
  timeoutMs: number;
  fallbackToMultiAI: boolean;
  /** When set, CipherMate token (from plan) is used for Kode — no user API keys required */
  context?: vscode.ExtensionContext;
}

const DEFAULT_CONFIG: KodeEngineConfig = {
  kodePath: 'kode',
  timeoutMs: 60000,
  fallbackToMultiAI: true,
};

export class KodeEngineAdapter {
  private config: KodeEngineConfig;
  private _available: boolean | null = null;
  private _checkPromise: Promise<boolean> | null = null;

  constructor(config?: Partial<KodeEngineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if Kode is installed and available.
   * Defers to KodeHealthMonitor when available (avoids duplicate checks).
   */
  async isAvailable(): Promise<boolean> {
    // Fast path: delegate to health monitor if it's running
    try {
      const { getKodeHealthMonitor } = await import('../engine/kode-health-monitor');
      const monitor = getKodeHealthMonitor();
      if (monitor.currentState.status !== 'unknown') {
        const available = monitor.isHealthy;
        this._available = available;
        return available;
      }
    } catch { /* monitor not yet started — fall through to direct check */ }

    if (this._available !== null) return this._available;
    if (this._checkPromise) return this._checkPromise;
    this._checkPromise = this.checkKodeInstalled();
    this._available = await this._checkPromise;
    return this._available;
  }

  private async checkKodeInstalled(): Promise<boolean> {
    if (!this.config.kodePath) return false;
    try {
      const result = await this.runKode(['--version'], { timeout: 5000 });
      return result.exitCode === 0 && result.stdout.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Build env for Kode subprocess (sync). Prefer CipherMate token when context is set — use getKodeEnvAsync from runKode.
   * Injects key + endpoint as OPENAI_* env vars so Kode calls our API or OpenRouter.
   */
  private getKodeEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    this.applyKodeEnvFromFileAndSettings(env);
    return env;
  }

  /**
   * When context is provided, CipherMate token (active plan) is used first — core works without user API keys.
   */
  private async getKodeEnvAsync(): Promise<NodeJS.ProcessEnv> {
    const env: NodeJS.ProcessEnv = { ...process.env };
    const ctx = this.config.context;
    if (ctx) {
      try {
        let token: string | undefined;
        try { token = await ctx.secrets.get('ciphermate.api.token'); } catch { /* */ }
        if (!token) try { token = await ctx.secrets.get('ciphermate.openrouter.key'); } catch { /* */ }
        if (isCiphermateToken(token)) {
          env['OPENAI_API_KEY'] = token;
          env['OPENAI_BASE_URL'] = CIPHERMATE_API_V1;
          return env;
        }
      } catch { /* non-critical */ }
    }
    this.applyKodeEnvFromFileAndSettings(env);
    return env;
  }

  private applyKodeEnvFromFileAndSettings(env: NodeJS.ProcessEnv): void {
    try {
      const kodeConfigPath = path.join(os.homedir(), '.kode.json');
      if (fs.existsSync(kodeConfigPath)) {
        const cfg = JSON.parse(fs.readFileSync(kodeConfigPath, 'utf-8'));
        const profiles: any[] = cfg.modelProfiles ?? [];
        const managed = profiles.find((p: any) =>
          p.name === 'openrouter-ciphermate' || p.name === 'ciphermate-scripter'
        );
        if (managed?.apiKey) {
          env['OPENAI_API_KEY'] = managed.apiKey;
          env['OPENAI_BASE_URL'] = managed.apiUrl || 'https://openrouter.ai/api/v1';
        }
        if (!env['OPENAI_API_KEY']) {
          const defaultProfile = profiles.find((p: any) => p.name === 'openrouter-default');
          if (defaultProfile?.apiKey) {
            env['OPENAI_API_KEY'] = defaultProfile.apiKey;
            env['OPENAI_BASE_URL'] = defaultProfile.apiUrl || 'https://openrouter.ai/api/v1';
          }
        }
      }
    } catch { /* non-critical */ }
    if (!env['OPENAI_API_KEY']) {
      try {
        const cfg = vscode.workspace.getConfiguration('ciphermate');
        const settingsKey = cfg.get<string>('ai.openrouter.apiKey', '');
        if (settingsKey) {
          env['OPENAI_API_KEY'] = settingsKey;
          env['OPENAI_BASE_URL'] = 'https://openrouter.ai/api/v1';
        }
      } catch { /* non-critical */ }
    }
  }

  /**
   * Run Kode CLI with args. Uses CipherMate token from context when set (no user API keys required).
   */
  private runKode(
    args: string[],
    opts?: { cwd?: string; timeout?: number; stdin?: string }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return (async () => {
      const cwd = opts?.cwd || os.tmpdir();
      const timeout = opts?.timeout ?? this.config.timeoutMs;
      const env = this.config.context ? await this.getKodeEnvAsync() : this.getKodeEnv();
      return new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
        const proc = spawn(this.config.kodePath, args, {
          cwd,
          shell: true,
          env,
          stdio: opts?.stdin ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
        });

      let stdout = '';
      let stderr = '';
      let done = false;

      proc.stdout?.on('data', (d) => { stdout += d.toString(); });
      proc.stderr?.on('data', (d) => { stderr += d.toString(); });

      const finish = (code: number) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode: code });
      };

      proc.on('close', (code, signal) => {
        const exitCode = code != null ? code : (signal ? -1 : 0);
        finish(exitCode);
      });
      proc.on('error', (err) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          reject(err);
        }
      });

      const timer = setTimeout(() => {
        proc.kill('SIGTERM');
        finish(-1);
      }, timeout);

      if (opts?.stdin && proc.stdin) {
        proc.stdin.write(opts.stdin);
        proc.stdin.end();
      }
      });
    })();
  }

  /**
   * Run a prompt via Kode non-interactive mode: kode -p "prompt" [files...]
   */
  async runPrompt(
    prompt: string,
    cwd?: string,
    filePaths?: string[]
  ): Promise<string> {
    const args = [
      '--print', prompt,
      '--dangerously-skip-permissions',  // non-interactive, no trust dialog
    ];
    if (filePaths?.length) args.push(...filePaths);
    // Note: --tools "" would be fastest but strips all file access capability.
    // We don't add it here so Kode can still read referenced files.

    const { stdout, stderr, exitCode } = await this.runKode(args, {
      cwd: cwd || os.tmpdir(),  // neutral cwd — no workspace scanning overhead
      timeout: this.config.timeoutMs,
    });
    if (exitCode !== 0 && !stdout.trim()) {
      throw new Error(`Kode exited ${exitCode}: ${stderr || stdout}`);
    }
    return stdout;
  }

  /**
   * Generate a security fix using Kode (Fix stage)
   */
  async generateFix(
    vulnerability: Vulnerability,
    codeContext: string
  ): Promise<FixGeneratorResult | null> {
    const hasKode = await this.isAvailable();
    if (!hasKode) return null;

    const realCode = codeContext || vulnerability.code || '';
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const { loadEccRules } = await import('./ecc-rules-loader');
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
- Produce ONLY executable code, no comments-only advice
- Match the file's language (PHP use getenv(), JS/TS use process.env, Python use os.environ.get)
- If moving secrets to env vars, include envVarsToCreate in your JSON
- Ensure syntax is correct and complete
- Follow the mandatory security rules above

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
      const filePath = vulnerability.file
        ? path.isAbsolute(vulnerability.file)
          ? vulnerability.file
          : workspaceRoot
            ? path.join(workspaceRoot, vulnerability.file)
            : vulnerability.file
        : undefined;
      const files = filePath ? [filePath] : undefined;
      const output = await this.runPrompt(prompt, workspaceRoot, files);
      const parsed = this.parseFixGeneratorOutput(output, vulnerability);
      return parsed;
    } catch (e) {
      console.warn('KodeEngineAdapter.generateFix failed', e);
      return null;
    }
  }

  private parseFixGeneratorOutput(
    output: string,
    vulnerability: Vulnerability
  ): FixGeneratorResult | null {
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const obj = JSON.parse(jsonMatch[0]);
        return {
          originalCode: obj.originalCode ?? vulnerability.code ?? '',
          fixedCode: obj.fixedCode ?? '',
          explanation: obj.explanation ?? '',
          confidence: typeof obj.confidence === 'number' ? obj.confidence : 0.8,
          securityImprovements: Array.isArray(obj.securityImprovements) ? obj.securityImprovements : [],
          testingNotes: obj.testingNotes ?? '',
          envVarsToCreate: obj.envVarsToCreate,
        };
      } catch {
        // fall through to code block extraction
      }
    }
    // Fallback: extract code block
    const codeBlock = output.match(/```(?:[\w]*)\n?([\s\S]*?)```/);
    if (codeBlock) {
      return {
        originalCode: vulnerability.code ?? '',
        fixedCode: codeBlock[1].trim(),
        explanation: 'Fix generated by Kode (parsed from code block)',
        confidence: 0.75,
        securityImprovements: ['Kode-generated fix'],
        testingNotes: 'Manual verification recommended',
      };
    }
    return null;
  }

  /**
   * Pre-validate a fix before applying (Review stage)
   */
  async preValidate(
    proposal: FixProposal,
    fullFileContent?: string,
    language?: string
  ): Promise<PreValidationResult> {
    const hasKode = await this.isAvailable();
    if (!hasKode) {
      return { approved: true, confidence: 0.5, reason: 'Kode not available - skipping pre-validation' };
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

Respond with JSON only:
{
  "approved": true/false,
  "confidence": 0.0-1.0,
  "reason": "brief reason",
  "issues": ["issue 1 if any"],
  "suggestions": ["improvement if approved"]
}`;

    try {
      const output = await this.runPrompt(prompt);
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as PreValidationResult;
      }
    } catch (e) {
      console.warn('KodeEngineAdapter.preValidate failed', e);
    }
    return { approved: true, confidence: 0.5, reason: 'Pre-validation failed - proceeding with caution' };
  }

  /**
   * Final validation when user requests apply (Production stage)
   */
  async finalValidate(
    proposal: FixProposal,
    projectContext: string,
    fullFileContent: string,
    language: string
  ): Promise<FinalValidationResult> {
    const hasKode = await this.isAvailable();
    if (!hasKode) {
      return {
        approved: true,
        confidence: 0.5,
        summary: 'Kode not available - apply with caution',
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
      const output = await this.runPrompt(prompt);
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as FinalValidationResult;
      }
    } catch (e) {
      console.warn('KodeEngineAdapter.finalValidate failed', e);
    }
    return {
      approved: true,
      confidence: 0.5,
      summary: 'Final validation failed - apply with caution',
      projectContextAligned: true,
      potentialErrors: [],
    };
  }

  /** Check if pipeline has Kode available */
  async hasAI(): Promise<boolean> {
    return this.isAvailable();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HIGH-ROI #1: Vulnerability Explanations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Explain a vulnerability with full project/file context.
   * Replaces callAIForExplanation in extension.ts when Kode is available.
   */
  async explainVulnerability(
    prompt: string,
    workspaceRoot?: string,
    filePath?: string
  ): Promise<string | null> {
    const hasKode = await this.isAvailable();
    if (!hasKode) return null;

    const files = filePath ? [filePath] : undefined;
    try {
      return await this.runPrompt(prompt, workspaceRoot, files);
    } catch (e) {
      console.warn('KodeEngineAdapter.explainVulnerability failed', e);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HIGH-ROI #2: DAST – Contextual Payload Generation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generate contextual attack payloads for a DAST scan.
   * Replaces generateContextualPayloads() in ai-payload-generator.ts.
   */
  async generatePayloads(
    prompt: string,
    workspaceRoot?: string
  ): Promise<string[] | null> {
    const hasKode = await this.isAvailable();
    if (!hasKode) return null;

    try {
      const output = await this.runPrompt(prompt, workspaceRoot);
      const arrMatch = output.match(/\[[\s\S]*?\]/);
      if (!arrMatch) return null;
      const parsed = JSON.parse(arrMatch[0]);
      if (!Array.isArray(parsed)) return null;
      return parsed.filter((p: unknown): p is string => typeof p === 'string' && p.length > 0 && p.length < 500);
    } catch (e) {
      console.warn('KodeEngineAdapter.generatePayloads failed', e);
      return null;
    }
  }

  /**
   * Get adaptive pentest suggestions after a payload response.
   * Replaces getAdaptiveSuggestions() in ai-payload-generator.ts.
   */
  async getAdaptiveSuggestions(
    prompt: string,
    workspaceRoot?: string
  ): Promise<{ nextPayloads?: string[]; tryEncoding?: string; tryParam?: string } | null> {
    const hasKode = await this.isAvailable();
    if (!hasKode) return null;

    try {
      const output = await this.runPrompt(prompt, workspaceRoot);
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.warn('KodeEngineAdapter.getAdaptiveSuggestions failed', e);
      return null;
    }
  }

  /**
   * Get an attack strategy for a DAST pentest.
   * Replaces getAttackStrategy() in ai-attack-strategist.ts.
   */
  async getAttackStrategy(
    prompt: string,
    workspaceRoot?: string
  ): Promise<Record<string, unknown> | null> {
    const hasKode = await this.isAvailable();
    if (!hasKode) return null;

    try {
      const output = await this.runPrompt(prompt, workspaceRoot);
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.warn('KodeEngineAdapter.getAttackStrategy failed', e);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HIGH-ROI #3: SAST – AI Candidate Validation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Validate SAST pattern candidates with Kode (project-aware false-positive reduction).
   * Replaces validateCandidatesWithAI() in ai-security-analyzer.ts.
   * Returns JSON { results: [{line, valid, severity, explanation}] }
   */
  async validateSastCandidates(
    prompt: string,
    workspaceRoot?: string,
    filePath?: string
  ): Promise<{ results: Array<{ line: number; valid: boolean; severity?: string; explanation?: string }> } | null> {
    const hasKode = await this.isAvailable();
    if (!hasKode) return null;

    const files = filePath ? [filePath] : undefined;
    try {
      const output = await this.runPrompt(prompt, workspaceRoot, files);
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.warn('KodeEngineAdapter.validateSastCandidates failed', e);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HIGH-ROI #4: AGENTS.md Generation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generate or update the project's AGENTS.md with security context.
   * Uses Kode's # documentation mode.
   */
  async generateAgentsMd(
    workspaceRoot: string,
    scanSummary: string
  ): Promise<string | null> {
    const hasKode = await this.isAvailable();
    if (!hasKode) return null;

    const prompt = `# Generate or update AGENTS.md for this project with the following security context.

This is a security-scanned project. The AGENTS.md should include:
1. Project overview and tech stack (infer from workspace)
2. Security findings summary and areas of concern
3. Fix conventions (env vars, parameterized queries, sanitization patterns)
4. Testing instructions for security fixes
5. Guidelines for AI agents making code changes (what to avoid, how to handle secrets, etc.)

SCAN SUMMARY:
${scanSummary}

Write a complete, structured AGENTS.md suitable for guiding AI coding agents on this project.`;

    try {
      return await this.runPrompt(prompt, workspaceRoot);
    } catch (e) {
      console.warn('KodeEngineAdapter.generateAgentsMd failed', e);
      return null;
    }
  }
}

let _adapterInstance: KodeEngineAdapter | null = null;
let _lastConfig: KodeEngineConfig = { ...DEFAULT_CONFIG };

export function getKodeEngineAdapter(config?: Partial<KodeEngineConfig>): KodeEngineAdapter {
  if (config && Object.keys(config).length > 0) {
    _lastConfig = { ..._lastConfig, ...config };
    _adapterInstance = new KodeEngineAdapter(_lastConfig);
  } else if (!_adapterInstance) {
    _adapterInstance = new KodeEngineAdapter(_lastConfig);
  }
  return _adapterInstance;
}
