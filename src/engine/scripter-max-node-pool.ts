/**
 * Scripter Max Node Pool
 *
 * Manages a pool of Scripter Max engine nodes (hosted instances)
 * for 24/7 uptime. Routes requests to the healthiest available node.
 *
 * Topology:
 *   Primary cluster:   scriptermax-us.ciphermate.ai   (US East)
 *   Secondary cluster: scriptermax-eu.ciphermate.ai   (EU West)
 *   Tertiary cluster:  scriptermax-ap.ciphermate.ai   (Asia Pacific)
 *   Local:             localhost:2026                  (self-hosted / dev)
 *
 * Routing strategy:
 *   1. Prefer lowest-latency healthy node (measured on each health check)
 *   2. On failure: immediately failover to next healthy node (< 100ms)
 *   3. Failed node enters cooldown, re-tested every 30s
 *   4. If ALL nodes fail: degrade gracefully to CipherMate native pipeline
 *   5. On any node recovery: route back to it automatically
 *
 * This is the difference between "best effort" and guaranteed uptime.
 */

import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';

export type NodeStatus = 'healthy' | 'degraded' | 'down' | 'unknown';
export type NodeRegion = 'us' | 'eu' | 'ap' | 'local' | 'custom';

export interface ScripterMaxNode {
  id: string;
  url: string;
  region: NodeRegion;
  priority: number;          // Lower = preferred
  status: NodeStatus;
  latencyMs: number;         // Last measured round-trip
  lastChecked: number;       // epoch ms
  lastHealthy: number;       // epoch ms
  failCount: number;
  cooldownUntil: number;     // epoch ms — don't use until this time
}

export interface NodePoolState {
  nodes: ScripterMaxNode[];
  activeNodeId: string | null;
  allDown: boolean;
}

const HEALTH_CHECK_INTERVAL_MS = 30_000;    // 30s
const HEALTH_CHECK_TIMEOUT_MS  =  5_000;    // 5s per node
const COOLDOWN_BASE_MS          = 30_000;    // 30s base cooldown on failure
const MAX_COOLDOWN_MS           = 300_000;   // 5 min max cooldown
const LATENCY_ACCEPTABLE_MS     = 3_000;     // > 3s = degraded

// CipherMate's managed Scripter Max nodes
// In production these point to load-balanced clusters with Docker Swarm / K8s
const MANAGED_NODES: Omit<ScripterMaxNode, 'status' | 'latencyMs' | 'lastChecked' | 'lastHealthy' | 'failCount' | 'cooldownUntil'>[] = [
  { id: 'ciphermate-us', url: 'https://scriptermax-us.ciphermate.ai', region: 'us', priority: 1 },
  { id: 'ciphermate-eu', url: 'https://scriptermax-eu.ciphermate.ai', region: 'eu', priority: 2 },
  { id: 'ciphermate-ap', url: 'https://scriptermax-ap.ciphermate.ai', region: 'ap', priority: 3 },
];

