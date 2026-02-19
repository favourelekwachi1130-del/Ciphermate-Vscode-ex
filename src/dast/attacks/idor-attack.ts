/**
 * IDOR / Broken Access Control Attack Module
 *
 * Tests: horizontal access (user A vs user B), vertical (user vs admin),
 * path parameter manipulation
 */

import { DastEndpoint, DastAttackResult, DastAuth } from '../types';
import { httpRequest, toCurl } from '../http-client';

const IDOR_PAYLOADS = ['0', '1', '-1', '2', '100', 'admin', '..', '../1', '999999'];

/** Extract path params like /user/:id, /api/user/123 */
function extractPathParamSlots(path: string): string[] {
  const parts = path.split('/').filter(Boolean);
  const slots: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (/^\d+$/.test(p) || /^[a-f0-9-]{8,}$/i.test(p)) {
      slots.push(p);
    }
  }
  return slots;
}

/** Build URL with replaced path segment */
function replacePathSegment(url: string, oldVal: string, newVal: string): string {
  return url.replace(new RegExp(`/${oldVal}(?=/|$)`, 'g'), `/${newVal}`);
}

export async function runIdorAttacks(
  endpoint: DastEndpoint,
  baseUrl: string,
  baselineResp: { status: number; body: string } | null,
  auth?: DastAuth,
  timeout = 10000
): Promise<DastAttackResult[]> {
  const vulns: DastAttackResult[] = [];
  const targetUrl = endpoint.url.startsWith('http') ? endpoint.url : baseUrl.replace(/\/$/, '') + endpoint.path;

  const pathSlots = extractPathParamSlots(endpoint.path || new URL(targetUrl).pathname);

  for (const slot of pathSlots.slice(0, 2)) {
    for (const payload of IDOR_PAYLOADS.slice(0, 5)) {
      if (payload === slot) continue;

      const modifiedUrl = replacePathSegment(targetUrl, slot, payload);
      const res = await httpRequest({
        url: modifiedUrl,
        method: endpoint.method,
        auth,
        timeout,
      });

      if (res.status === 200 && res.body) {
        const bodyLen = res.body.length;
        if (baselineResp && bodyLen > 100 && Math.abs(bodyLen - baselineResp.body.length) > 50) {
          vulns.push({
            type: 'idor',
            severity: 'high',
            title: 'Potential IDOR - Different response for modified ID',
            description: `Changing path param ${slot} to ${payload} returned different response. May indicate insecure direct object reference.`,
            endpoint: modifiedUrl,
            method: endpoint.method,
            payload,
            paramName: slot,
            paramLocation: 'path',
            evidence: `Response length ${bodyLen} vs baseline ${baselineResp.body.length}`,
            recommendation: 'Verify authorization for each resource. Use UUIDs. Check access control per object.',
            cwe: ['CWE-639'],
            cvss: 7.5,
            curlReplay: toCurl({ url: modifiedUrl, method: endpoint.method, headers: {} }),
          });
        }
      }
    }
  }

  return vulns;
}
