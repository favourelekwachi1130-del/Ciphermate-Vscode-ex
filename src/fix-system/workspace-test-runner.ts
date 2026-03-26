/**
 * Workspace Test Runner — optional test run for fix verification
 *
 * Detects test command from package.json / pytest / composer and runs it
 * in the workspace. Output is passed to the fix verifier so the model knows
 * "current tests pass; ensure your fix doesn't break them."
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const DEFAULT_TIMEOUT_MS = 60_000;

export interface TestRunResult {
  ran: boolean;
  success: boolean;
  command: string;
  output: string;
  error?: string;
  durationMs: number;
}

/**
 * Detect test command for the workspace. Prefer package.json "test" script,
 * then pytest, then composer test.
 */
export function detectTestCommand(workspaceRoot: string): { command: string; cwd: string } | null {
  const pkgPath = path.join(workspaceRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const script = pkg.scripts?.test;
      if (typeof script === 'string' && script.trim()) {
        return { command: 'npm test', cwd: workspaceRoot };
      }
    } catch { /* ignore */ }
  }

  const reqPath = path.join(workspaceRoot, 'requirements.txt');
  const pyTestInReq = reqPath && fs.existsSync(reqPath)
    ? fs.readFileSync(reqPath, 'utf8').toLowerCase().includes('pytest')
    : false;
  if (pyTestInReq || fs.existsSync(path.join(workspaceRoot, 'pytest.ini')) || fs.existsSync(path.join(workspaceRoot, 'pyproject.toml'))) {
    return { command: 'pytest -q --tb=short 2>&1', cwd: workspaceRoot };
  }

  const composerPath = path.join(workspaceRoot, 'composer.json');
  if (fs.existsSync(composerPath)) {
    try {
      const composer = JSON.parse(fs.readFileSync(composerPath, 'utf8'));
      if (composer.scripts?.test) {
        return { command: 'composer test', cwd: workspaceRoot };
      }
    } catch { /* ignore */ }
  }

  return null;
}

/**
 * Run the detected test command in the workspace. Safe: no arbitrary code,
 * only known test runners. Timeout and output capped.
 */
export async function runWorkspaceTests(
  workspaceRoot: string,
  options?: { timeoutMs?: number; maxOutputChars?: number }
): Promise<TestRunResult> {
  const start = Date.now();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputChars = options?.maxOutputChars ?? 8000;

  const detected = detectTestCommand(workspaceRoot);
  if (!detected) {
    return {
      ran: false,
      success: false,
      command: '',
      output: '',
      durationMs: Date.now() - start,
    };
  }

  try {
    const { stdout, stderr } = await execAsync(detected.command, {
      cwd: detected.cwd,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    });
    const out = [stdout, stderr].filter(Boolean).join('\n').trim();
    const truncated = out.length > maxOutputChars ? out.slice(0, maxOutputChars) + '\n... (truncated)' : out;
    return {
      ran: true,
      success: true,
      command: detected.command,
      output: truncated,
      durationMs: Date.now() - start,
    };
  } catch (err: unknown) {
    const errObj = err as { stdout?: string; stderr?: string; message?: string; killed?: boolean };
    const out = [errObj.stdout, errObj.stderr, errObj.message].filter(Boolean).join('\n').trim();
    const truncated = out.length > maxOutputChars ? out.slice(0, maxOutputChars) + '\n... (truncated)' : out;
    return {
      ran: true,
      success: false,
      command: detected.command,
      output: truncated,
      error: errObj.message,
      durationMs: Date.now() - start,
    };
  }
}
