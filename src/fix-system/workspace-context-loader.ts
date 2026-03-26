/**
 * Workspace Context Loader — Heavy context awareness
 *
 * Loads full workspace context in one place:
 * - Full or large window of the vulnerable file
 * - Related files (imports, same directory)
 * - AGENTS.md / AGENTS.override.md (project instructions)
 * - package.json / requirements.txt / composer.json (stack and deps)
 *
 * Makes code fixing and deep analysis project-aware.
 */

import * as path from 'path';
import * as fs from 'fs';
import type { Vulnerability } from '../scanners/types';
import { resolveVulnerabilityPath, guardPathSafe } from '../security/path-guard';
import { sanitizeUserContentForPrompt } from '../security/prompt-sanitizer';

const MAX_FILE_BYTES = 80 * 1024;       // 80 KB per file
const MAX_AGENTS_MD_BYTES = 8 * 1024;   // 8 KB total for AGENTS
const MAX_PACKAGE_JSON_BYTES = 4 * 1024;
const LARGE_WINDOW_LINES = 200;         // lines around vuln for "full file" context
const MAX_RELATED_FILES = 6;

export interface WorkspaceContext {
  /** Full or large window of primary file */
  primaryFileContent: string;
  /** Path of primary file (relative to workspace) */
  primaryFilePath: string;
  /** Related files: imports or same-dir; path -> content snippet */
  relatedFiles: Array<{ path: string; content: string }>;
  /** AGENTS.md + AGENTS.override.md concatenated (capped) */
  agentsMd: string;
  /** package.json or requirements.txt or composer.json snippet */
  stackSnippet: string;
  /** One-line stack label (e.g. "Node (express, pg)" or "Python (django)") */
  stackLabel: string;
}

/**
 * Safe read file with size cap and path guard.
 */
function readFileSafe(workspaceRoot: string, relPath: string, maxBytes: number): string {
  const full = guardPathSafe(workspaceRoot, relPath);
  if (!full) { return ''; }
  try {
    const raw = fs.readFileSync(full, 'utf8');
    return raw.length > maxBytes ? raw.slice(0, maxBytes) + '\n\n[... truncated ...]' : raw;
  } catch {
    return '';
  }
}

/**
 * Extract import/require targets from code (JS/TS/Python/PHP).
 */
function extractImports(code: string, filePath: string): string[] {
  const ext = path.extname(filePath).toLowerCase();
  const rels: string[] = [];
  const dir = path.dirname(filePath);

  if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)) {
    const re = /(?:from\s+['"](\.\.?\/[^'"]+)['"]|require\s*\(\s*['"](\.\.?\/[^'"]+)['"])/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) {
      const rel = (m[1] || m[2] || '').replace(/\.(js|ts|jsx|tsx|mjs|cjs)$/i, '');
      const resolved = path.join(dir, rel);
      const withExt = ['.ts', '.tsx', '.js', '.jsx', '.js'].map((e) => resolved + e);
      rels.push(...withExt);
    }
  }
  if (['.py'].includes(ext)) {
    const re = /(?:from\s+(\.\.?[\w.]*)\s+import|import\s+(\.\.?[\w.]+))/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) {
      const mod = (m[1] || m[2] || '').replace(/\./g, path.sep);
      const resolved = path.join(dir, mod);
      rels.push(resolved + '.py');
    }
  }
  return rels;
}

/**
 * List files in the same directory as filePath (relative to workspace).
 */
function sameDirFiles(workspaceRoot: string, filePath: string): string[] {
  const full = guardPathSafe(workspaceRoot, filePath);
  if (!full) { return []; }
  const dir = path.dirname(full);
  const relDir = path.relative(workspaceRoot, dir);
  try {
    const names = fs.readdirSync(dir);
    return names
      .filter((n) => /\.(js|ts|jsx|tsx|py|php|rb|go)$/i.test(n))
      .slice(0, 8)
      .map((n) => (relDir ? relDir + path.sep : '') + n);
  } catch {
    return [];
  }
}

/**
 * Load AGENTS.md and AGENTS.override.md from workspace root.
 * Sanitizes content (zero-width / invisible chars) before return.
 */
function loadAgentsMd(workspaceRoot: string): string {
  let out = '';
  const root = workspaceRoot;
  const overridePath = path.join(root, 'AGENTS.override.md');
  const mainPath = path.join(root, 'AGENTS.md');
  if (fs.existsSync(overridePath)) {
    const content = fs.readFileSync(overridePath, 'utf8');
    out += content.length > MAX_AGENTS_MD_BYTES / 2 ? content.slice(0, MAX_AGENTS_MD_BYTES / 2) + '\n\n[... truncated ...]' : content;
    out += '\n\n';
  }
  if (fs.existsSync(mainPath)) {
    const content = fs.readFileSync(mainPath, 'utf8');
    const remaining = MAX_AGENTS_MD_BYTES - out.length;
    out += content.length > remaining ? content.slice(0, remaining) + '\n\n[... truncated ...]' : content;
  }
  return sanitizeUserContentForPrompt(out, MAX_AGENTS_MD_BYTES);
}

