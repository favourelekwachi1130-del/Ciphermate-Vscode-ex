/**
 * Repo Index — lightweight index for full-repo audit and context
 *
 * File list + language (and optional one-line summary) so audit sub-agents
 * get whole-repo awareness without sending the entire codebase. Phase 4.
 */

import * as path from 'path';
import * as fs from 'fs';

export interface RepoFileEntry {
  relativePath: string;
  language: string;
  /** Optional one-line summary (e.g. from first comment or export name) */
  summary?: string;
}

export interface RepoIndex {
  workspaceRoot: string;
  files: RepoFileEntry[];
  totalFiles: number;
  languages: Record<string, number>;
  builtAt: number;
}

const EXT_TO_LANG: Record<string, string> = {
  '.js': 'javascript', '.ts': 'typescript', '.jsx': 'javascript', '.tsx': 'typescript',
  '.py': 'python', '.php': 'php', '.go': 'go', '.rb': 'ruby', '.java': 'java', '.kt': 'kotlin',
  '.rs': 'rust', '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp',
  '.sql': 'sql', '.sh': 'shell', '.yaml': 'yaml', '.yml': 'yaml', '.json': 'json',
};

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__', 'vendor', '.next', '.nuxt']);

const MAX_FILES = 2000;
const SUMMARY_MAX_LEN = 120;

/**
 * Build a lightweight repo index: list of files with language and optional summary.
 * Safe: only reads file list and first few lines for summary; path guard via cwd.
 */
export function buildRepoIndex(workspaceRoot: string, options?: { includeSummary: boolean }): RepoIndex {
  const includeSummary = options?.includeSummary ?? false;
  const files: RepoFileEntry[] = [];
  const languages: Record<string, number> = {};
  const rootResolved = path.resolve(workspaceRoot);

  function walk(dir: string): void {
    if (files.length >= MAX_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (files.length >= MAX_FILES) return;
      const full = path.join(dir, e.name);
      const rel = path.relative(rootResolved, full);
      if (rel.startsWith('..')) continue;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(full);
        continue;
      }
      const ext = path.extname(e.name).toLowerCase();
      const lang = EXT_TO_LANG[ext] ?? 'other';
      languages[lang] = (languages[lang] ?? 0) + 1;
      let summary: string | undefined;
      if (includeSummary && /\.(ts|js|jsx|tsx|py|php|go|rb|rs)$/i.test(e.name)) {
        try {
          const content = fs.readFileSync(full, 'utf8').slice(0, 1024);
          const firstLine = content.split(/\r?\n/)[0]?.trim() ?? '';
          if (firstLine.startsWith('//') || firstLine.startsWith('#') || firstLine.startsWith('/*') || firstLine.startsWith('*')) {
            summary = firstLine.replace(/^[\s*#/]+/, '').slice(0, SUMMARY_MAX_LEN);
          } else {
            const exportMatch = content.match(/(?:export\s+)?(?:function|const|class)\s+(\w+)/);
            if (exportMatch) summary = `export ${exportMatch[1]}`.slice(0, SUMMARY_MAX_LEN);
          }
        } catch { /* ignore */ }
      }
      files.push({ relativePath: rel, language: lang, summary });
    }
  }

  walk(rootResolved);
  return {
    workspaceRoot: rootResolved,
    files,
    totalFiles: files.length,
    languages,
    builtAt: Date.now(),
  };
}

/**
 * Format repo index as markdown for audit sub-agent context (truncated if large).
 */
export function formatRepoIndexForPrompt(index: RepoIndex, maxEntries?: number): string {
  const cap = maxEntries ?? 500;
  const slice = index.files.slice(0, cap);
  const rows = slice.map((f) => `| ${f.relativePath} | ${f.language} | ${f.summary ?? '-'} |`).join('\n');
  const more = index.totalFiles > cap ? `\n... and ${index.totalFiles - cap} more files.` : '';
  return `
## Repo index (${index.totalFiles} files)
Languages: ${Object.entries(index.languages).map(([k, v]) => `${k}: ${v}`).join(', ')}

| File | Language | Summary |
|------|----------|---------|
${rows}${more}
`;
}
