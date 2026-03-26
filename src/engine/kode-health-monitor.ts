/**
 * Kode Health Monitor - 24/7 uptime for the Kode engine
 *
 * Kode is the core fix/analysis engine. If it's missing or broken,
 * every Scripter-powered feature degrades silently. This monitor:
 *
 *   1. Checks Kode health on activation
 *   2. Polls every 10 minutes
 *   3. Auto-reinstalls Kode via npm if binary is missing or broken
 *   4. Tracks last known good state
 *   5. Exposes status to the status bar and Kode adapter
 *   6. Alerts the user once (not on every poll) if recovery fails
 *
 * Recovery ladder:
 *   Binary missing/broken → npm install -g @shareai-lab/kode → retry
 *   Install fails → fall back to MultiAI pipeline (graceful degradation)
 *   MultiAI fails → surface clear error with actionable message
 */

import * as vscode from 'vscode';
import { spawn } from 'child_process';

export type KodeStatus = 'healthy' | 'degraded' | 'down' | 'recovering' | 'unknown';

export interface KodeHealthState {
  status: KodeStatus;
  version?: string;
  lastChecked: number;
  lastHealthy: number;
  recoveryAttempts: number;
  error?: string;
}

const POLL_INTERVAL_MS = 10 * 60 * 1000;  // 10 minutes
const MAX_RECOVERY_ATTEMPTS = 3;
const CHECK_TIMEOUT_MS = 8000;

export class KodeHealthMonitor {
  private context: vscode.ExtensionContext;
  private state: KodeHealthState = {
    status: 'unknown',
    lastChecked: 0,
    lastHealthy: 0,
    recoveryAttempts: 0,
  };
  private pollTimer: NodeJS.Timeout | null = null;
  private alertedDown = false;
  private _listeners: Array<(state: KodeHealthState) => void> = [];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  get currentState(): KodeHealthState { return { ...this.state }; }
  get isHealthy(): boolean { return this.state.status === 'healthy'; }

  /** Start monitoring (call once at activation). */
  async start(): Promise<void> {
    await this.check();
    this.pollTimer = setInterval(() => this.check(), POLL_INTERVAL_MS);
    this.context.subscriptions.push({ dispose: () => this.stop() });
  }

  stop(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  /** Force an immediate health check (e.g. after user installs Kode manually). */
  async forceCheck(): Promise<KodeHealthState> {
    await this.check();
    return this.currentState;
  }

  /** Subscribe to state changes. */
  onStateChange(listener: (state: KodeHealthState) => void): void {
    this._listeners.push(listener);
  }

  // ─── Core check + recovery ────────────────────────────────────────────────

  private async check(): Promise<void> {
    const config = vscode.workspace.getConfiguration('ciphermate');
    const kodePath = config.get<string>('fixes.kodePath', 'kode');
    this.state.lastChecked = Date.now();

    try {
      const version = await this.getKodeVersion(kodePath);
      this.state.status = 'healthy';
      this.state.version = version;
      this.state.lastHealthy = Date.now();
      this.state.recoveryAttempts = 0;
      this.state.error = undefined;
      this.alertedDown = false;
      this.emit();
      return;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`KodeHealthMonitor: Check failed — ${errMsg}`);
      this.state.error = errMsg;
    }

    // Health check failed — attempt recovery
    if (this.state.recoveryAttempts < MAX_RECOVERY_ATTEMPTS) {
      this.state.status = 'recovering';
      this.emit();
      await this.attemptRecovery(kodePath);
    } else {
      this.state.status = 'down';
      this.emit();
      if (!this.alertedDown) {
        this.alertedDown = true;
        this.notifyUser();
      }
    }
  }

  private getKodeVersion(kodePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(kodePath, ['--version'], { shell: false });
      let out = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill();
        reject(new Error('Kode health check timed out'));
      }, CHECK_TIMEOUT_MS);

      proc.stdout?.on('data', (d) => { out += d.toString(); });
      proc.on('close', (code) => {
        clearTimeout(timer);
        if (timedOut) return;
        if (code === 0 && out.trim()) resolve(out.trim());
        else reject(new Error(`kode --version exited ${code}`));
      });
      proc.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
  }

  private async attemptRecovery(kodePath: string): Promise<void> {
    this.state.recoveryAttempts++;
    console.log(`KodeHealthMonitor: Recovery attempt ${this.state.recoveryAttempts}/${MAX_RECOVERY_ATTEMPTS}`);

    // Only attempt npm reinstall if using the default 'kode' binary (not a custom path)
    if (kodePath !== 'kode') {
      console.warn(`KodeHealthMonitor: Custom kodePath "${kodePath}" — skipping auto-reinstall`);
      this.state.status = 'down';
      this.emit();
      return;
    }

    try {
      await this.reinstallKode();
      // Re-check after install
      const version = await this.getKodeVersion('kode');
      this.state.status = 'healthy';
      this.state.version = version;
      this.state.lastHealthy = Date.now();
      this.state.recoveryAttempts = 0;
      this.state.error = undefined;
      console.log(`KodeHealthMonitor: Recovery succeeded — Kode ${version}`);
      vscode.window.showInformationMessage(`CipherMate: Scripter fix engine recovered automatically.`);
    } catch (e) {
      this.state.status = this.state.recoveryAttempts >= MAX_RECOVERY_ATTEMPTS ? 'down' : 'recovering';
      this.state.error = `Recovery failed: ${e instanceof Error ? e.message : String(e)}`;
      console.error(`KodeHealthMonitor: Recovery attempt ${this.state.recoveryAttempts} failed`, e);
    }
    this.emit();
  }

  private reinstallKode(): Promise<void> {
    return new Promise((resolve, reject) => {
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const proc = spawn(npmCmd, ['install', '-g', '@shareai-lab/kode'], {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error('npm install timed out after 120s'));
      }, 120_000);
      proc.stderr?.on('data', (d) => {
        stderr += d.toString();
      });
      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`npm install failed (exit ${code}): ${stderr.slice(-500)}`));
        }
      });
      proc.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
  }

  private notifyUser(): void {
    const msg = `CipherMate: Optional fix engine is unavailable after ${MAX_RECOVERY_ATTEMPTS} recovery attempts. Using CipherMate's native pipeline.`;
    vscode.window.showWarningMessage(msg, 'Retry Now', 'Install Manually').then((action) => {
      if (action === 'Retry Now') {
        this.state.recoveryAttempts = 0;
        this.check();
      }
      if (action === 'Install Manually') {
        // Optional: link to CipherMate docs for fix engine setup
vscode.env.openExternal(vscode.Uri.parse('https://ciphermate.ai'));
      }
    });
  }

  private emit(): void {
    const state = this.currentState;
    this._listeners.forEach((l) => { try { l(state); } catch { /* listener error */ } });
  }
}

let _monitorInstance: KodeHealthMonitor | null = null;

export function getKodeHealthMonitor(context?: vscode.ExtensionContext): KodeHealthMonitor {
  if (!_monitorInstance) {
    if (!context) throw new Error('KodeHealthMonitor: context required for first init');
    _monitorInstance = new KodeHealthMonitor(context);
  }
  return _monitorInstance;
}
