/**
 * CipherMate Core Service Registry
 * 
 * Central registry for all core services.
 * Provides dependency injection and service discovery.
 * 
 * Usage:
 *   const registry = ServiceRegistry.getInstance();
 *   const fileService = registry.getFileOperationsService();
 *   const hashService = registry.getHashingService();
 */

import type {
  IFileOperationsService,
  IHashingService,
  ISecretDetectionService,
  IPolicyEnforcementService,
  ICodeAdjustmentService,
  ICodeGenerationService,
  IIntegrityValidationService,
  ICodeDiffingService,
  IProjectGenerationService,
  ICitationService,
  IRealtimeAnalysisService,
} from './service-interfaces';

import {
  getFileOperationsService,
  FileOperationsService,
} from './file-operations-service';

import {
  getHashingService,
  HashingService,
} from './hashing-service';

import {
  getSecretDetectionService,
  SecretDetectionService,
} from './secret-detection-service';

import {
  getPolicyEnforcementService,
  PolicyEnforcementService,
} from './policy-enforcement-service';

import {
  getCodeAdjustmentService,
  CodeAdjustmentService,
} from './code-adjustment-service';

import {
  getCodeGenerationService,
  CodeGenerationService,
} from './code-generation-service';

import {
  getIntegrityValidationService,
  IntegrityValidationService,
} from './integrity-validation-service';

import {
  getCodeDiffingService,
  CodeDiffingService,
} from './code-diffing-service';

import {
  getProjectGenerationService,
  ProjectGenerationService,
} from './project-generation-service';

import {
  getCitationService,
  CitationService,
} from './citation-service';

import {
  getRealtimeAnalysisService,
  RealtimeAnalysisService,
} from './realtime-analysis-service';

/**
 * Service Registry
 * 
 * Singleton pattern for managing all core services.
 * Provides type-safe access to all services.
 */
export class ServiceRegistry {
  private static instance: ServiceRegistry | null = null;

  // Service instances (lazy-loaded)
  private _fileOperations: IFileOperationsService | null = null;
  private _hashing: IHashingService | null = null;
  private _secretDetection: ISecretDetectionService | null = null;
  private _policyEnforcement: IPolicyEnforcementService | null = null;
  private _codeAdjustment: ICodeAdjustmentService | null = null;
  private _codeGeneration: ICodeGenerationService | null = null;
  private _integrityValidation: IIntegrityValidationService | null = null;
  private _codeDiffing: ICodeDiffingService | null = null;
  private _projectGeneration: IProjectGenerationService | null = null;
  private _citation: ICitationService | null = null;
  private _realtimeAnalysis: IRealtimeAnalysisService | null = null;

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  /**
   * Reset registry (useful for testing)
   */
  static reset(): void {
    ServiceRegistry.instance = null;
  }

  /**
   * Get File Operations Service
   */
  getFileOperationsService(): IFileOperationsService {
    if (!this._fileOperations) {
      this._fileOperations = getFileOperationsService();
    }
    return this._fileOperations;
  }

  /**
   * Get Hashing Service
   */
  getHashingService(): IHashingService {
    if (!this._hashing) {
      this._hashing = getHashingService() as any;
    }
    return this._hashing as any as IHashingService;
  }

  /**
   * Get Secret Detection Service
   */
  getSecretDetectionService(): ISecretDetectionService {
    if (!this._secretDetection) {
      this._secretDetection = getSecretDetectionService() as any;
    }
    return this._secretDetection as any as ISecretDetectionService;
  }

  /**
   * Get Policy Enforcement Service
   */
  getPolicyEnforcementService(): IPolicyEnforcementService {
    if (!this._policyEnforcement) {
      this._policyEnforcement = getPolicyEnforcementService() as any;
    }
    return this._policyEnforcement as any as IPolicyEnforcementService;
  }

  /**
   * Get Code Adjustment Service
   */
  getCodeAdjustmentService(): ICodeAdjustmentService {
    if (!this._codeAdjustment) {
      this._codeAdjustment = getCodeAdjustmentService() as any;
    }
    return this._codeAdjustment as any as ICodeAdjustmentService;
  }

