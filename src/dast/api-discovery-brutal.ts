/**
 * Brutal API Discovery - Extract ALL APIs used by a target website
 *
 * Fetches the target, parses HTML/JS, probes common paths, returns list.
 * User can then pick which to DAST test.
 */

import { httpRequest } from './http-client';
import { DastEndpoint } from './types';

export interface DiscoveredApi {
  url: string;
  path: string;
  method: string;
  source: string;
  /** Response status when probed (if probed) */
  status?: number;
}

/** Core probes - fast, high-value */
const API_PATH_PROBES_CORE = [
  '/api', '/api/v1', '/api/v2', '/api/v3', '/graphql', '/api/graphql',
  '/rest', '/rest/v1', '/swagger.json', '/openapi.json', '/api-docs',
  '/health', '/status', '/ping', '/version', '/info',
  '/users', '/user', '/auth', '/login', '/logout', '/admin',
  '/data', '/search', '/query', '/webhook', '/callback',
  '/v1', '/v2', '/v3', '/internal', '/private',
];

/** Wicked probes - framework escapes, debug, internal, cloud, deprecated */
const API_PATH_PROBES_WICKED = [
  // Spring Boot / Java
  '/actuator', '/actuator/health', '/actuator/env', '/actuator/configprops',
  '/actuator/beans', '/actuator/mappings', '/actuator/heapdump',
  '/actuator/threaddump', '/actuator/info', '/actuator/metrics',
  '/actuator/trace', '/actuator/logfile', '/actuator/scheduledtasks',
  // Django / Flask
  '/admin', '/admin/login', '/__debug__', '/debug', '/django_admin',
  '/flask_admin', '/_debug_toolbar', '/api/admin',
  // Laravel / PHP
  '/laravel', '/laravel-admin', '/telescope', '/horizon',
  '/_ignition', '/_profiler', '/phpinfo.php', '/server-status',
  // Rails / Ruby
  '/rails/info', '/rails/info/routes', '/sidekiq', '/sidekiq/stats',
  // Node / Express
  '/debug', '/debug/pprof', '/profiler',
  // Generic debug / dev
  '/env', '/config', '/configuration', '/settings',
  '/metrics', '/prometheus', '/monitoring', '/trace',
  '/debug/vars', '/pprof', '/pprof/goroutine', '/pprof/heap',
  '/.env', '/config.json', '/env.json',
  // Cloud / infra
  '/metadata', '/latest/meta-data', '/computeMetadata/v1',
  '/.well-known/openid-configuration', '/.well-known/jwks.json',
  '/.well-known/oauth-authorization-server', '/.well-known/webfinger',
  '/service', '/services', '/svc',
  // Auth / OAuth
  '/oauth', '/oauth2', '/oidc', '/saml', '/saml2',
  '/token', '/token/refresh', '/introspect', '/userinfo',
  '/authorize', '/consent', '/connect',
  // Admin / backend
  '/manage', '/manager', '/management', '/dashboard',
  '/console', '/backoffice', '/backend', '/cms',
  '/wp-admin', '/wp-json', '/xmlrpc.php',
  // Staging / dev
  '/staging', '/stage', '/dev', '/development', '/test', '/testing',
  '/preview', '/preprod', '/sandbox', '/demo',
  // Spec variants
  '/swagger', '/swagger-ui', '/swagger-ui.html', '/swagger-resources',
  '/openapi', '/openapi.yaml', '/openapi.yml', '/api-spec',
  '/v1/api-docs', '/v2/api-docs', '/v3/api-docs',
  // GraphQL variants
  '/graphiql', '/graphql/console', '/playground', '/altair',
  '/api/v1/graphql', '/gql', '/query',
  // Common resources
  '/customers', '/orders', '/products', '/payments', '/invoices',
  '/accounts', '/profile', '/profiles', '/me', '/self',
  '/files', '/upload', '/download', '/export', '/import',
  '/notifications', '/messages', '/feed', '/timeline',
  '/reports', '/analytics', '/stats', '/events',
  // Sneaky / alternate casing
  '/API', '/Api', '/GraphQL', '/graphQL',
  '/api/v1/', '/api/v2/', '/api/internal',
  // Deprecated / legacy
  '/legacy', '/deprecated', '/old', '/v0',
  '/mobile', '/m', '/mapi', '/wapi',
];

