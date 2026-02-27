/**
 * Agent Orchestrator - Bot system that launches AI-powered attacks
 *
 * Flow:
 * 1. One strong AI call (strategist) - OpenRouter
 * 2. Many parallel HTTP requests - rule-based payload execution
 * 3. Collect "promising" findings (anomalous responses, no confirm)
 * 4. Spawn 5-10 specialized deep-dive agents (Ollama) for promising findings
 * 5. Aggregate results
 *
 * Resilient: retries, circuit breaker, graceful degradation.
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
import { buildTargetContext } from './target-context';
import { getAttackStrategy } from './ai-attack-strategist';
import {
  getPayloadsForCategory,
  getPayloadLimit,
  getBrutalPayloads,
  AttackPayload,
} from './attack-payloads';
import { analyzeResponseRules, analyzeResponseWithAI, AnalyzeRequest } from './response-analyzer';
import { runWithConcurrency, getAdaptiveDelay, toCurl } from './http-client';
import { httpRequestWithRetry, resetCircuitBreaker } from './resilient-http';
import { mergeWithEvasion } from './waf-evasion';
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
import { runFileUploadAttacks } from './attacks/file-upload-attack';
import {
  PromisingFinding,
  runDeepDiveAgent,
  isPromisingFinding,
} from './deep-dive-agents';
import { dastEventBus } from './dast-event-bus';
import { hasBinary, runNuclei } from './external-tools';

const REQUIRED_HEADERS: Array<{ name: string; recommended: string; severity: 'critical' | 'high' | 'medium' | 'low' | 'info' }> = [
  { name: 'Strict-Transport-Security', recommended: 'max-age=31536000; includeSubDomains', severity: 'high' },
  { name: 'X-Content-Type-Options', recommended: 'nosniff', severity: 'medium' },
  { name: 'X-Frame-Options', recommended: 'DENY or SAMEORIGIN', severity: 'medium' },
  { name: 'Content-Security-Policy', recommended: "default-src 'self'", severity: 'medium' },
  { name: 'X-XSS-Protection', recommended: '0 (legacy)', severity: 'low' },
];

export class AgentOrchestrator {
  constructor(private context: vscode.ExtensionContext) {}

  async run(config: DastScanConfig & { enableDeepDive?: boolean }): Promise<DastScanResult> {
    const startTime = Date.now();
    const sessionId = `dast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const vulnerabilities: DastAttackResult[] = [];
    let endpointsTested = 0;
    let attacksPerformed = 0;
    const pentest = config.pentestMode ?? false;
    const brutal = config.brutalMode ?? pentest ?? false;
    const wafEvasion = config.wafEvasion ?? (pentest || brutal);
    const unrestricted = config.unrestrictedMode ?? false;
    const deepDive = config.enableDeepDive ?? true;
    const concurrency = unrestricted ? (config.concurrency ?? 80) : pentest ? (config.concurrency ?? 50) : brutal ? Math.min(config.concurrency ?? 10, 20) : Math.min(config.concurrency ?? 5, 15);
    let delay = (unrestricted || brutal) ? 0 : (config.delayBetweenRequestsMs ?? 80);
    const useAI = config.enableAIResponseAnalysis ?? true;
    const timeout = config.requestTimeoutMs ?? 10000;

    const ev = (type: import('./dast-event-bus').DastEventType, data?: Record<string, unknown>) => {
      dastEventBus.push({ type, ts: Date.now(), sessionId, data });
    };

    ev('scan_started', { targetUrl: config.targetUrl });
    resetCircuitBreaker(config.targetUrl);

    try {
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const endpoints = await this.discoverEndpoints(config, workspacePath);
      ev('endpoint_discovered', { count: endpoints.length, paths: endpoints.slice(0, 20).map(e => e.path || e.url) });
      const maxEndpoints = unrestricted ? (config.maxEndpoints ?? 1000) : pentest ? (config.maxEndpoints ?? 300) : brutal ? Math.min(config.maxEndpoints ?? 50, 100) : (config.maxEndpoints ?? 30);
      let toTest = endpoints.slice(0, maxEndpoints);

      let profile: Awaited<ReturnType<typeof buildTargetContext>> | null = null;
      let strategy: Awaited<ReturnType<typeof getAttackStrategy>> | null = null;

      if (config.enableContextAware !== false && endpoints.length > 0) {
        try {
          ev('strategist_started');
          profile = await buildTargetContext(config.targetUrl, workspacePath, config.auth, timeout);
          ev('target_context_built', { stackSummary: profile.stackSummary, database: profile.database, hasGraphql: profile.hasGraphql });
          strategy = await getAttackStrategy(this.context, profile, endpoints);
          ev('strategist_completed', { categories: strategy.prioritizedCategories, rationale: strategy.rationale });
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
          console.warn('Orchestrator context/strategy failed', e);
        }
      }

      const categories: DastAttackCategory[] =
        config.attackCategories?.length
          ? config.attackCategories
          : strategy
            ? strategy.prioritizedCategories.filter(c => !strategy!.skipCategories.includes(c))
            : brutal
              ? ['sql-injection', 'nosql-injection', 'xss', 'ssti', 'ssrf', 'path-traversal', 'command-injection', 'mass-assignment', 'prototype-pollution']
              : ['sql-injection', 'xss', 'ssrf', 'idor', 'mass-assignment'];

      const securityHeaders = await this.checkSecurityHeaders(config.targetUrl);

      if (brutal) {
        const headerVulns = await runHeaderInjectionAttacks(config.targetUrl, config.auth, timeout);
        for (const v of headerVulns) {
          ev('vuln_confirmed', { type: v.type, endpoint: v.endpoint, severity: v.severity, title: v.title, isHighPlus: v.severity === 'critical' || v.severity === 'high' });
        }
        vulnerabilities.push(...headerVulns);
      }

      if (config.enableGraphQL !== false) {
        const gqlVulns = await runGraphQLAttacks(config.targetUrl, '', config.auth, timeout);
        for (const v of gqlVulns) {
          ev('vuln_confirmed', { type: v.type, endpoint: v.endpoint, severity: v.severity, title: v.title, isHighPlus: v.severity === 'critical' || v.severity === 'high' });
        }
        vulnerabilities.push(...gqlVulns);
      }

      type AttackTask = {
        endpoint: DastEndpoint;
        targetUrl: string;
        category: DastAttackCategory;
        payload: string;
        paramName: string;
        attack: AttackPayload;
        injectAsJson?: boolean;
      };

      const paramFocus = strategy?.paramFocus;
      const customPayloadsByCat = strategy?.customPayloads || {};
      const promisingFindings: PromisingFinding[] = [];
      const baselineCache = new Map<string, { status: number; body: string }>();

      const tasks: AttackTask[] = [];
      for (const ep of toTest) {
        const targetUrl = ep.url.startsWith('http') ? ep.url : config.targetUrl.replace(/\/$/, '') + ep.path;
        endpointsTested++;

        for (const cat of categories) {
          if (cat === 'graphql' || cat === 'idor' || cat === 'jwt') continue;
          const payloads = getPayloadsForCategory(cat);
          const payloadLimit = brutal ? getPayloadLimit(cat, true) : (config.maxPayloadsPerParam ?? 4);
          const customForCat = customPayloadsByCat[cat] || [];
          for (const attack of payloads.slice(0, brutal ? 4 : 2)) {
            let paramNames = (ep.parameters || [])
              .filter(p => p.in === 'query' || p.in === 'body')
              .map(p => p.name);
            if (paramNames.length === 0) paramNames = ['id', 'q', 'search', 'query', 'name', 'filter', 'user', 'id'];
            if (paramFocus?.length) paramNames = [...new Set([...paramFocus, ...paramNames])].slice(0, 4);
            else paramNames = paramNames.slice(0, 3);

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

      const results = await runWithConcurrency(
        tasks,
        concurrency,
        async (task): Promise<{ vuln: DastAttackResult | null; promising?: PromisingFinding }> => {
          if (config.adaptiveThrottling !== false && delay > 0) await this.delay(delay);

          const injected = this.injectPayload(
            task.targetUrl,
            task.endpoint.method,
            task.paramName,
            task.payload,
            task.injectAsJson,
            wafEvasion
          );

          ev('payload_sent', {
            url: injected.url,
            category: task.category,
            param: task.paramName,
            payload: String(task.payload).slice(0, 100),
          });

          const resp = await httpRequestWithRetry({
            url: injected.url,
            method: injected.method,
            headers: injected.headers,
            body: injected.body,
            auth: config.auth,
            timeout: unrestricted ? (timeout + 15000) : timeout,
            maxRetries: unrestricted ? (config.resilienceRetries ?? 12) : (config.resilienceRetries ?? 3),
            circuitBreakerThreshold: unrestricted ? 999 : (config.resilienceCircuitThreshold ?? 5),
            retryOn403: wafEvasion,
            evasionUrl: wafEvasion ? injected.url : undefined,
          });

          if (config.adaptiveThrottling && (resp.status === 429 || resp.status === 503)) {
            delay = getAdaptiveDelay(resp.status, delay, resp.headers['retry-after']);
          }

          ev('response_received', {
            url: injected.url,
            status: resp.status,
            bodyLen: resp.body?.length ?? 0,
            snippet: String(resp.body || '').slice(0, 200),
          });

          const key = `${task.targetUrl}::${task.paramName}`;
          const baseline = baselineCache.get(key);
          if (!baseline) baselineCache.set(key, { status: resp.status, body: resp.body });

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
            baselineBody: baseline?.body,
            baselineStatus: baseline?.status,
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
            (vuln as any).responseSnippet = (resp.body || '').slice(0, 3000);
            (vuln as any).responseStatus = resp.status;
            ev('vuln_confirmed', {
              type: vuln.type,
              endpoint: vuln.endpoint,
              severity: vuln.severity,
              title: vuln.title,
              isHighPlus: vuln.severity === 'critical' || vuln.severity === 'high',
            });
            return { vuln };
          }

          if (deepDive && profile && isPromisingFinding(
            task.category,
            task.payload,
            resp.status,
            resp.body,
            baseline?.body,
            baseline?.status
          )) {
            ev('promising_finding', {
              url: injected.url,
              category: task.category,
              param: task.paramName,
              status: resp.status,
            });
            return {
              vuln: null,
              promising: {
                url: injected.url,
                method: injected.method,
                paramName: task.paramName,
                category: task.category,
                payload: task.payload,
                responseStatus: resp.status,
                responseSnippet: resp.body.slice(0, 1500),
                endpoint: task.endpoint,
                reason: 'anomalous response',
              },
            };
          }
          return { vuln: null };
        }
      );

      for (const r of results) {
        if (r?.vuln) vulnerabilities.push(r.vuln);
        if (r?.promising) promisingFindings.push(r.promising);
      }
      attacksPerformed = tasks.length;

      if (deepDive && profile && promisingFindings.length > 0) {
        const maxAgents = pentest ? (config.maxDeepDiveAgents ?? 100) : (config.maxDeepDiveAgents ?? 10);
        const agentsPerFinding = pentest ? (config.agentsPerFinding ?? 4) : 1;
        const expanded = promisingFindings.flatMap((f) => Array(agentsPerFinding).fill(f));
        const toDeepDive = expanded.slice(0, maxAgents);
        for (const f of toDeepDive) {
          ev('deep_dive_spawned', { url: f.url, category: f.category });
        }
        const deepConcurrency = pentest ? 10 : 3;
        const deepResults = await runWithConcurrency(
          toDeepDive,
          deepConcurrency,
          async (finding) => runDeepDiveAgent(this.context, finding, profile!, config.auth, timeout)
        );
        for (const vulns of deepResults) {
          if (vulns?.length) {
            for (const v of vulns) {
              ev('deep_dive_result', { type: v.type, endpoint: v.endpoint, severity: v.severity });
              ev('vuln_confirmed', {
                type: v.type,
                endpoint: v.endpoint,
                severity: v.severity,
                title: v.title,
                isHighPlus: v.severity === 'critical' || v.severity === 'high',
              });
              vulnerabilities.push(v);
            }
          }
        }
      }

      if (brutal) {
        for (const ep of toTest.slice(0, 15)) {
          const targetUrl = ep.url.startsWith('http') ? ep.url : config.targetUrl.replace(/\/$/, '') + ep.path;
          const paramNames = (ep.parameters || []).filter(p => p.in === 'query').map(p => p.name);
          const params = paramNames.length ? paramNames : ['id', 'q', 'search'];
          for (const param of params.slice(0, 2)) {
            const blind = await runBlindSqlTimingAttacks(targetUrl, ep.method, param, config.auth, timeout + 6000);
            if (blind) {
              ev('vuln_confirmed', { type: blind.type, endpoint: blind.endpoint, severity: blind.severity, title: blind.title, isHighPlus: blind.severity === 'critical' || blind.severity === 'high' });
              vulnerabilities.push(blind);
            }
            for (const v of await runNoSqlAttacks(targetUrl, ep.method, param, config.auth, timeout)) {
              ev('vuln_confirmed', { type: v.type, endpoint: v.endpoint, severity: v.severity, title: v.title, isHighPlus: v.severity === 'critical' || v.severity === 'high' });
              vulnerabilities.push(v);
            }
            for (const v of await runLogInjectionAttacks(targetUrl, ep.method, param, config.auth, 5000)) {
              ev('vuln_confirmed', { type: v.type, endpoint: v.endpoint, severity: v.severity, title: v.title, isHighPlus: v.severity === 'critical' || v.severity === 'high' });
              vulnerabilities.push(v);
            }
          }
        }
      }

      if (config.enableIdor !== false) {
        for (const ep of toTest.slice(0, 10)) {
          const targetUrl = ep.url.startsWith('http') ? ep.url : config.targetUrl.replace(/\/$/, '') + ep.path;
          const baseline = await httpRequestWithRetry({
            url: targetUrl,
            method: ep.method,
            auth: config.auth,
            timeout,
            maxRetries: 2,
          });
          const idorVulns = await runIdorAttacks(
            ep,
            config.targetUrl,
            { status: baseline.status, body: baseline.body },
            config.auth,
            timeout
          );
          for (const v of idorVulns) {
            ev('vuln_confirmed', { type: v.type, endpoint: v.endpoint, severity: v.severity, title: v.title, isHighPlus: v.severity === 'critical' || v.severity === 'high' });
            vulnerabilities.push(v);
          }
        }
      }

      if (config.enableJwtOAuth !== false && config.auth?.type === 'bearer') {
        for (const ep of toTest.filter(e => /login|auth|user|admin|me|profile/i.test(e.path || e.url)).slice(0, 5)) {
          const targetUrl = ep.url.startsWith('http') ? ep.url : config.targetUrl.replace(/\/$/, '') + ep.path;
          const jwtVulns = await runJwtAttacks(
            targetUrl,
            ep.method,
            { credentials: config.auth?.credentials },
            timeout
          );
          for (const v of jwtVulns) {
            ev('vuln_confirmed', { type: v.type, endpoint: v.endpoint, severity: v.severity, title: v.title, isHighPlus: v.severity === 'critical' || v.severity === 'high' });
            vulnerabilities.push(v);
          }
        }
      }

      if (config.enableFileUploadTests !== false && endpoints.length > 0) {
        const uploadVulns = await runFileUploadAttacks(
          [...toTest, ...endpoints],
          config.targetUrl,
          config.auth,
          timeout
        );
        for (const v of uploadVulns) {
          ev('vuln_confirmed', { type: v.type, endpoint: v.endpoint, severity: v.severity, title: v.title, isHighPlus: v.severity === 'critical' || v.severity === 'high' });
          vulnerabilities.push(v);
        }
      }

      if ((config.enableExternalTools ?? unrestricted) && (await hasBinary('nuclei'))) {
        ev('external_tool_started', { tool: 'nuclei' });
        try {
          const nucleiFindings = await runNuclei(config.targetUrl, { severity: ['critical', 'high', 'medium', 'low'] });
          for (const v of nucleiFindings) {
            ev('vuln_confirmed', { type: v.type, endpoint: v.endpoint, severity: v.severity, title: v.title });
            vulnerabilities.push(v);
          }
        } catch (e) {
          console.warn('Nuclei integration failed', e);
        }
      }

      const deduped = this.deduplicateVulns(vulnerabilities);
      ev('scan_completed', {
        success: true,
        endpointsTested,
        attacksPerformed,
        vulnCount: deduped.length,
        duration: Date.now() - startTime,
      });

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

      const highPlus = deduped
        .filter(v => v.severity === 'critical' || v.severity === 'high')
        .map(v => ({
          severity: v.severity,
          title: v.title,
          endpoint: v.endpoint,
          curlReplay: v.curlReplay,
        }));

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
        pentestHighPlusFindings: highPlus,
      };
    } catch (error: any) {
      ev('error', { message: error?.message || String(error) });
      ev('scan_completed', { success: false, error: error?.message });
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

  private injectPayload(
    url: string,
    method: string,
    paramName: string,
    payload: string,
    asJson = false,
    useEvasion = false
  ): { url: string; method: string; headers: Record<string, string>; body?: string } {
    try {
      const u = new URL(url);
      const base: Record<string, string> = { 'User-Agent': 'CipherMate-DAST/2.0', Accept: '*/*' };
      const headers = useEvasion ? mergeWithEvasion(base, url, true) : base;
      if (asJson) {
        (headers as Record<string, string>)['Content-Type'] = 'application/json';
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

  private async discoverEndpoints(config: DastScanConfig, workspacePath?: string): Promise<DastEndpoint[]> {
    const { discoverFromOpenApi, discoverUrlsFromWorkspace, urlsToEndpoints, inferRoutesFromCode } = await import('./endpoint-discovery');
    let endpoints: DastEndpoint[] = [];
    if (config.preDiscoveredApiUrls?.length) {
      endpoints = urlsToEndpoints(config.preDiscoveredApiUrls);
    }
    if (endpoints.length === 0 && (config.openApiPath || (config.discoverFromWorkspace && workspacePath))) {
      const fromSpec = await discoverFromOpenApi(workspacePath || '.', config.openApiPath);
      if (fromSpec.length > 0) endpoints = fromSpec;
    }
    if (endpoints.length === 0 && config.discoverFromWorkspace && workspacePath) {
      const inferred = inferRoutesFromCode(workspacePath);
      const baseUrl = config.targetUrl.replace(/\/$/, '');
      for (const ep of inferred) endpoints.push({ ...ep, url: baseUrl + ep.path });
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

  private async checkSecurityHeaders(baseUrl: string): Promise<SecurityHeaderCheck[]> {
    const checks: SecurityHeaderCheck[] = [];
    try {
      const res = await httpRequestWithRetry({ url: baseUrl, method: 'GET', timeout: 5000 });
      for (const h of REQUIRED_HEADERS) {
        const val = res.headers[h.name.toLowerCase()];
        checks.push({ header: h.name, present: !!val, value: val, recommended: h.recommended, severity: h.severity });
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
