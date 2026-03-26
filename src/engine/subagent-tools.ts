/**
 * Sub-Agent Tools — read_file and grep with path guard
 *
 * Orchestrator can run these to give sub-agents more context (e.g. taint tracer
 * gets file contents, context mapper gets grep results). All paths are
 * guarded to stay within workspace.
 */

import * as fs from 'fs';
import * as path from 'path';
import { guardPathSafe } from '../security/path-guard';

const MAX_FILE_BYTES = 32 * 1024;
const MAX_GREP_LINES = 50;

/**
 * Read a file from the workspace. Path must be relative to workspace root.
 * Returns truncated content and a note if truncated.
 */
export function readFileSafe(workspaceRoot: string, relativePath: string): { content: string; truncated?: boolean } {
  const safe = guardPathSafe(workspaceRoot, relativePath);
  if (!safe) return { content: '' };
  try {
    const raw = fs.readFileSync(safe, 'utf8');
    const truncated = raw.length > MAX_FILE_BYTES;
    const content = truncated ? raw.slice(0, MAX_FILE_BYTES) + '\n... (truncated)' : raw;
    return { content, truncated: truncated || undefined };
  } catch {
    return { content: '' };
  }
}

/**
 * Grep for a pattern in a file or directory. Path must be within workspace.
 * Uses simple line-by-line regex (no child_process). Returns up to MAX_GREP_LINES matching lines.
 */
export function grepSafe(
  workspaceRoot: string,
  pattern: string,
  inPath: string
): { lines: string[]; truncated?: boolean } {
  const safe = guardPathSafe(workspaceRoot, inPath);
  if (!safe) return { lines: [] };
  let re: RegExp;
  try {
    re = new RegExp(pattern, 'i');
  } catch {
    return { lines: [] };
  }
  const lines: string[] = [];
  const walk = (p: string) => {
    if (lines.length >= MAX_GREP_LINES) return;
    const stat = fs.statSync(p);
    if (stat.isFile()) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        const rel = path.relative(workspaceRoot, p);
        for (const line of content.split(/\r?\n/)) {
          if (re.test(line)) {
            lines.push(`${rel}: ${line.trim().slice(0, 120)}`);
            if (lines.length >= MAX_GREP_LINES) return;
          }
        }
      } catch { /* skip */ }
      return;
    }
    if (stat.isDirectory()) {
      try {
        const entries = fs.readdirSync(p, { withFileTypes: true });
        for (const e of entries) {
          if (e.name.startsWith('.') || e.name === 'node_modules') continue;
          const full = path.join(p, e.name);
          if (guardPathSafe(workspaceRoot, path.relative(workspaceRoot, full))) walk(full);
        }
      } catch { /* skip */ }
    }
  };
  walk(safe);
  return { lines, truncated: lines.length >= MAX_GREP_LINES };
}

/**
 * Build an enriched context block for sub-agents: read primary file and optional
 * grep for sink patterns. Used by the orchestrator when workspaceRoot is available.
 */
export function buildSubAgentToolContext(
  workspaceRoot: string,
  primaryFilePath: string,
  options?: { grepPatterns?: string[] }
): string {
  const blocks: string[] = [];
  const rootResolved = path.resolve(workspaceRoot);
  const rel = path.isAbsolute(primaryFilePath)
    ? path.relative(rootResolved, path.resolve(primaryFilePath))
    : primaryFilePath;
  if (rel.startsWith('..')) return ''; // outside workspace
  const { content } = readFileSafe(workspaceRoot, rel);
  if (content) {
    blocks.push(`### File: ${rel}\n\`\`\`\n${content.slice(0, 12000)}\n\`\`\``);
  }
  if (options?.grepPatterns?.length) {
    for (const pat of options.grepPatterns.slice(0, 3)) {
      const { lines } = grepSafe(workspaceRoot, pat, rel);
      if (lines.length) {
        blocks.push(`### Grep "${pat}" in ${rel}\n${lines.join('\n')}`);
      }
    }
  }
  if (blocks.length === 0) return '';
  return '\n## Tool-enriched context (read_file / grep)\n' + blocks.join('\n\n');
}
