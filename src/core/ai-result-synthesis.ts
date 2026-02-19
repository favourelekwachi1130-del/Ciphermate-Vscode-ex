/**
 * AI Result Synthesis - Combines SAST outputs, deduplicates, filters false positives
 * Takes: CipherMate SAST, Semgrep, Bandit (when available)
 * Returns: Unified, AI-filtered comprehensive report
 */

import * as vscode from 'vscode';

export interface RawFinding {
  tool: string;
  path?: string;
  file?: string;
  line?: number;
  message?: string;
  severity?: string;
  ruleId?: string;
  [key: string]: any;
}

export interface SynthesizedFinding {
  file: string;
  line: number;
  message: string;
  severity: string;
  tools: string[];
  confidence: number;
  aiSummary?: string;
}

export class AIResultSynthesis {
  private getAiService: () => any;

  constructor(getAiService: () => any) {
    this.getAiService = getAiService;
  }

  async synthesize(rawFindings: RawFinding[]): Promise<SynthesizedFinding[]> {
    if (rawFindings.length === 0) return [];

    const grouped = this.groupByLocation(rawFindings);
    const synthesized: SynthesizedFinding[] = [];

    for (const [, group] of grouped) {
      const tools = [...new Set(group.map((f: RawFinding) => f.tool))];
      const first = group[0];
      const file = first.path || first.file || '';
      const line = first.start?.line ?? first.line ?? 1;
      const message = first.extra?.message || first.message || first.issue_text || 'Security finding';

      const severity = this.mergeSeverity(group);
      const confidence = tools.length >= 2 ? 0.9 : 0.7;

      let aiSummary: string | undefined;
      if (group.length >= 2) {
        aiSummary = await this.getAiFilter(file, line, message, tools);
      }

      synthesized.push({
        file,
        line,
        message,
        severity,
        tools,
        confidence,
        aiSummary,
      });
    }

    return synthesized.sort((a, b) => this.severityOrder(a.severity) - this.severityOrder(b.severity));
  }

  private groupByLocation(findings: RawFinding[]): Map<string, RawFinding[]> {
    const map = new Map<string, RawFinding[]>();
    for (const f of findings) {
      const path = f.path || f.filename || f.file || '';
      const line = f.start?.line ?? f.line ?? 0;
      const key = `${path}:${line}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return map;
  }

  private mergeSeverity(group: RawFinding[]): string {
    const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
    let best = 'INFO';
    for (const f of group) {
      const s = (f.severity || f.extra?.severity || '').toUpperCase();
      if (order.indexOf(s) < order.indexOf(best)) best = s;
    }
    return best;
  }

  private severityOrder(s: string): number {
    const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
    return order[s?.toUpperCase()] ?? 5;
  }

  private async getAiFilter(file: string, line: number, message: string, tools: string[]): Promise<string | undefined> {
    const ai = this.getAiService?.();
    if (!ai?.generateCompletion) return undefined;

    const prompt = `Multiple SAST tools (${tools.join(', ')}) reported this finding. Is it likely a real vulnerability or false positive?

File: ${file}
Line: ${line}
Finding: ${message}

Reply in one short sentence. If likely real, say "Real: brief reason". If likely false positive, say "False positive: brief reason".`;
    try {
      const res = await ai.generateCompletion?.({ messages: [{ role: 'user', content: prompt }], maxTokens: 80 });
      const text = (res?.text ?? res?.content ?? '').trim();
      return text && text.length < 200 ? text : undefined;
    } catch {
      return undefined;
    }
  }
}
