/**
 * Unit Tests for SecretDetectionService
 * 
 * Tests verify CipherMate Core works independently without Mastra
 */

import { describe, it, expect } from '@jest/globals';
import { getSecretDetectionService, SecretDetectionService } from '../secret-detection-service';

describe('SecretDetectionService', () => {
  let service: SecretDetectionService;

  beforeEach(() => {
    service = getSecretDetectionService();
  });

  describe('Secret Detection', () => {
    it('should detect AWS access key', () => {
      const code = 'const key = "AKIAIOSFODNN7EXAMPLE";';
      const result = service.detectSecrets(code);
      
      expect(result.secrets.length).toBeGreaterThan(0);
      expect(result.secrets[0].patternName).toContain('AWS');
    });

    it('should detect API keys', () => {
      const code = 'const api_key = "sk_live_1234567890abcdef";';
      const result = service.detectSecrets(code);
      
      expect(result.secrets.length).toBeGreaterThan(0);
      expect(result.secrets[0].patternName).toContain('API');
    });

    it('should detect hardcoded passwords', () => {
      const code = 'const password = "mypassword123";';
      const result = service.detectSecrets(code);
      
      expect(result.secrets.length).toBeGreaterThan(0);
      expect(result.secrets[0].patternName).toContain('Password');
    });

    it('should detect GitHub tokens', () => {
      const code = 'const token = "ghp_1234567890abcdefghijklmnopqrstuvwxyz";';
      const result = service.detectSecrets(code);
      
      expect(result.secrets.length).toBeGreaterThan(0);
      expect(result.secrets[0].patternName).toContain('GitHub');
    });

    it('should mask secrets', () => {
      const code = 'const api_key = "sk_live_1234567890abcdef";';
      const result = service.detectSecrets(code);
      
      expect(result.secrets[0].maskedValue).not.toContain('1234567890abcdef');
      expect(result.secrets[0].maskedValue).toContain('***');
    });

    it('should calculate entropy', () => {
      const code = 'const key = "AKIAIOSFODNN7EXAMPLE";';
      const result = service.detectSecrets(code);
      
      expect(result.secrets[0].entropy).toBeDefined();
      expect(result.secrets[0].entropy).toBeGreaterThan(0);
    });

    it('should filter false positives', () => {
      const code = 'const example = "example-api-key-placeholder";';
      const result = service.detectSecrets(code);
      
      // Should filter out placeholder values
      const hasPlaceholder = result.secrets.some(s => 
        s.value.toLowerCase().includes('placeholder')
      );
      expect(hasPlaceholder).toBe(false);
    });

    it('should count by severity', () => {
      const code = `
        const awsKey = "AKIAIOSFODNN7EXAMPLE";
        const apiKey = "sk_live_1234567890abcdef";
        const password = "mypassword123";
      `;
      const result = service.detectSecrets(code);
      
      expect(result.bySeverity.critical).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
    });
  });

  describe('Pattern Management', () => {
    it('should get all patterns', () => {
      const patterns = service.getAllPatterns();
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should get pattern by ID', () => {
      const pattern = service.getPattern('aws-access-key');
      expect(pattern).toBeDefined();
      expect(pattern?.name).toContain('AWS');
    });
  });
});
