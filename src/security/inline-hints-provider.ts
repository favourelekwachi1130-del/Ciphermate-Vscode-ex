/**
 * Inline Hints Provider — non-blocking security hints while coding
 *
 * Shows subtle cues (e.g. "Consider parameterized query") at relevant positions
 * without blocking the editor. Phase 4: pair-programmer feel; security in the flow.
 */

import * as vscode from 'vscode';

/** Line-level hint: position and message. */
export interface InlineHint {
  range: vscode.Range;
  message: string;
  severity: 'info' | 'warning';
  vulnType?: string;
}

/** Patterns that trigger a hint (regex + message). */
const HINT_PATTERNS: Array<{
  pattern: RegExp;
  message: string;
  severity: InlineHint['severity'];
  vulnType: string;
}> = [
  { pattern: /\.(query|execute)\s*\([^)]*[\+`]/, message: 'Consider parameterized query to prevent SQL injection', severity: 'warning', vulnType: 'sql-injection' },
  { pattern: /innerHTML\s*=\s*\w+/, message: 'Sanitize or use textContent to prevent XSS', severity: 'warning', vulnType: 'xss' },
  { pattern: /(exec|execSync|spawn)\s*\([^)]*\+|`[^`]*\$\{/, message: 'Avoid user input in shell commands; use execFile with args', severity: 'warning', vulnType: 'command-injection' },
  { pattern: /eval\s*\(|new\s+Function\s*\(/, message: 'Avoid eval/Function with user input', severity: 'warning', vulnType: 'code-injection' },
  { pattern: /password\s*=\s*["'][^"']+["']|apiKey\s*=\s*["']/, message: 'Use environment variables for secrets', severity: 'info', vulnType: 'hardcoded-secret' },
];

/**
 * Compute inline hints for a document. Called by the provider on doc change or demand.
 */
export function computeInlineHints(document: vscode.TextDocument): InlineHint[] {
  const hints: InlineHint[] = [];
  const text = document.getText();
  const lines = text.split(/\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { pattern, message, severity, vulnType } of HINT_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        const start = line.indexOf(match[0]);
        const end = start + match[0].length;
        hints.push({
          range: new vscode.Range(i, start, i, end),
          message,
          severity,
          vulnType,
        });
        break; // one hint per line
      }
    }
  }
  return hints;
}

/**
 * Register the inline hints provider with VS Code. Enable via config e.g. ciphermate.inlineHints.enabled.
 */
export function registerInlineHintsProvider(context: vscode.ExtensionContext): vscode.Disposable {
  const provider = {
    provideInlayHints(document: vscode.TextDocument, range: vscode.Range): vscode.InlayHint[] | null {
      const enabled = vscode.workspace.getConfiguration('ciphermate').get<boolean>('inlineHints.enabled', false);
      if (!enabled) return null;
      const all = computeInlineHints(document);
      const inRange = all.filter((h) => range.intersection(h.range));
      return inRange.map((h) => ({
        position: h.range.end,
        label: ` ${h.message}`,
      }));
    },
  };
  const js = vscode.languages.registerInlayHintsProvider([{ language: 'javascript' }, { language: 'typescript' }], provider);
  return js;
}
