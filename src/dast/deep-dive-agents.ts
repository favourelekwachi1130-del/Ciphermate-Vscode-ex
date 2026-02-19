/**
 * Deep-Dive Agents - Specialized AI agents for promising findings
 *
 * 5-10 agents, each hyper-focused:
 * - SQLi Specialist: MySQL/Postgres/Mongo-specific payloads
 * - NoSQL Specialist: $gt, $ne, operator injection
 * - Auth Breaker: session fixation, weak tokens
 * - SSTI Specialist: Jinja2, Handlebars, etc.
 * - XSS Hunter: encoding bypass, DOM contexts
 *
 * Spawned when rule-based scan finds "promising" (anomalous) responses.
 * Uses agent swarm provider (Ollama) for volume.
 */

import * as vscode from 'vscode';
import { DastEndpoint, DastAttackResult } from './types';
import { TargetProfile } from './target-context';
import { callDastAI } from './dast-ai';
import { generateContextualPayloads } from './ai-payload-generator';
import { httpRequestWithRetry } from './resilient-http';
import { analyzeResponseRules } from './response-analyzer';
import { toCurl } from './http-client';

export interface PromisingFinding {
  url: string;
  method: string;
  paramName: string;
  category: string;
  payload: string;
  responseStatus: number;
  responseSnippet: string;
  endpoint: DastEndpoint;
  /** Why this is promising (anomaly, partial match, etc.) */
  reason: string;
}

export type DeepDiveAgentRole =
  | 'sqli-specialist'
  | 'nosql-specialist'
  | 'auth-breaker'
  | 'ssti-specialist'
  | 'xss-hunter'
  | 'ssrf-specialist'
  | 'injection-generalist';

const AGENT_ROLES: DeepDiveAgentRole[] = [
  'sqli-specialist',
  'nosql-specialist',
  'auth-breaker',
  'ssti-specialist',
  'xss-hunter',
  'ssrf-specialist',
  'injection-generalist',
];

function getAgentForCategory(cat: string): DeepDiveAgentRole {
  const map: Record<string, DeepDiveAgentRole> = {
    'sql-injection': 'sqli-specialist',
    'nosql-injection': 'nosql-specialist',
    'broken-auth': 'auth-breaker',
    'jwt': 'auth-breaker',
    'ssti': 'ssti-specialist',
    'xss': 'xss-hunter',
    'ssrf': 'ssrf-specialist',
  };
  return map[cat] || 'injection-generalist';
}

/**
 * Run a deep-dive agent on a promising finding.
 * Generates stack-tailored payloads, runs them, returns any new vulns.
 */
