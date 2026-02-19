/**
 * Integrity Validation Service
 * 
 * Owns all integrity validation logic:
 * - File integrity checks
 * - Checksum verification
 * - Code signature validation
 * - Tamper detection
 * 
 * NO dependencies on Mastra or AI frameworks.
 */

import { getHashingService, HashingService } from './hashing-service';
import { getFileOperationsService, FileOperationsService } from './file-operations-service';

export interface IntegrityCheck {
  path: string;
  checksum: string;
  algorithm: string;
  timestamp: Date;
}

export interface ValidationResult {
  valid: boolean;
  path: string;
  expectedChecksum?: string;
  actualChecksum?: string;
  error?: string;
}

export interface FileSignature {
  path: string;
  checksum: string;
  algorithm: string;
  size: number;
  modified: Date;
  signature: string; // HMAC signature
}

export class IntegrityValidationService {
  private hashingService: HashingService;
  private fileService: FileOperationsService;
  private checksumCache: Map<string, IntegrityCheck> = new Map();

  constructor() {
    this.hashingService = getHashingService();
    this.fileService = getFileOperationsService();
  }

  /**
   * Generate checksum for file
   */
  async generateChecksum(
    filePath: string,
    algorithm: 'sha256' | 'sha512' = 'sha256'
  ): Promise<string> {
    const content = await this.fileService.readFile(filePath);
    return algorithm === 'sha256'
      ? this.hashingService.sha256(content)
      : this.hashingService.sha512(content);
  }

  /**
   * Verify file integrity by comparing checksums
   */
  async verifyFileIntegrity(
    filePath: string,
    expectedChecksum: string,
    algorithm: 'sha256' | 'sha512' = 'sha256'
  ): Promise<ValidationResult> {
    try {
      const actualChecksum = await this.generateChecksum(filePath, algorithm);
      const valid = this.hashingService.compareHashes(expectedChecksum, actualChecksum);

      return {
        valid,
        path: filePath,
        expectedChecksum,
        actualChecksum,
        error: valid ? undefined : 'Checksum mismatch - file may have been tampered with',
      };
    } catch (error) {
      return {
        valid: false,
        path: filePath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Create file signature (checksum + HMAC)
   */
  async createFileSignature(
    filePath: string,
    secret: string,
    algorithm: 'sha256' | 'sha512' = 'sha256'
  ): Promise<FileSignature> {
    const checksum = await this.generateChecksum(filePath, algorithm);
    const metadata = await this.fileService.getFileMetadata(filePath);
    
    // Create signature payload
    const payload = JSON.stringify({
      path: filePath,
      checksum,
      size: metadata.size,
      modified: metadata.modified.toISOString(),
    });
    
    // Generate HMAC signature
    const signature = this.hashingService.hmac(payload, secret, algorithm);

    return {
      path: filePath,
      checksum,
      algorithm,
      size: metadata.size,
      modified: metadata.modified,
      signature,
    };
  }

  /**
   * Verify file signature
   */
  async verifyFileSignature(
    filePath: string,
    expectedSignature: FileSignature,
    secret: string
  ): Promise<ValidationResult> {
    try {
      // Verify checksum
      const checksumResult = await this.verifyFileIntegrity(
        filePath,
        expectedSignature.checksum,
        expectedSignature.algorithm as 'sha256' | 'sha512'
      );

      if (!checksumResult.valid) {
        return checksumResult;
      }

      // Verify signature
      const currentSignature = await this.createFileSignature(
        filePath,
        secret,
        expectedSignature.algorithm as 'sha256' | 'sha512'
      );

      const signatureValid = this.hashingService.compareHashes(
        expectedSignature.signature,
        currentSignature.signature
      );

      return {
        valid: signatureValid && checksumResult.valid,
        path: filePath,
        expectedChecksum: expectedSignature.checksum,
        actualChecksum: currentSignature.checksum,
        error: signatureValid ? undefined : 'Signature verification failed - file may have been tampered with',
      };
    } catch (error) {
      return {
        valid: false,
        path: filePath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Store checksum for later verification
   */
  storeChecksum(filePath: string, checksum: string, algorithm: string = 'sha256'): void {
    this.checksumCache.set(filePath, {
      path: filePath,
      checksum,
      algorithm,
      timestamp: new Date(),
    });
  }

  /**
   * Get stored checksum
   */
  getStoredChecksum(filePath: string): IntegrityCheck | undefined {
    return this.checksumCache.get(filePath);
  }

  /**
   * Verify against stored checksum
   */
  async verifyAgainstStored(filePath: string): Promise<ValidationResult> {
    const stored = this.getStoredChecksum(filePath);
    
    if (!stored) {
      return {
        valid: false,
        path: filePath,
        error: 'No stored checksum found for file',
      };
    }

    return this.verifyFileIntegrity(filePath, stored.checksum, stored.algorithm as 'sha256' | 'sha512');
  }

  /**
   * Batch verify multiple files
   */
  async verifyBatch(
    files: Array<{ path: string; checksum: string; algorithm?: 'sha256' | 'sha512' }>
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const file of files) {
      const result = await this.verifyFileIntegrity(
        file.path,
        file.checksum,
        file.algorithm || 'sha256'
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Detect if file has been modified since last check
   */
  async detectModification(filePath: string): Promise<boolean> {
    const stored = this.getStoredChecksum(filePath);
    
    if (!stored) {
      // No previous check, store current checksum
      const currentChecksum = await this.generateChecksum(filePath);
      this.storeChecksum(filePath, currentChecksum);
      return false; // Can't detect modification if no baseline
    }

    const verification = await this.verifyFileIntegrity(filePath, stored.checksum);
    return !verification.valid;
  }

  /**
   * Clear checksum cache
   */
  clearCache(): void {
    this.checksumCache.clear();
  }

  /**
   * Export checksums to JSON
   */
  exportChecksums(): string {
    const checksums = Array.from(this.checksumCache.values());
    return JSON.stringify(checksums, null, 2);
  }

  /**
   * Import checksums from JSON
   */
  importChecksums(json: string): void {
    try {
      const checksums: IntegrityCheck[] = JSON.parse(json);
      for (const check of checksums) {
        this.checksumCache.set(check.path, {
          ...check,
          timestamp: new Date(check.timestamp),
        });
      }
    } catch (error) {
      throw new Error(`Failed to import checksums: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Singleton instance
let integrityValidationServiceInstance: IntegrityValidationService | null = null;

export function getIntegrityValidationService(): IntegrityValidationService {
  if (!integrityValidationServiceInstance) {
    integrityValidationServiceInstance = new IntegrityValidationService();
  }
  return integrityValidationServiceInstance;
}
