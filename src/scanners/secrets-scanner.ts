/**
 * Hardcoded Secrets Detection Scanner
 * Scans code files for exposed credentials, API keys, tokens, etc.
 * 
 * Uses CipherMate Core SecretDetectionService for all detection logic.
 */

import * as vscode from 'vscode';
import { BaseScanner } from './base-scanner';
import { ScanResult, Vulnerability, Severity } from './types';
import { getSecretDetectionService } from '../core/secret-detection-service';
import { getFileOperationsService } from '../core/file-operations-service';

export class SecretsScanner extends BaseScanner {
  private secretDetectionService = getSecretDetectionService();
  private fileOperationsService = getFileOperationsService();

  constructor(workspacePath: string) {
    super(workspacePath);
  }

  getName(): string {
    return 'secrets-scanner';
  }

  getDescription(): string {
    return 'Scans code files for hardcoded secrets, API keys, passwords, and credentials';
  }

  async isAvailable(): Promise<boolean> {
    // Check if scanner is enabled in settings
    return this.config.get<boolean>('scanners.enableSecrets', true);
  }

  async scan(): Promise<ScanResult> {
    const startTime = Date.now();
    const vulnerabilities: Vulnerability[] = [];

    try {
      // Find all code files using core service
      const codeFiles = await this.findCodeFiles();

      // Use core SecretDetectionService for all detection logic
      // Process files in smaller batches with event loop yielding to prevent blocking
      const BATCH_SIZE = 20; // Reduced batch size to prevent blocking
      const MAX_FILES_TO_SCAN = 10000; // Increased limit - still prevents hanging but covers more repos
      
      const filesToScan = codeFiles.slice(0, MAX_FILES_TO_SCAN);
      const filesSkipped = codeFiles.length > MAX_FILES_TO_SCAN ? codeFiles.length - MAX_FILES_TO_SCAN : 0;
      
      if (filesSkipped > 0) {
        console.log(`⚠️ Large repository detected: Limiting scan to ${MAX_FILES_TO_SCAN} files (${filesSkipped} files skipped)`);
        // Add warning to vulnerabilities so user knows
        vulnerabilities.push({
          id: this.generateVulnId('info', 'scan-limit', 0),
          type: 'scan-limit-info',
          severity: 'info',
          title: `Large Repository: Scanned ${MAX_FILES_TO_SCAN} of ${codeFiles.length} files`,
          description: `To ensure fast scanning, only the first ${MAX_FILES_TO_SCAN} files were scanned. ${filesSkipped} files were skipped. Consider scanning specific directories for more thorough analysis.`,
          file: this.workspacePath,
          line: 0,
          column: 0,
          code: '',
          metadata: {
            filesFound: codeFiles.length,
            filesScanned: MAX_FILES_TO_SCAN,
            filesSkipped: filesSkipped,
          },
        });
      }

      // Helper function to yield control to event loop
      const yieldToEventLoop = (): Promise<void> => {
        return new Promise(resolve => setTimeout(resolve, 0));
      };

      for (let i = 0; i < filesToScan.length; i += BATCH_SIZE) {
        const batch = filesToScan.slice(i, i + BATCH_SIZE);
        
        // Process batch with timeout and memory limits
        const batchPromises = batch.map(async (file) => {
          try {
            // Limit file size to 1MB for secrets scanning to prevent memory issues
            const content = await Promise.race([
              this.fileOperationsService.readFile(file, 1024 * 1024), // 1MB limit
              new Promise<string>((_, reject) => 
                setTimeout(() => reject(new Error('File read timeout')), 30000) // 30 second timeout per file
              )
            ]);
            
            const detectionResult = this.secretDetectionService.detectSecrets(content, file);

            // Convert core service results to Vulnerability format
            for (const secret of detectionResult.secrets) {
              // Limit code snippet to prevent memory bloat (max 500 chars)
              const codeSnippet = secret.context ? secret.context.trim().substring(0, 500) : '';
              
              vulnerabilities.push({
                id: this.generateVulnId('secret', file, secret.line),
                type: 'hardcoded-secret',
                severity: secret.severity,
                title: `${secret.patternName} found`,
                description: `Confidence: ${(secret.confidence * 100).toFixed(0)}%. ${secret.maskedValue}`,
                file: file,
                line: secret.line,
                column: secret.column,
                code: codeSnippet,
                metadata: {
                  pattern: secret.patternName,
                  entropy: secret.entropy,
                  confidence: secret.confidence,
                },
              });
            }
          } catch (error: any) {
            // Skip files we can't read or that timeout
            if (!error.message?.includes('timeout')) {
              console.error(`Error reading ${file}:`, error);
            }
          }
        });

        // Wait for batch to complete, but don't fail entire scan if some files fail
        await Promise.allSettled(batchPromises);
        
        // Yield control to event loop after each batch to prevent blocking
        await yieldToEventLoop();
        
        // Log progress for large scans
        if (filesToScan.length > 100 && (i + BATCH_SIZE) % 200 === 0) {
          console.log(`Secrets scanner progress: ${Math.min(i + BATCH_SIZE, filesToScan.length)}/${filesToScan.length} files`);
        }
      }

      return {
        scanner: this.getName(),
        success: true,
        vulnerabilities,
        summary: this.calculateSummary(vulnerabilities),
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error: any) {
      return {
        scanner: this.getName(),
        success: false,
        vulnerabilities: [],
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        duration: Date.now() - startTime,
        timestamp: new Date(),
        error: error.message,
      };
    }
  }

  private async findCodeFiles(): Promise<string[]> {
    // Use core FileOperationsService to find files
    // Limit to most common file types to improve performance
    const codeExtensions = [
      '**/*.js',
      '**/*.ts',
      '**/*.jsx',
      '**/*.tsx',
      '**/*.py',
      '**/*.java',
      '**/*.go',
      '**/*.rs',
      '**/*.php',
      '**/*.rb',
      '**/*.cs',
      '**/*.cpp',
      '**/*.c',
      '**/*.h',
      '**/*.swift',
      '**/*.kt',
      '**/*.scala',
      '**/*.sh',
      '**/*.yaml',
      '**/*.yml',
      '**/*.json',
      '**/*.env*',
      '**/*.config.*',
    ];

    const excludePattern = '**/{node_modules,dist,build,target,.git,vendor,venv,.venv,coverage,__pycache__,.next,.nuxt,out,.output}/**';
    const MAX_FILES = 15000; // Increased limit - covers very large repos while still preventing hangs
    
    const files: string[] = [];
    
    // Use Promise.all with timeout to prevent hanging
    const findFilesWithTimeout = async (pattern: string): Promise<vscode.Uri[]> => {
      return Promise.race([
        vscode.workspace.findFiles(pattern, excludePattern, MAX_FILES),
        new Promise<vscode.Uri[]>((_, reject) => 
          setTimeout(() => reject(new Error(`File search timed out for pattern: ${pattern}`)), 30000) // 30 second timeout per pattern
        )
      ]);
    };

    // Helper function to yield control to event loop
    const yieldToEventLoop = (): Promise<void> => {
      return new Promise(resolve => setTimeout(resolve, 0));
    };

    try {
      // Process patterns in smaller batches to avoid overwhelming the system
      const batchSize = 3; // Reduced batch size
      for (let i = 0; i < codeExtensions.length; i += batchSize) {
        const batch = codeExtensions.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
          batch.map(pattern => findFilesWithTimeout(pattern))
        );
        
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            files.push(...result.value.map(f => f.fsPath));
          } else {
            console.warn(`Failed to find files for pattern: ${result.reason}`);
          }
        }
        
        // Yield control to event loop after each batch to prevent blocking
        await yieldToEventLoop();
        
        // If we've found enough files, stop searching
        if (files.length >= MAX_FILES) {
          console.log(`Reached file limit (${MAX_FILES}), stopping search`);
          break;
        }
      }
    } catch (error) {
      console.error('Error finding code files:', error);
    }

    const uniqueFiles = [...new Set(files)]; // Remove duplicates
    
    // Limit total files to prevent processing too many
    if (uniqueFiles.length > MAX_FILES) {
      console.log(`Limiting files from ${uniqueFiles.length} to ${MAX_FILES}`);
      return uniqueFiles.slice(0, MAX_FILES);
    }
    
    return uniqueFiles;
  }
}

