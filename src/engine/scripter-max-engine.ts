/**
 * Scripter Max Engine
 *
 * The deep analysis engine powering Scripter Pro and Scripter Max tiers.
 * Orchestrates multi-agent workflows: vulnerability research, pentest strategy,
 * full security audits, and sandbox-verified fixes.
 *
 * Users see "Scripter Max" — the underlying engine is an implementation detail.
 *
 * Modes:
 *   local      — Scripter Max runs in Docker on the user's machine (self-hosted)
 *   hosted     — CipherMate's cloud Scripter Max instance (managed)
 *   connecting — setup in progress
 *   offline    — use built-in deep analysis (no external server)
 */

import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import { getScripterMaxNodePool, ScripterMaxNodePool } from './scripter-max-node-pool';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ScripterMaxMode = 'local' | 'hosted' | 'connecting' | 'offline';
export type ScripterMaxTask = 'vulnerability-analysis' | 'pentest-strategy' | 'security-audit' | 'code-fix-expert' | 'general';

export interface ScripterMaxConfig {
  mode: ScripterMaxMode;
  /** Base URL of the Scripter Max instance (e.g. http://localhost:2026) */
  serverUrl: string;
  /** Auth token for CipherMate hosted instance */
  authToken?: string;
  /** Timeout per request in ms */
  timeoutMs: number;
}

export interface ScripterMaxRequest {
  task: ScripterMaxTask;
  message: string;
  threadId?: string;
  /** Workspace root — for file context */
  workspaceRoot?: string;
  /** Raw vulnerability object if available */
  vulnerabilityContext?: Record<string, unknown>;
  /** Whether to stream responses */
  stream?: boolean;
  /** Optional intent for skill composition (enriches context-aware skill selection) */
  intent?: string;
}

export interface ScripterMaxChunk {
  type: 'thinking' | 'content' | 'sub-agent' | 'done' | 'error';
  text: string;
  /** Sub-agent name when type === 'sub-agent' */
  agentName?: string;
}

export interface ScripterMaxResponse {
  content: string;
  threadId: string;
  skill?: string;
  durationMs: number;
}

export type ScripterMaxStreamCallback = (chunk: ScripterMaxChunk) => void;

const DEFAULT_LOCAL_URL = 'http://localhost:2026';
const DEFAULT_HOSTED_URL = 'https://scriptermax.ciphermate.ai';
const HEALTH_CHECK_TIMEOUT_MS = 5000;
const DEFAULT_TIMEOUT_MS = 180_000; // 3 min — deep analysis takes time

// ─────────────────────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────────────────────

