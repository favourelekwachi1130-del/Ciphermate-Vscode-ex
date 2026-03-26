/**
 * Scripter Pro/Max Diagnostics
 *
 * Tests every component of the Scripter engine stack and surfaces
 * specific, actionable failures with fix instructions.
 *
 * Checks in order:
 *   1.  Optional classic fix engine binary (if enabled)
 *   2.  OpenRouter API key present (SecretStorage + settings)
 *   3.  Kode ~/.kode.json configured with correct key + model
 *   4.  Kode prompt execution (minimal live call)
 *   5.  OpenRouter reachability (models endpoint)
 *   6.  OpenRouter API key validity (chat completion)
 *   7.  Scripter tier configured
 *   8.  ScripterKeyPool loaded
 *   9.  ScripterMax engine mode (hosted/local/offline)
 *   10. ScripterMax node pool health
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import { spawn } from 'child_process';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DiagStatus = 'pass' | 'fail' | 'warn' | 'skip' | 'running';

export interface DiagCheck {
  id: string;
  name: string;
  status: DiagStatus;
  detail: string;
  fix?: string;
  durationMs?: number;
}

export interface DiagReport {
  timestamp: string;
  tier: string;
  checks: DiagCheck[];
  summary: { pass: number; fail: number; warn: number; skip: number };
  overallStatus: 'healthy' | 'degraded' | 'broken';
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual checks
// ─────────────────────────────────────────────────────────────────────────────

async function checkKodeBinary(kodePath: string): Promise<DiagCheck> {
  const start = Date.now();
  try {
    const version = await new Promise<string>((resolve, reject) => {
      const proc = spawn(kodePath, ['--version'], { shell: false });
      let out = '';
      proc.stdout?.on('data', (d) => { out += d.toString(); });
      proc.on('close', (code) => code === 0 ? resolve(out.trim()) : reject(new Error(`exit ${code}`)));
      proc.on('error', reject);
      setTimeout(() => { proc.kill(); reject(new Error('timeout')); }, 5000);
    });
    return { id: 'kode-binary', name: 'Classic fix engine (optional)', status: 'pass',
      detail: `Binary ${version} found at "${kodePath}"`, durationMs: Date.now() - start };
  } catch (e) {
    return { id: 'kode-binary', name: 'Classic fix engine (optional)', status: 'fail',
      detail: `Optional fix engine not found. CipherMate's native pipeline is the default.`,
      fix: 'Leave disabled in settings to use CipherMate pipeline (recommended).',
      durationMs: Date.now() - start };
  }
}

async function checkOpenRouterKey(context: vscode.ExtensionContext): Promise<{ key: string | null; source: string }> {
  // Priority: SecretStorage CipherMate key → SecretStorage own-key → VS Code settings
  let cmKey: string | undefined;
  let ownKey: string | undefined;
  try { cmKey = await context.secrets.get('ciphermate.openrouter.key'); } catch { /* */ }
  if (cmKey) return { key: cmKey, source: 'CipherMate SecretStorage' };

  try { ownKey = await context.secrets.get('ciphermate.ai.openrouter.apiKey'); } catch { /* */ }
  if (ownKey) return { key: ownKey, source: 'User SecretStorage' };

  const settingsKey = vscode.workspace.getConfiguration('ciphermate').get<string>('ai.openrouter.apiKey', '');
  if (settingsKey) return { key: settingsKey, source: 'VS Code settings (plaintext — move to SecretStorage)' };

  return { key: null, source: 'none' };
}

async function checkApiKey(context: vscode.ExtensionContext): Promise<DiagCheck> {
  const { key, source } = await checkOpenRouterKey(context);
  if (!key) {
    return { id: 'api-key', name: 'OpenRouter API key', status: 'fail',
      detail: 'No API key found in SecretStorage or settings.',
      fix: 'Add your OpenRouter API key in CipherMate → Advanced Settings → AI Providers → OpenRouter API Key. Or purchase a plan at ciphermate.ai to get a managed key.' };
  }
  const warn = source.includes('plaintext');
  return { id: 'api-key', name: 'OpenRouter API key', status: warn ? 'warn' : 'pass',
    detail: `Key found (${key.slice(0, 8)}...) via: ${source}`,
    fix: warn ? 'Store API keys in SecretStorage, not plain settings, for security.' : undefined };
}

