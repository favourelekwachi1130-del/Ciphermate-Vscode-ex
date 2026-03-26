/**
 * Scan Diagnostics Service
 *
 * Converts scan results (lastScanResults) to VS Code diagnostics so they appear
 * in the Problems panel. Works with the CipherMate CodeActionProvider so users
 * get "Fix with CipherMate" when clicking the lightbulb on scan findings.
 */

import * as vscode from 'vscode';
import * as path from 'path';

const DIAGNOSTIC_SOURCE = 'CipherMate';

let scanDiagnosticCollection: vscode.DiagnosticCollection | null = null;

function getCollection(): vscode.DiagnosticCollection {
  if (!scanDiagnosticCollection) {
    scanDiagnosticCollection = vscode.languages.createDiagnosticCollection(`${DIAGNOSTIC_SOURCE} Scan`);
  }
  return scanDiagnosticCollection;
}

function severityToDiagnostic(s: string): vscode.DiagnosticSeverity {
  switch ((s || '').toLowerCase()) {
    case 'critical':
    case 'error':
      return vscode.DiagnosticSeverity.Error;
    case 'high':
    case 'warning':
      return vscode.DiagnosticSeverity.Warning;
    case 'medium':
    case 'info':
      return vscode.DiagnosticSeverity.Warning;
    case 'low':
      return vscode.DiagnosticSeverity.Information;
    default:
      return vscode.DiagnosticSeverity.Warning;
  }
}

/**
 * Update the Problems panel with diagnostics from scan results.
 * Call this when lastScanResults changes (after a scan completes).
 */
export function updateScanDiagnostics(
  scanResults: any[],
  workspaceRoot?: string
): void {
  const col = getCollection();
  if (!scanResults || scanResults.length === 0) {
    col.clear();
    return;
  }

  const byFile = new Map<string, vscode.Diagnostic[]>();

  for (const r of scanResults) {
    let filePath = (r.path || r.filename || r.file || '').trim();
    if (!filePath) continue;
    if (workspaceRoot && !path.isAbsolute(filePath)) {
      filePath = path.join(workspaceRoot, filePath);
    }
    const line = r.start?.line ?? r.line ?? r.line_number ?? 1;
    const lineIndex = Math.max(0, line - 1); // 0-based
    const colStart = r.start?.col ?? r.column ?? 0;
    const message =
      r.extra?.message || r.issue_text || r.check_id || r.message || r.description || 'Security issue';
    const severity = severityToDiagnostic(r.severity || r.extra?.severity || 'medium');

    const diag = new vscode.Diagnostic(
      new vscode.Range(lineIndex, colStart, lineIndex, Math.max(colStart, 1)),
      `[SECURITY] ${message}`,
      severity
    );
    (diag as vscode.Diagnostic & { source?: string }).source = DIAGNOSTIC_SOURCE;
    (diag as vscode.Diagnostic & { code?: string }).code = r.check_id || r.tool || r.type;

    const uri = vscode.Uri.file(filePath);
    const list = byFile.get(uri.toString()) || [];
    list.push(diag);
    byFile.set(uri.toString(), list);
  }

  col.clear();
  for (const [uriStr, diags] of byFile) {
    col.set(vscode.Uri.parse(uriStr), diags);
  }
}

/**
 * Clear scan diagnostics (e.g. when user clears results).
 */
export function clearScanDiagnostics(): void {
  getCollection().clear();
}

/**
 * Dispose of the collection. Call from extension deactivate.
 */
export function disposeScanDiagnostics(): void {
  if (scanDiagnosticCollection) {
    scanDiagnosticCollection.dispose();
    scanDiagnosticCollection = null;
  }
}
