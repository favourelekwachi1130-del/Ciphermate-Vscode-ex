/**
 * Commit-Based Bypass Hunting — Devansh Methodology
 *
 * "Look for the commit that fixed these vulnerabilities and try to find bypasses for that."
 *
 * 1. Find fix commit(s) for a CVE (git log, commit message search)
 * 2. Extract patch/diff
 * 3. Ask LLM to analyze: what assumptions does the fix make? Can an attacker bypass it?
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);
const GIT_TIMEOUT_MS = 10_000;

export interface FixCommit {
  sha: string;
  subject: string;
  body?: string;
  author?: string;
  date?: string;
  files: string[];
}

export interface BypassCandidate {
  /** Assumption the fix relies on */
  assumption: string;
  /** How an attacker could bypass it */
  bypassStrategy: string;
  /** Confidence 0-100 */
  confidence: number;
  /** Suggested verification (e.g. PoC snippet) */
  verificationHint?: string;
}

export interface BypassHuntResult {
  commit: FixCommit;
  diff: string;
  bypassCandidates: BypassCandidate[];
  rawLLMResponse?: string;
}

/**
 * Find commits that mention a CVE ID
 */
export async function findFixCommits(
  workspaceRoot: string,
  cveId: string
): Promise<FixCommit[]> {
  const normalized = cveId.toUpperCase().trim();
  if (!/^CVE-\d{4}-\d{4,}$/.test(normalized)) {
    return [];
  }

  const gitDir = path.join(workspaceRoot, '.git');
  if (!fs.existsSync(gitDir)) {
    return [];
  }

  const commits: FixCommit[] = [];

  try {
    // Search commit messages for CVE ID
    const { stdout } = await execAsync(
      `git log --all -i -S "${normalized}" --oneline --format="%H%n%s%n%b%n---"`,
      { cwd: workspaceRoot, timeout: GIT_TIMEOUT_MS, maxBuffer: 1024 * 1024 }
    );

    const blocks = stdout.split('\n---\n').filter((b) => b.trim());
    for (const block of blocks.slice(0, 10)) {
      const lines = block.trim().split('\n');
      const sha = lines[0]?.trim().slice(0, 40);
      const subject = lines[1]?.trim() || '';
      const body = lines.slice(2).join('\n').trim() || undefined;

      if (!sha) continue;

      try {
        const { stdout: filesOut } = await execAsync(
          `git show --name-only --format="" ${sha}`,
          { cwd: workspaceRoot, timeout: 5000, maxBuffer: 64 * 1024 }
        );
        const files = filesOut
          .split('\n')
          .map((f) => f.trim())
          .filter(Boolean);

        commits.push({
          sha,
          subject,
          body,
          files,
        });
      } catch {
        commits.push({ sha, subject, body, files: [] });
      }
    }
  } catch (e) {
    console.warn('findFixCommits failed:', e);
  }

  return commits;
}

/**
 * Get full diff for a commit
 */
export async function getCommitDiff(
  workspaceRoot: string,
  commitSha: string
): Promise<string> {
  try {
    const { stdout } = await execAsync(`git show ${commitSha} --no-color`, {
      cwd: workspaceRoot,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 512 * 1024,
    });
    return stdout;
  } catch {
    return '';
  }
}

/**
 * Build prompt for LLM to analyze patch for bypasses
 */
export function buildBypassHuntPrompt(commit: FixCommit, diff: string): string {
  return `You are a red team operator. A developer fixed a vulnerability with this commit. Your job is to find bypasses.

COMMIT: ${commit.sha}
SUBJECT: ${commit.subject}
FILES CHANGED: ${commit.files.join(', ')}

PATCH/DIFF:
\`\`\`
${diff.slice(0, 8000)}
\`\`\`

ATTACKER MODEL: Remote unauthenticated attacker. HTTP/input only.

Analyze the patch. Answer:
1. What assumptions does the fix rely on? (e.g. "input is always from X", "Y is validated elsewhere")
2. Can an attacker bypass it? How?
3. What would a proof-of-concept look like?

Output JSON only:
{
  "assumptions": ["assumption 1", "assumption 2"],
  "bypassCandidates": [
    {
      "assumption": "the fix assumes X",
      "bypassStrategy": "attacker could do Y",
      "confidence": 75,
      "verificationHint": "PoC: ..."
    }
  ]
}

If no plausible bypass, return bypassCandidates: [] but still list assumptions.`;
}

/**
 * Parse LLM response into BypassCandidate[]
 */
export function parseBypassCandidatesFromLLM(
  llmResponse: string,
  commit: FixCommit,
  diff: string
): BypassHuntResult {
  const result: BypassHuntResult = {
    commit,
    diff,
    bypassCandidates: [],
    rawLLMResponse: llmResponse,
  };

  try {
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return result;

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const candidates = parsed.bypassCandidates;

    if (!Array.isArray(candidates)) return result;

    for (const c of candidates) {
      if (!c || typeof c !== 'object') continue;
      const assumption = String((c as any).assumption || '');
      const bypassStrategy = String((c as any).bypassStrategy || '');
      const confidence = Math.min(100, Math.max(0, Number((c as any).confidence) || 50));
      const verificationHint = (c as any).verificationHint
        ? String((c as any).verificationHint)
        : undefined;

      if (assumption || bypassStrategy) {
        result.bypassCandidates.push({
          assumption,
          bypassStrategy,
          confidence,
          verificationHint,
        });
      }
    }
  } catch {
    /* ignore parse errors */
  }

  return result;
}