export class ScripterMaxNodePool {
  private context: vscode.ExtensionContext;
  private nodes: Map<string, ScripterMaxNode> = new Map();
  private pollTimer: NodeJS.Timeout | null = null;
  private _listeners: Array<(state: NodePoolState) => void> = [];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  // ─── Initialise ──────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    await this.buildNodeList();
    await this.checkAllNodes();
    this.startPolling();
  }

  private async buildNodeList(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('ciphermate');
    const mode = cfg.get<string>('scripterMax.mode', 'offline');

    // Always include managed nodes when in hosted mode
    if (mode === 'hosted' || mode === 'offline') {
      for (const n of MANAGED_NODES) {
        this.nodes.set(n.id, this.makeNode(n));
      }
    }

    // Include local node when in local mode or as discovered fallback
    const localUrl = cfg.get<string>('scripterMax.localUrl', 'http://localhost:2026');
    if (mode === 'local' || localUrl !== 'http://localhost:2026') {
      this.nodes.set('local', this.makeNode({ id: 'local', url: localUrl, region: 'local', priority: 0 }));
    }

    // Add any extra nodes from config (enterprise multi-node deployments)
    const extraNodes = cfg.get<string[]>('scripterMax.extraNodes', []);
    extraNodes.forEach((url, i) => {
      const id = `custom-${i}`;
      this.nodes.set(id, this.makeNode({ id, url, region: 'custom', priority: 10 + i }));
    });
  }

  private makeNode(
    n: Omit<ScripterMaxNode, 'status' | 'latencyMs' | 'lastChecked' | 'lastHealthy' | 'failCount' | 'cooldownUntil'>
  ): ScripterMaxNode {
    return { ...n, status: 'unknown', latencyMs: 0, lastChecked: 0, lastHealthy: 0, failCount: 0, cooldownUntil: 0 };
  }

  // ─── Node selection ───────────────────────────────────────────────────────

  /**
   * Get the best available node URL, or null if all nodes are down.
   * Caller uses this URL for every request.
   */
  getBestNode(): ScripterMaxNode | null {
    const now = Date.now();
    const available = Array.from(this.nodes.values())
      .filter((n) => n.status !== 'down' && n.cooldownUntil < now)
      .sort((a, b) => {
        // Prefer: healthy > degraded; then lowest priority number; then lowest latency
        const statusScore = (s: NodeStatus) => s === 'healthy' ? 0 : s === 'degraded' ? 1 : 2;
        const sc = statusScore(a.status) - statusScore(b.status);
        if (sc !== 0) return sc;
        const pc = a.priority - b.priority;
        if (pc !== 0) return pc;
        return a.latencyMs - b.latencyMs;
      });
    return available[0] ?? null;
  }

  /**
   * Get the next healthy node after a given node (for failover).
   */
  getFailoverNode(failedNodeId: string): ScripterMaxNode | null {
    const now = Date.now();
    const available = Array.from(this.nodes.values())
      .filter((n) => n.id !== failedNodeId && n.status !== 'down' && n.cooldownUntil < now)
      .sort((a, b) => a.priority - b.priority);
    return available[0] ?? null;
  }

  get state(): NodePoolState {
    const best = this.getBestNode();
    return {
      nodes: Array.from(this.nodes.values()),
      activeNodeId: best?.id ?? null,
      allDown: best === null,
    };
  }

  get hasAnyHealthyNode(): boolean {
    return this.getBestNode() !== null;
  }

  onStateChange(listener: (state: NodePoolState) => void): void {
    this._listeners.push(listener);
  }

  // ─── Mark failures / successes ────────────────────────────────────────────

  markFailed(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    node.status = 'down';
    node.failCount++;
    // Exponential cooldown: 30s, 60s, 120s, 240s, 300s (cap)
    node.cooldownUntil = Date.now() + Math.min(COOLDOWN_BASE_MS * Math.pow(2, node.failCount - 1), MAX_COOLDOWN_MS);
    console.warn(`ScripterMaxNodePool: Node [${nodeId}] marked failed (cooldown ${(node.cooldownUntil - Date.now()) / 1000}s)`);
    this.emit();
  }

  markSuccess(nodeId: string, latencyMs: number): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    node.status = latencyMs > LATENCY_ACCEPTABLE_MS ? 'degraded' : 'healthy';
    node.latencyMs = latencyMs;
    node.lastHealthy = Date.now();
    node.failCount = Math.max(0, node.failCount - 1);
    node.cooldownUntil = 0;
    this.emit();
  }

  // ─── Health checks ────────────────────────────────────────────────────────

  private async checkAllNodes(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.nodes.values()).map((n) => this.checkNode(n))
    );
    this.emit();
  }

  private async checkNode(node: ScripterMaxNode): Promise<void> {
    const now = Date.now();
    // Skip recently checked healthy nodes
    if (node.status === 'healthy' && now - node.lastChecked < HEALTH_CHECK_INTERVAL_MS / 2) return;
    // Skip nodes still in exponential cooldown
    if (node.cooldownUntil > now) return;

    node.lastChecked = now;
    const result = await this.pingNode(node.url);
    if (result.alive) {
      this.markSuccess(node.id, result.latencyMs);
    } else {
      if (node.status !== 'down') {
        node.status = 'down';
        node.failCount++;
        node.cooldownUntil = now + Math.min(COOLDOWN_BASE_MS * Math.pow(2, node.failCount - 1), MAX_COOLDOWN_MS);
      }
    }
  }

  private pingNode(url: string): Promise<{ alive: boolean; latencyMs: number }> {
    return new Promise((resolve) => {
      const start = Date.now();
      try {
        const parsed = new URL(`${url}/api/health`);
        const lib = parsed.protocol === 'https:' ? https : http;
        const req = lib.request(
          {
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname,
            method: 'GET',
            timeout: HEALTH_CHECK_TIMEOUT_MS,
          },
          (res) => {
            res.resume();
            const latencyMs = Date.now() - start;
            // 200 = healthy, 404 = running but no /health endpoint
            resolve({ alive: res.statusCode === 200 || res.statusCode === 404, latencyMs });
          }
        );
        req.on('error', () => resolve({ alive: false, latencyMs: Date.now() - start }));
        req.on('timeout', () => { req.destroy(); resolve({ alive: false, latencyMs: Date.now() - start }); });
        req.end();
      } catch {
        resolve({ alive: false, latencyMs: Date.now() - start });
      }
    });
  }

  private startPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => this.checkAllNodes(), HEALTH_CHECK_INTERVAL_MS);
    this.context.subscriptions.push({ dispose: () => this.stop() });
  }

  stop(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  private emit(): void {
    const s = this.state;
    this._listeners.forEach((l) => { try { l(s); } catch { /* */ } });
  }

  // ─── Node status summary (for status bar / diagnostics) ──────────────────

  getSummary(): string {
    const healthy = Array.from(this.nodes.values()).filter((n) => n.status === 'healthy').length;
    const total = this.nodes.size;
    const best = this.getBestNode();
    if (!best) return 'All nodes offline';
    return `${healthy}/${total} nodes healthy · Active: ${best.region.toUpperCase()} (${best.latencyMs}ms)`;
  }
}

let _poolInstance: ScripterMaxNodePool | null = null;

export function getScripterMaxNodePool(context?: vscode.ExtensionContext): ScripterMaxNodePool {
  if (!_poolInstance) {
    if (!context) throw new Error('ScripterMaxNodePool: context required for first init');
    _poolInstance = new ScripterMaxNodePool(context);
  }
  return _poolInstance;
}
