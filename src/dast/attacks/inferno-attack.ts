/**
 * INFERNO ATTACK MODULE
 *
 * Demonic-grade attacks. No mercy.
 * - Header injection (X-Forwarded-For, X-Original-URL bypass)
 * - Blind SQLi timing detection
 * - Host header poisoning
 * - Parameter pollution
 */

import { DastEndpoint, DastAttackResult, DastAuth } from '../types';
import { httpRequest, toCurl } from '../http-client';
import {
  HEADER_INJECTION_INFERNO,
  BLIND_SQLI_TIMING,
  NOSQL_INFERNO,
  LOG_INJECTION_INFERNO,
  OPEN_REDIRECT_INFERNO,
} from '../inferno-payloads';

/** Header injection - test X-Forwarded-For, X-Original-URL for auth/cache bypass */
export async function runHeaderInjectionAttacks(
  baseUrl: string,
  auth?: DastAuth,
  timeout = 10000
): Promise<DastAttackResult[]> {
  const vulns: DastAttackResult[] = [];

  const baseline = await httpRequest({
    url: baseUrl,
    method: 'GET',
    auth,
    timeout,
  });

  for (const { header, value } of HEADER_INJECTION_INFERNO) {
    const res = await httpRequest({
      url: baseUrl,
      method: 'GET',
      headers: { [header]: value },
      auth,
      timeout,
    });

    if (res.status === 200 && res.body) {
      const bl = (baseline.body || '').toLowerCase();
      const rb = (res.body || '').toLowerCase();
      if (bl.includes('forbidden') && !rb.includes('forbidden')) {
        vulns.push({
          type: 'header-injection-bypass',
          severity: 'high',
          title: `Header Injection: ${header} bypasses access control`,
          description: `Adding ${header}: ${value} returned content that was forbidden without it. Possible IP/host spoofing.`,
          endpoint: baseUrl,
          method: 'GET',
          payload: `${header}: ${value}`,
          evidence: 'Different response with injected header',
          recommendation: 'Never trust X-Forwarded-*. Validate against actual connection. Use right-most value if multiple.',
          cwe: ['CWE-290'],
          cvss: 7.4,
          curlReplay: toCurl({
            url: baseUrl,
            method: 'GET',
            headers: { [header]: value },
          }),
        });
      }
    }
  }
  return vulns;
}

/** Blind SQLi - timing-based. If response takes 5+ seconds, likely vulnerable. */
export async function runBlindSqlTimingAttacks(
  url: string,
  method: string,
  paramName: string,
  auth?: DastAuth,
  timeout = 15000
): Promise<DastAttackResult | null> {
  const baselineStart = Date.now();
  await httpRequest({
    url,
    method,
    auth,
    timeout,
  });
  const baselineMs = Date.now() - baselineStart;

  for (const payload of BLIND_SQLI_TIMING) {
    try {
      const u = new URL(url);
      u.searchParams.set(paramName, payload);
      const start = Date.now();
      await httpRequest({
        url: u.toString(),
        method,
        auth,
        timeout,
      });
      const elapsed = Date.now() - start;
      if (elapsed >= 4500 && elapsed > baselineMs + 4000) {
        return {
          type: 'blind-sql-injection-timing',
          severity: 'critical',
          title: 'Blind SQL Injection (Time-based)',
          description: `Parameter ${paramName} delayed response by ~5s with SLEEP payload. Confirms blind SQLi.`,
          endpoint: url,
          method,
          payload,
          paramName,
          evidence: `Response delay: ${elapsed}ms (baseline: ${baselineMs}ms)`,
          recommendation: 'Use parameterized queries exclusively. Never concatenate user input into SQL.',
          cwe: ['CWE-89'],
          cvss: 9.8,
          exploitability: 'critical',
        };
      }
    } catch {
      // ignore
    }
  }
  return null;
}

/** NoSQL injection - MongoDB-style operators */
export async function runNoSqlAttacks(
  url: string,
  method: string,
  paramName: string,
  auth?: DastAuth,
  timeout = 10000
): Promise<DastAttackResult[]> {
  const vulns: DastAttackResult[] = [];
  const baseline = await httpRequest({ url, method, auth, timeout });

  for (const p of NOSQL_INFERNO.slice(0, 5)) {
    const u = new URL(url);
    u.searchParams.set(paramName, p.payload);
    const res = await httpRequest({
      url: u.toString(),
      method,
      auth,
      timeout,
    });

    if (res.status === 200 && res.body && res.body.length > baseline.body?.length * 1.5) {
      vulns.push({
        type: 'nosql-injection',
        severity: 'high',
        title: 'NoSQL Injection - Operator injection',
        description: `Parameter ${paramName} may be vulnerable to NoSQL operator injection. Response size increased.`,
        endpoint: u.toString(),
        method,
        payload: p.payload,
        paramName,
        evidence: `Response expanded with payload: ${p.payload}`,
        recommendation: 'Validate input types. Avoid passing user input directly to query operators.',
        cwe: ['CWE-943'],
        cvss: 8.1,
      });
      break;
    }
  }
  return vulns;
}

/** Log/JNDI injection - tests for log4j-style issues */
export async function runLogInjectionAttacks(
  url: string,
  method: string,
  paramName: string,
  auth?: DastAuth,
  timeout = 5000
): Promise<DastAttackResult[]> {
  const vulns: DastAttackResult[] = [];

  for (const p of LOG_INJECTION_INFERNO.slice(0, 2)) {
    const u = new URL(url);
    u.searchParams.set(paramName, p.payload);
    const res = await httpRequest({
      url: u.toString(),
      method,
      auth,
      timeout,
    });

    if (res.status === 500 || res.body?.toLowerCase().includes('jndi') || res.body?.toLowerCase().includes('lookup')) {
      vulns.push({
        type: 'log-injection-jndi',
        severity: 'critical',
        title: 'Potential JNDI/Log Injection',
        description: `Parameter ${paramName} with JNDI-like payload caused error or reflection. Check for Log4j-style vulnerabilities.`,
        endpoint: u.toString(),
        method,
        payload: p.payload,
        paramName,
        evidence: res.status === 500 ? 'Server error' : 'JNDI/lookup in response',
        recommendation: 'Upgrade logging libraries. Disable JNDI lookups. Sanitize log input.',
        cwe: ['CWE-117', 'CWE-502'],
        cvss: 10,
        exploitability: 'critical',
      });
    }
  }
  return vulns;
}