function checkKodeConfig(): DiagCheck {
  const kodeConfigPath = path.join(os.homedir(), '.kode.json');
  if (!fs.existsSync(kodeConfigPath)) {
    return { id: 'kode-config', name: 'Classic engine config', status: 'fail',
      detail: 'Config file does not exist.',
      fix: 'CipherMate creates this automatically. Restart the extension or run: CipherMate: Setup Scripter Max Engine' };
  }
  try {
    const cfg = JSON.parse(fs.readFileSync(kodeConfigPath, 'utf-8'));
    const profiles: any[] = cfg.modelProfiles ?? [];
    const cmProfile = profiles.find((p) => p.__ciphermateManaged);
    if (!cmProfile) {
      return { id: 'kode-config', name: 'Classic engine config', status: 'warn',
        detail: 'No CipherMate-managed profile found.',
        fix: 'Open VS Code and CipherMate will sync the config on next activation.' };
    }
    if (!cmProfile.apiKey || cmProfile.apiKey === '') {
      return { id: 'kode-config', name: 'Classic engine config', status: 'fail',
        detail: `Profile exists but API key is empty.`,
        fix: 'Configure your API key in CipherMate Advanced Settings; it will be synced automatically.' };
    }
    return { id: 'kode-config', name: 'Classic engine config', status: 'pass',
      detail: `Profile "${cmProfile.name}" | model: ${cmProfile.modelName} | key: ${String(cmProfile.apiKey).slice(0, 8)}...` };
  } catch (e) {
    return { id: 'kode-config', name: 'Classic engine config', status: 'fail',
      detail: `Config parse error: ${e instanceof Error ? e.message : String(e)}`,
      fix: 'Reset the config from CipherMate settings or restart the extension.' };
  }
}

