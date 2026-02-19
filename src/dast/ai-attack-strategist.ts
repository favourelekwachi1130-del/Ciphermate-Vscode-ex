/**
 * AI Attack Strategist - Context-Aware Attack Planning
 *
 * Given target profile + endpoints, AI recommends:
 * - Prioritized attack categories for this specific target
 * - Parameter focus per endpoint type
 * - Custom payloads tailored to the stack
 * - Attack order for maximum effectiveness
 *
 * 10x: AI and tool work hand-in-hand.
 */

import * as vscode from 'vscode';
import { TargetProfile } from './target-context';
import { DastEndpoint, DastAttackCategory } from './types';

export interface AttackStrategy {
  /** Categories to prioritize (in order) */
  prioritizedCategories: DastAttackCategory[];
  /** Params to focus on per endpoint pattern */
  paramFocus: string[];
  /** Custom payloads by category - AI-generated for this stack */
  customPayloads: Record<string, string[]>;
  /** Rationale - why this strategy */
  rationale: string;
  /** Endpoints to hit first (indices or patterns) */
  highValuePatterns: string[];
  /** Skip these (low value for this target) */
  skipCategories: DastAttackCategory[];
}

export async function getAttackStrategy(
  context: vscode.ExtensionContext,
  profile: TargetProfile,
  endpoints: DastEndpoint[],
  userHint?: string
): Promise<AttackStrategy> {
  try {
    const { callDastAI } = await import('./dast-ai');

    const endpointSummary = endpoints.slice(0, 15).map(e => ({
      path: e.path,
      method: e.method,
      params: e.parameters?.map(p => p.name) || [],
      summary: e.summary,
    }));

    const prompt = `You are an elite penetration tester. Plan the most effective DAST attack strategy for this SPECIFIC target.

TARGET PROFILE:
${profile.stackSummary}

${profile.database ? `Database detected: ${profile.database} - use DB-specific payloads.` : ''}
${profile.hasGraphql ? 'GraphQL present - include graphql category.' : ''}
${profile.hasJwt ? 'JWT/Auth detected - prioritize jwt, broken-auth.' : ''}
${profile.language ? `Language: ${profile.language}` : ''}

WORKSPACE DEPS (for context): ${JSON.stringify(Object.keys(profile.workspaceDeps).length ? profile.workspaceDeps : 'none')}
PARAM HINTS: ${profile.paramHints.join(', ')}

SAMPLE RESPONSES (detect patterns):
${profile.probeSamples.slice(0, 2).map(s => `URL: ${s.url} | Status: ${s.status} | Body snippet: ${s.bodySnippet.slice(0, 300)}...`).join('\n\n')}

ENDPOINTS:
${JSON.stringify(endpointSummary, null, 2)}

${userHint ? `USER FOCUS: ${userHint}` : ''}

Return JSON only:
{
  "prioritizedCategories": ["category1", "category2", ...],
  "paramFocus": ["id", "user", "filter", ...],
  "customPayloads": {
    "sql-injection": ["payload1", "payload2"],
    "nosql-injection": ["payload1"]
  },
  "rationale": "Brief reason for this strategy",
  "highValuePatterns": ["/user", "/admin", "/api/"],
  "skipCategories": ["category-to-skip"]
}

Rules:
- prioritizedCategories: max 8, ordered by effectiveness for THIS stack
- customPayloads: only categories you add payloads for; payloads must be executable (escape quotes in JSON)
- If MongoDB/NoSQL detected, include nosql-injection with $gt, $ne etc
- If MySQL/Postgres, prioritize sql-injection with DB-specific syntax
- If Node/Express, include prototype-pollution, ssti
- If Python/Django, include ssti with {{}} and server-side patterns
- highValuePatterns: path substrings that suggest sensitive endpoints`;

    const res = await callDastAI(context, 'strategist', {
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1500,
    });

    const text = (res?.content || '').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return getDefaultStrategy(profile);

    const parsed = JSON.parse(match[0]);
    return {
      prioritizedCategories: Array.isArray(parsed.prioritizedCategories)
        ? parsed.prioritizedCategories.filter((c: string) => isValidCategory(c))
        : getDefaultStrategy(profile).prioritizedCategories,
      paramFocus: Array.isArray(parsed.paramFocus) ? parsed.paramFocus : profile.paramHints,
      customPayloads: typeof parsed.customPayloads === 'object' ? parsed.customPayloads : {},
      rationale: String(parsed.rationale || ''),
      highValuePatterns: Array.isArray(parsed.highValuePatterns) ? parsed.highValuePatterns : [],
      skipCategories: Array.isArray(parsed.skipCategories) ? parsed.skipCategories.filter((c: string) => isValidCategory(c)) : [],
    };
  } catch (e) {
    console.warn('AI strategist failed, using context-aware defaults', e);
    return getDefaultStrategy(profile);
  }
}

const VALID_CATEGORIES: DastAttackCategory[] = [
  'sql-injection', 'xss', 'ssrf', 'path-traversal', 'command-injection', 'xxe',
  'broken-auth', 'jwt', 'graphql', 'idor', 'mass-assignment', 'prototype-pollution',
  'ssti', 'nosql-injection', 'ldap-injection', 'log-injection', 'header-injection',
  'crlf-injection', 'http-smuggling', 'open-redirect', 'parameter-pollution',
  'security-headers', 'sensitive-data', 'insecure-deserialization', 'rate-limit',
];

function isValidCategory(c: string): c is DastAttackCategory {
  return (VALID_CATEGORIES as string[]).includes(c);
}

function getDefaultStrategy(profile: TargetProfile): AttackStrategy {
  const categories: DastAttackCategory[] = ['sql-injection', 'xss', 'ssrf', 'idor', 'broken-auth', 'mass-assignment'];
  if (profile.database === 'MongoDB') categories.unshift('nosql-injection');
  if (profile.hasGraphql) categories.push('graphql');
  if (profile.hasJwt) categories.push('jwt');
  if (profile.frameworks.some(f => ['Express', 'NestJS'].includes(f))) {
    categories.push('prototype-pollution', 'ssti');
  }
  if (profile.frameworks.some(f => ['Django', 'Flask'].includes(f))) {
    categories.push('ssti');
  }
  return {
    prioritizedCategories: [...new Set(categories)],
    paramFocus: profile.paramHints,
    customPayloads: {},
    rationale: 'Context-aware defaults from target fingerprint',
    highValuePatterns: ['/api', '/user', '/admin', '/auth'],
    skipCategories: [],
  };
}
