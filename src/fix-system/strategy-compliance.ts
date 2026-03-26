/**
 * Strategy Compliance — Pre-apply check that fix aligns with vuln strategy (ECC-style)
 *
 * Runs lightweight rules derived from strategy checklist and dontPatterns
 * so we reject fixes that violate the strategy before they are applied.
 */

import type { VulnFixStrategy } from './vulnerability-fix-strategies';

export interface StrategyComplianceResult {
  passed: boolean;
  reason?: string;
}

/**
 * Check that fixed code does not violate strategy dontPatterns and meets
 * minimal checklist for the vulnerability type.
 */
export function checkStrategyCompliance(
  fixedCode: string,
  strategy: VulnFixStrategy,
  vulnType: string
): StrategyComplianceResult {
  const type = (vulnType || strategy.type || '').toLowerCase();
  const code = fixedCode;

  // SQL injection: must not use string concat/template in SQL; should use binding
  if (type.includes('sql') || type.includes('injection')) {
    const hasConcatInQuery = /\b(?:query|execute|raw)\s*\(\s*[^)]*[\+`]/.test(code) && /['"`].*SELECT|INSERT|UPDATE|DELETE|FROM|WHERE/.test(code);
    const hasTemplateInSql = /`[^`]*\$\{[^}]+\}[^`]*`/.test(code) && /query|execute|raw/.test(code);
    const hasParameterized = /\$1|\?|%s|:id|\[.*\]\s*\)|\.where\s*\(|prepare\s*\(|execute\s*\([^)]*,\s*\[/.test(code);
    if ((hasConcatInQuery || hasTemplateInSql) && !hasParameterized) {
      return { passed: false, reason: 'Fix still uses string concatenation or template in SQL; use parameterized queries or prepared statements.' };
    }
  }

  // Hardcoded secret: must not introduce new literal secrets
  if (type.includes('secret') || type.includes('hardcoded') || type.includes('credential')) {
    const hasEnvRead = /process\.env\.|getenv\s*\(|os\.environ|Environment\.GetEnvironmentVariable/i.test(code);
    const hasNewLiteral = /(?:password|apiKey|secret|token|apikey)\s*=\s*["'][^"']{6,}["']/i.test(code);
    if (hasNewLiteral && !hasEnvRead) {
      return { passed: false, reason: 'Fix still contains a hardcoded secret literal; use environment variables.' };
    }
  }

  // Command injection: must not use exec/spawn with string concat or template
  if (type.includes('command') || type.includes('exec')) {
    const dangerousExec = /(?:exec|execSync|spawn)\s*\([^)]*[\+`]/.test(code) || /(?:exec|spawn)\s*\([^)]*\$\{/.test(code);
    if (dangerousExec) {
      return { passed: false, reason: 'Fix still uses exec/spawn with string concatenation or template; use execFile with argument array or avoid user input in command.' };
    }
  }

  // XSS: must not assign raw user input to innerHTML/dangerouslySetInnerHTML without sanitize
  if (type.includes('xss')) {
    const rawInnerHtml = /innerHTML\s*=\s*\w+[^;]*;/.test(code) || /dangerouslySetInnerHTML\s*=\s*\{\s*__html:\s*\w+\s*\}/.test(code);
    const hasSanitize = /sanitize|escape|DOMPurify|textContent/.test(code);
    if (rawInnerHtml && !hasSanitize) {
      return { passed: false, reason: 'Fix assigns to innerHTML or dangerouslySetInnerHTML without sanitization; use textContent or sanitize first.' };
    }
  }

  return { passed: true };
}
