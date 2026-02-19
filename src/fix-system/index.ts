/**
 * Fix System Module
 *
 * Safe, user-controlled vulnerability fix system with:
 * - Backup management
 * - Diff preview
 * - User confirmation
 * - Validation
 * - Undo capability
 */

// Types
export * from './types';

// Core components
export { BackupManager } from './backup-manager';
export { DiffGenerator } from './diff-generator';
export { FixApplicator } from './fix-applicator';
export { FixValidator } from './fix-validator';
export { UndoManager } from './undo-manager';
export { RuleBasedFixer, getRuleBasedFixer } from './rule-based-fixer';
export { TaskGuard, getTaskGuard, TaskGuardResult } from './task-guard';
export { ReviewSubagent, getReviewSubagent, ReviewResult } from './review-subagent';
export { MultiAIFixPipeline, getMultiAIFixPipeline } from './multi-ai-fix-pipeline';

// Main service
export { FixService } from './fix-service';
