/**
 * Secret Detection Service
 * 
 * Enhanced secret detection with:
 * - Regex pattern matching
 * - Entropy analysis
 * - Context-aware detection
 * - False positive reduction
 * 
 * NO dependencies on Mastra or AI frameworks.
 */

export interface SecretPattern {
  id: string;
  name: string;
  pattern: RegExp;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  examples: string[];
  entropyThreshold?: number; // Minimum entropy for detection
}

export interface DetectedSecret {
  patternId: string;
  patternName: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  value: string;
  maskedValue: string;
  line: number;
  column: number;
  context: string;
  entropy?: number;
  confidence: number; // 0-1
}

export interface DetectionResult {
  secrets: DetectedSecret[];
  total: number;
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export class SecretDetectionService {
  private patterns: Map<string, SecretPattern> = new Map();

  constructor() {
    this.initializePatterns();
  }

  /**
   * Register a secret pattern
   */
  registerPattern(pattern: SecretPattern): void {
    this.patterns.set(pattern.id, pattern);
  }

  /**
   * Detect secrets in code
   */
  detectSecrets(code: string, filePath?: string): DetectionResult {
    const secrets: DetectedSecret[] = [];
    const lines = code.split('\n');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineNumber = lineIndex + 1;

      for (const [patternId, pattern] of this.patterns.entries()) {
        const matches = this.findMatches(line, pattern, lineNumber);
        secrets.push(...matches);
      }
    }

    // Filter false positives using entropy analysis
    const filteredSecrets = this.filterFalsePositives(secrets);

    return {
      secrets: filteredSecrets,
      total: filteredSecrets.length,
      bySeverity: this.countBySeverity(filteredSecrets),
    };
  }

  /**
   * Find matches for a pattern in a line
   * Uses regex with 'g' flag so exec() advances per match (avoids infinite loop / OOM)
   */
  private findMatches(line: string, pattern: SecretPattern, lineNumber: number): DetectedSecret[] {
    const matches: DetectedSecret[] = [];
    const regex = pattern.pattern.flags.includes('g')
      ? pattern.pattern
      : new RegExp(pattern.pattern.source, pattern.pattern.flags + 'g');
    let match;

    while ((match = regex.exec(line)) !== null) {
      const value = match[0];
      const entropy = this.calculateEntropy(value);

      // Check entropy threshold if specified
      if (pattern.entropyThreshold && entropy < pattern.entropyThreshold) {
        continue; // Skip low entropy matches
      }

      matches.push({
        patternId: pattern.id,
        patternName: pattern.name,
        severity: pattern.severity,
        value,
        maskedValue: this.maskSecret(value),
        line: lineNumber,
        column: match.index,
        context: line.trim(),
        entropy,
        confidence: this.calculateConfidence(value, pattern, entropy),
      });
    }

    return matches;
  }

  /**
   * Calculate Shannon entropy of a string
   */
  private calculateEntropy(str: string): number {
    const frequencies: Map<string, number> = new Map();
    
    for (const char of str) {
      frequencies.
      set(char, (frequencies.get(char) || 0) + 1);
    }

    let entropy = 0;
    const length = str.length;

    for (const count of frequencies.values()) {
      const probability = count / length;
      entropy -= probability * Math.log2(probability);
    }

    return entropy;
  }

