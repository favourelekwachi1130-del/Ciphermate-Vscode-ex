/**
 * Backup Manager for Safe Vulnerability Fixes
 *
 * Handles creating, storing, and restoring file backups before
 * vulnerability fixes are applied. Uses VS Code's globalState
 * for persistent storage.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BackupSnapshot } from './types';

export class BackupManager {
  private context: vscode.ExtensionContext;
  private readonly BACKUP_KEY = 'ciphermate.fixBackups';
  private readonly MAX_BACKUPS = 100;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Create a backup of a file before modification
   */
  async createBackup(filePath: string, fixId: string): Promise<BackupSnapshot> {
    // Read the current file content
    const absolutePath = this.resolveAbsolutePath(filePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = await fs.promises.readFile(absolutePath, 'utf-8');

    // Create backup snapshot
    const backup: BackupSnapshot = {
      id: `backup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      filePath: absolutePath,
      content,
      fixId,
      createdAt: new Date(),
      restored: false
    };

    // Save to storage
    await this.saveBackup(backup);

    console.log(`BackupManager: Created backup ${backup.id} for ${filePath}`);
    return backup;
  }

  /**
   * Restore a file from a backup
   */
  async restoreFromBackup(backupId: string): Promise<boolean> {
    const backup = await this.getBackup(backupId);

    if (!backup) {
      console.error(`BackupManager: Backup not found: ${backupId}`);
      return false;
    }

    if (backup.restored) {
      console.warn(`BackupManager: Backup ${backupId} has already been restored`);
      return false;
    }

    try {
      // Use VS Code's WorkspaceEdit for native undo support
      const uri = vscode.Uri.file(backup.filePath);
      const edit = new vscode.WorkspaceEdit();

      // Read current file to get full range
      const document = await vscode.workspace.openTextDocument(uri);
      const fullRange = new vscode.Range(
        document.lineAt(0).range.start,
        document.lineAt(document.lineCount - 1).range.end
      );

      // Replace entire content with backup
      edit.replace(uri, fullRange, backup.content);

      const success = await vscode.workspace.applyEdit(edit);

      if (success) {
        // Mark backup as restored
        backup.restored = true;
        await this.updateBackup(backup);
        console.log(`BackupManager: Restored file from backup ${backupId}`);
      }

      return success;
    } catch (error) {
      console.error(`BackupManager: Failed to restore from backup ${backupId}:`, error);
      return false;
    }
  }

  /**
   * Get a specific backup by ID
   */
  async getBackup(backupId: string): Promise<BackupSnapshot | undefined> {
    const backups = await this.getAllBackups();
    return backups.find(b => b.id === backupId);
  }

  /**
   * Get backup by fix ID
   */
  async getBackupByFixId(fixId: string): Promise<BackupSnapshot | undefined> {
    const backups = await this.getAllBackups();
    return backups.find(b => b.fixId === fixId);
  }

  /**
   * Get all backups for a file
   */
  async getBackupsForFile(filePath: string): Promise<BackupSnapshot[]> {
    const absolutePath = this.resolveAbsolutePath(filePath);
    const backups = await this.getAllBackups();
    return backups.filter(b => b.filePath === absolutePath);
  }

  /**
   * Get all stored backups
   */
  async getAllBackups(): Promise<BackupSnapshot[]> {
    const stored = this.context.globalState.get<BackupSnapshot[]>(this.BACKUP_KEY, []);

    // Convert date strings back to Date objects
    return stored.map(b => ({
      ...b,
      createdAt: new Date(b.createdAt)
    }));
  }

  /**
   * Check if a file has uncommitted Git changes
   */
  async hasUncommittedChanges(filePath: string): Promise<boolean> {
    const absolutePath = this.resolveAbsolutePath(filePath);
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (!workspaceRoot) {
      return false;
    }

    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Check if the file is tracked and has changes
      const relativePath = path.relative(workspaceRoot, absolutePath);
      const { stdout } = await execAsync(`git status --porcelain "${relativePath}"`, {
        cwd: workspaceRoot
      });

      // If there's output, the file has changes
      return stdout.trim().length > 0;
    } catch (error) {
      // Git not available or not a git repo - assume no uncommitted changes
      return false;
    }
  }

  /**
   * Check if file exists and is writable
   */
  async isFileWritable(filePath: string): Promise<boolean> {
    const absolutePath = this.resolveAbsolutePath(filePath);

    try {
      await fs.promises.access(absolutePath, fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if file has unsaved changes in editor
   */
  async hasUnsavedChanges(filePath: string): Promise<boolean> {
    const absolutePath = this.resolveAbsolutePath(filePath);
    const uri = vscode.Uri.file(absolutePath);

    // Find any open document for this file
    const document = vscode.workspace.textDocuments.find(
      doc => doc.uri.fsPath === uri.fsPath
    );

    return document?.isDirty ?? false;
  }

  /**
   * Clean up old backups based on retention period
   */
  async cleanupOldBackups(maxAgeDays: number = 7): Promise<number> {
    const backups = await this.getAllBackups();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

    const validBackups = backups.filter(b => {
      const createdAt = new Date(b.createdAt);
      return createdAt > cutoffDate;
    });

    const removedCount = backups.length - validBackups.length;

    if (removedCount > 0) {
      await this.context.globalState.update(this.BACKUP_KEY, validBackups);
      console.log(`BackupManager: Cleaned up ${removedCount} old backups`);
    }

    return removedCount;
  }

  /**
   * Delete a specific backup
   */
  async deleteBackup(backupId: string): Promise<boolean> {
    const backups = await this.getAllBackups();
    const index = backups.findIndex(b => b.id === backupId);

    if (index === -1) {
      return false;
    }

    backups.splice(index, 1);
    await this.context.globalState.update(this.BACKUP_KEY, backups);
    console.log(`BackupManager: Deleted backup ${backupId}`);
    return true;
  }

  /**
   * Get backup statistics
   */
  async getStats(): Promise<{
    totalBackups: number;
    totalSize: number;
    oldestBackup: Date | null;
    newestBackup: Date | null;
    restoredCount: number;
  }> {
    const backups = await this.getAllBackups();

    if (backups.length === 0) {
      return {
        totalBackups: 0,
        totalSize: 0,
        oldestBackup: null,
        newestBackup: null,
        restoredCount: 0
      };
    }

    const dates = backups.map(b => new Date(b.createdAt).getTime());
    const totalSize = backups.reduce((sum, b) => sum + b.content.length, 0);
    const restoredCount = backups.filter(b => b.restored).length;

    return {
      totalBackups: backups.length,
      totalSize,
      oldestBackup: new Date(Math.min(...dates)),
      newestBackup: new Date(Math.max(...dates)),
      restoredCount
    };
  }

  /**
   * Save a new backup to storage
   */
  private async saveBackup(backup: BackupSnapshot): Promise<void> {
    const backups = await this.getAllBackups();

    // Add new backup
    backups.push(backup);

    // Enforce maximum backup count
    while (backups.length > this.MAX_BACKUPS) {
      // Remove oldest backup that has been restored (or just oldest if none restored)
      const restoredIndex = backups.findIndex(b => b.restored);
      if (restoredIndex !== -1) {
        backups.splice(restoredIndex, 1);
      } else {
        backups.shift();
      }
    }

    await this.context.globalState.update(this.BACKUP_KEY, backups);
  }

  /**
   * Update an existing backup in storage
   */
  private async updateBackup(backup: BackupSnapshot): Promise<void> {
    const backups = await this.getAllBackups();
    const index = backups.findIndex(b => b.id === backup.id);

    if (index !== -1) {
      backups[index] = backup;
      await this.context.globalState.update(this.BACKUP_KEY, backups);
    }
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
}