/**
 * Load stack manifest (package.json, requirements.txt, composer.json).
 */
function loadStackSnippet(workspaceRoot: string): { snippet: string; label: string } {
  const pkgPath = path.join(workspaceRoot, 'package.json');
  const reqPath = path.join(workspaceRoot, 'requirements.txt');
  const composerPath = path.join(workspaceRoot, 'composer.json');
  if (fs.existsSync(pkgPath)) {
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const snippet = raw.length > MAX_PACKAGE_JSON_BYTES ? raw.slice(0, MAX_PACKAGE_JSON_BYTES) + '\n...' : raw;
    let label = 'Node';
    try {
      const pkg = JSON.parse(raw);
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (deps.express) { label += ' (express)'; }
      if (deps.pg || deps.mysql2) { label += ', pg/mysql'; }
      if (deps.react) { label += ', react'; }
    } catch { /* ignore */ }
    return { snippet, label };
  }
  if (fs.existsSync(reqPath)) {
    const raw = fs.readFileSync(reqPath, 'utf8');
    const snippet = raw.length > MAX_PACKAGE_JSON_BYTES ? raw.slice(0, MAX_PACKAGE_JSON_BYTES) + '\n...' : raw;
    const label = /django|flask|fastapi/i.test(raw) ? 'Python (django/flask/fastapi)' : 'Python';
    return { snippet, label };
  }
  if (fs.existsSync(composerPath)) {
    const raw = fs.readFileSync(composerPath, 'utf8');
    const snippet = raw.length > MAX_PACKAGE_JSON_BYTES ? raw.slice(0, MAX_PACKAGE_JSON_BYTES) + '\n...' : raw;
    return { snippet, label: 'PHP (Composer)' };
  }
  return { snippet: '', label: 'Unknown' };
}

/**
 * Load full workspace context for a vulnerability: primary file (large window or full),
 * related files, AGENTS.md, and stack snippet. Uses path guard for all reads.
 */
export function loadWorkspaceContext(
  vulnerability: Vulnerability,
  workspaceRoot: string,
  options?: { fullFile?: boolean }
): WorkspaceContext {
  const filePath = vulnerability.file || '';
  const line = vulnerability.line || 1;

  let primaryFilePathAbs: string;
  try {
    primaryFilePathAbs = workspaceRoot ? resolveVulnerabilityPath(workspaceRoot, filePath) : path.resolve(filePath);
  } catch {
    primaryFilePathAbs = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
  }
  const relPath = workspaceRoot ? path.relative(workspaceRoot, primaryFilePathAbs) : filePath;
  const primaryFilePath = relPath;

  let primaryFileContent = '';
  try {
    const raw = fs.readFileSync(primaryFilePathAbs, 'utf8');
    if (options?.fullFile || raw.length <= MAX_FILE_BYTES) {
      primaryFileContent = raw;
    } else {
      const lines = raw.split('\n');
      const start = Math.max(0, line - 1 - Math.floor(LARGE_WINDOW_LINES / 2));
      const end = Math.min(lines.length, start + LARGE_WINDOW_LINES);
      primaryFileContent = lines.slice(start, end).join('\n');
      if (start > 0) { primaryFileContent = '// ... earlier lines omitted\n' + primaryFileContent; }
      if (end < lines.length) { primaryFileContent += '\n// ... more lines omitted'; }
    }
  } catch {
    primaryFileContent = vulnerability.code || '';
  }

  const relatedPaths = new Set<string>();
  extractImports(primaryFileContent, relPath).forEach((p) => {
    const normalized = path.normalize(p).replace(/\\/g, '/');
    if (!normalized.includes('node_modules')) { relatedPaths.add(normalized); }
  });
  sameDirFiles(workspaceRoot, relPath).forEach((p) => relatedPaths.add(p));

  const relatedFiles: Array<{ path: string; content: string }> = [];
  Array.from(relatedPaths).slice(0, MAX_RELATED_FILES).forEach((rel) => {
    const content = readFileSafe(workspaceRoot, rel, MAX_FILE_BYTES / 2);
    if (content) { relatedFiles.push({ path: rel, content }); }
  });

  const agentsMd = workspaceRoot ? loadAgentsMd(workspaceRoot) : '';
  const { snippet: stackSnippet, label: stackLabel } = workspaceRoot ? loadStackSnippet(workspaceRoot) : { snippet: '', label: 'Unknown' };

  return {
    primaryFileContent,
    primaryFilePath: relPath,
    relatedFiles,
    agentsMd,
    stackSnippet,
    stackLabel,
  };
}
