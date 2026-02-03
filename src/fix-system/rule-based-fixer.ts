/**
 * Rule-Based Vulnerability Fixer
 *
 * Provides automatic fixes for common vulnerability patterns
 * without requiring AI. Used as a fallback when AI is unavailable
 * or for well-understood vulnerability types.
 */

import { Vulnerability } from '../scanners/types';

export interface RuleBasedFix {
  originalCode: string;
  fixedCode: string;
  explanation: string;
  confidence: number;
  securityImprovements: string[];
  testingNotes: string;
}

/**
 * Rule-based fixer for common vulnerabilities
 */
export class RuleBasedFixer {

  /**
   * Attempt to generate a fix using pattern matching rules
   * Returns null if no rule matches
   */
  public generateFix(vulnerability: Vulnerability): RuleBasedFix | null {
    const vulnType = vulnerability.type?.toLowerCase() || '';
    const title = vulnerability.title?.toLowerCase() || '';
    const description = vulnerability.description?.toLowerCase() || '';
    const code = vulnerability.code || '';

    // Combine type, title, and description for better matching
    // This handles cases where type is generic (e.g., 'code-pattern') but title/description are specific
    const combinedText = `${vulnType} ${title} ${description}`;

    // Try each fixer based on vulnerability type or combined text
    if (vulnType.includes('sql-injection') ||
        (combinedText.includes('sql') && (combinedText.includes('injection') || combinedText.includes('query')))) {
      return this.fixSqlInjection(vulnerability);
    }

    // XSS detection - more robust matching
    const isXss = vulnType === 'xss' ||
                  vulnType.includes('xss') ||
                  title.includes('xss') ||
                  title.includes('cross-site') ||
                  combinedText.includes('cross-site scripting') ||
                  combinedText.includes('dangerously') ||
                  (combinedText.includes('innerhtml') && !combinedText.includes('no innerhtml')) ||
                  (code.includes('.innerHTML') && (combinedText.includes('unsafe') || combinedText.includes('user')));

    if (isXss) {
      return this.fixXss(vulnerability);
    }

    if (vulnType.includes('command-injection') ||
        (combinedText.includes('command') && combinedText.includes('injection'))) {
      return this.fixCommandInjection(vulnerability);
    }

    if (vulnType.includes('hardcoded') || vulnType.includes('secret') || vulnType.includes('credential') ||
        combinedText.includes('hardcoded') || combinedText.includes('secret') ||
        (combinedText.includes('password') && !combinedText.includes('validation'))) {
      return this.fixHardcodedSecret(vulnerability);
    }

    // Path traversal detection - more robust matching
    const isPathTraversal = vulnType === 'path-traversal' ||
                            vulnType.includes('path-traversal') ||
                            vulnType.includes('path traversal') ||
                            title.includes('path traversal') ||
                            title.includes('directory traversal') ||
                            combinedText.includes('path traversal') ||
                            combinedText.includes('directory traversal') ||
                            (combinedText.includes('..') && combinedText.includes('file')) ||
                            (code.includes('..') && (code.includes('readFile') || code.includes('open')));

    if (isPathTraversal) {
      return this.fixPathTraversal(vulnerability);
    }

    if (vulnType.includes('insecure-random') || vulnType.includes('random') ||
        combinedText.includes('math.random') ||
        (combinedText.includes('insecure') && combinedText.includes('random'))) {
      return this.fixInsecureRandom(vulnerability);
    }

    // Eval detection - improved matching without requiring 'deserialization' keyword
    if (vulnType.includes('eval') ||
        vulnType === 'eval' ||
        title.includes('eval') ||
        title.includes('function constructor') ||
        code.includes('eval(') ||
        code.includes('new Function(')) {
      return this.fixEval(vulnerability);
    }

    // YAML injection handler
    if (vulnType.includes('yaml') ||
        vulnType === 'yaml-injection' ||
        combinedText.includes('yaml') ||
        code.includes('yaml.load') ||
        code.includes('yaml.unsafe_load')) {
      return this.fixYamlUnsafeLoad(vulnerability);
    }

    if (vulnType.includes('innerHTML') || vulnType.includes('innerhtml') ||
        (combinedText.includes('innerhtml') && !combinedText.includes('xss'))) {
      return this.fixInnerHtml(vulnerability);
    }

    // Add weak-hash handler (MD5, SHA1)
    if (vulnType.includes('weak-hash') || vulnType.includes('md5') || vulnType.includes('sha1') ||
        combinedText.includes('weak hash') || combinedText.includes('md5') || combinedText.includes('sha1')) {
      return this.fixWeakHash(vulnerability);
    }

    // Add insecure-deserialization handler (includes pickle)
    if (vulnType.includes('deserialization') || vulnType.includes('deserialize') ||
        combinedText.includes('deserialization') || combinedText.includes('unserialize') ||
        combinedText.includes('pickle') ||
        code.includes('pickle.load') || code.includes('pickle.loads')) {
      return this.fixInsecureDeserialization(vulnerability);
    }

    // Python subprocess shell=True handler (treated as command injection)
    if (code.includes('shell=True') || code.includes('shell = True')) {
      return this.fixSubprocessShell(vulnerability);
    }

    // Add SSRF handler
    if (vulnType.includes('ssrf') || vulnType.includes('server-side request') ||
        combinedText.includes('ssrf') || combinedText.includes('server-side request forgery')) {
      return this.fixSSRF(vulnerability);
    }

    // Add IDOR handler
    if (vulnType.includes('idor') || vulnType.includes('insecure direct object') ||
        combinedText.includes('idor') || combinedText.includes('insecure direct object reference')) {
      return this.fixIDOR(vulnerability);
    }

    // Add debug-mode handler
    if (vulnType.includes('debug-mode') || vulnType.includes('debug') ||
        combinedText.includes('debug mode') || combinedText.includes('debug: true') || combinedText.includes('debug=true')) {
      return this.fixDebugMode(vulnerability);
    }

    // Add weak-password handler
    if (vulnType.includes('weak-password') || vulnType.includes('password-policy') ||
        (combinedText.includes('weak') && combinedText.includes('password'))) {
      return this.fixWeakPassword(vulnerability);
    }

    // No matching rule
    return null;
  }

