/**
 * Entry-Point & Trust-Boundary Discovery — Devansh Methodology
 *
 * "Identify entry points: HTTP routes, RPC handlers, message consumers,
 * CLI entrypoints, scheduled jobs. Identify trust boundaries."
 *
 * Static extraction from source (no runtime required).
 * Feeds into slice-based audits and threat modeling.
 */

import * as fs from 'fs';
import * as path from 'path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__', 'vendor', '.next', '.nuxt', 'coverage']);
const MAX_FILES = 2000;
const REQUEST_TIMEOUT_MS = 5000;

export interface EntryPoint {
  type: 'http_route' | 'rpc_handler' | 'message_consumer' | 'cli' | 'scheduled_job';
  file: string;
  line?: number;
  /** e.g. GET /api/users */
  signature?: string;
  /** Framework detected */
  framework?: string;
  /** Raw match for context */
  raw?: string;
}

export interface TrustBoundary {
  type: 'browser_to_server' | 'service_to_service' | 'plugin_to_host' | 'sandbox_to_privileged';
  description: string;
  files?: string[];
}

export interface DiscoveryResult {
  entryPoints: EntryPoint[];
  trustBoundaries: TrustBoundary[];
  frameworks: string[];
  totalFilesScanned: number;
}

// ─── HTTP Route Patterns (Express, Fastify, Hono, Elysia, Koa, Django, Flask) ───

