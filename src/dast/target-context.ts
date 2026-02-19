/**
 * Target Context Engine - Context-Aware DAST
 *
 * Gathers intelligence from:
 * - HTTP responses (headers, body signatures)
 * - Workspace (package.json, requirements.txt, OpenAPI, code)
 *
 * Builds a target profile so AI can select highly effective attacks.
 */

import * as path from 'path';
import * as fs from 'fs';
import { httpRequest } from './http-client';
import { DastAuth } from './types';

export interface TargetProfile {
  /** Detected backend frameworks */
  frameworks: string[];
  /** Detected database (from errors, headers) */
  database?: string;
  /** Detected language/runtime */
  language?: string;
  /** Has GraphQL? */
  hasGraphql: boolean;
  /** Uses JWT/auth? */
  hasJwt: boolean;
  /** API style: rest, graphql, grpc */
  apiStyle: string[];
  /** Sensitive param names from OpenAPI/code */
  paramHints: string[];
  /** Stack summary for AI */
  stackSummary: string;
  /** Raw probe responses for AI context */
  probeSamples: Array<{ url: string; status: number; headers: string; bodySnippet: string }>;
  /** Workspace deps (package.json, etc.) */
  workspaceDeps: Record<string, string[]>;
  /** OpenAPI schema summary if found */
  openApiSummary?: string;
}

const FRAMEWORK_SIGNATURES: Array<{ pattern: RegExp | string; name: string }> = [
  { pattern: /express|connect/i, name: 'Express' },
  { pattern: /fastify/i, name: 'Fastify' },
  { pattern: /nest|nestjs/i, name: 'NestJS' },
  { pattern: /django|csrfmiddleware|__admin__/i, name: 'Django' },
  { pattern: /flask|werkzeug/i, name: 'Flask' },
  { pattern: /laravel|illuminate/i, name: 'Laravel' },
  { pattern: /symfony/i, name: 'Symfony' },
  { pattern: /rails|ruby/i, name: 'Rails' },
  { pattern: /spring|java\.lang/i, name: 'Spring' },
  { pattern: /asp\.net|microsoft/i, name: 'ASP.NET' },
  { pattern: /gin|echo|fiber/i, name: 'Go' },
  { pattern: /x-powered-by:\s*(\w+)/i, name: 'X-Powered-By' },
];

const DB_SIGNATURES: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /mysql|mysqli|mariadb/i, name: 'MySQL' },
  { pattern: /postgresql|pg_|postgres/i, name: 'PostgreSQL' },
  { pattern: /sqlite/i, name: 'SQLite' },
  { pattern: /mongodb|mongo|objectid/i, name: 'MongoDB' },
  { pattern: /redis/i, name: 'Redis' },
  { pattern: /mssql|sql server|oledb/i, name: 'MSSQL' },
  { pattern: /oracle|ora-/i, name: 'Oracle' },
];

