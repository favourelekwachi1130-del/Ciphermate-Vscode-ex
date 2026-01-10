/**
 * Hardcoded Secrets Detection Scanner
 * Scans code files for exposed credentials, API keys, tokens, etc.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import { BaseScanner } from './base-scanner';
import { ScanResult, Vulnerability, Severity } from './types';

interface SecretPattern {
  name: string;
  pattern: RegExp;
  severity: Severity;
  description: string;
  examples: string[];
}

export class SecretsScanner extends BaseScanner {
  private secretPatterns: SecretPattern[] = [];

  constructor(workspacePath: string) {
    super(workspacePath);
    this.initializePatterns();
  }

  getName(): string {
    return 'secrets-scanner';
  }

  getDescription(): string {
    return 'Scans code files for hardcoded secrets, API keys, passwords, and credentials';
  }

  async isAvailable(): Promise<boolean> {
    return true; // Always available, no external dependencies
  }

  async scan(): Promise<ScanResult> {
    const startTime = Date.now();
    const vulnerabilities: Vulnerability[] = [];

    try {
      // Find all code files
      const codeFiles = await this.findCodeFiles();

      for (const file of codeFiles) {
        const fileVulns = await this.scanFile(file);
        vulnerabilities.push(...fileVulns);
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

  private initializePatterns(): void {
    this.secretPatterns = [
      // AWS Keys
      {
        name: 'AWS Access Key',
        pattern: /AKIA[0-9A-Z]{16}/i,
        severity: 'critical',
        description: 'AWS Access Key ID found in code',
        examples: ['AKIAIOSFODNN7EXAMPLE'],
      },
      {
        name: 'AWS Secret Key',
        pattern: /aws.{0,20}['"]([A-Za-z0-9/+=]{40})['"]/i,
        severity: 'critical',
        description: 'AWS Secret Access Key found in code',
        examples: ['wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'],
      },
      // API Keys
      {
        name: 'Generic API Key',
        pattern: /(api[_-]?key|apikey|api_key)\s*[:=]\s*['"]([A-Za-z0-9_\-]{20,})['"]/i,
        severity: 'high',
        description: 'API key found in code',
        examples: ['api_key: "sk_live_1234567890abcdef"'],
      },
      {
        name: 'GitHub Token',
        pattern: /ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|ghu_[A-Za-z0-9]{36}|ghs_[A-Za-z0-9]{36}|ghr_[A-Za-z0-9]{36}/,
        severity: 'critical',
        description: 'GitHub Personal Access Token found',
        examples: ['ghp_1234567890abcdefghijklmnopqrstuvwxyz'],
      },
      {
        name: 'GitHub App Token',
        pattern: /ghu_[A-Za-z0-9]{36}/,
        severity: 'critical',
        description: 'GitHub App Token found',
        examples: ['ghu_1234567890abcdefghijklmnopqrstuvwxyz'],
      },
      // Passwords
      {
        name: 'Password in Code',
        pattern: /(password|passwd|pwd)\s*[:=]\s*['"]([^'"]{8,})['"]/i,
        severity: 'high',
        description: 'Password found in code',
        examples: ['password: "mypassword123"'],
      },
      // Database Credentials
      {
        name: 'Database Connection String',
        pattern: /(mongodb|postgres|mysql|redis):\/\/[^:]+:[^@]+@/i,
        severity: 'critical',
        description: 'Database connection string with credentials found',
        examples: ['mongodb://user:password@host:27017/db'],
      },
      // Private Keys
      {
        name: 'Private Key',
        pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/i,
        severity: 'critical',
        description: 'Private key found in code',
        examples: ['-----BEGIN RSA PRIVATE KEY-----'],
      },
      // OAuth Tokens
      {
        name: 'OAuth Token',
        pattern: /(oauth[_-]?token|access[_-]?token)\s*[:=]\s*['"]([A-Za-z0-9_\-]{20,})['"]/i,
        severity: 'high',
        description: 'OAuth or access token found',
        examples: ['oauth_token: "ya29.a0AfH6SMC..."'],
      },
      // JWT Tokens (long base64 strings)
      {
        name: 'JWT Token',
        pattern: /eyJ[A-Za-z0-9-_=]+\.eyJ[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/,
        severity: 'medium',
        description: 'JWT token found (may be sensitive)',
        examples: ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'],
      },
      // Slack Tokens
      {
        name: 'Slack Token',
        pattern: /xox[baprs]-[0-9a-zA-Z\-]{10,48}/,
        severity: 'high',
        description: 'Slack API token found',
        examples: ['xoxb-1234567890-1234567890123-abcdefghijklmnopqrstuvwx'],
      },
      // Stripe Keys
      {
        name: 'Stripe Key',
        pattern: /sk_live_[0-9a-zA-Z]{24,}|pk_live_[0-9a-zA-Z]{24,}/,
        severity: 'critical',
        description: 'Stripe live API key found',
        examples: ['sk_live_1234567890abcdefghijklmnopqrstuvwxyz'],
      },
    ];
  }

  private async findCodeFiles(): Promise<string[]> {
    const files: string[] = [];

    // Common code file extensions
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

    for (const pattern of codeExtensions) {
      const found = await vscode.workspace.findFiles(
        pattern,
        '**/{node_modules,dist,build,target,.git,vendor,venv,.venv,coverage,__pycache__,.next,.nuxt,out,.output}/**'
      );
      files.push(...found.map(f => f.fsPath));
    }

    return [...new Set(files)]; // Remove duplicates
  }

  private async scanFile(filePath: string): Promise<Vulnerability[]> {
    const vulnerabilities: Vulnerability[] = [];

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i + 1;

        for (const pattern of this.secretPatterns) {
          const matches = line.match(pattern.pattern);
          if (matches) {
            // Extract the secret (try to get the actual value)
            const secretMatch = matches[0];
            const maskedSecret = this.maskSecret(secretMatch);

            vulnerabilities.push({
              id: this.generateVulnId('secret', filePath, lineNumber),
              type: 'hardcoded-secret',
              severity: pattern.severity,
              title: `${pattern.name} found`,
              description: `${pattern.description}. Found: ${maskedSecret}`,
              file: filePath,
              line: lineNumber,
              code: line.trim(),
              metadata: {
                pattern: pattern.name,
                examples: pattern.examples,
              },
            });
          }
        }
      }
    } catch (error: any) {
      // Skip files we can't read
      console.error(`Error reading ${filePath}:`, error);
    }

    return vulnerabilities;
  }

  private maskSecret(secret: string): string {
    if (secret.length <= 8) {
      return '***';
    }
    return secret.substring(0, 4) + '***' + secret.substring(secret.length - 4);
  }
}

