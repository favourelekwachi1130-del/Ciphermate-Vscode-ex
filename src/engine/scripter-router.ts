/**
 * Scripter Router
 *
 * Single decision point: given a tier and task type, returns the right engine.
 *
 * Routing table:
 *   1x / 2x              → Kode + OpenRouter     (fast, token-efficient)
 *   Pro (standard)       → Kode + OpenRouter Pro  (larger context, smarter model)
 *   Pro / Max (deep)     → Scripter Max engine    (multi-agent, sandboxed, researched)
 *   Pro / Max (offline)  → Kode + OpenRouter Pro  (graceful degradation)
 *
 * The "deep mode" flag is set when:
 *   - User explicitly says "analyze deeply", "full audit", "expert fix"
 *   - Task type is 'vulnerability-analysis', 'security-audit', 'pentest-strategy'
 *   - User is on Max tier
 */

import * as vscode from 'vscode';
import { ScripterTier, SCRIPTER_TIERS, getScripterEngine } from './scripter-engine';
import { getScripterMaxEngine, ScripterMaxTask, ScripterMaxStreamCallback } from './scripter-max-engine';
import type { ScripterMaxChunk } from './scripter-max-engine';
import { getScripterMaxInProcess } from './scripter-max-inprocess';

export type RouterEngine = 'kode-openrouter' | 'scripter-max';

export interface RoutedRequest {
  engine: RouterEngine;
  tier: ScripterTier;
  task: ScripterMaxTask;
  deepMode: boolean;
  message: string;
  context?: Record<string, unknown>;
  workspaceRoot?: string;
}

export interface RouterResult {
  content: string;
  engine: RouterEngine;
  durationMs: number;
  threadId?: string;
}

// Keywords that trigger deep/Max mode even on Pro tier
const DEEP_MODE_KEYWORDS = [
  'deep analysis', 'deeply', 'full audit', 'full analysis', 'complete audit',
  'security audit', 'audit report', 'compliance report', 'comprehensive',
  'expert fix', 'verified fix', 'all vulnerabilities', 'zero-day', 'pentest',
  'red team', 'attack strategy', 'full scan', 'research',
];

// Task types that always go to Scripter Max (when available)
const DEEP_TASKS: ScripterMaxTask[] = [
  'vulnerability-analysis', 'pentest-strategy', 'security-audit', 'code-fix-expert',
];

export class ScripterRouter {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Determine which engine should handle a request.
   */
  route(message: string, task: ScripterMaxTask, forceDeep = false): RoutedRequest {
    const tier = getScripterEngine(this.context).getActiveTier();
    const maxEngine = getScripterMaxEngine(this.context);

    const isDeepTask = DEEP_TASKS.includes(task);
    const hasDeepKeyword = DEEP_MODE_KEYWORDS.some((kw) =>
      message.toLowerCase().includes(kw)
    );
    const deepMode = forceDeep || isDeepTask || hasDeepKeyword;
    const isHighTier = tier === 'scripter';

    let engine: RouterEngine = 'kode-openrouter';

    if (isHighTier && deepMode && maxEngine.isAvailable) {
      engine = 'scripter-max';
    }

    return { engine, tier, task, deepMode, message, workspaceRoot: undefined };
  }

  /**
   * Execute a routed request and return the result.
   * Shows a VS Code progress indicator for Scripter Max requests.
   */
  async execute(
    req: RoutedRequest,
    onChunk?: ScripterMaxStreamCallback
  ): Promise<RouterResult> {
    if (req.engine === 'scripter-max') {
      return this.executeMax(req, onChunk);
    }
    // kode-openrouter path returns null — caller uses existing MultiProviderAIService
    throw new Error('ScripterRouter: use MultiProviderAIService for kode-openrouter engine');
  }

  private async executeMax(
    req: RoutedRequest,
    onChunk?: ScripterMaxStreamCallback
  ): Promise<RouterResult> {
    const engine = getScripterMaxEngine(this.context);
    const inProcess = getScripterMaxInProcess(this.context);

    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Scripter Max — ${this.taskProgressLabel(req.task)}`,
        cancellable: false,
      },
      async (progress) => {
        let lastStep = '';
        progress.report({ message: 'Initializing...' });

        const runPayload = {
          task: req.task,
          message: req.message,
          workspaceRoot: req.workspaceRoot,
          vulnerabilityContext: req.context,
          stream: true,
        };
        const streamCb = (chunk: ScripterMaxChunk) => {
          onChunk?.(chunk);
          if (chunk.type === 'thinking' && chunk.text !== lastStep) {
            lastStep = chunk.text;
            progress.report({ message: chunk.text });
          }
          if (chunk.type === 'sub-agent') {
            progress.report({ message: `${chunk.agentName ?? 'Agent'}: ${chunk.text.slice(0, 60)}...` });
          }
        };

        // Prefer hosted Scripter Max when available; otherwise use in-process (no user API keys required)
        if (engine.isAvailable) {
          try {
            const result = await engine.run(runPayload, streamCb);
            return { content: result.content, engine: 'scripter-max', durationMs: result.durationMs, threadId: result.threadId };
          } catch (e) {
            console.warn('ScripterRouter: Hosted Scripter Max failed, falling back to in-process', e);
          }
        }

        const result = await inProcess.run(runPayload, streamCb);
        return { content: result.content, engine: 'scripter-max', durationMs: result.durationMs, threadId: result.threadId };
      }
    );
  }

  private taskProgressLabel(task: ScripterMaxTask): string {
    const labels: Record<ScripterMaxTask, string> = {
      'vulnerability-analysis': 'Deep Vulnerability Analysis',
      'pentest-strategy': 'Building Pentest Strategy',
      'security-audit': 'Running Full Security Audit',
      'code-fix-expert': 'Expert Fix Generation',
      'general': 'Analysis',
    };
    return labels[task];
  }

  /**
   * Classify a user message into a task type.
   */
  static classifyTask(message: string): ScripterMaxTask {
    const msg = message.toLowerCase();
    if (msg.includes('pentest') || msg.includes('attack') || msg.includes('payload') ||
        msg.includes('exploit') || msg.includes('red team')) return 'pentest-strategy';
    if (msg.includes('audit') || msg.includes('compliance') || msg.includes('full scan') ||
        msg.includes('full report')) return 'security-audit';
    if (msg.includes('fix') || msg.includes('patch') || msg.includes('remediat')) return 'code-fix-expert';
    if (msg.includes('analyz') || msg.includes('explain') || msg.includes('vulnerab') ||
        msg.includes('deep') || msg.includes('research')) return 'vulnerability-analysis';
    return 'general';
  }

  /**
   * Get a user-facing hint about which engine will be used.
   * Shown in the chat UI when a deep-mode request is detected.
   */
  getEngineHint(req: RoutedRequest): string | null {
    if (req.engine !== 'scripter-max') return null;
    const tierName = SCRIPTER_TIERS[req.tier].displayName;
    return `${tierName} is running a deep multi-agent analysis. This may take 30–120 seconds.`;
  }
}

let _routerInstance: ScripterRouter | null = null;

export function getScripterRouter(context?: vscode.ExtensionContext): ScripterRouter {
  if (!_routerInstance) {
    if (!context) throw new Error('ScripterRouter: context required for first init');
    _routerInstance = new ScripterRouter(context);
  }
  return _routerInstance;
}
