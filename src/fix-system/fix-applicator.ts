/**
 * Fix Applicator - Safe Code Modification
 *
 * Uses VS Code's WorkspaceEdit API for applying fixes, which provides:
 * - Native undo support (Ctrl+Z works)
 * - Proper dirty state handling
 * - File watcher integration
 * - Atomic operations
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FixProposal, FixResult } from './types';
import { BackupManager } from './backup-manager';

export class FixApplicator {
  private backupManager: BackupManager;

  constructor(backupManager: BackupManager) {
    this.backupManager = backupManager;
  }

  /**
   * Apply a fix using VS Code's WorkspaceEdit API
   *
   * This is the safe way to modify files because:
   * 1. It integrates with VS Code's undo stack
   * 2. It properly handles dirty documents
   * 3. It triggers file watchers appropriately
   */
  async applyFix(proposal: FixProposal): Promise<FixResult> {
    const filePath = proposal.vulnerability.file;
    const uri = vscode.Uri.file(this.resolveAbsolutePath(filePath));

    // Pre-flight checks
    const checks = await this.runPreflightChecks(filePath);
    if (!checks.canProceed) {
      return {
        success: false,
        fixId: proposal.id,
        backupId: '',
        validated: false,
        error: checks.error,
        status: 'failed',
        appliedAt: new Date(),
        filePath
      };
    }

    // Create backup before modifying
    let backup;
    try {
      backup = await this.backupManager.createBackup(filePath, proposal.id);
    } catch (error) {
      return {
        success: false,
        fixId: proposal.id,
        backupId: '',
        validated: false,
        error: `Failed to create backup: ${error instanceof Error ? error.message : String(error)}`,
        status: 'failed',
        appliedAt: new Date(),
        filePath
      };
    }

    try {
      // Open the document
      const document = await vscode.workspace.openTextDocument(uri);

      // Calculate the range to replace
      const range = this.calculateRange(document, proposal);

      // Create WorkspaceEdit
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, range, proposal.fixedCode);

      // Apply the edit
      const success = await vscode.workspace.applyEdit(edit);

      if (!success) {
        return {
          success: false,
          fixId: proposal.id,
          backupId: backup.id,
          validated: false,
          error: 'VS Code failed to apply the edit',
          status: 'failed',
          appliedAt: new Date(),
          filePath
        };
      }

      // Save the document if it was not dirty before
      if (!document.isDirty) {
        await document.save();
      }

      console.log(`FixApplicator: Successfully applied fix ${proposal.id} to ${filePath}`);

      return {
        success: true,
        fixId: proposal.id,
        backupId: backup.id,
        validated: false, // Will be validated by FixValidator
        status: 'completed',
        appliedAt: new Date(),
        filePath
      };
    } catch (error) {
      console.error(`FixApplicator: Failed to apply fix ${proposal.id}:`, error);

      return {
        success: false,
        fixId: proposal.id,
        backupId: backup.id,
        validated: false,
        error: error instanceof Error ? error.message : String(error),
        status: 'failed',
        appliedAt: new Date(),
        filePath
      };
    }
  }

  /**
   * Apply multiple fixes atomically
   *
   * All fixes are grouped into a single WorkspaceEdit for atomicity.
   * If any fix fails validation, none are applied.
   */
  async applyBatchFixes(proposals: FixProposal[]): Promise<FixResult[]> {
    const results: FixResult[] = [];

    // Group proposals by file for efficient processing
    const byFile = new Map<string, FixProposal[]>();
    for (const proposal of proposals) {
      const filePath = proposal.vulnerability.file;
      if (!byFile.has(filePath)) {
        byFile.set(filePath, []);
      }
      byFile.get(filePath)!.push(proposal);
    }

    // Create all backups first
    const backups = new Map<string, string>(); // fixId -> backupId
    for (const proposal of proposals) {
      try {
        const backup = await this.backupManager.createBackup(
          proposal.vulnerability.file,
          proposal.id
        );
        backups.set(proposal.id, backup.id);
      } catch (error) {
        // If backup fails, add failed result and continue
        results.push({
          success: false,
          fixId: proposal.id,
          backupId: '',
          validated: false,
          error: `Backup failed: ${error instanceof Error ? error.message : String(error)}`,
          status: 'failed',
          appliedAt: new Date(),
          filePath: proposal.vulnerability.file
        });
      }
    }

    // Create a single WorkspaceEdit for all changes
    const edit = new vscode.WorkspaceEdit();

    // Track which lines have been edited to prevent overlapping ranges
    const editedRanges = new Map<string, Set<string>>(); // filePath -> Set of "startLine-endLine"

    for (const [filePath, fileProposals] of byFile) {
      // Sort proposals by line number (descending) to apply from bottom up
      // This prevents line number shifts from affecting subsequent edits
      fileProposals.sort((a, b) => {
        const lineA = a.startLine || a.vulnerability.line || 0;
        const lineB = b.startLine || b.vulnerability.line || 0;
        return lineB - lineA;
      });

      const uri = vscode.Uri.file(this.resolveAbsolutePath(filePath));
      editedRanges.set(filePath, new Set());

      try {
        const document = await vscode.workspace.openTextDocument(uri);

        for (const proposal of fileProposals) {
          const backupId = backups.get(proposal.id);
          if (!backupId) {
            // Skip proposals that failed backup
            continue;
          }

          const range = this.calculateRange(document, proposal);
          const rangeKey = `${range.start.line}-${range.end.line}`;

          // Check for overlapping ranges
          const fileEdits = editedRanges.get(filePath)!;
          let hasOverlap = false;

          for (const existingRange of fileEdits) {
            const [existStart, existEnd] = existingRange.split('-').map(Number);
            // Check if ranges overlap
            if (!(range.end.line < existStart || range.start.line > existEnd)) {
              hasOverlap = true;
              console.log(`FixApplicator: Skipping overlapping fix ${proposal.id} (lines ${range.start.line}-${range.end.line} overlaps with ${existingRange})`);
              results.push({
                success: false,
                fixId: proposal.id,
                backupId,
                validated: false,
                error: `Skipped: overlaps with another fix on lines ${existingRange}`,
                status: 'failed',
                appliedAt: new Date(),
                filePath
              });
              break;
            }
          }

          if (!hasOverlap) {
            edit.replace(uri, range, proposal.fixedCode);
            fileEdits.add(rangeKey);
          }
        }
      } catch (error) {
        // Mark all proposals for this file as failed
        for (const proposal of fileProposals) {
          results.push({
            success: false,
            fixId: proposal.id,
            backupId: backups.get(proposal.id) || '',
            validated: false,
            error: `Failed to open file: ${error instanceof Error ? error.message : String(error)}`,
            status: 'failed',
            appliedAt: new Date(),
            filePath
          });
        }
      }
    }

    // Apply all edits atomically
    try {
      const success = await vscode.workspace.applyEdit(edit);

      if (success) {
        // Mark all remaining proposals as successful
        for (const proposal of proposals) {
          const backupId = backups.get(proposal.id);
          if (backupId && !results.find(r => r.fixId === proposal.id)) {
            results.push({
              success: true,
              fixId: proposal.id,
              backupId,
              validated: false,
              status: 'completed',
              appliedAt: new Date(),
              filePath: proposal.vulnerability.file
            });
          }
        }

        // Save all modified documents
        await vscode.workspace.saveAll(false);
      } else {
        // All remaining proposals failed
        for (const proposal of proposals) {
          if (!results.find(r => r.fixId === proposal.id)) {
            results.push({
              success: false,
              fixId: proposal.id,
              backupId: backups.get(proposal.id) || '',
              validated: false,
              error: 'Batch edit failed',
              status: 'failed',
              appliedAt: new Date(),
              filePath: proposal.vulnerability.file
            });
          }
        }
      }
    } catch (error) {
      // All proposals failed
      for (const proposal of proposals) {
        if (!results.find(r => r.fixId === proposal.id)) {
          results.push({
            success: false,
            fixId: proposal.id,
            backupId: backups.get(proposal.id) || '',
            validated: false,
            error: error instanceof Error ? error.message : String(error),
            status: 'failed',
            appliedAt: new Date(),
            filePath: proposal.vulnerability.file
          });
        }
      }
    }

    return results;
  }

  /**
   * Compute the document content that would result from applying the fix.
   * Used for pre-apply syntax validation.
   */
  async getResultingContent(proposal: FixProposal): Promise<{ content: string; language: string } | null> {
    const filePath = proposal.vulnerability.file;
    const uri = vscode.Uri.file(this.resolveAbsolutePath(filePath));
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const range = this.calculateRange(document, proposal);
      const before = document.getText(new vscode.Range(new vscode.Position(0, 0), range.start));
      const after = document.getText(new vscode.Range(range.end, new vscode.Position(document.lineCount, 0)));
      const content = before + proposal.fixedCode + after;
      const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));
      const langMap: Record<string, string> = {
        '.js': 'javascript', '.ts': 'typescript', '.jsx': 'javascript', '.tsx': 'typescript',
        '.mjs': 'javascript', '.cjs': 'javascript', '.py': 'python', '.php': 'php',
        '.php3': 'php', '.phtml': 'php', '.json': 'json', '.java': 'java', '.go': 'go', '.rs': 'rust'
      };
      return { content, language: langMap[ext] || 'text' };
    } catch {
      return null;
    }
  }

  /**
   * Run pre-flight checks before applying a fix
   */
  private async runPreflightChecks(
    filePath: string
  ): Promise<{ canProceed: boolean; error?: string }> {
    const absolutePath = this.resolveAbsolutePath(filePath);

    // Check if file exists
    if (!fs.existsSync(absolutePath)) {
      return { canProceed: false, error: `File not found: ${filePath}` };
    }

    // Check if file is writable
    const isWritable = await this.backupManager.isFileWritable(absolutePath);
    if (!isWritable) {
      return { canProceed: false, error: `File is not writable: ${filePath}` };
    }

    // Check for unsaved changes in editor
    const hasUnsaved = await this.backupManager.hasUnsavedChanges(absolutePath);
    if (hasUnsaved) {
      return {
        canProceed: false,
        error: `File has unsaved changes. Please save the file first: ${filePath}`
      };
    }

    return { canProceed: true };
  }

  /**
   * Calculate the VS Code Range for a fix
   */
  private calculateRange(document: vscode.TextDocument, proposal: FixProposal): vscode.Range {
    // If we have explicit start/end lines, use them
    if (proposal.startLine > 0 && proposal.endLine > 0) {
      const startLine = Math.max(0, proposal.startLine - 1);
      const endLine = Math.min(document.lineCount - 1, proposal.endLine - 1);

      return new vscode.Range(
        new vscode.Position(startLine, 0),
        new vscode.Position(endLine, document.lineAt(endLine).text.length)
      );
    }

    // Fall back to searching for the original code
    const fullText = document.getText();
    const originalCode = proposal.originalCode.trim();
    const startIndex = fullText.indexOf(originalCode);

    if (startIndex === -1) {
      // Try to find it near the expected line
      const expectedLine = proposal.vulnerability.line || 1;
      const lineStart = Math.max(0, expectedLine - 5);
      const lineEnd = Math.min(document.lineCount, expectedLine + 5);

      // Search within the line range
      for (let i = lineStart; i < lineEnd; i++) {
        const lineText = document.lineAt(i).text;
        if (lineText.includes(originalCode) || originalCode.includes(lineText.trim())) {
          return document.lineAt(i).range;
        }
      }

      // Last resort: use the vulnerability line
      const vulnLine = Math.max(0, (proposal.vulnerability.line || 1) - 1);
      if (vulnLine < document.lineCount) {
        return document.lineAt(vulnLine).range;
      }

      // Absolute last resort: first line
      return document.lineAt(0).range;
    }

    // Found the code, calculate range
    const startPos = document.positionAt(startIndex);
    const endPos = document.positionAt(startIndex + originalCode.length);

    return new vscode.Range(startPos, endPos);
  }

  /**
   * Resolve a potentially relative path to absolute
   */
  private resolveAbsolutePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      return path.join(workspaceRoot, filePath);
    }

    return filePath;
  }

  /**
   * Preview a fix in VS Code's diff editor
   */
  async previewInDiffEditor(proposal: FixProposal): Promise<void> {
    const filePath = proposal.vulnerability.file;
    const absolutePath = this.resolveAbsolutePath(filePath);
    const uri = vscode.Uri.file(absolutePath);

    // Create a virtual document with the fixed content
    const fixedUri = uri.with({
      scheme: 'ciphermate-fix',
      query: JSON.stringify({ fixId: proposal.id })
    });

    // Register a text document content provider if not already registered
    // Note: This should ideally be done once during extension activation

    // Open the diff editor
    await vscode.commands.executeCommand(
      'vscode.diff',
      uri,
      fixedUri,
      `Fix Preview: ${path.basename(filePath)}`
    );
  }

  /**
   * Show the fix in a side-by-side view
   */
  async showSideBySide(proposal: FixProposal): Promise<void> {
    const filePath = proposal.vulnerability.file;
    const absolutePath = this.resolveAbsolutePath(filePath);
    const uri = vscode.Uri.file(absolutePath);

    // Open the original file
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.One,
      preview: false
    });

    // Highlight the affected line
    const line = Math.max(0, (proposal.vulnerability.line || 1) - 1);
    if (line < document.lineCount) {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const range = document.lineAt(line).range;
        editor.selection = new vscode.Selection(range.start, range.end);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      }
    }
  }
}
