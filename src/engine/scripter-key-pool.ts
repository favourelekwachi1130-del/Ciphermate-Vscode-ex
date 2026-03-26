/**
 * Scripter Key Pool - Multi-key rotation for 24/7 uptime
 *
 * Maintains a pool of OpenRouter keys (CipherMate-managed + user own-key fallback).
 * On 429 (rate limit) or 401 (auth failure), automatically rotates to the next
 * healthy key without the user experiencing any interruption.
 *
 * Strategy:
 *   1. CipherMate primary key (purchased tier)
 *   2. CipherMate secondary/backup keys (if provisioned by backend)
 *   3. User own-key (if configured) — last resort
 *
 * Health tracking:
 *   - Keys that hit 429 are cooled down (Retry-After or 60s default)
 *   - Keys that hit 401 are quarantined until refreshed
 *   - Circuit breaker: if all keys fail 3x in 60s, surfaces a clear error
 */

import * as vscode from 'vscode';

export type KeyFailureReason = 'rate-limit' | 'auth-failure' | 'timeout' | 'server-error';

interface KeyHealth {
  key: string;
  label: string;          // 'primary' | 'backup-1' | 'user-own-key' etc.
  healthy: boolean;
  quarantined: boolean;   // 401 — needs key refresh
  cooldownUntil: number;  // epoch ms — key is rate-limited until this time
  errorCount: number;
  lastError?: KeyFailureReason;
  lastErrorAt?: number;
}

const COOLDOWN_DEFAULT_MS = 60_000;       // 60s default cooldown on 429
const QUARANTINE_DURATION_MS = 300_000;   // 5 min quarantine on 401 before retry
const CIRCUIT_BREAKER_WINDOW_MS = 60_000; // 60s window for circuit breaker
const CIRCUIT_BREAKER_THRESHOLD = 3;       // fail this many times → open circuit

export class ScripterKeyPool {
  private context: vscode.ExtensionContext;
  private pool: KeyHealth[] = [];
  private currentIndex = 0;
  private circuitOpenAt: number | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Load all available keys from SecretStorage and settings into the pool.
   * Call this at activation and after a purchase/key update.
   */
  async refresh(): Promise<void> {
    const keys: KeyHealth[] = [];

    // 1. CipherMate primary key
    const primary = await this.context.secrets.get('ciphermate.openrouter.key');
    if (primary) {
      keys.push(this.makeEntry(primary, 'ciphermate-primary'));
    }

    // 2. CipherMate backup keys (provisioned by backend, stored as JSON array)
    const backupRaw = await this.context.secrets.get('ciphermate.openrouter.backup-keys');
    if (backupRaw) {
      try {
        const backupKeys: string[] = JSON.parse(backupRaw);
        backupKeys.forEach((k, i) => {
          if (k) keys.push(this.makeEntry(k, `ciphermate-backup-${i + 1}`));
        });
      } catch { /* ignore corrupt data */ }
    }

    // 3. User's own OpenRouter key (own-key mode fallback)
    const config = vscode.workspace.getConfiguration('ciphermate');
    const ownKey = config.get<string>('ai.openrouter.apiKey', '')
      || await this.context.secrets.get('ciphermate.ai.openrouter.apiKey');
    if (ownKey && ownKey !== primary) {
      keys.push(this.makeEntry(ownKey, 'user-own-key'));
    }

    // Preserve health state for keys already in pool
    this.pool = keys.map((newEntry) => {
      const existing = this.pool.find((e) => e.key === newEntry.key);
      return existing ?? newEntry;
    });

    this.currentIndex = 0;
    console.log(`ScripterKeyPool: Loaded ${this.pool.length} key(s)`);
  }

  /**
   * Get the next healthy key to use for an API call.
   * Returns null if all keys are exhausted (triggers a user-facing error).
   */
  getActiveKey(): string | null {
    if (this.isCircuitOpen()) {
      console.warn('ScripterKeyPool: Circuit breaker open — all keys exhausted');
      return null;
    }

    const now = Date.now();
    const healthyKeys = this.pool.filter(
      (k) => !k.quarantined && (k.cooldownUntil === 0 || k.cooldownUntil < now)
    );

    if (healthyKeys.length === 0) {
      // Check if quarantined keys have cooled down
      const recoverable = this.pool.filter(
        (k) => k.quarantined && k.lastErrorAt && now - k.lastErrorAt > QUARANTINE_DURATION_MS
      );
      if (recoverable.length > 0) {
        recoverable.forEach((k) => { k.quarantined = false; k.errorCount = 0; });
        return this.getActiveKey();
      }
      this.openCircuit();
      return null;
    }

    // Round-robin within healthy keys, weighted by error count
    const sorted = healthyKeys.sort((a, b) => a.errorCount - b.errorCount);
    return sorted[0].key;
  }