export class ScripterMaxEngine {
  private context: vscode.ExtensionContext;
  private config: ScripterMaxConfig;
  private _status: ScripterMaxMode = 'offline';
  private _statusListeners: Array<(mode: ScripterMaxMode) => void> = [];
  private _healthTimer: NodeJS.Timeout | null = null;
  private nodePool: ScripterMaxNodePool;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.config = this.loadConfig();
    this.nodePool = getScripterMaxNodePool(context);
  }

  // ── Config ────────────────────────────────────────────────────────────────

  private loadConfig(): ScripterMaxConfig {
    const cfg = vscode.workspace.getConfiguration('ciphermate');
    const mode = cfg.get<ScripterMaxMode>('scripterMax.mode', 'offline');
    const localUrl = cfg.get<string>('scripterMax.localUrl', DEFAULT_LOCAL_URL);
    const hostedUrl = cfg.get<string>('scripterMax.hostedUrl', DEFAULT_HOSTED_URL);
    return {
      mode,
      serverUrl: mode === 'hosted' ? hostedUrl : localUrl,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    };
  }

  async reloadConfig(): Promise<void> {
    this.config = this.loadConfig();
    const token = await this.context.secrets.get('ciphermate.scriptermax.token');
    if (token) this.config.authToken = token;
  }

  // ── Status ────────────────────────────────────────────────────────────────

  get status(): ScripterMaxMode { return this._status; }
  get isAvailable(): boolean { return this._status === 'local' || this._status === 'hosted'; }

  onStatusChange(listener: (mode: ScripterMaxMode) => void): void {
    this._statusListeners.push(listener);
  }

  private setStatus(mode: ScripterMaxMode): void {
    if (this._status === mode) return;
    this._status = mode;
    this._statusListeners.forEach((l) => { try { l(mode); } catch { /* */ } });
  }

  // ── Health check + auto-discovery ─────────────────────────────────────────

  async initialize(): Promise<ScripterMaxMode> {
    await this.reloadConfig();
    this.setStatus('connecting');

    // Initialize node pool — discovers and health-checks all managed + local nodes
    await this.nodePool.initialize();
    this.nodePool.onStateChange((state) => {
      if (state.allDown) {
        this.setStatus('offline');
      } else {
        const bestNode = state.nodes.find((n) => n.id === state.activeNodeId);
        this.setStatus(bestNode?.region === 'local' ? 'local' : 'hosted');
      }
    });

    const best = this.nodePool.getBestNode();
    if (best) {
      this.config.serverUrl = best.url;
      this.setStatus(best.region === 'local' ? 'local' : 'hosted');
      return this._status;
    }

    this.setStatus('offline');
    return 'offline';
  }

  private async ping(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const parsed = new URL(`${url}/api/health`);
        const lib = parsed.protocol === 'https:' ? https : http;
        const req = lib.request(
          { hostname: parsed.hostname, port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname, method: 'GET', timeout: HEALTH_CHECK_TIMEOUT_MS },
          (res) => { res.resume(); resolve(res.statusCode === 200 || res.statusCode === 404 /* no /health = still running */); }
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.end();
      } catch { resolve(false); }
    });
  }

  private startHealthPolling(): void {
    if (this._healthTimer) clearInterval(this._healthTimer);
    this._healthTimer = setInterval(async () => {
      const alive = await this.ping(this.config.serverUrl);
      if (!alive && this.isAvailable) {
        this.setStatus('offline');
      } else if (alive && !this.isAvailable) {
        this.setStatus(this.config.mode === 'hosted' ? 'hosted' : 'local');
      }
    }, 60_000); // poll every 60s
  }

  dispose(): void {
    if (this._healthTimer) clearInterval(this._healthTimer);
  }

  // ── Core request ──────────────────────────────────────────────────────────

  /**
   * Run a Scripter Max task with streaming progress callbacks.
   * This is the main entry point for Pro/Max tier requests.
   */
  async run(
    req: ScripterMaxRequest,
    onChunk?: ScripterMaxStreamCallback
  ): Promise<ScripterMaxResponse> {
    if (!this.isAvailable) throw new Error('Scripter Max engine is offline.');

    const threadId = req.threadId ?? `cm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();

    // Build the prompt — inject skill routing hint
    const skillHint = this.skillForTask(req.task);
    const systemContext = req.vulnerabilityContext
      ? `\nVulnerability context: ${JSON.stringify(req.vulnerabilityContext, null, 2)}\n`
      : '';

    const fullMessage = skillHint
      ? `[Use the ${skillHint} skill]\n${systemContext}${req.message}`
      : `${systemContext}${req.message}`;

    onChunk?.({ type: 'thinking', text: `Scripter Max initializing ${this.taskLabel(req.task)}...` });

    // Try up to all available nodes with automatic failover
    let lastError: Error | null = null;
    const triedNodes = new Set<string>();

    for (let attempt = 0; attempt < this.nodePool.state.nodes.length + 1; attempt++) {
      const node = attempt === 0
        ? this.nodePool.getBestNode()
        : this.nodePool.getFailoverNode(Array.from(triedNodes)[triedNodes.size - 1]);

      if (!node) break;
      if (triedNodes.has(node.id)) break;
      triedNodes.add(node.id);

      this.config.serverUrl = node.url;
      if (this.config.authToken) {
        // Pass auth token for managed nodes
      }

      try {
        const result = req.stream !== false && onChunk
          ? await this.streamRequest(fullMessage, threadId, onChunk, startTime)
          : await this.syncRequest(fullMessage, threadId, startTime);
        this.nodePool.markSuccess(node.id, Date.now() - startTime);
        return result;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        this.nodePool.markFailed(node.id);
        if (attempt < this.nodePool.state.nodes.length - 1) {
          onChunk?.({ type: 'thinking', text: `Node ${node.region.toUpperCase()} unreachable — switching to next node...` });
        }
      }
    }

    const msg = lastError?.message ?? 'All Scripter Max nodes are unavailable';
    onChunk?.({ type: 'error', text: msg });
    throw lastError ?? new Error(msg);
  }

  // ── Streaming request ─────────────────────────────────────────────────────

  private streamRequest(
    message: string,
    threadId: string,
    onChunk: ScripterMaxStreamCallback,
    startTime: number
  ): Promise<ScripterMaxResponse> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        messages: [{ role: 'user', content: message }],
        thread_id: threadId,
        stream: true,
      });

      const parsed = new URL(`${this.config.serverUrl}/api/chat/stream`);
      const lib = parsed.protocol === 'https:' ? https : http;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body).toString(),
        'Accept': 'text/event-stream',
        'X-CipherMate-Client': '1.1.0',
      };
      if (this.config.authToken) headers['Authorization'] = `Bearer ${this.config.authToken}`;

      const req = lib.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: parsed.pathname,
          method: 'POST',
          headers,
          timeout: this.config.timeoutMs,
        },
        (res) => {
          let fullContent = '';
          let buffer = '';

          res.on('data', (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (!line.startsWith('data:')) continue;
              const data = line.slice(5).trim();
              if (data === '[DONE]') {
                onChunk({ type: 'done', text: fullContent });
                resolve({ content: fullContent, threadId, durationMs: Date.now() - startTime });
                return;
              }
              try {
                const event = JSON.parse(data);
                const parsed = this.parseStreamEvent(event);
                if (parsed) {
                  fullContent += parsed.text;
                  onChunk(parsed);
                }
              } catch { /* skip malformed events */ }
            }
          });

          res.on('end', () => {
            if (fullContent) {
              onChunk({ type: 'done', text: fullContent });
              resolve({ content: fullContent, threadId, durationMs: Date.now() - startTime });
            } else {
              reject(new Error('Scripter Max: empty response from engine'));
            }
          });

          res.on('error', reject);
        }
      );

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Scripter Max: request timed out')); });
      req.write(body);
      req.end();
    });
  }

  // ── Sync (non-streaming) fallback ─────────────────────────────────────────

  private syncRequest(
    message: string,
    threadId: string,
    startTime: number
  ): Promise<ScripterMaxResponse> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        messages: [{ role: 'user', content: message }],
        thread_id: threadId,
        stream: false,
      });

      const parsed = new URL(`${this.config.serverUrl}/api/chat`);
      const lib = parsed.protocol === 'https:' ? https : http;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body).toString(),
        'X-CipherMate-Client': '1.1.0',
      };
      if (this.config.authToken) headers['Authorization'] = `Bearer ${this.config.authToken}`;

      const req = lib.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: parsed.pathname,
          method: 'POST',
          headers,
          timeout: this.config.timeoutMs,
        },
        (res) => {
          let data = '';
          res.on('data', (c: Buffer) => { data += c.toString(); });
          res.on('end', () => {
            try {
              if (res.statusCode && res.statusCode >= 400) {
                reject(new Error(`Scripter Max engine error (${res.statusCode}): ${data.slice(0, 200)}`));
                return;
              }
              const json = JSON.parse(data);
              const content = json.messages?.find((m: any) => m.role === 'assistant')?.content
                ?? json.content ?? json.response ?? data;
              resolve({ content, threadId, durationMs: Date.now() - startTime });
            } catch (e) {
              reject(new Error(`Scripter Max: invalid response — ${e instanceof Error ? e.message : String(e)}`));
            }
          });
          res.on('error', reject);
        }
      );
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Scripter Max: request timed out')); });
      req.write(body);
      req.end();
    });
  }

  // ── Stream event parsing ───────────────────────────────────────────────────

  private parseStreamEvent(event: any): ScripterMaxChunk | null {
    // LangGraph SSE: messages-tuple, values, metadata
    if (event.type === 'messages-tuple') {
      const msg = event.data;
      if (msg?.type === 'ai' || msg?.role === 'assistant') {
        const text = msg.content ?? msg.text ?? '';
        if (text) return { type: 'content', text };
      }
      if (msg?.type === 'tool' || msg?.role === 'tool') {
        return { type: 'sub-agent', text: msg.content ?? '', agentName: msg.name ?? 'Agent' };
      }
    }
    if (event.type === 'values' && event.data?.messages) {
      const lastMsg = event.data.messages[event.data.messages.length - 1];
      if (lastMsg?.content) return { type: 'content', text: lastMsg.content };
    }
    // Generic content
    if (typeof event.content === 'string' && event.content) {
      return { type: 'content', text: event.content };
    }
    if (event.thinking) {
      return { type: 'thinking', text: event.thinking };
    }
    return null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private skillForTask(task: ScripterMaxTask): string | null {
    const map: Record<ScripterMaxTask, string | null> = {
      'vulnerability-analysis': 'vulnerability-analysis',
      'pentest-strategy': 'pentest-strategy',
      'security-audit': 'security-audit',
      'code-fix-expert': 'code-fix-expert',
      'general': null,
    };
    return map[task];
  }

  private taskLabel(task: ScripterMaxTask): string {
    const labels: Record<ScripterMaxTask, string> = {
      'vulnerability-analysis': 'deep vulnerability analysis',
      'pentest-strategy': 'pentest strategy',
      'security-audit': 'full security audit',
      'code-fix-expert': 'expert fix generation',
      'general': 'analysis',
    };
    return labels[task];
  }

  // ── Setup helpers (used by setup wizard) ─────────────────────────────────

  /**
   * Try to connect to a specific URL and return connection result.
   */
  async testConnection(url: string): Promise<{ success: boolean; version?: string; error?: string }> {
    try {
      const alive = await this.ping(url);
      if (!alive) return { success: false, error: `Could not reach ${url}. Is the engine running?` };
      // Try to get version
      try {
        const version = await this.fetchVersion(url);
        return { success: true, version };
      } catch {
        return { success: true };
      }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  private fetchVersion(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(`${url}/api/version`);
      const lib = parsed.protocol === 'https:' ? https : http;
      const req = lib.request(
        { hostname: parsed.hostname, port: parsed.port || 80, path: parsed.pathname, method: 'GET', timeout: 5000 },
        (res) => {
          let data = '';
          res.on('data', (c: Buffer) => { data += c.toString(); });
          res.on('end', () => {
            try { resolve(JSON.parse(data).version ?? 'unknown'); } catch { resolve('unknown'); }
          });
        }
      );
      req.on('error', reject);
      req.end();
    });
  }

  /**
   * Store auth token for hosted mode.
   */
  async storeAuthToken(token: string): Promise<void> {
    await this.context.secrets.store('ciphermate.scriptermax.token', token);
    this.config.authToken = token;
  }

  /**
   * Get the Docker Compose setup command for local mode.
   */
  getDockerSetupCommand(): string {
    return [
      '# Run Scripter Max engine locally',
      'docker run -d \\',
      '  --name scripter-max \\',
      '  -p 2026:2026 \\',
      `  -v $(pwd)/skills:/mnt/skills/custom:ro \\`,
      '  -e OPENAI_BASE_URL=https://openrouter.ai/api/v1 \\',
      '  -e OPENAI_API_KEY=<your-key> \\',
      '  bytedance/deer-flow:latest',
    ].join('\n');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

let _instance: ScripterMaxEngine | null = null;

export function getScripterMaxEngine(context?: vscode.ExtensionContext): ScripterMaxEngine {
  if (!_instance) {
    if (!context) throw new Error('ScripterMaxEngine: context required for first init');
    _instance = new ScripterMaxEngine(context);
  }
  return _instance;
}