async function checkKodePrompt(kodePath: string): Promise<DiagCheck> {
  const start = Date.now();

  // Guard: skip if key not present (avoids hanging)
  const kodeConfigPath = path.join(os.homedir(), '.kode.json');
  try {
    const cfg = JSON.parse(fs.readFileSync(kodeConfigPath, 'utf-8'));
    const profiles: any[] = cfg.modelProfiles ?? [];
    const cmProfile = profiles.find((p: any) => p.__ciphermateManaged);
    if (!cmProfile?.apiKey) {
      return { id: 'kode-prompt', name: 'Classic engine live check', status: 'skip',
        detail: 'Skipped — API key not configured. Fix classic engine config check first.' };
    }
  } catch {
    return { id: 'kode-prompt', name: 'Classic engine live check', status: 'skip',
      detail: 'Skipped — config unreadable.' };
  }

  const tmpDir = os.tmpdir();

  // Build env for Kode and determine the active key
  const kodeEnv: NodeJS.ProcessEnv = { ...process.env };
  try {
    const cfg = JSON.parse(fs.readFileSync(kodeConfigPath, 'utf-8'));
    const profiles: any[] = cfg.modelProfiles ?? [];
    const managed = profiles.find((p: any) =>
      p.name === 'openrouter-ciphermate' || p.name === 'ciphermate-scripter'
    );
    const orDefault = profiles.find((p: any) => p.name === 'openrouter-default');
    const best = managed?.apiKey ? managed : (orDefault?.apiKey ? orDefault : null);
    if (best?.apiKey) {
      kodeEnv['OPENAI_API_KEY'] = best.apiKey;
      kodeEnv['OPENAI_BASE_URL'] = best.apiUrl || 'https://openrouter.ai/api/v1';
    }
  } catch { /* use process.env as-is */ }

  // Kode 2.x --print mode only works with direct Anthropic or OpenAI keys.
  // OpenRouter keys (sk-or-v1-...) are not supported: Kode hardcodes api.openai.com
  // for the 'openai' provider and ignores any custom apiUrl setting.
  // CipherMate automatically falls back to the MultiAI pipeline when this happens.
  const activeKey = kodeEnv['OPENAI_API_KEY'] ?? '';
  const isOpenRouterKey = activeKey.startsWith('sk-or-');
  if (isOpenRouterKey) {
    return {
      id: 'kode-prompt', name: 'Classic engine live check', status: 'warn',
      detail: 'Optional engine does not support this key type. CipherMate\'s native pipeline works with your current key.',
      fix: 'Use CipherMate pipeline (default) for best experience, or add a direct API key if you need the optional engine.',
    };
  }

  try {
    const response = await new Promise<string>((resolve, reject) => {

      const spawnArgs = [
        '--print',
        'Reply with the single word READY and nothing else.',
        '--dangerously-skip-permissions',
      ];
      const proc = spawn(kodePath, spawnArgs, {
        shell: false,
        cwd: tmpDir,
        env: kodeEnv,
      });
      let out = '';
      let err = '';
      proc.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
      proc.stderr?.on('data', (d: Buffer) => { err += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0 && out.trim()) resolve(out.trim());
        else if (out.trim()) resolve(out.trim()); // some content returned even on non-zero
        else reject(new Error(`exit ${code}: ${(err || 'no output').slice(0, 300)}`));
      });
      proc.on('error', reject);
      setTimeout(() => {
        proc.kill();
        reject(new Error('timeout after 45s — optional engine may be waiting for a trust dialog'));
      }, 45000);
    });

    const gotReady = response.toUpperCase().includes('READY');
    const ms = Date.now() - start;
    return {
      id: 'kode-prompt', name: 'Classic engine live check', durationMs: ms,
      status: gotReady ? 'pass' : 'warn',
      detail: gotReady
        ? `Responded in ${ms}ms`
        : `Response received but unexpected: "${response.slice(0, 120)}"`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isTrust = msg.includes('trust') || msg.includes('permission');
    return {
      id: 'kode-prompt', name: 'Classic engine live check', status: 'fail',
      detail: `Live check failed: ${msg}`,
      fix: isTrust
        ? 'Run the optional engine once interactively to accept the trust dialog, then retry.'
        : 'CipherMate native pipeline works without this. Try diagnostics again or use default settings.',
      durationMs: Date.now() - start,
    };
  }
}

async function checkOpenRouterReachability(): Promise<DiagCheck> {
  const start = Date.now();
  return new Promise((resolve) => {
    const req = https.request(
      { hostname: 'openrouter.ai', port: 443, path: '/api/v1/models', method: 'GET', timeout: 8000 },
      (res) => {
        res.resume();
        const ms = Date.now() - start;
        if (res.statusCode === 200) {
          resolve({ id: 'openrouter-reach', name: 'OpenRouter reachability', status: 'pass',
            detail: `openrouter.ai/api/v1/models → HTTP ${res.statusCode} in ${ms}ms`, durationMs: ms });
        } else {
          resolve({ id: 'openrouter-reach', name: 'OpenRouter reachability', status: 'warn',
            detail: `Unexpected status: HTTP ${res.statusCode}`, durationMs: ms });
        }
      }
    );
    req.on('error', (e) => {
      resolve({ id: 'openrouter-reach', name: 'OpenRouter reachability', status: 'fail',
        detail: `Cannot reach openrouter.ai: ${e.message}`,
        fix: 'Check your internet connection. If behind a proxy, configure it in VS Code settings.',
        durationMs: Date.now() - start });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ id: 'openrouter-reach', name: 'OpenRouter reachability', status: 'fail',
        detail: 'openrouter.ai timed out after 8s',
        fix: 'Check firewall / proxy settings.',
        durationMs: Date.now() - start });
    });
    req.end();
  });
}

