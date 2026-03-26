/**
 * Mastra Tool: GraphRAG Query
 *
 * Option 3 (default): Bundled GraphRAG — loads graph from .graphrag/graph.json, no Python.
 * Option 1/2: CLI or API when ciphermate.graphrag.useBundled is false.
 */

import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import { loadGraph, queryGraph } from '../../engine/graphrag-bundled';

let createTool: any = null;
let z: any = null;

try {
  const mastraTools = require('@mastra/core/tools');
  createTool = mastraTools.createTool;
  z = require('zod').z;
} catch {
  // Mastra not available
}

export interface GraphRAGToolConfig {
  enabled: boolean;
  useBundled: boolean;
  cliPath?: string;
  apiUrl?: string;
  indexPath?: string;
}

function getConfig(): GraphRAGToolConfig {
  const config = vscode.workspace.getConfiguration('ciphermate');
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const workspacePath = workspaceFolders?.[0]?.uri.fsPath;
  const indexPath = workspacePath ? path.join(workspacePath, '.graphrag') : undefined;
  return {
    enabled: config.get<boolean>('graphrag.enabled', false),
    useBundled: config.get<boolean>('graphrag.useBundled', true),
    cliPath: config.get<string>('graphrag.cliPath', 'graphrag'),
    apiUrl: config.get<string>('graphrag.apiUrl', '') || undefined,
    indexPath,
  };
}

function getWorkspacePath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/**
 * Run GraphRAG query via CLI (e.g. graphrag query "question" or python -m graphrag query).
 */
async function queryViaCli(question: string, workspacePath: string, cfg: GraphRAGToolConfig): Promise<string> {
  const cliPath = cfg.cliPath || 'graphrag';
  const indexDir = cfg.indexPath || path.join(workspacePath, '.graphrag');
  return new Promise((resolve, reject) => {
    const args = ['query', '--query', question, '--index-path', indexDir];
    const child = spawn(cliPath, args, {
      cwd: workspacePath,
      shell: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk; });
    child.stderr?.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (err) => {
      reject(new Error(`GraphRAG CLI failed: ${err.message}. Is GraphRAG installed? Try: pip install graphrag`));
    });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`GraphRAG exited ${code}: ${stderr || stdout}`));
      } else {
        resolve(stdout || 'No output from GraphRAG.');
      }
    });
  });
}

/**
 * Run GraphRAG query via HTTP API (local service).
 */
async function queryViaApi(question: string, apiUrl: string): Promise<string> {
  const url = apiUrl.replace(/\/$/, '') + '/query';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: question }),
  });
  if (!res.ok) {
    throw new Error(`GraphRAG API error: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { answer?: string; summary?: string; text?: string };
  return data.answer ?? data.summary ?? data.text ?? JSON.stringify(data);
}

/**
 * Create the GraphRAG query tool. Use from security-agent with extension context;
 * only register when ciphermate.graphrag.enabled is true.
 */
export function createGraphRAGQueryTool(): any {
  if (!createTool || !z) return null;

  return createTool({
    id: 'graphrag-query',
    description: `Query the codebase knowledge graph for repo-wide summaries, "where else" questions, and entity relationships. Use when the user asks about overall security posture, where a pattern is used, or to summarize findings across the repo. Do not use for single-file or single-scan questions.`,
    inputSchema: z.object({
      question: z.string().describe('Natural language question to answer using the knowledge graph'),
      scope: z.enum(['global', 'local']).optional().describe('Query scope: global for repo-wide summary, local for specific entities'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      answer: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ inputData }: { inputData: { question: string; scope?: string } }) => {
      const cfg = getConfig();
      if (!cfg.enabled) {
        return {
          success: false,
          error: 'GraphRAG is disabled. Enable with ciphermate.graphrag.enabled or use scan-repository for findings.',
        };
      }
      const workspacePath = getWorkspacePath();
      if (!workspacePath) {
        return { success: false, error: 'No workspace folder open.' };
      }
      const question = inputData.question?.trim() || 'Summarize the main security-related findings in this codebase.';
      const scope = (inputData.scope === 'local' || inputData.scope === 'global') ? inputData.scope : 'global';

      try {
        if (cfg.useBundled) {
          const graphPath = path.join(workspacePath, '.graphrag', 'graph.json');
          const graph = loadGraph(graphPath);
          if (!graph) {
            return {
              success: false,
              error: 'No bundled graph found. Run **CipherMate: Index workspace for GraphRAG** first (with ciphermate.graphrag.useBundled enabled).',
            };
          }
          const answer = queryGraph(graph, question, scope);
          return { success: true, answer };
        }
        if (cfg.apiUrl) {
          const answer = await queryViaApi(question, cfg.apiUrl);
          return { success: true, answer };
        }
        const answer = await queryViaCli(question, workspacePath, cfg);
        return { success: true, answer };
      } catch (err: any) {
        const message = err?.message || String(err);
        return {
          success: false,
          error: `GraphRAG query failed: ${message}. Run "Index workspace for GraphRAG" or (if useBundled is false) ensure GraphRAG CLI is installed (pip install graphrag).`,
        };
      }
    },
  });
}