  /**
   * Calculate confidence score for a detected secret
   */
  private calculateConfidence(
    value: string,
    pattern: SecretPattern,
    entropy: number
  ): number {
    let confidence = 0.5; // Base confidence

    // Higher entropy = higher confidence
    if (entropy > 4.0) {
      confidence += 0.2;
    } else if (entropy > 3.0) {
      confidence += 0.1;
    }

    // Pattern-specific confidence adjustments
    if (pattern.id.includes('aws') && value.startsWith('AKIA')) {
      confidence += 0.2; // AWS keys have specific format
    }

    if (value.length > 32) {
      confidence += 0.1; // Longer values are more likely to be secrets
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Filter false positives
   */
  private filterFalsePositives(secrets: DetectedSecret[]): DetectedSecret[] {
    return secrets.filter(secret => {
      // Filter out common false positives
      const value = secret.value.toLowerCase();

      // Skip example/test values
      if (value.includes('example') || value.includes('test') || value.includes('demo')) {
        return secret.confidence > 0.8; // Only keep high confidence
      }

      // Skip placeholder values
      if (value.includes('placeholder') || value.includes('your-') || value.includes('xxx')) {
        return false;
      }

      // Require minimum confidence
      return secret.confidence > 0.5;
    });
  }

  /**
   * Mask secret value for display
   */
  private maskSecret(secret: string): string {
    if (secret.length <= 8) {
      return '***';
    }

    // Show first 4 and last 4 characters
    const start = secret.substring(0, 4);
    const end = secret.substring(secret.length - 4);
    const masked = '*'.repeat(Math.min(secret.length - 8, 20));

    return `${start}${masked}${end}`;
  }

  /**
   * Count secrets by severity
   */
  private countBySeverity(secrets: DetectedSecret[]): {
    critical: number;
    high: number;
    medium: number;
    low: number;
  } {
    return {
      critical: secrets.filter(s => s.severity === 'critical').length,
      high: secrets.filter(s => s.severity === 'high').length,
      medium: secrets.filter(s => s.severity === 'medium').length,
      low: secrets.filter(s => s.severity === 'low').length,
    };
  }

  /**
   * Initialize default secret patterns
   */
  private initializePatterns(): void {
    // AWS Keys
    this.registerPattern({
      id: 'aws-access-key',
      name: 'AWS Access Key',
      pattern: /AKIA[0-9A-Z]{16}/i,
      severity: 'critical',
      description: 'AWS Access Key ID found',
      examples: ['AKIAIOSFODNN7EXAMPLE'],
      entropyThreshold: 3.5,
    });

    this.registerPattern({
      id: 'aws-secret-key',
      name: 'AWS Secret Key',
      pattern: /aws.{0,20}['"]([A-Za-z0-9/+=]{40})['"]/i,
      severity: 'critical',
      description: 'AWS Secret Access Key found',
      examples: ['wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'],
      entropyThreshold: 4.0,
    });

    // API Keys
    this.registerPattern({
      id: 'generic-api-key',
      name: 'Generic API Key',
      pattern: /(api[_-]?key|apikey|api_key)\s*[:=]\s*['"]([A-Za-z0-9_\-]{20,})['"]/i,
      severity: 'high',
      description: 'API key found in code',
      examples: ['api_key: "sk_live_1234567890abcdef"'],
      entropyThreshold: 3.5,
    });

    // GitHub Tokens
    this.registerPattern({
      id: 'github-token',
      name: 'GitHub Token',
      pattern: /ghp_[A-Za-z0-9]{36}/i,
      severity: 'critical',
      description: 'GitHub personal access token found',
      examples: ['ghp_1234567890abcdefghijklmnopqrstuvwxyz'],
      entropyThreshold: 3.8,
    });

    // Passwords
    this.registerPattern({
      id: 'hardcoded-password',
      name: 'Hardcoded Password',
      pattern: /(password|passwd|pwd)\s*[:=]\s*['"]([^'"]{8,})['"]/i,
      severity: 'critical',
      description: 'Hardcoded password found',
      examples: ['password: "mypassword123"'],
      entropyThreshold: 2.5,
    });

    // Private Keys
    this.registerPattern({
      id: 'private-key',
      name: 'Private Key',
      pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/i,
      severity: 'critical',
      description: 'Private key found in code',
      examples: ['-----BEGIN RSA PRIVATE KEY-----'],
    });

    // JWT Tokens
    this.registerPattern({
      id: 'jwt-token',
      name: 'JWT Token',
      pattern: /eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*/i,
      severity: 'high',
      description: 'JWT token found',
      examples: ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'],
      entropyThreshold: 4.0,
    });
  }

  /**
   * Get all patterns
   */
  getAllPatterns(): SecretPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Get pattern by ID
   */
  getPattern(patternId: string): SecretPattern | undefined {
    return this.patterns.get(patternId);
  }
}

// Singleton instance
let secretDetectionServiceInstance: SecretDetectionService | null = null;

export function getSecretDetectionService(): SecretDetectionService {
  if (!secretDetectionServiceInstance) {
    secretDetectionServiceInstance = new SecretDetectionService();
  }
  return secretDetectionServiceInstance;
}