  /**
   * Mark a key as failed and rotate.
   * @param key The key that failed
   * @param reason Why it failed
   * @param retryAfterMs Optional Retry-After from server response headers
   */
  markFailed(key: string, reason: KeyFailureReason, retryAfterMs?: number): void {
    const entry = this.pool.find((k) => k.key === key);
    if (!entry) return;

    entry.healthy = false;
    entry.lastError = reason;
    entry.lastErrorAt = Date.now();
    entry.errorCount++;

    if (reason === 'rate-limit') {
      const cooldown = retryAfterMs ?? COOLDOWN_DEFAULT_MS;
      entry.cooldownUntil = Date.now() + cooldown;
      console.warn(`ScripterKeyPool: Key [${entry.label}] rate-limited for ${cooldown / 1000}s`);
    } else if (reason === 'auth-failure') {
      entry.quarantined = true;
      console.warn(`ScripterKeyPool: Key [${entry.label}] quarantined (401 auth failure)`);
    } else {
      // Soft error (timeout/server-error) — short cooldown
      entry.cooldownUntil = Date.now() + 10_000;
    }

    // Check if circuit should open
    const recentFailures = this.pool.filter(
      (k) => k.lastErrorAt && Date.now() - k.lastErrorAt < CIRCUIT_BREAKER_WINDOW_MS
    );
    if (recentFailures.length >= this.pool.length && this.pool.length > 0) {
      this.openCircuit();
    }
  }

  /**
   * Mark a key as recovered (successful call).
   */
  markSuccess(key: string): void {
    const entry = this.pool.find((k) => k.key === key);
    if (!entry) return;
    entry.healthy = true;
    entry.quarantined = false;
    entry.cooldownUntil = 0;
    entry.errorCount = Math.max(0, entry.errorCount - 1);
    this.circuitOpenAt = null; // reset circuit breaker on any success
  }

  /**
   * Store backup keys received from the CipherMate backend.
   */
  async storeBackupKeys(keys: string[]): Promise<void> {
    await this.context.secrets.store(
      'ciphermate.openrouter.backup-keys',
      JSON.stringify(keys)
    );
    await this.refresh();
  }

  get poolSize(): number { return this.pool.length; }

  get healthyCount(): number {
    const now = Date.now();
    return this.pool.filter(
      (k) => !k.quarantined && (k.cooldownUntil === 0 || k.cooldownUntil < now)
    ).length;
  }

  get isAllDown(): boolean {
    return this.pool.length > 0 && this.healthyCount === 0;
  }

  private makeEntry(key: string, label: string): KeyHealth {
    return { key, label, healthy: true, quarantined: false, cooldownUntil: 0, errorCount: 0 };
  }

  private openCircuit(): void {
    if (!this.circuitOpenAt) {
      this.circuitOpenAt = Date.now();
      console.error('ScripterKeyPool: Circuit breaker OPEN — all keys failed');
    }
  }

  private isCircuitOpen(): boolean {
    if (!this.circuitOpenAt) return false;
    // Auto-reset circuit after the window has passed
    if (Date.now() - this.circuitOpenAt > CIRCUIT_BREAKER_WINDOW_MS) {
      this.circuitOpenAt = null;
      this.pool.forEach((k) => { k.errorCount = 0; k.quarantined = false; k.cooldownUntil = 0; });
      return false;
    }
    return true;
  }
}

let _poolInstance: ScripterKeyPool | null = null;

export function getScripterKeyPool(context?: vscode.ExtensionContext): ScripterKeyPool {
  if (!_poolInstance) {
    if (!context) throw new Error('ScripterKeyPool: context required for first init');
    _poolInstance = new ScripterKeyPool(context);
  }
  return _poolInstance;
}
