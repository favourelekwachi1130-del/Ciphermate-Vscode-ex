/**
 * Workspace Fingerprint — Research Direction #1 (Staleness & Drift)
 *
 * Hash of key files (package.json, requirements.txt, etc.) + git HEAD.
 * When fingerprint changes, threat model may be stale — suggest rebuild.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const FINGERPRINT_FILES = [
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'requirements.txt',
  'Pipfile.lock',
  'go.sum',
  'go.mod',
  'Cargo.lock',
  'pom.xml',
];

/**
 * Compute a fingerprint of the workspace for staleness detection.
 * Changes when deps or lockfiles change, or when git HEAD changes.
 */
export function computeWorkspaceFingerprint(workspaceRoot: string): string {
  const parts: string[] = [];

  for (const rel of FINGERPRINT_FILES) {
    const full = path.join(workspaceRoot, rel);
    if (fs.existsSync(full)) {
      try {
        const content = fs.readFileSync(full, 'utf8');
        parts.push(`${rel}:${content.length}:${hash(content.slice(0, 2000))}`);
      } catch {
        /* ignore */
      }
    }
  }

  const gitHead = path.join(workspaceRoot, '.git', 'HEAD');
  if (fs.existsSync(gitHead)) {
    try {
      const head = fs.readFileSync(gitHead, 'utf8').trim();
      parts.push(`git:${hash(head)}`);
      if (head.startsWith('ref: ')) {
        const refPath = path.join(workspaceRoot, '.git', head.slice(5));
        if (fs.existsSync(refPath)) {
          const sha = fs.readFileSync(refPath, 'utf8').trim();
          parts.push(`sha:${sha.slice(0, 12)}`);
        }
      }
    } catch {
      /* ignore */
    }
  }

  return hash(parts.join('|'));
}

function hash(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
}
