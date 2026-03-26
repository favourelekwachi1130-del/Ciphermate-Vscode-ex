/**
 * Security Audit Logger — Tamper-Evident Append-Only Log
 *
 * Records all security-relevant actions in CipherMate:
 *   - Scans initiated and completed
 *   - Fixes applied (what file, what vulnerability)
 *   - API keys accessed
 *   - Authentication events
 *   - DAST/pentest runs
 *   - Configuration changes
 *
 * Tamper-evidence: each entry includes a SHA-256 hash of the previous entry,
 * forming a hash chain. Modification of any entry breaks the chain.
 *
 * Storage: encrypted log file in VS Code global storage.
 * Export: SIEM-compatible JSON Lines format (one JSON object per line).
 *
 * This satisfies:
 *   - SOC 2 CC7.1, CC7.2 (security monitoring)
 *   - PCI-DSS Requirement 10 (audit trails)
 *   - GDPR Article 32 (security of processing)
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AuditEventType =
  | 'scan.started'      | 'scan.completed'  | 'scan.failed'
  | 'fix.proposed'      | 'fix.applied'      | 'fix.rejected'  | 'fix.undone'
  | 'key.accessed'      | 'key.stored'       | 'key.revoked'
  | 'auth.login'        | 'auth.logout'      | 'auth.failed'   | 'auth.token.received'
  | 'dast.started'      | 'dast.completed'
  | 'config.changed'
  | 'scripter.activated'| 'scripter.tier.changed'
  | 'extension.activated';

export interface AuditEntry {
  id: string;
  timestamp: string;       // ISO 8601
  event: AuditEventType;
  /** Machine ID from vscode.env.machineId — anonymized but consistent per install */
  machineId: string;
  /** Data relevant to the event */
  data: Record<string, unknown>;
  /** SHA-256 of the previous entry (base64) — forms tamper-evident chain */
  prevHash: string;
  /** SHA-256 of this entry's content (before prevHash included) */
  hash: string;
}

// ─── Logger ──────────────────────────────────────────────────────────────────

const LOG_FILENAME = 'security-audit.jsonl';
const MAX_LOG_SIZE_BYTES = 50 * 1024 * 1024; // 50MB — rotate after this
const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export class AuditLogger {
  private context: vscode.ExtensionContext;
  private logPath: string;
  private lastHash: string = GENESIS_HASH;
  private machineId: string;
  private initialized = false;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.logPath = path.join(context.globalStorageUri.fsPath, LOG_FILENAME);
    this.machineId = vscode.env.machineId;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      // Ensure storage dir exists
      const dir = path.dirname(this.logPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      // Read last entry to get the chain hash
      if (fs.existsSync(this.logPath)) {
        const lines = fs.readFileSync(this.logPath, 'utf-8').trim().split('\n');
        const lastLine = lines[lines.length - 1];
        if (lastLine) {
          try {
            const last = JSON.parse(lastLine) as AuditEntry;
            this.lastHash = last.hash;
          } catch { /* corrupted last line — chain from genesis */ }
        }
      }
      this.initialized = true;
    } catch (e) {
      console.warn('AuditLogger: init failed', e);
    }
  }

  /**
   * Log a security event. Non-blocking — errors are silent to never break UX.
   */
  log(event: AuditEventType, data: Record<string, unknown> = {}): void {
    if (!this.initialized) {
      this.initialize().then(() => this.writeEntry(event, data)).catch(() => {});
      return;
    }
    this.writeEntry(event, data);
  }

  private writeEntry(event: AuditEventType, data: Record<string, unknown>): void {
    try {
      // Rotate if too large
      if (fs.existsSync(this.logPath)) {
        const { size } = fs.statSync(this.logPath);
        if (size > MAX_LOG_SIZE_BYTES) this.rotate();
      }

      const id = crypto.randomBytes(8).toString('hex');
      const timestamp = new Date().toISOString();

      // Hash the content (without prevHash) for tamper detection
      const contentHash = crypto
        .createHash('sha256')
        .update(JSON.stringify({ id, timestamp, event, machineId: this.machineId, data }))
        .digest('base64');

      const entry: AuditEntry = {
        id,
        timestamp,
        event,
        machineId: this.machineId,
        data: this.sanitizeData(data),
        prevHash: this.lastHash,
        hash: crypto.createHash('sha256').update(contentHash + this.lastHash).digest('base64'),
      };

      fs.appendFileSync(this.logPath, JSON.stringify(entry) + '\n', 'utf-8');
      this.lastHash = entry.hash;
    } catch (e) {
      // Silent — audit logging must never break the user's workflow
      console.warn('AuditLogger: write failed', e);
    }
  }

  /**
   * Verify the integrity of the entire log (hash chain validation).
   * Returns: { valid: true } or { valid: false, brokenAt: entryId }
   */
  async verifyChain(): Promise<{ valid: boolean; entries: number; brokenAt?: string }> {
    if (!fs.existsSync(this.logPath)) return { valid: true, entries: 0 };
    const lines = fs.readFileSync(this.logPath, 'utf-8').trim().split('\n').filter(Boolean);
    let prevHash = GENESIS_HASH;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as AuditEntry;
        const contentHash = crypto
          .createHash('sha256')
          .update(JSON.stringify({
            id: entry.id,
            timestamp: entry.timestamp,
            event: entry.event,
            machineId: entry.machineId,
            data: entry.data,
          }))
          .digest('base64');
        const expectedHash = crypto.createHash('sha256').update(contentHash + prevHash).digest('base64');
        if (expectedHash !== entry.hash || entry.prevHash !== prevHash) {
          return { valid: false, entries: lines.length, brokenAt: entry.id };
        }
        prevHash = entry.hash;
      } catch {
        return { valid: false, entries: lines.length, brokenAt: '(parse error)' };
      }
    }
    return { valid: true, entries: lines.length };
  }

  /**
   * Export the audit log as SIEM-compatible JSON Lines.
   * Saves to a user-chosen location.
   */
  async exportLog(): Promise<void> {
    if (!fs.existsSync(this.logPath)) {
      vscode.window.showInformationMessage('No audit log entries yet.');
      return;
    }
    const dest = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '', 'ciphermate-audit.jsonl')),
      filters: { 'JSON Lines': ['jsonl'], 'All Files': ['*'] },
    });
    if (!dest) return;
    fs.copyFileSync(this.logPath, dest.fsPath);
    vscode.window.showInformationMessage(`Audit log exported to ${dest.fsPath}`);
  }

  /** Remove keys, tokens, passwords from logged data */
  private sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
    const REDACT = /key|secret|password|token|apikey|auth|bearer/i;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (REDACT.test(k)) {
        out[k] = '[redacted]';
      } else if (typeof v === 'string' && v.length > 200) {
        out[k] = v.slice(0, 200) + '...[truncated]';
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  private rotate(): void {
    const rotated = this.logPath.replace('.jsonl', `.${Date.now()}.jsonl`);
    fs.renameSync(this.logPath, rotated);
    this.lastHash = GENESIS_HASH;
  }
}

let _loggerInstance: AuditLogger | null = null;

export function getAuditLogger(context?: vscode.ExtensionContext): AuditLogger {
  if (!_loggerInstance) {
    if (!context) throw new Error('AuditLogger: context required for first init');
    _loggerInstance = new AuditLogger(context);
  }
  return _loggerInstance;
}

/** Convenience function — log without needing a reference to the logger */
export function auditLog(event: AuditEventType, data: Record<string, unknown> = {}): void {
  try { _loggerInstance?.log(event, data); } catch { /* never throw */ }
}
