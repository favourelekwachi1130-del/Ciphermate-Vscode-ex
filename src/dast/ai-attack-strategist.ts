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
import { DAST_STRATEGIST_SYSTEM } from '../ai-agent/security-adversarial-prompts';

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
  userHint?: string,
  /** When true, AI generates 20-30 payloads per category (primary for main wave). */
  highPayloadVolume?: boolean
): Promise<AttackStrategy> {
  try {
    const { callDastAI } = await import('./dast-ai');

    const endpointSummary = endpoints.slice(0, 15).map(e => ({
      path: e.path,
      method: e.method,
      params: e.parameters?.map(p => p.name) || [],
      summary: e.summary,
    }));

    const useAdversarial = vscode.workspace.getConfiguration('ciphermate').get('ai.useAdversarialSecurityPrompts', true);
    const prompt = `Plan the most effective DAST attack strategy for this SPECIFIC target. Find real, exploitable vulnerabilities—not theoretical concerns.

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
${highPayloadVolume ? '\nMODE: HIGH VOLUME - Generate 20-30 unique, potent payloads per category. These will be the PRIMARY attack payloads. Include error-based, timing-based, blind, WAF bypass, and encoding variants.' : ''}

Return JSON only:
{
  "prioritizedCategories": ["category1", "category2", ...],
  "paramFocus": ["id", "user", "filter", ...],
  "customPayloads": {
    "sql-injection": ["payload1", "payload2", ...],
    "nosql-injection": ["payload1", ...]
  },
  "rationale": "Brief reason for this strategy",
  "highValuePatterns": ["/user", "/admin", "/api/"],
  "skipCategories": ["category-to-skip"]
}

Rules:
- prioritizedCategories: max 8, ordered by effectiveness for THIS stack
- customPayloads: CRITICAL - these are the PRIMARY attack payloads. Generate 20-30 payloads per category you include. Payloads must be executable, unique, and optimized for THIS target stack. Escape quotes in JSON.
- If MongoDB/NoSQL detected, include nosql-injection with $gt, $ne, $regex, $where etc. Include encoding variants.
- If MySQL/Postgres, prioritize sql-injection with DB-specific syntax (SLEEP, WAITFOR, UNION, error-based). Include WAF bypass variants.
- If Node/Express, include prototype-pollution, ssti
- If Python/Django, include ssti with {{}} and server-side patterns
- highValuePatterns: path substrings that suggest sensitive endpoints
- For each category: include payloads for error-based, timing-based, blind, and WAF bypass. Be diverse and potent.`;

    // Optional classic engine: attack strategy generation with workspace context
    const cfg = vscode.workspace.getConfiguration('ciphermate');
    let parsed: Record<string, unknown> | null = null;
    if (cfg.get('fixes.useKodeEngine', false)) {
      try {
        const { getKodeEngineAdapter } = await import('../fix-system/kode-engine-adapter');
        const kode = getKodeEngineAdapter({ context, kodePath: cfg.get('fixes.kodePath', 'kode') });
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const kodePrompt = useAdversarial ? `${DAST_STRATEGIST_SYSTEM}\n\n${prompt}` : prompt;
        parsed = await kode.getAttackStrategy(kodePrompt, workspaceRoot) as Record<string, unknown> | null;
      } catch {
        // fall through to standard AI
      }
    }

    if (!parsed) {
      const messages = useAdversarial
        ? [
            { role: 'system' as const, content: DAST_STRATEGIST_SYSTEM },
            { role: 'user' as const, content: prompt },
          ]
        : [{ role: 'user' as const, content: prompt }];
      const res = await callDastAI(context, 'strategist', {
        messages,
        temperature: 0.3,
        max_tokens: highPayloadVolume ? 4000 : 2000,
      });
      const text = (res?.content || '').trim();
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return getDefaultStrategy(profile);
      parsed = JSON.parse(match[0]);
    }
    const p = parsed!;
    return {
      prioritizedCategories: Array.isArray(p.prioritizedCategories)
        ? (p.prioritizedCategories as string[]).filter((c: string) => isValidCategory(c))
        : getDefaultStrategy(profile).prioritizedCategories,
      paramFocus: Array.isArray(p.paramFocus) ? p.paramFocus as string[] : profile.paramHints,
      customPayloads: typeof p.customPayloads === 'object' && p.customPayloads !== null ? p.customPayloads as Record<string, string[]> : {},
      rationale: String(p.rationale || ''),
      highValuePatterns: Array.isArray(p.highValuePatterns) ? p.highValuePatterns as string[] : [],
      skipCategories: Array.isArray(p.skipCategories) ? (p.skipCategories as string[]).filter((c: string) => isValidCategory(c)) : [],
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
