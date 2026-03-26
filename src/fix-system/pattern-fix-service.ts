/**
 * Pattern Fix Service — project-wide same-pattern detection
 *
 * Given a fixed vulnerability (type, file, code pattern), finds other files
 * in the workspace with the same vulnerable pattern so the user can "Fix similar"
 * or batch-apply. Phase 3: one finding becomes a pattern fix across the repo.
 */

import * as path from 'path';
import * as fs from 'fs';
import { Vulnerability } from '../scanners/types';
import { grepSafe } from '../engine/subagent-tools';

export interface SamePatternMatch {
  file: string;
  line: number;
  snippet: string;
  confidence: 'high' | 'medium';
}

/** Regex hints per vuln type for grep-based same-pattern search (path-guard safe). */
const PATTERN_GREP: Record<string, string[]> = {
  'sql-injection': ['\\.query\\s*\\([^)]*\\+', '\\.execute\\s*\\([^)]*%s|f["\'].*SELECT', 'execute\\s*\\([^)]*\\$\\{', 'query\\s*\\([^)]*\\+'],
  'xss': ['innerHTML\\s*=', 'dangerouslySetInnerHTML', 'document\\.write\\s*\\(', 'eval\\s*\\('],
  'command-injection': ['exec\\s*\\(|execSync\\s*\\(|spawn\\s*\\([^)]*shell\\s*:\\s*true', 'os\\.system\\s*\\(|subprocess\\.call.*shell\\s*=\\s*True'],
  'path-traversal': ['readFile\\s*\\([^)]*path\\.join.*req\\.|fs\\.readFile.*\\+', 'require\\s*\\([^)]*\\+'],
  'hardcoded-secret': ['password\\s*=\\s*["\'][^"\']+["\']', 'apiKey\\s*=\\s*["\']', 'secret\\s*=\\s*["\'][^"\']+["\']'],
  'ssrf': ['fetch\\s*\\(|request\\.get\\s*\\(|axios\\.get\\s*\\(|urllib\\.request\\.urlopen'],
};

/**
 * Find other files in the workspace that likely have the same vulnerability pattern.
 * Uses grep-safe patterns and optional code snippet similarity.
 */
export function findSamePatternInWorkspace(
  workspaceRoot: string,
  vulnerability: Vulnerability,
  options?: { maxFiles?: number }
): SamePatternMatch[] {
  const vulnType = (vulnerability.type || '').toLowerCase().replace(/\s+/g, '-');
  const patterns = PATTERN_GREP[vulnType];
  if (!patterns?.length) return [];

  const currentFile = vulnerability.file ? path.relative(workspaceRoot, path.isAbsolute(vulnerability.file) ? vulnerability.file : path.join(workspaceRoot, vulnerability.file)) : '';
  const maxFiles = options?.maxFiles ?? 20;
  const seen = new Set<string>();
  const results: SamePatternMatch[] = [];

  for (const pat of patterns.slice(0, 3)) {
    const { lines } = grepSafe(workspaceRoot, pat, '.');
    for (const raw of lines) {
      const match = raw.match(/^([^:]+):\s*(.+)$/);
      if (!match) continue;
      const [, relPath, snippet] = match;
      const norm = path.normalize(relPath);
      if (norm === currentFile || seen.has(norm)) continue;
      seen.add(norm);
      const lineNum = 1; // grep doesn't give line number in our impl; could enhance
      results.push({ file: norm, line: lineNum, snippet: snippet.slice(0, 100), confidence: 'medium' });
      if (results.length >= maxFiles) return results;
    }
  }
  return results;
}
