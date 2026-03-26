/**
 * Threat Model from CVE History — Devansh Methodology
 *
 * Queries OSV.dev and GitHub Security Advisories (GHSA) for the project's
 * prior CVEs, then feeds descriptions to an LLM to generate a threat model.
 *
 * "Look for previously disclosed CVEs in that project. Feed those CVE
 * descriptions to the LLM and ask it to generate a threat model for
 * plausible bug classes." — Devansh
 *
 * APIs:
 * - OSV: POST https://api.osv.dev/v1/query (package+version, or commit)
 * - GHSA: GitHub GraphQL securityAdvisories
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const OSV_API = 'https://api.osv.dev/v1/query';
const GITHUB_GRAPHQL = 'https://api.github.com/graphql';
const REQUEST_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface ThreatModel {
  /** One-sentence focus per slice */
  sliceFocus: string;
  /** Entry points to audit */
  entryPoints: string[];
  /** Trust boundaries */
  trustBoundaries: string[];
  /** High-risk operations */
  highRiskOps: string[];
  /** Attacker model */
  attackerModel: 'remote-unauthenticated' | 'remote-authenticated-low' | 'cross-tenant' | 'local-code-exec';
  /** Prior CVEs used to build this model */
  priorCves: string[];
  /** Raw CVE descriptions fed to LLM */
  cveDescriptions: string[];
  /** Generated at */
  generatedAt: number;
  /** Crown jewels: what we're protecting (from threat-model.json) */
  crownJewels?: string[];
}

export interface PackageInfo {
  name: string;
  version?: string;
  ecosystem: 'npm' | 'PyPI' | 'RubyGems' | 'Go' | 'crates.io' | 'Maven' | 'NuGet' | 'Packagist';
}

export interface GitRepo {
  owner: string;
  repo: string;
  host?: 'github.com';
}

interface OSVVuln {
  id?: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  affected?: Array<{
    package?: { name?: string; ecosystem?: string };
    ranges?: Array<{ events?: Array<{ introduced?: string; fixed?: string }> }>;
    database_specific?: { [k: string]: unknown };
  }>;
}

interface OSVResponse {
  vulns?: OSVVuln[];
  next_page_token?: string;
}

interface GHSAAdvisory {
  securityAdvisory?: {
    ghsaId: string;
    summary?: string;
    description?: string;
    identifiers?: Array<{ type: string; value: string }>;
  };
}

interface GHSAResponse {
  data?: {
    repository?: {
      vulnerabilityAlerts?: {
        nodes?: GHSAAdvisory[];
        pageInfo?: { hasNextPage: boolean; endCursor?: string };
      };
    };
  };
  errors?: Array<{ message: string }>;
}

const cache = new Map<string, { data: string[]; ts: number }>();

