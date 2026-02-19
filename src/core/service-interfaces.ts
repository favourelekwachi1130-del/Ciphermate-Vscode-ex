/**
 * CipherMate Core Service Interfaces
 * 
 * Defines contracts for all core services.
 * These interfaces ensure consistency and enable dependency injection.
 * 
 * All services are independent and work without Mastra or AI frameworks.
 */

import type { FileMetadata, FileOperationResult } from './file-operations-service';
import type { HashResult, VerifyResult } from './hashing-service';
import type { DetectionResult } from './secret-detection-service';
import type { PolicyEvaluationResult, SecurityRule } from './policy-enforcement-service';
import type { CodeAdjustment } from './code-adjustment-service';
import type { GenerationResult, CodeTemplate } from './code-generation-service';
import type { ValidationResult, FileSignature } from './integrity-validation-service';
import type { DiffResult } from './code-diffing-service';

/**
 * File Operations Service Interface
 */
export interface IFileOperationsService {
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, content: string): Promise<FileOperationResult>;
  createFile(filePath: string, content?: string): Promise<FileOperationResult>;
  deleteFile(filePath: string): Promise<FileOperationResult>;
  fileExists(filePath: string): Promise<boolean>;
  getFileMetadata(filePath: string): Promise<FileMetadata>;
  listDirectory(dirPath: string, recursive?: boolean): Promise<string[]>;
  findFiles(
    rootPath: string,
    pattern: RegExp | string,
    options?: {
      recursive?: boolean;
      includeDirs?: boolean;
    }
  ): Promise<string[]>;
  resolvePath(filePath: string, basePath?: string): string;
  ensureDirectoryExists(dirPath: string): Promise<void>;
  copyFile(sourcePath: string, destPath: string): Promise<FileOperationResult>;
  moveFile(sourcePath: string, destPath: string): Promise<FileOperationResult>;
}

/**
 * Hashing Service Interface
 */
export interface IHashingService {
  sha256(data: string | Buffer): string;
  sha512(data: string | Buffer): string;
  hashWithSalt(data: string, salt?: string): HashResult;
  pbkdf2(password: string, salt: string, iterations?: number): string;
  bcryptHash(password: string, rounds?: number): HashResult;
  argon2Hash(password: string, salt?: string): HashResult;
  generateSalt(length?: number): string;
  hmac(data: string, key: string, algorithm?: string): string;
  verifyHash(data: string, hash: string, salt?: string): VerifyResult;
  hashFile(filePath: string): Promise<string>;
  constantTimeCompare(a: string, b: string): boolean;
}

/**
 * Secret Detection Service Interface
 */
export interface ISecretDetectionService {
  detectSecrets(code: string, filePath?: string): DetectionResult;
  detectPattern(pattern: string, code: string, filePath?: string): DetectionResult;
  calculateEntropy(data: string): number;
  maskSecret(secret: string, visibleChars?: number): string;
  registerPattern(name: string, pattern: RegExp, severity: 'critical' | 'high' | 'medium' | 'low'): void;
}

/**
 * Policy Enforcement Service Interface
 */
export interface IPolicyEnforcementService {
  evaluatePolicy(code: string, filePath?: string): PolicyEvaluationResult;
  registerPolicy(name: string, rule: SecurityRule): void;
  enablePolicy(name: string): void;
  disablePolicy(name: string): void;
  listPolicies(): SecurityRule[];
  checkCompliance(code: string, policies: string[]): PolicyEvaluationResult;
}

/**
 * Code Adjustment Service Interface
 */
export interface ICodeAdjustmentService {
  adjustCode(code: string, language: string): CodeAdjustment;
  fixHardcodedSecrets(code: string, language: string): CodeAdjustment;
  fixSQLInjection(code: string, language: string): CodeAdjustment;
  fixWeakCrypto(code: string, language: string): CodeAdjustment;
  fixXSS(code: string, language: string): CodeAdjustment;
  refactorForSecurity(code: string, language: string): CodeAdjustment;
}

/**
 * Code Generation Service Interface
 */
