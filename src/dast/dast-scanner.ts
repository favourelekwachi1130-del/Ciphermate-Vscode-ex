/**
 * DAST Scanner - Surface Monitoring v2
 *
 * Insanely powerful dynamic testing:
 * - Parallel execution with adaptive throttling
 * - GraphQL, JWT, IDOR, Mass Assignment, Prototype Pollution, SSTI
 * - Route inference from code
 * - SARIF export, curl replay, executive summary
 * - AI-powered response analysis
 */

import * as vscode from 'vscode';
import {
  DastScanConfig,
  DastScanResult,
  DastEndpoint,
  DastAttackResult,
  SecurityHeaderCheck,
  DastAttackCategory,
} from './types';
import {
  discoverFromOpenApi,
  discoverUrlsFromWorkspace,
  urlsToEndpoints,
  inferRoutesFromCode,
} from './endpoint-discovery';
import {
  getPayloadsForCategory,
  DEFAULT_ATTACK_CATEGORIES,
  BRUTAL_ATTACK_CATEGORIES,
  getPayloadLimit,
  getBrutalPayloads,
  AttackPayload,
} from './attack-payloads';
import { analyzeResponseRules, analyzeResponseWithAI, AnalyzeRequest } from './response-analyzer';
import { httpRequest, runWithConcurrency, getAdaptiveDelay, toCurl } from './http-client';
import { toSarif, generateExecutiveSummary } from './report-generator';
import { runGraphQLAttacks } from './attacks/graphql-attack';
import { runJwtAttacks } from './attacks/jwt-attack';
import { runIdorAttacks } from './attacks/idor-attack';
import {
  runHeaderInjectionAttacks,
  runBlindSqlTimingAttacks,
  runNoSqlAttacks,
  runLogInjectionAttacks,
} from './attacks/inferno-attack';
import { buildTargetContext } from './target-context';
import { getAttackStrategy } from './ai-attack-strategist';

const REQUIRED_HEADERS: Array<{ name: string; recommended: string; severity: 'critical' | 'high' | 'medium' | 'low' | 'info' }> = [
  { name: 'Strict-Transport-Security', recommended: 'max-age=31536000; includeSubDomains', severity: 'high' },
  { name: 'X-Content-Type-Options', recommended: 'nosniff', severity: 'medium' },
  { name: 'X-Frame-Options', recommended: 'DENY or SAMEORIGIN', severity: 'medium' },
  { name: 'Content-Security-Policy', recommended: "default-src 'self'", severity: 'medium' },
  { name: 'X-XSS-Protection', recommended: '0 (legacy)', severity: 'low' },
];

export class DastScanner {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async scan(config: DastScanConfig): Promise<DastScanResult> {
    const startTime = Date.now();
    const vulnerabilities: DastAttackResult[] = [];
    let endpointsTested = 0;
    let attacksPerformed = 0;
    const brutal = config.brutalMode ?? false;
    const contextAware = config.enableContextAware ?? true;
    const concurrency = brutal ? Math.min(config.concurrency ?? 10, 20) : Math.min(config.concurrency ?? 5, 10);
    let delay = brutal ? 0 : (config.delayBetweenRequestsMs ?? 80);
    const useAI = config.enableAIResponseAnalysis ?? true;

