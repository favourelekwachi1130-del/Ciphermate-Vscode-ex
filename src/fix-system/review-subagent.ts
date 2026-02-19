/**
 * Review Subagent - Reviews proposed code fixes before application
 *
 * Acts as a quality gate: validates that fixes are correct, address the vulnerability,
 * and don't introduce obvious regressions. Uses AI when available, falls back to heuristics.
 */

import * as vscode from 'vscode';
import { FixProposal } from './types';
import { Vulnerability } from '../scanners/types';
import { getTaskGuard, TaskGuardResult } from './task-guard';

export interface ReviewResult {
  approved: boolean;
  confidence: number; // 0-1
  reason?: string;
  suggestions?: string[];
  guardResult?: TaskGuardResult;
}

export class ReviewSubagent {
  private taskGuard = getTaskGuard();
  private aiService: any = null;
  private context?: vscode.ExtensionContext;
  private initPromise: Promise<void> | null = null;

  constructor(context?: vscode.ExtensionContext) {
    this.context = context;
  }

  private async ensureAI(): Promise<void> {
    if (this.aiService) return;
    if (!this.context) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }
    this.initPromise = (async () => {
      try {
        const module = await import('../ai-agent/multi-provider-service');
        this.aiService = new module.MultiProviderAIService(this.context!);
      } catch {
        this.aiService = null;
      }
    })();
    await this.initPromise;
  }

  /**
   * Review a fix proposal before it is applied
   */
  async review(proposal: FixProposal): Promise<ReviewResult> {
    // 1. TaskGuard (always runs - rule-based)
    const guardResult = this.taskGuard.validate(proposal);
    if (!guardResult.passed) {
      return {
        approved: false,
        confidence: 0,
        reason: guardResult.reason || 'Fix failed validation',
        guardResult,
      };
    }

    // 2. AI review when available (optional enhancement)
    await this.ensureAI();
    if (this.aiService) {
      const aiReview = await this.reviewWithAI(proposal);
      if (aiReview) return aiReview;
    }

    // 3. Heuristic fallback - trust TaskGuard + confidence
    const confidence = proposal.confidence ?? 0.7;
    return {
      approved: confidence >= 0.5,
      confidence,
      reason: confidence < 0.5 ? 'Low confidence - manual review recommended' : undefined,
      guardResult,
      suggestions: guardResult.warnings,
    };
  }

  /**
   * AI-powered review of the fix
   */
  private async reviewWithAI(proposal: FixProposal): Promise<ReviewResult | null> {
    if (!this.aiService) return null;

    const vuln = proposal.vulnerability;
    const prompt = `You are a code review subagent. Review this security fix for correctness.

VULNERABILITY: ${vuln?.type || 'Unknown'} - ${vuln?.title || vuln?.description || 'Security issue'}

ORIGINAL CODE:
\`\`\`
${proposal.originalCode}
\`\`\`

PROPOSED FIX:
\`\`\`
${proposal.fixedCode}
\`\`\`

EXPLANATION: ${proposal.explanation}

Respond with JSON only:
{
  "approved": true/false,
  "confidence": 0.0-1.0,
  "reason": "brief reason",
  "suggestions": ["optional improvement 1", "optional improvement 2"]
}`;

    try {
      const response = await this.aiService.callAI({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 512,
      });

      const text = response?.content?.trim() || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          approved: parsed.approved === true,
          confidence: Math.min(1, Math.max(0, parseFloat(parsed.confidence) || 0.5)),
          reason: parsed.reason,
          suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : undefined,
        };
      }
    } catch (e) {
      console.warn('ReviewSubagent: AI review failed, using heuristics', e);
    }
    return null;
  }

  /**
   * Quick synchronous check - use TaskGuard only (no AI)
   */
  quickCheck(proposal: FixProposal): TaskGuardResult {
    return this.taskGuard.validate(proposal);
  }
}

let _instance: ReviewSubagent | null = null;

export function getReviewSubagent(context?: vscode.ExtensionContext): ReviewSubagent {
  if (!_instance) _instance = new ReviewSubagent(context);
  else if (context && !(_instance as any).context) (_instance as any).context = context;
  return _instance;
}
