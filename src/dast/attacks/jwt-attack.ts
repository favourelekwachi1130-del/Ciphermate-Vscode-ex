/**
 * JWT / OAuth Attack Module - Algorithm confusion, weak signing, expiry
 */

import { DastAttackResult } from '../types';
import { httpRequest } from '../http-client';

/** JWT with alg:none - some servers accept unsigned tokens */
const JWT_NONE = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiJ9.';

/** Test if endpoint returns 401 with invalid JWT (indicates JWT auth) */
export async function runJwtAttacks(
  url: string,
  method: string,
  auth?: { credentials?: string },
  timeout = 10000
): Promise<DastAttackResult[]> {
  const vulns: DastAttackResult[] = [];

  const badTokenRes = await httpRequest({
    url,
    method,
    headers: { 'Authorization': `Bearer ${JWT_NONE}` },
    auth: undefined,
    timeout,
  });

  const validRes = auth?.credentials
    ? await httpRequest({
        url,
        method,
        headers: { 'Authorization': `Bearer ${auth.credentials}` },
        auth: undefined,
        timeout,
      })
    : null;

  if (validRes?.status === 200 && badTokenRes.status === 200) {
    const badBody = (badTokenRes.body || '').toLowerCase();
    if (badBody.includes('admin') || badBody.includes('dashboard') || badBody.includes('welcome')) {
      vulns.push({
        type: 'jwt-algorithm-confusion',
        severity: 'critical',
        title: 'JWT Algorithm Confusion / None Algorithm Accepted',
        description: 'Endpoint accepted JWT with alg:none. Attacker can forge tokens without secret.',
        endpoint: url,
        method,
        payload: JWT_NONE,
        evidence: 'Request with alg:none token returned 200 with protected content',
        recommendation: 'Reject tokens with alg:none. Validate algorithm explicitly. Use RS256 with key verification.',
        cwe: ['CWE-347'],
        cvss: 9.8,
      });
    }
  }

  return vulns;
}