async function checkOpenRouterKeyValidity(context: vscode.ExtensionContext): Promise<DiagCheck> {
  const start = Date.now();
  const { key } = await checkOpenRouterKey(context);
  if (!key) {
    return { id: 'openrouter-key-valid', name: 'OpenRouter key validity', status: 'skip',
      detail: 'Skipped — no API key found.' };
  }

  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: 'openrouter/auto',
      messages: [{ role: 'user', content: 'Say READY' }],
      max_tokens: 5,
    });
    const req = https.request(
      {
        hostname: 'openrouter.ai', port: 443,
        path: '/api/v1/chat/completions', method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Authorization': `Bearer ${key}`,
          'HTTP-Referer': 'https://ciphermate.ai',
          'X-Title': 'CipherMate Diagnostics',
        },
        timeout: 15000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          const ms = Date.now() - start;
          if (res.statusCode === 200) {
            resolve({ id: 'openrouter-key-valid', name: 'OpenRouter key validity', status: 'pass',
              detail: `Key is valid. Chat completion succeeded in ${ms}ms`, durationMs: ms });
          } else if (res.statusCode === 401) {
            resolve({ id: 'openrouter-key-valid', name: 'OpenRouter key validity', status: 'fail',
              detail: `401 Unauthorized — the key exists but is invalid or has been revoked on OpenRouter's side`,
              fix: '1. Go to openrouter.ai/keys and generate a new key  2. Paste it in CipherMate Advanced Settings → AI Providers → OpenRouter API Key  3. Run diagnostics again', durationMs: ms });
          } else if (res.statusCode === 402) {
            resolve({ id: 'openrouter-key-valid', name: 'OpenRouter key validity', status: 'fail',
              detail: `402 Payment Required — key is valid but account has no credits remaining`,
              fix: 'Add credits at openrouter.ai/credits — the free tier auto-selects free models. Or purchase a CipherMate plan for a managed key.', durationMs: ms });
          } else {
            try {
              const parsed = JSON.parse(data);
              resolve({ id: 'openrouter-key-valid', name: 'OpenRouter key validity', status: 'warn',
                detail: `HTTP ${res.statusCode}: ${parsed?.error?.message ?? data.slice(0, 150)}`, durationMs: ms });
            } catch {
              resolve({ id: 'openrouter-key-valid', name: 'OpenRouter key validity', status: 'warn',
                detail: `HTTP ${res.statusCode}: ${data.slice(0, 150)}`, durationMs: ms });
            }
          }
        });
      }
    );
    req.on('error', (e) => resolve({ id: 'openrouter-key-valid', name: 'OpenRouter key validity', status: 'fail',
      detail: `Request error: ${e.message}`, durationMs: Date.now() - start }));
    req.on('timeout', () => { req.destroy(); resolve({ id: 'openrouter-key-valid', name: 'OpenRouter key validity', status: 'fail',
      detail: 'Request timed out after 15s', durationMs: Date.now() - start }); });
    req.write(body);
    req.end();
  });
}

function checkScripterTier(): DiagCheck {
  const cfg = vscode.workspace.getConfiguration('ciphermate');
  const tier = cfg.get<string>('scripter.tier', 'scripter');
  const VALID = ['scripter'];
  if (!VALID.includes(tier)) {
    return { id: 'scripter-tier', name: 'Scripter tier', status: 'warn',
      detail: `Unknown tier: "${tier}"`,
      fix: 'Run: CipherMate: Select Scripter Engine Tier' };
  }
  return { id: 'scripter-tier', name: 'Scripter tier', status: 'pass',
    detail: `Active tier: ${tier} (best model for all tasks)` };
}

