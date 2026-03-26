/**
 * ECC Rules Loader — Merge ECC-style rules into the fix pipeline
 *
 * Loads:
 * - .ciphermate/rules.md (project rules: NEVER/ALWAYS, do/don't)
 * - Bundled ECC security checklist (secrets, SQLi, XSS, auth, etc.)
 *
 * Injected into fix prompts and TaskGuard so every fix follows
 * ECC + project rules. Makes CipherMate 10x more consistent than
 * generic code assistants (Codex, etc.).
 */

import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';

export interface LoadedRules {
  /** Block to append to fix-generation prompt (NEVER/ALWAYS + checklist) */
  promptBlock: string;
  /** Patterns that TaskGuard must reject (e.g. eval, disable security) */
  neverSuggest: string[];
  /** Raw lines for optional display */
  rawLines: string[];
}

/** ECC security-review core (condensed from ECC rules/common/security + skills/security-review) */
const ECC_SECURITY_CORE = `
## Mandatory security rules (always apply)
- NEVER hardcode secrets (API keys, passwords, tokens). Use env vars or secret manager.
- NEVER concatenate or interpolate user input into SQL. Use parameterized queries only.
- NEVER put raw user input into innerHTML, document.write, or eval(). Sanitize or use textContent.
- NEVER run shell commands with user input in the command string. Use execFile with argument array.
- ALWAYS validate user input with schema/allowlist before use.
- ALWAYS use parameterized queries / prepared statements for any user-derived value in DB queries.
- ALWAYS escape/sanitize output for the correct context (HTML, attribute, JS).
- If moving secrets to env: add to .env.example, document, and ensure .env is in .gitignore.
`;

/** Extract NEVER/ALWAYS and "don't" lines for TaskGuard neverSuggest */
function parseNeverSuggest(content: string): string[] {
  const out: string[] = [];
  const lower = content.toLowerCase();
  // ECC-style: "NEVER suggest eval", "never use ..."
  if (lower.includes('eval') && (lower.includes('never') || lower.includes('don\'t'))) out.push('eval');
  if (lower.includes('disable') && (lower.includes('security') || lower.includes('eslint'))) out.push('disable security');
  if (lower.includes('dangerouslysetinnerhtml') && lower.includes('without sanit')) out.push('dangerouslySetInnerHTML without sanitize');
  if (lower.includes('innerhtml') && lower.includes('raw user')) out.push('innerHTML with raw user input');
  if (lower.includes('string concat') && lower.includes('sql')) out.push('string concatenation in SQL');
  return out;
}

/**
 * Load project rules from .ciphermate/rules.md (if present).
 * Safe: path guard via workspace root only.
 */
function loadProjectRules(workspaceRoot: string): { content: string; neverSuggest: string[] } {
  const rulesPath = path.join(workspaceRoot, '.ciphermate', 'rules.md');
  let content = '';
  try {
    if (fs.existsSync(rulesPath)) {
      const full = path.resolve(rulesPath);
      if (full.startsWith(path.resolve(workspaceRoot))) {
        content = fs.readFileSync(full, 'utf8').slice(0, 16000);
      }
    }
  } catch {
    content = '';
  }
  const neverSuggest = content ? parseNeverSuggest(content) : [];
  return { content, neverSuggest };
}

/**
 * Build prompt block from project rules + ECC core.
 * Truncate project rules if very long so ECC core always included.
 */
function buildPromptBlock(projectContent: string, maxProjectChars: number): string {
  const ecc = ECC_SECURITY_CORE.trim();
  if (!projectContent.trim()) return ecc;
  const truncated = projectContent.length > maxProjectChars
    ? projectContent.slice(0, maxProjectChars) + '\n\n[... truncated ...]'
    : projectContent;
  return `${ecc}\n\n## Project rules (.ciphermate/rules.md)\n${truncated}`;
}

/**
 * Load all rules: project .ciphermate/rules.md + ECC security core.
 * Returns prompt block for fix generation and neverSuggest list for TaskGuard.
 */
export function loadEccRules(workspaceRoot?: string): LoadedRules {
  const root = workspaceRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  const { content: projectContent, neverSuggest: projectNever } = loadProjectRules(root);
  const promptBlock = buildPromptBlock(projectContent, 8000);
  const neverSuggest = [...new Set([
    'eval',
    'disable security',
    'dangerouslySetInnerHTML without sanitize',
    'innerHTML with raw user input',
    'string concatenation in SQL',
    ...projectNever,
  ])];
  const rawLines = promptBlock.split(/\r?\n/);
  return { promptBlock, neverSuggest, rawLines };
}