  /**
   * Fix SQL injection by converting to parameterized queries
   */
  private fixSqlInjection(vulnerability: Vulnerability): RuleBasedFix {
    const code = vulnerability.code || '';

    // Pattern: String concatenation with +
    // e.g., "SELECT * FROM users WHERE id = " + userId
    const concatMatch = code.match(/["'`]([^"'`]*(?:SELECT|INSERT|UPDATE|DELETE)[^"'`]*)["'`]\s*\+\s*(\w+)/i);
    if (concatMatch) {
      const [fullMatch, sqlPart, variable] = concatMatch;
      const fixedCode = code.replace(
        fullMatch,
        `db.prepare("${sqlPart}?").bind(${variable})`
      );
      return {
        originalCode: code,
        fixedCode,
        explanation: 'Converted string concatenation to parameterized query using prepared statements',
        confidence: 0.85,
        securityImprovements: [
          'Uses parameterized queries to prevent SQL injection',
          'Input is properly escaped by the database driver'
        ],
        testingNotes: 'Test with malicious input like: \' OR 1=1 --'
      };
    }

    // Pattern: Template literal
    // e.g., `SELECT * FROM users WHERE id = ${userId}`
    const templateMatch = code.match(/`([^`]*(?:SELECT|INSERT|UPDATE|DELETE)[^`]*)\$\{(\w+)\}([^`]*)`/i);
    if (templateMatch) {
      const [fullMatch, before, variable, after] = templateMatch;
      const fixedCode = code.replace(
        fullMatch,
        `db.prepare("${before}?${after}").bind(${variable})`
      );
      return {
        originalCode: code,
        fixedCode,
        explanation: 'Converted template literal to parameterized query',
        confidence: 0.85,
        securityImprovements: [
          'Uses parameterized queries instead of template literals',
          'Prevents SQL injection attacks'
        ],
        testingNotes: 'Verify query still returns expected results'
      };
    }

    // Python f-string pattern
    // e.g., f"SELECT * FROM users WHERE id = {user_id}"
    const fstringMatch = code.match(/f["']([^"']*(?:SELECT|INSERT|UPDATE|DELETE)[^"']*)\{(\w+)\}([^"']*)["']/i);
    if (fstringMatch) {
      const [fullMatch, before, variable, after] = fstringMatch;
      const fixedCode = code.replace(
        fullMatch,
        `"${before}?${after}", (${variable},)`
      );
      return {
        originalCode: code,
        fixedCode: `cursor.execute("${before}?${after}", (${variable},))`,
        explanation: 'Converted f-string to parameterized query using tuple parameter',
        confidence: 0.85,
        securityImprovements: [
          'Uses parameterized queries with placeholder',
          'Prevents SQL injection in Python'
        ],
        testingNotes: 'Test with SQLite or your database driver'
      };
    }

    // Generic SQL injection fallback
    return {
      originalCode: code,
      fixedCode: `// SQL Injection Prevention: Use parameterized queries
// JavaScript/Node.js:
//   db.query('SELECT * FROM users WHERE id = ?', [userId]);
// Python:
//   cursor.execute('SELECT * FROM users WHERE id = %s', (user_id,));
// Java:
//   PreparedStatement stmt = conn.prepareStatement("SELECT * FROM users WHERE id = ?");
//   stmt.setString(1, userId);
// Original code:
${code}`,
      explanation: 'SQL queries with user input should use parameterized queries',
      confidence: 0.6,
      securityImprovements: [
        'Parameterized queries prevent SQL injection',
        'Database driver handles escaping safely'
      ],
      testingNotes: "Test with: ' OR '1'='1 and similar SQL injection payloads"
    };
  }

  /**
   * Fix XSS by using safe DOM methods
   */
  private fixXss(vulnerability: Vulnerability): RuleBasedFix {
    const code = vulnerability.code || '';

    // Pattern: innerHTML assignment
    const innerHtmlMatch = code.match(/(\w+)\.innerHTML\s*=\s*(\w+)/);
    if (innerHtmlMatch) {
      const [fullMatch, element, value] = innerHtmlMatch;
      const fixedCode = code.replace(fullMatch, `${element}.textContent = ${value}`);
      return {
        originalCode: code,
        fixedCode,
        explanation: 'Replaced innerHTML with textContent to prevent XSS',
        confidence: 0.9,
        securityImprovements: [
          'textContent does not parse HTML, preventing script injection',
          'Safe for displaying user-provided text'
        ],
        testingNotes: 'Verify display still works correctly. If HTML formatting is needed, use DOMPurify.'
      };
    }

    // Pattern: document.write
    const docWriteMatch = code.match(/document\.write\s*\(\s*(\w+)\s*\)/);
    if (docWriteMatch) {
      const [fullMatch, value] = docWriteMatch;
      const fixedCode = code.replace(
        fullMatch,
        `document.body.appendChild(document.createTextNode(${value}))`
      );
      return {
        originalCode: code,
        fixedCode,
        explanation: 'Replaced document.write with safe DOM manipulation',
        confidence: 0.85,
        securityImprovements: [
          'createTextNode does not execute scripts',
          'Prevents XSS attacks from user input'
        ],
        testingNotes: 'Verify content appears correctly in the DOM'
      };
    }

    // Pattern: dangerouslySetInnerHTML (React)
    if (code.includes('dangerouslySetInnerHTML')) {
      return {
        originalCode: code,
        fixedCode: `// XSS Prevention: Sanitize HTML before using dangerouslySetInnerHTML
import DOMPurify from 'dompurify';
// ${code.replace(/\n/g, '\n// ')}
// Use: dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userContent) }}`,
        explanation: 'dangerouslySetInnerHTML can lead to XSS - sanitize with DOMPurify',
        confidence: 0.75,
        securityImprovements: [
          'DOMPurify removes malicious scripts from HTML',
          'Prevents XSS while allowing safe HTML'
        ],
        testingNotes: 'Install DOMPurify: npm install dompurify @types/dompurify'
      };
    }

    // Pattern: innerHTML with any assignment (broader match)
    if (code.includes('.innerHTML')) {
      const fixedCode = code.replace(/\.innerHTML\s*=/, '.textContent =');
      return {
        originalCode: code,
        fixedCode,
        explanation: 'Replaced innerHTML with textContent to prevent XSS',
        confidence: 0.8,
        securityImprovements: [
          'textContent treats content as plain text',
          'Prevents script injection attacks'
        ],
        testingNotes: 'If HTML rendering is required, use DOMPurify to sanitize input first'
      };
    }

    // Generic XSS fallback
    return {
      originalCode: code,
      fixedCode: `// XSS Prevention: Sanitize user input before rendering
// Option 1: Use textContent instead of innerHTML
// Option 2: Use DOMPurify.sanitize() for HTML content
// Option 3: Use a templating library with auto-escaping
${code}`,
      explanation: 'User-controlled content in HTML output can lead to XSS attacks',
      confidence: 0.6,
      securityImprovements: [
        'Sanitize all user input before rendering',
        'Use safe DOM methods (textContent, createTextNode)'
      ],
      testingNotes: 'Test with payloads like: <script>alert(1)</script> and <img onerror=alert(1) src=x>'
    };
  }

  /**
   * Fix innerHTML usage
   */
  private fixInnerHtml(vulnerability: Vulnerability): RuleBasedFix {
    return this.fixXss(vulnerability);
  }

  /**
   * Fix command injection by using safe execution methods
   */
  private fixCommandInjection(vulnerability: Vulnerability): RuleBasedFix {
    const code = vulnerability.code || '';

    // Pattern: exec with string concatenation
    const execConcatMatch = code.match(/exec\s*\(\s*["'`]([^"'`]+)["'`]\s*\+\s*(\w+)/);
    if (execConcatMatch) {
      const [fullMatch, command, variable] = execConcatMatch;
      const fixedCode = code.replace(
        fullMatch,
        `execFile("${command.trim()}", [${variable}]`
      );
      return {
        originalCode: code,
        fixedCode,
        explanation: 'Replaced exec with execFile using argument array',
        confidence: 0.85,
        securityImprovements: [
          'execFile does not spawn a shell',
          'Arguments are passed as array, preventing injection'
        ],
        testingNotes: 'Verify command still executes correctly with expected arguments'
      };
    }

    // Pattern: exec with template literal
    const execTemplateMatch = code.match(/exec\s*\(\s*`([^`]+)\$\{(\w+)\}([^`]*)`/);
    if (execTemplateMatch) {
      const [fullMatch, before, variable, after] = execTemplateMatch;
      const command = before.trim().split(' ')[0];
      const fixedCode = `execFile("${command}", [${variable}]`;
      return {
        originalCode: code,
        fixedCode,
        explanation: 'Replaced exec template literal with execFile',
        confidence: 0.8,
        securityImprovements: [
          'Avoids shell interpretation',
          'Arguments passed safely as array'
        ],
        testingNotes: 'Test with various inputs including special characters'
      };
    }

    // Pattern: shell: true in spawn/exec options
    const shellTrueMatch = code.match(/shell\s*:\s*true/);
    if (shellTrueMatch) {
      const fixedCode = code.replace(shellTrueMatch[0], 'shell: false');
      return {
        originalCode: code,
        fixedCode,
        explanation: 'Disabled shell execution to prevent command injection',
        confidence: 0.9,
        securityImprovements: [
          'shell: false prevents shell interpretation',
          'Special characters are not processed as shell commands'
        ],
        testingNotes: 'Verify command works without shell features'
      };
    }

    // Python os.system pattern
    const osSystemMatch = code.match(/os\.system\s*\(\s*["']([^"']+)["']\s*\+\s*(\w+)/);
    if (osSystemMatch) {
      const [fullMatch, command, variable] = osSystemMatch;
      return {
        originalCode: code,
        fixedCode: `subprocess.run(["${command.trim()}", ${variable}], check=True)`,
        explanation: 'Replaced os.system with subprocess.run using argument list',
        confidence: 0.85,
        securityImprovements: [
          'subprocess.run with list arguments prevents shell injection',
          'check=True raises exception on non-zero exit'
        ],
        testingNotes: 'Test with special characters in input'
      };
    }

    // Generic command injection fallback
    return {
      originalCode: code,
      fixedCode: `// Command Injection Prevention:
// 1. Never use shell=true with user input
// 2. Pass arguments as an array, not concatenated strings
// 3. Use execFile instead of exec when possible
// JavaScript: execFile(command, [arg1, arg2], callback)
// Python: subprocess.run([command, arg1, arg2], check=True)
// Original code:
${code}`,
      explanation: 'Command execution with user input can lead to arbitrary command execution',
      confidence: 0.6,
      securityImprovements: [
        'Use argument arrays instead of shell strings',
        'Avoid shell interpretation of user input'
      ],
      testingNotes: 'Test with: ; ls -la, | cat /etc/passwd, $(whoami)'
    };
  }

  /**
   * Fix Python subprocess shell=True vulnerability
   */
  private fixSubprocessShell(vulnerability: Vulnerability): RuleBasedFix {
    const code = vulnerability.code || '';

    // Replace shell=True with shell=False
    let fixedCode = code.replace(/shell\s*=\s*True/gi, 'shell=False');

    // If it looks like a string command is being passed, suggest using a list
    if (code.match(/subprocess\.\w+\s*\(\s*["']/)) {
      return {
        originalCode: code,
        fixedCode: `# Command Injection Prevention: Use list of arguments instead of shell string
# Before: subprocess.run("command arg1 arg2", shell=True)
# After:  subprocess.run(["command", "arg1", "arg2"], shell=False)
# Fixed code with shell=False (requires converting string to list):
${fixedCode}`,
        explanation: 'Disabled shell execution and suggest using argument list to prevent command injection',
        confidence: 0.85,
        securityImprovements: [
          'shell=False prevents shell interpretation of special characters',
          'Using list of arguments prevents command injection'
        ],
        testingNotes: 'Convert command string to list format: ["cmd", "arg1", "arg2"]'
      };
    }

    return {
      originalCode: code,
      fixedCode,
      explanation: 'Changed shell=True to shell=False to prevent command injection',
      confidence: 0.9,
      securityImprovements: [
        'Disables shell interpretation',
        'Special characters not processed as shell commands'
      ],
      testingNotes: 'Verify command works without shell features. Pass arguments as list.'
    };
  }

  /**
   * Fix hardcoded secrets by using environment variables
   */
  private fixHardcodedSecret(vulnerability: Vulnerability): RuleBasedFix {
    const code = vulnerability.code || '';

    // Pattern: const/let/var SECRET = "value"
    const secretAssignMatch = code.match(/(const|let|var)\s+(\w*(?:key|secret|password|token|credential|api_key|apikey|auth)\w*)\s*=\s*["'`][^"'`]+["'`]/i);
    if (secretAssignMatch) {
      const [fullMatch, keyword, varName] = secretAssignMatch;
      const envVarName = varName.toUpperCase().replace(/([a-z])([A-Z])/g, '$1_$2');
      const fixedCode = code.replace(
        fullMatch,
        `${keyword} ${varName} = process.env.${envVarName}`
      );
      return {
        originalCode: code,
        fixedCode,
        explanation: `Moved hardcoded secret to environment variable ${envVarName}`,
        confidence: 0.9,
        securityImprovements: [
          'Secret is not committed to source control',
          'Can be rotated without code changes',
          'Different values per environment'
        ],
        testingNotes: `Set ${envVarName} in .env file or environment`
      };
    }

    // Pattern: AWS Access Key
    const awsKeyMatch = code.match(/(["'`])(AKIA[0-9A-Z]{16})\1/);
    if (awsKeyMatch) {
      const fixedCode = code.replace(awsKeyMatch[0], 'process.env.AWS_ACCESS_KEY_ID');
      return {
        originalCode: code,
        fixedCode,
        explanation: 'Replaced hardcoded AWS access key with environment variable',
        confidence: 0.95,
        securityImprovements: [
          'AWS credentials stored securely in environment',
          'Prevents exposure in source control'
        ],
        testingNotes: 'Set AWS_ACCESS_KEY_ID in environment or use AWS credentials file'
      };
    }

    // Python pattern: PASSWORD = "value"
    const pythonSecretMatch = code.match(/(\w*(?:key|secret|password|token|credential)\w*)\s*=\s*["'][^"']+["']/i);
    if (pythonSecretMatch) {
      const [fullMatch, varName] = pythonSecretMatch;
      const envVarName = varName.toUpperCase();
      return {
        originalCode: code,
        fixedCode: `${varName} = os.environ.get("${envVarName}")`,
        explanation: `Replaced hardcoded secret with environment variable`,
        confidence: 0.9,
        securityImprovements: [
          'Secret loaded from environment at runtime',
          'Not exposed in source code'
        ],
        testingNotes: `Add ${envVarName} to your .env file`
      };
    }

    // Generic hardcoded secret fallback
    return {
      originalCode: code,
      fixedCode: `// Hardcoded Secret Prevention:
// 1. Move secrets to environment variables
// 2. Use a secrets manager (AWS Secrets Manager, HashiCorp Vault)
// 3. Never commit secrets to version control
// JavaScript: const secret = process.env.SECRET_NAME;
// Python: secret = os.environ.get('SECRET_NAME')
// Add to .env file (not committed): SECRET_NAME=actual_secret_value
// Original code:
${code}`,
      explanation: 'Hardcoded secrets can be exposed in source control and logs',
      confidence: 0.6,
      securityImprovements: [
        'Secrets stored outside of code',
        'Can be rotated without code changes'
      ],
      testingNotes: 'Ensure environment variables are set in all deployment environments'
    };
  }

  /**
   * Fix path traversal by validating and normalizing paths
   */
  private fixPathTraversal(vulnerability: Vulnerability): RuleBasedFix {
    const code = vulnerability.code || '';

    // Pattern: Direct path concatenation
    const pathConcatMatch = code.match(/(["'`][^"'`]*["'`])\s*\+\s*(\w+)/);
    if (pathConcatMatch && (code.includes('readFile') || code.includes('open') || code.includes('fs.'))) {
      const [fullMatch, basePath, userVar] = pathConcatMatch;
      return {
        originalCode: code,
        fixedCode: code.replace(
          fullMatch,
          `path.join(${basePath}, path.basename(${userVar}))`
        ),
        explanation: 'Added path.basename to strip directory traversal attempts',
        confidence: 0.85,
        securityImprovements: [
          'path.basename removes ../ sequences',
          'Restricts access to intended directory only'
        ],
        testingNotes: 'Test with ../../../etc/passwd and similar inputs'
      };
    }

    // Pattern: fs operations with user input
    const fsMatch = code.match(/fs\.\w+\s*\(\s*(\w+)/);
    if (fsMatch) {
      const [fullMatch, pathVar] = fsMatch;
      return {
        originalCode: code,
        fixedCode: `const safePath = path.resolve(baseDir, path.basename(${pathVar}));\n` +
          `if (!safePath.startsWith(path.resolve(baseDir))) throw new Error('Invalid path');\n` +
          code.replace(pathVar, 'safePath'),
        explanation: 'Added path validation to prevent directory traversal',
        confidence: 0.8,
        securityImprovements: [
          'Validates path stays within allowed directory',
          'Throws error on traversal attempt'
        ],
        testingNotes: 'Test with various path traversal payloads'
      };
    }

    // Pattern: readFile/readFileSync with potential user input
    if (code.includes('readFile') || code.includes('readFileSync') || code.includes('open')) {
      return {
        originalCode: code,
        fixedCode: `// Path Traversal Prevention: Validate and sanitize file paths
const path = require('path');
const ALLOWED_DIR = '/safe/directory'; // Define your allowed directory

function sanitizePath(userPath) {
  const resolved = path.resolve(ALLOWED_DIR, path.basename(userPath));
  if (!resolved.startsWith(path.resolve(ALLOWED_DIR))) {
    throw new Error('Path traversal attempt detected');
  }
  return resolved;
}
// Use sanitizePath() before file operations:
${code}`,
        explanation: 'File operations with user input need path validation',
        confidence: 0.7,
        securityImprovements: [
          'path.basename strips directory components',
          'Validates resolved path stays within allowed directory'
        ],
        testingNotes: 'Test with: ../../../etc/passwd, ....//....//etc/passwd, %2e%2e%2f'
      };
    }

    // Generic path traversal fallback
    return {
      originalCode: code,
      fixedCode: `// Path Traversal Prevention
// 1. Use path.basename() to strip directory components from user input
// 2. Use path.resolve() and verify the result starts with your allowed directory
// 3. Never construct file paths by concatenating user input directly
const path = require('path');
const safePath = path.join(ALLOWED_DIR, path.basename(userInput));
if (!path.resolve(safePath).startsWith(path.resolve(ALLOWED_DIR))) {
  throw new Error('Invalid path');
}
// Original code:
${code}`,
      explanation: 'Path traversal allows attackers to access files outside intended directories',
      confidence: 0.6,
      securityImprovements: [
        'Sanitize all file paths from user input',
        'Restrict file access to specific directories'
      ],
      testingNotes: 'Test with path traversal payloads like ../, ....//,  encoded variants'
    };
  }

  /**
   * Fix insecure random by using crypto
   */
  private fixInsecureRandom(vulnerability: Vulnerability): RuleBasedFix {
    const code = vulnerability.code || '';

    // Pattern: Math.random() for security purposes
    const mathRandomMatch = code.match(/Math\.random\(\)/);
    if (mathRandomMatch) {
      const fixedCode = code.replace(
        'Math.random()',
        'crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296'
      );
      return {
        originalCode: code,
        fixedCode: `const crypto = require('crypto');\n` + code.replace(
          /Math\.random\(\)\.toString\(36\)/,
          'crypto.randomBytes(16).toString("hex")'
        ).replace(
          /Math\.random\(\)/,
          'crypto.randomInt(0, Number.MAX_SAFE_INTEGER) / Number.MAX_SAFE_INTEGER'
        ),
        explanation: 'Replaced Math.random with cryptographically secure random',
        confidence: 0.9,
        securityImprovements: [
          'Uses cryptographically secure random number generator',
          'Not predictable unlike Math.random'
        ],
        testingNotes: 'Verify random distribution is still uniform'
      };
    }

    // Python random module
    const pythonRandomMatch = code.match(/random\.(choice|randint|random)\s*\(/);
    if (pythonRandomMatch) {
      return {
        originalCode: code,
        fixedCode: `import secrets\n` + code.replace(/random\.choice/g, 'secrets.choice')
          .replace(/random\.randint/g, 'secrets.randbelow')
          .replace(/random\.random\(\)/g, 'secrets.randbelow(10**18) / 10**18'),
        explanation: 'Replaced random module with secrets for cryptographic security',
        confidence: 0.9,
        securityImprovements: [
          'secrets module is designed for security-sensitive operations',
          'Cryptographically secure random generation'
        ],
        testingNotes: 'Verify functionality with new random source'
      };
    }

    // Generic insecure random fallback
    return {
      originalCode: code,
      fixedCode: `// Insecure Random Prevention:
// JavaScript: Use crypto.randomBytes() or crypto.getRandomValues()
const crypto = require('crypto');
const secureRandom = crypto.randomInt(0, max); // for integers
const secureBytes = crypto.randomBytes(16); // for bytes
// Python: Use secrets module
// import secrets
// secure_token = secrets.token_hex(16)
// secure_int = secrets.randbelow(max)
// Original code:
${code}`,
      explanation: 'Math.random() and similar are predictable and not suitable for security',
      confidence: 0.7,
      securityImprovements: [
        'Use cryptographically secure random number generator',
        'Prevents prediction of generated values'
      ],
      testingNotes: 'Verify random generation works correctly in security contexts'
    };
  }

  /**
   * Fix eval usage
   */
  private fixEval(vulnerability: Vulnerability): RuleBasedFix {
    const code = vulnerability.code || '';

    // Pattern: eval for JSON parsing
    if (code.includes('eval') && (code.includes('JSON') || code.includes('json') || code.includes('{'))) {
      const evalMatch = code.match(/eval\s*\(\s*["'`]?\s*\(\s*["'`]?\s*\+?\s*(\w+)\s*\+?\s*["'`]?\s*\)\s*["'`]?\s*\)/);
      if (evalMatch) {
        const [fullMatch, variable] = evalMatch;
        return {
          originalCode: code,
          fixedCode: code.replace(fullMatch, `JSON.parse(${variable})`),
          explanation: 'Replaced eval with JSON.parse for safe JSON parsing',
          confidence: 0.9,
          securityImprovements: [
            'JSON.parse only parses data, does not execute code',
            'Prevents arbitrary code execution'
          ],
          testingNotes: 'Verify JSON parsing still works correctly'
        };
      }
    }

    // Generic eval replacement suggestion
    if (code.includes('eval(')) {
      return {
        originalCode: code,
        fixedCode: code.replace(/eval\s*\(\s*(\w+)\s*\)/, '/* TODO: Replace eval with safe alternative */\n// $1'),
        explanation: 'Flagged eval for manual replacement - eval should never be used with user input',
        confidence: 0.5,
        securityImprovements: [
          'Marked for manual review',
          'eval() allows arbitrary code execution'
        ],
        testingNotes: 'Replace with JSON.parse, Function constructor with validation, or specific parsers'
      };
    }

    // Generic eval/deserialization fallback
    return {
      originalCode: code,
      fixedCode: `// Eval/Deserialization Prevention:
// NEVER use eval() with untrusted input
// Alternatives:
// - For JSON: use JSON.parse()
// - For math expressions: use a math parser library
// - For templates: use a sandboxed template engine
// Original code:
${code}`,
      explanation: 'eval() and similar functions can execute arbitrary code',
      confidence: 0.6,
      securityImprovements: [
        'Avoid eval() with any user-controlled input',
        'Use specific parsers for the data format you need'
      ],
      testingNotes: 'Test with malicious payloads that attempt code execution'
    };
  }

  /**
   * Fix weak hash algorithms (MD5, SHA1) by replacing with SHA-256 or stronger
   */
  private fixWeakHash(vulnerability: Vulnerability): RuleBasedFix {
    const code = vulnerability.code || '';

    // JavaScript/Node.js pattern: crypto.createHash('md5') or crypto.createHash('sha1')
    const jsHashMatch = code.match(/createHash\s*\(\s*["']?(md5|sha1)["']?\s*\)/i);
    if (jsHashMatch) {
      const fixedCode = code.replace(/createHash\s*\(\s*["']?(md5|sha1)["']?\s*\)/gi, "createHash('sha256')");
      return {
        originalCode: code,
        fixedCode,
        explanation: 'Replaced weak hash algorithm (MD5/SHA1) with SHA-256',
        confidence: 0.85,
        securityImprovements: [
          'SHA-256 is cryptographically secure',
          'MD5 and SHA1 are vulnerable to collision attacks'
        ],
        testingNotes: 'Verify hash output format is compatible with existing data. Note: SHA-256 produces longer output than MD5.'
      };
    }

    // Python pattern: hashlib.md5() or hashlib.sha1()
    const pyHashMatch = code.match(/hashlib\.(md5|sha1)\s*\(/i);
    if (pyHashMatch) {
      const fixedCode = code.replace(/hashlib\.(md5|sha1)\s*\(/gi, 'hashlib.sha256(');
      return {
        originalCode: code,
        fixedCode,
        explanation: 'Replaced weak hash algorithm with SHA-256',
        confidence: 0.85,
        securityImprovements: ['Use cryptographically secure hash algorithm'],
        testingNotes: 'Verify hash output format is compatible with existing data'
      };
    }

    // Generic fallback
    return {
      originalCode: code,
      fixedCode: code.replace(/md5/gi, 'sha256').replace(/sha1/gi, 'sha256'),
      explanation: 'Replace weak hash algorithm with SHA-256 or stronger',
      confidence: 0.7,
      securityImprovements: ['Use cryptographically secure hash algorithm'],
      testingNotes: 'Verify hash output format is compatible with existing data'
    };
  }

  /**
   * Fix insecure deserialization vulnerabilities
   */
  private fixInsecureDeserialization(vulnerability: Vulnerability): RuleBasedFix {
    const code = vulnerability.code || '';

    // Python pickle pattern
    if (code.includes('pickle.loads') || code.includes('pickle.load')) {
      return {
        originalCode: code,
        fixedCode: '# WARNING: pickle is unsafe with untrusted data. Use JSON instead.\n' +
                   '# ' + code.replace(/\n/g, '\n# ') + '\n' +
                   '# Suggested: data = json.loads(validated_input)',
        explanation: 'Pickle deserialization can execute arbitrary code. Use JSON or validated input.',
        confidence: 0.75,
        securityImprovements: [
          'Avoid pickle with untrusted data',
          'Use JSON or other safe serialization formats'
        ],
        testingNotes: 'Implement proper input validation and type checking before deserialization'
      };
    }

    // PHP unserialize pattern
    if (code.includes('unserialize')) {
      return {
        originalCode: code,
        fixedCode: code.replace(/unserialize\s*\(\s*(\$\w+)\s*\)/g, 'json_decode($1, true)'),
        explanation: 'Replaced unserialize with json_decode to prevent object injection',
        confidence: 0.75,
        securityImprovements: ['json_decode is safer than unserialize with user input'],
        testingNotes: 'Ensure data format is compatible with JSON'
      };
    }

    // Generic fallback
    return {
      originalCode: code,
      fixedCode: '// TODO: Use safe parsing with schema validation\n// Avoid deserializing untrusted data directly\n' + code,
      explanation: 'Unsafe deserialization can lead to code execution',
      confidence: 0.6,
      securityImprovements: ['Validate input before deserialization'],
      testingNotes: 'Implement proper input validation and type checking'
    };
  }

  /**
   * Fix YAML unsafe load vulnerabilities
   */
  private fixYamlUnsafeLoad(vulnerability: Vulnerability): RuleBasedFix {
    const code = vulnerability.code || '';

    // Pattern: yaml.load(x) → yaml.safe_load(x)
    if (code.includes('yaml.load') || code.includes('yaml.unsafe_load')) {
      const fixedCode = code
        .replace(/yaml\.unsafe_load\s*\(/g, 'yaml.safe_load(')
        .replace(/yaml\.load\s*\(\s*([^,)]+)\s*\)/g, 'yaml.safe_load($1)');

      return {
        originalCode: code,
        fixedCode,
        explanation: 'Replaced unsafe YAML load with safe_load to prevent code execution',
        confidence: 0.95,
        securityImprovements: [
          'safe_load only parses safe YAML subsets',
          'Prevents arbitrary code execution from YAML files'
        ],
        testingNotes: 'Verify YAML parsing still works correctly. safe_load does not support custom Python objects.'
      };
    }

    // Generic fallback
    return {
      originalCode: code,
      fixedCode: `# YAML Injection Prevention:
# Always use yaml.safe_load() instead of yaml.load()
# yaml.safe_load() only parses standard YAML types
# Example:
#   import yaml
#   data = yaml.safe_load(file_content)
# Original code:
${code}`,
      explanation: 'yaml.load can execute arbitrary Python code from YAML files',
      confidence: 0.7,
      securityImprovements: [
        'Use yaml.safe_load() for untrusted input',
        'Prevents arbitrary code execution'
      ],
      testingNotes: 'Ensure YAML content does not require custom Python objects'
    };
  }

  /**
   * Fix SSRF (Server-Side Request Forgery) vulnerabilities
   */
  private fixSSRF(vulnerability: Vulnerability): RuleBasedFix {
    const code = vulnerability.code || '';

    // Pattern: fetch/axios/request with user-controlled URL
    if (code.includes('fetch') || code.includes('axios') || code.includes('request')) {
      return {
        originalCode: code,
        fixedCode: `// SSRF Protection: Validate URL before making request
const ALLOWED_HOSTS = ['api.example.com', 'trusted-service.com'];
const urlObj = new URL(userProvidedUrl);
if (!ALLOWED_HOSTS.includes(urlObj.hostname)) {
  throw new Error('URL not in allowlist');
}
// Also check for internal IP ranges
const ip = await dns.resolve(urlObj.hostname);
if (isInternalIP(ip)) {
  throw new Error('Internal addresses not allowed');
}
` + code,
        explanation: 'SSRF allows attackers to make requests from server to internal resources',
        confidence: 0.65,
        securityImprovements: [
          'Validate and allowlist destination URLs',
          'Block requests to internal IP ranges'
        ],
        testingNotes: 'Test with internal IP ranges (10.x, 172.16.x, 192.168.x) and localhost'
      };
    }

    // Generic fallback
    return {
      originalCode: code,
      fixedCode: '// TODO: Add URL allowlist validation before making requests\n' + code,
      explanation: 'SSRF allows attackers to make requests from server',
      confidence: 0.6,
      securityImprovements: ['Validate and allowlist destination URLs'],
      testingNotes: 'Test with internal IP ranges and localhost'
    };
  }

  /**
   * Fix IDOR (Insecure Direct Object Reference) vulnerabilities
   */
  private fixIDOR(vulnerability: Vulnerability): RuleBasedFix {
    const code = vulnerability.code || '';

    // Pattern: Direct use of user ID from request
    const idMatch = code.match(/(req\.params\.|req\.query\.|req\.body\.)(\w*id\w*)/i);
    if (idMatch) {
      const [fullMatch, source, idField] = idMatch;
      return {
        originalCode: code,
        fixedCode: `// IDOR Protection: Verify user has permission to access this resource
const requestedId = ${fullMatch};
const currentUserId = req.user.id; // From authenticated session
// Verify ownership or admin role before accessing resource
const resource = await getResource(requestedId);
if (resource.ownerId !== currentUserId && !req.user.isAdmin) {
  return res.status(403).json({ error: 'Access denied' });
}
` + code,
        explanation: 'IDOR allows unauthorized access to resources by manipulating object references',
        confidence: 0.65,
        securityImprovements: [
          'Add authorization checks for resource access',
          'Verify user ownership before returning data'
        ],
        testingNotes: 'Test with different user contexts to verify access control'
      };
    }

    // Generic fallback
    return {
      originalCode: code,
      fixedCode: '// TODO: Add authorization check before accessing resource\n// Verify current user has permission to access the requested object\n' + code,
      explanation: 'IDOR allows unauthorized access to resources',
      confidence: 0.6,
      securityImprovements: ['Add authorization checks for resource access'],
      testingNotes: 'Test with different user contexts'
    };
  }

  /**
   * Fix debug mode enabled in production
   */
  private fixDebugMode(vulnerability: Vulnerability): RuleBasedFix {
    const code = vulnerability.code || '';

    // Common patterns for debug mode
    let fixedCode = code;

    // JavaScript/TypeScript patterns
    fixedCode = fixedCode.replace(/debug\s*[:=]\s*true/gi, 'debug: false');
    fixedCode = fixedCode.replace(/DEBUG\s*[:=]\s*true/g, 'DEBUG: false');
    fixedCode = fixedCode.replace(/['"]debug['"]\s*:\s*true/gi, '"debug": false');

    // Python patterns
    fixedCode = fixedCode.replace(/DEBUG\s*=\s*True/g, 'DEBUG = False');
    fixedCode = fixedCode.replace(/debug\s*=\s*True/g, 'debug = False');

    // Environment-aware fix suggestion
    if (fixedCode === code) {
      fixedCode = code.replace(/(debug|DEBUG)/, '// Use environment variable: process.env.NODE_ENV !== "production"\n$1');
    }

    return {
      originalCode: code,
      fixedCode,
      explanation: 'Debug mode should be disabled in production to prevent information disclosure',
      confidence: 0.85,
      securityImprovements: [
        'Disable debug mode for production builds',
        'Prevents exposure of sensitive error details'
      ],
      testingNotes: 'Verify application works correctly without debug mode enabled'
    };
  }

  /**
   * Fix weak password policy vulnerabilities
   */
  private fixWeakPassword(vulnerability: Vulnerability): RuleBasedFix {
    const code = vulnerability.code || '';

    // Pattern: Simple password length check
    const lengthCheckMatch = code.match(/password\.length\s*[<>=]+\s*(\d+)/);
    if (lengthCheckMatch) {
      const minLength = parseInt(lengthCheckMatch[1], 10);
      if (minLength < 8) {
        return {
          originalCode: code,
          fixedCode: `// Strong password validation
function validatePassword(password) {
  const minLength = 12;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\\-=\\[\\]{};':"|,.<>?]/.test(password);

  if (password.length < minLength) {
    return { valid: false, error: 'Password must be at least ' + minLength + ' characters' };
  }
  if (!hasUppercase || !hasLowercase) {
    return { valid: false, error: 'Password must contain upper and lowercase letters' };
  }
  if (!hasNumber) {
    return { valid: false, error: 'Password must contain at least one number' };
  }
  if (!hasSpecial) {
    return { valid: false, error: 'Password must contain at least one special character' };
  }
  return { valid: true };
}`,
          explanation: 'Implemented strong password policy with complexity requirements',
          confidence: 0.8,
          securityImprovements: [
            'Require minimum 12 characters',
            'Require mixed case, numbers, and special characters'
          ],
          testingNotes: 'Test password validation rules with various inputs'
        };
      }
    }

    // Generic fallback
    return {
      originalCode: code,
      fixedCode: '// TODO: Implement strong password requirements\n// Minimum 12 characters, mixed case, numbers, special characters\n' + code,
      explanation: 'Password validation should enforce complexity requirements',
      confidence: 0.6,
      securityImprovements: ['Require minimum length, complexity'],
      testingNotes: 'Test password validation rules'
    };
  }
}

/**
 * Singleton instance
 */
let ruleBasedFixerInstance: RuleBasedFixer | null = null;

export function getRuleBasedFixer(): RuleBasedFixer {
  if (!ruleBasedFixerInstance) {
    ruleBasedFixerInstance = new RuleBasedFixer();
  }
  return ruleBasedFixerInstance;
}
