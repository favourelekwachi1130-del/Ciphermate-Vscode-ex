/**
 * @-Mention resolution for chat — injects file contents into the AI prompt.
 *
 * **User syntax (CipherMate chat):**
 * - `@file src/server.js` — path relative to the **workspace folder root** (use full path from root
 *   if the file lives in a subfolder, e.g. `packages/api/src/index.ts`).
 * - `@file "/path with spaces/file.js"` — quoted path, same rules (relative or absolute inside workspace).
 * - `@file /Users/you/project/src/server.js` — absolute path **only if** that file is under an opened
 *   workspace folder (otherwise ignored).
 * - **Shorthand (same as @file):** put `@` directly in front of a path so the model always gets that
 *   file’s contents:
 *   - `@src/server.js`, `@packages/api/index.ts` — relative to the **workspace folder root**
 *   - `@./lib/utils.ts` — explicit relative segment
 *   - `@/Users/you/proj/src/server.js` or `@C:\proj\src\server.js` — absolute, must be inside workspace
 *   - `@server.js` — basename only (searched in workspace like a bare filename)
 *
 * Shorthand requires `@` after **start of message or whitespace** so emails like `x@y.com` are not treated
 * as file paths.
 *
 * The file must be part of the current VS Code workspace. Multiple mentions are allowed; duplicates
 * resolve once.
 *
 * Phase 3.1 of BLUEBERRYAI_IMPLEMENTATION_ROADMAP
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface ResolvedMention {
  type: 'file' | 'codebase' | 'scan';
  raw: string;
  content: string;
  label: string;
}

// Match @file followed by path - supports compound extensions (e.g. .php7.2.py, .d.ts)
const FILE_PATTERN = /@file\s+([^\s@]+)/gi;
const FILE_QUOTED_PATTERN = /@file\s+"([^"]+)"/gi;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Path with a directory segment or absolute root (not plain "file" keyword). */
const SHORT_AT_PATH_WITH_SLASH = new RegExp(
  '(?:^|[\\s\\n])@((?:\\./|\\.\\./|/|[A-Za-z]:(?:/|\\\\)|[\\w][\\w.-]*(?:/|\\\\))[^\\s@]*)',
  'gi'
);

const SHORT_AT_EXT =
  'js|mjs|cjs|ts|tsx|jsx|py|pyw|go|rs|java|kt|swift|html?|css|json|md|yml|yaml|sh|sql|vue|svelte';
/** Basename.ext only, after whitespace or line start — e.g. `@server.js` */
const SHORT_AT_BASENAME_ONLY = new RegExp(
  `(?:^|[\\s\\n])@([\\w][\\w.-]*\\.(?:${SHORT_AT_EXT}))\\b`,
  'gi'
);

function collectShortAtPathRefs(message: string, into: Set<string>): void {
  let m: RegExpExecArray | null;
  SHORT_AT_PATH_WITH_SLASH.lastIndex = 0;
  while ((m = SHORT_AT_PATH_WITH_SLASH.exec(message)) !== null) {
    const ref = m[1].trim().replace(/[,;:)\]}>'"]+$/, '');
    if (!ref || ref.toLowerCase() === 'file') continue;
    into.add(ref);
  }
  SHORT_AT_BASENAME_ONLY.lastIndex = 0;
  while ((m = SHORT_AT_BASENAME_ONLY.exec(message)) !== null) {
    const ref = m[1].trim();
    if (!ref || ref.toLowerCase() === 'file') continue;
    into.add(ref);
  }
}

