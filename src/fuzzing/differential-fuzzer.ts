/**
 * Differential Fuzzer — Devansh Methodology
 *
 * "Compare behavior before/after code changes to find regressions."
 *
 * Run fuzzer (grammar-based or custom) on two versions of the code:
 * - Version A: before change (e.g. main branch)
 * - Version B: after change (e.g. feature branch)
 *
 * Compare:
 * 1. Crashes: does B crash on inputs that A handled?
 * 2. Behavior: does B return different responses for same input?
 * 3. Security: does B accept inputs that A rejected?
 *
 * In a VS Code extension we typically don't run two app instances;
 * we compare by running the same harness against two code states (git checkout).
 * For full differential fuzzing, user would run this in CI with two builds.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { generatePayloads, FuzzResult } from './grammar-fuzzer';

const execAsync = promisify(exec);
const GIT_TIMEOUT_MS = 30_000;
const MAX_PAYLOADS_PER_RUN = 5;

export interface DifferentialResult {
  payload: string;
  mutation?: string;
  /** Response from version A (before) */
  responseA: string;
  /** Response from version B (after) */
  responseB: string;
  /** Whether A and B differ */
  differs: boolean;
  /** If differs: potential regression type */
  regressionType?: 'crash' | 'behavior_change' | 'security_relaxed';
}

export interface DifferentialFuzzOptions {
  /** Git ref for "before" (e.g. main, HEAD~1) */
  refBefore: string;
  /** Git ref for "after" (e.g. HEAD, feature-branch) */
  refAfter: string;
  /** Number of payloads per grammar */
  payloadsPerGrammar?: number;
  /** Grammars to use */
  grammars?: Array<'sql' | 'jwt' | 'json' | 'http'>;
  /** How to run the target (e.g. "npm run dev" - must accept stdin or HTTP) */
  runCommand?: string;
  /** Port if HTTP target */
  port?: number;
}

/**
 * Run a single payload against the app and capture response.
 * Assumes app is already running or we spawn it.
 */
async function runPayloadAgainstApp(
  workspaceRoot: string,
  payload: FuzzResult,
  options: { runCommand?: string; port?: number }
): Promise<string> {
  const port = options.port ?? 3000;

  if (payload.grammar === 'http') {
    // Parse HTTP request from payload and curl it
    const urlMatch = payload.payload.match(/(?:GET|POST|PUT|DELETE|PATCH)\s+(\S+)/);
    const pathPart = urlMatch ? urlMatch[1].split(' ')[0] : '/';
    const url = `http://localhost:${port}${pathPart}`;

    try {
      const { stdout, stderr } = await execAsync(
        `curl -s -o /dev/null -w "%{http_code}" "${url.replace(/"/g, '\\"')}"`,
        { timeout: 5000, maxBuffer: 1024 }
      );
      return (stdout + stderr).trim().slice(0, 500);
    } catch (e) {
      return `ERROR: ${(e as Error).message}`;
    }
  }

  // For non-HTTP, we'd need a harness that feeds stdin. Placeholder.
  return `(non-HTTP payload, manual harness needed)`;
}

/**
 * Get current git ref
 */
async function getCurrentRef(workspaceRoot: string): Promise<string> {
  try {
    const { stdout } = await execAsync('git rev-parse HEAD', {
      cwd: workspaceRoot,
      timeout: 5000,
    });
    return stdout.trim().slice(0, 40);
  } catch {
    return '';
  }
}

/**
 * Checkout a ref, run callback, then restore. Returns callback result.
 */
async function withGitRef<T>(
  workspaceRoot: string,
  ref: string,
  fn: () => Promise<T>
): Promise<T> {
  const gitDir = path.join(workspaceRoot, '.git');
  if (!fs.existsSync(gitDir)) {
    throw new Error('Not a git repository');
  }

  const original = await getCurrentRef(workspaceRoot);

  try {
    await execAsync(`git checkout ${ref}`, {
      cwd: workspaceRoot,
      timeout: GIT_TIMEOUT_MS,
    });
    return await fn();
  } finally {
    await execAsync(`git checkout ${original}`, {
      cwd: workspaceRoot,
      timeout: GIT_TIMEOUT_MS,
    }).catch(() => {});
  }
}

/**
 * Run differential fuzzing: compare responses for same payloads on two refs.
 *
 * NOTE: This requires the target app to be runnable and the same run command
 * to work for both refs. In practice, the user may need to:
 * 1. Build and run version A, capture responses for each payload
 * 2. Build and run version B, capture responses for each payload
 * 3. Compare
 *
 * This implementation uses git checkout + single run. For CI, you'd typically
 * build two Docker images and run payloads against each.
 */
export async function runDifferentialFuzz(
  workspaceRoot: string,
  options: DifferentialFuzzOptions
): Promise<DifferentialResult[]> {
  const root = workspaceRoot?.trim();
  if (!root || !fs.existsSync(root)) {
    return [];
  }
  const gitDir = path.join(root, '.git');
  if (!fs.existsSync(gitDir)) {
    return [];
  }

  const payloadsPerGrammar = Math.min(options.payloadsPerGrammar ?? 5, MAX_PAYLOADS_PER_RUN);
  const grammars = options.grammars ?? ['sql', 'http'];
  const payloads = generatePayloads(grammars, payloadsPerGrammar * grammars.length);

  const results: DifferentialResult[] = [];

  for (const p of payloads) {
    let responseA: string;
    let responseB: string;

    try {
      responseA = await withGitRef(workspaceRoot, options.refBefore, () =>
        runPayloadAgainstApp(workspaceRoot, p, {
          runCommand: options.runCommand,
          port: options.port,
        })
      );
    } catch (e) {
      responseA = `CHECKOUT_ERROR: ${(e as Error).message}`;
    }

    try {
      responseB = await withGitRef(workspaceRoot, options.refAfter, () =>
        runPayloadAgainstApp(workspaceRoot, p, {
          runCommand: options.runCommand,
          port: options.port,
        })
      );
    } catch (e) {
      responseB = `CHECKOUT_ERROR: ${(e as Error).message}`;
    }

    const differs = responseA !== responseB;
    let regressionType: DifferentialResult['regressionType'];

    if (differs) {
      if (responseB.includes('ERROR') || responseB.includes('crash')) {
        regressionType = 'crash';
      } else if (responseA.includes('403') || responseA.includes('400')) {
        if (!responseB.includes('403') && !responseB.includes('400')) {
          regressionType = 'security_relaxed';
        } else {
          regressionType = 'behavior_change';
        }
      } else {
        regressionType = 'behavior_change';
      }
    }

    results.push({
      payload: p.payload.slice(0, 200),
      mutation: p.mutation,
      responseA,
      responseB,
      differs,
      regressionType,
    });
  }

  return results;
}
