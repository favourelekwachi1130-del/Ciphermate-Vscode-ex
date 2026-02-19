/**
 * Task Guard - Pre-apply validation for code fixes
 *
 * Validates that a fix proposal meets quality gates BEFORE it can be applied.
 * Catches: comment-only fixes, language mismatches, no-op changes, obvious hallucinations.
 */

import * as path from 'path';
import { FixProposal } from './types';
import { Vulnerability } from '../scanners/types';

export interface TaskGuardResult {
  passed: boolean;
  reason?: string;
  warnings: string[];
}

/** Python-only patterns that must NOT appear in non-Python files */
const PYTHON_PATTERNS = [
  /\bos\.environ\.get\s*\(/,
  /\bos\.environ\[/,
  /\bimport\s+os\b/,
  /\bfrom\s+os\s+import/,
];

/** PHP-only patterns */
const PHP_PATTERNS = [
  /\bgetenv\s*\(/,
  /\$\w+\s*=\s*getenv/,
];

/** JS/TS patterns */
const JS_PATTERNS = [
  /\bprocess\.env\.\w+/,
  /\brequire\s*\(/,
  /\bmodule\.exports\b/,
];

export class TaskGuard {
  /**
   * Validate a fix proposal before it can be applied
   */
  validate(proposal: FixProposal): TaskGuardResult {
    const warnings: string[] = [];
    const vuln = proposal.vulnerability;
    const filePath = vuln?.file || '';
    const originalCode = (proposal.originalCode || '').trim();
    const fixedCode = (proposal.fixedCode || '').trim();

    // 1. Must have actual fixed code
    if (!fixedCode) {
      return { passed: false, reason: 'No fix code provided', warnings };
    }

    // 2. Reject comment-only advice blocks (same patterns as FixService.isCommentOnlyFix)
    if (fixedCode.includes('// Hardcoded Secret Prevention:') || fixedCode.includes('// XSS Prevention:') ||
        fixedCode.includes('// SQL Injection Prevention:') || fixedCode.includes('// Command Injection Prevention:') ||
        fixedCode.includes('// Path Traversal Prevention:')) {
      return { passed: false, reason: 'Fix is advice only, not executable code', warnings };
    }
    if (this.isPredominantlyComments(fixedCode)) {
      return { passed: false, reason: 'Fix is mostly comments, not executable code', warnings };
    }

    // 3. Fix must meaningfully differ from original (not a no-op)
    const origNorm = this.normalizeForCompare(originalCode);
    const fixedNorm = this.normalizeForCompare(fixedCode);
    if (origNorm === fixedNorm) {
      return { passed: false, reason: 'Fix does not change the code', warnings };
    }

    // 4. Language consistency - fixed code must match file language
    const ext = path.extname(filePath).toLowerCase();
    const langCheck = this.checkLanguageConsistency(fixedCode, ext);
    if (!langCheck.consistent) {
      return { passed: false, reason: langCheck.reason || 'Fix uses wrong language syntax', warnings };
    }
    if (langCheck.warning) warnings.push(langCheck.warning);

    // 5. Fix must address the vulnerability type
    const vulnType = (vuln?.type || '').toLowerCase();
    const fixAddressesVuln = this.fixAddressesVulnerability(vulnType, fixedCode, originalCode);
    if (!fixAddressesVuln.passed) {
      return { passed: false, reason: fixAddressesVuln.reason, warnings: [...warnings, ...(fixAddressesVuln.warnings || [])] };
    }

    // 6. Confidence threshold
    if ((proposal.confidence ?? 1) < 0.3) {
      warnings.push('Fix has very low confidence - manual review strongly recommended');
    }

    return { passed: true, warnings };
  }

  private isPredominantlyComments(code: string): boolean {
    const lines = code.split('\n').filter(l => l.trim());
    const commentLines = lines.filter(l => l.trim().startsWith('//') || l.trim().startsWith('#')).length;
    return lines.length > 0 && commentLines / lines.length > 0.7;
  }

  private normalizeForCompare(code: string): string {
    return code
      .replace(/\s+/g, ' ')
      .replace(/\/\/[^\n]*/g, '')
      .trim();
  }

  private checkLanguageConsistency(fixedCode: string, ext: string): { consistent: boolean; reason?: string; warning?: string } {
    const isPhp = ext === '.php';
    const isPy = ['.py'].includes(ext);
    const isJs = ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'].includes(ext);

    if (isPhp) {
      if (PYTHON_PATTERNS.some(p => p.test(fixedCode))) {
        return { consistent: false, reason: 'Fix uses Python syntax (os.environ) in a PHP file' };
      }
      if (JS_PATTERNS.some(p => p.test(fixedCode)) && !fixedCode.includes('$')) {
        return { consistent: false, reason: 'Fix uses JavaScript syntax (process.env) in a PHP file - use getenv()' };
      }
    }

    if (isPy) {
      if (JS_PATTERNS.some(p => p.test(fixedCode))) {
        return { consistent: false, reason: 'Fix uses JavaScript syntax (process.env) in a Python file - use os.environ.get()' };
      }
      if (PHP_PATTERNS.some(p => p.test(fixedCode))) {
        return { consistent: false, reason: 'Fix uses PHP syntax in a Python file' };
      }
    }

    if (isJs) {
      if (PYTHON_PATTERNS.some(p => p.test(fixedCode))) {
        return { consistent: false, reason: 'Fix uses Python syntax (os.environ) in a JavaScript file - use process.env' };
      }
      if (PHP_PATTERNS.some(p => p.test(fixedCode))) {
        return { consistent: false, reason: 'Fix uses PHP syntax in a JavaScript file' };
      }
    }

    return { consistent: true };
  }

  private fixAddressesVulnerability(vulnType: string, fixedCode: string, originalCode: string): { passed: boolean; reason?: string; warnings?: string[] } {
    const w: string[] = [];

    if (vulnType.includes('sql') || vulnType.includes('injection')) {
      if (originalCode.includes('+') && originalCode.includes("'") && !fixedCode.includes('?') && !fixedCode.includes('$1') && !fixedCode.includes('[userId]')) {
        w.push('SQL fix may not use parameterized query - verify');
      }
    }

    if (vulnType.includes('secret') || vulnType.includes('hardcoded') || vulnType.includes('credential')) {
      const hasEnvVar = /process\.env|getenv|os\.environ|Environment\.GetEnvironmentVariable/i.test(fixedCode);
      const stillHasLiteral = /["']([^"']{8,})["']/.test(fixedCode) && /password|secret|key|token/i.test(fixedCode);
      if (!hasEnvVar && stillHasLiteral) {
        return { passed: false, reason: 'Secret fix still contains hardcoded literal', warnings: w };
      }
    }

    return { passed: true, warnings: w };
  }
}

let _instance: TaskGuard | null = null;

export function getTaskGuard(): TaskGuard {
  if (!_instance) _instance = new TaskGuard();
  return _instance;
}
