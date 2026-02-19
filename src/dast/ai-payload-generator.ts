/**
 * AI Payload Generator - Context-Tailored Attack Payloads
 *
 * Given vulnerability type + target context + failed payloads,
 * AI generates new payloads optimized for this specific target.
 *
 * Hand-in-hand: tool tries payloads, AI adapts based on responses.
 */

import * as vscode from 'vscode';
import { TargetProfile } from './target-context';
import { DastAttackCategory } from './types';

export interface PayloadGenerationRequest {
  category: DastAttackCategory;
  paramName: string;
  endpointPath: string;
  targetProfile: TargetProfile;
  /** Payloads we tried that failed (to avoid repeats) */
  failedPayloads?: string[];
  /** Response snippet - did we get filtered? Error? */
  lastResponseSnippet?: string;
  /** Encoding that might bypass (url, double-url, unicode, etc.) */
  encodingHint?: string;
  /** Use swarm provider (Ollama) for volume - default false (uses primary) */
  useSwarm?: boolean;
}

export async function generateContextualPayloads(
  context: vscode.ExtensionContext,
  req: PayloadGenerationRequest
): Promise<string[]> {
  try {
    const callAI = req.useSwarm
      ? async (r: import('../ai-agent/providers/base-provider').AIRequest) => {
          const { callDastAI } = await import('./dast-ai');
          return callDastAI(context, 'swarm', r);
        }
      : async (r: import('../ai-agent/providers/base-provider').AIRequest) => {
          const module = await import('../ai-agent/multi-provider-service');
          const ai = new module.MultiProviderAIService(context);
          return ai.callAI(r);
        };

    const prompt = `You are a penetration tester. Generate 5-8 attack payloads for ${req.category} that are OPTIMIZED for this specific target.

TARGET: ${req.targetProfile.stackSummary}
${req.targetProfile.database ? `Database: ${req.targetProfile.database}` : ''}
${req.targetProfile.language ? `Language: ${req.targetProfile.language}` : ''}
Endpoint: ${req.endpointPath}
Parameter: ${req.paramName}

${req.failedPayloads?.length ? `ALREADY TRIED (avoid): ${req.failedPayloads.join(', ')}` : ''}
${req.lastResponseSnippet ? `Last response snippet: ${req.lastResponseSnippet.slice(0, 400)}` : ''}
${req.encodingHint ? `Try encoding: ${req.encodingHint}` : ''}

Return a JSON array of payload strings only. Payloads must be:
- Executable/valid for the attack type
- Tailored to the detected stack (e.g. MySQL vs PostgreSQL vs MongoDB syntax)
- If WAF likely: use encoding, comments, fragmentation
- Escape special chars for JSON: " → \\", \\ → \\\\

Example for sql-injection + MySQL: ["'+OR+1=1--","1' AND SLEEP(3)--","admin'#"]
Example for nosql-injection + MongoDB: ["{\\"$gt\\":\\"\\"}","{\\"$ne\\":null}"]

["payload1","payload2","payload3",...]`;

    const res = await callAI({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 1024,
    });

    const text = (res?.content || '').trim();
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) return [];

    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p: unknown): p is string => typeof p === 'string' && p.length > 0 && p.length < 500).slice(0, 8);
  } catch (e) {
    console.warn('AI payload generator failed', e);
    return [];
  }
}

/** After a response, AI suggests: try different encoding? try next param? */
export async function getAdaptiveSuggestions(
  context: vscode.ExtensionContext,
  category: DastAttackCategory,
  payload: string,
  responseStatus: number,
  responseSnippet: string,
  profile: TargetProfile
): Promise<{ nextPayloads?: string[]; tryEncoding?: string; tryParam?: string }> {
  try {
    const module = await import('../ai-agent/multi-provider-service');
    const ai = new module.MultiProviderAIService(context);

    const prompt = `Pen test in progress. We sent payload "${payload}" for ${category}. Response: status ${responseStatus}, body snippet: "${responseSnippet.slice(0, 500)}"

Target: ${profile.stackSummary}

The payload didn't clearly confirm vulnerability. What should we try next?
- Different payload for same param?
- URL encoding / double encoding?
- Different parameter?

Return JSON only:
{"nextPayloads": ["p1","p2"], "tryEncoding": "double-url" or null, "tryParam": "other_param_name" or null}`;

    const res = await ai.callAI({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 256,
    });

    const text = (res?.content || '').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return {};
    return JSON.parse(match[0]);
  } catch {
    return {};
  }
}
