/**
 * AI Security Analyzer - CipherMate's own AI-powered SAST
 * Phase 1: Two-stage flow (patterns → AI validate), confidence scoring, context windows
 * No paid tools. Uses configured AI (Ollama, OpenRouter, etc.) + pattern matching.
 */

import * as vscode from 'vscode';

export interface AISecurityFinding {
  line: number;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  confidence: number; // 0-100
  explanation?: string;
  fix?: string;
  type?: string;
}

export interface AnalyzeResult {
  issues: AISecurityFinding[];
  success: boolean;
}

export interface AnalyzeOptions {
  /** Validate pattern candidates with AI (slower, fewer false positives). Default true for full scan. */
  validateWithAI?: boolean;
  /** Min confidence to include (0-100). Default 40. */
  minConfidence?: number;
  /** Context lines around finding for AI. Default 10. */
  contextLines?: number;
}

const DEFAULT_OPTIONS: Required<AnalyzeOptions> = {
  validateWithAI: true,
  minConfidence: 40,
  contextLines: 10,
};

class AISecurityAnalyzer {
  private context: vscode.ExtensionContext | null = null;
  private aiService: any = null;

  init(context: vscode.ExtensionContext): void {
    this.context = context;
  }

  private async getAI(): Promise<any> {
    if (this.aiService) return this.aiService;
    if (!this.context) return null;
    try {
      const { MultiProviderAIService } = await import('../ai-agent/multi-provider-service');
      this.aiService = new MultiProviderAIService(this.context);
      return this.aiService;
    } catch {
      return null;
    }
  }

  async analyzeCode(content: string, filePath: string, options?: AnalyzeOptions): Promise<AnalyzeResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const lines = content.split('\n');

    // Stage 1: Pattern scan + AST rules → candidates (taint kept separate - high confidence)
    const patternCandidates = this.runPatternScan(lines);
    const astCandidates = this.runASTRules(content, filePath);
    const taintFindings = this.runTaintAnalysis(content, filePath);
    const candidates = this.mergeCandidates(patternCandidates, astCandidates);

    if (candidates.length === 0 && taintFindings.length === 0) {
      return { issues: [], success: true };
    }

    // Stage 2: AI validation for pattern/AST candidates (taint findings bypass - dataflow proven)
    let validated: AISecurityFinding[] = [...taintFindings];
    const ai = opts.validateWithAI ? await this.getAI() : null;

    if (ai && candidates.length > 0) {
      try {
        const aiValidated = await this.validateCandidatesWithAI(candidates, lines, filePath, ai, opts.contextLines);
        validated = [...validated, ...aiValidated];
      } catch {
        validated = [...validated, ...candidates.map((c) => ({ ...c, confidence: 45 }))];
      }
    } else if (candidates.length > 0) {
      validated = [...validated, ...candidates.map((c) => ({ ...c, confidence: 50 }))];
    }

