/**
 * Code Pattern Security Scanner
 * Detects OWASP Top 10 and common security vulnerabilities in code
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BaseScanner } from './base-scanner';
import { ScanResult, Vulnerability, Severity } from './types';

interface Pattern {
  name: string;
  pattern: RegExp;
  severity: Severity;
  description: string;
  cwe?: string[];
  owasp?: string;
  fix?: string;
  fileExtensions?: string[];
}

export class CodePatternScanner extends BaseScanner {
  private patterns: Pattern[] = [];

  constructor(workspacePath: string) {
    super(workspacePath);
    this.initializePatterns();
  }

  getName(): string {
    return 'code-pattern-scanner';
  }

  getDescription(): string {
    return 'Scans code for OWASP Top 10 vulnerabilities and common security patterns';
  }

  async isAvailable(): Promise<boolean> {
    return true; // Always available
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
    this.patterns = [
      // SQL Injection (OWASP A03:2021)
      {
        name: 'SQL Injection',
        pattern: /(query|execute|exec)\s*\(\s*["'`][^"'`]*\$\{|\+\s*["'`]|["'`]\s*\+/i,
        severity: 'critical',
        description: 'Potential SQL injection vulnerability. User input may be directly concatenated into SQL queries.',
        cwe: ['CWE-89'],
        owasp: 'A03:2021 - Injection',
        fix: 'Use parameterized queries or prepared statements instead of string concatenation.',
        fileExtensions: ['.js', '.ts', '.py', '.java', '.php', '.cs'],
      },
      {
        name: 'SQL Injection (Template Literal)',
        pattern: /(query|execute|exec)\s*\(\s*`[^`]*\$\{[^}]+\}[^`]*`/i,
        severity: 'critical',
        description: 'SQL query uses template literals with user input, risking SQL injection.',
        cwe: ['CWE-89'],
        owasp: 'A03:2021 - Injection',
        fix: 'Use parameterized queries instead of template literals.',
        fileExtensions: ['.js', '.ts'],
      },

      // XSS - Cross-Site Scripting (OWASP A03:2021)
      {
        name: 'XSS - innerHTML',
        pattern: /\.innerHTML\s*=\s*[^;]+(?:user|input|param|query|request|body|form)/i,
        severity: 'high',
        description: 'Setting innerHTML with user-controlled data may lead to XSS attacks.',
        cwe: ['CWE-79'],
        owasp: 'A03:2021 - Injection',
        fix: 'Use textContent or sanitize HTML before setting innerHTML.',
        fileExtensions: ['.js', '.ts', '.jsx', '.tsx'],
      },
      {
        name: 'XSS - dangerouslySetInnerHTML',
        pattern: /dangerouslySetInnerHTML/i,
        severity: 'high',
        description: 'React dangerouslySetInnerHTML prop can lead to XSS if content is not sanitized.',
        cwe: ['CWE-79'],
        owasp: 'A03:2021 - Injection',
        fix: 'Sanitize HTML content or use safer alternatives.',
        fileExtensions: ['.jsx', '.tsx'],
      },

      // Command Injection (OWASP A03:2021)
      {
        name: 'Command Injection',
        pattern: /(exec|spawn|system|shell_exec|passthru|popen)\s*\([^)]*(?:user|input|param|query|request|body|form)/i,
        severity: 'critical',
        description: 'User input may be executed as system commands, leading to command injection.',
        cwe: ['CWE-78'],
        owasp: 'A03:2021 - Injection',
        fix: 'Validate and sanitize user input, use parameterized command execution.',
        fileExtensions: ['.js', '.ts', '.py', '.php', '.sh'],
      },

      // Path Traversal (OWASP A01:2021)
      {
        name: 'Path Traversal',
        pattern: /(readFile|readFileSync|open|fopen|file_get_contents)\s*\([^)]*(?:\.\.\/|\.\.\\|user|input|param|query)/i,
        severity: 'high',
        description: 'File operations may be vulnerable to path traversal attacks.',
        cwe: ['CWE-22'],
        owasp: 'A01:2021 - Broken Access Control',
        fix: 'Validate and sanitize file paths, use path.join() and restrict to allowed directories.',
        fileExtensions: ['.js', '.ts', '.py', '.php', '.java'],
      },

      // Weak Cryptography
      {
        name: 'Weak Hash Algorithm (MD5)',
        pattern: /(createHash|md5|MD5)\s*\(/i,
        severity: 'high',
        description: 'MD5 is cryptographically broken and should not be used for security purposes.',
        cwe: ['CWE-327'],
        owasp: 'A02:2021 - Cryptographic Failures',
        fix: 'Use SHA-256 or stronger hash algorithms.',
        fileExtensions: ['.js', '.ts', '.py', '.java', '.php'],
      },
      {
        name: 'Weak Hash Algorithm (SHA1)',
        pattern: /(sha1|SHA1)\s*\(/i,
        severity: 'medium',
        description: 'SHA-1 is deprecated and should not be used for security purposes.',
        cwe: ['CWE-327'],
        owasp: 'A02:2021 - Cryptographic Failures',
        fix: 'Use SHA-256 or stronger hash algorithms.',
        fileExtensions: ['.js', '.ts', '.py', '.java', '.php'],
      },

      // Insecure Random Number Generation
      {
        name: 'Insecure Random (Math.random)',
        pattern: /Math\.random\s*\(/i,
        severity: 'medium',
        description: 'Math.random() is not cryptographically secure. Do not use for security-sensitive operations.',
        cwe: ['CWE-330'],
        owasp: 'A02:2021 - Cryptographic Failures',
        fix: 'Use crypto.getRandomValues() or crypto.randomBytes() for secure random numbers.',
        fileExtensions: ['.js', '.ts'],
      },

      // Hardcoded Credentials (already covered by SecretsScanner, but flag obvious ones)
      {
        name: 'Hardcoded Password',
        pattern: /(password|passwd|pwd)\s*[:=]\s*["']([^"']{4,})["']/i,
        severity: 'critical',
        description: 'Hardcoded password found in code. Move to environment variables or secure storage.',
        cwe: ['CWE-798'],
        owasp: 'A07:2021 - Identification and Authentication Failures',
        fix: 'Use environment variables or secure credential storage.',
        fileExtensions: ['.js', '.ts', '.py', '.java', '.php'],
      },

      // Weak Authentication
      {
        name: 'Weak Password Validation',
        pattern: /(password|passwd).*\.length\s*[<>=]\s*[0-5]/i,
        severity: 'medium',
        description: 'Password length requirement is too weak (less than 8 characters).',
        cwe: ['CWE-521'],
        owasp: 'A07:2021 - Identification and Authentication Failures',
        fix: 'Enforce minimum password length of 8-12 characters with complexity requirements.',
        fileExtensions: ['.js', '.ts', '.py', '.java', '.php'],
      },

      // Insecure Deserialization (OWASP A08:2021)
      {
        name: 'Insecure Deserialization',
        pattern: /(eval|Function|deserialize|unserialize|pickle\.loads|yaml\.load)\s*\([^)]*(?:user|input|param|query|request|body)/i,
        severity: 'critical',
        description: 'Deserializing user-controlled data can lead to code execution.',
        cwe: ['CWE-502'],
        owasp: 'A08:2021 - Software and Data Integrity Failures',
        fix: 'Avoid deserializing untrusted data. Use safe serialization formats or validate input.',
        fileExtensions: ['.js', '.ts', '.py', '.java', '.php'],
      },

      // SSRF - Server-Side Request Forgery
      {
        name: 'SSRF Vulnerability',
        pattern: /(fetch|request|http\.get|http\.post|axios\.get|axios\.post)\s*\([^)]*(?:user|input|param|query|request|body|url)/i,
        severity: 'high',
        description: 'Making HTTP requests with user-controlled URLs may lead to SSRF attacks.',
        cwe: ['CWE-918'],
        owasp: 'A10:2021 - Server-Side Request Forgery',
        fix: 'Validate and whitelist allowed URLs, use URL parsing to prevent internal network access.',
        fileExtensions: ['.js', '.ts', '.py', '.java'],
      },

      // Insecure Direct Object Reference (OWASP A01:2021)
      {
        name: 'Insecure Direct Object Reference',
        pattern: /(findById|findOne|getById|getUser)\s*\([^)]*(?:user|input|param|query|request|body)/i,
        severity: 'medium',
        description: 'Direct object access without authorization checks may expose unauthorized data.',
        cwe: ['CWE-639'],
        owasp: 'A01:2021 - Broken Access Control',
        fix: 'Add authorization checks to verify user has permission to access the requested resource.',
        fileExtensions: ['.js', '.ts', '.py', '.java', '.php'],
      },

      // Security Misconfiguration
      {
        name: 'Debug Mode Enabled',
        pattern: /(debug|DEBUG)\s*[:=]\s*(true|1|"true"|'true')/i,
        severity: 'medium',
        description: 'Debug mode enabled in production code may expose sensitive information.',
        cwe: ['CWE-489'],
        owasp: 'A05:2021 - Security Misconfiguration',
        fix: 'Disable debug mode in production environments.',
        fileExtensions: ['.js', '.ts', '.py', '.java', '.php', '.env'],
      },
    ];
  }

  private async findCodeFiles(): Promise<string[]> {
    const files: string[] = [];

    const codeExtensions = [
      '**/*.js',
      '**/*.ts',
      '**/*.jsx',
      '**/*.tsx',
      '**/*.py',
      '**/*.java',
      '**/*.php',
      '**/*.cs',
      '**/*.rb',
      '**/*.go',
      '**/*.rs',
    ];

    for (const pattern of codeExtensions) {
      const found = await vscode.workspace.findFiles(
        pattern,
        '**/node_modules/**,**/dist/**,**/build/**,**/target/**,**/.git/**,**/vendor/**'
      );
      files.push(...found.map(f => f.fsPath));
    }

    return [...new Set(files)];
  }

  private async scanFile(filePath: string): Promise<Vulnerability[]> {
    const vulnerabilities: Vulnerability[] = [];
    const ext = path.extname(filePath).toLowerCase();

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i + 1;

        for (const pattern of this.patterns) {
          // Check if pattern applies to this file type
          if (pattern.fileExtensions && !pattern.fileExtensions.includes(ext)) {
            continue;
          }

          const matches = line.match(pattern.pattern);
          if (matches) {
            vulnerabilities.push({
              id: this.generateVulnId(pattern.name.toLowerCase().replace(/\s+/g, '-'), filePath, lineNumber),
              type: 'code-pattern',
              severity: pattern.severity,
              title: `${pattern.name} detected`,
              description: pattern.description,
              file: filePath,
              line: lineNumber,
              code: line.trim(),
              cwe: pattern.cwe,
              fix: pattern.fix,
              references: pattern.owasp ? [`OWASP ${pattern.owasp}`] : undefined,
              metadata: {
                pattern: pattern.name,
                owasp: pattern.owasp,
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
}