async function checkScripterKeyPool(context: vscode.ExtensionContext): Promise<DiagCheck> {
  try {
    const { getScripterKeyPool } = await import('./scripter-key-pool');
    const pool = getScripterKeyPool(context);
    await pool.refresh();
    const size = pool.poolSize;
    const healthy = pool.healthyCount;
    if (size === 0) {
      return { id: 'key-pool', name: 'Scripter key pool', status: 'fail',
        detail: 'Key pool is empty — no keys loaded.',
        fix: 'Add an OpenRouter API key in CipherMate Advanced Settings.' };
    }
    if (healthy === 0) {
      return { id: 'key-pool', name: 'Scripter key pool', status: 'fail',
        detail: `${size} key(s) loaded but all are in cooldown or quarantined.`,
        fix: 'Check if your API key is valid. The pool will recover automatically after the cooldown period.' };
    }
    return { id: 'key-pool', name: 'Scripter key pool', status: 'pass',
      detail: `${healthy}/${size} key(s) healthy and available` };
  } catch (e) {
    return { id: 'key-pool', name: 'Scripter key pool', status: 'warn',
      detail: `Key pool not yet initialized: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function checkScripterMaxEngine(context: vscode.ExtensionContext): Promise<DiagCheck> {
  const cfg = vscode.workspace.getConfiguration('ciphermate');
  const mode = cfg.get<string>('scripterMax.mode', 'offline');
  if (mode === 'offline') {
    return { id: 'scripter-max', name: 'Scripter Max engine', status: 'skip',
      detail: 'Scripter Max is offline (mode: offline). Only Pro tier features available.',
      fix: 'Run: CipherMate: Setup Scripter Max Engine to enable deep multi-agent analysis.' };
  }
  try {
    const { getScripterMaxEngine } = await import('./scripter-max-engine');
    const engine = getScripterMaxEngine(context);
    const serverUrl = cfg.get<string>(`scripterMax.${mode === 'hosted' ? 'hostedUrl' : 'localUrl'}`, '');
    const result = await engine.testConnection(serverUrl || 'https://scriptermax.ciphermate.ai');
    if (result.success) {
      return { id: 'scripter-max', name: 'Scripter Max engine', status: 'pass',
        detail: `${mode} engine reachable${result.version ? ` (v${result.version})` : ''} at ${serverUrl}` };
    } else {
      return { id: 'scripter-max', name: 'Scripter Max engine', status: 'fail',
        detail: `Engine unreachable (${mode}): ${result.error}`,
        fix: mode === 'local'
          ? 'Make sure Docker is running. Run: docker start scripter-max'
          : 'Check network. Your CipherMate hosted engine may be restarting (auto-recovers in <60s).' };
    }
  } catch (e) {
    return { id: 'scripter-max', name: 'Scripter Max engine', status: 'warn',
      detail: `Engine check error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function checkNodePool(context: vscode.ExtensionContext): Promise<DiagCheck> {
  const cfg = vscode.workspace.getConfiguration('ciphermate');
  const mode = cfg.get<string>('scripterMax.mode', 'offline');

  // When mode is offline, managed nodes are intentionally not deployed — this is not a failure
  if (mode === 'offline') {
    return { id: 'node-pool', name: 'Scripter Max node pool', status: 'skip',
      detail: 'Skipped — Scripter Max is offline. Enable it to activate node routing.',
      fix: 'Run: CipherMate: Setup Scripter Max Engine to enable deep analysis.' };
  }

  try {
    const { getScripterMaxNodePool } = await import('./scripter-max-node-pool');
    const pool = getScripterMaxNodePool(context);
    const summary = pool.getSummary();
    const state = pool.state;
    if (state.allDown) {
      return { id: 'node-pool', name: 'Scripter Max node pool', status: 'warn',
        detail: `All nodes unreachable (${mode} mode). ${summary}`,
        fix: mode === 'hosted'
          ? 'CipherMate hosted nodes may be starting up. Wait 30s and run diagnostics again.'
          : 'Make sure your local Scripter Max engine is running.' };
    }
    const healthyNodes = state.nodes.filter((n: any) => n.status === 'healthy').length;
    return { id: 'node-pool', name: 'Scripter Max node pool', status: healthyNodes > 0 ? 'pass' : 'warn',
      detail: summary };
  } catch (e) {
    return { id: 'node-pool', name: 'Scripter Max node pool', status: 'skip',
      detail: 'Node pool not initialized yet.' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main runner
// ─────────────────────────────────────────────────────────────────────────────

export async function runScripterDiagnostics(
  context: vscode.ExtensionContext,
  onProgress?: (check: DiagCheck, completed: number, total: number) => void
): Promise<DiagReport> {
  const cfg = vscode.workspace.getConfiguration('ciphermate');
  const kodePath = cfg.get<string>('fixes.kodePath', 'kode');
  const tier = cfg.get<string>('scripter.tier', 'scripter');

  const checks: DiagCheck[] = [];
  const TOTAL = 10;
  let done = 0;

  const run = async (fn: () => Promise<DiagCheck>) => {
    const result = await fn().catch((e) => ({
      id: 'unknown', name: 'Check', status: 'fail' as DiagStatus,
      detail: e instanceof Error ? e.message : String(e)
    }));
    checks.push(result);
    done++;
    onProgress?.(result, done, TOTAL);
    return result;
  };

  // Run independent checks in parallel for speed, sequential where order matters
  const [kodeBin, apiKey, orReach] = await Promise.all([
    run(() => checkKodeBinary(kodePath)),
    run(() => checkApiKey(context)),
    run(() => checkOpenRouterReachability()),
  ]);

  // These depend on earlier checks
  await run(() => Promise.resolve(checkKodeConfig()));
  await run(() => checkOpenRouterKeyValidity(context));

  // Classic engine live check — only if binary and key both pass
  if (kodeBin.status === 'pass') {
    await run(() => checkKodePrompt(kodePath));
  } else {
    checks.push({ id: 'kode-prompt', name: 'Classic engine live check', status: 'skip',
      detail: 'Skipped — optional engine binary check failed.' });
    done++;
    onProgress?.(checks[checks.length - 1], done, TOTAL);
  }

  await run(() => Promise.resolve(checkScripterTier()));
  await run(() => checkScripterKeyPool(context));
  await run(() => checkScripterMaxEngine(context));
  await run(() => checkNodePool(context));

  const summary = {
    pass: checks.filter((c) => c.status === 'pass').length,
    fail: checks.filter((c) => c.status === 'fail').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    skip: checks.filter((c) => c.status === 'skip').length,
  };

  const overallStatus: DiagReport['overallStatus'] =
    summary.fail > 0 ? 'broken' :
    summary.warn > 0 ? 'degraded' : 'healthy';

  return {
    timestamp: new Date().toISOString(),
    tier,
    checks,
    summary,
    overallStatus,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fix helpers (called from the results panel)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sync API key from settings/SecretStorage into classic engine config.
 * Used when optional classic fix engine is enabled and needs a key.
 */
export async function fixKodeApiKey(context: vscode.ExtensionContext): Promise<{ success: boolean; message: string }> {
  try {
    const { getScripterEngine } = await import('./scripter-engine');
    const engine = getScripterEngine(context);

    // Find best available key
    let cmKey: string | undefined;
    let ownKey: string | undefined;
    try { cmKey = await context.secrets.get('ciphermate.openrouter.key'); } catch { /* */ }
    try { ownKey = await context.secrets.get('ciphermate.ai.openrouter.apiKey'); } catch { /* */ }
    const settingsKey = vscode.workspace.getConfiguration('ciphermate').get<string>('ai.openrouter.apiKey', '');

    const key = cmKey || ownKey || settingsKey;
    if (!key) {
      return { success: false, message: 'No API key found. Add your OpenRouter API key in CipherMate Advanced Settings first.' };
    }

    // Sync to ~/.kode.json
    const { syncKeyToKode } = await import('./scripter-engine');
    const tierConfig = engine.getTierConfig();
    syncKeyToKode(key, tierConfig);

    return { success: true, message: `API key synced for optional fix engine (${key.slice(0, 8)}...)` };
  } catch (e) {
    return { success: false, message: `Failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
