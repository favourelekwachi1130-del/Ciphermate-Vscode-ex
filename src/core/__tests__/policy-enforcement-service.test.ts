/**
 * Unit Tests for PolicyEnforcementService
 * 
 * Tests verify CipherMate Core works independently without Mastra
 */

import { describe, it, expect } from '@jest/globals';
import { getPolicyEnforcementService, PolicyEnforcementService } from '../policy-enforcement-service';

describe('PolicyEnforcementService', () => {
  let service: PolicyEnforcementService;

  beforeEach(() => {
    service = getPolicyEnforcementService();
  });

  describe('Policy Evaluation', () => {
    it('should detect hardcoded API keys', () => {
      const code = 'const api_key = "sk_live_1234567890abcdef";';
      const result = service.evaluateCode(code);
      
      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].severity).toBe('critical');
    });

    it('should detect SQL injection patterns', () => {
      const code = 'const query = "SELECT * FROM users WHERE id = " + userId;';
      const result = service.evaluateCode(code);
      
      expect(result.passed).toBe(false);
      const hasSQLInjection = result.violations.some(v => 
        v.message.toLowerCase().includes('sql')
      );
      expect(hasSQLInjection).toBe(true);
    });

    it('should detect weak cryptography', () => {
      const code = 'const hash = crypto.createHash("md5");';
      const result = service.evaluateCode(code);
      
      expect(result.passed).toBe(false);
      const hasWeakCrypto = result.violations.some(v => 
        v.message.toLowerCase().includes('md5')
      );
      expect(hasWeakCrypto).toBe(true);
    });

    it('should pass secure code', () => {
      const code = 'const hash = crypto.createHash("sha256");';
      const result = service.evaluateCode(code);
      
      // Should pass if no violations
      const hasViolations = result.violations.some(v => 
        v.message.toLowerCase().includes('md5') || 
        v.message.toLowerCase().includes('sha1')
      );
      expect(hasViolations).toBe(false);
    });

    it('should evaluate multiple policies', () => {
      const code = `
        const api_key = "sk_live_1234567890abcdef";
        const hash = crypto.createHash("md5");
      `;
      const result = service.evaluateCode(code);
      
      expect(result.evaluatedPolicies).toBeGreaterThan(1);
      expect(result.violations.length).toBeGreaterThan(1);
    });
  });

  describe('Policy Management', () => {
    it('should get all policies', () => {
      const policies = service.getAllPolicies();
      expect(policies.length).toBeGreaterThan(0);
    });

    it('should get policy by ID', () => {
      const policy = service.getPolicy('no-hardcoded-secrets');
      expect(policy).toBeDefined();
      expect(policy?.name).toContain('Secret');
    });

    it('should enable/disable rules', () => {
      service.setRuleEnabled('no-hardcoded-secrets', 'no-api-keys', false);
      
      const code = 'const api_key = "sk_live_1234567890abcdef";';
      const result = service.evaluateCode(code);
      
      // Should have fewer violations after disabling rule
      const hasApiKeyViolation = result.violations.some(v => 
        v.ruleId === 'no-api-keys'
      );
      expect(hasApiKeyViolation).toBe(false);
      
      // Re-enable for other tests
      service.setRuleEnabled('no-hardcoded-secrets', 'no-api-keys', true);
    });
  });

  describe('Compliance Checking', () => {
    it('should check compliance with specific policy', () => {
      const code = 'const api_key = "sk_live_1234567890abcdef";';
      const result = service.checkCompliance(code, 'no-hardcoded-secrets');
      
      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });
});
