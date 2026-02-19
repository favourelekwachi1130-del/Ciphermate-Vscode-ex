/**
 * Type definitions for the Safe Vulnerability Fix System
 *
 * This module defines interfaces for fix proposals, diffs, results,
 * backups, and validation - ensuring type safety across the fix system.
 */

import { Vulnerability } from '../scanners/types';

/**
 * Risk level for applying a fix
 */
export type FixRiskLevel = 'low' | 'medium' | 'high';

/**
 * Complexity of a fix operation
 */
export type FixComplexity = 'simple' | 'moderate' | 'complex';

/**
 * Status of a fix operation
 */
export type FixStatus = 'pending' | 'previewing' | 'applying' | 'validating' | 'completed' | 'failed' | 'rolled_back';

/**
 * A proposed fix for a vulnerability
 */
export interface FixProposal {
  /** Unique identifier for this fix proposal */
  id: string;

  /** ID of the vulnerability being fixed */
  vulnerabilityId: string;

  /** The full vulnerability object */
  vulnerability: Vulnerability;

  /** The original vulnerable code */
  originalCode: string;

  /** The proposed secure code */
  fixedCode: string;

  /** Human-readable explanation of what the fix does */
  explanation: string;

  /** Confidence level of the fix (0.0 - 1.0) */
  confidence: number;

  /** Risk level of applying this fix */
  riskLevel: FixRiskLevel;

  /** Complexity of the fix */
  complexity: FixComplexity;

  /** Security improvements provided by this fix */
  securityImprovements: string[];

  /** Notes on how to test the fix */
  testingNotes?: string;

  /** Line number where the fix starts */
  startLine: number;

  /** Line number where the fix ends */
  endLine: number;

  /** When this proposal was created */
  createdAt: Date;

  /** Optional: environment variables to add to .env when fixing secrets */
  envVarsToCreate?: Array<{ name: string; value: string }>;
}

/**
 * A diff showing changes between original and fixed code
 */
export interface FixDiff {
  /** Path to the file being modified */
  filePath: string;

  /** Unified diff format string */
  unified: string;

  /** HTML-formatted diff for display */
  html?: string;

  /** Number of lines added */
  additions: number;

  /** Number of lines deleted */
  deletions: number;

  /** Original lines being replaced */
  originalLines: string[];

  /** New lines replacing the original */
  newLines: string[];
}

/**
 * Result of applying a fix
 */
export interface FixResult {
  /** Whether the fix was successfully applied */
  success: boolean;

  /** ID of the fix proposal that was applied */
  fixId: string;

  /** ID of the backup created before applying */
  backupId: string;

  /** Whether the fix was validated (vulnerability resolved) */
  validated: boolean;

  /** Any new issues introduced by the fix */
  regressions?: Vulnerability[];

  /** Error message if the fix failed */
  error?: string;

  /** Status of the fix operation */
  status: FixStatus;

  /** When the fix was applied */
  appliedAt: Date;

  /** Path to the modified file */
  filePath: string;
}

/**
 * A backup snapshot of a file before modification
 */
export interface BackupSnapshot {
  /** Unique identifier for this backup */
  id: string;

  /** Path to the backed-up file */
  filePath: string;

  /** Original file content */
  content: string;

  /** ID of the fix that triggered this backup */
  fixId: string;

  /** When the backup was created */
  createdAt: Date;

  /** Whether this backup has been used for restoration */
  restored: boolean;
}

/**
 * Result of validating a fix
 */
export interface ValidationResult {
  /** Whether the original vulnerability was resolved */
  vulnerabilityResolved: boolean;

  /** Whether any new vulnerabilities were introduced */
  hasRegressions: boolean;

  /** New vulnerabilities introduced by the fix */
  newVulnerabilities: Vulnerability[];

  /** Original vulnerability that was targeted */
  originalVulnerability: Vulnerability;

  /** Fix effectiveness score (0.0 - 1.0) */
  effectiveness: number;

  /** Validation timestamp */
  validatedAt: Date;
}

/**
 * Result of a batch fix operation
 */
export interface BatchFixResult {
  /** Total number of fixes attempted */
  total: number;

  /** Number of successful fixes */
  successful: number;

  /** Number of failed fixes */
  failed: number;

  /** Individual results for each fix */
  results: FixResult[];

  /** Files that were modified */
  modifiedFiles: string[];

  /** Whether all fixes were validated */
  allValidated: boolean;

  /** Summary of any regressions */
  regressionSummary?: {
    count: number;
    vulnerabilities: Vulnerability[];
  };
}

/**
 * Configuration options for the fix service
 */
export interface FixServiceConfig {
  /** Whether to require user confirmation before applying fixes */
  requireConfirmation: boolean;

  /** Whether to automatically create backups */
  autoBackup: boolean;

  /** Whether to validate fixes after applying */
  validateAfterFix: boolean;

  /** Minimum confidence level to allow fixes */
  minConfidence: number;

  /** Number of days to retain backups */
  backupRetentionDays: number;

  /** Whether to stop batch operations on first error */
  stopOnError: boolean;

  /** Use multi-AI pipeline (Generator, Pre-Validator, File Handler, Final Validator) */
  enableMultiAIPipeline?: boolean;
}

/**
 * Context for fix operations
 */
export interface FixContext {
  /** VS Code workspace path */
  workspacePath: string;

  /** Current file being processed */
  currentFile?: string;

  /** User who initiated the fix */
  userId?: string;

  /** Session ID for tracking */
  sessionId: string;

  /** When the fix operation started */
  startedAt: Date;
}

/**
 * Entry in the undo history stack
 */
export interface UndoEntry {
  /** ID of the fix result */
  fixResultId: string;

  /** Backup snapshot for this entry */
  backup: BackupSnapshot;

  /** Fix result being undone */
  fixResult: FixResult;

  /** When this entry was added to the stack */
  addedAt: Date;
}

/**
 * Message sent to the webview for fix preview
 */
export interface FixPreviewMessage {
  command: 'showFixPreview';
  proposal: FixProposal;
  diff: FixDiff;
}

/**
 * Message sent to the webview for batch fix preview
 */
export interface BatchFixPreviewMessage {
  command: 'showBatchFixPreview';
  proposals: FixProposal[];
  diffs: FixDiff[];
  summary: {
    totalFiles: number;
    totalChanges: number;
    totalAdditions: number;
    totalDeletions: number;
    overallConfidence: number;
  };
}

/**
 * Message received from webview for fix confirmation
 */
export interface FixConfirmationMessage {
  command: 'confirmFix' | 'cancelFix' | 'confirmBatchFix' | 'cancelBatchFix';
  fixId?: string;
  fixIds?: string[];
}

/**
 * Extended Vulnerability type with fix-related fields
 */
export interface FixableVulnerability extends Vulnerability {
  /** Whether this vulnerability can be automatically fixed */
  fixable: boolean;

  /** Complexity of fixing this vulnerability */
  fixComplexity?: FixComplexity;
}
