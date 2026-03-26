/**
 * Diff / PR Review — security review of changed lines
 *
 * Given a diff (e.g. from git or from editor), runs pattern checks on added/changed
 * lines and returns "these lines introduced risk." Phase 3: fits into code-review workflow.
 */

import * as path from 'path';
import { Vulnerability } from '../scanners/types';

export interface DiffHunk {
  file: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  addedLines: string[];
  removedLines: string[];
}

export interface DiffReviewFinding {
  file: string;
  line: number;
  lineContent: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
}

/** Lightweight pattern checks on a single line (no full scan). */
const LINE_PATTERNS: Array<{ pattern: RegExp; type: string; severity: DiffReviewFinding['severity']; message: string }> = [
  { pattern: /\.(query|execute)\s*\([^)]*[\+`]\s*\$\{/, type: 'sql-injection', severity: 'critical', message: 'SQL may be built with user input' },
  { pattern: /innerHTML\s*=\s*[^;]+(?:req|param|input|user)/i, type: 'xss', severity: 'high', message: 'Unsanitized input to innerHTML' },
  { pattern: /(exec|execSync|spawn)\s*\([^)]*\+|`[^`]*\$\{/, type: 'command-injection', severity: 'critical', message: 'Command may include user input' },
  { pattern: /password\s*=\s*["'][^"']{4,}["']/, type: 'hardcoded-secret', severity: 'high', message: 'Possible hardcoded secret' },
  { pattern: /eval\s*\(|new\s+Function\s*\(/, type: 'code-injection', severity: 'high', message: 'Dynamic code execution' },
];

/**
 * Review added lines from a diff for obvious security patterns.
 * Returns findings with file, line, type, and message.
 */
export function reviewDiffHunks(hunks: DiffHunk[], workspaceRoot: string): DiffReviewFinding[] {
  const findings: DiffReviewFinding[] = [];
  for (const hunk of hunks) {
    const fileRel = path.isAbsolute(hunk.file) ? path.relative(workspaceRoot, hunk.file) : hunk.file;
    hunk.addedLines.forEach((line, i) => {
      for (const { pattern, type, severity, message } of LINE_PATTERNS) {
        if (pattern.test(line)) {
          findings.push({
            file: fileRel,
            line: hunk.newStart + i,
            lineContent: line.trim().slice(0, 120),
            type,
            severity,
            message,
          });
          break;
        }
      }
    });
  }
  return findings;
}

/**
 * Parse a unified diff string into hunks (simplified). Caller can get diff via
 * git diff or from SCM API. Returns hunks for reviewDiffHunks.
 */
export function parseUnifiedDiffToHunks(diffText: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = diffText.split(/\r?\n/);
  let currentFile = '';
  let oldStart = 0, oldCount = 0, newStart = 0, newCount = 0;
  let added: string[] = [], removed: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      if (added.length || removed.length) {
        hunks.push({ file: currentFile, oldStart, oldCount, newStart, newCount, addedLines: added, removedLines: removed });
        added = []; removed = [];
      }
      if (line.startsWith('+++ ')) currentFile = line.slice(4).replace(/^a\/|^b\//, '').trim();
      continue;
    }
    const range = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (range) {
      if (added.length || removed.length) {
        hunks.push({ file: currentFile, oldStart, oldCount, newStart, newCount, addedLines: added, removedLines: removed });
        added = []; removed = [];
      }
      oldStart = parseInt(range[1], 10);
      oldCount = parseInt(range[2] || '1', 10);
      newStart = parseInt(range[3], 10);
      newCount = parseInt(range[4] || '1', 10);
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) added.push(line.slice(1));
    else if (line.startsWith('-') && !line.startsWith('---')) removed.push(line.slice(1));
  }
  if (added.length || removed.length) {
    hunks.push({ file: currentFile, oldStart, oldCount, newStart, newCount, addedLines: added, removedLines: removed });
  }
  return hunks;
}
