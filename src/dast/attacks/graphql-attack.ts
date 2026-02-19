/**
 * GraphQL Attack Module - Introspection, injection, batching
 */

import { DastEndpoint, DastAttackResult, DastAuth } from '../types';
import { httpRequest } from '../http-client';

const GRAPHQL_INTROSPECTION = JSON.stringify({
  query: '{ __schema { types { name } queries { name } mutations { name } } }',
});

const GRAPHQL_BATCH_DOS = JSON.stringify([
  { query: '{ __schema { types { name } } }' },
  { query: '{ __schema { types { name } } }' },
  { query: '{ __schema { types { name } } }' },
  { query: '{ __schema { types { name } } }' },
  { query: '{ __schema { types { name } } }' },
].map(q => ({ query: q.query })));

/** Detect GraphQL endpoint (common paths) */
export const GRAPHQL_PATHS = ['/graphql', '/api/graphql', '/query', '/gql', '/v1/graphql'];

export async function runGraphQLAttacks(
  baseUrl: string,
  path: string,
  auth?: DastAuth,
  timeout = 10000
): Promise<DastAttackResult[]> {
  const vulns: DastAttackResult[] = [];

  for (const gqlPath of GRAPHQL_PATHS) {
    const url = baseUrl.replace(/\/$/, '') + gqlPath;

    const res = await httpRequest({
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: GRAPHQL_INTROSPECTION,
      auth,
      timeout,
    });

    if (res.status === 200 && res.body) {
      const body = res.body.toLowerCase();
      if (body.includes('__schema') || body.includes('__typename') || body.includes('queryroot') || body.includes('mutation')) {
        vulns.push({
          type: 'graphql-introspection-enabled',
          severity: 'medium',
          title: 'GraphQL Introspection Enabled',
          description: `GraphQL schema introspection is enabled at ${url}. Attackers can enumerate schema, queries, and mutations.`,
          endpoint: url,
          method: 'POST',
          payload: GRAPHQL_INTROSPECTION,
          evidence: 'Introspection query returned schema data',
          recommendation: 'Disable introspection in production. Use graphql-disable-introspection or similar.',
          cwe: ['CWE-200'],
          cvss: 5.3,
        });
      }
    }
  }

  return vulns;
}