export async function runDeepDiveAgent(
  context: vscode.ExtensionContext,
  finding: PromisingFinding,
  profile: TargetProfile,
  auth?: import('./types').DastAuth,
  timeout = 10000
): Promise<DastAttackResult[]> {
  const vulns: DastAttackResult[] = [];
  const role = getAgentForCategory(finding.category);

  try {
    const payloads = await generateContextualPayloads(context, {
      category: finding.category as any,
      paramName: finding.paramName,
      endpointPath: finding.endpoint.path || finding.url,
      targetProfile: profile,
      failedPayloads: [finding.payload],
      lastResponseSnippet: finding.responseSnippet,
      useSwarm: true,
    });

    if (payloads.length === 0) return vulns;

    const injectPayload = (urlStr: string, method: string, param: string, p: string, asJson = false) => {
      try {
        const u = new URL(urlStr);
        const headers: Record<string, string> = { 'User-Agent': 'CipherMate-DAST-DeepDive/1.0', Accept: '*/*' };
        if (asJson) {
          headers['Content-Type'] = 'application/json';
          return {
            url: u.toString(),
            method: method === 'GET' ? 'POST' : method,
            headers,
            body: p.startsWith('{') ? p : JSON.stringify({ [param]: p }),
          };
        }
        u.searchParams.set(param, p);
        return { url: u.toString(), method, headers };
      } catch {
        return { url: urlStr, method, headers: {} };
      }
    };

    const isJsonCategory = ['mass-assignment', 'prototype-pollution', 'nosql-injection', 'graphql'].includes(finding.category);

    for (const p of payloads.slice(0, 8)) {
      try {
        const injected = injectPayload(finding.url, finding.method, finding.paramName, p, isJsonCategory);
        const resp = await httpRequestWithRetry({
          url: injected.url,
          method: injected.method,
          headers: injected.headers,
          body: injected.body,
          auth,
          timeout,
          maxRetries: 2,
          circuitBreakerThreshold: 3,
        });

        const analyzeReq = {
          url: injected.url,
          method: injected.method,
          paramName: finding.paramName,
          paramLocation: isJsonCategory ? 'body' : 'query' as const,
          payload: p,
          attackCategory: finding.category,
          statusCode: resp.status,
          responseBody: resp.body,
          responseHeaders: resp.headers,
        };

        let vuln = analyzeResponseRules(analyzeReq);
        if (!vuln) {
          vuln = await analyzeWithSwarmAI(context, role, analyzeReq);
        }
        if (vuln) {
          vuln.curlReplay = toCurl(
            { url: injected.url, method: injected.method, headers: injected.headers, body: injected.body, auth }
          );
          vuln.metadata = { ...vuln.metadata, agent: role };
          vulns.push(vuln);
        }
      } catch (e) {
        console.warn(`Deep-dive agent ${role} failed for payload`, e);
      }
    }
  } catch (e) {
    console.warn(`Deep-dive agent ${role} failed`, e);
  }

  return vulns;
}

async function analyzeWithSwarmAI(
  context: vscode.ExtensionContext,
  role: string,
  req: {
    url: string;
    method: string;
    paramName?: string;
    paramLocation?: string;
    payload: string;
    attackCategory: string;
    statusCode: number;
    responseBody: string;
    responseHeaders: Record<string, string>;
  }
): Promise<DastAttackResult | null> {
  try {
    const response = await callDastAI(context, 'swarm', {
      messages: [{
        role: 'user',
        content: `You are a ${role}. Analyze this response for vulnerability.

ATTACK: ${req.attackCategory}
URL: ${req.url}
PARAM: ${req.paramName}
PAYLOAD: ${req.payload.slice(0, 150)}
STATUS: ${req.statusCode}

BODY (first 2000 chars):
\`\`\`
${(req.responseBody || '').slice(0, 2000)}
\`\`\`

Respond JSON only: {"vulnerable":true/false,"confidence":0.0-1.0,"evidence":"brief"}`,
      }],
      temperature: 0.2,
      max_tokens: 256,
    });

    const text = (response?.content || '').trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    if (!parsed.vulnerable || parsed.confidence < 0.7) return null;

    return {
      type: req.attackCategory,
      severity: 'high',
      title: `${req.attackCategory} - Deep-dive (${role})`,
      description: parsed.evidence || 'AI deep-dive detected',
      endpoint: req.url,
      method: req.method,
      payload: req.payload,
      paramName: req.paramName,
      paramLocation: req.paramLocation,
      evidence: parsed.evidence,
      metadata: { agent: role, confidence: parsed.confidence },
    };
  } catch {
    return null;
  }
}

/** Determine if a response is "promising" for deep-dive */
export function isPromisingFinding(
  category: string,
  payload: string,
  statusCode: number,
  responseBody: string,
  baselineBody?: string,
  baselineStatus?: number
): boolean {
  const body = (responseBody || '').toLowerCase();
  const partialIndicators = [
    'syntax', 'error', 'warning', 'exception', 'trace', 'stack',
    'unexpected', 'invalid', 'undefined', 'null', 'failed',
    'sql', 'query', 'mysql', 'postgres', 'mongo', 'oracle',
  ];
  for (const ind of partialIndicators) {
    if (body.includes(ind)) return true;
  }
  if (baselineBody && Math.abs(body.length - baselineBody.length) > 500) return true;
  if (baselineStatus && statusCode !== baselineStatus) return true;
  if (statusCode >= 500) return true;
  return false;
}