    try {
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      let endpoints = await this.discoverEndpoints(config, workspacePath);
      const maxEndpoints = brutal ? Math.min(config.maxEndpoints ?? 50, 100) : (config.maxEndpoints ?? 30);
      let toTest = endpoints.slice(0, maxEndpoints);

      let strategy: Awaited<ReturnType<typeof getAttackStrategy>> | null = null;
      if (contextAware && endpoints.length > 0) {
        try {
          const profile = await buildTargetContext(
            config.targetUrl,
            workspacePath,
            config.auth,
            config.requestTimeoutMs ?? 8000
          );
          strategy = await getAttackStrategy(this.context, profile, endpoints);
          if (strategy.highValuePatterns.length > 0) {
            toTest = [...toTest].sort((a, b) => {
              const pathA = (a.path || a.url).toLowerCase();
              const pathB = (b.path || b.url).toLowerCase();
              const scoreA = strategy!.highValuePatterns.filter(p => pathA.includes(p.toLowerCase())).length;
              const scoreB = strategy!.highValuePatterns.filter(p => pathB.includes(p.toLowerCase())).length;
              return scoreB - scoreA;
            });
          }
        } catch (e) {
          console.warn('Context-aware setup failed, using defaults', e);
        }
      }

      const categories: DastAttackCategory[] =
        config.attackCategories?.length
          ? config.attackCategories
          : strategy
            ? strategy.prioritizedCategories.filter(c => !strategy!.skipCategories.includes(c))
            : brutal
              ? BRUTAL_ATTACK_CATEGORIES
              : DEFAULT_ATTACK_CATEGORIES;

      const securityHeaders = await this.checkSecurityHeaders(config.targetUrl);

      if (brutal) {
        const headerVulns = await runHeaderInjectionAttacks(
          config.targetUrl,
          config.auth,
          config.requestTimeoutMs ?? 10000
        );
        vulnerabilities.push(...headerVulns);
      }

      // GraphQL scan
      if (config.enableGraphQL !== false) {
        const gqlVulns = await runGraphQLAttacks(
          config.targetUrl,
          '',
          config.auth,
          config.requestTimeoutMs ?? 10000
        );
        vulnerabilities.push(...gqlVulns);
      }

      // Build attack tasks for parallel execution
      type AttackTask = {
        endpoint: DastEndpoint;
        targetUrl: string;
        category: DastAttackCategory;
        payload: string;
        paramName: string;
        attack: AttackPayload;
        injectAsJson?: boolean;
      };

      const paramFocus = strategy?.paramFocus?.length ? strategy.paramFocus : undefined;
      const customPayloadsByCat = strategy?.customPayloads || {};

      const tasks: AttackTask[] = [];
      for (const ep of toTest) {
        const targetUrl = ep.url.startsWith('http') ? ep.url : config.targetUrl.replace(/\/$/, '') + ep.path;
        endpointsTested++;

        for (const cat of categories) {
          if (cat === 'graphql' || cat === 'idor' || cat === 'jwt') continue;
          const payloads = getPayloadsForCategory(cat);
          const payloadLimit = brutal
            ? getPayloadLimit(cat, true)
            : (config.maxPayloadsPerParam ?? 4);
          const customForCat = customPayloadsByCat[cat] || [];
          for (const attack of payloads.slice(0, brutal ? 4 : 2)) {
            let paramNames = (ep.parameters || [])
              .filter(p => p.in === 'query' || p.in === 'body')
              .map(p => p.name);
            if (paramNames.length === 0) paramNames = ['id', 'q', 'search', 'query', 'name', 'filter', 'user', 'id'];
            if (paramFocus?.length) {
              paramNames = [...new Set([...paramFocus, ...paramNames])].slice(0, 4);
            } else {
              paramNames = paramNames.slice(0, 3);
            }

            const basePayloadList = brutal ? getBrutalPayloads(cat, attack) : attack.payloads;
            const payloadList = [...customForCat.slice(0, 4), ...basePayloadList];
            for (const payload of payloadList.slice(0, payloadLimit + (customForCat.length ? 4 : 0))) {
              for (const param of paramNames.slice(0, 4)) {
                tasks.push({
                  endpoint: ep,
                  targetUrl,
                  category: cat,
                  payload,
                  paramName: param,
                  attack,
                  injectAsJson: attack.injectAsJson,
                });
              }
            }
          }
        }
      }

      const baselineCache = new Map<string, { status: number; body: string }>();

      const results = await runWithConcurrency(
        tasks,
        concurrency,
        async (task): Promise<DastAttackResult | null> => {
          if (config.adaptiveThrottling !== false && delay > 0) {
            await this.delay(delay);
          }

          const injected = this.injectPayload(
            task.targetUrl,
            task.endpoint.method,
            task.paramName,
            task.payload,
            task.injectAsJson
          );

          const resp = await httpRequest({
            url: injected.url,
            method: injected.method,
            headers: injected.headers,
            body: injected.body,
            auth: config.auth,
            timeout: config.requestTimeoutMs ?? 10000,
          });

          if (config.adaptiveThrottling && (resp.status === 429 || resp.status === 503)) {
            delay = getAdaptiveDelay(resp.status, delay, resp.headers['retry-after']);
          }

          const key = `${task.targetUrl}::${task.paramName}`;
          if (!baselineCache.has(key)) {
            baselineCache.set(key, { status: resp.status, body: resp.body });
          }

          const analyzeReq: AnalyzeRequest = {
            url: injected.url,
            method: injected.method,
            paramName: task.paramName,
            paramLocation: task.injectAsJson ? 'body' : 'query',
            payload: task.payload,
            attackCategory: task.category,
            statusCode: resp.status,
            responseBody: resp.body,
            responseHeaders: resp.headers,
          };

          let vuln = analyzeResponseRules(analyzeReq);
          if (!vuln && useAI) {
            vuln = await analyzeResponseWithAI(this.context, analyzeReq);
          }

          if (vuln) {
            vuln.curlReplay = toCurl({
              url: injected.url,
              method: injected.method,
              headers: injected.headers,
              body: injected.body,
            });
            return vuln;
          }
          return null;
        }
      );

      for (const v of results) {
        if (v) vulnerabilities.push(v);
      }
      attacksPerformed = tasks.length;

      if (brutal) {
        for (const ep of toTest.slice(0, 15)) {
          const targetUrl = ep.url.startsWith('http') ? ep.url : config.targetUrl.replace(/\/$/, '') + ep.path;
          const paramNames = (ep.parameters || []).filter(p => p.in === 'query').map(p => p.name);
          if (paramNames.length === 0) paramNames.push('id', 'q', 'search');

          for (const param of paramNames.slice(0, 2)) {
            const blind = await runBlindSqlTimingAttacks(
              targetUrl,
              ep.method,
              param,
              config.auth,
              (config.requestTimeoutMs ?? 10000) + 6000
            );
            if (blind) vulnerabilities.push(blind);

            const nosql = await runNoSqlAttacks(targetUrl, ep.method, param, config.auth, config.requestTimeoutMs ?? 10000);
            vulnerabilities.push(...nosql);

            const logInj = await runLogInjectionAttacks(targetUrl, ep.method, param, config.auth, config.requestTimeoutMs ?? 5000);
            vulnerabilities.push(...logInj);
          }
        }
      }

      // IDOR attacks (per-endpoint, need baseline)
      if (config.enableIdor !== false) {
        for (const ep of toTest.slice(0, 10)) {
          const targetUrl = ep.url.startsWith('http') ? ep.url : config.targetUrl.replace(/\/$/, '') + ep.path;
          const baseline = await httpRequest({
            url: targetUrl,
            method: ep.method,
            auth: config.auth,
            timeout: config.requestTimeoutMs ?? 10000,
          });
          const idorVulns = await runIdorAttacks(
            ep,
            config.targetUrl,
            { status: baseline.status, body: baseline.body },
            config.auth,
            config.requestTimeoutMs ?? 10000
          );
          vulnerabilities.push(...idorVulns);
        }
      }

      // JWT tests on auth-looking endpoints
      if (config.enableJwtOAuth !== false && config.auth?.type === 'bearer') {
        for (const ep of toTest.filter(e => /login|auth|user|admin|me|profile/i.test(e.path || e.url)).slice(0, 5)) {
          const targetUrl = ep.url.startsWith('http') ? ep.url : config.targetUrl.replace(/\/$/, '') + ep.path;
          const jwtVulns = await runJwtAttacks(
            targetUrl,
            ep.method,
            { credentials: config.auth.credentials },
            config.requestTimeoutMs ?? 10000
          );
          vulnerabilities.push(...jwtVulns);
        }
      }

      const deduped = this.deduplicateVulns(vulnerabilities);
      const sarif = toSarif({
        success: true,
        targetUrl: config.targetUrl,
        endpointsTested,
        attacksPerformed,
        vulnerabilities: deduped,
        securityHeaders,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      });

      return {
        success: true,
        targetUrl: config.targetUrl,
        endpointsTested,
        attacksPerformed,
        vulnerabilities: deduped,
        securityHeaders,
        duration: Date.now() - startTime,
        timestamp: new Date(),
        sarif,
        executiveSummary: generateExecutiveSummary({
          success: true,
          targetUrl: config.targetUrl,
          endpointsTested,
          attacksPerformed,
          vulnerabilities: deduped,
          securityHeaders,
          duration: Date.now() - startTime,
          timestamp: new Date(),
        }),
      };
    } catch (error: any) {
      return {
        success: false,
        targetUrl: config.targetUrl,
        endpointsTested,
        attacksPerformed,
        vulnerabilities: [],
        duration: Date.now() - startTime,
        timestamp: new Date(),
        error: error.message || String(error),
      };
    }
  }