const API_PATTERNS_IN_JS = [
  /fetch\s*\(\s*['"`]([^'"`\s]+)['"`]/g,
  /fetch\s*\(\s*`([^`]+)`/g,
  /axios\.(?:get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /\.(?:get|post|put|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g,
  /(?:api|base)Url\s*[=:]\s*['"`]([^'"`]+)['"`]/gi,
  /\/api\/[a-zA-Z0-9_/-]+/g,
  /['"`](?:\/api\/[^'"`\s]+)['"`]/g,
  /url\s*[:=]\s*['"`]([^'"`]+)['"`]/gi,
  /endpoint\s*[:=]\s*['"`]([^'"`]+)['"`]/gi,
  /(?:https?:)?\/\/[a-zA-Z0-9.-]+(?::\d+)?\/api[^'"`\s)*,]*/g,
];

/** Wicked: more aggressive JS extraction */
const API_PATTERNS_WICKED = [
  /(?:actuator|admin|debug|config|env|metrics)_?url\s*[=:]\s*['"`]([^'"`]+)['"`]/gi,
  /(?:REACT_APP_|VITE_|NEXT_PUBLIC_|NUXT_)[A-Z_]*API[^=]*=\s*['"`]([^'"`]+)['"`]/gi,
  /(?:oauth|token|auth)_?url\s*[=:]\s*['"`]([^'"`]+)['"`]/gi,
  /api[_-]?(?:gateway|base|host|server)\s*[=:]\s*['"`]([^'"`]+)['"`]/gi,
  /backend[_-]?url\s*[=:]\s*['"`]([^'"`]+)['"`]/gi,
  /\/(?:actuator|admin|manage|debug|metrics|env|config)[^'"`\s)*,]*/g,
  /['"`](\/\.well-known\/[^'"`\s]+)['"`]/g,
];

export async function discoverApisBrutal(
  targetUrl: string,
  options?: { probePaths?: boolean; fetchScripts?: boolean; timeout?: number; wickedMode?: boolean }
): Promise<DiscoveredApi[]> {
  const timeout = options?.timeout ?? 15000;
  const probePaths = options?.probePaths ?? true;
  const fetchScripts = options?.fetchScripts ?? true;
  const wickedMode = options?.wickedMode ?? false;
  const probePathsList = wickedMode
    ? [...API_PATH_PROBES_CORE, ...API_PATH_PROBES_WICKED]
    : API_PATH_PROBES_CORE;

  const seen = new Set<string>();
  const apis: DiscoveredApi[] = [];

  try {
    const base = new URL(targetUrl);
    const origin = base.origin;

    const mainRes = await httpRequest({
      url: targetUrl,
      method: 'GET',
      timeout,
    });

    const html = mainRes.body || '';
    const urlsFromHtml = extractUrlsFromHtml(html, origin);
    for (const u of urlsFromHtml) {
      if (isApiLike(u, wickedMode) && !seen.has(normalizeUrl(u))) {
        seen.add(normalizeUrl(u));
        apis.push({
          url: u,
          path: new URL(u).pathname || '/',
          method: 'GET',
          source: 'html',
        });
      }
    }

    if (fetchScripts) {
      const scriptUrls = extractScriptUrls(html, origin);
      for (const scriptUrl of scriptUrls.slice(0, wickedMode ? 50 : 30)) {
        try {
          const scriptRes = await httpRequest({ url: scriptUrl, method: 'GET', timeout: 8000 });
          const js = scriptRes.body || '';
          const urlsFromJs = extractUrlsFromJs(js, origin, wickedMode);
          for (const u of urlsFromJs) {
            if (!isApiLike(u, wickedMode)) continue;
            const norm = normalizeUrl(u);
            if (!seen.has(norm)) {
              seen.add(norm);
              apis.push({
                url: u,
                path: new URL(u).pathname || '/',
                method: 'GET',
                source: 'script',
              });
            }
          }
        } catch { /* skip failed script fetch */ }
      }
    }

    if (probePaths) {
      for (const p of probePathsList) {
        const url = origin + p;
        if (seen.has(normalizeUrl(url))) continue;
        try {
          const res = await httpRequest({ url, method: 'GET', timeout: 5000 });
          if (res.status < 500) {
            seen.add(normalizeUrl(url));
            apis.push({
              url,
              path: p,
              method: 'GET',
              source: 'probe',
              status: res.status,
            });
          }
        } catch { /* skip */ }
      }
    }

    try {
      const robotsUrl = origin + '/robots.txt';
      const robotsRes = await httpRequest({ url: robotsUrl, method: 'GET', timeout: 5000 });
      const sitemapMatch = (robotsRes.body || '').match(/Sitemap:\s*(https?:\/\/[^\s]+)/gi);
      if (sitemapMatch) {
        for (const line of sitemapMatch.slice(0, 3)) {
          const sitemapUrl = line.replace(/Sitemap:\s*/i, '').trim();
          try {
            const sitemapRes = await httpRequest({ url: sitemapUrl, method: 'GET', timeout: 5000 });
            const locs = (sitemapRes.body || '').match(/<loc>([^<]+)<\/loc>/g) || [];
            for (const loc of locs.slice(0, 50)) {
              const u = loc.replace(/<\/?loc>/g, '');
              if (isApiLike(u, wickedMode) && !seen.has(normalizeUrl(u))) {
                seen.add(normalizeUrl(u));
                apis.push({ url: u, path: new URL(u).pathname || '/', method: 'GET', source: 'sitemap' });
              }
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* skip robots */ }

    return apis.sort((a, b) => a.url.localeCompare(b.url));
  } catch (e) {
    console.warn('Brutal API discovery failed', e);
    return [];
  }
}

function extractUrlsFromHtml(html: string, origin: string): string[] {
  const urls: string[] = [];
  const hrefRe = /href\s*=\s*['"]([^'"]+)['"]/gi;
  const srcRe = /src\s*=\s*['"]([^'"]+)['"]/gi;
  const dataRe = /data-(?:api|url|src)\s*=\s*['"]([^'"]+)['"]/gi;
  for (const re of [hrefRe, srcRe, dataRe]) {
    let m;
    while ((m = re.exec(html)) !== null) {
      const raw = m[1].trim();
      const full = toAbsoluteUrl(raw, origin);
      if (full) urls.push(full);
    }
  }
  return urls;
}

function extractScriptUrls(html: string, origin: string): string[] {
  const urls: string[] = [];
  const re = /<script[^>]*\ssrc\s*=\s*['"]([^'"]+)['"]/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const full = toAbsoluteUrl(m[1].trim(), origin);
    if (full && /\.(js|mjs)$/i.test(full)) urls.push(full);
  }
  return urls;
}

function extractUrlsFromJs(js: string, origin: string, wicked = false): string[] {
  const urls: string[] = [];
  const patterns = wicked ? [...API_PATTERNS_IN_JS, ...API_PATTERNS_WICKED] : API_PATTERNS_IN_JS;
  for (const re of patterns) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(js)) !== null) {
      const raw = (m[1] || m[0]).trim();
      let u = raw.startsWith('http') ? raw : toAbsoluteUrl(raw, origin);
      if (u && isApiLike(u)) urls.push(u);
    }
  }
  return urls;
}

function toAbsoluteUrl(raw: string, origin: string): string | null {
  try {
    if (raw.startsWith('//')) return 'https:' + raw;
    if (raw.startsWith('http')) return raw;
    if (raw.startsWith('/')) return origin + raw;
    if (raw.startsWith('./') || raw.startsWith('../')) {
      const base = origin + '/';
      return new URL(raw, base).href;
    }
    return origin + '/' + raw;
  } catch {
    return null;
  }
}

function isApiLike(url: string, wicked = false): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    const core = (
      path.includes('/api') ||
      path.includes('/graphql') ||
      path.includes('/rest') ||
      path.includes('/v1') ||
      path.includes('/v2') ||
      path.includes('/swagger') ||
      path.includes('/openapi') ||
      /\/users?\/?$/.test(path) ||
      /\/auth\b/.test(path) ||
      path === '/health' ||
      path === '/status'
    );
    if (core) return true;
    if (wicked) {
      return (
        path.includes('/actuator') || path.includes('/admin') || path.includes('/debug') ||
        path.includes('/env') || path.includes('/config') || path.includes('/metrics') ||
        path.includes('/metadata') || path.includes('/.well-known') ||
        path.includes('/oauth') || path.includes('/token') || path.includes('/manage') ||
        path.includes('/staging') || path.includes('/dev') || path.includes('/internal') ||
        path.includes('/private') || /\.(json|yaml|yml)$/.test(path)
      );
    }
    return false;
  } catch {
    return false;
  }
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    return u.href;
  } catch {
    return url;
  }
}

/** Convert DiscoveredApi[] to DastEndpoint[] for DAST scanner */
export function discoveredToEndpoints(apis: DiscoveredApi[]): DastEndpoint[] {
  return apis.map(a => ({
    url: a.url,
    method: a.method,
    path: a.path,
    parameters: [{ name: 'id', in: 'query' }, { name: 'q', in: 'query' }],
  }));
}
