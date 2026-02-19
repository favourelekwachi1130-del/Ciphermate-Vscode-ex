/**
 * AI-Powered Response Analyzer for DAST
 *
 * Uses AI to detect vulnerabilities from HTTP responses:
 * - SQL error messages in responses
 * - XSS reflection / payload reflection
 * - Sensitive data exposure
 * - SSRF evidence (metadata, internal content)
 *
 * Reduces false positives and increases detection accuracy vs rule-only checks.
 */

import * as vscode from 'vscode';
import { AttackPayload, ATTACK_PAYLOADS } from './attack-payloads';
import { DastAttackResult } from './types';

export interface AnalyzeRequest {
  url: string;
  method: string;
  paramName?: string;
  paramLocation?: string;
  payload: string;
  attackCategory: string;
  statusCode: number;
  responseBody: string;
  responseHeaders: Record<string, string>;
  baselineBody?: string;
  baselineStatus?: number;
}

/** Rule-based analysis (fast, no AI) */
export function analyzeResponseRules(req: AnalyzeRequest): DastAttackResult | null {
  const body = (req.responseBody || '').toLowerCase();
  const bodySlice = body.slice(0, 5000);

  const attackPayload = ATTACK_PAYLOADS.find(
    (p) => p.category === req.attackCategory || p.name.toLowerCase().includes(req.attackCategory.toLowerCase())
  );

  if (attackPayload?.sqlErrorPatterns) {
    for (const pat of attackPayload.sqlErrorPatterns) {
      const re = new RegExp(pat, 'i');
      if (re.test(bodySlice)) {
        const match = bodySlice.match(re);
        return {
          type: 'sql-injection',
          severity: 'critical',
          title: 'SQL Injection - Error-based',
          description: `Response contains database error suggesting SQL injection. Parameter: ${req.paramName || 'unknown'}`,
          endpoint: req.url,
          method: req.method,
          payload: req.payload,
          paramName: req.paramName,
          paramLocation: req.paramLocation,
          evidence: match ? match[0].slice(0, 200) : 'Database error in response',
          recommendation: 'Use parameterized queries or prepared statements. Never concatenate user input into SQL.',
          cwe: ['CWE-89'],
          cvss: 9.8,
          metadata: { analyzer: 'rule-based', pattern: pat },
        };
      }
    }
  }

  if (attackPayload?.vulnIndicators) {
    for (const ind of attackPayload.vulnIndicators) {
      if (bodySlice.includes(ind.toLowerCase())) {
        return {
          type: req.attackCategory,
          severity: (attackPayload.severity as DastAttackResult['severity']) || 'high',
          title: `${req.attackCategory} - Potential vulnerability`,
          description: `Response contains indicator "${ind}" suggesting possible exploitation.`,
          endpoint: req.url,
          method: req.method,
          payload: req.payload,
          paramName: req.paramName,
          paramLocation: req.paramLocation,
          evidence: ind,
          recommendation: 'Validate and sanitize all user input. Restrict internal resource access.',
          cwe: getCweForCategory(req.attackCategory),
          metadata: { analyzer: 'rule-based', indicator: ind },
        };
      }
    }
  }

  // XSS: check if payload is reflected in response
  if (req.attackCategory === 'xss' && req.payload) {
    const escaped = req.payload.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(escaped.slice(0, 50), 'i').test(bodySlice)) {
      return {
        type: 'xss',
        severity: 'high',
        title: 'Reflected XSS - Payload reflected',
        description: 'Attack payload is reflected in response without encoding.',
        endpoint: req.url,
        method: req.method,
        payload: req.payload,
        paramName: req.paramName,
        paramLocation: req.paramLocation,
        evidence: 'Payload found in response body',
        recommendation: 'Encode output. Use Content-Security-Policy. Validate/sanitize input.',
        cwe: ['CWE-79'],
        cvss: 6.1,
        metadata: { analyzer: 'rule-based' },
      };
    }
  }

  return null;
}

function getCweForCategory(cat: string): string[] {
  const map: Record<string, string[]> = {
    'sql-injection': ['CWE-89'],
    'xss': ['CWE-79'],
    'ssrf': ['CWE-918'],
    'path-traversal': ['CWE-22'],
    'command-injection': ['CWE-78'],
    'xxe': ['CWE-611'],
    'jwt': ['CWE-347'],
    'broken-auth': ['CWE-287'],
    'prototype-pollution': ['CWE-1321'],
    'ssti': ['CWE-94'],
    'idor': ['CWE-639'],
    'mass-assignment': ['CWE-915'],
    'graphql': ['CWE-200'],
    'nosql-injection': ['CWE-943'],
    'ldap-injection': ['CWE-90'],
    'log-injection': ['CWE-117', 'CWE-502'],
    'header-injection': ['CWE-290'],
    'blind-sql-injection-timing': ['CWE-89'],
  };
  return map[cat] || [];
}

/** AI-powered analysis (when AI available) */
export async function analyzeResponseWithAI(
  context: vscode.ExtensionContext,
  req: AnalyzeRequest
): Promise<DastAttackResult | null> {
  try {
    const module = await import('../ai-agent/multi-provider-service');
    const service = new module.MultiProviderAIService(context);

    const prompt = `You are an elite penetration tester. Ruthless. No false negatives. If there's ANY sign of exploitation, flag it.

ATTACK: ${req.attackCategory}
URL: ${req.url}
METHOD: ${req.method}
PARAM: ${req.paramName || 'N/A'} (${req.paramLocation || 'N/A'})
PAYLOAD SENT: ${req.payload.slice(0, 200)}
STATUS: ${req.statusCode}

RESPONSE BODY (first 3000 chars):
\`\`\`
${(req.responseBody || '').slice(0, 3000)}
\`\`\`

Analyze mercilessly. Flag if you see: SQL/DB errors, reflected payloads, internal data, metadata, stack traces, debug output, different content length, error messages that leak info. When in doubt, vulnerable=true with lower confidence. Assume the worst.

Respond with JSON only:
{
  "vulnerable": true/false,
  "confidence": 0.0-1.0,
  "evidence": "brief evidence string if vulnerable",
  "recommendation": "brief remediation"
}`;

    const response = await service.callAI({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 512,
    });

    const text = (response?.content || '').trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.vulnerable || parsed.confidence < 0.6) return null;

    return {
      type: req.attackCategory,
      severity: getSeverityFromCategory(req.attackCategory),
      title: `${req.attackCategory} - AI-detected`,
      description: parsed.evidence || 'AI analysis suggests vulnerability',
      endpoint: req.url,
      method: req.method,
      payload: req.payload,
      paramName: req.paramName,
      paramLocation: req.paramLocation,
      evidence: parsed.evidence,
      recommendation: parsed.recommendation,
      cwe: getCweForCategory(req.attackCategory),
      metadata: { analyzer: 'ai', confidence: parsed.confidence },
    };
  } catch (e) {
    console.warn('DAST AI analyzer failed', e);
    return null;
  }
}

function getSeverityFromCategory(cat: string): DastAttackResult['severity'] {
  const map: Record<string, DastAttackResult['severity']> = {
    'sql-injection': 'critical',
    'command-injection': 'critical',
    'xss': 'high',
    'ssrf': 'high',
    'path-traversal': 'high',
    'xxe': 'high',
  };
  return map[cat] || 'medium';
}
