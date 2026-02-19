/**
 * DAST (Dynamic Application Security Testing) / Surface Monitoring Types
 *
 * Replaces StackHawk & Intruder with AI-powered runtime testing of web apps & APIs.
 * Extended for insanely powerful feature set.
 */

import { Severity } from '../scanners/types';

export interface DastTarget {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';
  path?: string;
  headers?: Record<string, string>;
  body?: string | Record<string, unknown>;
  auth?: DastAuth;
  paramLocations?: ('query' | 'body' | 'header' | 'path')[];
}

export interface DastAuth {
  type: 'none' | 'basic' | 'bearer' | 'apiKey' | 'cookie';
  credentials?: string;
  headerName?: string;
  cookieName?: string;
  username?: string;
  password?: string;
}

export interface DastEndpoint {
  url: string;
  method: string;
  path: string;
  operationId?: string;
  parameters?: Array<{
    name: string;
    in: 'query' | 'path' | 'header' | 'body';
    required?: boolean;
    schema?: { type: string };
  }>;
  summary?: string;
  /** GraphQL: query/mutation name */
  graphqlOperation?: string;
  /** Path params for IDOR (e.g. /user/:id) */
  pathParams?: string[];
  /** Request body schema for mass assignment */
  bodySchema?: Record<string, unknown>;
}

export interface DastAttackResult {
  type: string;
  severity: Severity;
  title: string;
  description: string;
  endpoint: string;
  method: string;
  payload: string;
  paramName?: string;
  paramLocation?: string;
  evidence?: string;
  recommendation?: string;
  cwe?: string[];
  cvss?: number;
  metadata?: Record<string, unknown>;
  /** Curl command to replay the attack */
  curlReplay?: string;
  /** Exploitability: low | medium | high | critical */
  exploitability?: string;
}

export interface DastScanConfig {
  targetUrl: string;
  maxEndpoints?: number;
  maxPayloadsPerParam?: number;
  auth?: DastAuth;
  openApiPath?: string;
  discoverFromWorkspace?: boolean;
  enableAIResponseAnalysis?: boolean;
  attackCategories?: DastAttackCategory[];
  requestTimeoutMs?: number;
  delayBetweenRequestsMs?: number;
  /** Max concurrent requests (default 5) */
  concurrency?: number;
  /** Adaptive throttling when 429/503 received */
  adaptiveThrottling?: boolean;
  /** Enable GraphQL scanning if detected */
  enableGraphQL?: boolean;
  /** Enable JWT/OAuth tests */
  enableJwtOAuth?: boolean;
  /** Enable IDOR / broken access control */
  enableIdor?: boolean;
  /** Enable mass assignment tests */
  enableMassAssignment?: boolean;
  /** Enable SPA crawl (if Playwright available) */
  enableSpaCrawl?: boolean;
  /** Custom payload file path */
  customPayloadsPath?: string;
  /** DEMONIC MODE: Max payloads, no throttle, inferno attacks, timing checks. Destroys. */
  brutalMode?: boolean;
  /** 10x: AI + tool hand-in-hand. Fingerprint target, AI strategist picks attacks, adaptive payloads. */
  enableContextAware?: boolean;
  /** Spawn specialized deep-dive agents for promising findings (uses swarm provider) */
  enableDeepDive?: boolean;
  /** Retries for transient HTTP failures */
  resilienceRetries?: number;
  /** Consecutive 429/503 before circuit breaker opens */
  resilienceCircuitThreshold?: number;
  /** Pre-discovered API URLs (e.g. from brutal discovery) - use these as endpoints */
  preDiscoveredApiUrls?: string[];
  /** Enable file upload testing (polyglot, path traversal, etc.) */
  enableFileUploadTests?: boolean;
  /** PENTEST MODE: Max endpoints, concurrency, brutal payloads, agent swarm. Replaces Cobalt/XBOW. */
  pentestMode?: boolean;
  /** Max deep-dive agents to spawn for promising findings (default 10, pentest 100) */
  maxDeepDiveAgents?: number;
  /** 10x: Agents per promising finding - spawn N agents with different strategies (default 1, pentest 4) */
  agentsPerFinding?: number;
}

export type DastAttackCategory =
  | 'sql-injection'
  | 'xss'
  | 'ssrf'
  | 'path-traversal'
  | 'command-injection'
  | 'xxe'
  | 'broken-auth'
  | 'jwt'
  | 'graphql'
  | 'idor'
  | 'mass-assignment'
  | 'prototype-pollution'
  | 'ssti'
  | 'crlf-injection'
  | 'http-smuggling'
  | 'nosql-injection'
  | 'ldap-injection'
  | 'log-injection'
  | 'header-injection'
  | 'open-redirect'
  | 'parameter-pollution'
  | 'security-headers'
  | 'sensitive-data'
  | 'insecure-deserialization'
  | 'rate-limit'
  | 'file-upload'
  | 'all';

export interface DastScanResult {
  success: boolean;
  targetUrl: string;
  endpointsTested: number;
  attacksPerformed: number;
  vulnerabilities: DastAttackResult[];
  securityHeaders?: SecurityHeaderCheck[];
  duration: number;
  timestamp: Date;
  error?: string;
  /** SARIF-compatible export */
  sarif?: unknown;
  /** Executive summary for stakeholders */
  executiveSummary?: string;
  /** Pentest report: Critical+High findings for guarantee/audit */
  pentestHighPlusFindings?: Array<{ severity: string; title: string; endpoint: string; curlReplay?: string }>;
}

export interface SecurityHeaderCheck {
  header: string;
  present: boolean;
  value?: string;
  recommended: string;
  severity: Severity;
}

/** Plugin interface for extending DAST */
export interface DastAttackPlugin {
  id: string;
  name: string;
  description: string;
  categories: DastAttackCategory[];
  run(
    endpoint: DastEndpoint,
    baseUrl: string,
    auth?: DastAuth,
    context?: { httpRequest: (opts: HttpRequestOpts) => Promise<HttpResponse> }
  ): Promise<DastAttackResult[]>;
}

export interface HttpRequestOpts {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  auth?: DastAuth;
  timeout?: number;
}

export interface HttpResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
  durationMs?: number;
}
