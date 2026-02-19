/**
 * Policy Enforcement Service
 * 
 * Owns all policy enforcement logic:
 * - Security policy validation
 * - Rule evaluation engine
 * - Compliance checking
 * - Policy violation detection
 * 
 * NO dependencies on Mastra or AI frameworks.
 */

export interface SecurityPolicy {
  id: string;
  name: string;
  description: string;
  rules: SecurityRule[];
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface SecurityRule {
  id: string;
  name: string;
  pattern: RegExp | string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  enabled: boolean;
}

export interface PolicyViolation {
  policyId: string;
  ruleId: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  context?: any;
}

export interface PolicyEvaluationResult {
  passed: boolean;
  violations: PolicyViolation[];
  evaluatedPolicies: number;
}

export class PolicyEnforcementService {
  private policies: Map<string, SecurityPolicy> = new Map();
  private defaultPolicies: SecurityPolicy[] = [];

  constructor() {
    this.initializeDefaultPolicies();
  }

  /**
   * Register a security policy
   */
  registerPolicy(policy: SecurityPolicy): void {
    this.policies.set(policy.id, policy);
  }

  /**
   * Evaluate code against all policies
   */
  evaluateCode(code: string, filePath?: string): PolicyEvaluationResult {
    const violations: PolicyViolation[] = [];
    let evaluatedPolicies = 0;

    for (const [policyId, policy] of this.policies.entries()) {
      evaluatedPolicies++;
      
      for (const rule of policy.rules) {
        if (!rule.enabled) {
          continue;
        }

        const pattern = typeof rule.pattern === 'string' ? new RegExp(rule.pattern, 'i') : rule.pattern;
        
        if (pattern.test(code)) {
          violations.push({
            policyId,
            ruleId: rule.id,
            severity: rule.severity,
            message: rule.message,
            context: {
              filePath,
              matchedPattern: pattern.toString(),
            },
          });
        }
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      evaluatedPolicies,
    };
  }

  /**
   * Evaluate file against policies
   */
  async evaluateFile(filePath: string, fileContent?: string): Promise<PolicyEvaluationResult> {
    const fs = require('fs').promises;
    const content = fileContent || await fs.readFile(filePath, 'utf-8');
    return this.evaluateCode(content, filePath);
  }

  /**
   * Check if code complies with specific policy
   */
  checkCompliance(code: string, policyId: string): PolicyEvaluationResult {
    const policy = this.policies.get(policyId);
    
    if (!policy) {
      throw new Error(`Policy ${policyId} not found`);
    }

    const violations: PolicyViolation[] = [];

    for (const rule of policy.rules) {
      if (!rule.enabled) {
        continue;
      }

      const pattern = typeof rule.pattern === 'string' ? new RegExp(rule.pattern, 'i') : rule.pattern;
      
      if (pattern.test(code)) {
        violations.push({
          policyId,
          ruleId: rule.id,
          severity: rule.severity,
          message: rule.message,
        });
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      evaluatedPolicies: 1,
    };
  }

  /**
   * Get all policies
   */
  getAllPolicies(): SecurityPolicy[] {
    return Array.from(this.policies.values());
  }

  /**
   * Get policy by ID
   */
  getPolicy(policyId: string): SecurityPolicy | undefined {
    return this.policies.get(policyId);
  }

  /**
   * Enable/disable a rule
   */
  setRuleEnabled(policyId: string, ruleId: string, enabled: boolean): void {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Policy ${policyId} not found`);
    }

    const rule = policy.rules.find(r => r.id === ruleId);
    if (!rule) {
      throw new Error(`Rule ${ruleId} not found in policy ${policyId}`);
    }

    rule.enabled = enabled;
  }

  /**
   * Initialize default security policies
   */
  private initializeDefaultPolicies(): void {
    // Hardcoded Secrets Policy
    this.registerPolicy({
      id: 'no-hardcoded-secrets',
      name: 'No Hardcoded Secrets',
      description: 'Prevent hardcoded API keys, passwords, and tokens',
      severity: 'critical',
      rules: [
        {
          id: 'no-api-keys',
          name: 'No API Keys',
          pattern: /(api[_-]?key|apikey)\s*[:=]\s*['"]([^'"]{20,})['"]/i,
          message: 'Hardcoded API key detected',
          severity: 'critical',
          enabled: true,
        },
        {
          id: 'no-passwords',
          name: 'No Passwords',
          pattern: /(password|passwd|pwd)\s*[:=]\s*['"]([^'"]{4,})['"]/i,
          message: 'Hardcoded password detected',
          severity: 'critical',
          enabled: true,
        },
        {
          id: 'no-tokens',
          name: 'No Tokens',
          pattern: /(token|secret|credential)\s*[:=]\s*['"]([^'"]{16,})['"]/i,
          message: 'Hardcoded token or secret detected',
          severity: 'critical',
          enabled: true,
        },
      ],
    });

    // SQL Injection Policy
    this.registerPolicy({
      id: 'no-sql-injection',
      name: 'No SQL Injection',
      description: 'Prevent SQL injection vulnerabilities',
      severity: 'high',
      rules: [
        {
          id: 'no-string-concat',
          name: 'No String Concatenation in SQL',
          pattern: /(SELECT|INSERT|UPDATE|DELETE).*\+.*['"]/i,
          message: 'String concatenation in SQL query - use parameterized queries',
          severity: 'high',
          enabled: true,
        },
        {
          id: 'no-template-literals',
          name: 'No Template Literals in SQL',
          pattern: /(SELECT|INSERT|UPDATE|DELETE).*\$\{.*\}/i,
          message: 'Template literal in SQL query - use parameterized queries',
          severity: 'high',
          enabled: true,
        },
      ],
    });

    // Weak Cryptography Policy
    this.registerPolicy({
      id: 'no-weak-crypto',
      name: 'No Weak Cryptography',
      description: 'Prevent use of weak cryptographic algorithms',
      severity: 'high',
      rules: [
        {
          id: 'no-md5',
          name: 'No MD5',
          pattern: /(md5|MD5)\s*\(/i,
          message: 'MD5 is cryptographically broken - use SHA-256 or stronger',
          severity: 'high',
          enabled: true,
        },
        {
          id: 'no-sha1',
          name: 'No SHA1',
          pattern: /(sha1|SHA1)\s*\(/i,
          message: 'SHA1 is deprecated - use SHA-256 or stronger',
          severity: 'medium',
          enabled: true,
        },
        {
          id: 'no-weak-random',
          name: 'No Weak Random',
          pattern: /Math\.random\s*\(/i,
          message: 'Math.random() is not cryptographically secure',
          severity: 'medium',
          enabled: true,
        },
      ],
    });

    // XSS Policy
    this.registerPolicy({
      id: 'no-xss',
      name: 'No XSS Vulnerabilities',
      description: 'Prevent cross-site scripting vulnerabilities',
      severity: 'high',
      rules: [
        {
          id: 'no-innerhtml',
          name: 'No innerHTML',
          pattern: /\.innerHTML\s*=/i,
          message: 'innerHTML can lead to XSS - use textContent or sanitize',
          severity: 'high',
          enabled: true,
        },
        {
          id: 'no-dangerouslysetinnerhtml',
          name: 'No dangerouslySetInnerHTML',
          pattern: /dangerouslySetInnerHTML/i,
          message: 'dangerouslySetInnerHTML can lead to XSS - sanitize content',
          severity: 'high',
          enabled: true,
        },
      ],
    });
  }
}

// Singleton instance
let policyEnforcementServiceInstance: PolicyEnforcementService | null = null;

export function getPolicyEnforcementService(): PolicyEnforcementService {
  if (!policyEnforcementServiceInstance) {
    policyEnforcementServiceInstance = new PolicyEnforcementService();
  }
  return policyEnforcementServiceInstance;
}
