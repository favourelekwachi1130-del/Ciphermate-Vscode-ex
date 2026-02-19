/**
 * Disk-based storage service for large data
 * Uses VS Code's globalStorageUri to store data on disk instead of in-memory globalState
 * This addresses the "large extension state detected" warning
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class DiskStorageService {
  private storageDir: string;
  private context: vscode.ExtensionContext;
  private initialized: boolean = false;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    // globalStorageUri is a URI, convert to file system path
    const storageUri = context.globalStorageUri;
    this.storageDir = storageUri.fsPath;
  }

  /**
   * Initialize storage directory if it doesn't exist
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Ensure the storage directory exists
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize disk storage:', error);
      throw error;
    }
  }

  /**
   * Get the file path for a given key
   */
  private getFilePath(key: string): string {
    // Sanitize key to be filesystem-safe
    const sanitizedKey = key.replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(this.storageDir, `${sanitizedKey}.json`);
  }

  /**
   * Read data from disk storage (synchronous for API compatibility)
   */
  get<T>(key: string, defaultValue: T): T {
    this.ensureInitializedSync();
    
    const filePath = this.getFilePath(key);
    
    try {
      if (!fs.existsSync(filePath)) {
        return defaultValue;
      }

      const fileContent = fs.readFileSync(filePath, 'utf8');
      if (!fileContent || fileContent.trim() === '') {
        return defaultValue;
      }

      const data = JSON.parse(fileContent);
      return data as T;
    } catch (error) {
      console.error(`Failed to read disk storage key "${key}":`, error);
      return defaultValue;
    }
  }

  /**
   * Write data to disk storage (synchronous for API compatibility)
   */
  update<T>(key: string, value: T): void {
    this.ensureInitializedSync();
    
    const filePath = this.getFilePath(key);
    
    try {
      // Write atomically: write to temp file, then rename
      const tempPath = `${filePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf8');
      fs.renameSync(tempPath, filePath);
    } catch (error) {
      console.error(`Failed to write disk storage key "${key}":`, error);
      throw error;
    }
  }

  /**
   * Synchronous initialization
   */
  private ensureInitializedSync(): void {
    if (this.initialized) {
      return;
    }

    try {
      // Ensure the storage directory exists
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize disk storage:', error);
      throw error;
    }
  }

  /**
   * Delete data from disk storage (synchronous)
   */
  delete(key: string): void {
    this.ensureInitializedSync();
    
    const filePath = this.getFilePath(key);
    
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`Failed to delete disk storage key "${key}":`, error);
      // Don't throw - deletion failures are not critical
    }
  }

  /**
   * Check if a key exists in disk storage (synchronous)
   */
  exists(key: string): boolean {
    this.ensureInitializedSync();
    
    const filePath = this.getFilePath(key);
    return fs.existsSync(filePath);
  }

  /**
   * Get all keys stored in disk storage (synchronous)
   */
  getAllKeys(): string[] {
    this.ensureInitializedSync();
    
    try {
      if (!fs.existsSync(this.storageDir)) {
        return [];
      }

      const files = fs.readdirSync(this.storageDir);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
    } catch (error) {
      console.error('Failed to list disk storage keys:', error);
      return [];
    }
  }

  /**
   * Get storage directory path (for debugging/migration)
   */
  getStoragePath(): string {
    return this.storageDir;
  }

  /**
   * Migrate data from globalState to disk storage
   * This should be called once during extension activation
   * Returns number of keys migrated
   */
  migrateFromGlobalState(keys: string[]): number {
    this.ensureInitializedSync();
    let migratedCount = 0;

    for (const key of keys) {
      try {
        // Check if data exists in globalState
        const value = this.context.globalState.get(key);
        if (value !== undefined && value !== null && value !== '') {
          // Check if already migrated to disk
          const exists = this.exists(key);
          if (!exists) {
            // Migrate to disk
            this.update(key, value);
            console.log(`Migrated "${key}" from globalState to disk storage`);
            migratedCount++;
            
            // Clear from globalState after successful migration
            // This prevents the "large extension state" warning
            this.context.globalState.update(key, undefined);
            console.log(`Cleared "${key}" from globalState after migration`);
          } else {
            // Already on disk, but might still be in globalState - clear it
            const stillInGlobalState = this.context.globalState.get(key);
            if (stillInGlobalState !== undefined) {
              this.context.globalState.update(key, undefined);
              console.log(`Cleared stale "${key}" from globalState (already on disk)`);
            }
          }
        }
      } catch (error) {
        console.error(`Failed to migrate key "${key}":`, error);
        // Continue with other keys
      }
    }
    
    return migratedCount;
  }

  /**
   * Clear all data from disk storage (use with caution)
   */
  clearAll(): void {
    this.ensureInitializedSync();
    
    try {
      const keys = this.getAllKeys();
      for (const key of keys) {
        this.delete(key);
      }
    } catch (error) {
      console.error('Failed to clear disk storage:', error);
      throw error;
    }
  }
}
