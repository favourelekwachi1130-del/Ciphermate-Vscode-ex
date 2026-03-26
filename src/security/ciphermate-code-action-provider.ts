/**
 * CipherMate Code Action Provider
 *
 * Provides "Fix with CipherMate" in the VS Code lightbulb menu (Cmd+. / Ctrl+.)
 * when the user has a CipherMate diagnostic selected in the Problems panel or editor.
 * Ensures CipherMate fixes appear instead of only other extensions' suggestions.
 */

import * as vscode from 'vscode';

const CIPHERMATE_SOURCE = 'CipherMate';

/** Infer vulnerability type from diagnostic message for FixService. */
function inferVulnTypeFromMessage(message: string): string {
  const m = (message || '').toLowerCase();
  if (m.includes('sql') || m.includes('parameterized')) return 'sql-injection';
  if (m.includes('xss') || m.includes('innerhtml') || m.includes('sanitize')) return 'xss';
  if (m.includes('eval') || m.includes('dynamic code')) return 'code-injection';
  if (m.includes('document.write')) return 'xss';
  if (m.includes('random') || m.includes('crypto')) return 'weak-randomness';
  if (m.includes('exec') || m.includes('spawn') || m.includes('shell') || m.includes('command')) return 'command-injection';
  if (m.includes('secret') || m.includes('environment') || m.includes('api key') || m.includes('password')) return 'hardcoded-secret';
  if (m.includes('policy') || m.includes('rule')) return 'policy-violation';
  return 'security-issue';
}

/** Map VS Code DiagnosticSeverity to FixService severity. */
function diagnosticSeverityToFixSeverity(severity: vscode.DiagnosticSeverity): string {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error: return 'critical';
    case vscode.DiagnosticSeverity.Warning: return 'high';
    case vscode.DiagnosticSeverity.Information: return 'medium';
    case vscode.DiagnosticSeverity.Hint: return 'low';
    default: return 'medium';
  }
}

/** Build a minimal Vulnerability object from a CipherMate diagnostic for FixService. */
function diagnosticToVulnerability(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic
): Record<string, unknown> {
  const message = diagnostic.message.replace(/^\[SECURITY\]\s*/i, '').trim();
  const line = diagnostic.range.start.line + 1; // 1-based for FixService
  const column = diagnostic.range.start.character;
  const lineText = document.lineAt(diagnostic.range.start.line).text;

  return {
    id: `diag-${document.uri.fsPath}-${line}-${Date.now()}`,
    type: inferVulnTypeFromMessage(message),
    severity: diagnosticSeverityToFixSeverity(diagnostic.severity),
    title: message,
    description: message,
    file: document.uri.fsPath,
    line,
    column,
    code: lineText,
    metadata: {},
  };
}

/**
 * Code Action Provider that adds "Fix with CipherMate" for CipherMate diagnostics.
 */
export function createCipherMateCodeActionProvider(): vscode.CodeActionProvider {
  return {
    provideCodeActions(
      document: vscode.TextDocument,
      range: vscode.Range | vscode.Selection,
      context: vscode.CodeActionContext,
      _token: vscode.CancellationToken
    ): vscode.CodeAction[] {
      const actions: vscode.CodeAction[] = [];

      // Only consider CipherMate diagnostics
      const ciphermateDiags = (context.diagnostics || []).filter(
        (d) => (d as vscode.Diagnostic & { source?: string }).source === CIPHERMATE_SOURCE
      );

      if (ciphermateDiags.length === 0) return actions;

      // For each CipherMate diagnostic at or overlapping this range, offer Fix with CipherMate
      for (const diag of ciphermateDiags) {
        if (!range.intersection(diag.range)) continue;

        const vuln = diagnosticToVulnerability(document, diag);
        const action = new vscode.CodeAction(
          'Fix with CipherMate',
          vscode.CodeActionKind.QuickFix
        );
        action.command = {
          command: 'ciphermate.generateFix',
          title: 'Fix with CipherMate',
          arguments: [vuln],
        };
        action.diagnostics = [diag];
        action.isPreferred = true; // Show CipherMate first in the list
        actions.push(action);
      }

      return actions;
    },
  };
}

/**
 * Register the CipherMate code action provider.
 * Call from extension activate().
 */
export function registerCipherMateCodeActionProvider(context: vscode.ExtensionContext): vscode.Disposable {
  const provider = createCipherMateCodeActionProvider();
  // Register for all languages so we can fix security issues in any file type
  const disposable = vscode.languages.registerCodeActionsProvider(
    { scheme: 'file' },
    provider,
    {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }
  );
  context.subscriptions.push(disposable);
  return disposable;
}
