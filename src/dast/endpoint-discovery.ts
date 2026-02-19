/**
 * Endpoint Discovery for DAST
 *
 * Finds API endpoints from:
 * - OpenAPI/Swagger specs
 * - URLs in code (.env, config, code files)
 *
 * StackHawk/Intruder parity: API attack surface discovery
 */

import * as path from 'path';
import * as fs from 'fs';
import { DastEndpoint } from './types';

const OPENAPI_GLOBS = [
  '**/openapi.json',
  '**/openapi.yaml',
  '**/openapi.yml',
  '**/swagger.json',
  '**/swagger.yaml',
  '**/swagger.yml',
  '**/api-spec.json',
  '**/*openapi*.json',
];

const URL_PATTERNS = [
  /\bhttps?:\/\/[a-zA-Z0-9.-]+(?::\d+)?(?:\/[^\s'"`)]*)?/g,
  /\b(?:api|API)_?(?:URL|BASE|ENDPOINT)\s*[=:]\s*['"`]?([^'"`\s]+)/gi,
  /\bfetch\s*\(\s*['"`](https?:\/\/[^'"`]+)['"`]/g,
  /\b(?:axios|request)\.(?:get|post)\s*\(\s*['"`](https?:\/\/[^'"`]+)['"`]/g,
  /\burl\s*[:=]\s*['"`](https?:\/\/[^'"`]+)['"`]/gi,
  /\bBASE_URL\s*[=:]\s*['"`]?([^'"`\s]+)/g,
  /\bAPI_URL\s*[=:]\s*['"`]?([^'"`\s]+)/g,
];

/** Parse OpenAPI/Swagger spec and extract endpoints */
export async function discoverFromOpenApi(
  workspacePath: string,
  specPath?: string
): Promise<DastEndpoint[]> {
  const endpoints: DastEndpoint[] = [];
  let pathsToTry: string[] = [];

  if (specPath && fs.existsSync(specPath)) {
    pathsToTry = [path.resolve(workspacePath, specPath)];
  } else {
    pathsToTry = findOpenApiSpecs(workspacePath);
  }

  for (const p of pathsToTry) {
    try {
      const content = fs.readFileSync(p, 'utf8');
      const isYaml = /\.(yaml|yml)$/i.test(p);
      const spec = isYaml ? parseYamlLike(content) : JSON.parse(content);

      if (!spec || !spec.paths) continue;

      const baseUrl = spec.servers?.[0]?.url || '';
      const basePath = (spec.basePath || '').replace(/\/$/, '');

      for (const [pathKey, pathItem] of Object.entries(spec.paths as Record<string, any>)) {
        if (!pathItem || typeof pathItem !== 'object') continue;

        for (const method of ['get', 'post', 'put', 'delete', 'patch', 'head']) {
          if (pathItem[method]) {
            const op = pathItem[method];
            const params = [...(pathItem.parameters || []), ...(op.parameters || [])];
            const fullPath = basePath + pathKey;

            endpoints.push({
              url: baseUrl + fullPath,
              method: method.toUpperCase(),
              path: fullPath,
              operationId: op.operationId,
              parameters: params.map((p: any) => ({
                name: p.name,
                in: p.in || 'query',
                required: p.required,
                schema: p.schema,
              })),
              summary: op.summary,
            });
          }
        }
      }
    } catch (e) {
      console.warn('DAST: Failed to parse OpenAPI spec', p, e);
    }
  }

  return endpoints;
}

function findOpenApiSpecs(workspacePath: string): string[] {
  const found: string[] = [];
  const dirs = [workspacePath];

  function walk(dir: string, depth: number) {
    if (depth > 4) return; // Limit recursion
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
          walk(full, depth + 1);
        } else if (
          e.isFile() &&
          /(openapi|swagger|api-spec)\.(json|yaml|yml)$/i.test(e.name)
        ) {
          found.push(full);
        }
      }
    } catch {
      // skip
    }
  }
  walk(workspacePath, 0);
  return found;
}

/** Simple YAML-like parse for server/basePath/paths - no external deps */
function parseYamlLike(content: string): Record<string, any> {
  const out: Record<string, any> = {};
  try {
    const serversMatch = content.match(/servers:\s*\n\s*-\s*url:\s*['"]?([^'"\s\n]+)/);
    if (serversMatch) out.servers = [{ url: serversMatch[1].trim() }];

    const pathsMatch = content.match(/paths:\s*\n([\s\S]*?)(?=\n\w+\s*:|\n$|\Z)/);
    if (pathsMatch) {
      const pathBlock = pathsMatch[1];
      const pathKeys = pathBlock.match(/^\s*(\/[^\s:]+):/gm) || [];
      out.paths = {};
      for (const p of pathKeys) {
        const key = p.trim().replace(/:$/, '').trim();
        if (key) out.paths[key] = { get: {}, post: {} };
      }
    }
  } catch {
    // ignore
  }
  return out;
}

/** Discover URLs from workspace (code, .env, config) */
export function discoverUrlsFromWorkspace(workspacePath: string): string[] {
  const urls = new Set<string>();

  function scanFile(filePath: string) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      for (const pattern of URL_PATTERNS) {
        const matches = content.matchAll(pattern);
        for (const m of matches) {
          let url = m[1] || m[0];
          if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
            url = url.replace(/['"`)\s;].*$/, '').trim();
            if (url.length > 10) urls.add(url);
          }
        }
      }
    } catch {
      // skip
    }
  }

  function walk(dir: string, depth: number) {
    if (depth > 5) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist') continue;
          walk(full, depth + 1);
        } else if (/\.(env|config|json|js|ts|tsx|jsx|py|java|go|php)$/i.test(e.name)) {
          scanFile(full);
        }
      }
    } catch {
      // skip
    }
  }
  walk(workspacePath, 0);

  return Array.from(urls);
}

/** Infer REST routes from code patterns (e.g. app.get('/user/:id')) */
export function inferRoutesFromCode(workspacePath: string): DastEndpoint[] {
  const endpoints: DastEndpoint[] = [];
  const routePatterns = [
    /(?:app|router|express)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    /@(?:Get|Post|Put|Delete|Patch)\s*\(\s*['"`]?([^'"`)\s]+)['"`]?/g,
    /(?:route|path)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    /(?:url_pattern|path)\s*=\s*['"`]([^'"`]+)['"`]/gi,
  ];

  function walk(dir: string, depth: number) {
    if (depth > 4) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
          walk(full, depth + 1);
        } else if (/\.(js|ts|tsx|jsx|py|java|go|rb|php)$/i.test(e.name)) {
          try {
            const content = fs.readFileSync(full, 'utf8');
            for (const re of routePatterns) {
              let m;
              re.lastIndex = 0;
              while ((m = re.exec(content)) !== null) {
                const pathRaw = m[2] || m[1] || '/';
                const methodMatch = m[1] && /^(get|post|put|delete|patch)$/i.test(m[1]);
                const method = (methodMatch ? m[1] : 'get').toUpperCase();
                const routePath = pathRaw.replace(/:(\w+)/g, '123');
                const pathParams = pathRaw.match(/:(\w+)/g)?.map(p => p.slice(1)) || [];
                endpoints.push({
                  url: '',
                  method,
                  path: routePath.startsWith('/') ? routePath : '/' + routePath,
                  pathParams,
                  parameters: pathParams.map(p => ({ name: p, in: 'path' as const })),
                });
              }
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }
  }
  walk(workspacePath, 0);
  return endpoints;
}

/** Build DastEndpoint list from discovered URLs */
export function urlsToEndpoints(urls: string[]): DastEndpoint[] {
  return urls.map((url) => {
    try {
      const u = new URL(url);
      return {
        url,
        method: 'GET',
        path: u.pathname || '/',
        parameters: [{ name: 'q', in: 'query', required: false }],
      };
    } catch {
      return { url, method: 'GET', path: '/', parameters: [] };
    }
  });
}