const HTTP_PATTERNS: Array<{
  framework: string;
  regex: RegExp;
  captureMethod: number;
  capturePath: number;
}> = [
  // Express: app.get('/path', ...), router.post('/path', ...)
  { framework: 'express', regex: /\.(get|post|put|delete|patch|all)\s*\(\s*['"`]([^'"`]+)['"`]/g, captureMethod: 1, capturePath: 2 },
  // Fastify: fastify.get('/path', ...)
  { framework: 'fastify', regex: /(?:fastify|app)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g, captureMethod: 1, capturePath: 2 },
  // Hono: app.get('/path', ...), hono.get(...)
  { framework: 'hono', regex: /(?:hono|app)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g, captureMethod: 1, capturePath: 2 },
  // Elysia: app.get('/path', ...), Elysia().get('/path', ...)
  { framework: 'elysia', regex: /\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g, captureMethod: 1, capturePath: 2 },
  // Koa: router.get('/path', ...)
  { framework: 'koa', regex: /\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g, captureMethod: 1, capturePath: 2 },
  // Django: path('url/', view), url(r'^...', view)
  { framework: 'django', regex: /(?:path|url|re_path)\s*\(\s*['"`]([^'"`]+)['"`]/g, captureMethod: 0, capturePath: 1 },
  // Flask: @app.route('/path', methods=['GET'])
  { framework: 'flask', regex: /@\w+\.route\s*\(\s*['"`]([^'"`]+)['"`]/g, captureMethod: 0, capturePath: 1 },
  // NestJS: @Get(), @Post('path')
  { framework: 'nestjs', regex: /@(Get|Post|Put|Delete|Patch)\s*\(\s*['"`]?([^'"`)]*)['"`]?\s*\)/g, captureMethod: 1, capturePath: 2 },
  // Next.js API routes: file-based, we detect from path
];

// ─── RPC / Message Consumer Patterns ───

const RPC_PATTERNS: Array<{ type: 'rpc' | 'message'; regex: RegExp; framework: string }> = [
  { type: 'rpc', regex: /\.(handle|register|define)\s*\(\s*['"`](\w+)['"`]/g, framework: 'trpc' },
  { type: 'rpc', regex: /addService\s*\(\s*\w+Service/g, framework: 'grpc' },
  { type: 'rpc', regex: /\.(call|notify)\s*\(\s*['"`][^'"`]+['"`]/g, framework: 'json-rpc' },
  { type: 'message', regex: /\.(subscribe|consume|on)\s*\(\s*['"`][^'"`]+['"`]/g, framework: 'kafka' },
  { type: 'message', regex: /\.(assertQueue|consume)\s*\(\s*['"`]?[^'"`)]+['"`]?/g, framework: 'amqp' },
  { type: 'message', regex: /ReceiveMessage|SendMessage|SQS/g, framework: 'sqs' },
];

// ─── CLI / Scheduled Job Patterns ───

const CLI_PATTERNS: Array<{ regex: RegExp; type: 'cli' | 'scheduled_job' }> = [
  { regex: new RegExp('#!\\/usr\\/bin\\/env\\s+(?:node|python|ts-node)'), type: 'cli' },
  { regex: /commander\.|yargs\.|argparse\.|click\.|typer\./g, type: 'cli' },
  { regex: /\.command\s*\(\s*['"`]/g, type: 'cli' },
  { regex: /cron\.schedule|cron\.scheduleJob|node-schedule|node_cron/g, type: 'scheduled_job' },
  { regex: /setInterval|setTimeout.*\d{4,}/g, type: 'scheduled_job' },
  { regex: /celery\.beat|CeleryBeat|@periodic_task|@celery\.task/g, type: 'scheduled_job' },
  { regex: /schedule\.|@scheduled|@Scheduled|cron\(/g, type: 'scheduled_job' },
];

function* walkFiles(root: string, extFilter?: RegExp): Generator<string> {
  let count = 0;
  function* walk(dir: string): Generator<string> {
    if (count >= MAX_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (count >= MAX_FILES) return;
      const full = path.join(dir, e.name);
      const rel = path.relative(root, full);
      if (rel.startsWith('..')) continue;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) yield* walk(full);
        continue;
      }
      if (extFilter && !extFilter.test(e.name)) continue;
      count++;
      yield full;
    }
  }
  yield* walk(root);
}

function detectFrameworkFromFile(filePath: string, content: string): string[] {
  const frameworks: string[] = [];
  const lower = content.toLowerCase();
  if (lower.includes('express') || lower.includes("require('express')") || lower.includes('from \'express\'')) frameworks.push('express');
  if (lower.includes('fastify')) frameworks.push('fastify');
  if (lower.includes('hono')) frameworks.push('hono');
  if (lower.includes('elysia')) frameworks.push('elysia');
  if (lower.includes('koa')) frameworks.push('koa');
  if (lower.includes('@nestjs')) frameworks.push('nestjs');
  if (lower.includes('django') || lower.includes('from django')) frameworks.push('django');
  if (lower.includes('flask') || lower.includes('from flask')) frameworks.push('flask');
  if (lower.includes('@trpc') || lower.includes('trpc')) frameworks.push('trpc');
  if (lower.includes('@grpc') || lower.includes('grpc')) frameworks.push('grpc');
  if (lower.includes('kafka') || lower.includes('kafkajs')) frameworks.push('kafka');
  if (lower.includes('amqp') || lower.includes('amqplib')) frameworks.push('amqp');
  if (lower.includes('celery')) frameworks.push('celery');
  return frameworks;
}

/**
 * Discover HTTP routes from source
 */
function discoverHttpRoutes(filePath: string, content: string, relPath: string): EntryPoint[] {
  const entries: EntryPoint[] = [];
  const frameworks = detectFrameworkFromFile(filePath, content);

  // Next.js API routes: file path indicates route
  if (relPath.match(/\/api\/[^/]+\/route\.(ts|tsx|js|jsx)$/) || relPath.match(/pages\/api\/[^/]+\.(ts|tsx|js|jsx)$/)) {
    const routePath = relPath
      .replace(/\/route\.(ts|tsx|js|jsx)$/, '')
      .replace(/pages\/api/, '/api')
      .replace(/\/api/, '')
      .replace(/\//g, '/');
    entries.push({
      type: 'http_route',
      file: relPath,
      signature: `* ${routePath || '/'}`,
      framework: 'nextjs',
    });
  }

  for (const { framework, regex, captureMethod, capturePath } of HTTP_PATTERNS) {
    const frameworkMatches = frameworks.length === 0 || frameworks.includes(framework) ||
      (framework === 'express' && frameworks.some((f) => ['express', 'fastify', 'hono', 'elysia', 'koa', 'nestjs'].includes(f)));
    if (!frameworkMatches) continue;

    const re = new RegExp(regex.source, regex.flags.replace('g', ''));
    let m: RegExpExecArray | null;
    const contentNoComments = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    while ((m = re.exec(contentNoComments)) !== null) {
      const method = captureMethod > 0 ? (m[captureMethod] || 'GET').toUpperCase() : 'GET';
      const routePath = m[capturePath] || '/';
      entries.push({
        type: 'http_route',
        file: relPath,
        line: content.slice(0, m.index).split('\n').length,
        signature: `${method} ${routePath}`,
        framework,
        raw: m[0].slice(0, 80),
      });
    }
  }

  return entries;
}

/**
 * Discover RPC handlers and message consumers
 */
function discoverRpcAndMessages(filePath: string, content: string, relPath: string): EntryPoint[] {
  const entries: EntryPoint[] = [];

  for (const { type, regex, framework } of RPC_PATTERNS) {
    const re = new RegExp(regex.source, regex.flags);
    if (re.test(content)) {
      entries.push({
        type: type === 'rpc' ? 'rpc_handler' : 'message_consumer',
        file: relPath,
        signature: framework,
        framework,
      });
    }
  }

  return entries;
}

/**
 * Discover CLI entrypoints and scheduled jobs
 */
function discoverCliAndScheduled(filePath: string, content: string, relPath: string): EntryPoint[] {
  const entries: EntryPoint[] = [];

  for (const { regex, type } of CLI_PATTERNS) {
    const re = new RegExp(regex.source, regex.flags);
    if (re.test(content)) {
      entries.push({
        type,
        file: relPath,
        signature: type,
      });
    }
  }

  // bin/, cli/, scripts/ with shebang
  if (/^(bin|cli|scripts)\//.test(relPath) && /^#!/.test(content)) {
    entries.push({ type: 'cli', file: relPath, signature: 'shebang' });
  }

  return entries;
}

/**
 * Infer trust boundaries from architecture
 */
function inferTrustBoundaries(entryPoints: EntryPoint[], frameworks: string[]): TrustBoundary[] {
  const boundaries: TrustBoundary[] = [];

  const hasHttp = entryPoints.some((e) => e.type === 'http_route');
  if (hasHttp) {
    boundaries.push({
      type: 'browser_to_server',
      description: 'HTTP routes accept untrusted input from clients',
      files: entryPoints.filter((e) => e.type === 'http_route').map((e) => e.file),
    });
  }

  const hasRpc = entryPoints.some((e) => e.type === 'rpc_handler');
  if (hasRpc) {
    boundaries.push({
      type: 'service_to_service',
      description: 'RPC handlers may receive requests from other services',
      files: entryPoints.filter((e) => e.type === 'rpc_handler').map((e) => e.file),
    });
  }

  const hasMessages = entryPoints.some((e) => e.type === 'message_consumer');
  if (hasMessages) {
    boundaries.push({
      type: 'service_to_service',
      description: 'Message consumers process data from queues (Kafka, etc.)',
      files: entryPoints.filter((e) => e.type === 'message_consumer').map((e) => e.file),
    });
  }

  return boundaries;
}

/**
 * Main: discover all entry points and trust boundaries in workspace
 */
export function discoverEntryPoints(workspaceRoot: string): DiscoveryResult {
  const entryPoints: EntryPoint[] = [];
  const allFrameworks = new Set<string>();
  let totalFilesScanned = 0;

  const extFilter = /\.(ts|tsx|js|jsx|py|mjs|cjs|go|rb|java|kt)$/;

  for (const fullPath of walkFiles(workspaceRoot, extFilter)) {
    totalFilesScanned++;
    const relPath = path.relative(workspaceRoot, fullPath);
    let content: string;
    try {
      content = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }

    const httpEntries = discoverHttpRoutes(fullPath, content, relPath);
    const rpcEntries = discoverRpcAndMessages(fullPath, content, relPath);
    const cliEntries = discoverCliAndScheduled(fullPath, content, relPath);

    entryPoints.push(...httpEntries, ...rpcEntries, ...cliEntries);

    for (const e of [...httpEntries, ...rpcEntries]) {
      if (e.framework) allFrameworks.add(e.framework);
    }
  }

  const trustBoundaries = inferTrustBoundaries(entryPoints, Array.from(allFrameworks));

  return {
    entryPoints,
    trustBoundaries,
    frameworks: Array.from(allFrameworks),
    totalFilesScanned,
  };
}
