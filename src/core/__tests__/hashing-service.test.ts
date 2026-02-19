/**
 * Unit Tests for HashingService
 * 
 * Tests verify CipherMate Core works independently without Mastra
 */

import { describe, it, expect } from '@jest/globals';
import { getHashingService, HashingService } from '../hashing-service';

describe('HashingService', () => {
  let service: HashingService;

  beforeEach(() => {
    service = getHashingService();
  });

  describe('SHA-256', () => {
    it('should generate SHA-256 hash', () => {
      const data = 'test data';
      const hash = service.sha256(data);
      
      expect(hash).toBeDefined();
      expect(hash.length).toBe(64); // SHA-256 produces 64 hex characters
      expect(typeof hash).toBe('string');
    });

    it('should produce consistent hashes', () => {
      const data = 'test data';
      const hash1 = service.sha256(data);
      const hash2 = service.sha256(data);
      
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different data', () => {
      const hash1 = service.sha256('data1');
      const hash2 = service.sha256('data2');
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('SHA-512', () => {
    it('should generate SHA-512 hash', () => {
      const data = 'test data';
      const hash = service.sha512(data);
      
      expect(hash).toBeDefined();
      expect(hash.length).toBe(128); // SHA-512 produces 128 hex characters
    });
  });

  describe('Hash with Salt', () => {
    it('should generate hash with salt', () => {
      const data = 'password';
      const result = service.hashWithSalt(data);
      
      expect(result.hash).toBeDefined();
      expect(result.salt).toBeDefined();
      expect(result.algorithm).toBe('sha256');
    });

    it('should verify hash with salt', () => {
      const data = 'password';
      const result = service.hashWithSalt(data);
      
      const isValid = service.verifyHashWithSalt(data, result.hash, result.salt!);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', () => {
      const data = 'password';
      const result = service.hashWithSalt(data);
      
      const isValid = service.verifyHashWithSalt('wrong', result.hash, result.salt!);
      expect(isValid).toBe(false);
    });
  });

  describe('PBKDF2', () => {
    it('should generate PBKDF2 hash', () => {
      const password = 'test password';
      const result = service.pbkdf2(password);
      
      expect(result.hash).toBeDefined();
      expect(result.salt).toBeDefined();
      expect(result.algorithm).toBe('pbkdf2');
    });

    it('should verify PBKDF2 hash', () => {
      const password = 'test password';
      const result = service.pbkdf2(password);
      
      const isValid = service.verifyPbkdf2(password, result.hash, result.salt!);
      expect(isValid).toBe(true);
    });
  });

  describe('Salt Generation', () => {
    it('should generate random salt', () => {
      const salt1 = service.generateSalt();
      const salt2 = service.generateSalt();
      
      expect(salt1).toBeDefined();
      expect(salt2).toBeDefined();
      expect(salt1).not.toBe(salt2); // Should be random
    });

    it('should generate salt of specified length', () => {
      const salt = service.generateSalt(16);
      expect(salt.length).toBe(32); // Hex encoding: 16 bytes = 32 hex chars
    });
  });

  describe('HMAC', () => {
    it('should generate HMAC', () => {
      const data = 'test data';
      const secret = 'secret key';
      const hmac = service.hmac(data, secret);
      
      expect(hmac).toBeDefined();
      expect(hmac.length).toBe(64); // SHA-256 HMAC produces 64 hex chars
    });

    it('should verify HMAC', () => {
      const data = 'test data';
      const secret = 'secret key';
      const hmac = service.hmac(data, secret);
      
      const isValid = service.verifyHmac(data, hmac, secret);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect HMAC', () => {
      const data = 'test data';
      const secret = 'secret key';
      const hmac = service.hmac(data, secret);
      
      const isValid = service.verifyHmac(data, 'wrong hmac', secret);
      expect(isValid).toBe(false);
    });
  });

  describe('Hash Comparison', () => {
    it('should compare hashes correctly', () => {
      const hash1 = service.sha256('test');
      const hash2 = service.sha256('test');
      const hash3 = service.sha256('different');
      
      expect(service.compareHashes(hash1, hash2)).toBe(true);
      expect(service.compareHashes(hash1, hash3)).toBe(false);
    });
  });
});