  /**
   * Get Code Generation Service
   */
  getCodeGenerationService(): ICodeGenerationService {
    if (!this._codeGeneration) {
      this._codeGeneration = getCodeGenerationService() as any;
    }
    return this._codeGeneration as any as ICodeGenerationService;
  }

  /**
   * Get Integrity Validation Service
   */
  getIntegrityValidationService(): IIntegrityValidationService {
    if (!this._integrityValidation) {
      this._integrityValidation = getIntegrityValidationService() as any;
    }
    return this._integrityValidation as any as IIntegrityValidationService;
  }

  /**
   * Get Code Diffing Service
   */
  getCodeDiffingService(): ICodeDiffingService {
    if (!this._codeDiffing) {
      this._codeDiffing = getCodeDiffingService() as any;
    }
    return this._codeDiffing as any as ICodeDiffingService;
  }

  /**
   * Get Project Generation Service
   */
  getProjectGenerationService(): IProjectGenerationService {
    if (!this._projectGeneration) {
      this._projectGeneration = getProjectGenerationService();
    }
    return this._projectGeneration;
  }

  /**
   * Get Citation Service
   */
  getCitationService(): ICitationService {
    if (!this._citation) {
      this._citation = getCitationService();
    }
    return this._citation;
  }

  /**
   * Get Realtime Analysis Service
   */
  getRealtimeAnalysisService(): IRealtimeAnalysisService {
    if (!this._realtimeAnalysis) {
      this._realtimeAnalysis = getRealtimeAnalysisService() as any;
    }
    return this._realtimeAnalysis as any as IRealtimeAnalysisService;
  }

  /**
   * Get all services (for testing/debugging)
   */
  getAllServices(): {
    fileOperations: IFileOperationsService;
    hashing: IHashingService;
    secretDetection: ISecretDetectionService;
    policyEnforcement: IPolicyEnforcementService;
    codeAdjustment: ICodeAdjustmentService;
    codeGeneration: ICodeGenerationService;
    integrityValidation: IIntegrityValidationService;
    codeDiffing: ICodeDiffingService;
    projectGeneration: IProjectGenerationService;
    citation: ICitationService;
    realtimeAnalysis: IRealtimeAnalysisService;
  } {
    return {
      fileOperations: this.getFileOperationsService(),
      hashing: this.getHashingService(),
      secretDetection: this.getSecretDetectionService(),
      policyEnforcement: this.getPolicyEnforcementService(),
      codeAdjustment: this.getCodeAdjustmentService(),
      codeGeneration: this.getCodeGenerationService(),
      integrityValidation: this.getIntegrityValidationService(),
      codeDiffing: this.getCodeDiffingService(),
      projectGeneration: this.getProjectGenerationService(),
      citation: this.getCitationService(),
      realtimeAnalysis: this.getRealtimeAnalysisService(),
    };
  }

  /**
   * Verify all services are available
   */
  verifyServices(): { available: string[]; missing: string[] } {
    const available: string[] = [];
    const missing: string[] = [];

    const services = [
      { name: 'fileOperations', getter: () => this.getFileOperationsService() },
      { name: 'hashing', getter: () => this.getHashingService() },
      { name: 'secretDetection', getter: () => this.getSecretDetectionService() },
      { name: 'policyEnforcement', getter: () => this.getPolicyEnforcementService() },
      { name: 'codeAdjustment', getter: () => this.getCodeAdjustmentService() },
      { name: 'codeGeneration', getter: () => this.getCodeGenerationService() },
      { name: 'integrityValidation', getter: () => this.getIntegrityValidationService() },
      { name: 'codeDiffing', getter: () => this.getCodeDiffingService() },
      { name: 'projectGeneration', getter: () => this.getProjectGenerationService() },
      { name: 'citation', getter: () => this.getCitationService() },
      { name: 'realtimeAnalysis', getter: () => this.getRealtimeAnalysisService() },
    ];

    for (const service of services) {
      try {
        service.getter();
        available.push(service.name);
      } catch (error) {
        missing.push(service.name);
      }
    }

    return { available, missing };
  }
}

/**
 * Convenience function to get service registry instance
 */
export function getServiceRegistry(): ServiceRegistry {
  return ServiceRegistry.getInstance();
}
