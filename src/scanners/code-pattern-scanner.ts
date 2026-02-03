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

/**
 * Maps pattern names to specific vulnerability types for better fix matching
 */
const PATTERN_TO_TYPE: Record<string, string> = {
  'SQL Injection (Template Literal)': 'sql-injection',
  'SQL Injection (String Concatenation)': 'sql-injection',
  'SQL Injection (Raw Query)': 'sql-injection',
  'SQL Injection (Variable Construction)': 'sql-injection',
  'SQL Injection (Python f-string)': 'sql-injection',
  'XSS - innerHTML': 'xss',
  'XSS - dangerouslySetInnerHTML': 'xss',
  'XSS - innerHTML Assignment': 'xss',
  'Command Injection': 'command-injection',
  'Command Injection (String Concat)': 'command-injection',
  'Command Injection (Template Literal)': 'command-injection',
  'Python subprocess shell=True': 'command-injection',
  'Path Traversal': 'path-traversal',
  'Weak Hash Algorithm (MD5)': 'weak-hash',
  'Weak Hash Algorithm (SHA1)': 'weak-hash',
  'Insecure Random (Math.random)': 'insecure-random',
  'Insecure Random (Python random)': 'insecure-random',
  'Hardcoded Password': 'hardcoded-secret',
  'Weak Password Validation': 'weak-password',
  'Insecure Deserialization': 'insecure-deserialization',
  'eval Usage': 'eval',
  'Function Constructor': 'eval',
  'Pickle Deserialization': 'insecure-deserialization',
  'YAML Unsafe Load': 'yaml-injection',
  'SSRF Vulnerability': 'ssrf',
  'Insecure Direct Object Reference': 'idor',
  'Debug Mode Enabled': 'debug-mode',
};

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
      // Fixed: Only flag concatenation when inside SQL-like function calls
      {
        name: 'SQL Injection (Template Literal)',
        pattern: /(query|execute|exec|sql|db\.\w+)\s*\(\s*`[^`]*\$\{/i,
        severity: 'critical',
        description: 'Template literal with variable interpolation in database query. Risk of SQL injection.',
        cwe: ['CWE-89'],
        owasp: 'A03:2021 - Injection',
        fix: 'Use parameterized queries instead of template literals.',
        fileExtensions: ['.js', '.ts'],
      },
      {
        name: 'SQL Injection (String Concatenation)',
        // Fixed: The original pattern had two alternatives where the second matched ANY string concatenation.
        // Now requires BOTH the SQL function call AND the concatenation with SQL keywords.
        pattern: /(query|execute|exec|sql|db\.\w+)\s*\([^)]*(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|VALUES)[^)]*["']\s*\+/i,
        severity: 'high',
        description: 'String concatenation detected in database query context. Potential SQL injection risk.',
        cwe: ['CWE-89'],
        owasp: 'A03:2021 - Injection',
        fix: 'Use parameterized queries or prepared statements instead of string concatenation.',
        fileExtensions: ['.js', '.ts', '.py', '.java', '.php', '.cs'],
      },
      {
        name: 'SQL Injection (Raw Query)',
        pattern: /\.(raw|rawQuery|query)\s*\(\s*["'`].*?(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)/i,
        severity: 'high',
        description: 'Raw SQL query detected. Ensure user input is properly sanitized.',
        cwe: ['CWE-89'],
        owasp: 'A03:2021 - Injection',
        fix: 'Use parameterized queries or ORM methods instead of raw SQL.',
        fileExtensions: ['.js', '.ts', '.py', '.java', '.php'],
      },
      // NEW: SQL Injection - Variable construction with string concatenation
      {
        name: 'SQL Injection (Variable Construction)',
        pattern: /(?:const|let|var|=)\s*["'`].*?(?:SELECT|INSERT|UPDATE|DELETE|DROP|FROM|WHERE).*?["'`]\s*\+/i,
        severity: 'high',
        description: 'SQL query constructed with string concatenation. Risk of SQL injection.',
        cwe: ['CWE-89'],
        owasp: 'A03:2021 - Injection',
        fix: 'Use parameterized queries instead of string concatenation.',
        fileExtensions: ['.js', '.ts', '.py', '.java', '.php', '.cs'],
      },
      // NEW: SQL Injection - Python f-string
      {
        name: 'SQL Injection (Python f-string)',
        pattern: /f["'].*?(?:SELECT|INSERT|UPDATE|DELETE|DROP|FROM|WHERE).*?\{/i,
        severity: 'high',
        description: 'SQL query constructed with Python f-string interpolation. Risk of SQL injection.',
        cwe: ['CWE-89'],
        owasp: 'A03:2021 - Injection',
        fix: 'Use parameterized queries with cursor.execute(sql, params).',
        fileExtensions: ['.py'],
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
      // NEW: XSS - Broader innerHTML assignment detection
      {
        name: 'XSS - innerHTML Assignment',
        pattern: /\.innerHTML\s*=\s*[^;]+/i,
        severity: 'medium',
        description: 'innerHTML assignment detected. Can lead to XSS if user data is included.',
        cwe: ['CWE-79'],
        owasp: 'A03:2021 - Injection',
        fix: 'Use textContent instead, or sanitize with DOMPurify before using innerHTML.',
        fileExtensions: ['.js', '.ts', '.jsx', '.tsx'],
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
      // NEW: Command Injection - String concatenation (any variable)
      {
        name: 'Command Injection (String Concat)',
        pattern: /(exec|execSync|spawn|spawnSync|system|os\.system|os\.popen)\s*\(\s*["'`][^"'`]*["'`]\s*\+/i,
        severity: 'critical',
        description: 'Shell command constructed with string concatenation. Risk of command injection.',
        cwe: ['CWE-78'],
        owasp: 'A03:2021 - Injection',
        fix: 'Use execFile with argument array instead of shell command string.',
        fileExtensions: ['.js', '.ts', '.py', '.php'],
      },
      // NEW: Command Injection - Template literal
      {
        name: 'Command Injection (Template Literal)',
        pattern: /(exec|execSync|spawn|spawnSync)\s*\(\s*`[^`]*\$\{/i,
        severity: 'critical',
        description: 'Shell command constructed with template literal interpolation. Risk of command injection.',
        cwe: ['CWE-78'],
        owasp: 'A03:2021 - Injection',
        fix: 'Use execFile with argument array instead of shell command string.',
        fileExtensions: ['.js', '.ts'],
      },
      // NEW: Python subprocess shell=True
      {
        name: 'Python subprocess shell=True',
        pattern: /subprocess\.\w+\s*\([^)]*shell\s*=\s*True/i,
        severity: 'high',
        description: 'subprocess with shell=True allows command injection through shell interpretation.',
        cwe: ['CWE-78'],
        owasp: 'A03:2021 - Injection',
        fix: 'Use shell=False and pass command as a list of arguments.',
        fileExtensions: ['.py'],
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
      // NEW: eval Usage - standalone detection
      {
        name: 'eval Usage',
        pattern: /\beval\s*\(/i,
        severity: 'critical',
        description: 'eval() can execute arbitrary code. Dangerous if passed user input.',
        cwe: ['CWE-95'],
        owasp: 'A03:2021 - Injection',
        fix: 'Use JSON.parse for data, or a safe expression parser for calculations.',
        fileExtensions: ['.js', '.ts', '.py', '.php'],
      },
      // NEW: Function Constructor
      {
        name: 'Function Constructor',
        pattern: /new\s+Function\s*\(/i,
        severity: 'high',
        description: 'Function constructor can execute arbitrary code like eval().',
        cwe: ['CWE-95'],
        owasp: 'A03:2021 - Injection',
        fix: 'Avoid dynamic code generation. Use safe alternatives for the specific use case.',
        fileExtensions: ['.js', '.ts'],
      },
      // NEW: Pickle Deserialization (Python)
      {
        name: 'Pickle Deserialization',
        pattern: /pickle\.(loads?|load)\s*\(/i,
        severity: 'critical',
        description: 'Pickle deserialization can execute arbitrary code. Never use with untrusted data.',
        cwe: ['CWE-502'],
        owasp: 'A08:2021 - Software and Data Integrity Failures',
        fix: 'Use JSON or other safe serialization formats instead of pickle.',
        fileExtensions: ['.py'],
      },
      // NEW: YAML Unsafe Load (Python)
      {
        name: 'YAML Unsafe Load',
        pattern: /yaml\.(load|unsafe_load)\s*\(/i,
        severity: 'high',
        description: 'yaml.load without Loader parameter can execute arbitrary code.',
        cwe: ['CWE-502'],
        owasp: 'A08:2021 - Software and Data Integrity Failures',
        fix: 'Use yaml.safe_load() instead of yaml.load().',
        fileExtensions: ['.py'],
      },
      // NEW: Python insecure random
      {
        name: 'Insecure Random (Python random)',
        pattern: /\brandom\.(choice|randint|random|shuffle|sample)\s*\(/i,
        severity: 'medium',
        description: 'Python random module is not cryptographically secure. Use secrets module for security.',
        cwe: ['CWE-330'],
        owasp: 'A02:2021 - Cryptographic Failures',
        fix: 'Use the secrets module for cryptographically secure random values.',
        fileExtensions: ['.py'],
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
        '**/{node_modules,dist,build,target,.git,vendor,venv,.venv,coverage,__pycache__,.next,.nuxt,out,.output}/**'
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
            // Use specific vulnerability type from mapping, fallback to 'code-pattern'
            const vulnType = PATTERN_TO_TYPE[pattern.name] || 'code-pattern';

            vulnerabilities.push({
              id: this.generateVulnId(pattern.name.toLowerCase().replace(/\s+/g, '-'), filePath, lineNumber),
              type: vulnType,
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