export async function buildTargetContext(
  targetUrl: string,
  workspacePath: string | undefined,
  auth?: DastAuth,
  timeout = 8000
): Promise<TargetProfile> {
  const frameworks: string[] = [];
  let database: string | undefined;
  let language: string | undefined;
  let hasGraphql = false;
  let hasJwt = false;
  const apiStyle: string[] = ['rest'];
  const paramHints: string[] = [];
  const probeSamples: TargetProfile['probeSamples'] = [];
  const workspaceDeps: Record<string, string[]> = {};

  const base = targetUrl.replace(/\/$/, '');

  const probePaths = ['/', '/api', '/api/v1', '/graphql', '/api/graphql', '/health', '/status'];
  for (const p of probePaths.slice(0, 5)) {
    try {
      const url = base + p;
      const res = await httpRequest({ url, method: 'GET', auth, timeout });
      const headers = JSON.stringify(Object.fromEntries(
        Object.entries(res.headers).filter(([k]) => !k.includes('date') && !k.includes('content-length'))
      ));
      const bodySnippet = (res.body || '').slice(0, 1500);

      if (res.body) {
        const bl = res.body.toLowerCase();
        const hl = Object.keys(res.headers).join(' ').toLowerCase();
        const full = bl + ' ' + hl;

        for (const sig of FRAMEWORK_SIGNATURES) {
          const match = typeof sig.pattern === 'string'
            ? full.includes(sig.pattern)
            : sig.pattern.test(full);
          if (match && !frameworks.includes(sig.name)) frameworks.push(sig.name);
        }
        for (const db of DB_SIGNATURES) {
          if (db.pattern.test(full)) {
            database = db.name;
            break;
          }
        }
        if (/__schema|graphql|__typename|queryroot/i.test(bl)) hasGraphql = true;
        if (/bearer|jwt|token|authorization|oauth/i.test(hl)) hasJwt = true;
      }

      if (res.headers['content-type']?.includes('graphql') || p.includes('graphql')) {
        hasGraphql = true;
        if (!apiStyle.includes('graphql')) apiStyle.push('graphql');
      }

      probeSamples.push({
        url,
        status: res.status,
        headers,
        bodySnippet,
      });
    } catch { /* skip */ }
  }

  if (workspacePath) {
    const pkgPath = path.join(workspacePath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        workspaceDeps['node'] = Object.keys(deps || {});
        if (deps?.express) frameworks.push('Express');
        if (deps?.['@nestjs/core']) frameworks.push('NestJS');
        if (deps?.fastify) frameworks.push('Fastify');
        if (deps?.mongoose || deps?.mongodb) database = database || 'MongoDB';
        if (deps?.graphql) hasGraphql = true;
        if (deps?.jsonwebtoken || deps?.['passport-jwt']) hasJwt = true;
      } catch { /* ignore */ }
    }

    const reqPath = path.join(workspacePath, 'requirements.txt');
    if (fs.existsSync(reqPath)) {
      try {
        const content = fs.readFileSync(reqPath, 'utf8');
        workspaceDeps['python'] = content.split('\n').map(l => l.split(/[=<>]/)[0].trim()).filter(Boolean);
        if (content.includes('django')) frameworks.push('Django');
        if (content.includes('flask')) frameworks.push('Flask');
      } catch { /* ignore */ }
    }

    const composerPath = path.join(workspacePath, 'composer.json');
    if (fs.existsSync(composerPath)) {
      try {
        const c = JSON.parse(fs.readFileSync(composerPath, 'utf8'));
        workspaceDeps['php'] = Object.keys(c.require || {});
        if (c.require?.['laravel/framework']) frameworks.push('Laravel');
      } catch { /* ignore */ }
    }

    const openApiFiles = findOpenApiSpecs(workspacePath);
    for (const fp of openApiFiles.slice(0, 1)) {
      try {
        const content = fs.readFileSync(fp, 'utf8');
        const spec = content.startsWith('{') ? JSON.parse(content) : {};
        if (spec.paths) {
          for (const pathItem of Object.values(spec.paths as Record<string, any>) || []) {
            for (const op of Object.values(pathItem || {}) as any[]) {
              if (op?.parameters) {
                for (const pr of op.parameters) {
                  if (pr?.name && !paramHints.includes(pr.name)) paramHints.push(pr.name);
                }
              }
            }
          }
        }
      } catch { /* ignore */ }
    }
  }

  if (!paramHints.length) {
    paramHints.push('id', 'q', 'search', 'query', 'name', 'email', 'user', 'filter', 'sort', 'limit', 'offset');
  }

  const fw = [...new Set(frameworks)];
  const lang = fw.some(f => ['Django', 'Flask'].includes(f)) ? 'Python' :
    fw.some(f => ['Laravel', 'Symfony'].includes(f)) ? 'PHP' :
    fw.some(f => ['Express', 'NestJS', 'Fastify'].includes(f)) ? 'Node.js' :
    fw.some(f => ['Spring'].includes(f)) ? 'Java' : undefined;

  const stackSummary = [
    fw.length ? `Frameworks: ${fw.join(', ')}` : '',
    database ? `DB: ${database}` : '',
    lang ? `Language: ${lang}` : '',
    hasGraphql ? 'GraphQL: yes' : '',
    hasJwt ? 'JWT/Auth: yes' : '',
    apiStyle.join(', '),
  ].filter(Boolean).join('. ');

  return {
    frameworks: fw,
    database,
    language: lang,
    hasGraphql,
    hasJwt,
    apiStyle: [...new Set(apiStyle)],
    paramHints,
    stackSummary: stackSummary || 'Unknown stack',
    probeSamples,
    workspaceDeps,
  };
}

function findOpenApiSpecs(workspacePath: string): string[] {
  const found: string[] = [];
  function walk(dir: string, depth: number) {
    if (depth > 3) return;
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') walk(full, depth + 1);
        else if (/(openapi|swagger|api-spec)\.(json|yaml|yml)$/i.test(e.name)) found.push(full);
      }
    } catch { /* ignore */ }
  }
  walk(workspacePath, 0);
  return found;
}
