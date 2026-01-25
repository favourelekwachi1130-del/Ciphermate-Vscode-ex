/**
 * Undo Manager - Fix Rollback Management
 *
 * Maintains an undo stack for applied fixes and enables
 * rolling back changes when needed.
 */

import * as vscode from 'vscode';
import { UndoEntry, FixResult, BackupSnapshot } from './types';
import { BackupManager } from './backup-manager';

export class UndoManager {
  private context: vscode.ExtensionContext;
  private backupManager: BackupManager;
  private readonly UNDO_STACK_KEY = 'ciphermate.fixUndoStack';
  private readonly MAX_UNDO_ENTRIES = 50;

  constructor(context: vscode.ExtensionContext, backupManager: BackupManager) {
    this.context = context;
    this.backupManager = backupManager;
  }

  /**
   * Push a completed fix to the undo stack
   */
  async pushFix(fixResult: FixResult, backup: BackupSnapshot): Promise<void> {
    const entry: UndoEntry = {
      fixResultId: fixResult.fixId,
      backup,
      fixResult,
      addedAt: new Date()
    };

    const stack = await this.getUndoStack();
    stack.push(entry);

    // Limit stack size
    while (stack.length > this.MAX_UNDO_ENTRIES) {
      const removed = stack.shift();
      if (removed) {
        // Clean up old backup
        await this.backupManager.deleteBackup(removed.backup.id);
      }
    }

    await this.saveUndoStack(stack);
    console.log(`UndoManager: Pushed fix ${fixResult.fixId} to undo stack`);
  }

  /**
   * Undo the last applied fix
   */
  async undoLastFix(): Promise<{ success: boolean; fixId?: string; error?: string }> {
    const stack = await this.getUndoStack();

    if (stack.length === 0) {
      return { success: false, error: 'No fixes to undo' };
    }

    const entry = stack.pop()!;

    try {
      // Restore from backup
      const restored = await this.backupManager.restoreFromBackup(entry.backup.id);

      if (!restored) {
        // Push back to stack if restore failed
        stack.push(entry);
        await this.saveUndoStack(stack);
        return { success: false, fixId: entry.fixResultId, error: 'Failed to restore from backup' };
      }

      // Save updated stack
      await this.saveUndoStack(stack);

      // Show success message
      vscode.window.showInformationMessage(`Successfully undid fix for ${entry.backup.filePath}`);

      console.log(`UndoManager: Undid fix ${entry.fixResultId}`);

      return { success: true, fixId: entry.fixResultId };
    } catch (error) {
      // Push back to stack if restore failed
      stack.push(entry);
      await this.saveUndoStack(stack);

      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, fixId: entry.fixResultId, error: errorMessage };
    }
  }

  /**
   * Undo a specific fix by ID
   */
  async undoFix(fixId: string): Promise<{ success: boolean; error?: string }> {
    const stack = await this.getUndoStack();
    const index = stack.findIndex(e => e.fixResultId === fixId);

    if (index === -1) {
      return { success: false, error: `Fix ${fixId} not found in undo stack` };
    }

    const entry = stack[index];

    try {
      const restored = await this.backupManager.restoreFromBackup(entry.backup.id);

      if (!restored) {
        return { success: false, error: 'Failed to restore from backup' };
      }

      // Remove from stack
      stack.splice(index, 1);
      await this.saveUndoStack(stack);

      // Show success message
      vscode.window.showInformationMessage(`Successfully undid fix for ${entry.backup.filePath}`);

      console.log(`UndoManager: Undid specific fix ${fixId}`);

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Undo all fixes in a batch
   */
  async undoAll(): Promise<{ success: number; failed: number; errors: string[] }> {
    const stack = await this.getUndoStack();
    const errors: string[] = [];
    let success = 0;
    let failed = 0;

    // Undo in reverse order (most recent first)
    for (let i = stack.length - 1; i >= 0; i--) {
      const entry = stack[i];

      try {
        const restored = await this.backupManager.restoreFromBackup(entry.backup.id);

        if (restored) {
          success++;
        } else {
          failed++;
          errors.push(`Failed to restore ${entry.backup.filePath}`);
        }
      } catch (error) {
        failed++;
        errors.push(`Error restoring ${entry.backup.filePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Clear the stack after undoing
    await this.saveUndoStack([]);

    console.log(`UndoManager: Undid all fixes (${success} success, ${failed} failed)`);

    return { success, failed, errors };
  }

  /**
   * Check if there are fixes that can be undone
   */
  async canUndo(): Promise<boolean> {
    const stack = await this.getUndoStack();
    return stack.length > 0;
  }

  /**
   * Get the number of fixes that can be undone
   */
  async getUndoCount(): Promise<number> {
    const stack = await this.getUndoStack();
    return stack.length;
  }

  /**
   * Get the undo history
   */
  async getUndoHistory(): Promise<UndoEntry[]> {
    return await this.getUndoStack();
  }

  /**
   * Get a summary of undo entries
   */
  async getUndoSummary(): Promise<
    Array<{
      fixId: string;
      filePath: string;
      addedAt: Date;
      vulnerabilityType: string;
    }>
  > {
    const stack = await this.getUndoStack();

    return stack.map(entry => ({
      fixId: entry.fixResultId,
      filePath: entry.backup.filePath,
      addedAt: entry.addedAt,
      vulnerabilityType: entry.fixResult.filePath
    }));
  }

  /**
   * Clear the undo stack
   */
  async clearUndoStack(): Promise<void> {
    // Clean up associated backups
    const stack = await this.getUndoStack();
    for (const entry of stack) {
      await this.backupManager.deleteBackup(entry.backup.id);
    }

    await this.saveUndoStack([]);
    console.log('UndoManager: Cleared undo stack');
  }

  /**
   * Get the fix at the top of the undo stack (most recent)
   */
  async peekLastFix(): Promise<UndoEntry | undefined> {
    const stack = await this.getUndoStack();
    return stack.length > 0 ? stack[stack.length - 1] : undefined;
  }

  /**
   * Check if a specific fix can be undone
   */
  async canUndoFix(fixId: string): Promise<boolean> {
    const stack = await this.getUndoStack();
    return stack.some(e => e.fixResultId === fixId);
  }

  /**
   * Get undo stack from storage
   */
  private async getUndoStack(): Promise<UndoEntry[]> {
    const stored = this.context.globalState.get<UndoEntry[]>(this.UNDO_STACK_KEY, []);

    // Convert date strings back to Date objects
    return stored.map(e => ({
      ...e,
      addedAt: new Date(e.addedAt),
      backup: {
        ...e.backup,
        createdAt: new Date(e.backup.createdAt)
      },
      fixResult: {
        ...e.fixResult,
        appliedAt: new Date(e.fixResult.appliedAt)
      }
    }));
  }

  /**
   * Save undo stack to storage
   */
  private async saveUndoStack(stack: UndoEntry[]): Promise<void> {
    await this.context.globalState.update(this.UNDO_STACK_KEY, stack);
  }

  /**
   * Get statistics about the undo stack
   */
  async getStats(): Promise<{
    totalEntries: number;
    filesAffected: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  }> {
    const stack = await this.getUndoStack();

    if (stack.length === 0) {
      return {
        totalEntries: 0,
        filesAffected: 0,
        oldestEntry: null,
        newestEntry: null
      };
    }

    const files = new Set(stack.map(e => e.backup.filePath));
    const dates = stack.map(e => new Date(e.addedAt).getTime());

    return {
      totalEntries: stack.length,
      filesAffected: files.size,
      oldestEntry: new Date(Math.min(...dates)),
      newestEntry: new Date(Math.max(...dates))
    };
  }
}