export async function findFileInWorkspace(relPath: string): Promise<string | null> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return null;

  const normalized = relPath.replace(/^\.\//, '').replace(/\\/g, '/');

  // Chat users often write @file /server.js meaning workspace root, not OS root (/server.js).
  if (normalized.startsWith('/') && folders?.length) {
    const relFromRoot = normalized.replace(/^\/+/, '');
    if (relFromRoot) {
      for (const folder of folders) {
        const fullPath = path.join(folder.uri.fsPath, relFromRoot);
        try {
          if (fs.existsSync(fullPath)) {
            const stat = fs.statSync(fullPath);
            if (stat.isFile()) return fullPath;
          }
        } catch {
          /* skip */
        }
      }
    }
  }

  const maybeAbs = path.normalize(normalized);
  if (path.isAbsolute(maybeAbs)) {
    try {
      const st = await vscode.workspace.fs.stat(vscode.Uri.file(maybeAbs));
      if (st.type === vscode.FileType.File) {
        const inside = folders.some((f) => {
          const rel = path.relative(f.uri.fsPath, maybeAbs);
          return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
        });
        if (inside) return maybeAbs;
      }
    } catch {
      /* not found or not in workspace */
    }
    return null;
  }

  for (const folder of folders) {
    const fullPath = path.join(folder.uri.fsPath, normalized);
    if (fs.existsSync(fullPath)) {
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) return fullPath;
      } catch {
        // skip
      }
    }
    // Also try without leading path (search by basename) or partial match
    const basename = path.basename(normalized);
    if (basename === normalized || !path.isAbsolute(relPath)) {
      const found = await vscode.workspace.findFiles(
        `**/${basename}`,
        '**/node_modules/**',
        10
      );
      // Prefer exact basename match
      const exactMatch = found.find(u => path.basename(u.fsPath) === basename);
      if (exactMatch) return exactMatch.fsPath;
      if (found.length > 0) return found[0].fsPath;
    }
  }
  return null;
}

export async function resolveAtMentions(message: string): Promise<{
  enriched: string;
  addedContext: ResolvedMention[];
  cleanedMessage: string;
}> {
  const addedContext: ResolvedMention[] = [];
  let cleanedMessage = message;

  const fileRefs = new Set<string>();
  let m: RegExpExecArray | null;

  const resetFileRegex = () => {
    FILE_PATTERN.lastIndex = 0;
    FILE_QUOTED_PATTERN.lastIndex = 0;
  };

  while ((m = FILE_PATTERN.exec(message)) !== null) {
    fileRefs.add(m[1].trim());
  }
  resetFileRegex();
  while ((m = FILE_QUOTED_PATTERN.exec(message)) !== null) {
    fileRefs.add(m[1].trim());
  }
  resetFileRegex();

  collectShortAtPathRefs(message, fileRefs);

  const contextParts: string[] = [];
  const seenResolvedFs = new Set<string>();

  for (const ref of fileRefs) {
    const filePath = await findFileInWorkspace(ref);
    if (!filePath || seenResolvedFs.has(filePath)) continue;
    seenResolvedFs.add(filePath);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const roots = vscode.workspace.workspaceFolders || [];
      const wf =
        roots.find((f) => {
          const r = path.relative(f.uri.fsPath, filePath);
          return r && !r.startsWith('..') && !path.isAbsolute(r);
        }) ?? roots[0];
      const label = wf ? path.relative(wf.uri.fsPath, filePath) : filePath;
      const usedQuoted = new RegExp(`@file\\s+"${escapeRegExp(ref)}"`, 'i').test(message);
      const usedFileKw = new RegExp(`@file\\s+${escapeRegExp(ref)}\\b`, 'i').test(message);
      const raw = usedQuoted ? `@file "${ref}"` : usedFileKw ? `@file ${ref}` : `@${ref}`;
      addedContext.push({
        type: 'file',
        raw,
        content,
        label
      });
      contextParts.push(`[File: ${label}]\n\`\`\`\n${content}\n\`\`\``);
    } catch {
      // Skip if we can't read
    }
  }

  let enriched = message;
  if (contextParts.length > 0) {
    enriched = `[User added the following file(s) for context]\n\n${contextParts.join('\n\n')}\n\n---\n\n[User message]\n${message}`;
  }

  return { enriched, addedContext, cleanedMessage };
}

/** Path-like tokens in natural language (e.g. "review server.js") — same resolution as @file */
const IMPLICIT_FILE_TOKEN =
  /\b([a-zA-Z0-9_][a-zA-Z0-9_./-]*\.(?:js|mjs|cjs|ts|tsx|jsx|py|pyw|go|rs|java|kt|swift|html?|css|json|md|yml|yaml|sh|sql|vue|svelte))\b/gi;

