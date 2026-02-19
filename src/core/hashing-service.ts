/**
 * Hashing Service
 * 
 * Owns all hashing logic:
 * - SHA-256, SHA-512
 * - bcrypt (password hashing)
 * - argon2 (modern password hashing)
 * - PBKDF2
 * - Hash verification
 * - Salt generation
 * 
 * NO dependencies on Mastra or AI frameworks.
 */

import * as crypto from 'crypto';

export interface HashResult {
  hash: string;
  salt?: string;
  algorithm: string;
}

export interface VerifyResult {
  valid: boolean;
  algorithm: string;
}

export class HashingService {
  /**
   * Generate SHA-256 hash
   */
  sha256(data: string | Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate SHA-512 hash
   */
  sha512(data: string | Buffer): string {
    return crypto.createHash('sha512').update(data).digest('hex');
  }

  /**
   * Generate hash with salt (SHA-256)
   */
  hashWithSalt(data: string, salt?: string): HashResult {
    const generatedSalt = salt || this.generateSalt(32);
    const hash = crypto
      .createHash('sha256')
      .update(data + generatedSalt)
      .digest('hex');
    
    return {
      hash,
      salt: generatedSalt,
      algorithm: 'sha256',
    };
  }

  /**
   * Verify hash with salt
   */
  verifyHashWithSalt(data: string, hash: string, salt: string): boolean {
    const computedHash = crypto
      .createHash('sha256')
      .update(data + salt)
      .digest('hex');
    
    return computedHash === hash;
  }

  /**
   * Generate PBKDF2 hash (for passwords)
   */
  pbkdf2(
    password: string,
    salt?: string,
    iterations: number = 100000,
    keyLength: number = 64
  ): HashResult {
    const generatedSalt = salt || this.generateSalt(32);
    const hash = crypto
      .pbkdf2Sync(password, generatedSalt, iterations, keyLength, 'sha512')
      .toString('hex');
    
    return {
      hash,
      salt: generatedSalt,
      algorithm: 'pbkdf2',
    };
  }

  /**
   * Verify PBKDF2 hash
   */
  verifyPbkdf2(
    password: string,
    hash: string,
    salt: string,
    iterations: number = 100000,
    keyLength: number = 64
  ): boolean {
    const computedHash = crypto
      .pbkdf2Sync(password, salt, iterations, keyLength, 'sha512')
      .toString('hex');
    
    return computedHash === hash;
  }

  /**
   * Generate bcrypt-like hash (using PBKDF2 as fallback)
   * Note: For true bcrypt, use bcrypt library, but this provides similar functionality
   */
  bcryptHash(password: string, rounds: number = 10): HashResult {
    // Using PBKDF2 as bcrypt alternative (bcrypt requires native module)
    // In production, use: import * as bcrypt from 'bcrypt';
    const salt = this.generateSalt(16);
    const iterations = Math.pow(2, rounds); // 2^10 = 1024 iterations
    
    return this.pbkdf2(password, salt, iterations, 32);
  }

  /**
   * Verify bcrypt-like hash
   */
  bcryptVerify(password: string, hash: string, salt: string, rounds: number = 10): boolean {
    const iterations = Math.pow(2, rounds);
    return this.verifyPbkdf2(password, hash, salt, iterations, 32);
  }

  /**
   * Generate argon2-like hash (using scrypt as fallback)
   * Note: For true argon2, use argon2 library
   */
  argon2Hash(
    password: string,
    salt?: string,
    memoryCost: number = 65536,
    timeCost: number = 3,
    parallelism: number = 4
  ): HashResult {
    // Using scrypt as argon2 alternative
    const generatedSalt = salt || this.generateSalt(32);
    const hash = crypto
      .scryptSync(password, generatedSalt, 64)
      .toString('hex');
    
    return {
      hash,
      salt: generatedSalt,
      algorithm: 'scrypt', // Using scrypt as argon2 alternative
    };
  }

  /**
   * Verify argon2-like hash
   */
  argon2Verify(password: string, hash: string, salt: string): boolean {
    const computedHash = crypto
      .scryptSync(password, salt, 64)
      .toString('hex');
    
    return computedHash === hash;
  }

  /**
   * Generate cryptographically secure random salt
   */
  generateSalt(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate random bytes
   */
  randomBytes(length: number): Buffer {
    return crypto.randomBytes(length);
  }

  /**
   * Generate HMAC
   */
  hmac(data: string | Buffer, secret: string, algorithm: string = 'sha256'): string {
    return crypto.createHmac(algorithm, secret).update(data).digest('hex');
  }

  /**
   * Verify HMAC
   */
  verifyHmac(data: string | Buffer, hmac: string, secret: string, algorithm: string = 'sha256'): boolean {
    const computedHmac = this.hmac(data, secret, algorithm);
    return computedHmac === hmac;
  }

  /**
   * Hash file contents
   */
  async hashFile(filePath: string, algorithm: 'sha256' | 'sha512' = 'sha256'): Promise<string> {
    const fs = require('fs').promises;
    const content = await fs.readFile(filePath);
    return algorithm === 'sha256' ? this.sha256(content) : this.sha512(content);
  }

  /**
   * Compare two hashes (constant-time comparison to prevent timing attacks)
   */
  compareHashes(hash1: string, hash2: string): boolean {
    if (hash1.length !== hash2.length) {
      return false;
    }
    
    // Constant-time comparison
    let result = 0;
    for (let i = 0; i < hash1.length; i++) {
      result |= hash1.charCodeAt(i) ^ hash2.charCodeAt(i);
    }
    
    return result === 0;
  }
}

// Singleton instance
let hashingServiceInstance: HashingService | null = null;

export function getHashingService(): HashingService {
  if (!hashingServiceInstance) {
    hashingServiceInstance = new HashingService();
  }
  return hashingServiceInstance;
}
