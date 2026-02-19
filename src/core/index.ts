/**
 * CipherMate Core Services
 * 
 * All deterministic logic lives here. These services are independent
 * and work without Mastra or any AI framework.
 * 
 * If Mastra disappears tomorrow, CipherMate still works.
 */

// Service Interfaces
export * from './service-interfaces';

// Service Registry
export * from './service-registry';

// Core Services
export * from './file-operations-service';
export * from './hashing-service';
export * from './integrity-validation-service';
export * from './policy-enforcement-service';
export * from './code-generation-service';
export * from './code-adjustment-service';
export * from './secret-detection-service';
export * from './code-diffing-service';
// Export AnalysisResult separately to avoid conflicts
export { AnalysisResult, AnalysisIssue } from './realtime-analysis-service';
export { RealtimeAnalysisService, getRealtimeAnalysisService } from './realtime-analysis-service';
export { LiveDiagnosticsService, getLiveDiagnosticsService } from './live-diagnostics-service';
// Export ProjectGenerationResult separately to avoid conflict with GenerationResult
export { ProjectGenerationResult } from './project-generation-service';
export { ProjectGenerationService, getProjectGenerationService } from './project-generation-service';
export * from './citation-service';
