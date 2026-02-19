/**
 * File Operations Service
 * 
 * Owns all file system operations:
 * - Reading/writing files
 * - File system navigation
 * - Path resolution and validation
 * - File metadata operations
 * - Directory traversal
 * 
 * NO dependencies on Mastra or AI frameworks.
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const readdirAsync = promisify(fs.readdir);
const statAsync = promisify(fs.stat);
const mkdirAsync = promisify(fs.mkdir);

export interface FileMetadata {
  path: string;
  size: number;
  modified: Date;
  created: Date;
  isFile: boolean;
  isDirectory: boolean;
}

export interface FileOperationResult {
  success: boolean;
  path: string;
  error?: string;
}

export class FileOperationsService {
  /**
   * Read file contents with memory management
   * Limits file size to prevent memory issues (default: 2MB)
   */
  async readFile(filePath: string, maxSizeBytes: number = 2 * 1024 * 1024): Promise<string> {
    try {
      const resolvedPath = this.resolvePath(filePath);
      
      // Check file size before reading
      const stats = await statAsync(resolvedPath);
      if (stats.size > maxSizeBytes) {
        throw new Error(`File too large: ${filePath} (${(stats.size / 1024 / 1024).toFixed(2)}MB). Maximum size: ${(maxSizeBytes / 1024 / 1024).toFixed(2)}MB`);
      }
      
      const content = await readFileAsync(resolvedPath, 'utf-8');
      return content;
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Write file contents
   */
  async writeFile(filePath: string, content: string): Promise<FileOperationResult> {
    try {
      const resolvedPath = this.resolvePath(filePath);
      const dir = path.dirname(resolvedPath);
      
      // Ensure directory exists
      await this.ensureDirectoryExists(dir);
      
      await writeFileAsync(resolvedPath, content, 'utf-8');
      
      return {
        success: true,
        path: resolvedPath,
      };
    } catch (error) {
      return {
        success: false,
        path: filePath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Create a new file
   */
  async createFile(filePath: string, content: string = ''): Promise<FileOperationResult> {
    return this.writeFile(filePath, content);
  }

  /**
   * Delete a file
   */
  async deleteFile(filePath: string): Promise<FileOperationResult> {
    try {
      const resolvedPath = this.resolvePath(filePath);
      await promisify(fs.unlink)(resolvedPath);
      
      return {
        success: true,
        path: resolvedPath,
      };
    } catch (error) {
      return {
        success: false,
        path: filePath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      const resolvedPath = this.resolvePath(filePath);
      await statAsync(resolvedPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(filePath: string): Promise<FileMetadata> {
    try {
      const resolvedPath = this.resolvePath(filePath);
      const stats = await statAsync(resolvedPath);
      
      return {
        path: resolvedPath,
        size: stats.size,
        modified: stats.mtime,
        created: stats.birthtime,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
      };
    } catch (error) {
      throw new Error(`Failed to get metadata for ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List directory contents
   */
  async listDirectory(dirPath: string, recursive: boolean = false): Promise<string[]> {
    try {
      const resolvedPath = this.resolvePath(dirPath);
      const files: string[] = [];
      
      if (!recursive) {
        const entries = await readdirAsync(resolvedPath);
        return entries.map(entry => path.join(resolvedPath, entry));
      }
      
      // Recursive listing
      await this.listDirectoryRecursive(resolvedPath, files);
      return files;
    } catch (error) {
      throw new Error(`Failed to list directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Find files matching pattern
   */
  async findFiles(
    rootPath: string,
    pattern: RegExp | string,
    options: {
      recursive?: boolean;
      includeDirs?: boolean;
    } = {}
  ): Promise<string[]> {
    const files: string[] = [];
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    
    try {
      const allFiles = await this.listDirectory(rootPath, options.recursive ?? true);
      
      for (const file of allFiles) {
        const metadata = await this.getFileMetadata(file);
        
        if (metadata.isDirectory && !options.includeDirs) {
          continue;
        }
        
        if (regex.test(file) || regex.test(path.basename(file))) {
          files.push(file);
        }
      }
      
      return files;
    } catch (error) {
      throw new Error(`Failed to find files: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Resolve and validate path
   */
  resolvePath(filePath: string, basePath?: string): string {
    // Resolve relative paths
    const resolved = basePath 
      ? path.resolve(basePath, filePath)
      : path.resolve(filePath);
    
    // Security: Prevent directory traversal attacks
    if (resolved.includes('..')) {
      throw new Error(`Invalid path: ${filePath} (contains '..')`);
    }
    
    return resolved;
  }

  /**
   * Ensure directory exists, create if needed
   */
  async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      const resolvedPath = this.resolvePath(dirPath);
      await mkdirAsync(resolvedPath, { recursive: true });
    } catch (error) {
      // Ignore if directory already exists
      const stats = await statAsync(dirPath).catch(() => null);
      if (!stats || !stats.isDirectory()) {
        throw error;
      }
    }
  }

  /**
   * Copy file
   */
  async copyFile(sourcePath: string, destPath: string): Promise<FileOperationResult> {
    try {
      const content = await this.readFile(sourcePath);
      return await this.writeFile(destPath, content);
    } catch (error) {
      return {
        success: false,
        path: destPath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Move/rename file
   */
  async moveFile(sourcePath: string, destPath: string): Promise<FileOperationResult> {
    try {
      const copyResult = await this.copyFile(sourcePath, destPath);
      if (copyResult.success) {
        await this.deleteFile(sourcePath);
      }
      return copyResult;
    } catch (error) {
      return {
        success: false,
        path: destPath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Recursive directory listing helper
   */
  private async listDirectoryRecursive(dirPath: string, files: string[]): Promise<void> {
    try {
      const entries = await readdirAsync(dirPath);
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry);
        const stats = await statAsync(fullPath);
        
        if (stats.isDirectory()) {
          await this.listDirectoryRecursive(fullPath, files);
        } else {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip directories we can't read
      console.warn(`Cannot read directory ${dirPath}:`, error);
    }
  }
}

// Singleton instance
let fileOperationsServiceInstance: FileOperationsService | null = null;

export function getFileOperationsService(): FileOperationsService {
  if (!fileOperationsServiceInstance) {
    fileOperationsServiceInstance = new FileOperationsService();
  }
  return fileOperationsServiceInstance;
}