const IMPLICIT_EXT = 'js|mjs|cjs|ts|tsx|jsx|py|pyw|go|rs|java|kt|swift|html?|css|json|md|yml|yaml|sh|sql|vue|svelte';

function collectAbsolutePathsFromMessage(userMessage: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  // Trailing delim: do not use \\] alone before closing ] — that escapes ] and leaves [ unterminated.
  const win = userMessage.matchAll(
    new RegExp(
      `\\b([a-zA-Z]:[\\\\/](?:[^\\\\/:*?"<>|\\r\\n]+[\\\\/])*[^\\\\/:*?"<>|\\r\\n]+\\.(${IMPLICIT_EXT}))(?:\\s|$|[,;'"(){}\\]])`,
      'gi'
    )
  );
  for (const m of win) {
    const p = path.normalize(m[1]);
    if (!p.includes('..') && !seen.has(p.toLowerCase())) {
      seen.add(p.toLowerCase());
      out.push(p);
    }
  }
  const unix = userMessage.matchAll(
    new RegExp(`(\\/[a-zA-Z0-9][a-zA-Z0-9_./-]*\\.(${IMPLICIT_EXT}))(?:\\s|$|[,;:'"})\\]])`, 'gi')
  );
  for (const m of unix) {
    const p = path.normalize(m[1]);
    if (!p.includes('..') && !seen.has(p.toLowerCase())) {
      seen.add(p.toLowerCase());
      out.push(p);
    }
  }
  return out;
}

export async function resolveImplicitFilePaths(userMessage: string): Promise<{
  contextBlock: string;
  relativeLabels: string[];
}> {
  const seen = new Set<string>();
  const refs: string[] = [];
  let m: RegExpExecArray | null;

  for (const abs of collectAbsolutePathsFromMessage(userMessage)) {
    const key = abs.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(abs);
  }

  IMPLICIT_FILE_TOKEN.lastIndex = 0;
  while ((m = IMPLICIT_FILE_TOKEN.exec(userMessage)) !== null) {
    const token = m[1];
    if (token.includes('..')) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(token);
  }

  const contextParts: string[] = [];
  const relativeLabels: string[] = [];

  for (const ref of refs) {
    let filePath: string | null = null;
    if (path.isAbsolute(path.normalize(ref))) {
      const n = path.normalize(ref);
      try {
        const st = await vscode.workspace.fs.stat(vscode.Uri.file(n));
        if (st.type === vscode.FileType.File) {
          const roots = vscode.workspace.workspaceFolders || [];
          const inside = roots.some((f) => {
            const rel = path.relative(f.uri.fsPath, n);
            return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
          });
          if (inside) filePath = n;
        }
      } catch {
        /* not found */
      }
    }
    if (!filePath) {
      filePath = await findFileInWorkspace(ref);
    }
    if (filePath) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const roots = vscode.workspace.workspaceFolders || [];
        const wf =
          roots.find((f) => {
            const r = path.relative(f.uri.fsPath, filePath!);
            return r && !r.startsWith('..') && !path.isAbsolute(r);
          }) ?? roots[0];
        const label = wf ? path.relative(wf.uri.fsPath, filePath) : filePath;
        if (relativeLabels.includes(label)) continue;
        relativeLabels.push(label);
        const maxLen = 120000;
        const body = content.length > maxLen ? content.slice(0, maxLen) + '\n/* … truncated … */\n' : content;
        contextParts.push(`[File: ${label}]\n\`\`\`\n${body}\n\`\`\``);
      } catch {
        // skip
      }
    }
  }

  if (contextParts.length === 0) {
    return { contextBlock: '', relativeLabels: [] };
  }
  const contextBlock =
    `[The user referenced these workspace file(s). Use their real contents below — give specific findings and fixes, not generic scan slogans.]\n\n` +
    contextParts.join('\n\n') +
    `\n\n---\n\n`;
  return { contextBlock, relativeLabels };
}
