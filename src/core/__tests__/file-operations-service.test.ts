/**
 * Unit Tests for FileOperationsService
 * 
 * Tests verify CipherMate Core works independently without Mastra
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getFileOperationsService, FileOperationsService } from '../file-operations-service';

describe('FileOperationsService', () => {
  let service: FileOperationsService;
  let testDir: string;

  beforeEach(() => {
    service = getFileOperationsService();
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ciphermate-test-'));
  });

  afterEach(() => {
    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('File Reading', () => {
    it('should read file contents', async () => {
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'test content');
      
      const content = await service.readFile(testFile);
      expect(content).toBe('test content');
    });

    it('should throw error for non-existent file', async () => {
      const nonExistent = path.join(testDir, 'nonexistent.txt');
      
      await expect(service.readFile(nonExistent)).rejects.toThrow();
    });
  });

  describe('File Writing', () => {
    it('should write file contents', async () => {
      const testFile = path.join(testDir, 'write-test.txt');
      const content = 'written content';
      
      const result = await service.writeFile(testFile, content);
      expect(result.success).toBe(true);
      
      const readContent = fs.readFileSync(testFile, 'utf-8');
      expect(readContent).toBe(content);
    });

    it('should create directory if needed', async () => {
      const testFile = path.join(testDir, 'subdir', 'nested.txt');
      const content = 'nested content';
      
      const result = await service.writeFile(testFile, content);
      expect(result.success).toBe(true);
      expect(fs.existsSync(testFile)).toBe(true);
    });
  });

  describe('File Existence', () => {
    it('should check if file exists', async () => {
      const testFile = path.join(testDir, 'exists.txt');
      fs.writeFileSync(testFile, 'content');
      
      expect(await service.fileExists(testFile)).toBe(true);
      expect(await service.fileExists(path.join(testDir, 'nonexistent.txt'))).toBe(false);
    });
  });

  describe('File Metadata', () => {
    it('should get file metadata', async () => {
      const testFile = path.join(testDir, 'meta.txt');
      fs.writeFileSync(testFile, 'content');
      
      const metadata = await service.getFileMetadata(testFile);
      expect(metadata.path).toBe(testFile);
      expect(metadata.isFile).toBe(true);
      expect(metadata.isDirectory).toBe(false);
      expect(metadata.size).toBeGreaterThan(0);
    });
  });

  describe('Path Resolution', () => {
    it('should resolve relative paths', () => {
      const resolved = service.resolvePath('./test.txt', testDir);
      expect(resolved).toContain('test.txt');
    });

    it('should prevent directory traversal', () => {
      expect(() => {
        service.resolvePath('../../../etc/passwd', testDir);
      }).toThrow();
    });
  });

  describe('File Copying', () => {
    it('should copy file', async () => {
      const source = path.join(testDir, 'source.txt');
      const dest = path.join(testDir, 'dest.txt');
      fs.writeFileSync(source, 'source content');
      
      const result = await service.copyFile(source, dest);
      expect(result.success).toBe(true);
      expect(fs.existsSync(dest)).toBe(true);
      
      const destContent = fs.readFileSync(dest, 'utf-8');
      expect(destContent).toBe('source content');
    });
  });
});