    const filtered = validated.filter((f) => f.confidence >= opts.minConfidence);
    return { issues: filtered, success: true };
  }

  private runPatternScan(lines: string[]): Array<AISecurityFinding & { matchedText?: string }> {
    const findings: Array<AISecurityFinding & { matchedText?: string }> = [];

    const patterns: Array<{
      regex: RegExp;
      severity: AISecurityFinding['severity'];
      description: string;
      fix?: string;
      type?: string;
    }> = [
      { regex: /\beval\s*\(/g, severity: 'HIGH', description: 'eval() - code injection risk', fix: 'Avoid eval; use safe alternatives', type: 'code-injection' },
      { regex: /innerHTML\s*=/g, severity: 'HIGH', description: 'innerHTML with user data - XSS risk', fix: 'Use textContent or sanitize', type: 'xss' },
      { regex: /dangerouslySetInnerHTML/g, severity: 'HIGH', description: 'dangerouslySetInnerHTML - XSS risk', fix: 'Sanitize or use safe alternative', type: 'xss' },
      { regex: /document\.write\s*\(/g, severity: 'MEDIUM', description: 'document.write can enable XSS', type: 'xss' },
      { regex: /new Function\s*\(/g, severity: 'HIGH', description: 'Dynamic code creation - injection risk', type: 'code-injection' },
      { regex: /require\s*\(\s*['"`][^'"`]*\s*\+/g, severity: 'MEDIUM', description: 'Dynamic require - path traversal risk', type: 'path-traversal' },
      { regex: /fs\.readFile\s*\(\s*req\./g, severity: 'HIGH', description: 'User input in file path - path traversal', fix: 'Validate and sanitize paths', type: 'path-traversal' },
      { regex: /exec\s*\(\s*[^)]*\+/g, severity: 'CRITICAL', description: 'User input in exec() - command injection', fix: 'Use parameterized APIs', type: 'command-injection' },
      { regex: /child_process\.(exec|execSync)\s*\(/g, severity: 'HIGH', description: 'Child process exec - validate input', type: 'command-injection' },
      { regex: /['"`]\s*\+\s*req\.|['"`]\s*\+\s*params\.|['"`]\s*\+\s*query\.|['"`]\s*\+\s*body\./gi, severity: 'CRITICAL', description: 'User input concatenated - injection risk', fix: 'Use parameterized queries', type: 'sql-injection' },
      { regex: /md5\s*\(|createHash\s*\(\s*['"]md5['"]/gi, severity: 'MEDIUM', description: 'Weak MD5 hash', fix: 'Use SHA-256 or bcrypt', type: 'weak-crypto' },
      { regex: /Math\.random\s*\(\s*\)/g, severity: 'MEDIUM', description: 'Insecure random for security use', fix: 'Use crypto.randomBytes', type: 'weak-random' },
      { regex: /password\s*=\s*['"][^'"]+['"]|api[_-]?key\s*=\s*['"][^'"]+['"]/gi, severity: 'CRITICAL', description: 'Hardcoded secret', fix: 'Use environment variables', type: 'hardcoded-secret' },
      { regex: /localStorage\.setItem\s*\(\s*[^,]+,\s*[^)]*token|sessionStorage\.setItem\s*\(\s*[^,]+,\s*[^)]*password/gi, severity: 'HIGH', description: 'Sensitive data in storage', type: 'data-exposure' },
      { regex: /dangerouslySetInnerHTML|__html/gi, severity: 'HIGH', description: 'Dangerous HTML rendering', type: 'xss' },
      { regex: /url:\s*['"`]?\s*\+/g, severity: 'MEDIUM', description: 'Dynamic URL - SSRF risk', type: 'ssrf' },
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { regex, severity, description, fix, type } of patterns) {
        try {
          const oneMatch = new RegExp(regex.source, regex.flags.replace('g', ''));
          const m = line.match(oneMatch);
          if (m) {
            findings.push({
              line: i + 1,
              description,
              severity,
              confidence: 0, // Will be set by AI validation
              fix,
              type,
              matchedText: m[0]?.slice(0, 60),
            });
            break;
          }
        } catch {
          /* skip */
        }
      }
    }
    return findings;
  }

  private runASTRules(content: string, filePath: string): Array<AISecurityFinding & { matchedText?: string }> {
    try {
      const { runASTRules } = require('./ast-security-rules');
      const astFindings = runASTRules(content, filePath) as Array<{ line: number; description: string; severity: string; fix?: string; type?: string }>;
      return astFindings.map((f) => ({
        line: f.line,
        description: f.description,
        severity: f.severity as AISecurityFinding['severity'],
        confidence: 0,
        fix: f.fix,
        type: f.type,
      }));
    } catch {
      return [];
    }
  }

  private runTaintAnalysis(content: string, filePath: string): Array<AISecurityFinding & { matchedText?: string }> {
    try {
      const { runTaintAnalysis } = require('./taint-analyzer');
      const taintFindings = runTaintAnalysis(content, filePath);
      return taintFindings.map((f: { line: number; description: string; severity: string; fix?: string; type?: string }) => ({
        line: f.line,
        description: f.description,
        severity: f.severity as AISecurityFinding['severity'],
        confidence: 95,
        fix: f.fix,
        type: f.type,
      }));
    } catch {
      return [];
    }
  }

  private mergeCandidates(
    pattern: Array<AISecurityFinding & { matchedText?: string }>,
    ast: Array<AISecurityFinding & { matchedText?: string }>
  ): Array<AISecurityFinding & { matchedText?: string }> {
    const byLine = new Map<number, AISecurityFinding & { matchedText?: string }>();
    const severityOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
    for (const f of [...pattern, ...ast]) {
      const existing = byLine.get(f.line);
      if (!existing || (severityOrder[f.severity] ?? 5) <= (severityOrder[existing.severity] ?? 5)) {
        byLine.set(f.line, f);
      }
    }
    return Array.from(byLine.values()).sort((a, b) => a.line - b.line);
  }

  private getContextWindow(lines: string[], lineNum: number, contextLines: number): string {
    const start = Math.max(0, lineNum - 1 - contextLines);
    const end = Math.min(lines.length, lineNum - 1 + contextLines + 1);
    return lines
      .slice(start, end)
      .map((l, i) => {
        const actualLine = start + i + 1;
        const marker = actualLine === lineNum ? '>>> ' : '    ';
        return `${marker}${actualLine}| ${l}`;
      })
      .join('\n');
  }

  private async validateCandidatesWithAI(
    candidates: Array<AISecurityFinding & { matchedText?: string }>,
    lines: string[],
    filePath: string,
    ai: any,
    contextLines: number
  ): Promise<AISecurityFinding[]> {
    // Build one prompt with all candidates and their context
    const ext = filePath.split('.').pop() || 'js';
    const contextBlocks = candidates.map((c) => ({
      line: c.line,
      description: c.description,
      context: this.getContextWindow(lines, c.line, contextLines),
    }));

    const prompt = `You are a security analyst. For each code snippet below, determine if it's a REAL vulnerability or FALSE POSITIVE.
Consider: Is user input involved? Is it in production code? Could it be exploited?

File: ${filePath}
Language: ${ext}

${contextBlocks
  .map(
    (b, i) => `--- Candidate ${i + 1} (line ${b.line}): ${b.description} ---
${b.context}`
  )
  .join('\n\n')}

Reply with JSON only. For each candidate, set valid: true if real vulnerability, false if false positive.
If valid, include severity (CRITICAL/HIGH/MEDIUM/LOW) and brief explanation.
{"results":[{"line":${candidates[0]?.line},"valid":true/false,"severity":"...","explanation":"..."},...]}`;

    const response = await ai.callAI({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 1500,
    });

    const text = response?.content || response?.choices?.[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return candidates.map((c) => ({ ...c, confidence: 50 }));
    }

    let aiResults: Array<{ line: number; valid: boolean; severity?: string; explanation?: string }> = [];
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      aiResults = parsed.results || [];
    } catch {
      return candidates.map((c) => ({ ...c, confidence: 50 }));
    }

    const byLine = new Map<number, { line: number; valid?: boolean; severity?: string; explanation?: string }>();
    for (const r of aiResults) {
      if (r && typeof r.line === 'number') byLine.set(r.line, r);
    }

    const results: AISecurityFinding[] = [];
    for (const c of candidates) {
      const ar = byLine.get(c.line);
      if (ar && ar.valid === true) {
        const sev = ((ar.severity || c.severity) as string).toUpperCase().replace('WARNING', 'HIGH');
        results.push({
          line: c.line,
          description: c.description,
          severity: (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].includes(sev) ? sev : 'MEDIUM') as AISecurityFinding['severity'],
          confidence: 88,
          explanation: ar.explanation,
          fix: c.fix,
          type: c.type,
        });
      } else if (ar && ar.valid === false) {
        // Exclude - AI says false positive
      } else {
        results.push({ ...c, confidence: 55 });
      }
    }
    return results;
  }
}

let instance: AISecurityAnalyzer | null = null;

export function getAISecurityAnalyzer(): AISecurityAnalyzer {
  if (!instance) instance = new AISecurityAnalyzer();
  return instance;
}