  private async discoverEndpoints(
    config: DastScanConfig,
    workspacePath?: string
  ): Promise<DastEndpoint[]> {
    let endpoints: DastEndpoint[] = [];

    if (config.openApiPath || (config.discoverFromWorkspace && workspacePath)) {
      const fromSpec = await discoverFromOpenApi(workspacePath || '.', config.openApiPath);
      if (fromSpec.length > 0) endpoints = fromSpec;
    }

    if (endpoints.length === 0 && config.discoverFromWorkspace && workspacePath) {
      const inferred = inferRoutesFromCode(workspacePath);
      const baseUrl = config.targetUrl.replace(/\/$/, '');
      for (const ep of inferred) {
        endpoints.push({ ...ep, url: baseUrl + ep.path });
      }
    }

    if (endpoints.length === 0 && config.discoverFromWorkspace && workspacePath) {
      const urls = discoverUrlsFromWorkspace(workspacePath);
      const targetBase = new URL(config.targetUrl).origin;
      const filtered = urls.filter(u => {
        try {
          return new URL(u).origin === targetBase || u.startsWith(config.targetUrl);
        } catch {
          return false;
        }
      });
      endpoints = urlsToEndpoints(filtered.length > 0 ? filtered : [config.targetUrl]);
    }

    if (endpoints.length === 0) {
      const u = new URL(config.targetUrl);
      endpoints = [{
        url: config.targetUrl,
        method: 'GET',
        path: u.pathname || '/',
        parameters: [{ name: 'id', in: 'query' }, { name: 'q', in: 'query' }],
      }];
    }

    return endpoints;
  }