function httpsPost(url: string, body: object, headers: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const opts: https.RequestOptions = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'CipherMate-VSCode/1.1.0',
        ...headers,
      },
      timeout: REQUEST_TIMEOUT_MS,
    };

    const req = https.request(opts, (res) => {
      let buf = '';
      res.on('data', (ch) => { buf += ch; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(buf);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${buf.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(data);
    req.end();
  });
}

function httpsGet(url: string, headers: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts: https.RequestOptions = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'User-Agent': 'CipherMate-VSCode/1.1.0',
        Accept: 'application/json',
        ...headers,
      },
      timeout: REQUEST_TIMEOUT_MS,
    };

    const req = https.request(opts, (res) => {
      let buf = '';
      res.on('data', (ch) => { buf += ch; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(buf);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${buf.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Detect package info from workspace (package.json, requirements.txt, etc.)
 */
export function detectPackageInfo(workspaceRoot: string): PackageInfo | null {
  const pkgPath = path.join(workspaceRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const name = pkg.name;
      if (!name || typeof name !== 'string') return null;
      return {
        name,
        version: pkg.version,
        ecosystem: 'npm',
      };
    } catch {
      return null;
    }
  }

  const reqPath = path.join(workspaceRoot, 'requirements.txt');
  if (fs.existsSync(reqPath)) {
    try {
      const content = fs.readFileSync(reqPath, 'utf8');
      const firstPkg = content.split('\n')[0]?.trim().split(/[=<>]/)[0]?.trim();
      if (firstPkg) {
        return { name: firstPkg, ecosystem: 'PyPI' };
      }
    } catch {
      /* ignore */
    }
  }

  const goMod = path.join(workspaceRoot, 'go.mod');
  if (fs.existsSync(goMod)) {
    try {
      const content = fs.readFileSync(goMod, 'utf8');
      const m = content.match(/module\s+([^\s]+)/);
      if (m) return { name: m[1], ecosystem: 'Go' };
    } catch {
      /* ignore */
    }
  }

  return null;
}

/**
 * Detect Git remote (owner/repo) for GHSA queries
 */
export function detectGitRepo(workspaceRoot: string): GitRepo | null {
  const gitConfig = path.join(workspaceRoot, '.git', 'config');
  if (!fs.existsSync(gitConfig)) return null;

  try {
    const content = fs.readFileSync(gitConfig, 'utf8');
    const m = content.match(/url\s*=\s*(?:https?:\/\/[^/]+\/|git@[^:]+:)([^/]+)\/([^/\s]+?)(?:\.git)?\s*$/m);
    if (m) {
      const owner = m[1].trim();
      const repo = m[2].trim().replace(/\.git$/, '');
      return { owner, repo, host: 'github.com' };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Query OSV for vulnerabilities affecting a package@version
 */
export async function queryOSV(pkg: PackageInfo): Promise<string[]> {
  const cacheKey = `osv:${pkg.ecosystem}:${pkg.name}:${pkg.version || 'latest'}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  const descriptions: string[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const body: Record<string, unknown> = {
        package: {
          name: pkg.name,
          ecosystem: pkg.ecosystem,
        },
      };
      if (pkg.version) body.version = pkg.version;
      if (pageToken) body.page_token = pageToken;

      const raw = await httpsPost(OSV_API, body);
      const resp = JSON.parse(raw) as OSVResponse;

      for (const v of resp.vulns || []) {
        const summary = v.summary || v.details?.slice(0, 500) || v.id || 'Unknown';
        const aliases = (v.aliases || []).filter((a) => /^CVE-/.test(a));
        const prefix = aliases.length ? `${aliases.join(', ')}: ` : '';
        descriptions.push(`${prefix}${summary}`);
      }

      pageToken = resp.next_page_token;
      if (pageToken) await sleep(300); // Rate limit between pages
    } while (pageToken);

    cache.set(cacheKey, { data: descriptions, ts: Date.now() });
  } catch (e) {
    console.warn('OSV query failed:', e);
  }

  return descriptions;
}

/**
 * Query GitHub Security Advisories for a repo (requires GITHUB_TOKEN for private repos)
 */
export async function queryGHSA(
  repo: GitRepo,
  options?: { token?: string; maxAlerts?: number }
): Promise<string[]> {
  if (repo.host !== 'github.com') return [];

  const cacheKey = `ghsa:${repo.owner}:${repo.repo}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  const token = options?.token || process.env.GITHUB_TOKEN;
  const maxAlerts = options?.maxAlerts ?? 50;

  const query = `
    query($owner: String!, $repo: String!, $cursor: String) {
      repository(owner: $owner, name: $repo) {
        vulnerabilityAlerts(first: 20, after: $cursor) {
          nodes {
            securityAdvisory {
              ghsaId
              summary
              description
              identifiers { type value }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  `;

  const descriptions: string[] = [];
  let cursor: string | undefined;

  try {
    do {
      const body = {
        query,
        variables: { owner: repo.owner, repo: repo.repo, cursor },
      };

      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const raw = await httpsPost(GITHUB_GRAPHQL, body, headers);
      const resp = JSON.parse(raw) as GHSAResponse;

      if (resp.errors?.length) {
        console.warn('GHSA GraphQL errors:', resp.errors);
        break;
      }

      const nodes = resp.data?.repository?.vulnerabilityAlerts?.nodes ?? [];
      for (const n of nodes) {
        const adv = n.securityAdvisory;
        if (!adv) continue;
        const summary = adv.summary || adv.description?.slice(0, 500) || adv.ghsaId;
        const cve = adv.identifiers?.find((i) => i.type === 'CVE')?.value;
        const prefix = cve ? `${cve}: ` : '';
        descriptions.push(`${prefix}${summary}`);
      }

      const pageInfo = resp.data?.repository?.vulnerabilityAlerts?.pageInfo;
      cursor = pageInfo?.hasNextPage ? pageInfo.endCursor : undefined;
      if (descriptions.length >= maxAlerts) break;
      if (cursor) await sleep(500);
    } while (cursor);

    cache.set(cacheKey, { data: descriptions, ts: Date.now() });
  } catch (e) {
    console.warn('GHSA query failed:', e);
  }

  return descriptions;
}

/**
 * Build threat model from CVE descriptions using LLM (caller provides AI)
 */
export function buildThreatModelPrompt(cveDescriptions: string[]): string {
  const combined = cveDescriptions.slice(0, 30).join('\n\n---\n\n');
  return `You are a security threat modeler. Based on the following CVE/advisory descriptions from this project's history, generate a minimal threat model.

CVE/ADVISORY DESCRIPTIONS:
${combined || '(No prior CVEs found for this project. Generate a generic threat model for the type of application.)'}

Output JSON only, no markdown:
{
  "sliceFocus": "One-sentence focus for the primary audit slice (e.g. 'Authorization boundary enforcement between key types')",
  "entryPoints": ["HTTP routes", "RPC handlers", "CLI", "scheduled jobs", "message consumers"],
  "trustBoundaries": ["browser to server", "service to service", "plugin to host"],
  "highRiskOps": ["deserialization", "templating", "authz checks", "parsing untrusted input"],
  "attackerModel": "remote-unauthenticated",
  "priorCves": ["list", "of", "CVE", "ids", "or", "GHSA", "ids", "referenced"]
}

attackerModel must be one of: remote-unauthenticated, remote-authenticated-low, cross-tenant, local-code-exec.
Keep each array to 3-6 items. Be specific to the CVE patterns, not generic.`;
}

/**
 * Parse LLM response into ThreatModel
 */
export function parseThreatModelFromLLM(
  llmResponse: string,
  cveDescriptions: string[]
): ThreatModel | null {
  try {
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const attackerModel = (parsed.attackerModel as string) || 'remote-unauthenticated';
    const validAttacker = ['remote-unauthenticated', 'remote-authenticated-low', 'cross-tenant', 'local-code-exec'].includes(attackerModel)
      ? attackerModel
      : 'remote-unauthenticated';

    return {
      sliceFocus: String(parsed.sliceFocus || 'Authorization and input validation'),
      entryPoints: Array.isArray(parsed.entryPoints) ? parsed.entryPoints.map(String) : [],
      trustBoundaries: Array.isArray(parsed.trustBoundaries) ? parsed.trustBoundaries.map(String) : [],
      highRiskOps: Array.isArray(parsed.highRiskOps) ? parsed.highRiskOps.map(String) : [],
      attackerModel: validAttacker as ThreatModel['attackerModel'],
      priorCves: Array.isArray(parsed.priorCves) ? parsed.priorCves.map(String) : [],
      cveDescriptions,
      generatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Main: build threat model from project CVEs (OSV + GHSA), then optionally call LLM
 */
export async function gatherCveDescriptionsForThreatModel(
  workspaceRoot: string,
  options?: { ghsaToken?: string }
): Promise<{ descriptions: string[]; packageInfo: PackageInfo | null; gitRepo: GitRepo | null }> {
  const descriptions: string[] = [];
  const pkg = detectPackageInfo(workspaceRoot);
  const repo = detectGitRepo(workspaceRoot);

  if (pkg) {
    const osv = await queryOSV(pkg);
    descriptions.push(...osv);
  }

  if (repo) {
    const ghsa = await queryGHSA(repo, { token: options?.ghsaToken });
    descriptions.push(...ghsa);
  }

  // Dedupe by normalized prefix (CVE-XXX or GHSA-XXX)
  const seen = new Set<string>();
  const deduped = descriptions.filter((d) => {
    const key = d.slice(0, 50).replace(/\s+/g, ' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { descriptions: deduped, packageInfo: pkg, gitRepo: repo };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