export interface ICodeGenerationService {
  generateCode(template: CodeTemplate, variables: Record<string, string>): GenerationResult;
  generatePasswordHash(language: string, password: string): string;
  generateSecureSQL(language: string, query: string, params: string[]): string;
  generateSecureRandomToken(length?: number): string;
  generateInputValidation(language: string, inputName: string, type: string): string;
}

/**
 * Integrity Validation Service Interface
 */
export interface IIntegrityValidationService {
  validateFile(filePath: string, expectedHash: string): Promise<ValidationResult>;
  generateChecksum(filePath: string): Promise<string>;
  validateCodeSignature(filePath: string, signature: FileSignature): Promise<ValidationResult>;
  detectTampering(filePath: string, expectedChecksum: string): Promise<ValidationResult>;
  batchValidate(files: Array<{ path: string; checksum: string }>): Promise<ValidationResult[]>;
}

/**
 * Code Diffing Service Interface
 */
export interface ICodeDiffingService {
  generateDiff(oldCode: string, newCode: string, filePath?: string): DiffResult;
  applyPatch(code: string, diff: DiffResult): string;
  createUnifiedDiff(oldCode: string, newCode: string, oldPath: string, newPath: string): string;
  calculateLineChanges(oldCode: string, newCode: string): { added: number; removed: number; modified: number };
}

/**
 * Project Generation Service Interface
 */
export interface IProjectGenerationService {
  generateProject(
    structure: {
      name: string;
      type: 'web' | 'api' | 'library' | 'cli' | 'fullstack';
      language: 'javascript' | 'typescript' | 'python' | 'java' | 'go' | 'rust';
      files: Array<{
        path: string;
        content: string;
        type: 'code' | 'config' | 'documentation' | 'test';
        language?: string;
      }>;
    },
    basePath?: string
  ): Promise<{
    success: boolean;
    projectPath: string;
    filesCreated: string[];
    errors?: string[];
  }>;
  generateSecureProjectTemplate(
    name: string,
    type: 'web' | 'api' | 'library' | 'cli' | 'fullstack',
    language: 'javascript' | 'typescript' | 'python' | 'java' | 'go' | 'rust'
  ): {
    name: string;
    type: 'web' | 'api' | 'library' | 'cli' | 'fullstack';
    language: 'javascript' | 'typescript' | 'python' | 'java' | 'go' | 'rust';
    files: Array<{
      path: string;
      content: string;
      type: 'code' | 'config' | 'documentation' | 'test';
      language?: string;
    }>;
  };
}

/**
 * Citation Service Interface
 */
export interface ICitationService {
  addCitation(messageId: string, citation: {
    type: 'file' | 'tool' | 'service' | 'pattern' | 'reference';
    source: string;
    description: string;
    metadata?: Record<string, any>;
  }): string;
  getCitations(messageId: string): Array<{
    id: string;
    type: 'file' | 'tool' | 'service' | 'pattern' | 'reference';
    source: string;
    description: string;
    timestamp: Date;
    metadata?: Record<string, any>;
  }>;
  getCitationGroup(messageId: string): {
    id: string;
    citations: Array<{
      id: string;
      type: 'file' | 'tool' | 'service' | 'pattern' | 'reference';
      source: string;
      description: string;
      timestamp: Date;
      metadata?: Record<string, any>;
    }>;
    timestamp: Date;
  } | undefined;
  clearActiveCitations(messageId: string): void;
  addFileCitation(messageId: string, filePath: string, line?: number): string;
  addToolCitation(messageId: string, toolName: string, description: string): string;
  addServiceCitation(messageId: string, serviceName: string, operation: string): string;
  addPatternCitation(messageId: string, patternName: string, matches: number): string;
  formatCitations(citations: Array<{
    id: string;
    type: 'file' | 'tool' | 'service' | 'pattern' | 'reference';
    source: string;
    description: string;
    timestamp: Date;
    metadata?: Record<string, any>;
  }>): string;
  getCitationSummary(messageId: string): string;
  clearAll(): void;
}

/**
 * Realtime Analysis Service Interface
 */
export interface IRealtimeAnalysisService {
  initialize(context: any, chatInterface: any): void;
  enable(): void;
  disable(): void;
  dispose(): void;
}
