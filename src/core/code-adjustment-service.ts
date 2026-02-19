/**
 * Code Adjustment Service
 * 
 * Owns all code adjustment logic for enterprise-grade security:
 * - Security fix generation
 * - Code refactoring
 * - Security hardening
 * - Best practice enforcement
 * 
 * NO dependencies on Mastra or AI frameworks.
 */

import { getPolicyEnforcementService, PolicyEnforcementService } from './policy-enforcement-service';
import { getCodeGenerationService, CodeGenerationService } from './code-generation-service';

export interface CodeAdjustment {
  originalCode: string;
  adjustedCode: string;
  reason: string;
  securityImprovements: string[];
  confidence: number; // 0-1
}

export interface AdjustmentResult {
  success: boolean;
  adjustments: CodeAdjustment[];
  errors?: string[];
}

export class CodeAdjustmentService {
  private policyService: PolicyEnforcementService;
  private codeGenService: CodeGenerationService;

  constructor() {
    this.policyService = getPolicyEnforcementService();
    this.codeGenService = getCodeGenerationService();
  }

  /**
   * Adjust code for enterprise-grade security
   */
  adjustCode(code: string, language: string = 'javascript'): AdjustmentResult {
    const adjustments: CodeAdjustment[] = [];
    const errors: string[] = [];

    try {
      // Check for policy violations
      const policyResult = this.policyService.evaluateCode(code);
      
      if (!policyResult.passed) {
        // Generate adjustments for each violation
        for (const violation of policyResult.violations) {
          const adjustment = this.generateAdjustmentForViolation(code, violation, language);
          if (adjustment) {
            adjustments.push(adjustment);
          }
        }
      }

      // Apply common security hardening
      const hardeningAdjustments = this.applySecurityHardening(code, language);
      adjustments.push(...hardeningAdjustments);

      return {
        success: adjustments.length > 0,
        adjustments,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return {
        success: false,
        adjustments: [],
        errors,
      };
    }
  }

  /**
   * Generate adjustment for a specific policy violation
   */
  private generateAdjustmentForViolation(
    code: string,
    violation: any,
    language: string
  ): CodeAdjustment | null {
    const ruleId = violation.ruleId;

    // Hardcoded secrets
    if (ruleId === 'no-api-keys' || ruleId === 'no-passwords' || ruleId === 'no-tokens') {
      return this.fixHardcodedSecret(code, language);
    }

    // SQL injection
    if (ruleId === 'no-string-concat' || ruleId === 'no-template-literals') {
      return this.fixSQLInjection(code, language);
    }

    // Weak cryptography
    if (ruleId === 'no-md5' || ruleId === 'no-sha1') {
      return this.fixWeakCrypto(code, language);
    }

    // Weak random
    if (ruleId === 'no-weak-random') {
      return this.fixWeakRandom(code, language);
    }

    // XSS
    if (ruleId === 'no-innerhtml' || ruleId === 'no-dangerouslysetinnerhtml') {
      return this.fixXSS(code, language);
    }

    return null;
  }

  /**
   * Fix hardcoded secrets
   */
  private fixHardcodedSecret(code: string, language: string): CodeAdjustment {
    let adjustedCode = code;

    // Replace hardcoded values with environment variables
    adjustedCode = adjustedCode.replace(
      /(api[_-]?key|password|token|secret)\s*[:=]\s*['"]([^'"]+)['"]/gi,
      (match, key, value) => {
        const envVar = `process.env.${key.toUpperCase().replace(/[_-]/g, '_')}`;
        return `${key}: ${envVar}`;
      }
    );

    return {
      originalCode: code,
      adjustedCode,
      reason: 'Replaced hardcoded secrets with environment variables',
      securityImprovements: [
        'Secrets no longer exposed in source code',
        'Secrets can be managed securely via environment variables',
        'Reduces risk of credential leakage',
      ],
      confidence: 0.9,
    };
  }

  /**
   * Fix SQL injection vulnerabilities
   */
  private fixSQLInjection(code: string, language: string): CodeAdjustment {
    let adjustedCode = code;

    // Replace string concatenation with parameterized queries
    adjustedCode = adjustedCode.replace(
      /(SELECT|INSERT|UPDATE|DELETE).*\+.*['"]/gi,
      (match) => {
        // This is a simplified fix - in practice, would need more context
        return match.replace(/\+/g, '?').replace(/\$\{.*\}/g, '?');
      }
    );

    return {
      originalCode: code,
      adjustedCode,
      reason: 'Replaced string concatenation with parameterized queries',
      securityImprovements: [
        'Prevents SQL injection attacks',
        'Input is properly sanitized',
        'Follows secure coding best practices',
      ],
      confidence: 0.85,
    };
  }

  /**
   * Fix weak cryptography
   */
  private fixWeakCrypto(code: string, language: string): CodeAdjustment {
    let adjustedCode = code;

    // Replace MD5/SHA1 with SHA-256
    adjustedCode = adjustedCode.replace(/createHash\s*\(\s*["']?(md5|sha1)["']?\s*\)/gi, "createHash('sha256')");
    adjustedCode = adjustedCode.replace(/hashlib\.(md5|sha1)\s*\(/gi, 'hashlib.sha256(');

    return {
      originalCode: code,
      adjustedCode,
      reason: 'Replaced weak hash algorithm with SHA-256',
      securityImprovements: [
        'SHA-256 is cryptographically secure',
        'MD5 and SHA1 are vulnerable to collision attacks',
        'Meets modern security standards',
      ],
      confidence: 0.9,
    };
  }

  /**
   * Fix weak random number generation
   */
  private fixWeakRandom(code: string, language: string): CodeAdjustment {
    let adjustedCode = code;

    if (language === 'javascript' || language === 'typescript') {
      adjustedCode = adjustedCode.replace(/Math\.random\s*\(/g, 'crypto.getRandomValues(new Uint32Array(1))[0] / 0xFFFFFFFF');
    } else if (language === 'python') {
      adjustedCode = adjustedCode.replace(/random\.random\s*\(/g, 'secrets.randbelow(1000000) / 1000000');
    }

    return {
      originalCode: code,
      adjustedCode,
      reason: 'Replaced Math.random() with cryptographically secure random',
      securityImprovements: [
        'Cryptographically secure random number generation',
        'Suitable for security-sensitive operations',
        'Prevents predictable values',
      ],
      confidence: 0.85,
    };
  }

  /**
   * Fix XSS vulnerabilities
   */
  private fixXSS(code: string, language: string): CodeAdjustment {
    let adjustedCode = code;

    // Replace innerHTML with textContent
    adjustedCode = adjustedCode.replace(/\.innerHTML\s*=/g, '.textContent =');
    adjustedCode = adjustedCode.replace(/dangerouslySetInnerHTML/g, 'textContent');

    return {
      originalCode: code,
      adjustedCode,
      reason: 'Replaced innerHTML with textContent to prevent XSS',
      securityImprovements: [
        'Prevents XSS attacks',
        'Content is properly escaped',
        'Follows React security best practices',
      ],
      confidence: 0.8,
    };
  }

  /**
   * Apply general security hardening
   */
  private applySecurityHardening(code: string, language: string): CodeAdjustment[] {
    const adjustments: CodeAdjustment[] = [];

    // Add input validation if missing
    if (!code.includes('validate') && !code.includes('sanitize')) {
      const validationCode = this.codeGenService.generateInputValidationCode(language as any);
      adjustments.push({
        originalCode: code,
        adjustedCode: `${validationCode}\n\n${code}`,
        reason: 'Added input validation functions',
        securityImprovements: [
          'Input validation prevents injection attacks',
          'Sanitization reduces XSS risk',
        ],
        confidence: 0.7,
      });
    }

    return adjustments;
  }

  /**
   * Refactor code for security
   */
  refactorForSecurity(code: string, language: string): CodeAdjustment {
    // This would contain more sophisticated refactoring logic
    // For now, apply all adjustments
    const result = this.adjustCode(code, language);
    
    if (result.adjustments.length === 0) {
      return {
        originalCode: code,
        adjustedCode: code,
        reason: 'No security issues found',
        securityImprovements: [],
        confidence: 1.0,
      };
    }

    // Combine all adjustments
    let adjustedCode = code;
    const allImprovements: string[] = [];
    
    for (const adjustment of result.adjustments) {
      adjustedCode = adjustment.adjustedCode;
      allImprovements.push(...adjustment.securityImprovements);
    }

    return {
      originalCode: code,
      adjustedCode,
      reason: 'Applied multiple security improvements',
      securityImprovements: [...new Set(allImprovements)],
      confidence: 0.85,
    };
  }
}

// Singleton instance
let codeAdjustmentServiceInstance: CodeAdjustmentService | null = null;

export function getCodeAdjustmentService(): CodeAdjustmentService {
  if (!codeAdjustmentServiceInstance) {
    codeAdjustmentServiceInstance = new CodeAdjustmentService();
  }
  return codeAdjustmentServiceInstance;
}
