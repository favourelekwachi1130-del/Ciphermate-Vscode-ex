/**
 * Run the Open SWE–style Python engine for code generation/fixing.
 *
 * Spawns: python -m open_swe_engine.run --workspace <path> --task "<task>"
 * Uses OPENROUTER_API_KEY or OpenRouter API key from settings.
 * See: open_swe_engine/ in repo (ported from https://github.com/langchain-ai/open-swe)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

const MODULE_NAME = 'open_swe_engine.run';

export interface OpenSWERunOptions {
  workspacePath: string;
  task: string;
  agentsMd?: string;
  apiKey?: string;
  pythonPath?: string;
  enginePath?: string;
}

/**
 * Run the Open SWE engine and return the final answer string.
 * On failure (no Python, module not found, non-zero exit), returns null and logs.
 */
export async function runOpenSWEEngine(options: OpenSWERunOptions): Promise<string | null> {
  const {
    workspacePath,
    task,
    agentsMd = '',
    apiKey,
    pythonPath = 'python',
    enginePath,
  } = options;

  const config = vscode.workspace.getConfiguration('ciphermate');
  const useEngine = config.get<boolean>('codeAgent.useOpenSWEEngine', false);
  if (!useEngine) return null;

  const py = config.get<string>('codeAgent.pythonPath', pythonPath) || pythonPath;
  const engineDir = enginePath || config.get<string>('codeAgent.openSWEEnginePath', '');
  const key =
    apiKey ||
    config.get<string>('ai.openrouter.apiKey', '') ||
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENAI_API_KEY;

  if (!key) {
    console.warn('Open SWE engine: no API key (set ai.openrouter.apiKey or OPENROUTER_API_KEY)');
    return null;
  }

  const args = [
    '-m',
    MODULE_NAME,
    '--workspace',
    workspacePath,
    '--task',
    task,
  ];
  if (agentsMd) {
    args.push('--agents-md', agentsMd);
  }

  const env = { ...process.env, OPENROUTER_API_KEY: key, OPENAI_API_KEY: key };

  return new Promise<string | null>((resolve) => {
    const cwd = engineDir
      ? path.resolve(engineDir)
      : path.resolve(__dirname, '../../open_swe_engine');
    if (!engineDir && !fs.existsSync(path.join(cwd, 'open_swe_engine', 'run.py'))) {
      console.warn('Open SWE engine: open_swe_engine package not found at', cwd);
      resolve(null);
      return;
    }

    const proc = spawn(py, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('error', (err) => {
      console.warn('Open SWE engine spawn error:', err);
      resolve(null);
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.warn('Open SWE engine exit', code, stderr || stdout);
        resolve(null);
        return;
      }
      resolve(stdout.trim() || null);
    });
  });
}

/**
 * Load AGENTS.md from workspace root if present.
 */
export function loadAgentsMd(workspacePath: string): string {
  const p = path.join(workspacePath, 'AGENTS.md');
  try {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf-8');
    }
  } catch {
    // ignore
  }
  return '';
}