  private injectPayload(
    url: string,
    method: string,
    paramName: string,
    payload: string,
    asJson = false
  ): { url: string; method: string; headers: Record<string, string>; body?: string } {
    try {
      const u = new URL(url);
      const headers: Record<string, string> = { 'User-Agent': 'CipherMate-DAST/2.0', 'Accept': '*/*' };

      if (asJson) {
        headers['Content-Type'] = 'application/json';
        return {
          url: u.toString(),
          method: method === 'GET' ? 'POST' : method,
          headers,
          body: payload.startsWith('{') ? payload : JSON.stringify({ [paramName]: payload }),
        };
      }

      u.searchParams.set(paramName, payload);
      return { url: u.toString(), method, headers };
    } catch {
      return { url, method, headers: {} };
    }
  }

  private async checkSecurityHeaders(baseUrl: string): Promise<SecurityHeaderCheck[]> {
    const checks: SecurityHeaderCheck[] = [];
    try {
      const res = await httpRequest({ url: baseUrl, method: 'GET', timeout: 5000 });
      for (const h of REQUIRED_HEADERS) {
        const val = res.headers[h.name.toLowerCase()];
        checks.push({
          header: h.name,
          present: !!val,
          value: val,
          recommended: h.recommended,
          severity: h.severity,
        });
      }
    } catch { /* ignore */ }
    return checks;
  }

  private deduplicateVulns(vulns: DastAttackResult[]): DastAttackResult[] {
    const seen = new Set<string>();
    return vulns.filter(v => {
      const key = `${v.endpoint}-${v.type}-${v.paramName || ''}-${v.payload?.slice(0, 30) || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
