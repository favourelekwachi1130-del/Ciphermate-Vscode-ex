import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { OAuthCallbackServer } from './oauth/callback-server';
import { RedTeamOperationsCenter } from './redteam/operations-center';
import { PenetrationTestingEngine } from './redteam/penetration-testing';
import { SocialEngineeringToolkit } from './redteam/social-engineering';
import { AILearningEngine } from './redteam/ai-learning-engine';
import { AIAgentCore } from './ai-agent/core';
import { ChatInterface } from './ai-agent/chat-interface';

// Enterprise Architecture - Core Infrastructure
interface Logger {
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, error?: Error, meta?: any): void;
  debug(message: string, meta?: any): void;
}

interface Configuration {
  get<T>(key: string, defaultValue?: T): T;
  set<T>(key: string, value: T): void;
  validate(): boolean;
}

export interface ServiceContainer {
  register<T>(name: string, service: T): void;
  get<T>(name: string): T;
  has(name: string): boolean;
}

// Enterprise Logging System
export class EnterpriseLogger implements Logger {
  private outputChannel: vscode.OutputChannel;
  private logLevel: 'debug' | 'info' | 'warn' | 'error';

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('CipherMate');
    this.logLevel = 'info';
  }

  info(message: string, meta?: any): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: any): void {
    this.log('warn', message, meta);
  }

  error(message: string, error?: Error, meta?: any): void {
    this.log('error', message, { error: error?.stack, ...meta });
  }

  debug(message: string, meta?: any): void {
    this.log('debug', message, meta);
  }

  private log(level: string, message: string, meta?: any): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...meta
    };

    this.outputChannel.appendLine(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
    
    if (meta) {
      this.outputChannel.appendLine(`  Meta: ${JSON.stringify(meta, null, 2)}`);
    }
  }

  showOutput(): void {
    this.outputChannel.show();
  }
}

// Enterprise Configuration Management
export class EnterpriseConfiguration implements Configuration {
  private config: Map<string, any> = new Map();
  private validationRules: Map<string, (value: any) => boolean> = new Map();

  constructor() {
    this.setupDefaultConfiguration();
    this.setupValidationRules();
  }

  get<T>(key: string, defaultValue?: T): T {
    return this.config.get(key) ?? defaultValue;
  }

  set<T>(key: string, value: T): void {
    if (this.validationRules.has(key)) {
      const validator = this.validationRules.get(key)!;
      if (!validator(value)) {
        throw new Error(`Invalid configuration value for key: ${key}`);
      }
    }
    this.config.set(key, value);
  }

  validate(): boolean {
    for (const [key, validator] of this.validationRules) {
      const value = this.config.get(key);
      if (value !== undefined && !validator(value)) {
        return false;
      }
    }
    return true;
  }

  private setupDefaultConfiguration(): void {
    this.config.set('logging.level', 'info');
    this.config.set('scanning.timeout', 300000); // 5 minutes
    this.config.set('scanning.maxConcurrency', 3);
    this.config.set('security.encryption.keySize', 256);
    this.config.set('performance.cache.enabled', true);
    this.config.set('performance.cache.ttl', 3600000); // 1 hour
    this.config.set('telemetry.enabled', false);
    this.config.set('errorHandling.maxRetries', 3);
    this.config.set('errorHandling.retryDelay', 1000);
  }

  private setupValidationRules(): void {
    this.validationRules.set('logging.level', (value) => 
      ['debug', 'info', 'warn', 'error'].includes(value));
    this.validationRules.set('scanning.timeout', (value) => 
      typeof value === 'number' && value > 0);
    this.validationRules.set('scanning.maxConcurrency', (value) => 
      typeof value === 'number' && value > 0 && value <= 10);
    this.validationRules.set('security.encryption.keySize', (value) => 
      typeof value === 'number' && [128, 192, 256].includes(value));
  }
}

// Dependency Injection Container
export class ServiceContainer implements ServiceContainer {
  private services: Map<string, any> = new Map();
  private singletons: Map<string, any> = new Map();

  register<T>(name: string, service: T): void {
    this.services.set(name, service);
  }

  registerSingleton<T>(name: string, factory: () => T): void {
    this.singletons.set(name, factory);
  }

  get<T>(name: string): T {
    if (this.singletons.has(name)) {
      const factory = this.singletons.get(name);
      if (!this.services.has(name)) {
        this.services.set(name, factory());
      }
    }
    
    if (!this.services.has(name)) {
      throw new Error(`Service not found: ${name}`);
    }
    
    return this.services.get(name);
  }

  has(name: string): boolean {
    return this.services.has(name) || this.singletons.has(name);
  }
}

// Error Handling System
export class ErrorHandler {
  private logger: Logger;
  private config: Configuration;

  constructor(logger: Logger, config: Configuration) {
    this.logger = logger;
    this.config = config;
  }

  async handleError(error: Error, context: string, retryable: boolean = false): Promise<void> {
    this.logger.error(`Error in ${context}`, error, { retryable });

    if (retryable) {
      await this.retryOperation(error, context);
    } else {
      this.showUserFriendlyError(error, context);
    }
  }

  private async retryOperation(error: Error, context: string): Promise<void> {
    const maxRetries = this.config.get('errorHandling.maxRetries', 3);
    const retryDelay = this.config.get('errorHandling.retryDelay', 1000);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.logger.info(`Retrying operation in ${context}, attempt ${attempt}/${maxRetries}`);
      
      try {
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        // Retry logic would be implemented here
        return;
      } catch (retryError) {
        if (attempt === maxRetries) {
          this.logger.error(`Max retries exceeded for ${context}`, retryError as Error);
          this.showUserFriendlyError(retryError as Error, context);
        }
      }
    }
  }

  private showUserFriendlyError(error: Error, context: string): void {
    const userMessage = this.getUserFriendlyMessage(error, context);
    vscode.window.showErrorMessage(userMessage);
  }

  private getUserFriendlyMessage(error: Error, context: string): string {
    const errorMessages: { [key: string]: string } = {
      'ENOENT': 'File or directory not found. Please check your workspace path.',
      'EACCES': 'Permission denied. Please check file permissions.',
      'ECONNREFUSED': 'Connection refused. Please check your network connection.',
      'ETIMEDOUT': 'Operation timed out. Please try again.',
      'ENOTFOUND': 'Network error. Please check your internet connection.'
    };

    const errorCode = (error as any).code;
    return errorMessages[errorCode] || `An error occurred in ${context}: ${error.message}`;
  }
}

// Performance Monitoring
export class PerformanceMonitor {
  private logger: Logger;
  private metrics: Map<string, number[]> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  startTimer(operation: string): () => void {
    const startTime = Date.now();
    
    return () => {
      const duration = Date.now() - startTime;
      this.recordMetric(operation, duration);
      
      if (duration > 5000) { // Log slow operations
        this.logger.warn(`Slow operation detected: ${operation} took ${duration}ms`);
      }
    };
  }

  recordMetric(operation: string, value: number): void {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    
    const values = this.metrics.get(operation)!;
    values.push(value);
    
    // Keep only last 100 measurements
    if (values.length > 100) {
      values.shift();
    }
  }

  getAverageTime(operation: string): number {
    const values = this.metrics.get(operation);
    if (!values || values.length === 0) {return 0;}
    
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  getMetrics(): { [operation: string]: { average: number; count: number } } {
    const result: { [operation: string]: { average: number; count: number } } = {};
    
    for (const [operation, values] of this.metrics) {
      result[operation] = {
        average: this.getAverageTime(operation),
        count: values.length
      };
    }
    
    return result;
  }
}

// Service Layer Architecture
interface ScanningService {
  scanRepository(path: string): Promise<any[]>;
  cancelScan(): Promise<void>;
  isScanning(): boolean;
}

interface AuthenticationService {
  authenticate(provider: string): Promise<UserProfile | null>;
  logout(): Promise<void>;
  getCurrentUser(): UserProfile | null;
}

interface ConfigurationService {
  loadConfiguration(): Promise<void>;
  saveConfiguration(): Promise<void>;
  validateConfiguration(): boolean;
}

// Concrete Service Implementations
class EnterpriseScanningService implements ScanningService {
  private logger: Logger;
  private config: Configuration;
  private performanceMonitor: PerformanceMonitor;
  private currentScanProcess: any = null;
  private isScanningFlag = false;

  constructor(logger: Logger, config: Configuration, performanceMonitor: PerformanceMonitor) {
    this.logger = logger;
    this.config = config;
    this.performanceMonitor = performanceMonitor;
  }

  async scanRepository(path: string): Promise<any[]> {
    const stopTimer = this.performanceMonitor.startTimer('repository_scan');
    
    try {
      this.isScanningFlag = true;
      this.logger.info('Starting repository scan', { path });
      
      // Implement actual scanning logic here
      const results = await this.performScan(path);
      
      this.logger.info('Repository scan completed', { 
        path, 
        vulnerabilitiesFound: results.length 
      });
      
      return results;
    } catch (error) {
      this.logger.error('Repository scan failed', error as Error, { path });
      throw error;
    } finally {
      this.isScanningFlag = false;
      this.currentScanProcess = null;
      stopTimer();
    }
  }

  async cancelScan(): Promise<void> {
    if (this.currentScanProcess && this.isScanningFlag) {
      try {
        this.currentScanProcess.kill('SIGTERM');
        this.logger.info('Scan cancelled by user');
      } catch (error) {
        this.logger.error('Failed to cancel scan', error as Error);
        throw error;
      }
    }
  }

  isScanning(): boolean {
    return this.isScanningFlag;
  }

  private async performScan(path: string): Promise<any[]> {
    // This would contain the actual scanning implementation
    // For now, return empty array
    return [];
  }
}

class EnterpriseAuthenticationService implements AuthenticationService {
  private logger: Logger;
  private config: Configuration;
  private performanceMonitor: PerformanceMonitor;
  private currentUser: UserProfile | null = null;

  constructor(logger: Logger, config: Configuration, performanceMonitor: PerformanceMonitor) {
    this.logger = logger;
    this.config = config;
    this.performanceMonitor = performanceMonitor;
  }

  async authenticate(provider: string): Promise<UserProfile | null> {
    const stopTimer = this.performanceMonitor.startTimer('authentication');
    
    try {
      this.logger.info('Starting authentication', { provider });
      
      // Implement authentication logic here
      const user = await this.performAuthentication(provider);
      
      if (user) {
        this.currentUser = user;
        this.logger.info('Authentication successful', { 
          provider, 
          userId: user.id 
        });
      }
      
      return user;
    } catch (error) {
      this.logger.error('Authentication failed', error as Error, { provider });
      throw error;
    } finally {
      stopTimer();
    }
  }

  async logout(): Promise<void> {
    try {
      this.logger.info('User logout', { userId: this.currentUser?.id });
      this.currentUser = null;
    } catch (error) {
      this.logger.error('Logout failed', error as Error);
      throw error;
    }
  }

  getCurrentUser(): UserProfile | null {
    return this.currentUser;
  }

  private async performAuthentication(provider: string): Promise<UserProfile | null> {
    // This would contain the actual authentication implementation
    return null;
  }
}

// Global Service Container
const container = new ServiceContainer();

// RAG Engine and Vector Database Interfaces
interface CodeChunk {
  id: string;
  content: string;
  filePath: string;
  startLine: number;
  endLine: number;
  type: 'function' | 'class' | 'config' | 'import' | 'variable';
  embedding?: number[];
  metadata: {
    language: string;
    complexity: number;
    dependencies: string[];
    securityRelevant: boolean;
  };
}

interface VectorSearchResult {
  chunk: CodeChunk;
  similarity: number;
  relevanceScore: number;
}

// Multi-Agent System
interface SecurityAgent {
  analyzeVulnerabilities(code: string, context: CodeChunk[]): Promise<SecurityAnalysis>;
  prioritizeThreats(vulnerabilities: Vulnerability[]): Vulnerability[];
}

interface FixAgent {
  generatePatch(vulnerability: Vulnerability, context: CodeChunk[]): Promise<SecurityPatch>;
  validatePatch(patch: SecurityPatch): Promise<boolean>;
}

interface ReviewAgent {
  reviewPatch(patch: SecurityPatch, originalCode: string): Promise<ReviewResult>;
  checkSecurity(patch: SecurityPatch): Promise<SecurityCheck>;
}

interface SecurityAnalysis {
  vulnerabilities: Vulnerability[];
  riskScore: number;
  recommendations: string[];
  context: string;
}

interface Vulnerability {
  id: string;
  type: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  location: {
    file: string;
    line: number;
    column?: number;
  };
  code: string;
  exploitability: number;
  impact: number;
  cwe?: string;
  owasp?: string;
}

interface SecurityPatch {
  id: string;
  vulnerabilityId: string;
  originalCode: string;
  patchedCode: string;
  explanation: string;
  securityImprovements: string[];
  testingNotes: string;
  diff: string;
  confidence: number;
}

interface ReviewResult {
  approved: boolean;
  confidence: number;
  issues: string[];
  suggestions: string[];
  securityScore: number;
}

interface SecurityCheck {
  isSecure: boolean;
  remainingRisks: string[];
  securityScore: number;
  recommendations: string[];
}

// Inline suggestion interfaces
interface InlineSuggestion {
  text: string;
  range: vscode.Range;
  command?: string;
  tooltip?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  vulnerabilityType: string;
}

interface CodeAnalysisResult {
  vulnerabilities: InlineSuggestion[];
  suggestions: InlineSuggestion[];
  lastAnalyzed: number;
}

// Settings keys
const SETTINGS_KEY = 'ciphermate.settings';
const ENCRYPTED_DATA_KEY = 'ciphermate.encrypted_data';
const ENCRYPTION_KEY_FILE = 'ciphermate.key';

// RAG Engine Implementation
class RAGEngine {
  private codeIndex: Map<string, CodeChunk> = new Map();
  private embeddings: Map<string, number[]> = new Map();
  private isIndexed: boolean = false;

  async indexRepository(workspacePath: string): Promise<void> {
    console.log('RAG Engine: Starting repository indexing...');
    const files = await this.getCodeFiles(workspacePath);
    let chunkCount = 0;

    for (const file of files) {
      try {
        const chunks = await this.parseFileIntoChunks(file);
        for (const chunk of chunks) {
          this.codeIndex.set(chunk.id, chunk);
          chunkCount++;
        }
      } catch (e) {
        console.log(`Failed to index ${file}:`, e);
      }
    }

    console.log(`RAG Engine: Indexed ${chunkCount} code chunks from ${files.length} files`);
    this.isIndexed = true;
  }

  private async getCodeFiles(workspacePath: string): Promise<string[]> {
    const files: string[] = [];
    const self = this;
    
    function walkDir(dir: string) {
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory() && 
              !item.startsWith('.') && 
              item !== 'node_modules' && 
              item !== '.vscode-test' &&
              item !== 'dist' &&
              item !== 'out') {
            walkDir(fullPath);
          } else if (self.isCodeFile(item) && stat.size < 500000) { // 500KB limit
            files.push(fullPath);
          }
        }
      } catch (e) {
        // Skip directories we can't read
      }
    }
    
    walkDir(workspacePath);
    return files;
  }

  private isCodeFile(filename: string): boolean {
    const codeExtensions = ['.js', '.ts', '.py', '.php', '.java', '.c', '.cpp', '.cs', '.go', '.rs', '.rb', '.sh', '.json', '.yaml', '.yml', '.xml'];
    return codeExtensions.some(ext => filename.endsWith(ext));
  }

  private async parseFileIntoChunks(filePath: string): Promise<CodeChunk[]> {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const chunks: CodeChunk[] = [];
    const language = this.getLanguage(filePath);

    // Parse different types of code structures
    const functions = this.extractFunctions(content, language);
    const classes = this.extractClasses(content, language);
    const imports = this.extractImports(content, language);
    const configs = this.extractConfigs(content, language);

    // Create chunks for each structure
    [...functions, ...classes, ...imports, ...configs].forEach((item, index) => {
      const chunk: CodeChunk = {
        id: `${path.basename(filePath)}_${item.type}_${index}`,
        content: item.content,
        filePath: filePath,
        startLine: item.startLine,
        endLine: item.endLine,
        type: item.type as any,
        metadata: {
          language: language,
          complexity: this.calculateComplexity(item.content),
          dependencies: this.extractDependencies(item.content, language),
          securityRelevant: this.isSecurityRelevant(item.content, item.type)
        }
      };
      chunks.push(chunk);
    });

    return chunks;
  }

  private getLanguage(filePath: string): string {
    const ext = path.extname(filePath);
    const langMap: { [key: string]: string } = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.py': 'python',
      '.php': 'php',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.cs': 'csharp',
      '.go': 'go',
      '.rs': 'rust',
      '.rb': 'ruby',
      '.sh': 'bash',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.xml': 'xml'
    };
    return langMap[ext] || 'unknown';
  }

  private extractFunctions(content: string, language: string): Array<{content: string, startLine: number, endLine: number, type: string}> {
    const functions: Array<{content: string, startLine: number, endLine: number, type: string}> = [];
    const lines = content.split('\n');

    // Simple function extraction (can be enhanced with proper AST parsing)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (this.isFunctionStart(line, language)) {
        const functionContent = this.extractFunctionBody(lines, i, language);
        if (functionContent) {
          functions.push({
            content: functionContent.content,
            startLine: i + 1,
            endLine: i + functionContent.lines + 1,
            type: 'function'
          });
        }
      }
    }

    return functions;
  }

  private extractClasses(content: string, language: string): Array<{content: string, startLine: number, endLine: number, type: string}> {
    const classes: Array<{content: string, startLine: number, endLine: number, type: string}> = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (this.isClassStart(line, language)) {
        const classContent = this.extractClassBody(lines, i, language);
        if (classContent) {
          classes.push({
            content: classContent.content,
            startLine: i + 1,
            endLine: i + classContent.lines + 1,
            type: 'class'
          });
        }
      }
    }

    return classes;
  }

  private extractImports(content: string, language: string): Array<{content: string, startLine: number, endLine: number, type: string}> {
    const imports: Array<{content: string, startLine: number, endLine: number, type: string}> = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (this.isImportLine(line, language)) {
        imports.push({
          content: line,
          startLine: i + 1,
          endLine: i + 1,
          type: 'import'
        });
      }
    }

    return imports;
  }

  private extractConfigs(content: string, language: string): Array<{content: string, startLine: number, endLine: number, type: string}> {
    const configs: Array<{content: string, startLine: number, endLine: number, type: string}> = [];
    
    // For config files, treat the entire content as one chunk
    if (language === 'json' || language === 'yaml' || language === 'xml') {
      configs.push({
        content: content,
        startLine: 1,
        endLine: content.split('\n').length,
        type: 'config'
      });
    }

    return configs;
  }

  private isFunctionStart(line: string, language: string): boolean {
    const trimmed = line.trim();
    switch (language) {
      case 'javascript':
      case 'typescript':
        return /^(export\s+)?(async\s+)?function\s+\w+|^(export\s+)?const\s+\w+\s*=\s*(async\s+)?\(|^(export\s+)?\w+\s*:\s*(async\s+)?\(/.test(trimmed);
      case 'python':
        return /^def\s+\w+/.test(trimmed);
      case 'java':
      case 'csharp':
        return /^(public|private|protected)?\s*(static\s+)?\w+\s+\w+\s*\(/.test(trimmed);
      default:
        return false;
    }
  }

  private isClassStart(line: string, language: string): boolean {
    const trimmed = line.trim();
    switch (language) {
      case 'javascript':
      case 'typescript':
        return /^(export\s+)?class\s+\w+/.test(trimmed);
      case 'python':
        return /^class\s+\w+/.test(trimmed);
      case 'java':
      case 'csharp':
        return /^(public|private|protected)?\s*class\s+\w+/.test(trimmed);
      default:
        return false;
    }
  }

  private isImportLine(line: string, language: string): boolean {
    const trimmed = line.trim();
    switch (language) {
      case 'javascript':
      case 'typescript':
        return /^(import|require|from)\s+/.test(trimmed);
      case 'python':
        return /^(import|from)\s+/.test(trimmed);
      case 'java':
      case 'csharp':
        return /^(using|import)\s+/.test(trimmed);
      default:
        return false;
    }
  }

  private extractFunctionBody(lines: string[], startIndex: number, language: string): {content: string, lines: number} | null {
    // Simple implementation - can be enhanced with proper parsing
    let braceCount = 0;
    let inFunction = false;
    const functionLines: string[] = [];

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      functionLines.push(line);

      // Count braces to find function end
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          inFunction = true;
        } else if (char === '}') {
          braceCount--;
        }
      }

      if (inFunction && braceCount === 0) {
        return {
          content: functionLines.join('\n'),
          lines: functionLines.length
        };
      }
    }

    return null;
  }

  private extractClassBody(lines: string[], startIndex: number, language: string): {content: string, lines: number} | null {
    // Similar to function extraction but for classes
    return this.extractFunctionBody(lines, startIndex, language);
  }

  private calculateComplexity(content: string): number {
    // Simple complexity calculation
    const lines = content.split('\n').length;
    const cyclomaticComplexity = (content.match(/if|for|while|switch|catch/g) || []).length + 1;
    return Math.min(lines * cyclomaticComplexity / 10, 10); // Normalize to 0-10
  }

  private extractDependencies(content: string, language: string): string[] {
    const dependencies: string[] = [];
    
    switch (language) {
      case 'javascript':
      case 'typescript':
        const importMatches = content.match(/import.*from\s+['"]([^'"]+)['"]/g);
        if (importMatches) {
          importMatches.forEach(match => {
            const dep = match.match(/from\s+['"]([^'"]+)['"]/);
            if (dep) {dependencies.push(dep[1]);}
          });
        }
        break;
      case 'python':
        const pyImports = content.match(/from\s+(\w+)\s+import|import\s+(\w+)/g);
        if (pyImports) {
          pyImports.forEach(match => {
            const dep = match.match(/from\s+(\w+)|import\s+(\w+)/);
            if (dep) {dependencies.push(dep[1] || dep[2]);}
          });
        }
        break;
    }

    return dependencies;
  }

  private isSecurityRelevant(content: string, type: string): boolean {
    const securityKeywords = [
      'password', 'token', 'auth', 'login', 'session', 'cookie',
      'sql', 'query', 'database', 'db', 'encrypt', 'decrypt',
      'hash', 'salt', 'jwt', 'oauth', 'api', 'endpoint',
      'input', 'validate', 'sanitize', 'escape', 'xss', 'csrf'
    ];

    const lowerContent = content.toLowerCase();
    return securityKeywords.some(keyword => lowerContent.includes(keyword)) ||
           type === 'config' || type === 'import';
  }

  async searchRelevantCode(query: string, maxResults: number = 10): Promise<VectorSearchResult[]> {
    if (!this.isIndexed) {
      console.log('RAG Engine: Repository not indexed yet');
      return [];
    }

    // Simple keyword-based search (can be enhanced with actual vector embeddings)
    const queryWords = query.toLowerCase().split(/\s+/);
    const results: VectorSearchResult[] = [];

    for (const [id, chunk] of this.codeIndex) {
      const content = chunk.content.toLowerCase();
      let relevanceScore = 0;

      // Calculate relevance based on keyword matches
      for (const word of queryWords) {
        if (content.includes(word)) {
          relevanceScore += 1;
        }
      }

      // Boost score for security-relevant chunks
      if (chunk.metadata.securityRelevant) {
        relevanceScore += 2;
      }

      // Boost score for functions and classes
      if (chunk.type === 'function' || chunk.type === 'class') {
        relevanceScore += 1;
      }

      if (relevanceScore > 0) {
        results.push({
          chunk,
          similarity: relevanceScore / queryWords.length,
          relevanceScore
        });
      }
    }

    // Sort by relevance and return top results
    return results
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxResults);
  }

  getChunkById(id: string): CodeChunk | undefined {
    return this.codeIndex.get(id);
  }

  getAllChunks(): CodeChunk[] {
    return Array.from(this.codeIndex.values());
  }
}

// Multi-Agent System Implementation
class SecurityAgentImpl implements SecurityAgent {
  async analyzeVulnerabilities(code: string, context: CodeChunk[]): Promise<SecurityAnalysis> {
    const contextInfo = context.map(c => `${c.filePath}:${c.startLine}-${c.endLine}\n${c.content}`).join('\n\n');
    
    const prompt = `
As a security expert, analyze this code for vulnerabilities:

Code to analyze:
\`\`\`
${code}
\`\`\`

Relevant context from the codebase:
\`\`\`
${contextInfo}
\`\`\`

Return a comprehensive security analysis:
{
  "vulnerabilities": [
    {
      "id": "vuln_1",
      "type": "SQL Injection",
      "severity": "HIGH",
      "description": "User input directly concatenated into SQL query",
      "location": {
        "file": "example.js",
        "line": 42
      },
      "code": "const query = 'SELECT * FROM users WHERE id = ' + userId;",
      "exploitability": 8,
      "impact": 9,
      "cwe": "CWE-89",
      "owasp": "A03:2021"
    }
  ],
  "riskScore": 8.5,
  "recommendations": [
    "Use parameterized queries",
    "Implement input validation",
    "Add SQL injection testing"
  ],
  "context": "This function handles user authentication and database queries"
}
`;

    try {
      const response = await callLmStudio(prompt);
      const analysis = JSON.parse(response);
      return analysis;
    } catch (e) {
      console.log('Security Agent analysis failed:', e);
      return {
        vulnerabilities: [],
        riskScore: 0,
        recommendations: [],
        context: 'Analysis failed'
      };
    }
  }

  prioritizeThreats(vulnerabilities: Vulnerability[]): Vulnerability[] {
    return vulnerabilities.sort((a, b) => {
      const scoreA = a.exploitability * a.impact;
      const scoreB = b.exploitability * b.impact;
      return scoreB - scoreA;
    });
  }
}

class FixAgentImpl implements FixAgent {
  async generatePatch(vulnerability: Vulnerability, context: CodeChunk[]): Promise<SecurityPatch> {
    const contextInfo = context.map(c => `${c.filePath}:${c.startLine}-${c.endLine}\n${c.content}`).join('\n\n');
    
    const prompt = `
As a security fix expert, generate a secure patch for this vulnerability:

Vulnerability:
- Type: ${vulnerability.type}
- Severity: ${vulnerability.severity}
- Description: ${vulnerability.description}
- Code: ${vulnerability.code}
- Location: ${vulnerability.location.file}:${vulnerability.location.line}

Relevant context:
\`\`\`
${contextInfo}
\`\`\`

Generate a secure patch:
{
  "id": "patch_${vulnerability.id}",
  "vulnerabilityId": "${vulnerability.id}",
  "originalCode": "${vulnerability.code}",
  "patchedCode": "const query = 'SELECT * FROM users WHERE id = ?'; db.query(query, [userId]);",
  "explanation": "Replaced string concatenation with parameterized query to prevent SQL injection",
  "securityImprovements": [
    "Prevents SQL injection attacks",
    "Validates input parameters",
    "Uses secure database practices"
  ],
  "testingNotes": "Test with malicious input like '; DROP TABLE users; --'",
  "diff": "- const query = 'SELECT * FROM users WHERE id = ' + userId;\\n+ const query = 'SELECT * FROM users WHERE id = ?';\\n+ db.query(query, [userId]);",
  "confidence": 9
}
`;

    try {
      const response = await callLmStudio(prompt);
      const patch = JSON.parse(response);
      return patch;
    } catch (e) {
      console.log('Fix Agent failed:', e);
      return {
        id: `patch_${vulnerability.id}`,
        vulnerabilityId: vulnerability.id,
        originalCode: vulnerability.code,
        patchedCode: vulnerability.code,
        explanation: 'Failed to generate patch',
        securityImprovements: [],
        testingNotes: '',
        diff: '',
        confidence: 0
      };
    }
  }

  async validatePatch(patch: SecurityPatch): Promise<boolean> {
    // Simple validation - can be enhanced
    return patch.confidence > 5 && patch.patchedCode !== patch.originalCode;
  }
}

class ReviewAgentImpl implements ReviewAgent {
  async reviewPatch(patch: SecurityPatch, originalCode: string): Promise<ReviewResult> {
    const prompt = `
As a security review expert, review this patch:

Original Code:
\`\`\`
${originalCode}
\`\`\`

Proposed Patch:
\`\`\`
${patch.patchedCode}
\`\`\`

Explanation: ${patch.explanation}
Security Improvements: ${patch.securityImprovements.join(', ')}

Review the patch:
{
  "approved": true,
  "confidence": 8,
  "issues": [],
  "suggestions": [
    "Consider adding input validation",
    "Add error handling for database operations"
  ],
  "securityScore": 9
}
`;

    try {
      const response = await callLmStudio(prompt);
      const review = JSON.parse(response);
      return review;
    } catch (e) {
      console.log('Review Agent failed:', e);
      return {
        approved: false,
        confidence: 0,
        issues: ['Review failed'],
        suggestions: [],
        securityScore: 0
      };
    }
  }

  async checkSecurity(patch: SecurityPatch): Promise<SecurityCheck> {
    const prompt = `
As a security auditor, check if this patch introduces new security issues:

Patch:
\`\`\`
${patch.patchedCode}
\`\`\`

Security check:
{
  "isSecure": true,
  "remainingRisks": [],
  "securityScore": 9,
  "recommendations": [
    "Consider rate limiting",
    "Add logging for security events"
  ]
}
`;

    try {
      const response = await callLmStudio(prompt);
      const check = JSON.parse(response);
      return check;
    } catch (e) {
      console.log('Security check failed:', e);
      return {
        isSecure: false,
        remainingRisks: ['Security check failed'],
        securityScore: 0,
        recommendations: []
      };
    }
  }
}

// Inline Suggestion Provider
class CipherMateInlineSuggestionProvider implements vscode.InlineCompletionItemProvider {
  private analysisCache = new Map<string, CodeAnalysisResult>();
  private debounceTimer: NodeJS.Timeout | undefined;

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null> {
    
    // Check if inline suggestions are enabled
    const settings = vscode.workspace.getConfiguration('ciphermate');
    if (!settings.get('enableInlineSuggestions', true)) {
      return null;
    }
    
    // Only provide suggestions for code files
    if (!isCodeFile(document.fileName)) {
      return null;
    }

    // Get cached analysis or trigger new analysis
    const filePath = document.uri.fsPath;
    let analysis = this.analysisCache.get(filePath);
    
    if (!analysis || Date.now() - analysis.lastAnalyzed > 30000) { // 30 second cache
      analysis = await this.analyzeDocument(document);
      this.analysisCache.set(filePath, analysis);
    }

    // Find suggestions at current position
    const suggestions = analysis.suggestions.filter(s => 
      s.range.contains(position) || s.range.start.isEqual(position)
    );

    if (suggestions.length === 0) {
      return null;
    }

    // Convert to VS Code inline completion items
    return suggestions.map(suggestion => {
      const item = new vscode.InlineCompletionItem(suggestion.text);
      item.range = suggestion.range;
      item.command = suggestion.command ? {
        title: 'Apply Security Fix',
        command: suggestion.command,
        arguments: [suggestion]
      } : undefined;
      
      return item;
    });
  }

  private async analyzeDocument(document: vscode.TextDocument): Promise<CodeAnalysisResult> {
    const code = document.getText();
    const vulnerabilities: InlineSuggestion[] = [];
    const suggestions: InlineSuggestion[] = [];

    // Analyze for common security patterns
    const lines = code.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i;
      
      // SQL Injection patterns
      if (this.detectSQLInjection(line)) {
        const suggestion = this.createSQLInjectionFix(line, lineNumber, document);
        if (suggestion) {
          vulnerabilities.push({
            text: '',
            range: new vscode.Range(lineNumber, 0, lineNumber, line.length),
            severity: 'high',
            vulnerabilityType: 'SQL Injection',
            tooltip: 'Potential SQL injection vulnerability detected. Use parameterized queries.'
          });
          suggestions.push(suggestion);
        }
      }

      // XSS patterns
      if (this.detectXSS(line)) {
        const suggestion = this.createXSSFix(line, lineNumber, document);
        if (suggestion) {
          vulnerabilities.push({
            text: '',
            range: new vscode.Range(lineNumber, 0, lineNumber, line.length),
            severity: 'high',
            vulnerabilityType: 'Cross-Site Scripting (XSS)',
            tooltip: 'Potential XSS vulnerability detected. Sanitize user input.'
          });
          suggestions.push(suggestion);
        }
      }

      // Hardcoded secrets
      if (this.detectHardcodedSecrets(line)) {
        const suggestion = this.createSecretFix(line, lineNumber, document);
        if (suggestion) {
          vulnerabilities.push({
            text: '',
            range: new vscode.Range(lineNumber, 0, lineNumber, line.length),
            severity: 'critical',
            vulnerabilityType: 'Hardcoded Secret',
            tooltip: 'Hardcoded secret detected. Use environment variables or secure storage.'
          });
          suggestions.push(suggestion);
        }
      }

      // Weak cryptography
      if (this.detectWeakCrypto(line)) {
        const suggestion = this.createCryptoFix(line, lineNumber, document);
        if (suggestion) {
          vulnerabilities.push({
            text: '',
            range: new vscode.Range(lineNumber, 0, lineNumber, line.length),
            severity: 'medium',
            vulnerabilityType: 'Weak Cryptography',
            tooltip: 'Weak cryptographic algorithm detected. Use stronger algorithms.'
          });
          suggestions.push(suggestion);
        }
      }
    }

    return {
      vulnerabilities,
      suggestions,
      lastAnalyzed: Date.now()
    };
  }

  private detectSQLInjection(line: string): boolean {
    const sqlPatterns = [
      /SELECT.*\+.*['"]/i,
      /INSERT.*\+.*['"]/i,
      /UPDATE.*\+.*['"]/i,
      /DELETE.*\+.*['"]/i,
      /query\s*=\s*['"][^'"]*\+/i,
      /sql\s*=\s*['"][^'"]*\+/i
    ];
    return sqlPatterns.some(pattern => pattern.test(line));
  }

  private detectXSS(line: string): boolean {
    const xssPatterns = [
      /innerHTML\s*=\s*[^;]+$/,
      /document\.write\s*\(/,
      /eval\s*\(/,
      /setTimeout\s*\(\s*['"][^'"]*\+/,
      /setInterval\s*\(\s*['"][^'"]*\+/
    ];
    return xssPatterns.some(pattern => pattern.test(line));
  }

  private detectHardcodedSecrets(line: string): boolean {
    const secretPatterns = [
      /password\s*=\s*['"][^'"]{8,}['"]/i,
      /api[_-]?key\s*=\s*['"][^'"]{16,}['"]/i,
      /secret\s*=\s*['"][^'"]{16,}['"]/i,
      /token\s*=\s*['"][^'"]{16,}['"]/i,
      /private[_-]?key\s*=\s*['"][^'"]{32,}['"]/i
    ];
    return secretPatterns.some(pattern => pattern.test(line));
  }

  private detectWeakCrypto(line: string): boolean {
    const weakCryptoPatterns = [
      /md5\s*\(/i,
      /sha1\s*\(/i,
      /des\s*\(/i,
      /rc4\s*\(/i,
      /crypto\.createHash\s*\(\s*['"]md5['"]/i,
      /crypto\.createHash\s*\(\s*['"]sha1['"]/i
    ];
    return weakCryptoPatterns.some(pattern => pattern.test(line));
  }

  private createSQLInjectionFix(line: string, lineNumber: number, document: vscode.TextDocument): InlineSuggestion | null {
    // Simple SQL injection fix suggestions
    if (line.includes('SELECT') && line.includes('+')) {
      const fixedLine = line.replace(/(SELECT\s+.*?)\s*\+\s*([^;]+)/i, '$1 WHERE id = ?');
      return {
        text: fixedLine,
        range: new vscode.Range(lineNumber, 0, lineNumber, line.length),
        severity: 'high',
        vulnerabilityType: 'SQL Injection',
        tooltip: 'Use parameterized queries to prevent SQL injection attacks.',
        command: 'ciphermate.applyFix'
      };
    }
    return null;
  }

  private createXSSFix(line: string, lineNumber: number, document: vscode.TextDocument): InlineSuggestion | null {
    if (line.includes('innerHTML')) {
      const fixedLine = line.replace(/innerHTML/g, 'textContent');
      return {
        text: fixedLine,
        range: new vscode.Range(lineNumber, 0, lineNumber, line.length),
        severity: 'high',
        vulnerabilityType: 'XSS',
        tooltip: 'Use textContent instead of innerHTML to prevent XSS attacks.',
        command: 'ciphermate.applyFix'
      };
    }
    return null;
  }

  private createSecretFix(line: string, lineNumber: number, document: vscode.TextDocument): InlineSuggestion | null {
    if (line.includes('password') || line.includes('api_key')) {
      const fixedLine = line.replace(/=\s*['"][^'"]+['"]/, '= process.env.SECRET_KEY');
      return {
        text: fixedLine,
        range: new vscode.Range(lineNumber, 0, lineNumber, line.length),
        severity: 'critical',
        vulnerabilityType: 'Hardcoded Secret',
        tooltip: 'Use environment variables for sensitive data.',
        command: 'ciphermate.applyFix'
      };
    }
    return null;
  }

  private createCryptoFix(line: string, lineNumber: number, document: vscode.TextDocument): InlineSuggestion | null {
    if (line.includes('md5') || line.includes('sha1')) {
      const fixedLine = line.replace(/md5|sha1/gi, 'sha256');
      return {
        text: fixedLine,
        range: new vscode.Range(lineNumber, 0, lineNumber, line.length),
        severity: 'medium',
        vulnerabilityType: 'Weak Cryptography',
        tooltip: 'Use SHA-256 or stronger hashing algorithms.',
        command: 'ciphermate.applyFix'
      };
    }
    return null;
  }

  clearCache() {
    this.analysisCache.clear();
  }
}

// Global instances
const ragEngine = new RAGEngine();
const securityAgent = new SecurityAgentImpl();
const fixAgent = new FixAgentImpl();
const reviewAgent = new ReviewAgentImpl();
const inlineSuggestionProvider = new CipherMateInlineSuggestionProvider();
const DEFAULT_SETTINGS = {
  // Static Analysis Tools
  enableSemgrep: true,
  enableBandit: true,
  enableAIAnalysis: true,
  
  // Scan Behavior
  scanOnSave: true,
  scanInterval: 1, // Number of saves before full scan
  autoScanOnStartup: true,
  enableLiveReview: true,
  
  // Inline Suggestions
  enableInlineSuggestions: true,
  suggestionDelay: 500, // ms delay before showing suggestions
  maxSuggestionsPerFile: 10,
  enableAutoApply: false, // Auto-apply suggestions on Tab
  
  // Notifications
  enableNotifications: true,
  notificationLevel: 'all', // 'all', 'critical', 'high', 'medium', 'low', 'none'
  showNotificationPopups: true,
  enableSoundNotifications: false,
  
  // AI Agent Configuration
  aiProvider: 'lmstudio', // 'lmstudio', 'ollama', 'openai', 'custom'
  lmStudioUrl: 'http://localhost:1234/v1/chat/completions',
  ollamaUrl: 'http://localhost:11434/v1/chat/completions',
  openaiApiKey: '',
  customAiUrl: '',
  aiModel: 'auto', // 'auto', 'gpt-4', 'gpt-3.5-turbo', 'llama2', etc.
  aiTimeout: 30000, // ms
  
  // Security Detection
  enableSQLInjectionDetection: true,
  enableXSSDetection: true,
  enableSecretDetection: true,
  enableWeakCryptoDetection: true,
  enablePathTraversalDetection: true,
  enableCSRFDetection: true,
  
  // File Monitoring
  enableFileWatchers: true,
  watchFileTypes: ['js', 'ts', 'py', 'php', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'rb', 'sh'],
  excludePatterns: ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
  
  // Performance
  maxFileSize: 1024 * 1024, // 1MB
  analysisCacheTimeout: 30000, // 30 seconds
  maxConcurrentAnalyses: 5,
  
  // UI Preferences
  showSeverityIcons: true,
  enableDarkMode: 'auto', // 'auto', 'light', 'dark'
  compactMode: false,
  showTooltips: true,
  
  // Advanced
  enableDebugMode: false,
  logLevel: 'info', // 'debug', 'info', 'warn', 'error'
  enableTelemetry: false,
  customRulesPath: '',
};

let saveCounter = 0;
let lastScanResults: any[] = [];
let resultsPanel: vscode.WebviewPanel | null = null;
let encryptionKey: Buffer | null = null;
let activeCodeReviewer: ActiveCodeReviewer | null = null;

// User Authentication System
interface UserProfile {
  id: string;
  githubId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  createdAt: Date;
  lastLogin: Date;
  preferences: {
    theme: string;
    notifications: boolean;
    autoScan: boolean;
    reportFormat: string;
  };
}

interface VulnerabilityHistory {
  id: string;
  userId: string;
  scanDate: Date;
  vulnerabilities: any[];
  scanType: string;
  projectName: string;
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

let currentUser: UserProfile | null = null;
let vulnerabilityHistory: VulnerabilityHistory[] = [];
let currentScanProcess: any = null;
let isScanning = false;

// Encryption functions
function generateEncryptionKey(): Buffer {
  return crypto.randomBytes(32); // 256-bit key
}

function getEncryptionKey(context: vscode.ExtensionContext): Buffer {
  if (encryptionKey) {return encryptionKey;}
  
  const keyPath = path.join(context.globalStorageUri.fsPath, ENCRYPTION_KEY_FILE);
  
  try {
    if (fs.existsSync(keyPath)) {
      encryptionKey = fs.readFileSync(keyPath);
    } else {
      // Generate new key
      encryptionKey = generateEncryptionKey();
      // Ensure directory exists
      const dir = path.dirname(keyPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(keyPath, encryptionKey);
    }
  } catch (error) {
    console.error('Error handling encryption key:', error);
    // Fallback to a default key (less secure but functional)
    encryptionKey = crypto.scryptSync('ciphermate-default-key', 'salt', 32);
  }
  
  return encryptionKey;
}

function encryptData(data: any, context: vscode.ExtensionContext): string {
  const key = getEncryptionKey(context);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return iv.toString('hex') + ':' + encrypted;
}

function decryptData(encryptedData: string, context: vscode.ExtensionContext): any {
  try {
    const key = getEncryptionKey(context);
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Error decrypting data:', error);
    return null;
  }
}

function saveEncryptedData(data: any, context: vscode.ExtensionContext) {
  const encrypted = encryptData(data, context);
  context.globalState.update(ENCRYPTED_DATA_KEY, encrypted);
}

function loadEncryptedData(context: vscode.ExtensionContext): any {
  const encrypted = context.globalState.get(ENCRYPTED_DATA_KEY, '');
  if (!encrypted) {return null;}
  return decryptData(encrypted, context);
}

function getSettings(context: vscode.ExtensionContext) {
  return context.globalState.get(SETTINGS_KEY, DEFAULT_SETTINGS);
}

function updateSettings(context: vscode.ExtensionContext, newSettings: any) {
  context.globalState.update(SETTINGS_KEY, newSettings);
}

function postResultsToWebview() {
  if (resultsPanel) {
    resultsPanel.webview.postMessage({ command: 'updateResults', results: lastScanResults });
  }
}

async function callLmStudio(prompt: string): Promise<string> {
  const config = vscode.workspace.getConfiguration('ciphermate');
  const provider = config.get<string>('ai.provider') || 'lmstudio';

  // Check if Ollama is configured - use Ollama API instead of LM Studio
  if (provider === 'ollama') {
    return callOllamaAPI(prompt, config);
  }

  // Original LM Studio logic for backwards compatibility
  const url = config.get<string>('lmStudioUrl') || 'http://localhost:1234/v1/chat/completions';
  const body = JSON.stringify({
    messages: [
      { role: 'system', content: 'You are a security coding assistant. Help fix or explain vulnerabilities in code.' },
      { role: 'user', content: prompt }
    ],
    stream: false,
    temperature: 0.7,
    max_tokens: 1000
  });

  console.log('Calling LM Studio at:', url);
  console.log('Request body:', body.substring(0, 200) + '...');

  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 30000 // 30 second timeout
    }, (res) => {
      let data = '';
      console.log('LM Studio response status:', res.statusCode);
      console.log('LM Studio response headers:', res.headers);

      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('LM Studio raw response:', data.substring(0, 500) + '...');
        try {
          const json = JSON.parse(data);
          console.log('LM Studio parsed response:', JSON.stringify(json, null, 2));

          // Try different response formats that LM Studio might use
          let content = null;

          // Standard OpenAI format
          if (json.choices && json.choices[0] && json.choices[0].message) {
            content = json.choices[0].message.content;
          }
          // Alternative format - direct content
          else if (json.content) {
            content = json.content;
          }
          // Alternative format - response field
          else if (json.response) {
            content = json.response;
          }
          // Alternative format - text field
          else if (json.text) {
            content = json.text;
          }
          // Alternative format - message field
          else if (json.message) {
            content = json.message;
          }
          // Alternative format - result field
          else if (json.result) {
            content = json.result;
          }

          if (content) {
            console.log('LM Studio content found:', content.substring(0, 200) + '...');
            resolve(content);
          } else if (json.error) {
            console.log('LM Studio error:', json.error);
            const errorMessage = typeof json.error === 'string' ? json.error : JSON.stringify(json.error);
            if (errorMessage.includes('crashed')) {
              reject('LM Studio model has crashed. Please restart the model in LM Studio.');
            } else {
              reject('LM Studio error: ' + errorMessage);
            }
          } else {
            console.log('LM Studio response structure:', Object.keys(json));
            console.log('Full response:', json);
            resolve('No response from LLM - unexpected response format. Check console for details.');
          }
        } catch (e) {
          console.log('LM Studio JSON parse error:', e);
          console.log('Raw data that failed to parse:', data);
          reject('Failed to parse LLM response: ' + (e instanceof Error ? e.message : String(e)));
        }
      });
    });

    req.on('error', (error) => {
      console.log('LM Studio request error:', error);
      reject('LM Studio connection failed: ' + error.message);
    });

    req.on('timeout', () => {
      console.log('LM Studio request timeout');
      req.destroy();
      reject('LM Studio request timeout - check if LM Studio is running');
    });

    req.write(body);
    req.end();
  });
}

/**
 * Call Ollama API for AI responses
 * Supports both local and remote Ollama instances
 */
async function callOllamaAPI(prompt: string, config: vscode.WorkspaceConfiguration): Promise<string> {
  // Read Ollama configuration - try multiple methods to handle VS Code nested settings
  let baseUrl = 'http://localhost:11434';
  let model = 'deepseek-coder:1.3b';
  const timeout = config.get<number>('ai.ollama.timeout') || 300000; // 5 minute default for Ollama

  // Method 1: Try nested object approach (VS Code sometimes stores as object)
  const ollamaConfig = config.get('ai.ollama') as any;
  if (ollamaConfig && typeof ollamaConfig === 'object') {
    if (ollamaConfig.apiUrl) baseUrl = ollamaConfig.apiUrl;
    if (ollamaConfig.model) model = ollamaConfig.model;
  }

  // Method 2: Try dot notation (fallback)
  const directUrl = config.get<string>('ai.ollama.apiUrl');
  const directModel = config.get<string>('ai.ollama.model');
  if (directUrl) baseUrl = directUrl;
  if (directModel) model = directModel;

  // Method 3: Read from workspace settings.json directly if still localhost
  if (baseUrl === 'http://localhost:11434') {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      try {
        const settingsPath = path.join(workspaceFolders[0].uri.fsPath, '.vscode', 'settings.json');
        if (fs.existsSync(settingsPath)) {
          const settingsContent = fs.readFileSync(settingsPath, 'utf8');
          const settings = JSON.parse(settingsContent);

          const ollamaUrl = settings['ciphermate.ai.ollama.apiUrl'];
          const ollamaModel = settings['ciphermate.ai.ollama.model'];

          if (ollamaUrl && typeof ollamaUrl === 'string') baseUrl = ollamaUrl.trim();
          if (ollamaModel && typeof ollamaModel === 'string') model = ollamaModel.trim();
        }
      } catch (error) {
        console.error('callOllamaAPI: Error reading settings.json:', error);
      }
    }
  }

  // Ensure URL doesn't have trailing slash
  baseUrl = baseUrl.replace(/\/$/, '');
  const apiUrl = `${baseUrl}/api/generate`;

  console.log(`callOllamaAPI: Using Ollama at ${baseUrl} with model ${model}`);

  const body = JSON.stringify({
    model: model,
    prompt: `You are a security coding assistant. Help fix or explain vulnerabilities in code.\n\nUser request: ${prompt}`,
    stream: false,
    options: {
      temperature: 0.7,
      num_predict: 1000
    }
  });

  return new Promise((resolve, reject) => {
    const urlObj = new URL(apiUrl);
    const isHttps = urlObj.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const req = httpModule.request({
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: timeout
    }, (res) => {
      let data = '';
      console.log('Ollama response status:', res.statusCode);

      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('Ollama raw response:', data.substring(0, 500) + '...');
        try {
          const json = JSON.parse(data);

          // Ollama API returns response in 'response' field
          if (json.response) {
            console.log('Ollama content found:', json.response.substring(0, 200) + '...');
            resolve(json.response);
          } else if (json.error) {
            console.log('Ollama error:', json.error);
            reject('Ollama error: ' + json.error);
          } else {
            console.log('Ollama unexpected response:', json);
            resolve('No response from Ollama - unexpected response format.');
          }
        } catch (e) {
          console.log('Ollama JSON parse error:', e);
          reject('Failed to parse Ollama response: ' + (e instanceof Error ? e.message : String(e)));
        }
      });
    });

    req.on('error', (error) => {
      console.log('Ollama request error:', error);
      reject(`Ollama connection failed (${baseUrl}): ${error.message}`);
    });

    req.on('timeout', () => {
      console.log('Ollama request timeout');
      req.destroy();
      reject(`Ollama request timeout - check if Ollama is running at ${baseUrl}`);
    });

    req.write(body);
    req.end();
  });
}

// Notification system
enum NotificationType {
  VULNERABILITY = 'vulnerability',
  SUGGESTION = 'suggestion',
  FIX = 'fix',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error'
}

// Active Code Review System
class ActiveCodeReviewer {
  private fileWatchers = new Map<string, vscode.FileSystemWatcher>();
  private analysisCache = new Map<string, CodeAnalysisResult>();
  private notificationQueue: Array<{type: NotificationType, message: string, details?: string}> = [];
  private isProcessingQueue = false;

  constructor() {
    this.setupFileWatchers();
    this.startNotificationProcessor();
  }

  private setupFileWatchers() {
    // Watch for file changes in the workspace
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {return;}

    workspaceFolders.forEach(folder => {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, '**/*.{js,ts,py,php,java,c,cpp,cs,go,rs,rb,sh}')
      );

      watcher.onDidChange(async (uri) => {
        await this.analyzeFileChange(uri);
      });

      watcher.onDidCreate(async (uri) => {
        await this.analyzeFileChange(uri);
      });

      this.fileWatchers.set(folder.uri.fsPath, watcher);
    });
  }

  private async analyzeFileChange(uri: vscode.Uri) {
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      if (!isCodeFile(document.fileName)) {return;}

      const analysis = await this.performSecurityAnalysis(document);
      this.analysisCache.set(uri.fsPath, analysis);

      // Check for new vulnerabilities
      const previousAnalysis = this.analysisCache.get(uri.fsPath);
      if (previousAnalysis) {
        const newVulnerabilities = analysis.vulnerabilities.filter(v => 
          !previousAnalysis.vulnerabilities.some(pv => 
            pv.range.isEqual(v.range) && pv.vulnerabilityType === v.vulnerabilityType
          )
        );

        // Send notifications for new vulnerabilities
        newVulnerabilities.forEach(vuln => {
          this.queueNotification(
            NotificationType.VULNERABILITY,
            `[SECURITY] ${vuln.vulnerabilityType} detected in ${path.basename(uri.fsPath)}`,
            `Line ${vuln.range.start.line + 1}: ${vuln.tooltip}`
          );
        });
      }
    } catch (error) {
      console.error('Error analyzing file change:', error);
    }
  }

  private async performSecurityAnalysis(document: vscode.TextDocument): Promise<CodeAnalysisResult> {
    const code = document.getText();
    const vulnerabilities: InlineSuggestion[] = [];
    const suggestions: InlineSuggestion[] = [];

    const lines = code.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i;
      
      // Check for various security issues
      if (this.detectSQLInjection(line)) {
        vulnerabilities.push({
          text: '',
          range: new vscode.Range(lineNumber, 0, lineNumber, line.length),
          severity: 'high',
          vulnerabilityType: 'SQL Injection',
          tooltip: 'Potential SQL injection vulnerability detected. Use parameterized queries.'
        });
      }

      if (this.detectXSS(line)) {
        vulnerabilities.push({
          text: '',
          range: new vscode.Range(lineNumber, 0, lineNumber, line.length),
          severity: 'high',
          vulnerabilityType: 'Cross-Site Scripting (XSS)',
          tooltip: 'Potential XSS vulnerability detected. Sanitize user input.'
        });
      }

      if (this.detectHardcodedSecrets(line)) {
        vulnerabilities.push({
          text: '',
          range: new vscode.Range(lineNumber, 0, lineNumber, line.length),
          severity: 'critical',
          vulnerabilityType: 'Hardcoded Secret',
          tooltip: 'Hardcoded secret detected. Use environment variables or secure storage.'
        });
      }

      if (this.detectWeakCrypto(line)) {
        vulnerabilities.push({
          text: '',
          range: new vscode.Range(lineNumber, 0, lineNumber, line.length),
          severity: 'medium',
          vulnerabilityType: 'Weak Cryptography',
          tooltip: 'Weak cryptographic algorithm detected. Use stronger algorithms.'
        });
      }
    }

    return {
      vulnerabilities,
      suggestions,
      lastAnalyzed: Date.now()
    };
  }

  private detectSQLInjection(line: string): boolean {
    const sqlPatterns = [
      /SELECT.*\+.*['"]/i,
      /INSERT.*\+.*['"]/i,
      /UPDATE.*\+.*['"]/i,
      /DELETE.*\+.*['"]/i,
      /query\s*=\s*['"][^'"]*\+/i,
      /sql\s*=\s*['"][^'"]*\+/i
    ];
    return sqlPatterns.some(pattern => pattern.test(line));
  }

  private detectXSS(line: string): boolean {
    const xssPatterns = [
      /innerHTML\s*=\s*[^;]+$/,
      /document\.write\s*\(/,
      /eval\s*\(/,
      /setTimeout\s*\(\s*['"][^'"]*\+/,
      /setInterval\s*\(\s*['"][^'"]*\+/
    ];
    return xssPatterns.some(pattern => pattern.test(line));
  }

  private detectHardcodedSecrets(line: string): boolean {
    const secretPatterns = [
      /password\s*=\s*['"][^'"]{8,}['"]/i,
      /api[_-]?key\s*=\s*['"][^'"]{16,}['"]/i,
      /secret\s*=\s*['"][^'"]{16,}['"]/i,
      /token\s*=\s*['"][^'"]{16,}['"]/i,
      /private[_-]?key\s*=\s*['"][^'"]{32,}['"]/i
    ];
    return secretPatterns.some(pattern => pattern.test(line));
  }

  private detectWeakCrypto(line: string): boolean {
    const weakCryptoPatterns = [
      /md5\s*\(/i,
      /sha1\s*\(/i,
      /des\s*\(/i,
      /rc4\s*\(/i,
      /crypto\.createHash\s*\(\s*['"]md5['"]/i,
      /crypto\.createHash\s*\(\s*['"]sha1['"]/i
    ];
    return weakCryptoPatterns.some(pattern => pattern.test(line));
  }

  private queueNotification(type: NotificationType, message: string, details?: string) {
    this.notificationQueue.push({ type, message, details });
  }

  private async startNotificationProcessor() {
    setInterval(async () => {
      if (this.isProcessingQueue || this.notificationQueue.length === 0) {return;}
      
      this.isProcessingQueue = true;
      const notification = this.notificationQueue.shift();
      
      if (notification) {
        await this.showNotification(notification.type, notification.message, notification.details);
      }
      
      this.isProcessingQueue = false;
    }, 1000); // Process notifications every second
  }

  private async showNotification(type: NotificationType, message: string, details?: string) {
    const fullMessage = details ? `${message}\n${details}` : message;
    
    switch (type) {
      case NotificationType.VULNERABILITY:
        await vscode.window.showWarningMessage(fullMessage, 'View Details', 'Dismiss').then(selection => {
          if (selection === 'View Details') {
            vscode.commands.executeCommand('ciphermate.showResults');
          }
        });
        break;
      case NotificationType.SUGGESTION:
        await vscode.window.showInformationMessage(fullMessage, 'Apply Fix', 'Dismiss').then(selection => {
          if (selection === 'Apply Fix') {
            vscode.commands.executeCommand('ciphermate.applyFix');
          }
        });
        break;
      default:
        vscode.window.showInformationMessage(fullMessage);
    }
  }

  async performInitialScan() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {return;}

    this.queueNotification(
      NotificationType.INFO,
      'CipherMate: Initial security scan in progress',
      'Analyzing codebase for security vulnerabilities'
    );

    let totalVulnerabilities = 0;
    let totalFiles = 0;

    for (const folder of workspaceFolders) {
      const files = await getCodeFiles(folder.uri.fsPath);
      totalFiles += files.length;

      for (const file of files) {
        try {
          const document = await vscode.workspace.openTextDocument(file);
          const analysis = await this.performSecurityAnalysis(document);
          this.analysisCache.set(file, analysis);
          totalVulnerabilities += analysis.vulnerabilities.length;
        } catch (error) {
          console.error(`Error analyzing ${file}:`, error);
        }
      }
    }

    this.queueNotification(
      NotificationType.INFO,
      `Initial scan complete: ${totalVulnerabilities} vulnerabilities identified in ${totalFiles} files`,
      'View detailed report in Results Panel'
    );
  }

  dispose() {
    this.fileWatchers.forEach(watcher => watcher.dispose());
    this.fileWatchers.clear();
    this.analysisCache.clear();
  }
}

function showNotification(type: NotificationType, message: string, details?: string) {
  const prefixes = {
    [NotificationType.VULNERABILITY]: '[SECURITY]',
    [NotificationType.SUGGESTION]: '[SUGGESTION]',
    [NotificationType.FIX]: '[FIX]',
    [NotificationType.INFO]: '[INFO]',
    [NotificationType.WARNING]: '[WARNING]',
    [NotificationType.ERROR]: '[ERROR]'
  };

  const fullMessage = `${prefixes[type]} CipherMate: ${message}`;
  
  switch (type) {
    case NotificationType.VULNERABILITY:
    case NotificationType.ERROR:
      vscode.window.showErrorMessage(fullMessage);
      break;
    case NotificationType.WARNING:
      vscode.window.showWarningMessage(fullMessage);
      break;
    case NotificationType.FIX:
    case NotificationType.SUGGESTION:
      vscode.window.showInformationMessage(fullMessage);
      break;
    default:
      vscode.window.showInformationMessage(fullMessage);
  }

  // Log to output channel for debugging
  console.log(`[${type.toUpperCase()}] ${message}${details ? ` - ${details}` : ''}`);
}

async function testAIConnection(): Promise<{success: boolean, error?: string}> {
  try {
    const testPrompt = 'Respond with just the word "SUCCESS" if you can read this.';
    const response = await callLmStudio(testPrompt);
    if (response && response.includes('SUCCESS')) {
      return { success: true };
    } else {
      return { success: false, error: 'Invalid response from AI' };
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// OAuth Configuration
const OAUTH_CONFIG = {
  github: {
    clientId: 'Ov23liJ8QZqXqXqXqXqX', // Replace with your GitHub OAuth App Client ID
    clientSecret: 'your_github_client_secret_here',
    redirectUri: 'vscode://ciphermate.oauth/github',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userUrl: 'https://api.github.com/user',
    scope: 'user:email'
  },
  google: {
    clientId: 'your_google_client_id_here', // Replace with your Google OAuth Client ID
    clientSecret: 'your_google_client_secret_here',
    redirectUri: 'vscode://ciphermate.oauth/google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scope: 'openid profile email'
  },
  microsoft: {
    clientId: 'your_microsoft_client_id_here', // Replace with your Microsoft App Client ID
    clientSecret: 'your_microsoft_client_secret_here',
    redirectUri: 'vscode://ciphermate.oauth/microsoft',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userUrl: 'https://graph.microsoft.com/v1.0/me',
    scope: 'openid profile email'
  }
};

// Authentication Functions
type OAuthProvider = 'github' | 'google' | 'microsoft';

async function authenticateWithProvider(provider: OAuthProvider, context: vscode.ExtensionContext): Promise<UserProfile | null> {
  let callbackServer: OAuthCallbackServer | null = null;
  
  try {
    const config = OAUTH_CONFIG[provider];
    const state = crypto.randomBytes(16).toString('hex');
    
    // Start OAuth callback server
    callbackServer = new OAuthCallbackServer();
    await callbackServer.start();
    
    // Build OAuth URL with callback server
    const redirectUri = `http://localhost:${callbackServer.getPort()}/oauth/callback`;
    const authUrl = `${config.authUrl}?client_id=${config.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(config.scope)}&state=${state}&response_type=code`;
    
    // Show progress notification
    const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
    const progressMessage = vscode.window.showInformationMessage(
      `Opening ${providerName} authentication in your browser...`,
      'Cancel'
    );
    
    // Open browser
    await vscode.env.openExternal(vscode.Uri.parse(authUrl));
    
    // Wait for OAuth callback
    const authCode = await Promise.race([
      callbackServer.waitForCallback(),
      new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('Authentication timeout')), 300000); // 5 minute timeout
      })
    ]);
    
    // Show progress while exchanging code
    return await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Authenticating with ${providerName}...`,
      cancellable: false
    }, async (progress) => {
      progress.report({ increment: 20, message: 'Exchanging authorization code...' });
      
      // Exchange code for access token
      const tokenResponse = await exchangeCodeForToken(authCode, provider, redirectUri);
      if (!tokenResponse) {
        throw new Error('Failed to exchange code for token');
      }
      
      progress.report({ increment: 40, message: 'Getting user profile...' });
      
      // Get user profile from provider
      const userProfile = await getUserProfile(tokenResponse.access_token, provider);
      if (!userProfile) {
        throw new Error('Failed to get user profile');
      }
      
      progress.report({ increment: 20, message: 'Creating user account...' });
      
      // Create user profile
      const user: UserProfile = {
        id: crypto.randomUUID(),
        githubId: userProfile.id.toString(),
        username: userProfile.username || userProfile.login || userProfile.email?.split('@')[0] || 'user',
        displayName: userProfile.name || userProfile.displayName || userProfile.login || userProfile.email?.split('@')[0] || 'User',
        avatarUrl: userProfile.avatar_url || userProfile.picture || userProfile.avatar || '',
        email: userProfile.email || '',
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token || '',
        createdAt: new Date(),
        lastLogin: new Date(),
        preferences: {
          theme: 'auto',
          notifications: true,
          autoScan: true,
          reportFormat: 'detailed'
        }
      };
      
      progress.report({ increment: 20, message: 'Saving profile...' });
      
      // Save user profile securely
      await saveUserProfile(user, context);
      currentUser = user;
      
      vscode.window.showInformationMessage(`Welcome to CipherMate, ${user.displayName}!`);
      return user;
    });
    
  } catch (error) {
    vscode.window.showErrorMessage(`Authentication failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  } finally {
    // Clean up callback server
    if (callbackServer) {
      callbackServer.stop();
    }
  }
}

// Legacy function for backward compatibility
async function authenticateWithGitHub(context: vscode.ExtensionContext): Promise<UserProfile | null> {
  return authenticateWithProvider('github', context);
}

async function exchangeCodeForToken(code: string, provider: OAuthProvider, redirectUri?: string): Promise<{access_token: string, refresh_token?: string} | null> {
  try {
    const config = OAUTH_CONFIG[provider];
    
    // Clean the code (remove any extra parameters that might be in the URL)
    const cleanCode = code.split('&')[0].split('?')[0].trim();
    
    const callbackUri = redirectUri || 'http://localhost:8080/oauth/callback';
    
    const body = provider === 'github' 
      ? JSON.stringify({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code: cleanCode,
          redirect_uri: callbackUri
        })
      : new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code: cleanCode,
          redirect_uri: callbackUri,
          grant_type: 'authorization_code'
        }).toString();

    console.log(`Exchanging token for ${provider}...`);
    
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': provider === 'github' ? 'application/json' : 'application/x-www-form-urlencoded',
        'User-Agent': 'CipherMate/1.0.2'
      },
      body: body
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Token exchange failed: ${response.status} ${errorText}`);
      throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
    }
    
    const data = await response.json() as {access_token: string, refresh_token?: string};
    
    if (!data.access_token) {
      throw new Error('No access token received from provider');
    }
    
    console.log(`Token exchange successful for ${provider}`);
    return data;
  } catch (error) {
    console.error('Token exchange error:', error);
    throw error; // Re-throw to be handled by the calling function
  }
}

async function getUserProfile(accessToken: string, provider: OAuthProvider): Promise<any> {
  try {
    const config = OAUTH_CONFIG[provider];
    
    const headers: { [key: string]: string } = {
      'Accept': 'application/json',
      'User-Agent': 'CipherMate/1.0.2'
    };
    
    if (provider === 'github') {
      headers['Authorization'] = `Bearer ${accessToken}`;
      headers['Accept'] = 'application/vnd.github.v3+json';
    } else {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    
    console.log(`Getting user profile from ${provider}...`);
    
    const response = await fetch(config.userUrl, {
      headers: headers
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${provider} API error: ${response.status} ${errorText}`);
      throw new Error(`${provider} API error: ${response.status} ${errorText}`);
    }
    
    const userData = await response.json();
    console.log(`User profile retrieved successfully from ${provider}`);
    return userData;
  } catch (error) {
    console.error(`${provider} profile error:`, error);
    throw error; // Re-throw to be handled by the calling function
  }
}

// Legacy function for backward compatibility
async function getGitHubUserProfile(accessToken: string): Promise<any> {
  return getUserProfile(accessToken, 'github');
}

async function saveUserProfile(user: UserProfile, context: vscode.ExtensionContext): Promise<void> {
  try {
    const encryptedProfile = encryptData(user, context);
    await context.workspaceState.update('ciphermate.userProfile', encryptedProfile);
  } catch (error) {
    console.error('Save user profile error:', error);
  }
}

async function loadUserProfile(context: vscode.ExtensionContext): Promise<UserProfile | null> {
  try {
    const encryptedProfile = await context.workspaceState.get('ciphermate.userProfile');
    if (!encryptedProfile || typeof encryptedProfile !== 'string') {
      return null;
    }
    return decryptData(encryptedProfile, context);
  } catch (error) {
    console.error('Load user profile error:', error);
    return null;
  }
}

async function logout(context: vscode.ExtensionContext): Promise<void> {
  currentUser = null;
  await context.workspaceState.update('ciphermate.userProfile', undefined);
  vscode.window.showInformationMessage('Logged out successfully');
}

// Vulnerability History Functions
async function saveVulnerabilityHistory(scanResults: any[], scanType: string, context: vscode.ExtensionContext): Promise<void> {
  if (!currentUser) {return;}
  
  const historyEntry: VulnerabilityHistory = {
    id: crypto.randomUUID(),
    userId: currentUser.id,
    scanDate: new Date(),
    vulnerabilities: scanResults,
    scanType: scanType,
    projectName: vscode.workspace.workspaceFolders?.[0]?.name || 'Unknown Project',
    summary: {
      total: scanResults.length,
      critical: scanResults.filter(r => r.severity === 'critical' || r.severity === 'error').length,
      high: scanResults.filter(r => r.severity === 'high' || r.severity === 'warning').length,
      medium: scanResults.filter(r => r.severity === 'medium' || r.severity === 'info').length,
      low: scanResults.filter(r => r.severity === 'low').length
    }
  };
  
  vulnerabilityHistory.push(historyEntry);
  
  // Save to secure storage
  try {
    const encryptedHistory = encryptData(vulnerabilityHistory, context);
    await context.workspaceState.update('ciphermate.vulnerabilityHistory', encryptedHistory);
  } catch (error) {
    console.error('Save vulnerability history error:', error);
  }
}

async function loadVulnerabilityHistory(context: vscode.ExtensionContext): Promise<VulnerabilityHistory[]> {
  try {
    const encryptedHistory = await context.workspaceState.get('ciphermate.vulnerabilityHistory');
    if (!encryptedHistory || typeof encryptedHistory !== 'string') {
      return [];
    }
    return decryptData(encryptedHistory, context) || [];
  } catch (error) {
    console.error('Load vulnerability history error:', error);
    return [];
  }
}

function getFallbackExplanation(issue: any, vulnerabilityType: string): string {
  const explanations: { [key: string]: string } = {
    'SQL Injection': `
SQL Injection is a code injection technique where malicious SQL statements are inserted into an application's database query.

What it is:
- An attacker can manipulate SQL queries by injecting malicious SQL code
- This happens when user input is directly concatenated into SQL queries without proper sanitization

Why it's dangerous:
- Attackers can read, modify, or delete data from your database
- Can bypass authentication systems
- Can execute administrative operations on the database
- Can potentially access the entire database

How to fix:
- Use parameterized queries (prepared statements)
- Use stored procedures
- Validate and sanitize all user input
- Use least privilege principle for database access
- Implement proper error handling that doesn't expose database structure

Example of vulnerable code:
query = "SELECT * FROM users WHERE id = " + userInput;

Example of secure code:
query = "SELECT * FROM users WHERE id = ?";
parameters = [userInput];
    `,
    'Cross-Site Scripting (XSS)': `
Cross-Site Scripting (XSS) allows attackers to inject malicious scripts into web pages viewed by other users.

What it is:
- Malicious scripts are injected into trusted websites
- The scripts execute in the victim's browser
- Can steal cookies, session tokens, or other sensitive information

Types of XSS:
- Stored XSS: Malicious script is stored on the server
- Reflected XSS: Malicious script is reflected off a web server
- DOM-based XSS: Vulnerability exists in client-side code

Why it's dangerous:
- Can steal user credentials and session tokens
- Can redirect users to malicious websites
- Can modify page content to trick users
- Can perform actions on behalf of the user

How to fix:
- Validate and sanitize all user input
- Use Content Security Policy (CSP)
- Encode output data
- Use HTTP-only cookies
- Implement proper input validation and output encoding
    `,
    'Hardcoded Secret': `
Hardcoded secrets are sensitive information like passwords, API keys, or tokens that are embedded directly in source code.

What it is:
- Sensitive credentials are written directly in the code
- These secrets are visible to anyone with access to the source code
- Common examples: passwords, API keys, database credentials, encryption keys

Why it's dangerous:
- Secrets are exposed in version control systems
- Anyone with code access can use these credentials
- Difficult to rotate or change secrets
- Can lead to unauthorized access to systems and data

How to fix:
- Use environment variables for sensitive data
- Use secure secret management systems (AWS Secrets Manager, Azure Key Vault, etc.)
- Use configuration files that are not committed to version control
- Implement proper secret rotation policies
- Use secure coding practices and code reviews

Example of vulnerable code:
const apiKey = "sk-1234567890abcdef";

Example of secure code:
const apiKey = process.env.API_KEY;
    `,
    'Weak Cryptography': `
Weak cryptography refers to the use of outdated or insecure cryptographic algorithms and practices.

What it is:
- Using deprecated or broken cryptographic algorithms
- Using weak key lengths or poor random number generation
- Implementing custom cryptography instead of proven libraries

Common weak algorithms:
- MD5 (broken, vulnerable to collision attacks)
- SHA-1 (deprecated, vulnerable to collision attacks)
- DES (weak key length)
- RC4 (vulnerable to various attacks)

Why it's dangerous:
- Weak algorithms can be easily broken by attackers
- Can lead to data exposure and tampering
- May not provide the security guarantees expected
- Can compromise the entire security model

How to fix:
- Use modern, well-tested cryptographic algorithms
- Use appropriate key lengths (AES-256, RSA-2048+)
- Use cryptographically secure random number generators
- Use established cryptographic libraries
- Regularly update cryptographic implementations
- Follow current security standards and best practices

Example of weak code:
const hash = crypto.createHash('md5').update(data).digest('hex');

Example of secure code:
const hash = crypto.createHash('sha256').update(data).digest('hex');
    `
  };

  return explanations[vulnerabilityType] || `
This is a security vulnerability that has been detected in your code.

Vulnerability Type: ${vulnerabilityType}
File: ${issue.path || issue.filename || 'Unknown'}
Line: ${issue.start?.line || issue.line_number || 'Unknown'}
Severity: ${issue.extra?.severity || issue.severity || 'Unknown'}

Description: ${issue.extra?.message || issue.issue_text || issue.check_id || 'Security issue detected'}

To get detailed AI-powered explanations, please ensure your AI provider (LM Studio, Ollama, or OpenAI) is properly configured and running in CipherMate settings.
  `;
}

function testEncryptedStorage(context: vscode.ExtensionContext): boolean {
  try {
    const testData = { test: 'data', timestamp: Date.now() };
    saveEncryptedData(testData, context);
    const loadedData = loadEncryptedData(context);
    
    if (loadedData && loadedData.test === 'data') {
      showNotification(NotificationType.INFO, 'Encrypted storage test passed');
      return true;
    } else {
      showNotification(NotificationType.ERROR, 'Encrypted storage test failed');
      return false;
    }
  } catch (error) {
    showNotification(NotificationType.ERROR, 'Encrypted storage test failed', String(error));
    return false;
  }
}

// Enhanced AI-powered repository analysis
async function intelligentRepositoryScan(workspacePath: string, context: vscode.ExtensionContext): Promise<any[]> {
  const logger = new EnterpriseLogger();
  logger.info('Intelligent repository analysis initiated');
  
  const results = [];
  
  // 1. Run unified repository scanner (NEW - Core features)
  try {
    const { RepositoryScanner } = await import('./scanners/repository-scanner');
    const scanner = new RepositoryScanner(workspacePath);
    const scanResult = await scanner.scan();

    // Convert scanner results to existing format
    const scannerVulns = scanner.getAllVulnerabilities(scanResult.results);
    results.push(...scannerVulns.map((v: any) => ({
      ...v,
      severity: v.severity.toUpperCase(),
      file: v.file,
      line: v.line,
      message: v.description,
      type: v.type,
    })));
    
    logger.info(`Repository scanner found ${scanResult.aggregated.total} vulnerabilities`);
  } catch (e) {
    logger.error('Repository scanner failed', e as Error);
    showNotification(NotificationType.WARNING, 'Repository scanner failed, continuing with legacy scans');
  }
  
  // 2. Run static analysis tools (legacy)
  try {
    const semgrepResults = await runSemgrepScan(workspacePath);
    results.push(...semgrepResults);
  } catch (e) {
    showNotification(NotificationType.WARNING, 'Semgrep scan failed, continuing with AI analysis');
  }
  
  try {
    const banditResults = await runBanditScan(workspacePath);
    results.push(...banditResults);
  } catch (e) {
    showNotification(NotificationType.WARNING, 'Bandit scan failed, continuing with AI analysis');
  }
  
  // 3. AI-powered pattern analysis
  try {
    const aiAnalysis = await runAIPatternAnalysis(workspacePath, context);
    results.push(...aiAnalysis);
  } catch (e) {
    showNotification(NotificationType.WARNING, 'AI pattern analysis failed');
  }
  
  // 4. Cross-reference and prioritize findings
  const prioritizedResults = prioritizeAndDeduplicate(results);
  
  // 4. Team reporting for vulnerabilities
  if (currentTeamLead && currentTeamLead.reportingSettings.enabled) {
    const currentMember = currentTeamLead.teamMembers.find(m => m.id === currentDeveloperProfile?.id);
    if (currentMember) {
      for (const vulnerability of prioritizedResults) {
        if (shouldReportVulnerability(vulnerability, currentTeamLead.reportingSettings)) {
          const report = createTeamVulnerabilityReport(
            currentMember.id,
            currentMember.name,
            vulnerability,
            context
          );
          sendTeamReport(report, currentTeamLead.reportingSettings);
          updateTeamMemberProgress(currentMember.id, detectVulnerabilityType(vulnerability), context);
        }
      }
    }
  }
  
  logger.info('Repository analysis completed', { issuesFound: prioritizedResults.length, critical: prioritizedResults.filter(r => r.severity === 'CRITICAL').length });
  return prioritizedResults;
}

async function runSemgrepScan(workspacePath: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    // Create a more targeted scan command that excludes test directories and large files
    const command = 'semgrep --json --exclude=".vscode-test" --exclude="node_modules" --exclude=".git" --timeout=30 .';
    console.log('Running Semgrep command:', command, 'in directory:', workspacePath);
    
    exec(command, { cwd: workspacePath }, (error, stdout, stderr) => {
      if (error) {
        console.log('Semgrep failed with error:', error.message);
        console.log('Stderr:', stderr);
        // If semgrep fails, try a simpler approach
        console.log('Trying fallback scan of src/ directory');
        exec('semgrep --json --timeout=10 src/', { cwd: workspacePath }, (error2, stdout2, stderr2) => {
          if (error2) {
            console.log('Fallback scan also failed:', error2.message);
            reject(error2);
            return;
          }
          try {
            const result = JSON.parse(stdout2);
            console.log('Fallback scan found', result.results?.length || 0, 'results');
            const results = (result.results || []).map((r: any) => ({
              tool: 'Semgrep',
              ...r
            }));
            resolve(results);
          } catch (e) {
            console.log('Failed to parse fallback results:', e);
            reject(e);
          }
        });
        return;
      }
      try {
        const result = JSON.parse(stdout);
        console.log('Semgrep scan found', result.results?.length || 0, 'results');
        const results = (result.results || []).map((r: any) => ({
          tool: 'Semgrep',
          ...r
        }));
        resolve(results);
      } catch (e) {
        console.log('Failed to parse Semgrep results:', e);
        console.log('Raw output:', stdout);
        reject(e);
      }
    });
  });
}

async function runBanditScan(workspacePath: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    exec('bandit -r -f json .', { cwd: workspacePath }, (error, stdout, stderr) => {
      if (error) {
        // Check if it's just "no Python files found" vs actual error
        if (stderr.includes('No files identified to scan') || 
            stderr.includes('profile include tests: None') ||
            error.code === 1) {
          console.log('Bandit: No Python files found to scan (this is normal for non-Python projects)');
          resolve([]); // Return empty results instead of error
          return;
        }
        reject(error);
        return;
      }
      try {
        const result = JSON.parse(stdout);
        const results = (result.results || []).map((r: any) => ({
          tool: 'Bandit',
          ...r
        }));
        console.log(`Bandit: Found ${results.length} Python security issues`);
        resolve(results);
      } catch (e) {
        // If JSON parsing fails, check if it's just informational output
        if (stdout.includes('profile include tests: None') || 
            stdout.includes('No files identified to scan')) {
          console.log('Bandit: No Python files found to scan (this is normal for non-Python projects)');
          resolve([]);
          return;
        }
        reject(e);
      }
    });
  });
}

async function runAIPatternAnalysis(workspacePath: string, context: vscode.ExtensionContext): Promise<any[]> {
  // AI analyzes code patterns for security issues that static tools might miss
  const files = await getCodeFiles(workspacePath);
  const aiResults = [];
  
  console.log(`AI Analysis: Processing ${files.length} files (was limited to 10)`);
  for (const file of files) { // Process ALL files, not just first 10
    try {
      const code = fs.readFileSync(file, 'utf8');
      const analysis = await analyzeFileWithAI(code, file, context);
      if (analysis.issues.length > 0) {
        aiResults.push(...analysis.issues);
        console.log(`AI found ${analysis.issues.length} issues in ${path.basename(file)}`);
      }
    } catch (e) {
      console.log(`AI Analysis failed for ${file}:`, e instanceof Error ? e.message : String(e));
      // Continue processing other files instead of silently skipping
    }
  }
  
  return aiResults;
}

async function getCodeFiles(workspacePath: string): Promise<string[]> {
  const files: string[] = [];
  
  function walkDir(dir: string) {
    try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
        // Skip test directories, node_modules, and other non-essential directories
        if (stat.isDirectory() && 
            !item.startsWith('.') && 
            item !== 'node_modules' && 
            item !== '.vscode-test' &&
            item !== 'dist' &&
            item !== 'out') {
        walkDir(fullPath);
        } else if (isCodeFile(item)) { // Process all code files regardless of size
        files.push(fullPath);
      }
      }
    } catch (e) {
      // Skip directories we can't read
      console.log('Skipping directory:', dir, e);
    }
  }
  
  walkDir(workspacePath);
  return files;
}

function isCodeFile(filename: string): boolean {
  const codeExtensions = ['.js', '.ts', '.py', '.php', '.java', '.c', '.cpp', '.cs', '.go', '.rs', '.rb', '.sh'];
  return codeExtensions.some(ext => filename.endsWith(ext));
}

async function analyzeFileWithAI(code: string, filePath: string, context: vscode.ExtensionContext): Promise<any> {
  // For very large files, analyze in chunks to get better coverage
  if (code.length > 100000) {
    console.log(`Large file detected (${code.length} chars): ${path.basename(filePath)} - analyzing in chunks`);
    return await analyzeLargeFileInChunks(code, filePath, context);
  }

  const prompt = `
Analyze this code file for security vulnerabilities:

File: ${filePath}
Code:
\`\`\`
${code}
\`\`\`

Please identify any security issues, even subtle ones that static tools might miss. Focus on:
- Input validation issues
- Authentication/authorization problems
- Data exposure risks
- Code injection possibilities
- Business logic flaws

Return findings in this format:
{
  "issues": [
    {
      "line": 42,
      "description": "SQL injection vulnerability",
      "severity": "HIGH",
      "explanation": "User input is directly concatenated into SQL query",
      "fix": "Use parameterized queries"
    }
  ]
}
`;

  try {
    const response = await callLmStudio(prompt);
    const analysis = JSON.parse(response);
    const issues = (analysis.issues || []).map((issue: any) => ({
        tool: 'AI Analysis',
        path: filePath,
        start: { line: issue.line },
        extra: { message: issue.description },
        severity: issue.severity,
        explanation: issue.explanation,
        fix: issue.fix
    }));
    
    if (issues.length > 0) {
      console.log(`AI Analysis: Found ${issues.length} issues in ${path.basename(filePath)}`);
    }
    
    return { issues };
  } catch (e) {
    console.log(`AI Analysis failed for ${path.basename(filePath)}:`, e instanceof Error ? e.message : String(e));
    return { issues: [] };
  }
}

async function analyzeLargeFileInChunks(code: string, filePath: string, context: vscode.ExtensionContext): Promise<any> {
  const lines = code.split('\n');
  const chunkSize = 500; // Analyze 500 lines at a time
  const allIssues = [];
  
  for (let i = 0; i < lines.length; i += chunkSize) {
    const chunk = lines.slice(i, i + chunkSize).join('\n');
    const startLine = i + 1;
    
    const prompt = `
Analyze this code chunk for security vulnerabilities:

File: ${filePath} (lines ${startLine}-${Math.min(i + chunkSize, lines.length)})
Code:
\`\`\`
${chunk}
\`\`\`

Please identify any security issues. Return findings in this format:
{
  "issues": [
    {
      "line": 42,
      "description": "Security issue description",
      "severity": "HIGH",
      "explanation": "Detailed explanation",
      "fix": "Recommended fix"
    }
  ]
}
`;

    try {
      const response = await callLmStudio(prompt);
      const analysis = JSON.parse(response);
      const issues = (analysis.issues || []).map((issue: any) => ({
        tool: 'AI Analysis (Chunk)',
        path: filePath,
        start: { line: issue.line + startLine - 1 }, // Adjust line number for chunk offset
        extra: { message: issue.description },
        severity: issue.severity,
        explanation: issue.explanation,
        fix: issue.fix
      }));
      
      if (issues.length > 0) {
        allIssues.push(...issues);
        console.log(`AI Chunk Analysis: Found ${issues.length} issues in ${path.basename(filePath)} lines ${startLine}-${Math.min(i + chunkSize, lines.length)}`);
      }
    } catch (e) {
      console.log(`AI Chunk Analysis failed for ${path.basename(filePath)} lines ${startLine}-${Math.min(i + chunkSize, lines.length)}:`, e instanceof Error ? e.message : String(e));
    }
  }
  
  return { issues: allIssues };
}

function prioritizeAndDeduplicate(results: any[]): any[] {
  // Remove duplicates and prioritize by severity
  const unique = new Map();
  
  for (const result of results) {
    // More specific deduplication key that includes tool and message
    const key = `${result.path}:${result.start?.line || result.line_number}:${result.tool}:${result.extra?.message || result.description || ''}`;
    if (!unique.has(key) || getSeverityScore(result) > getSeverityScore(unique.get(key))) {
      unique.set(key, result);
    }
  }
  
  const deduplicated = Array.from(unique.values()).sort((a, b) => 
    getSeverityScore(b) - getSeverityScore(a)
  );
  
  console.log(`Deduplication: ${results.length} results -> ${deduplicated.length} unique results`);
  return deduplicated;
}

function getSeverityScore(result: any): number {
  const severity = (result.severity?.toUpperCase() || 'INFO') as string;
  const scores: { [key: string]: number } = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'WARNING': 1, 'INFO': 0 };
  return scores[severity] || 0;
}

function getCodeContext(filePath: string, lineNumber: number): string {
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    const lines = code.split('\n');
    const start = Math.max(0, lineNumber - 3);
    const end = Math.min(lines.length, lineNumber + 2);
    return lines.slice(start, end).join('\n');
  } catch (e) {
    return 'Unable to read file context';
  }
}

// Enhanced AI prompts with code context
async function callLmStudioEnhanced(prompt: string, codeContext?: string): Promise<string> {
  const enhancedPrompt = codeContext ? 
    `${prompt}\n\nCode Context:\n\`\`\`\n${codeContext}\n\`\`\`` : 
    prompt;
  
  return callLmStudio(enhancedPrompt);
}

// AI Memory and Pattern Recognition System
interface DeveloperProfile {
  id: string;
  commonMistakes: string[];
  preferredLanguages: string[];
  securityBlindSpots: string[];
  learningProgress: { [key: string]: number };
  conversationHistory: ConversationEntry[];
  codePatterns: CodePattern[];
  lastUpdated: number;
}

interface ConversationEntry {
  timestamp: number;
  vulnerability: string;
  question: string;
  aiResponse: string;
  developerFeedback?: 'helpful' | 'not_helpful' | 'implemented';
}

interface CodePattern {
  pattern: string;
  frequency: number;
  riskLevel: 'low' | 'medium' | 'high';
  lastSeen: number;
  suggestedImprovements: string[];
}

const MEMORY_KEY = 'ciphermate.ai_memory';
let currentDeveloperProfile: DeveloperProfile | null = null;

function generateDeveloperId(): string {
  // Generate a unique ID based on workspace and machine
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  const machineId = require('os').hostname();
  return crypto.createHash('sha256').update(workspacePath + machineId).digest('hex').substring(0, 16);
}

function loadDeveloperProfile(context: vscode.ExtensionContext): DeveloperProfile {
  const encrypted = context.globalState.get(MEMORY_KEY, '');
  if (!encrypted) {
    return createNewDeveloperProfile();
  }
  
  try {
    const profile = decryptData(encrypted, context);
    return profile || createNewDeveloperProfile();
  } catch (e) {
    console.error('Failed to load developer profile:', e);
    return createNewDeveloperProfile();
  }
}

function createNewDeveloperProfile(): DeveloperProfile {
  return {
    id: generateDeveloperId(),
    commonMistakes: [],
    preferredLanguages: [],
    securityBlindSpots: [],
    learningProgress: {},
    conversationHistory: [],
    codePatterns: [],
    lastUpdated: Date.now()
  };
}

function saveDeveloperProfile(profile: DeveloperProfile, context: vscode.ExtensionContext) {
  const encrypted = encryptData(profile, context);
  context.globalState.update(MEMORY_KEY, encrypted);
}

function updateDeveloperProfile(updates: Partial<DeveloperProfile>, context: vscode.ExtensionContext) {
  if (!currentDeveloperProfile) {
    currentDeveloperProfile = loadDeveloperProfile(context);
  }
  
  currentDeveloperProfile = { ...currentDeveloperProfile, ...updates, lastUpdated: Date.now() };
  saveDeveloperProfile(currentDeveloperProfile, context);
}

function addConversationEntry(entry: ConversationEntry, context: vscode.ExtensionContext) {
  if (!currentDeveloperProfile) {
    currentDeveloperProfile = loadDeveloperProfile(context);
  }
  
  currentDeveloperProfile.conversationHistory.push(entry);
  
  // Keep only last 50 conversations to prevent memory bloat
  if (currentDeveloperProfile.conversationHistory.length > 50) {
    currentDeveloperProfile.conversationHistory = currentDeveloperProfile.conversationHistory.slice(-50);
  }
  
  updateDeveloperProfile(currentDeveloperProfile, context);
}

function analyzeCodePatterns(code: string, filePath: string): CodePattern[] {
  const patterns: CodePattern[] = [];
  
  // Analyze common insecure patterns
  const insecurePatterns = [
    { pattern: 'eval\\(', risk: 'high' as const, improvement: 'Use safer alternatives like Function constructor or JSON.parse' },
    { pattern: 'innerHTML\\s*=', risk: 'high' as const, improvement: 'Use textContent or createElement for DOM manipulation' },
    { pattern: 'document\\.write', risk: 'high' as const, improvement: 'Use DOM manipulation methods instead' },
    { pattern: 'setTimeout\\(.*\\)', risk: 'medium' as const, improvement: 'Validate input before using in setTimeout' },
    { pattern: 'localStorage\\[.*\\]\\s*=', risk: 'medium' as const, improvement: 'Validate and sanitize data before storing' },
    { pattern: '\\$\\{.*\\}', risk: 'medium' as const, improvement: 'Use template literals safely, avoid user input' },
    { pattern: 'password\\s*=\\s*[\'"][^\'"]+[\'"]', risk: 'high' as const, improvement: 'Use environment variables for sensitive data' },
    { pattern: 'api_key\\s*=\\s*[\'"][^\'"]+[\'"]', risk: 'high' as const, improvement: 'Use environment variables for API keys' }
  ];
  
  for (const { pattern, risk, improvement } of insecurePatterns) {
    const regex = new RegExp(pattern, 'gi');
    const matches = code.match(regex);
    if (matches) {
      patterns.push({
        pattern: pattern,
        frequency: matches.length,
        riskLevel: risk,
        lastSeen: Date.now(),
        suggestedImprovements: [improvement]
      });
    }
  }
  
  return patterns;
}

function updateLearningProgress(vulnerabilityType: string, context: vscode.ExtensionContext) {
  if (!currentDeveloperProfile) {
    currentDeveloperProfile = loadDeveloperProfile(context);
  }
  
  const currentProgress = currentDeveloperProfile.learningProgress[vulnerabilityType] || 0;
  currentDeveloperProfile.learningProgress[vulnerabilityType] = Math.min(currentProgress + 0.1, 1.0);
  
  updateDeveloperProfile(currentDeveloperProfile, context);
}

function getPersonalizedPrompt(basePrompt: string, vulnerabilityType: string, context: vscode.ExtensionContext): string {
  if (!currentDeveloperProfile) {
    currentDeveloperProfile = loadDeveloperProfile(context);
  }
  
  const progress = currentDeveloperProfile.learningProgress[vulnerabilityType] || 0;
  const commonMistakes = currentDeveloperProfile.commonMistakes;
  
  let personalizedPrompt = basePrompt;
  
  // Add personalized context based on learning progress
  if (progress < 0.3) {
    personalizedPrompt += '\n\nNote: This developer is new to this type of vulnerability. Provide detailed explanations and multiple examples.';
  } else if (progress < 0.7) {
    personalizedPrompt += '\n\nNote: This developer has some experience. Focus on best practices and advanced concepts.';
  } else {
    personalizedPrompt += '\n\nNote: This developer is experienced. Focus on edge cases and advanced security patterns.';
  }
  
  // Add context about common mistakes
  if (commonMistakes.length > 0) {
    personalizedPrompt += `\n\nThis developer commonly struggles with: ${commonMistakes.join(', ')}. Address these patterns in your response.`;
  }
  
  // Add conversation history context
  const recentConversations = currentDeveloperProfile.conversationHistory
    .filter(entry => entry.vulnerability.includes(vulnerabilityType))
    .slice(-3);
  
  if (recentConversations.length > 0) {
    personalizedPrompt += '\n\nRecent related conversations:';
    for (const conv of recentConversations) {
      personalizedPrompt += `\n- Q: ${conv.question}\n- A: ${conv.aiResponse.substring(0, 100)}...`;
    }
  }
  
  return personalizedPrompt;
}

function detectVulnerabilityType(issue: any): string {
  const description = (issue.extra?.message || issue.issue_text || issue.check_id || '').toLowerCase();
  
  if (description.includes('sql') || description.includes('injection')) {return 'sql_injection';}
  if (description.includes('xss') || description.includes('cross-site')) {return 'xss';}
  if (description.includes('authentication') || description.includes('auth')) {return 'authentication';}
  if (description.includes('authorization') || description.includes('permission')) {return 'authorization';}
  if (description.includes('input') || description.includes('validation')) {return 'input_validation';}
  if (description.includes('password') || description.includes('credential')) {return 'credential_management';}
  if (description.includes('encryption') || description.includes('crypto')) {return 'encryption';}
  if (description.includes('session') || description.includes('token')) {return 'session_management';}
  
  return 'general_security';
}

// Team Collaboration System
interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'developer' | 'team_lead' | 'security_lead';
  securityLevel: 'beginner' | 'intermediate' | 'advanced';
  isActive: boolean;
  lastActivity: number;
  learningProgress: { [key: string]: number };
  vulnerabilitiesFound: number;
  vulnerabilitiesFixed: number;
}

interface TeamLead {
  id: string;
  name: string;
  email: string;
  permissions: TeamLeadPermissions;
  teamMembers: TeamMember[];
  reportingSettings: ReportingSettings;
  securityPolicies: SecurityPolicy[];
}

interface TeamLeadPermissions {
  canManageMembers: boolean;
  canViewReports: boolean;
  canEnforcePolicies: boolean;
  canOverrideSettings: boolean;
  canAccessAnalytics: boolean;
  canManageIntegrations: boolean;
}

interface ReportingSettings {
  enabled: boolean;
  reportThreshold: 'critical' | 'high' | 'medium' | 'low' | 'all';
  reportFrequency: 'real-time' | 'daily' | 'weekly' | 'monthly';
  reportTo: string[]; // Team lead emails
  includePatterns: boolean;
  includeLearningProgress: boolean;
  includeTeamAnalytics: boolean;
}

interface SecurityPolicy {
  id: string;
  name: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  enabled: boolean;
  action: 'block' | 'warn' | 'report';
  conditions: PolicyCondition[];
}

interface PolicyCondition {
  type: 'vulnerability_type' | 'code_pattern' | 'file_type' | 'severity';
  value: string;
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than';
}

interface TeamVulnerabilityReport {
  id: string;
  timestamp: number;
  teamMemberId: string;
  teamMemberName: string;
  vulnerability: any;
  status: 'new' | 'acknowledged' | 'in_progress' | 'fixed' | 'ignored';
  assignedTo?: string;
  notes?: string;
  fixSuggestion?: string;
}

const TEAM_DATA_KEY = 'ciphermate.team_data';
const TEAM_REPORTS_KEY = 'ciphermate.team_reports';
let currentTeamLead: TeamLead | null = null;
let teamVulnerabilityReports: TeamVulnerabilityReport[] = [];

function loadTeamData(context: vscode.ExtensionContext): TeamLead | null {
  const encrypted = context.globalState.get(TEAM_DATA_KEY, '');
  if (!encrypted) {return null;}
  
  try {
    return decryptData(encrypted, context);
  } catch (e) {
    console.error('Failed to load team data:', e);
    return null;
  }
}

function saveTeamData(teamData: TeamLead, context: vscode.ExtensionContext) {
  const encrypted = encryptData(teamData, context);
  context.globalState.update(TEAM_DATA_KEY, encrypted);
}

function loadTeamReports(context: vscode.ExtensionContext): TeamVulnerabilityReport[] {
  const encrypted = context.globalState.get(TEAM_REPORTS_KEY, '');
  if (!encrypted) {return [];}
  
  try {
    return decryptData(encrypted, context);
  } catch (e) {
    console.error('Failed to load team reports:', e);
    return [];
  }
}

function saveTeamReports(reports: TeamVulnerabilityReport[], context: vscode.ExtensionContext) {
  const encrypted = encryptData(reports, context);
  context.globalState.update(TEAM_REPORTS_KEY, encrypted);
}

function createTeamVulnerabilityReport(
  teamMemberId: string,
  teamMemberName: string,
  vulnerability: any,
  context: vscode.ExtensionContext
): TeamVulnerabilityReport {
  const report: TeamVulnerabilityReport = {
    id: crypto.randomBytes(16).toString('hex'),
    timestamp: Date.now(),
    teamMemberId,
    teamMemberName,
    vulnerability,
    status: 'new'
  };
  
  teamVulnerabilityReports.push(report);
  saveTeamReports(teamVulnerabilityReports, context);
  
  return report;
}

function shouldReportVulnerability(vulnerability: any, settings: ReportingSettings): boolean {
  if (!settings.enabled) {return false;}
  
  const severity = (vulnerability.severity?.toUpperCase() || 'INFO') as string;
  const severityLevels: { [key: string]: number } = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1, 'INFO': 0 };
  const vulnerabilityLevel = severityLevels[severity] || 0;
  
  const thresholdLevels: { [key: string]: number } = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1, 'all': 0 };
  const threshold = thresholdLevels[settings.reportThreshold] || 0;
  
  return vulnerabilityLevel >= threshold;
}

function sendTeamReport(report: TeamVulnerabilityReport, settings: ReportingSettings) {
  if (!settings.reportTo || settings.reportTo.length === 0) {return;}
  
  const reportMessage = `
CipherMate Team Security Alert

Team Member: ${report.teamMemberName}
Vulnerability: ${report.vulnerability.extra?.message || report.vulnerability.issue_text}
File: ${report.vulnerability.path}:${report.vulnerability.start?.line || report.vulnerability.line_number}
Severity: ${report.vulnerability.severity}
Tool: ${report.vulnerability.tool}

Status: ${report.status}
Timestamp: ${new Date(report.timestamp).toLocaleString()}

This vulnerability has been detected and requires attention.
  `.trim();
  
  // In a real implementation, this would send emails/notifications
  console.log('Team Report Sent:', reportMessage);
  showNotification(NotificationType.VULNERABILITY, `Team report sent for ${report.teamMemberName}'s vulnerability`);
}

function updateTeamMemberProgress(teamMemberId: string, vulnerabilityType: string, context: vscode.ExtensionContext) {
  if (!currentTeamLead) {return;}
  
  const member = currentTeamLead.teamMembers.find(m => m.id === teamMemberId);
  if (!member) {return;}
  
  member.vulnerabilitiesFound++;
  member.lastActivity = Date.now();
  
  // Update learning progress
  const currentProgress = member.learningProgress[vulnerabilityType] || 0;
  member.learningProgress[vulnerabilityType] = Math.min(currentProgress + 0.05, 1.0);
  
  saveTeamData(currentTeamLead, context);
}

export function activate(context: vscode.ExtensionContext) {
  // Initialize Enterprise Infrastructure
  const logger = new EnterpriseLogger();
  const config = new EnterpriseConfiguration();
  const performanceMonitor = new PerformanceMonitor(logger);
  const errorHandler = new ErrorHandler(logger, config);

  // Register core services in container
  container.register('logger', logger);
  container.register('config', config);
  container.register('performanceMonitor', performanceMonitor);
  container.register('errorHandler', errorHandler);

  // Register business services
  container.register('scanningService', new EnterpriseScanningService(logger, config, performanceMonitor));
  container.register('authenticationService', new EnterpriseAuthenticationService(logger, config, performanceMonitor));

  // Initialize logging
  logger.info('CipherMate Enterprise Edition starting up', {
    version: '1.0.2',
    nodeVersion: process.version,
    platform: process.platform
  });

  // Validate configuration
  if (!config.validate()) {
    logger.error('Configuration validation failed');
    vscode.window.showErrorMessage('CipherMate configuration is invalid. Please check settings.');
    return;
  }

  // Initialize encryption key
  encryptionKey = generateEncryptionKey();

  // Initialize AI Agent Core - The heart of CipherMate
  // AgenticCore is the true autonomous agent with tool calling
  // AIAgentCore is kept as fallback for simple commands
  const aiAgent = new AIAgentCore(context);
  const chatInterface = new ChatInterface(context, aiAgent);

  // Primary command: Open CipherMate Chat (AI-first interface)
  let chatDisposable = vscode.commands.registerCommand('ciphermate.chat', () => {
    chatInterface.show();
  });

  // Also register as the main entry point - auto-open welcome screen
  let mainDisposable = vscode.commands.registerCommand('ciphermate', () => {
    chatInterface.show();
  });

  // Register view provider for activity bar
  class WelcomeTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
      this._onDidChangeTreeData.fire();
    }

    getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
      if (element) {
        return [];
      }
      return [
        {
          label: 'Get Started',
          command: {
            command: 'ciphermate',
            title: 'Open CipherMate'
          },
          iconPath: new vscode.ThemeIcon('rocket'),
          tooltip: 'Open CipherMate welcome screen'
        },
        {
          label: 'Configure Settings',
          command: {
            command: 'ciphermate.advancedSettings',
            title: 'Open Settings'
          },
          iconPath: new vscode.ThemeIcon('settings-gear'),
          tooltip: 'Configure API keys and settings'
        },
        {
          label: 'View Results',
          command: {
            command: 'ciphermate.showResults',
            title: 'Show Results'
          },
          iconPath: new vscode.ThemeIcon('list-unordered'),
          tooltip: 'View security scan results'
        }
      ];
    }
    
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
      return element;
    }
  }

  class FindingsTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
      this._onDidChangeTreeData.fire();
    }

    getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
      // Return empty array for now - can be populated with actual findings later
      return [];
    }
    
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
      return element || new vscode.TreeItem('No findings yet', vscode.TreeItemCollapsibleState.None);
    }
  }

  const welcomeTreeProvider = new WelcomeTreeDataProvider();
  const findingsTreeProvider = new FindingsTreeDataProvider();
  
  // Register TreeDataProviders and add to subscriptions
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('ciphermateWelcome', welcomeTreeProvider),
    vscode.window.registerTreeDataProvider('ciphermateFindings', findingsTreeProvider)
  );
  
  // When activity bar icon is clicked, open welcome screen
  context.subscriptions.push(
    vscode.commands.registerCommand('ciphermate.openWelcome', () => {
      chatInterface.show();
    })
  );

  // Auto-open welcome screen when extension activates (first time)
  const hasSeenWelcome = context.globalState.get('ciphermate.hasSeenWelcome', false);
  if (!hasSeenWelcome) {
    // Show welcome screen after a short delay
    setTimeout(() => {
      chatInterface.show();
      vscode.window.showInformationMessage('Welcome to CipherMate! Click the CipherMate icon in the sidebar to get started.');
      context.globalState.update('ciphermate.hasSeenWelcome', true);
    }, 1500);
  }

  // Register command for welcome view click
  context.subscriptions.push(
    vscode.commands.registerCommand('ciphermate.openFromSidebar', () => {
      chatInterface.show();
    })
  );
  
  // Load user profile and vulnerability history with error handling
  loadUserProfile(context).then(user => {
    currentUser = user;
    if (user) {
      logger.info('User profile loaded successfully', { userId: user.id });
      logger.info('User session initialized', { userId: user.id, username: user.username });
    }
  }).catch(error => {
    errorHandler.handleError(error, 'loadUserProfile');
  });
  
  loadVulnerabilityHistory(context).then(history => {
    vulnerabilityHistory = history;
    logger.info('Vulnerability history loaded', { historyCount: history.length });
  }).catch(error => {
    errorHandler.handleError(error, 'loadVulnerabilityHistory');
  });

  // Initialize developer profile
  currentDeveloperProfile = loadDeveloperProfile(context);
  logger.info('Developer profile initialized', { learningAreas: Object.keys(currentDeveloperProfile.learningProgress).length });

  // Initialize team data
  currentTeamLead = loadTeamData(context);
  teamVulnerabilityReports = loadTeamReports(context);
  
  if (currentTeamLead) {
    logger.info('Team collaboration mode initialized', { teamMembers: currentTeamLead.teamMembers.length });
  }

  // Test encrypted storage on startup
  testEncryptedStorage(context);

  // Load previous encrypted results on startup
  const savedResults = loadEncryptedData(context);
  if (savedResults) {
    lastScanResults = savedResults;
      logger.info('Previous scan results restored', { resultCount: savedResults.length });
  }

  // On save: basic eval detection + scan interval logic
  vscode.workspace.onDidSaveTextDocument((document) => {
    const text = document.getText();
    if (text.includes("eval(")) {
      showNotification(NotificationType.VULNERABILITY, "Code injection risk: eval() usage detected");
    }
    const settings = getSettings(context);
    if (settings.scanOnSave) {
      saveCounter++;
      if (saveCounter >= settings.scanInterval) {
        vscode.commands.executeCommand('ciphermate.scan');
        saveCounter = 0;
      }
    }
  });

  // Command: Intelligent Repository Scan
  let intelligentScanDisposable = vscode.commands.registerCommand('ciphermate.intelligentScan', async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      showNotification(NotificationType.ERROR, 'No workspace folder open.');
      return;
    }
    
    if (isScanning) {
      vscode.window.showWarningMessage('A scan is already in progress. Use "CipherMate: Cancel Scan" to stop it first.');
      return;
    }
    
    const workspacePath = workspaceFolders[0].uri.fsPath;
    try {
      isScanning = true;
      logger.info('Repository scan initiated', { workspacePath });
      
      lastScanResults = await intelligentRepositoryScan(workspacePath, context);
      saveEncryptedData(lastScanResults, context);
      await saveVulnerabilityHistory(lastScanResults, 'Intelligent Scan', context);
      postResultsToWebview();
      
      if (lastScanResults.length > 0) {
        const criticalCount = lastScanResults.filter(r => r.severity === 'CRITICAL' || r.severity === 'ERROR').length;
      const highCount = lastScanResults.filter(r => r.severity === 'HIGH' || r.severity === 'WARNING').length;
      showNotification(NotificationType.VULNERABILITY, `Repository scan: ${lastScanResults.length} issues detected (${criticalCount} critical, ${highCount} high severity)`);
      } else {
        logger.info('Repository scan completed', { issuesFound: 0 });
      }
    } catch (e) {
      showNotification(NotificationType.ERROR, 'Intelligent scan failed', String(e));
    } finally {
      isScanning = false;
      currentScanProcess = null;
    }
  });

  // Command: Scan (generic) - now uses intelligent scanning
  let scanDisposable = vscode.commands.registerCommand('ciphermate.scan', async () => {
    // Authentication is optional for development
    // if (!currentUser) {
    //   vscode.window.showWarningMessage('Please log in to use CipherMate features');
    //   return;
    // }
    logger.info('Intelligent repository scan initiated');
    await vscode.commands.executeCommand('ciphermate.intelligentScan');
  });

  // Command: Semgrep scan - enhanced with AI analysis
  let semgrepDisposable = vscode.commands.registerCommand('ciphermate.scanSemgrep', async () => {
    showNotification(NotificationType.INFO, 'Running Semgrep with AI enhancement...');
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      showNotification(NotificationType.ERROR, 'No workspace folder open.');
      return;
    }
    const workspacePath = workspaceFolders[0].uri.fsPath;
    showNotification(NotificationType.INFO, `Scanning directory: ${workspacePath}`);
    
    try {
      const semgrepResults = await runSemgrepScan(workspacePath);
      console.log('Semgrep results received:', semgrepResults.length, 'items');
      const aiResults = await runAIPatternAnalysis(workspacePath, context);
      console.log('AI results received:', aiResults.length, 'items');
      
      lastScanResults = prioritizeAndDeduplicate([...semgrepResults, ...aiResults]);
      console.log('Final results after deduplication:', lastScanResults.length, 'items');
      saveEncryptedData(lastScanResults, context);
      postResultsToWebview();
      
      if (lastScanResults.length > 0) {
        const criticalCount = lastScanResults.filter(r => r.severity === 'CRITICAL' || r.severity === 'ERROR').length;
      showNotification(NotificationType.VULNERABILITY, `Semgrep analysis: ${lastScanResults.length} security issues detected (${criticalCount} critical)`);
      } else {
          logger.info('Semgrep scan completed', { issuesFound: 0 });
      }
    } catch (e) {
      console.error('Enhanced Semgrep scan error:', e);
      showNotification(NotificationType.ERROR, 'Enhanced Semgrep scan failed', String(e));
    }
  });

  // Command: Bandit scan
  let banditDisposable = vscode.commands.registerCommand('ciphermate.scanBandit', () => {
    showNotification(NotificationType.INFO, 'Running Bandit scan...');
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      showNotification(NotificationType.ERROR, 'No workspace folder open.');
      return;
    }
    const workspacePath = workspaceFolders[0].uri.fsPath;
    exec('bandit -r -f json .', { cwd: workspacePath }, (error, stdout, stderr) => {
      if (error) {
        if (stderr.includes('command not found') || error.message.includes('not found')) {
          showNotification(NotificationType.ERROR, 'Bandit CLI is not installed. Please install it with pip install bandit.');
        } else if (stderr.includes('No files identified to scan') || 
                   stderr.includes('profile include tests: None') ||
                   error.code === 1) {
          logger.info('Bandit scan: No Python files detected in repository');
          lastScanResults = [];
        } else {
          showNotification(NotificationType.ERROR, `Bandit error: ${stderr || error.message}`);
        }
        return;
      }
      try {
        const result = JSON.parse(stdout);
        lastScanResults = (result.results || []).map((r: any) => ({
          tool: 'Bandit',
          ...r
        }));
        // Save encrypted results
        saveEncryptedData(lastScanResults, context);
        postResultsToWebview();
        
        if (lastScanResults.length > 0) {
          const criticalCount = lastScanResults.filter((r: any) => r.severity === 'HIGH' || r.severity === 'CRITICAL').length;
          showNotification(NotificationType.VULNERABILITY, `Bandit analysis: ${lastScanResults.length} Python security issues detected (${criticalCount} high/critical)`);
        } else {
          logger.info('Bandit scan completed', { issuesFound: 0 });
        }
      } catch (e) {
        // Check if it's just informational output that can't be parsed as JSON
        if (stdout.includes('profile include tests: None') || 
            stdout.includes('No files identified to scan')) {
          logger.info('Bandit scan: No Python files detected in repository');
          lastScanResults = [];
        } else {
        showNotification(NotificationType.ERROR, 'Failed to parse Bandit output.');
        }
      }
    });
  });

  // Command: Clear encrypted data
  let clearDataDisposable = vscode.commands.registerCommand('ciphermate.clearData', () => {
    context.globalState.update(ENCRYPTED_DATA_KEY, '');
    lastScanResults = [];
    postResultsToWebview();
    showNotification(NotificationType.INFO, 'Encrypted data cleared successfully.');
  });

  // Command: Test encrypted storage
  let testStorageDisposable = vscode.commands.registerCommand('ciphermate.testStorage', () => {
    const success = testEncryptedStorage(context);
    if (success) {
      showNotification(NotificationType.INFO, 'Encrypted storage is working correctly');
    }
  });

  // Command: Settings (webview)
  let settingsDisposable = vscode.commands.registerCommand('ciphermate.settings', () => {
    const panel = vscode.window.createWebviewPanel(
      'ciphermateSettings',
      'CipherMate Settings',
      vscode.ViewColumn.One,
      {}
    );
    const settings = getSettings(context);
    panel.webview.html = getSettingsHtml(settings);
    panel.webview.onDidReceiveMessage((message) => {
      if (message.command === 'saveSettings') {
        updateSettings(context, message.settings);
        vscode.window.showInformationMessage('CipherMate settings saved!');
      }
    });
  });

  // Command: Advanced Settings (sidebar-based like Kilo Code)
  let advancedSettingsDisposable = vscode.commands.registerCommand('ciphermate.advancedSettings', () => {
    const panel = vscode.window.createWebviewPanel(
      'ciphermateAdvancedSettings',
      'CipherMate Settings',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri]
      }
    );
    const settings = getSettings(context);
    panel.webview.html = getSidebarSettingsHtml(settings, panel, context);
    panel.webview.onDidReceiveMessage((message) => {
      if (message.command === 'saveSettings') {
        updateSettings(context, message.settings);
        panel.webview.postMessage({ command: 'settingsSaved' });
      } else if (message.command === 'testAIConnection') {
        testAIConnection().then(result => {
          panel.webview.postMessage({ 
            command: 'aiConnectionTest', 
            success: result.success, 
            error: result.error 
          });
        });
      } else if (message.command === 'switchSection') {
        // Update active section
        panel.webview.postMessage({ 
          command: 'sectionSwitched', 
          section: message.section 
        });
      }
    });
  });

  // Command: Home Dashboard (main navigation hub)
  let homeDisposable = vscode.commands.registerCommand('ciphermate.home', () => {
    const panel = vscode.window.createWebviewPanel(
      'ciphermateHome',
      'CipherMate Home',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );
    const settings = getSettings(context);
    // Ensure lastScanResults is always an array
    const safeScanResults = Array.isArray(lastScanResults) ? lastScanResults : [];
    panel.webview.html = getHomeDashboardHtml(settings, safeScanResults, panel, context);
    panel.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case 'navigateTo':
          // Navigate to different panels
          vscode.commands.executeCommand(message.target);
          break;
        case 'startScan':
          vscode.commands.executeCommand('ciphermate.scan');
          break;
        case 'showResults':
          vscode.commands.executeCommand('ciphermate.showResults');
          break;
        case 'openSettings':
          vscode.commands.executeCommand('ciphermate.advancedSettings');
          break;
        case 'openTeamDashboard':
          vscode.commands.executeCommand('ciphermate.teamDashboard');
          break;
        case 'openProfile':
          vscode.commands.executeCommand('ciphermate.showProfile');
          break;
        case 'clearCache':
          vscode.commands.executeCommand('ciphermate.clearCache');
          break;
        case 'testAI':
          testAIConnection().then(result => {
            panel.webview.postMessage({ 
              command: 'aiTestResult', 
              success: result.success, 
              error: result.error 
            });
          });
          break;
        case 'refreshDashboard':
          // Refresh the dashboard with latest data
          const updatedSettings = getSettings(context);
          const updatedScanResults = Array.isArray(lastScanResults) ? lastScanResults : [];
          panel.webview.html = getHomeDashboardHtml(updatedSettings, updatedScanResults, panel, context);
          break;
      }
    });
  });

  // Command: Show Results Panel (modern webview)
  let resultsDisposable = vscode.commands.registerCommand('ciphermate.showResults', () => {
    resultsPanel = vscode.window.createWebviewPanel(
      'ciphermateResults',
      'CipherMate Results',
      vscode.ViewColumn.One,
      { 
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );
    resultsPanel.webview.html = getResultsPanelHtml();
    resultsPanel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === 'refresh') {
        // Refresh the results by re-running the last scan or just updating the display
        postResultsToWebview();
        showNotification(NotificationType.INFO, 'Results refreshed');
      } else if (message.command === 'scanMe') {
        // Trigger a new scan
        vscode.commands.executeCommand('ciphermate.scan');
      } else if (message.command === 'exportResults') {
        // Export current results
        vscode.commands.executeCommand('ciphermate.exportResults');
      } else if (message.command === 'openSettings') {
        // Open settings
        vscode.commands.executeCommand('ciphermate.settings');
      } else if (message.command === 'explainVulnerability') {
        const idx = message.index;
        const issue = lastScanResults[idx];
        if (!issue) {return;}
        
        // Get code context for better AI analysis
        const codeContext = getCodeContext(issue.path, issue.start?.line || issue.line_number || 0);
        
        // Detect vulnerability type for personalized learning
        const vulnerabilityType = detectVulnerabilityType(issue);
        
        const explainPrompt = `
As a security expert, explain this vulnerability in detail:

Vulnerability: ${issue.extra?.message || issue.issue_text || issue.check_id || 'Security issue'}
File: ${issue.path || issue.filename}
Line: ${issue.start?.line || issue.line_number || 1}
Severity: ${issue.extra?.severity || issue.severity || 'Unknown'}
Type: ${vulnerabilityType}

Code Context:
${codeContext}

Please provide:
1. What this vulnerability is and why it's dangerous
2. How an attacker could exploit it
3. Real-world examples of similar attacks
4. Why this specific code pattern is problematic
5. Best practices to avoid this type of vulnerability

Keep the explanation clear and educational for developers.
        `;
        
        try {
          const response = await callLmStudio(explainPrompt);
          resultsPanel?.webview.postMessage({
            command: 'showExplanation',
            title: `Security Explanation - ${vulnerabilityType}`,
            text: response
          });
        } catch (error) {
          // Fallback to built-in explanations if AI is not available
          const fallbackExplanation = getFallbackExplanation(issue, vulnerabilityType);
          resultsPanel?.webview.postMessage({
            command: 'showExplanation',
            title: `Security Explanation - ${vulnerabilityType}`,
            text: `AI Explanation Unavailable\n\n${fallbackExplanation}\n\nNote: To get AI-powered explanations, please ensure LM Studio is running and configured in CipherMate settings.`
          });
        }
      } else if (message.command === 'fixIt' || message.command === 'explain') {
        const idx = message.index;
        const issue = lastScanResults[idx];
        if (!issue) {return;}
        
        // Get code context for better AI analysis
        const codeContext = getCodeContext(issue.path, issue.start?.line || issue.line_number || 0);
        
        // Detect vulnerability type for personalized learning
        const vulnerabilityType = detectVulnerabilityType(issue);
        
        let basePrompt = '';
        if (message.command === 'fixIt') {
          basePrompt = `
As a security expert, analyze this vulnerability and provide a detailed fix:

Vulnerability: ${issue.extra?.message || issue.issue_text || issue.check_id || 'Security issue'}
File: ${issue.path}:${issue.start?.line || issue.line_number}
Tool: ${issue.tool}
Severity: ${issue.severity}

Please provide:
1. A detailed explanation of why this is vulnerable
2. A complete code fix with secure alternatives
3. Additional security considerations
4. Best practices to prevent similar issues
`;
          logger.info('AI analysis initiated', { operation: 'vulnerability_fix', vulnerabilityType });
        } else {
          basePrompt = `
As a security expert, explain this vulnerability in detail:

Vulnerability: ${issue.extra?.message || issue.issue_text || issue.check_id || 'Security issue'}
File: ${issue.path}:${issue.start?.line || issue.line_number}
Tool: ${issue.tool}
Severity: ${issue.severity}

Please provide:
1. A detailed explanation of the vulnerability
2. The potential impact and risks
3. How attackers could exploit this
4. Why this is a security concern
5. Related security concepts
`;
          logger.info('AI analysis initiated', { operation: 'vulnerability_explanation', vulnerabilityType });
        }
        
        // Get personalized prompt based on developer's learning history
        const personalizedPrompt = getPersonalizedPrompt(basePrompt, vulnerabilityType, context);
        
        try {
          const response = await callLmStudioEnhanced(personalizedPrompt, codeContext);
          
          // Track conversation for memory
          addConversationEntry({
            timestamp: Date.now(),
            vulnerability: vulnerabilityType,
            question: message.command === 'fixIt' ? 'How to fix this vulnerability?' : 'Explain this vulnerability',
            aiResponse: response
          }, context);
          
          // Update learning progress
          updateLearningProgress(vulnerabilityType, context);
          
          resultsPanel?.webview.postMessage({ command: 'llmResponse', index: idx, action: message.command, response });
          
          if (message.command === 'fixIt') {
            showNotification(NotificationType.FIX, 'AI has generated a personalized fix for the vulnerability');
          } else {
            showNotification(NotificationType.SUGGESTION, 'AI has generated a personalized explanation for the vulnerability');
          }
        } catch (e) {
          const errorMsg = String(e);
          resultsPanel?.webview.postMessage({ command: 'llmResponse', index: idx, action: message.command, response: errorMsg });
          showNotification(NotificationType.ERROR, 'Failed to get AI response', errorMsg);
        }
      }
    });
    resultsPanel.onDidDispose(() => {
      resultsPanel = null;
    });
    // Send current results to the webview
    postResultsToWebview();
  });

  // Command: Scan Me (manual scan)
  let scanMeDisposable = vscode.commands.registerCommand('ciphermate.scanMe', () => {
    vscode.commands.executeCommand('ciphermate.scan');
  });

  // Command: Show Developer Profile
  let profileDisposable = vscode.commands.registerCommand('ciphermate.showProfile', () => {
    if (!currentDeveloperProfile) {
      currentDeveloperProfile = loadDeveloperProfile(context);
    }
    
    const progress = Object.entries(currentDeveloperProfile.learningProgress)
      .map(([area, level]) => `${area}: ${Math.round(level * 100)}%`)
      .join('\n');
    
    const commonMistakes = currentDeveloperProfile.commonMistakes.slice(0, 5).join(', ');
    
    vscode.window.showInformationMessage(
      `CipherMate Developer Profile\n\n` +
      `Learning Progress:\n${progress}\n\n` +
      `Common Patterns: ${commonMistakes || 'None detected yet'}\n\n` +
      `Conversations: ${currentDeveloperProfile.conversationHistory.length} tracked`
    );
  });

  // Command: Clear Memory
  let clearMemoryDisposable = vscode.commands.registerCommand('ciphermate.clearMemory', () => {
    context.globalState.update(MEMORY_KEY, '');
    currentDeveloperProfile = createNewDeveloperProfile();
    saveDeveloperProfile(currentDeveloperProfile, context);
    logger.info('Developer profile reset', { operation: 'clear_memory' });
  });

  // Command: Team Lead Dashboard
  let teamDashboardDisposable = vscode.commands.registerCommand('ciphermate.teamDashboard', () => {
    if (!currentTeamLead) {
      vscode.window.showErrorMessage('No team configuration found. Please set up team collaboration first.');
      return;
    }
    
    const teamLead = currentTeamLead; // Store in local variable after null check
    
    const panel = vscode.window.createWebviewPanel(
      'ciphermateTeamDashboard',
      'CipherMate Team Dashboard',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );
    
    panel.webview.html = getTeamDashboardHtml(teamLead!, teamVulnerabilityReports);
    
    panel.webview.onDidReceiveMessage((message) => {
      if (message.command === 'updateReportingSettings') {
        teamLead.reportingSettings = message.settings;
        saveTeamData(teamLead, context);
        showNotification(NotificationType.INFO, 'Team reporting settings updated');
      }
    });
  });

  // Command: Setup Team Collaboration
  let setupTeamDisposable = vscode.commands.registerCommand('ciphermate.setupTeam', () => {
    const panel = vscode.window.createWebviewPanel(
      'ciphermateTeamSetup',
      'CipherMate Team Setup',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );
    
    panel.webview.html = getTeamSetupHtml();
    
    panel.webview.onDidReceiveMessage((message) => {
      if (message.command === 'createTeam') {
        currentTeamLead = message.teamData;
        saveTeamData(currentTeamLead!, context);
        logger.info('Team collaboration configured', { teamLead: currentTeamLead!.name, memberCount: currentTeamLead!.teamMembers.length });
        panel.dispose();
      }
    });
  });

  // Command: View Team Reports
  let viewReportsDisposable = vscode.commands.registerCommand('ciphermate.viewReports', () => {
    if (!currentTeamLead) {
      vscode.window.showErrorMessage('No team configuration found.');
      return;
    }
    
    const recentReports = teamVulnerabilityReports
      .filter(r => r.status === 'new' || r.status === 'in_progress')
      .slice(0, 10);
    
    if (recentReports.length === 0) {
      vscode.window.showInformationMessage('No active vulnerability reports found.');
      return;
    }
    
    const reportSummary = recentReports.map(r => 
      `${r.teamMemberName}: ${r.vulnerability.extra?.message || r.vulnerability.issue_text} (${r.status})`
    ).join('\n');
    
    vscode.window.showInformationMessage(
      `Recent Team Vulnerability Reports:\n\n${reportSummary}`
    );
  });

  // Command: Intelligent RAG-Powered Security Scan
  let intelligentRAGScanDisposable = vscode.commands.registerCommand('ciphermate.intelligentRAGScan', async () => {
    logger.info('RAG-powered security analysis initiated');
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      showNotification(NotificationType.ERROR, 'No workspace folder open.');
      return;
    }
    const workspacePath = workspaceFolders[0].uri.fsPath;
    
    try {
      // Step 1: Index the repository with RAG engine
      showNotification(NotificationType.INFO, 'Indexing repository with RAG engine...');
      await ragEngine.indexRepository(workspacePath);
      
      // Step 2: Get all code chunks
      const allChunks = ragEngine.getAllChunks();
      console.log(`RAG Engine: Found ${allChunks.length} code chunks`);
      
      // Step 3: Analyze each chunk with Security Agent
      const allVulnerabilities: Vulnerability[] = [];
      let analyzedChunks = 0;
      
      for (const chunk of allChunks) {
        if (chunk.metadata.securityRelevant || chunk.type === 'function' || chunk.type === 'class') {
          try {
            // Get relevant context for this chunk
            const relevantChunks = await ragEngine.searchRelevantCode(
              `${chunk.metadata.language} ${chunk.type} security`, 5
            );
            const context = relevantChunks.map(r => r.chunk);
            
            // Analyze with Security Agent
            const analysis = await securityAgent.analyzeVulnerabilities(chunk.content, context);
            
            // Convert to our format
            const vulnerabilities = analysis.vulnerabilities.map(vuln => ({
              ...vuln,
              location: {
                file: chunk.filePath,
                line: vuln.location?.line || chunk.startLine,
                column: vuln.location?.column
              }
            }));
            
            allVulnerabilities.push(...vulnerabilities);
            analyzedChunks++;
            
            if (analyzedChunks % 10 === 0) {
              showNotification(NotificationType.INFO, `Analyzed ${analyzedChunks}/${allChunks.length} chunks...`);
            }
          } catch (e) {
            console.log(`Failed to analyze chunk ${chunk.id}:`, e);
          }
        }
      }
      
      // Step 4: Prioritize threats
      const prioritizedVulns = securityAgent.prioritizeThreats(allVulnerabilities);
      
      // Step 5: Generate patches for high-priority vulnerabilities
      const patches: SecurityPatch[] = [];
      for (const vuln of prioritizedVulns.slice(0, 5)) { // Top 5 vulnerabilities
        try {
          const relevantChunks = await ragEngine.searchRelevantCode(
            `${vuln.type} ${vuln.location.file}`, 3
          );
          const context = relevantChunks.map(r => r.chunk);
          
          const patch = await fixAgent.generatePatch(vuln, context);
          if (await fixAgent.validatePatch(patch)) {
            patches.push(patch);
          }
        } catch (e) {
          console.log(`Failed to generate patch for ${vuln.id}:`, e);
        }
      }
      
      // Step 6: Store results
      lastScanResults = prioritizedVulns.map(vuln => ({
        tool: 'RAG Security Agent',
        path: vuln.location.file,
        start: { line: vuln.location.line },
        extra: { 
          message: vuln.description,
          severity: vuln.severity,
          exploitability: vuln.exploitability,
          impact: vuln.impact,
          cwe: vuln.cwe,
          owasp: vuln.owasp
        },
        severity: vuln.severity,
        vulnerability: vuln,
        patches: patches.filter(p => p.vulnerabilityId === vuln.id)
      }));
      
      saveEncryptedData(lastScanResults, context);
      postResultsToWebview();
      
      showNotification(NotificationType.VULNERABILITY, 
        `RAG analysis complete: ${prioritizedVulns.length} vulnerabilities identified, ${patches.length} remediation patches generated`);
      
    } catch (e) {
      console.error('Intelligent RAG scan error:', e);
      showNotification(NotificationType.ERROR, 'Intelligent RAG scan failed', String(e));
    }
  });

  // Command: AI-Only Security Scan
  let aiOnlyScanDisposable = vscode.commands.registerCommand('ciphermate.aiOnlyScan', async () => {
    showNotification(NotificationType.INFO, 'Running AI-only security analysis...');
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      showNotification(NotificationType.ERROR, 'No workspace folder open.');
      return;
    }
    const workspacePath = workspaceFolders[0].uri.fsPath;
    
    try {
      const aiResults = await runAIPatternAnalysis(workspacePath, context);
      lastScanResults = aiResults;
      saveEncryptedData(lastScanResults, context);
      postResultsToWebview();
      
      if (lastScanResults.length > 0) {
        const criticalCount = lastScanResults.filter((r: any) => r.severity === 'CRITICAL' || r.severity === 'ERROR').length;
        showNotification(NotificationType.VULNERABILITY, `AI analysis: ${lastScanResults.length} security issues detected (${criticalCount} critical)`);
      } else {
        logger.info('AI analysis completed', { issuesFound: 0 });
      }
    } catch (e) {
      console.error('AI-only scan error:', e);
      showNotification(NotificationType.ERROR, 'AI-only scan failed', String(e));
    }
  });

  // Command: Switch AI Agent
  let switchAgentDisposable = vscode.commands.registerCommand('ciphermate.switchAgent', async () => {
    const config = vscode.workspace.getConfiguration('ciphermate');
    const currentUrl = config.get<string>('lmStudioUrl', 'http://localhost:1234/v1/chat/completions');
    
    const agentOptions = [
      { label: 'LM Studio (Local)', value: 'http://localhost:1234/v1/chat/completions' },
      { label: 'Ollama (Local)', value: 'http://localhost:11434/v1/chat/completions' },
      { label: 'Ollama (Remote VPS)', value: 'remote-ollama' },
      { label: 'Custom Endpoint', value: 'custom' }
    ];

    const selected = await vscode.window.showQuickPick(agentOptions, {
      placeHolder: 'Select AI Agent/Model'
    });

    if (selected) {
      if (selected.value === 'custom') {
        const customUrl = await vscode.window.showInputBox({
          prompt: 'Enter custom AI endpoint URL',
          value: currentUrl
        });
        if (customUrl) {
          await config.update('lmStudioUrl', customUrl, vscode.ConfigurationTarget.Global);
          await config.update('useCloudAI', false, vscode.ConfigurationTarget.Global);
          showNotification(NotificationType.INFO, `Switched to custom agent: ${customUrl}`);
        }
      } else if (selected.value === 'remote-ollama') {
        const serverUrl = await vscode.window.showInputBox({
          prompt: 'Enter your Ollama VPS server URL (e.g., http://your-server-ip:11434)',
          placeHolder: 'http://your-server-ip:11434',
          value: currentUrl.includes('localhost') ? '' : currentUrl.replace('/v1/chat/completions', '')
        });
        if (serverUrl) {
          const ollamaUrl = serverUrl.endsWith('/v1/chat/completions') 
            ? serverUrl 
            : `${serverUrl}/v1/chat/completions`;
          await config.update('lmStudioUrl', ollamaUrl, vscode.ConfigurationTarget.Global);
          await config.update('useCloudAI', false, vscode.ConfigurationTarget.Global);
          showNotification(NotificationType.INFO, `Switched to remote Ollama: ${ollamaUrl}`);
        }
      } else {
        await config.update('lmStudioUrl', selected.value, vscode.ConfigurationTarget.Global);
        await config.update('useCloudAI', false, vscode.ConfigurationTarget.Global);
        showNotification(NotificationType.INFO, `Switched to: ${selected.label}`);
      }
    }
  });

  // Command: Test AI Agent Connection
  let testAgentDisposable = vscode.commands.registerCommand('ciphermate.testAgent', async () => {
    showNotification(NotificationType.INFO, 'Testing AI agent connection...');
    
    try {
      const testPrompt = 'Respond with just the word "SUCCESS" if you can read this.';
      const response = await callLmStudio(testPrompt);
      
      if (response.includes('SUCCESS') || response.length > 0) {
        showNotification(NotificationType.INFO, `AI Agent is working! Response: ${response.substring(0, 100)}...`);
      } else {
        showNotification(NotificationType.WARNING, `AI Agent responded but may have issues: ${response}`);
      }
    } catch (e) {
      showNotification(NotificationType.ERROR, `AI Agent connection failed: ${e}`);
    }
  });

  // Command: Red Team Attack Simulation
  let redTeamDisposable = vscode.commands.registerCommand('ciphermate.redTeamAttack', async () => {
    showNotification(NotificationType.INFO, 'Running red team attack simulation...');
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      showNotification(NotificationType.ERROR, 'No workspace folder open.');
      return;
    }
    const workspacePath = workspaceFolders[0].uri.fsPath;
    
    try {
      // Run AI-powered red team analysis
      const files = await getCodeFiles(workspacePath);
      const attackVectors = [];
      
      for (const file of files.slice(0, 5)) { // Limit for performance
        try {
          const code = fs.readFileSync(file, 'utf8');
          const prompt = `
As a red team security expert, analyze this code for potential attack vectors:

File: ${file}
Code:
\`\`\`
${code.substring(0, 2000)}
\`\`\`

Identify specific attack vectors an attacker could use. Return in this format:
{
  "attacks": [
    {
      "line": 42,
      "attack_type": "SQL Injection",
      "description": "Direct SQL injection via user input",
      "exploitability": "HIGH",
      "impact": "Data breach, privilege escalation",
      "proof_of_concept": "'; DROP TABLE users; --"
    }
  ]
}
`;
          
          const response = await callLmStudio(prompt);
          const analysis = JSON.parse(response);
          if (analysis.attacks && analysis.attacks.length > 0) {
            attackVectors.push(...analysis.attacks.map((attack: any) => ({
              tool: 'Red Team AI',
              path: file,
              start: { line: attack.line },
              extra: { message: attack.description },
              severity: attack.exploitability,
              attack_type: attack.attack_type,
              impact: attack.impact,
              proof_of_concept: attack.proof_of_concept
            })));
          }
        } catch (e) {
          console.log(`Red team analysis failed for ${file}:`, e);
        }
      }
      
      lastScanResults = attackVectors;
      saveEncryptedData(lastScanResults, context);
      postResultsToWebview();
      
      if (lastScanResults.length > 0) {
        const criticalCount = lastScanResults.filter((r: any) => r.severity === 'CRITICAL' || r.severity === 'HIGH').length;
        showNotification(NotificationType.VULNERABILITY, `Red team analysis: ${lastScanResults.length} attack vectors identified (${criticalCount} critical/high)`);
      } else {
        logger.info('Red team analysis completed', { attackVectors: 0 });
      }
    } catch (e) {
      console.error('Red team analysis error:', e);
      showNotification(NotificationType.ERROR, 'Red team analysis failed', String(e));
    }
  });

  // Live Code Review - GitHub Copilot style
  let liveReviewDisposable = vscode.workspace.onDidChangeTextDocument(async (event) => {
    const config = vscode.workspace.getConfiguration('ciphermate');
    if (!config.get('enableLiveReview', true)) {return;}
    
    const document = event.document;
    if (!isCodeFile(document.fileName)) {return;}
    
    // Debounce rapid changes
    clearTimeout((liveReviewDisposable as any).timeout);
    (liveReviewDisposable as any).timeout = setTimeout(async () => {
      try {
        const code = document.getText();
        const lines = code.split('\n');
        const changedLines = event.contentChanges.map(change => 
          document.positionAt(change.rangeOffset).line + 1
        );
        
        // Analyze changed lines for security issues
        for (const lineNum of changedLines) {
          if (lineNum > lines.length) {continue;}
          
          const line = lines[lineNum - 1];
          if (line.trim().length === 0) {continue;}
          
          const prompt = `
Analyze this single line of code for security vulnerabilities:

Line ${lineNum}: ${line}

Return a security suggestion if there's an issue, or null if safe:
{
  "has_issue": true/false,
  "severity": "HIGH/MEDIUM/LOW",
  "issue_type": "SQL Injection",
  "suggestion": "Use parameterized queries instead of string concatenation",
  "secure_code": "const query = 'SELECT * FROM users WHERE id = ?'; db.query(query, [userId]);"
}
`;
          
          try {
            const response = await callLmStudio(prompt);
            const analysis = JSON.parse(response);
            
            if (analysis.has_issue) {
              const diagnostic = new vscode.Diagnostic(
                new vscode.Range(lineNum - 1, 0, lineNum - 1, line.length),
                `[SECURITY] ${analysis.issue_type}: ${analysis.suggestion}`,
                vscode.DiagnosticSeverity.Warning
              );
              diagnostic.source = 'CipherMate';
              diagnostic.code = analysis.issue_type;
              
              vscode.languages.createDiagnosticCollection('ciphermate').set(
                document.uri, 
                [diagnostic]
              );
              
              // Show quick suggestion
              vscode.window.showInformationMessage(
                `[SECURITY] ${analysis.issue_type}: ${analysis.suggestion}`,
                'View Fix', 'Dismiss'
              ).then(selection => {
                if (selection === 'View Fix') {
                  vscode.window.showInformationMessage(
                    `Secure Code:\n${analysis.secure_code}`
                  );
                }
              });
            }
          } catch (e) {
            // Ignore AI errors for live review
          }
        }
      } catch (e) {
        // Ignore live review errors
      }
    }, 1000); // 1 second debounce
  });

  // Register inline suggestion provider
  const inlineSuggestionDisposable = vscode.languages.registerInlineCompletionItemProvider(
    { scheme: 'file' },
    inlineSuggestionProvider
  );

  // Initialize active code reviewer
  activeCodeReviewer = new ActiveCodeReviewer();

  // Command: Apply Security Fix
  let applyFixDisposable = vscode.commands.registerCommand('ciphermate.applyFix', async (suggestion: InlineSuggestion) => {
    if (suggestion && suggestion.range) {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await editor.edit(editBuilder => {
          editBuilder.replace(suggestion.range, suggestion.text);
        });
        showNotification(NotificationType.FIX, 'Security fix applied successfully!');
      }
    }
  });

  // Command: Clear inline suggestion cache
  let clearCacheDisposable = vscode.commands.registerCommand('ciphermate.clearCache', () => {
    inlineSuggestionProvider.clearCache();
    showNotification(NotificationType.INFO, 'Inline suggestion cache cleared');
  });

  // Authentication commands
  let loginDisposable = vscode.commands.registerCommand('ciphermate.login', async () => {
    await authenticateWithProvider('github', context);
  });

  let loginGoogleDisposable = vscode.commands.registerCommand('ciphermate.loginGoogle', async () => {
    await authenticateWithProvider('google', context);
  });

  let loginMicrosoftDisposable = vscode.commands.registerCommand('ciphermate.loginMicrosoft', async () => {
    await authenticateWithProvider('microsoft', context);
  });

  let logoutDisposable = vscode.commands.registerCommand('ciphermate.logout', async () => {
    await logout(context);
  });

  let userProfileDisposable = vscode.commands.registerCommand('ciphermate.userProfile', async () => {
    await showUserProfile();
  });

  let cancelScanDisposable = vscode.commands.registerCommand('ciphermate.cancelScan', async () => {
    if (currentScanProcess && isScanning) {
      try {
        currentScanProcess.kill('SIGTERM');
        currentScanProcess = null;
        isScanning = false;
        vscode.window.showInformationMessage('Scan cancelled successfully');
      } catch (error) {
        vscode.window.showErrorMessage('Failed to cancel scan');
      }
    } else {
      vscode.window.showInformationMessage('No active scan to cancel');
    }
  });

  // Red Team Operations Center
  let redTeamOpsDisposable = vscode.commands.registerCommand('ciphermate.redTeamOps', async () => {
    const redTeamOps = new RedTeamOperationsCenter(context);
    await redTeamOps.showOperationsCenter();
  });

  let showCommandsDisposable = vscode.commands.registerCommand('ciphermate.showCommands', async () => {
    const commands = [
      'SCANNING & ANALYSIS',
      '  • CipherMate: Scan Code',
      '  • CipherMate: Intelligent Repository Scan',
      '  • CipherMate: AI-Only Security Scan',
      '  • CipherMate: Intelligent RAG-Powered Security Scan',
      '  • CipherMate: Cancel Scan',
      '',
      'RED TEAM & TESTING',
      '  • CipherMate: Red Team Operations Center',
      '  • CipherMate: Red Team Attack',
      '  • CipherMate: Test Agent',
      '  • CipherMate: Switch AI Agent',
      '',
      'TEAM & COLLABORATION',
      '  • CipherMate: Team Dashboard',
      '  • CipherMate: Setup Team',
      '  • CipherMate: View Reports',
      '',
      'CONFIGURATION',
      '  • CipherMate: Basic Settings',
      '  • CipherMate: Advanced Settings',
      '  • CipherMate: User Profile',
      '',
      'AUTHENTICATION',
      '  • CipherMate: Login with GitHub',
      '  • CipherMate: Login with Google',
      '  • CipherMate: Login with Microsoft',
      '  • CipherMate: Logout',
      '',
      'DATA & REPORTS',
      '  • CipherMate: View Results',
      '  • CipherMate: Export Results',
      '  • CipherMate: Compliance Report',
      '  • CipherMate: Clear Data',
      '',
      'NAVIGATION',
      '  • CipherMate: Home Dashboard',
      '  • CipherMate: Show Commands (this list)',
      '',
      'MAINTENANCE',
      '  • CipherMate: Clear Cache',
      '  • CipherMate: Clear Memory',
      '  • CipherMate: Test Storage'
    ];

    const panel = vscode.window.createWebviewPanel(
      'ciphermateCommands',
      'CipherMate - Available Commands',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    panel.webview.html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>CipherMate Commands</title>
          <style>
              body {
                  font-family: var(--vscode-font-family, 'Consolas', 'Monaco', monospace);
                  font-size: 13px;
                  color: var(--vscode-foreground);
                  background: var(--vscode-editor-background);
                  margin: 0;
                  padding: 20px;
                  line-height: 1.6;
              }
              .header {
                  border-bottom: 1px solid var(--vscode-panel-border);
                  padding-bottom: 10px;
                  margin-bottom: 20px;
              }
              .header h1 {
                  margin: 0;
                  color: var(--vscode-textLink-foreground);
                  font-size: 18px;
              }
              .commands-section {
                  margin-bottom: 20px;
              }
              .section-title {
                  font-weight: bold;
                  color: var(--vscode-textLink-foreground);
                  margin-bottom: 8px;
                  font-size: 14px;
              }
              .command-item {
                  margin-left: 20px;
                  margin-bottom: 4px;
                  color: var(--vscode-foreground);
              }
              .command-item:hover {
                  background: var(--vscode-list-hoverBackground);
                  cursor: pointer;
              }
              .note {
                  background: var(--vscode-input-background);
                  border: 1px solid var(--vscode-panel-border);
                  padding: 10px;
                  margin-top: 20px;
                  font-size: 12px;
                  color: var(--vscode-descriptionForeground);
              }
          </style>
      </head>
      <body>
          <div class="header">
              <h1>CipherMate Commands Reference</h1>
          </div>
          <div class="commands-section">
              ${commands.map(cmd => 
                cmd.startsWith('  •') 
                  ? `<div class="command-item" onclick="executeCommand('${cmd.replace('  • ', '')}')">${cmd}</div>`
                  : `<div class="section-title">${cmd}</div>`
              ).join('')}
          </div>
          <div class="note">
              <strong>Note:</strong> Click on any command above to execute it, or use the Command Palette (Cmd+Shift+P) and type "CipherMate" to see all available commands.
          </div>
          <script>
              const vscode = acquireVsCodeApi();
              function executeCommand(command) {
                  vscode.postMessage({
                      command: 'executeCommand',
                      commandName: command
                  });
              }
          </script>
      </body>
      </html>
    `;

    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === 'executeCommand') {
        try {
          await vscode.commands.executeCommand(message.commandName);
          panel.dispose();
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to execute command: ${message.commandName}`);
        }
      }
    });
  });

  // Function to show user profile
  async function showUserProfile() {
    const panel = vscode.window.createWebviewPanel(
      'ciphermateUserProfile',
      'CipherMate - User Profile',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    panel.webview.html = getUserProfileHtml(currentUser, vulnerabilityHistory);

    panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'loginWithProvider':
          await authenticateWithProvider(message.provider, context);
          panel.webview.html = getUserProfileHtml(currentUser, vulnerabilityHistory);
          break;
        case 'loginWithGitHub':
          await authenticateWithProvider('github', context);
          panel.webview.html = getUserProfileHtml(currentUser, vulnerabilityHistory);
          break;
        case 'logout':
          await logout(context);
          panel.webview.html = getUserProfileHtml(currentUser, vulnerabilityHistory);
          break;
      }
    });
  }

  // Start initial scan when extension activates
  if (activeCodeReviewer) {
    setTimeout(() => {
      activeCodeReviewer!.performInitialScan();
    }, 2000); // Wait 2 seconds after activation
  }

  context.subscriptions.push(
    chatDisposable,
    mainDisposable,
    scanDisposable, 
    semgrepDisposable, 
    banditDisposable, 
    settingsDisposable, 
    advancedSettingsDisposable, 
    homeDisposable, 
    resultsDisposable, 
    scanMeDisposable, 
    clearDataDisposable, 
    testStorageDisposable, 
    intelligentScanDisposable, 
    profileDisposable, 
    clearMemoryDisposable, 
    teamDashboardDisposable, 
    setupTeamDisposable, 
    viewReportsDisposable, 
    aiOnlyScanDisposable, 
    intelligentRAGScanDisposable, 
    switchAgentDisposable, 
    testAgentDisposable, 
    redTeamDisposable, 
    liveReviewDisposable, 
    inlineSuggestionDisposable, 
    applyFixDisposable, 
    clearCacheDisposable, 
    loginDisposable, 
    loginGoogleDisposable, 
    loginMicrosoftDisposable, 
    logoutDisposable, 
    userProfileDisposable, 
    cancelScanDisposable, 
    showCommandsDisposable, 
    redTeamOpsDisposable
  );
}

export function deactivate() {
  if (activeCodeReviewer) {
    activeCodeReviewer.dispose();
    activeCodeReviewer = null;
  }
}

function getSettingsHtml(settings: any) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CipherMate Settings</title>
        <style>
            :root {
                --border-radius: 0;
                --border-radius-sm: 0;
                --spacing-xs: 4px;
                --spacing-sm: 8px;
                --spacing-md: 12px;
                --spacing-lg: 16px;
                --spacing-xl: 20px;
                --spacing-xxl: 24px;
                --font-size-xs: 11px;
                --font-size-sm: 12px;
                --font-size-md: 13px;
                --font-size-lg: 14px;
                --font-size-xl: 16px;
                --font-size-xxl: 18px;
                --font-weight-normal: 400;
                --font-weight-medium: 500;
                --font-weight-semibold: 600;
                --font-weight-bold: 700;
            }
            
            * {
                box-sizing: border-box;
            }
            
            body {
                font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
                font-size: var(--font-size-md);
                font-weight: var(--font-weight-normal);
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
                margin: 0;
                padding: 0;
                line-height: 1.5;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }
            
            .container {
                padding: var(--spacing-xl);
                max-width: 600px;
                margin: 0 auto;
            }
            
            .header {
                margin-bottom: var(--spacing-xxl);
                padding-bottom: var(--spacing-lg);
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            
            .title {
                font-size: var(--font-size-xxl);
                font-weight: var(--font-weight-semibold);
                color: var(--vscode-foreground);
                margin: 0 0 var(--spacing-xs) 0;
                letter-spacing: -0.01em;
            }
            
            .subtitle {
                font-size: var(--font-size-sm);
                color: var(--vscode-descriptionForeground);
                margin: 0;
            }
            
            .settings-section {
                background-color: var(--vscode-panel-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: var(--border-radius);
                margin-bottom: var(--spacing-xl);
                overflow: hidden;
            }
            
            .section-header {
                background-color: var(--vscode-panel-background);
                padding: var(--spacing-lg);
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            
            .section-title {
                font-size: var(--font-size-lg);
                font-weight: var(--font-weight-semibold);
                color: var(--vscode-foreground);
                margin: 0;
            }
            
            .section-content {
                padding: var(--spacing-lg);
            }
            
            .setting-item {
                display: flex;
                align-items: flex-start;
                padding: var(--spacing-md) 0;
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            
            .setting-item:last-child {
                border-bottom: none;
            }
            
            .setting-control {
                flex-shrink: 0;
                margin-right: var(--spacing-lg);
                margin-top: var(--spacing-xs);
            }
            
            .setting-info {
                flex: 1;
                min-width: 0;
            }
            
            .setting-title {
                font-size: var(--font-size-md);
                font-weight: var(--font-weight-medium);
                color: var(--vscode-foreground);
                margin: 0 0 var(--spacing-xs) 0;
            }
            
            .setting-description {
                font-size: var(--font-size-sm);
                color: var(--vscode-descriptionForeground);
                margin: 0;
                line-height: 1.4;
            }
            
            .checkbox {
                position: relative;
                display: inline-block;
                width: 18px;
                height: 18px;
            }
            
            .checkbox input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            
            .checkbox-custom {
                position: absolute;
                top: 0;
                left: 0;
                height: 18px;
                width: 18px;
                background-color: var(--vscode-input-background);
                border: 1px solid var(--vscode-input-border);
                border-radius: var(--border-radius-sm);
                transition: all 0.15s ease;
            }
            
            .checkbox input:checked ~ .checkbox-custom {
                background-color: var(--vscode-button-background);
                border-color: var(--vscode-button-border);
            }
            
            .checkbox-custom:after {
                content: "";
                position: absolute;
                display: none;
                left: 6px;
                top: 2px;
                width: 4px;
                height: 8px;
                border: solid var(--vscode-button-foreground);
                border-width: 0 2px 2px 0;
                transform: rotate(45deg);
            }
            
            .checkbox input:checked ~ .checkbox-custom:after {
                display: block;
            }
            
            .number-input {
                width: 80px;
                padding: var(--spacing-sm);
                background-color: var(--vscode-input-background);
                border: 1px solid var(--vscode-input-border);
                border-radius: var(--border-radius-sm);
                color: var(--vscode-input-foreground);
                font-size: var(--font-size-sm);
                font-family: inherit;
            }
            
            .number-input:focus {
                outline: none;
                border-color: var(--vscode-focusBorder);
                box-shadow: 0 0 0 1px var(--vscode-focusBorder);
            }
            
            .actions {
                display: flex;
                gap: var(--spacing-sm);
                justify-content: flex-end;
                margin-top: var(--spacing-xl);
                padding-top: var(--spacing-lg);
                border-top: 1px solid var(--vscode-panel-border);
            }
            
            .btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: var(--spacing-sm) var(--spacing-lg);
                border: 1px solid transparent;
                border-radius: var(--border-radius-sm);
                font-size: var(--font-size-sm);
                font-weight: var(--font-weight-medium);
                cursor: pointer;
                transition: all 0.15s ease;
                text-decoration: none;
                white-space: nowrap;
                min-height: 32px;
            }
            
            .btn:focus {
                outline: 1px solid var(--vscode-focusBorder);
                outline-offset: 2px;
            }
            
            .btn-primary {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border-color: var(--vscode-button-border);
            }
            
            .btn-primary:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
            
            .btn-secondary {
                background-color: transparent;
                color: var(--vscode-foreground);
                border-color: var(--vscode-input-border);
            }
            
            .btn-secondary:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
            
            .status-message {
                padding: var(--spacing-md);
                border-radius: var(--border-radius-sm);
                margin-bottom: var(--spacing-lg);
                font-size: var(--font-size-sm);
                display: none;
            }
            
            .status-success {
                background-color: var(--vscode-inputValidation-infoBackground);
                color: var(--vscode-inputValidation-infoForeground);
                border: 1px solid var(--vscode-inputValidation-infoBorder);
            }
            
            .status-error {
                background-color: var(--vscode-inputValidation-errorBackground);
                color: var(--vscode-inputValidation-errorForeground);
                border: 1px solid var(--vscode-inputValidation-errorBorder);
            }
            
            @media (max-width: 768px) {
                .container {
                    padding: var(--spacing-lg);
                }
                
                .setting-item {
                    flex-direction: column;
                    gap: var(--spacing-sm);
                }
                
                .setting-control {
                    margin-right: 0;
                    margin-top: 0;
                }
                
                .actions {
                    flex-direction: column;
                }
            }
        </style>
    </head>
      <body>
        <div class="container">
            <div class="header">
                <h1 class="title">Settings</h1>
                <p class="subtitle">Configure CipherMate security analysis preferences</p>
            </div>
            
            <div id="status-message" class="status-message"></div>
            
            <div class="settings-section">
                <div class="section-header">
                    <h2 class="section-title">Static Analysis Tools</h2>
                </div>
                <div class="section-content">
                    <div class="setting-item">
                        <div class="setting-control">
                            <label class="checkbox">
                                <input type="checkbox" id="semgrep" ${settings.enableSemgrep ? 'checked' : ''}>
                                <span class="checkbox-custom"></span>
                            </label>
                        </div>
                        <div class="setting-info">
                            <div class="setting-title">Enable Semgrep</div>
                            <div class="setting-description">Use Semgrep for static analysis of JavaScript, TypeScript, Python, and other languages</div>
                        </div>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-control">
                            <label class="checkbox">
                                <input type="checkbox" id="bandit" ${settings.enableBandit ? 'checked' : ''}>
                                <span class="checkbox-custom"></span>
                            </label>
                        </div>
                        <div class="setting-info">
                            <div class="setting-title">Enable Bandit (Python)</div>
                            <div class="setting-description">Use Bandit for Python-specific security analysis</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="settings-section">
                <div class="section-header">
                    <h2 class="section-title">Scan Behavior</h2>
                </div>
                <div class="section-content">
                    <div class="setting-item">
                        <div class="setting-control">
                            <label class="checkbox">
                                <input type="checkbox" id="scanOnSave" ${settings.scanOnSave ? 'checked' : ''}>
                                <span class="checkbox-custom"></span>
                            </label>
                        </div>
                        <div class="setting-info">
                            <div class="setting-title">Scan on Save</div>
                            <div class="setting-description">Automatically scan files when they are saved</div>
                        </div>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-control">
                            <input type="number" id="scanInterval" class="number-input" value="${settings.scanInterval}" min="1" max="10">
                        </div>
                        <div class="setting-info">
                            <div class="setting-title">Scan Interval</div>
                            <div class="setting-description">Number of saves before triggering a full repository scan (1-10)</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="actions">
                <button class="btn btn-secondary" onclick="resetSettings()">Reset to Defaults</button>
                <button class="btn btn-primary" onclick="saveSettings()">Save Settings</button>
            </div>
        </div>
        
        <script>
            const vscode = acquireVsCodeApi();
            
            function showStatus(message, type = 'success') {
                const statusEl = document.getElementById('status-message');
                statusEl.textContent = message;
                statusEl.className = \`status-message status-\${type}\`;
                statusEl.style.display = 'block';
                
                setTimeout(() => {
                    statusEl.style.display = 'none';
                }, 3000);
            }
            
          function saveSettings() {
            const settings = {
              enableSemgrep: document.getElementById('semgrep').checked,
              enableBandit: document.getElementById('bandit').checked,
              scanOnSave: document.getElementById('scanOnSave').checked,
                    scanInterval: Math.max(1, Math.min(10, parseInt(document.getElementById('scanInterval').value, 10) || 1))
            };
                
            vscode.postMessage({ command: 'saveSettings', settings });
                showStatus('Settings saved successfully');
            }
            
            function resetSettings() {
                document.getElementById('semgrep').checked = true;
                document.getElementById('bandit').checked = true;
                document.getElementById('scanOnSave').checked = true;
                document.getElementById('scanInterval').value = '1';
                showStatus('Settings reset to defaults');
            }
            
            // Handle messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'settingsSaved':
                        showStatus('Settings saved successfully');
                        break;
                    case 'settingsError':
                        showStatus('Failed to save settings', 'error');
                        break;
                }
            });
        </script>
      </body>
    </html>
  `;
}

function getAdvancedSettingsHtml(settings: any) {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CipherMate Advanced Settings</title>
    <style>
            :root {
                --border-radius: 0;
                --border-radius-sm: 0;
                --spacing-xs: 4px;
                --spacing-sm: 8px;
                --spacing-md: 12px;
                --spacing-lg: 16px;
                --spacing-xl: 20px;
                --spacing-xxl: 24px;
                --font-size-xs: 11px;
                --font-size-sm: 12px;
                --font-size-md: 13px;
                --font-size-lg: 14px;
                --font-size-xl: 16px;
                --font-size-xxl: 18px;
                --font-weight-normal: 400;
                --font-weight-medium: 500;
                --font-weight-semibold: 600;
                --font-weight-bold: 700;
            }
            
            * {
                box-sizing: border-box;
            }
            
      body {
                font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
                font-size: var(--font-size-md);
                font-weight: var(--font-weight-normal);
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
        margin: 0;
        padding: 0;
                line-height: 1.5;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }
            
            .container {
                padding: var(--spacing-xl);
                max-width: 1200px;
                margin: 0 auto;
            }
            
      .header {
                margin-bottom: var(--spacing-xxl);
                padding-bottom: var(--spacing-lg);
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            
            .title {
                font-size: var(--font-size-xxl);
                font-weight: var(--font-weight-semibold);
                color: var(--vscode-foreground);
                margin: 0 0 var(--spacing-xs) 0;
                letter-spacing: -0.01em;
            }
            
            .subtitle {
                font-size: var(--font-size-sm);
                color: var(--vscode-descriptionForeground);
                margin: 0;
            }
            
            .settings-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
                gap: var(--spacing-xxl);
                margin-bottom: var(--spacing-xxl);
            }
            
            .settings-section {
                background-color: var(--vscode-panel-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: var(--border-radius);
                padding: var(--spacing-lg);
            }
            
            .section-title {
                font-size: var(--font-size-lg);
                font-weight: var(--font-weight-semibold);
                color: var(--vscode-foreground);
                margin: 0 0 var(--spacing-lg) 0;
                display: flex;
                align-items: center;
                gap: var(--spacing-sm);
            }
            
            .section-icon {
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: var(--font-size-sm);
            }
            
            .setting-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
                padding: var(--spacing-md) 0;
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            
            .setting-item:last-child {
                border-bottom: none;
            }
            
            .setting-label {
                flex: 1;
                margin-right: var(--spacing-lg);
            }
            
            .setting-title {
                font-size: var(--font-size-md);
                font-weight: var(--font-weight-medium);
                color: var(--vscode-foreground);
                margin: 0 0 var(--spacing-xs) 0;
            }
            
            .setting-description {
                font-size: var(--font-size-sm);
                color: var(--vscode-descriptionForeground);
                margin: 0;
            }
            
            .setting-control {
                flex-shrink: 0;
            }
            
            .checkbox {
                position: relative;
                display: inline-block;
                width: 44px;
                height: 24px;
            }
            
            .checkbox input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            
            .slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: var(--vscode-input-background);
                border: 1px solid var(--vscode-input-border);
                border-radius: 0 !important;
                transition: all 0.2s ease;
            }
            
            .slider:before {
                position: absolute;
                content: "";
                height: 18px;
                width: 18px;
                left: 2px;
                bottom: 2px;
                background-color: var(--vscode-foreground);
                border-radius: 0 !important;
                transition: all 0.2s ease;
            }
            
            input:checked + .slider {
                background-color: var(--vscode-button-background);
                border-color: var(--vscode-button-border);
            }
            
            input:checked + .slider:before {
                transform: translateX(20px);
                background-color: var(--vscode-button-foreground);
            }
            
            .number-input, .text-input, .select-input {
                padding: var(--spacing-sm);
                border: 1px solid var(--vscode-input-border);
                border-radius: var(--border-radius-sm);
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                font-size: var(--font-size-sm);
            }
            
            .number-input {
                width: 80px;
                text-align: center;
            }
            
            .text-input {
                width: 200px;
            }
            
            .select-input {
                width: 150px;
            }
            
            .number-input:focus, .text-input:focus, .select-input:focus {
                outline: none;
                border-color: var(--vscode-focusBorder);
            }
            
            .actions {
                display: flex;
                gap: var(--spacing-sm);
                margin-top: var(--spacing-xxl);
                padding-top: var(--spacing-lg);
                border-top: 1px solid var(--vscode-panel-border);
            }
            
            .btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: var(--spacing-sm) var(--spacing-lg);
                border: 1px solid transparent;
                border-radius: var(--border-radius-sm);
                font-size: var(--font-size-sm);
                font-weight: var(--font-weight-medium);
                cursor: pointer;
                transition: all 0.15s ease;
                text-decoration: none;
                white-space: nowrap;
                min-height: 32px;
            }
            
            .btn:focus {
                outline: 1px solid var(--vscode-focusBorder);
                outline-offset: 2px;
            }
            
            .btn-primary {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border-color: var(--vscode-button-border);
            }
            
            .btn-primary:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
            
            .btn-secondary {
                background-color: transparent;
                color: var(--vscode-foreground);
                border-color: var(--vscode-input-border);
            }
            
            .btn-secondary:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
            
            .status {
                font-size: var(--font-size-sm);
                color: var(--vscode-descriptionForeground);
                margin-top: var(--spacing-sm);
                padding: var(--spacing-sm);
                background-color: var(--vscode-panel-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: var(--border-radius-sm);
                display: none;
            }
            
            .status.success {
                color: var(--vscode-inputValidation-infoForeground);
                border-color: var(--vscode-inputValidation-infoBorder);
                background-color: var(--vscode-inputValidation-infoBackground);
            }
            
            .status.error {
                color: var(--vscode-inputValidation-errorForeground);
                border-color: var(--vscode-inputValidation-errorBorder);
                background-color: var(--vscode-inputValidation-errorBackground);
            }
            
            @media (max-width: 768px) {
                .container {
                    padding: var(--spacing-lg);
                }
                
                .settings-grid {
                    grid-template-columns: 1fr;
                }
                
                .setting-item {
                    flex-direction: column;
                    align-items: flex-start;
                    gap: var(--spacing-sm);
                }
                
                .setting-control {
                    align-self: flex-end;
                }
                
                .actions {
                    flex-direction: column;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 class="title">CipherMate Advanced Settings</h1>
                <p class="subtitle">Configure all CipherMate features and preferences</p>
            </div>
            
            <div class="settings-grid">
                <div class="settings-section">
                    <h2 class="section-title">
                        Static Analysis Tools
                    </h2>
                    
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-title">Enable Semgrep</div>
                            <div class="setting-description">Use Semgrep for static analysis</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox">
                                <input type="checkbox" id="enableSemgrep" ${settings.enableSemgrep ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-title">Enable Bandit</div>
                            <div class="setting-description">Use Bandit for Python security analysis</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox">
                                <input type="checkbox" id="enableBandit" ${settings.enableBandit ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-title">Enable AI Analysis</div>
                            <div class="setting-description">Use AI for advanced security analysis</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox">
                                <input type="checkbox" id="enableAIAnalysis" ${settings.enableAIAnalysis ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
                
                <div class="settings-section">
                    <h2 class="section-title">
                        Scan Behavior
                    </h2>
                    
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-title">Scan on Save</div>
                            <div class="setting-description">Automatically scan files when saved</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox">
                                <input type="checkbox" id="scanOnSave" ${settings.scanOnSave ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-title">Auto Scan on Startup</div>
                            <div class="setting-description">Scan project when extension starts</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox">
                                <input type="checkbox" id="autoScanOnStartup" ${settings.autoScanOnStartup ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-title">Enable Live Review</div>
                            <div class="setting-description">Real-time code analysis as you type</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox">
                                <input type="checkbox" id="enableLiveReview" ${settings.enableLiveReview ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-title">Scan Interval</div>
                            <div class="setting-description">Number of saves before full scan</div>
                        </div>
                        <div class="setting-control">
                            <input type="number" class="number-input" id="scanInterval" value="${settings.scanInterval}" min="1" max="10">
                        </div>
                    </div>
                </div>
                
                <div class="settings-section">
                    <h2 class="section-title">
                        <span class="section-icon">💡</span>
                        Inline Suggestions
                    </h2>
                    
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-title">Enable Inline Suggestions</div>
                            <div class="setting-description">Show security fix suggestions as you type</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox">
                                <input type="checkbox" id="enableInlineSuggestions" ${settings.enableInlineSuggestions ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-title">Suggestion Delay</div>
                            <div class="setting-description">Delay before showing suggestions (ms)</div>
                        </div>
                        <div class="setting-control">
                            <input type="number" class="number-input" id="suggestionDelay" value="${settings.suggestionDelay}" min="100" max="2000">
                        </div>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-title">Max Suggestions</div>
                            <div class="setting-description">Maximum suggestions per file</div>
                        </div>
                        <div class="setting-control">
                            <input type="number" class="number-input" id="maxSuggestionsPerFile" value="${settings.maxSuggestionsPerFile}" min="1" max="50">
                        </div>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-title">Auto Apply</div>
                            <div class="setting-description">Auto-apply suggestions on Tab</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox">
                                <input type="checkbox" id="enableAutoApply" ${settings.enableAutoApply ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
                
                <div class="settings-section">
                    <h2 class="section-title">
                        <span class="section-icon">🔔</span>
                        Notifications
                    </h2>
                    
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-title">Enable Notifications</div>
                            <div class="setting-description">Show security notifications</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox">
                                <input type="checkbox" id="enableNotifications" ${settings.enableNotifications ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-title">Notification Level</div>
                            <div class="setting-description">Minimum severity to show</div>
                        </div>
                        <div class="setting-control">
                            <select class="select-input" id="notificationLevel">
                                <option value="all" ${settings.notificationLevel === 'all' ? 'selected' : ''}>All</option>
                                <option value="critical" ${settings.notificationLevel === 'critical' ? 'selected' : ''}>Critical</option>
                                <option value="high" ${settings.notificationLevel === 'high' ? 'selected' : ''}>High</option>
                                <option value="medium" ${settings.notificationLevel === 'medium' ? 'selected' : ''}>Medium</option>
                                <option value="low" ${settings.notificationLevel === 'low' ? 'selected' : ''}>Low</option>
                                <option value="none" ${settings.notificationLevel === 'none' ? 'selected' : ''}>None</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-title">Show Popups</div>
                            <div class="setting-description">Show notification popups</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox">
                                <input type="checkbox" id="showNotificationPopups" ${settings.showNotificationPopups ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-title">Sound Notifications</div>
                            <div class="setting-description">Play sound for notifications</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox">
                                <input type="checkbox" id="enableSoundNotifications" ${settings.enableSoundNotifications ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
                
                <div class="settings-section">
                    <h2 class="section-title">
                        AI Agent Configuration
                    </h2>
                    
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-title">AI Provider</div>
                            <div class="setting-description">Choose your AI provider</div>
                        </div>
                        <div class="setting-control">
                            <select class="select-input" id="aiProvider">
                                <option value="lmstudio" ${settings.aiProvider === 'lmstudio' ? 'selected' : ''}>LM Studio</option>
                                <option value="ollama" ${settings.aiProvider === 'ollama' ? 'selected' : ''}>Ollama</option>
                                <option value="openai" ${settings.aiProvider === 'openai' ? 'selected' : ''}>OpenAI</option>
                                <option value="custom" ${settings.aiProvider === 'custom' ? 'selected' : ''}>Custom</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-title">LM Studio URL</div>
                            <div class="setting-description">Local LM Studio endpoint</div>
                        </div>
                        <div class="setting-control">
                            <input type="text" class="text-input" id="lmStudioUrl" value="${settings.lmStudioUrl}">
                        </div>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-title">Ollama URL</div>
                            <div class="setting-description">Local Ollama endpoint</div>
                        </div>
                        <div class="setting-control">
                            <input type="text" class="text-input" id="ollamaUrl" value="${settings.ollamaUrl}">
                        </div>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-title">OpenAI API Key</div>
                            <div class="setting-description">Your OpenAI API key</div>
                        </div>
                        <div class="setting-control">
                            <input type="password" class="text-input" id="openaiApiKey" value="${settings.openaiApiKey}">
                        </div>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-title">AI Model</div>
                            <div class="setting-description">Model to use for analysis</div>
                        </div>
                        <div class="setting-control">
                            <select class="select-input" id="aiModel">
                                <option value="auto" ${settings.aiModel === 'auto' ? 'selected' : ''}>Auto</option>
                                <option value="gpt-4" ${settings.aiModel === 'gpt-4' ? 'selected' : ''}>GPT-4</option>
                                <option value="gpt-3.5-turbo" ${settings.aiModel === 'gpt-3.5-turbo' ? 'selected' : ''}>GPT-3.5 Turbo</option>
                                <option value="llama2" ${settings.aiModel === 'llama2' ? 'selected' : ''}>Llama 2</option>
                                <option value="codellama" ${settings.aiModel === 'codellama' ? 'selected' : ''}>Code Llama</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-title">AI Timeout</div>
                            <div class="setting-description">Request timeout (ms)</div>
                        </div>
                        <div class="setting-control">
                            <input type="number" class="number-input" id="aiTimeout" value="${settings.aiTimeout}" min="5000" max="120000">
                        </div>
                    </div>
                </div>
                
                <div class="settings-section">
                    <h2 class="section-title">
                        Security Detection
                    </h2>
                    
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-title">SQL Injection</div>
                            <div class="setting-description">Detect SQL injection vulnerabilities</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox">
                                <input type="checkbox" id="enableSQLInjectionDetection" ${settings.enableSQLInjectionDetection ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-title">XSS Detection</div>
                            <div class="setting-description">Detect Cross-Site Scripting</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox">
                                <input type="checkbox" id="enableXSSDetection" ${settings.enableXSSDetection ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-title">Secret Detection</div>
                            <div class="setting-description">Detect hardcoded secrets</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox">
                                <input type="checkbox" id="enableSecretDetection" ${settings.enableSecretDetection ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-title">Weak Crypto</div>
                            <div class="setting-description">Detect weak cryptography</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox">
                                <input type="checkbox" id="enableWeakCryptoDetection" ${settings.enableWeakCryptoDetection ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="actions">
                <button class="btn btn-primary" onclick="saveSettings()">Save Settings</button>
                <button class="btn btn-secondary" onclick="resetSettings()">Reset to Defaults</button>
                <button class="btn btn-secondary" onclick="testAIConnection()">Test AI Connection</button>
            </div>
            
            <div class="status" id="status"></div>
        </div>
        
        <script>
            const vscode = acquireVsCodeApi();
            
            function saveSettings() {
                const settings = {
                    // Static Analysis Tools
                    enableSemgrep: document.getElementById('enableSemgrep').checked,
                    enableBandit: document.getElementById('enableBandit').checked,
                    enableAIAnalysis: document.getElementById('enableAIAnalysis').checked,
                    
                    // Scan Behavior
                    scanOnSave: document.getElementById('scanOnSave').checked,
                    scanInterval: parseInt(document.getElementById('scanInterval').value),
                    autoScanOnStartup: document.getElementById('autoScanOnStartup').checked,
                    enableLiveReview: document.getElementById('enableLiveReview').checked,
                    
                    // Inline Suggestions
                    enableInlineSuggestions: document.getElementById('enableInlineSuggestions').checked,
                    suggestionDelay: parseInt(document.getElementById('suggestionDelay').value),
                    maxSuggestionsPerFile: parseInt(document.getElementById('maxSuggestionsPerFile').value),
                    enableAutoApply: document.getElementById('enableAutoApply').checked,
                    
                    // Notifications
                    enableNotifications: document.getElementById('enableNotifications').checked,
                    notificationLevel: document.getElementById('notificationLevel').value,
                    showNotificationPopups: document.getElementById('showNotificationPopups').checked,
                    enableSoundNotifications: document.getElementById('enableSoundNotifications').checked,
                    
                    // AI Agent Configuration
                    aiProvider: document.getElementById('aiProvider').value,
                    lmStudioUrl: document.getElementById('lmStudioUrl').value,
                    ollamaUrl: document.getElementById('ollamaUrl').value,
                    openaiApiKey: document.getElementById('openaiApiKey').value,
                    aiModel: document.getElementById('aiModel').value,
                    aiTimeout: parseInt(document.getElementById('aiTimeout').value),
                    
                    // Security Detection
                    enableSQLInjectionDetection: document.getElementById('enableSQLInjectionDetection').checked,
                    enableXSSDetection: document.getElementById('enableXSSDetection').checked,
                    enableSecretDetection: document.getElementById('enableSecretDetection').checked,
                    enableWeakCryptoDetection: document.getElementById('enableWeakCryptoDetection').checked
                };
                
                vscode.postMessage({
                    command: 'saveSettings',
                    settings: settings
                });
            }
            
            function resetSettings() {
                // Reset all checkboxes to default values
                document.getElementById('enableSemgrep').checked = true;
                document.getElementById('enableBandit').checked = true;
                document.getElementById('enableAIAnalysis').checked = true;
                document.getElementById('scanOnSave').checked = true;
                document.getElementById('autoScanOnStartup').checked = true;
                document.getElementById('enableLiveReview').checked = true;
                document.getElementById('enableInlineSuggestions').checked = true;
                document.getElementById('enableAutoApply').checked = false;
                document.getElementById('enableNotifications').checked = true;
                document.getElementById('showNotificationPopups').checked = true;
                document.getElementById('enableSoundNotifications').checked = false;
                document.getElementById('enableSQLInjectionDetection').checked = true;
                document.getElementById('enableXSSDetection').checked = true;
                document.getElementById('enableSecretDetection').checked = true;
                document.getElementById('enableWeakCryptoDetection').checked = true;
                
                // Reset number inputs
                document.getElementById('scanInterval').value = 1;
                document.getElementById('suggestionDelay').value = 500;
                document.getElementById('maxSuggestionsPerFile').value = 10;
                document.getElementById('aiTimeout').value = 30000;
                
                // Reset select inputs
                document.getElementById('notificationLevel').value = 'all';
                document.getElementById('aiProvider').value = 'lmstudio';
                document.getElementById('aiModel').value = 'auto';
                
                // Reset text inputs
                document.getElementById('lmStudioUrl').value = 'http://localhost:1234/v1/chat/completions';
                document.getElementById('ollamaUrl').value = 'http://localhost:11434/v1/chat/completions';
                document.getElementById('openaiApiKey').value = '';
                
                showStatus('Settings reset to defaults', 'success');
            }
            
            function testAIConnection() {
                vscode.postMessage({
                    command: 'testAIConnection'
                });
            }
            
            function showStatus(message, type = 'success') {
                const status = document.getElementById('status');
                status.textContent = message;
                status.className = \`status \${type}\`;
                status.style.display = 'block';
                
                setTimeout(() => {
                    status.style.display = 'none';
                }, 3000);
            }
            
            // Handle messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'settingsSaved':
                        showStatus('Settings saved successfully');
                        break;
                    case 'settingsError':
                        showStatus('Failed to save settings', 'error');
                        break;
                    case 'aiConnectionTest':
                        showStatus(message.success ? 'AI connection successful!' : 'AI connection failed: ' + message.error, message.success ? 'success' : 'error');
                        break;
                }
            });
        </script>
    </body>
    </html>
  `;
}

function getHomeDashboardHtml(settings: any, scanResults: any[], panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
  // Ensure scanResults is an array and handle undefined/null cases
  const results = Array.isArray(scanResults) ? scanResults : [];
  
  const totalVulnerabilities = results.length;
  const criticalCount = results.filter(r => r.severity === 'critical' || r.severity === 'error').length;
  const highCount = results.filter(r => r.severity === 'high' || r.severity === 'warning').length;
  const mediumCount = results.filter(r => r.severity === 'medium' || r.severity === 'info').length;
  const lowCount = results.filter(r => r.severity === 'low').length;
  
  const lastScanTime = results.length > 0 ? new Date().toLocaleTimeString() : 'Never';
  const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name || 'No Workspace';
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CipherMate Home</title>
        <style>
            :root {
                --border-radius: 0;
                --border-radius-sm: 0;
                --spacing-xs: 4px;
                --spacing-sm: 8px;
                --spacing-md: 12px;
                --spacing-lg: 16px;
                --spacing-xl: 20px;
                --spacing-xxl: 24px;
                --spacing-xxxl: 32px;
                --font-size-xs: 11px;
                --font-size-sm: 12px;
                --font-size-md: 13px;
                --font-size-lg: 14px;
                --font-size-xl: 16px;
                --font-size-xxl: 18px;
                --font-size-xxxl: 24px;
                --font-weight-normal: 400;
                --font-weight-medium: 500;
                --font-weight-semibold: 600;
                --font-weight-bold: 700;
                --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
                --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
            }
            
            * {
                box-sizing: border-box;
                border-radius: 0 !important;
                -webkit-border-radius: 0 !important;
                -moz-border-radius: 0 !important;
            }
            
            *:before,
            *:after {
                border-radius: 0 !important;
                -webkit-border-radius: 0 !important;
                -moz-border-radius: 0 !important;
            }
            
            input, textarea, button, select, div, section, article {
                border-radius: 0 !important;
                -webkit-border-radius: 0 !important;
                -moz-border-radius: 0 !important;
            }
            
            body {
                font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
                font-size: var(--font-size-md);
                font-weight: var(--font-weight-normal);
                color: var(--vscode-foreground);
                background: linear-gradient(135deg, var(--vscode-editor-background) 0%, var(--vscode-panel-background) 100%);
                margin: 0;
                padding: 0;
                line-height: 1.5;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
                min-height: 100vh;
            }
            
            .container {
                max-width: 1200px;
                margin: 0 auto;
                padding: var(--spacing-xl);
            }
            
            .header {
                text-align: center;
                margin-bottom: var(--spacing-xxxl);
                padding: var(--spacing-xxl) 0;
                background: var(--vscode-panel-background);
                border-radius: var(--border-radius);
                border: 1px solid var(--vscode-panel-border);
                box-shadow: var(--shadow-sm);
            }
            
      .logo {
                font-size: var(--font-size-xxxl);
                font-weight: var(--font-weight-bold);
                color: var(--vscode-textLink-foreground);
                margin-bottom: var(--spacing-sm);
        display: flex;
        align-items: center;
                justify-content: center;
                gap: var(--spacing-sm);
            }
            
            .subtitle {
                font-size: var(--font-size-lg);
                color: var(--vscode-descriptionForeground);
                margin: 0;
            }
            
            .workspace-info {
                font-size: var(--font-size-sm);
                color: var(--vscode-descriptionForeground);
                margin-top: var(--spacing-sm);
                padding: var(--spacing-sm) var(--spacing-md);
                background: var(--vscode-input-background);
                border-radius: var(--border-radius-sm);
                display: inline-block;
            }
            
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: var(--spacing-lg);
                margin-bottom: var(--spacing-xxxl);
            }
            
            .stat-card {
                background: var(--vscode-panel-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: var(--border-radius);
                padding: var(--spacing-lg);
                text-align: center;
                box-shadow: var(--shadow-sm);
                transition: all 0.2s ease;
                cursor: pointer;
            }
            
            .stat-card:hover {
                transform: translateY(-2px);
                box-shadow: var(--shadow-md);
                border-color: var(--vscode-focusBorder);
            }
            
            .stat-card.critical {
                border-left: 4px solid var(--vscode-inputValidation-errorForeground);
            }
            
            .stat-card.high {
                border-left: 4px solid var(--vscode-inputValidation-warningForeground);
            }
            
            .stat-card.medium {
                border-left: 4px solid var(--vscode-inputValidation-infoForeground);
            }
            
            .stat-card.low {
                border-left: 4px solid var(--vscode-textLink-foreground);
            }
            
            .stat-number {
                font-size: var(--font-size-xxxl);
                font-weight: var(--font-weight-bold);
                display: block;
                margin-bottom: var(--spacing-xs);
            }
            
            .stat-card.critical .stat-number {
                color: var(--vscode-inputValidation-errorForeground);
            }
            
            .stat-card.high .stat-number {
                color: var(--vscode-inputValidation-warningForeground);
            }
            
            .stat-card.medium .stat-number {
                color: var(--vscode-inputValidation-infoForeground);
            }
            
            .stat-card.low .stat-number {
                color: var(--vscode-textLink-foreground);
            }
            
            .stat-label {
                font-size: var(--font-size-sm);
                color: var(--vscode-descriptionForeground);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .actions-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                gap: var(--spacing-lg);
                margin-bottom: var(--spacing-xxxl);
            }
            
            .action-card {
                background: var(--vscode-panel-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: var(--border-radius);
                padding: var(--spacing-lg);
                box-shadow: var(--shadow-sm);
                transition: all 0.2s ease;
                cursor: pointer;
                position: relative;
                overflow: hidden;
            }
            
            .action-card:hover {
                transform: translateY(-2px);
                box-shadow: var(--shadow-md);
                border-color: var(--vscode-focusBorder);
            }
            
            .action-card::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 3px;
                background: linear-gradient(90deg, var(--vscode-textLink-foreground), var(--vscode-textLink-activeForeground));
            }
            
            .action-header {
                display: flex;
                align-items: center;
                gap: var(--spacing-md);
                margin-bottom: var(--spacing-md);
            }
            
            .action-icon {
                font-size: var(--font-size-sm);
                font-weight: var(--font-weight-bold);
                width: 40px;
                height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border-radius: var(--border-radius-sm);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .action-title {
                font-size: var(--font-size-lg);
                font-weight: var(--font-weight-semibold);
                color: var(--vscode-foreground);
                margin: 0;
            }
            
            .action-description {
                font-size: var(--font-size-sm);
                color: var(--vscode-descriptionForeground);
                margin: 0 0 var(--spacing-md) 0;
                line-height: 1.4;
            }
            
            .action-button {
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: 1px solid var(--vscode-button-border);
                border-radius: var(--border-radius-sm);
                padding: var(--spacing-sm) var(--spacing-md);
                font-size: var(--font-size-sm);
                font-weight: var(--font-weight-medium);
        cursor: pointer;
                transition: all 0.15s ease;
                width: 100%;
            }
            
            .action-button:hover {
                background: var(--vscode-button-hoverBackground);
            }
            
            .quick-actions {
                background: var(--vscode-panel-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: var(--border-radius);
                padding: var(--spacing-lg);
                box-shadow: var(--shadow-sm);
                margin-bottom: var(--spacing-xxxl);
            }
            
            .quick-actions-title {
                font-size: var(--font-size-lg);
                font-weight: var(--font-weight-semibold);
                color: var(--vscode-foreground);
                margin: 0 0 var(--spacing-lg) 0;
        display: flex;
                align-items: center;
                gap: var(--spacing-sm);
            }
            
            .quick-buttons {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: var(--spacing-sm);
            }
            
            .quick-btn {
                background: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
                border: 1px solid var(--vscode-button-border);
                border-radius: var(--border-radius-sm);
                padding: var(--spacing-sm) var(--spacing-md);
                font-size: var(--font-size-sm);
                font-weight: var(--font-weight-medium);
        cursor: pointer;
                transition: all 0.15s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: var(--spacing-xs);
            }
            
            .quick-btn:hover {
                background: var(--vscode-button-secondaryHoverBackground);
            }
            
            .quick-btn.primary {
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
            }
            
            .quick-btn.primary:hover {
                background: var(--vscode-button-hoverBackground);
            }
            
            .status-bar {
                background: var(--vscode-panel-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: var(--border-radius);
                padding: var(--spacing-md);
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: var(--font-size-sm);
                color: var(--vscode-descriptionForeground);
            }
            
            .status-item {
                display: flex;
                align-items: center;
                gap: var(--spacing-xs);
            }
            
            .status-indicator {
                width: 8px;
                height: 8px;
                border-radius: 0 !important;
                background: var(--vscode-inputValidation-infoForeground);
            }
            
            .status-indicator.warning {
                background: var(--vscode-inputValidation-warningForeground);
            }
            
            .status-indicator.error {
                background: var(--vscode-inputValidation-errorForeground);
            }
            
            .ai-status {
                display: flex;
                align-items: center;
                gap: var(--spacing-sm);
                padding: var(--spacing-xs) var(--spacing-sm);
                background: var(--vscode-input-background);
                border-radius: var(--border-radius-sm);
                font-size: var(--font-size-xs);
            }
            
            .ai-indicator {
                width: 6px;
                height: 6px;
                border-radius: 0 !important;
                background: var(--vscode-inputValidation-infoForeground);
                animation: pulse 2s infinite;
            }
            
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
            
            .ai-indicator.connected {
                background: var(--vscode-inputValidation-infoForeground);
            }
            
            .ai-indicator.disconnected {
                background: var(--vscode-inputValidation-errorForeground);
                animation: none;
            }
            
            .commands-section {
                background: var(--vscode-panel-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: var(--border-radius);
                padding: var(--spacing-lg);
                box-shadow: var(--shadow-sm);
                margin-bottom: var(--spacing-xxxl);
            }
            
            .commands-title {
                font-size: var(--font-size-lg);
                font-weight: var(--font-weight-semibold);
                color: var(--vscode-foreground);
                margin: 0 0 var(--spacing-lg) 0;
                display: flex;
                align-items: center;
                gap: var(--spacing-sm);
            }
            
            .commands-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: var(--spacing-lg);
            }
            
            .command-category {
                background: var(--vscode-input-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: var(--border-radius);
                padding: var(--spacing-md);
                transition: all 0.2s ease;
            }
            
            .command-category:hover {
                border-color: var(--vscode-focusBorder);
                box-shadow: var(--shadow-sm);
            }
            
            .category-title {
                font-size: var(--font-size-md);
                font-weight: var(--font-weight-semibold);
                color: var(--vscode-foreground);
                margin: 0 0 var(--spacing-sm) 0;
                padding-bottom: var(--spacing-xs);
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            
            .command-buttons {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                gap: var(--spacing-xs);
            }
            
            .command-btn {
                background: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
                border: 1px solid var(--vscode-button-border);
                border-radius: var(--border-radius-sm);
                padding: var(--spacing-xs) var(--spacing-sm);
                font-size: var(--font-size-xs);
                font-weight: var(--font-weight-medium);
                cursor: pointer;
                transition: all 0.15s ease;
                text-align: center;
            }
            
            .command-btn:hover {
                background: var(--vscode-button-secondaryHoverBackground);
                transform: translateY(-1px);
            }
            
            .tech-panel {
                background: linear-gradient(135deg, var(--vscode-panel-background) 0%, var(--vscode-input-background) 100%);
                border: 1px solid var(--vscode-panel-border);
                border-radius: var(--border-radius);
                padding: var(--spacing-lg);
                margin-bottom: var(--spacing-lg);
                position: relative;
                overflow: hidden;
            }
            
            .tech-panel::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 2px;
                background: var(--vscode-textLink-foreground);
            }
            
            .progress-container {
                background: var(--vscode-input-background);
                border-radius: var(--border-radius-sm);
                padding: var(--spacing-sm);
                margin: var(--spacing-sm) 0;
            }
            
            .progress-bar {
        width: 100%;
                height: 8px;
                background: var(--vscode-progressBar-background);
                border-radius: 4px;
                overflow: hidden;
                position: relative;
            }
            
            .progress-fill {
                height: 100%;
                background: var(--vscode-progressBar-background);
                border-radius: 4px;
                transition: width 0.3s ease;
                position: relative;
            }
            
            .tech-stats {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: var(--spacing-sm);
                margin: var(--spacing-sm) 0;
            }
            
            .tech-stat {
                background: var(--vscode-input-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: var(--border-radius-sm);
                padding: var(--spacing-sm);
                text-align: center;
                position: relative;
            }
            
            .tech-stat::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 1px;
                background: var(--vscode-textLink-foreground);
            }
            
            .tech-stat-value {
                font-size: var(--font-size-lg);
                font-weight: var(--font-weight-bold);
                color: var(--vscode-textLink-foreground);
                display: block;
            }
            
            .tech-stat-label {
                font-size: var(--font-size-xs);
                color: var(--vscode-descriptionForeground);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .terminal-style {
                background: var(--vscode-input-background);
                color: var(--vscode-foreground);
                border: 1px solid var(--vscode-panel-border);
                border-radius: var(--border-radius-sm);
                padding: var(--spacing-sm);
                font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                font-size: var(--font-size-sm);
                line-height: 1.4;
                margin: var(--spacing-sm) 0;
                position: relative;
            }
            
            .scan-status {
                display: flex;
                align-items: center;
                gap: var(--spacing-sm);
                padding: var(--spacing-sm);
                background: var(--vscode-input-background);
                border-radius: var(--border-radius-sm);
                margin: var(--spacing-sm) 0;
            }
            
            .scan-indicator {
                width: 12px;
                height: 12px;
                border-radius: 0 !important;
                background: var(--vscode-inputValidation-infoForeground);
                animation: pulse 2s infinite;
            }
            
            .scan-indicator.scanning {
                background: var(--vscode-inputValidation-warningForeground);
                animation: pulse 1s infinite;
            }
            
            .scan-indicator.complete {
                background: var(--vscode-inputValidation-infoForeground);
                animation: none;
            }
            
            .scan-indicator.error {
                background: var(--vscode-inputValidation-errorForeground);
                animation: none;
            }
            
            @media (max-width: 768px) {
                .container {
                    padding: var(--spacing-lg);
                }
                
                .stats-grid {
                    grid-template-columns: repeat(2, 1fr);
                }
                
                .actions-grid {
                    grid-template-columns: 1fr;
                }
                
                .quick-buttons {
                    grid-template-columns: repeat(2, 1fr);
                }
                
                .status-bar {
                    flex-direction: column;
                    gap: var(--spacing-sm);
                    align-items: flex-start;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">
                    <img src="${panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'images', 'icon.svg'))}" alt="CipherMate" width="24" height="24" style="margin-right: 8px; background: transparent !important; border-radius: 0 !important;">
                    CipherMate
                </div>
                <p class="subtitle">AI-Powered Security Analysis Platform</p>
                <div class="workspace-info">
                    Workspace: ${workspaceName} • Last scan: ${lastScanTime}
                    <button onclick="refreshDashboard()" style="margin-left: 8px; padding: 4px 8px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 1px solid var(--vscode-button-border); border-radius: 0; font-size: 11px; cursor: pointer;">Refresh</button>
                    <button onclick="navigateTo('ciphermate.userProfile')" style="margin-left: 8px; padding: 4px 8px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-button-border); border-radius: 0; font-size: 11px; cursor: pointer;">View My Profile</button>
                </div>
            </div>
            
            <!-- Login Panel -->
            <div class="login-panel" style="background: var(--vscode-panel-background); border: 1px solid var(--vscode-panel-border); border-radius: var(--border-radius); padding: var(--spacing-lg); margin-bottom: var(--spacing-xl); box-shadow: var(--shadow-sm);">
                <h3 style="margin: 0 0 var(--spacing-md) 0; color: var(--vscode-foreground); font-size: var(--font-size-lg);">Authentication</h3>
                <p style="margin: 0 0 var(--spacing-md) 0; color: var(--vscode-descriptionForeground); font-size: var(--font-size-sm);">
                    Optional: Login to access advanced features, team collaboration, and cloud sync.
                </p>
                <div style="display: flex; gap: var(--spacing-sm); flex-wrap: wrap;">
                    <button onclick="navigateTo('ciphermate.login')" style="padding: var(--spacing-sm) var(--spacing-md); background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 1px solid var(--vscode-button-border); border-radius: 0; font-size: var(--font-size-sm); cursor: pointer; display: flex; align-items: center; gap: var(--spacing-xs);">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                        </svg>
                        GitHub
                    </button>
                    <button onclick="navigateTo('ciphermate.loginCipherMate')" style="padding: var(--spacing-sm) var(--spacing-md); background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-button-border); border-radius: 0; font-size: var(--font-size-sm); cursor: pointer; display: flex; align-items: center; gap: var(--spacing-xs);">
                        <img src="${panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'images', 'icon.svg'))}" alt="CipherMate" width="16" height="16" style="background: transparent !important; border-radius: 0 !important;">
                        CipherMate
                    </button>
                    <button onclick="navigateTo('ciphermate.loginGoogle')" style="padding: var(--spacing-sm) var(--spacing-md); background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-button-border); border-radius: 0; font-size: var(--font-size-sm); cursor: pointer; display: flex; align-items: center; gap: var(--spacing-xs);">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        Google
                    </button>
                    <button onclick="navigateTo('ciphermate.loginMicrosoft')" style="padding: var(--spacing-sm) var(--spacing-md); background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-button-border); border-radius: 0; font-size: var(--font-size-sm); cursor: pointer; display: flex; align-items: center; gap: var(--spacing-xs);">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z"/>
                        </svg>
                        Microsoft
                    </button>
                </div>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card critical" onclick="navigateTo('ciphermate.showResults')">
                    <span class="stat-number">${criticalCount}</span>
                    <span class="stat-label">Critical</span>
                </div>
                <div class="stat-card high" onclick="navigateTo('ciphermate.showResults')">
                    <span class="stat-number">${highCount}</span>
                    <span class="stat-label">High</span>
                </div>
                <div class="stat-card medium" onclick="navigateTo('ciphermate.showResults')">
                    <span class="stat-number">${mediumCount}</span>
                    <span class="stat-label">Medium</span>
                </div>
                <div class="stat-card low" onclick="navigateTo('ciphermate.showResults')">
                    <span class="stat-number">${lowCount}</span>
                    <span class="stat-label">Low</span>
                </div>
            </div>
            
            <div class="actions-grid">
                <div class="action-card tech-panel" onclick="startScan()">
                    <div class="action-header">
                        <div class="action-icon">SCAN</div>
                        <h3 class="action-title">Security Analysis</h3>
                    </div>
                    <p class="action-description">Run a comprehensive security analysis of your codebase using Semgrep, Bandit, and AI analysis.</p>
                    
                    <div class="tech-stats">
                        <div class="tech-stat">
                            <span class="tech-stat-value">${totalVulnerabilities}</span>
                            <span class="tech-stat-label">Total Issues</span>
                        </div>
                        <div class="tech-stat">
                            <span class="tech-stat-value">${criticalCount + highCount}</span>
                            <span class="tech-stat-label">High Risk</span>
                        </div>
                    </div>
                    
                    <div class="scan-status">
                        <div class="scan-indicator" id="scanIndicator"></div>
                        <span id="scanStatus">Ready to scan</span>
                    </div>
                    
                    <button class="action-button">Start Analysis</button>
                </div>
                
                <div class="action-card tech-panel" onclick="navigateTo('ciphermate.showResults')">
                    <div class="action-header">
                        <div class="action-icon">REPORT</div>
                        <h3 class="action-title">Vulnerability Reports</h3>
                    </div>
                    <p class="action-description">Review detailed vulnerability reports, get AI explanations, and apply security fixes.</p>
                    
                    <div class="terminal-style">
                        <div>Scan Results: ${totalVulnerabilities} vulnerabilities found</div>
                        <div>Critical: ${criticalCount} | High: ${highCount} | Medium: ${mediumCount} | Low: ${lowCount}</div>
                        <div>Last scan: ${lastScanTime}</div>
                    </div>
                    
                    <button class="action-button">View Reports</button>
                </div>
                
                <div class="action-card tech-panel" onclick="navigateTo('ciphermate.advancedSettings')">
                    <div class="action-header">
                        <div class="action-icon">CONFIG</div>
                        <h3 class="action-title">Configuration</h3>
                    </div>
                    <p class="action-description">Configure AI providers, scan behavior, notifications, and security detection preferences.</p>
                    
                    <div class="tech-stats">
                        <div class="tech-stat">
                            <span class="tech-stat-value">${settings.aiProvider || 'None'}</span>
                            <span class="tech-stat-label">AI Provider</span>
                        </div>
                        <div class="tech-stat">
                            <span class="tech-stat-value">${settings.enableInlineSuggestions ? 'ON' : 'OFF'}</span>
                            <span class="tech-stat-label">Inline Mode</span>
                        </div>
                    </div>
                    
                    <button class="action-button">Open Settings</button>
                </div>
                
                <div class="action-card tech-panel" onclick="navigateTo('ciphermate.teamDashboard')">
                    <div class="action-header">
                        <div class="action-icon">TEAM</div>
                        <h3 class="action-title">Team Dashboard</h3>
                    </div>
                    <p class="action-description">Monitor team security progress, collaborate on fixes, and track organizational learning.</p>
                    
                    <div class="progress-container">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: 75%"></div>
                        </div>
                        <div style="font-size: var(--font-size-xs); color: var(--vscode-descriptionForeground); margin-top: 4px;">
                            Team Security Score: 75%
                        </div>
                    </div>
                    
                    <button class="action-button">Team Dashboard</button>
                </div>
                
                <div class="action-card tech-panel" onclick="navigateTo('ciphermate.showProfile')">
                    <div class="action-header">
                        <div class="action-icon">PROFILE</div>
                        <h3 class="action-title">User Profile</h3>
                    </div>
                    <p class="action-description">View your security learning progress, achievements, and personalized recommendations.</p>
                    
                    <div class="tech-stats">
                        <div class="tech-stat">
                            <span class="tech-stat-value">85%</span>
                            <span class="tech-stat-label">Security Score</span>
                        </div>
                        <div class="tech-stat">
                            <span class="tech-stat-value">12</span>
                            <span class="tech-stat-label">Achievements</span>
                        </div>
                    </div>
                    
                    <button class="action-button">View Profile</button>
                </div>
                
                <div class="action-card tech-panel" onclick="testAI()">
                    <div class="action-header">
                        <div class="action-icon">AI</div>
                        <h3 class="action-title">AI Status</h3>
                    </div>
                    <p class="action-description">Test your AI connection and view current AI provider status and configuration.</p>
                    
                    <div class="terminal-style">
                        <div>AI Provider: ${settings.aiProvider || 'Not Configured'}</div>
                        <div>Endpoint: ${settings.lmStudioUrl || settings.ollamaUrl || 'Not Set'}</div>
                        <div>Status: <span id="aiStatusText">Testing...</span></div>
                    </div>
                    
                    <button class="action-button">Test Connection</button>
                </div>
            </div>
            
            <div class="quick-actions">
                <h3 class="quick-actions-title">
                    Quick Actions
                </h3>
                <div class="quick-buttons">
                    <button class="quick-btn primary" onclick="startScan()">
                        Scan Now
                    </button>
                    <button class="quick-btn" onclick="navigateTo('ciphermate.clearCache')">
                        Clear Cache
                    </button>
                    <button class="quick-btn" onclick="navigateTo('ciphermate.setupTeam')">
                        Setup Team
                    </button>
                    <button class="quick-btn" onclick="navigateTo('ciphermate.redTeamAttack')">
                        Red Team
                    </button>
                    <button class="quick-btn" onclick="navigateTo('ciphermate.complianceCheck')">
                        Compliance
                    </button>
                    <button class="quick-btn" onclick="navigateTo('ciphermate.exportResults')">
                        Export
                    </button>
                </div>
            </div>
            
            <div class="commands-section">
                <h3 class="commands-title">
                    All Commands
                </h3>
                <div class="commands-grid">
                    <div class="command-category">
                        <h4 class="category-title">Scanning & Analysis</h4>
                        <div class="command-buttons">
                            <button class="command-btn" onclick="navigateTo('ciphermate.scan')">Basic Scan</button>
                            <button class="command-btn" onclick="navigateTo('ciphermate.intelligentScan')">Intelligent Scan</button>
                            <button class="command-btn" onclick="navigateTo('ciphermate.aiOnlyScan')">AI-Only Scan</button>
                            <button class="command-btn" onclick="navigateTo('ciphermate.intelligentRAGScan')">RAG Scan</button>
                            <button class="command-btn" onclick="navigateTo('ciphermate.liveReview')">Live Review</button>
                        </div>
                    </div>
                    
                    <div class="command-category">
                        <h4 class="category-title">Red Team & Testing</h4>
                        <div class="command-buttons">
                            <button class="command-btn" onclick="navigateTo('ciphermate.redTeamAttack')">Red Team Attack</button>
                            <button class="command-btn" onclick="navigateTo('ciphermate.testAgent')">Test Agent</button>
                            <button class="command-btn" onclick="navigateTo('ciphermate.switchAgent')">Switch Agent</button>
                        </div>
                    </div>
                    
                    <div class="command-category">
                        <h4 class="category-title">Team & Collaboration</h4>
                        <div class="command-buttons">
                            <button class="command-btn" onclick="navigateTo('ciphermate.teamDashboard')">Team Dashboard</button>
                            <button class="command-btn" onclick="navigateTo('ciphermate.setupTeam')">Setup Team</button>
                            <button class="command-btn" onclick="navigateTo('ciphermate.viewReports')">View Reports</button>
                        </div>
                    </div>
                    
                    <div class="command-category">
                        <h4 class="category-title">Configuration</h4>
                        <div class="command-buttons">
                            <button class="command-btn" onclick="navigateTo('ciphermate.settings')">Basic Settings</button>
                            <button class="command-btn" onclick="navigateTo('ciphermate.advancedSettings')">Advanced Settings</button>
                            <button class="command-btn" onclick="navigateTo('ciphermate.showProfile')">My Profile</button>
                        </div>
                    </div>
                    
                    <div class="command-category">
                        <h4 class="category-title">Data & Reports</h4>
                        <div class="command-buttons">
                            <button class="command-btn" onclick="navigateTo('ciphermate.showResults')">View Results</button>
                            <button class="command-btn" onclick="navigateTo('ciphermate.exportResults')">Export Results</button>
                            <button class="command-btn" onclick="navigateTo('ciphermate.complianceReport')">Compliance Report</button>
                            <button class="command-btn" onclick="navigateTo('ciphermate.clearData')">Clear Data</button>
                        </div>
                    </div>
                    
                    <div class="command-category">
                        <h4 class="category-title">Maintenance</h4>
                        <div class="command-buttons">
                            <button class="command-btn" onclick="navigateTo('ciphermate.clearCache')">Clear Cache</button>
                            <button class="command-btn" onclick="navigateTo('ciphermate.clearMemory')">Clear Memory</button>
                            <button class="command-btn" onclick="navigateTo('ciphermate.testStorage')">Test Storage</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="status-bar">
                <div class="status-item">
                    <div class="status-indicator ${totalVulnerabilities > 0 ? 'warning' : ''}"></div>
                    <span>Security Status: ${totalVulnerabilities > 0 ? 'Issues Found' : 'All Clear'}</span>
                </div>
                <div class="status-item">
                    <div class="ai-status">
                        <div class="ai-indicator" id="aiIndicator"></div>
                        <span>AI: ${settings.aiProvider || 'Not Configured'}</span>
                    </div>
                </div>
                <div class="status-item">
                    <span>Total Vulnerabilities: ${totalVulnerabilities}</span>
                </div>
            </div>
        </div>
        
        <script>
            const vscode = acquireVsCodeApi();
            
            function navigateTo(command) {
                vscode.postMessage({
                    command: 'navigateTo',
                    target: command
                });
            }
            
            function startScan() {
                vscode.postMessage({
                    command: 'startScan'
                });
            }
            
            function testAI() {
                vscode.postMessage({
                    command: 'testAI'
                });
            }
            
            function refreshDashboard() {
                vscode.postMessage({
                    command: 'refreshDashboard'
                });
            }
            
            // Handle messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'aiTestResult':
                        const indicator = document.getElementById('aiIndicator');
                        const aiStatusText = document.getElementById('aiStatusText');
                        if (message.success) {
                            indicator.className = 'ai-indicator connected';
                            if (aiStatusText) aiStatusText.textContent = 'Connected';
                        } else {
                            indicator.className = 'ai-indicator disconnected';
                            if (aiStatusText) aiStatusText.textContent = 'Disconnected';
                        }
                        break;
                    case 'scanStatus':
                        const scanIndicator = document.getElementById('scanIndicator');
                        const scanStatus = document.getElementById('scanStatus');
                        if (scanIndicator && scanStatus) {
                            if (message.status === 'scanning') {
                                scanIndicator.className = 'scan-indicator scanning';
                                scanStatus.textContent = 'Scanning...';
                            } else if (message.status === 'complete') {
                                scanIndicator.className = 'scan-indicator complete';
                                scanStatus.textContent = 'Scan complete';
                            } else if (message.status === 'error') {
                                scanIndicator.className = 'scan-indicator error';
                                scanStatus.textContent = 'Scan failed';
                            } else {
                                scanIndicator.className = 'scan-indicator';
                                scanStatus.textContent = 'Ready to scan';
                            }
                        }
                        break;
                }
            });
            
            // Auto-test AI connection on load
            setTimeout(() => {
                testAI();
            }, 1000);
        </script>
    </body>
    </html>
  `;
}

function getResultsPanelHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CipherMate Results</title>
    <style>
        :root {
            --border-radius: 6px;
            --border-radius-sm: 4px;
            --spacing-xs: 4px;
            --spacing-sm: 8px;
            --spacing-md: 12px;
            --spacing-lg: 16px;
            --spacing-xl: 20px;
            --spacing-xxl: 24px;
            --font-size-xs: 11px;
            --font-size-sm: 12px;
            --font-size-md: 13px;
            --font-size-lg: 14px;
            --font-size-xl: 16px;
            --font-size-xxl: 18px;
            --font-weight-normal: 400;
            --font-weight-medium: 500;
            --font-weight-semibold: 600;
            --font-weight-bold: 700;
        }
        
        * {
            box-sizing: border-box;
        }
        
        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
            font-size: var(--font-size-md);
            font-weight: var(--font-weight-normal);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        margin: 0;
            padding: 0;
            line-height: 1.5;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }
        
        .container {
            padding: var(--spacing-xl);
            max-width: 100%;
        }
        
        .header {
            margin-bottom: var(--spacing-xxl);
            padding-bottom: var(--spacing-lg);
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .title {
            font-size: var(--font-size-xxl);
            font-weight: var(--font-weight-semibold);
            color: var(--vscode-foreground);
            margin: 0 0 var(--spacing-xs) 0;
            letter-spacing: -0.01em;
        }
        
        .subtitle {
            font-size: var(--font-size-sm);
            color: var(--vscode-descriptionForeground);
            margin: 0 0 var(--spacing-lg) 0;
        }
        
        .scan-info {
            display: flex;
            align-items: center;
            gap: var(--spacing-lg);
            margin-bottom: var(--spacing-lg);
        }
        
        .scan-status {
            font-size: var(--font-size-sm);
            color: var(--vscode-descriptionForeground);
            padding: var(--spacing-xs) var(--spacing-sm);
            background-color: var(--vscode-panel-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: var(--border-radius-sm);
        }
        
        .scan-time {
            font-size: var(--font-size-xs);
            color: var(--vscode-descriptionForeground);
            font-family: var(--vscode-editor-font-family, 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace);
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
            gap: var(--spacing-md);
            margin-bottom: var(--spacing-xl);
        }
        
        .stat-card {
            background-color: var(--vscode-panel-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: var(--border-radius);
            padding: var(--spacing-md);
            text-align: center;
            transition: all 0.2s ease;
        }
        
        .stat-card:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        .stat-number {
            font-size: var(--font-size-xl);
            font-weight: var(--font-weight-bold);
            color: var(--vscode-foreground);
        display: block;
            margin-bottom: var(--spacing-xs);
        }
        
        .stat-label {
            font-size: var(--font-size-xs);
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-weight: var(--font-weight-medium);
        }
        
        .stat-critical .stat-number {
            color: var(--vscode-inputValidation-errorForeground);
        }
        
        .stat-high .stat-number {
            color: var(--vscode-inputValidation-warningForeground);
        }
        
        .stat-medium .stat-number {
            color: var(--vscode-inputValidation-infoForeground);
        }
        
        .stat-low .stat-number {
            color: var(--vscode-descriptionForeground);
        }
        
        .controls {
        display: flex;
            gap: var(--spacing-sm);
            margin-bottom: var(--spacing-xl);
            flex-wrap: wrap;
        }
        
        .btn {
            display: inline-flex;
        align-items: center;
            justify-content: center;
            padding: var(--spacing-sm) var(--spacing-lg);
            border: 1px solid transparent;
            border-radius: var(--border-radius-sm);
            font-size: var(--font-size-sm);
            font-weight: var(--font-weight-medium);
            cursor: pointer;
            transition: all 0.15s ease;
            text-decoration: none;
            white-space: nowrap;
            min-height: 32px;
        }
        
        .btn:focus {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: 2px;
        }
        
        .btn-primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-border);
        }
        
        .btn-primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .btn-secondary {
            background-color: transparent;
            color: var(--vscode-foreground);
            border-color: var(--vscode-input-border);
        }
        
        .btn-secondary:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        .btn-ghost {
            background-color: transparent;
            color: var(--vscode-foreground);
            border-color: transparent;
        }
        
        .btn-ghost:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        .btn-refresh {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-border);
        }
        
        .btn-refresh:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .btn-refresh:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        .results-section {
            background-color: var(--vscode-panel-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: var(--border-radius);
            overflow: hidden;
        }
        
        .results-header {
            background-color: var(--vscode-panel-background);
            padding: var(--spacing-lg);
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .results-title {
            font-size: var(--font-size-lg);
            font-weight: var(--font-weight-semibold);
            color: var(--vscode-foreground);
            margin: 0;
        }
        
        .results-count {
            font-size: var(--font-size-sm);
            color: var(--vscode-descriptionForeground);
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: var(--spacing-xs) var(--spacing-sm);
            border-radius: var(--border-radius-sm);
        }
        
        .results-content {
            max-height: 60vh;
            overflow-y: auto;
        }
        
        .result-item {
            display: flex;
            align-items: flex-start;
            padding: var(--spacing-lg);
            border-bottom: 1px solid var(--vscode-panel-border);
            transition: background-color 0.15s ease;
        }
        
        .result-item:last-child {
            border-bottom: none;
        }
        
        .result-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        .result-severity {
            flex-shrink: 0;
            width: 80px;
            margin-right: var(--spacing-lg);
        }
        
        .severity-badge {
            display: inline-flex;
            align-items: center;
            padding: var(--spacing-xs) var(--spacing-sm);
            border-radius: var(--border-radius-sm);
            font-size: var(--font-size-xs);
            font-weight: var(--font-weight-semibold);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        
        .severity-critical {
            background-color: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-inputValidation-errorForeground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
        }
        
        .severity-high {
            background-color: var(--vscode-inputValidation-warningBackground);
            color: var(--vscode-inputValidation-warningForeground);
            border: 1px solid var(--vscode-inputValidation-warningBorder);
        }
        
        .severity-medium {
            background-color: var(--vscode-inputValidation-infoBackground);
            color: var(--vscode-inputValidation-infoForeground);
            border: 1px solid var(--vscode-inputValidation-infoBorder);
        }
        
        .severity-low {
            background-color: var(--vscode-panel-background);
            color: var(--vscode-descriptionForeground);
            border: 1px solid var(--vscode-panel-border);
        }
        
        .result-content {
            flex: 1;
            min-width: 0;
        }
        
        .result-header {
            display: flex;
            align-items: center;
            margin-bottom: var(--spacing-sm);
            gap: var(--spacing-md);
        }
        
        .result-title {
            font-size: var(--font-size-md);
            font-weight: var(--font-weight-medium);
            color: var(--vscode-foreground);
            margin: 0;
            flex: 1;
            min-width: 0;
        }
        
        .result-meta {
            display: flex;
            align-items: center;
            gap: var(--spacing-sm);
            flex-shrink: 0;
        }
        
        .tool-badge {
            display: inline-flex;
            align-items: center;
            padding: var(--spacing-xs) var(--spacing-sm);
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: var(--border-radius-sm);
            font-size: var(--font-size-xs);
            font-weight: var(--font-weight-medium);
        }
        
        .result-description {
            font-size: var(--font-size-sm);
            color: var(--vscode-descriptionForeground);
            margin-bottom: var(--spacing-md);
            line-height: 1.5;
        }
        
        .result-file {
            font-family: var(--vscode-editor-font-family, 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace);
            font-size: var(--font-size-sm);
            color: var(--vscode-textLink-foreground);
            cursor: pointer;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: var(--spacing-xs);
        }
        
        .result-file:hover {
            text-decoration: underline;
        }
        
        .result-actions {
            display: flex;
            gap: var(--spacing-sm);
            margin-top: var(--spacing-md);
        }
        
        .action-btn {
            display: inline-flex;
            align-items: center;
            padding: var(--spacing-xs) var(--spacing-sm);
            border: 1px solid var(--vscode-input-border);
            border-radius: var(--border-radius-sm);
            background-color: transparent;
            color: var(--vscode-foreground);
            font-size: var(--font-size-xs);
            font-weight: var(--font-weight-medium);
            cursor: pointer;
            transition: all 0.15s ease;
        }
        
        .action-btn:hover {
            background-color: var(--vscode-list-hoverBackground);
            border-color: var(--vscode-focusBorder);
        }
        
        .action-btn-primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-border);
        }
        
        .action-btn-primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .no-results {
            text-align: center;
            padding: var(--spacing-xxl) var(--spacing-xl);
            color: var(--vscode-descriptionForeground);
        }
        
        .no-results-icon {
            font-size: 48px;
            margin-bottom: var(--spacing-lg);
            opacity: 0.5;
        }
        
        .no-results-title {
            font-size: var(--font-size-lg);
            font-weight: var(--font-weight-semibold);
            color: var(--vscode-foreground);
            margin-bottom: var(--spacing-sm);
        }
        
        .no-results-description {
            font-size: var(--font-size-sm);
            color: var(--vscode-descriptionForeground);
        }
        
        .loading {
            text-align: center;
            padding: var(--spacing-xxl) var(--spacing-xl);
            color: var(--vscode-descriptionForeground);
        }
        
        .loading-spinner {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 2px solid var(--vscode-panel-border);
            border-radius: 50%;
            border-top-color: var(--vscode-foreground);
            animation: spin 1s ease-in-out infinite;
            margin-right: var(--spacing-sm);
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .modal-overlay {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.4);
            z-index: 1000;
            backdrop-filter: blur(2px);
        }
        
        .modal-content {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: var(--border-radius);
            padding: 0;
            max-width: 600px;
            max-height: 80vh;
            width: 90%;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            overflow: hidden;
        }
        
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: var(--spacing-lg);
            border-bottom: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-panel-background);
        }
        
        .modal-title {
            font-size: var(--font-size-lg);
            font-weight: var(--font-weight-semibold);
            color: var(--vscode-foreground);
            margin: 0;
        }
        
        .modal-close {
            background: none;
        border: none;
            color: var(--vscode-foreground);
            font-size: var(--font-size-xl);
        cursor: pointer;
            padding: var(--spacing-xs);
            border-radius: var(--border-radius-sm);
            transition: background-color 0.15s ease;
        }
        
        .modal-close:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        .modal-body {
            padding: var(--spacing-lg);
            max-height: 60vh;
            overflow-y: auto;
        }
        
        .modal-text {
            color: var(--vscode-foreground);
            line-height: 1.6;
            white-space: pre-wrap;
            font-size: var(--font-size-sm);
        }
        
        @media (max-width: 768px) {
            .container {
                padding: var(--spacing-lg);
            }
            
            .stats-grid {
                grid-template-columns: repeat(2, 1fr);
            }
            
            .controls {
                flex-direction: column;
            }
            
            .result-item {
                flex-direction: column;
                gap: var(--spacing-md);
            }
            
            .result-severity {
                width: auto;
            }
            
            .result-header {
                flex-direction: column;
                align-items: flex-start;
                gap: var(--spacing-sm);
            }
      }
    </style>
  </head>
  <body>
    <div class="header">
        <h1 class="title">Security Analysis</h1>
        <p class="subtitle">Comprehensive security vulnerability assessment</p>
        <div class="scan-info">
            <span class="scan-status" id="scan-status">Ready to scan</span>
            <span class="scan-time" id="scan-time"></span>
    </div>
    </div>
    
    <div class="stats-grid">
        <div class="stat-card stat-critical">
            <span class="stat-number" id="critical-count">0</span>
            <span class="stat-label">Critical</span>
    </div>
        <div class="stat-card stat-high">
            <span class="stat-number" id="high-count">0</span>
            <span class="stat-label">High</span>
        </div>
        <div class="stat-card stat-medium">
            <span class="stat-number" id="medium-count">0</span>
            <span class="stat-label">Medium</span>
        </div>
        <div class="stat-card stat-low">
            <span class="stat-number" id="low-count">0</span>
            <span class="stat-label">Low</span>
        </div>
        <div class="stat-card">
            <span class="stat-number" id="total-count">0</span>
            <span class="stat-label">Total</span>
        </div>
    </div>
    
    <div class="controls">
        <button class="btn btn-primary" onclick="startScan()">Start Scan</button>
        <button class="btn btn-refresh" onclick="refreshResults()" id="refresh-btn">Refresh</button>
        <button class="btn btn-secondary" onclick="exportResults()">Export Results</button>
        <button class="btn btn-ghost" onclick="clearResults()">Clear Results</button>
    </div>
    
    <div class="results-section">
        <div class="results-header">
            <h2 class="results-title">Vulnerabilities</h2>
            <span class="results-count" id="results-count">0 found</span>
        </div>
        <div class="results-content" id="results-container">
            <div class="loading">
                <div class="loading-spinner"></div>
                Loading security analysis results...
            </div>
        </div>
    </div>
    
    <!-- Explanation Panel -->
    <div class="explanation-panel" id="explanationPanel">
        <div class="explanation-content">
            <div class="explanation-header">
                <h2 id="explanationTitle">AI Explanation</h2>
                <button class="close-btn" id="closeExplanation">Close</button>
            </div>
            <div class="explanation-text" id="explanationText">
                Loading explanation...
            </div>
        </div>
    </div>
    <script>
      const vscode = acquireVsCodeApi();
      let lastResults = [];
        
      function renderResults(results) {
            const container = document.getElementById('results-container');
            const stats = {
                total: results.length,
                critical: 0,
                high: 0,
                medium: 0,
                low: 0
            };
            
            results.forEach(r => {
                if (r.severity === 'CRITICAL' || r.severity === 'ERROR') stats.critical++;
                else if (r.severity === 'HIGH') stats.high++;
                else if (r.severity === 'MEDIUM' || r.severity === 'WARNING') stats.medium++;
                else stats.low++;
            });
            
            // Update stats
            document.getElementById('total-count').textContent = stats.total;
            document.getElementById('critical-count').textContent = stats.critical;
            document.getElementById('high-count').textContent = stats.high;
            document.getElementById('medium-count').textContent = stats.medium;
            document.getElementById('low-count').textContent = stats.low;
            
            // Update results count
            const countText = stats.total === 1 ? '1 found' : \`\${stats.total} found\`;
            document.getElementById('results-count').textContent = countText;
            
            if (results.length === 0) {
                container.innerHTML = \`
                    <div class="no-results">
                        <div class="no-results-icon">✓</div>
                        <div class="no-results-title">No Security Issues Found</div>
                        <div class="no-results-description">Your code appears to be secure. Great job!</div>
                    </div>
                \`;
          return;
        }
            
            let html = '';
            
            for (let i = 0; i < results.length; i++) {
                const r = results[i];
                let severityClass = 'severity-low';
                let severityText = r.severity || 'INFO';
                
                if (r.severity === 'ERROR' || r.severity === 'CRITICAL') {
                    severityClass = 'severity-critical';
                } else if (r.severity === 'HIGH') {
                    severityClass = 'severity-high';
                } else if (r.severity === 'MEDIUM' || r.severity === 'WARNING') {
                    severityClass = 'severity-medium';
                }
                
                const fileLine = r.path ? r.path + ':' + (r.start && r.start.line ? r.start.line : '') : (r.filename ? r.filename + ':' + (r.line_number || '') : '');
                const desc = (r.extra && r.extra.message) || r.issue_text || r.check_id || r.message || 'Security issue detected';
                const tool = r.tool || 'Unknown';
                
                html += \`
                    <div class="result-item">
                        <div class="result-severity">
                            <span class="severity-badge \${severityClass}">\${severityText}</span>
                        </div>
                        <div class="result-content">
                            <div class="result-header">
                                <h3 class="result-title">\${desc}</h3>
                                <div class="result-meta">
                                    <span class="tool-badge">\${tool}</span>
                                </div>
                            </div>
                            <div class="result-description">
                                <a href="#" class="result-file" onclick="openFile('\${r.path || r.filename}', \${r.start?.line || r.line_number || 1}); return false;">
                                    \${fileLine}
                                </a>
                            </div>
                            <div class="result-actions">
                                <button class="action-btn" onclick="explainVulnerability(\${i})">Explain</button>
                                \${r.patch ? \`<button class="action-btn action-btn-primary" onclick="applyPatch(\${i})">Apply Fix</button>\` : ''}
                            </div>
                        </div>
                    </div>
                \`;
            }
            
            container.innerHTML = html;
            
            // Add event listeners for Fix it/Explain buttons
            document.querySelectorAll('.fix-btn').forEach(btn => {
          btn.addEventListener('click', function() {
                    const index = parseInt(this.getAttribute('data-index'));
                    vscode.postMessage({ command: 'fixIt', index: index });
          });
        });
            
            document.querySelectorAll('.explain-btn').forEach(btn => {
          btn.addEventListener('click', function() {
                    const index = parseInt(this.getAttribute('data-index'));
                    vscode.postMessage({ command: 'explain', index: index });
                });
            });
            
            // Add event listeners for Patch buttons
            document.querySelectorAll('.patch-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const index = parseInt(this.getAttribute('data-index'));
                    const patchIndex = parseInt(this.getAttribute('data-patch'));
                    vscode.postMessage({ command: 'applyPatch', index: index, patchIndex: patchIndex });
          });
        });
      }
        
        function startScan() {
            updateScanStatus('Scanning...');
            updateRefreshButton(true);
            vscode.postMessage({ command: 'scanMe' });
        }
        
        function refreshResults() {
            updateScanStatus('Refreshing...');
            updateRefreshButton(true);
            vscode.postMessage({ command: 'refresh' });
        }
        
        function exportResults() {
            vscode.postMessage({ command: 'exportResults' });
        }
        
        function clearResults() {
            vscode.postMessage({ command: 'clear' });
        }
        
        function updateScanStatus(status, time = null) {
            document.getElementById('scan-status').textContent = status;
            if (time) {
                document.getElementById('scan-time').textContent = time;
            }
        }
        
        function updateRefreshButton(scanning = false) {
            const refreshBtn = document.getElementById('refresh-btn');
            if (scanning) {
                refreshBtn.disabled = true;
                refreshBtn.textContent = 'Scanning...';
            } else {
                refreshBtn.disabled = false;
                refreshBtn.textContent = 'Refresh';
            }
        }
        
        // Explanation panel functionality
        document.getElementById('closeExplanation').addEventListener('click', function() {
            document.getElementById('explanationPanel').style.display = 'none';
        });
        
        // Close explanation panel when clicking outside
        document.getElementById('explanationPanel').addEventListener('click', function(e) {
            if (e.target === this) {
                this.style.display = 'none';
            }
        });
        
        function explainVulnerability(index) {
            // Show loading state
            showExplanation('Loading...', 'Getting AI explanation for this vulnerability...');
            
            // Send message to extension to get AI explanation
            vscode.postMessage({ 
                command: 'explainVulnerability', 
                index: index 
            });
        }
        
        function showExplanation(title, text) {
            document.getElementById('explanationTitle').textContent = title;
            document.getElementById('explanationText').textContent = text;
            document.getElementById('explanationPanel').style.display = 'block';
        }
        
      window.addEventListener('message', function(event) {
            const message = event.data;
        if (message.command === 'updateResults') {
          renderResults(message.results);
                updateScanStatus('Scan complete');
                updateRefreshButton(false);
                const now = new Date();
                document.getElementById('scan-time').textContent = now.toLocaleTimeString();
        }
        if (message.command === 'llmResponse') {
                const title = message.action.toUpperCase() + ' Result for Issue #' + (message.index + 1);
                showExplanation(title, message.response);
            }
        if (message.command === 'showExplanation') {
                showExplanation(message.title, message.text);
            }
            if (message.command === 'applyPatch') {
                const title = 'Apply Patch for Issue #' + (message.index + 1);
                const patch = lastResults[message.index].patches[message.patchIndex];
                const patchInfo = \`Patch: \${patch.explanation}\\n\\nSecurity Improvements:\\n\${patch.securityImprovements.join('\\n')}\\n\\nTesting Notes:\\n\${patch.testingNotes}\\n\\nDiff:\\n\${patch.diff}\`;
                showExplanation(title, patchInfo);
        }
      });
    </script>
  </body>
</html>`;
}

function getTeamDashboardHtml(teamLead: TeamLead, reports: TeamVulnerabilityReport[]): string {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <title>CipherMate Team Dashboard</title>
    <style>
      body { font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
      .header { background: var(--vscode-sideBar-background); padding: 1rem; border-bottom: 1px solid var(--vscode-editorWidget-border); }
      .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; padding: 1rem; }
      .stat-card { background: var(--vscode-editorWidget-background); padding: 1rem; border-radius: 6px; }
      .member-list { padding: 1rem; }
      .member-item { background: var(--vscode-editorWidget-background); margin: 0.5rem 0; padding: 1rem; border-radius: 6px; }
      .reporting-settings { padding: 1rem; }
      .form-group { margin: 1rem 0; }
      label { display: block; margin-bottom: 0.5rem; }
      input, select { width: 100%; padding: 0.5rem; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; }
      button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>CipherMate Team Dashboard</h1>
      <p>Team Lead: ${teamLead.name}</p>
    </div>
    
    <div class="stats">
      <div class="stat-card">
        <h3>Team Members</h3>
        <p>${teamLead.teamMembers.length} active</p>
      </div>
      <div class="stat-card">
        <h3>Active Reports</h3>
        <p>${reports.filter(r => r.status === 'new' || r.status === 'in_progress').length} pending</p>
      </div>
      <div class="stat-card">
        <h3>Total Vulnerabilities</h3>
        <p>${reports.length} tracked</p>
      </div>
    </div>
    
    <div class="reporting-settings">
      <h2>Reporting Settings</h2>
      <div class="form-group">
        <label>Enable Reporting:</label>
        <input type="checkbox" id="enableReporting" ${teamLead.reportingSettings.enabled ? 'checked' : ''} onchange="updateSettings()">
      </div>
      <div class="form-group">
        <label>Report Threshold:</label>
        <select id="reportThreshold" onchange="updateSettings()">
          <option value="critical" ${teamLead.reportingSettings.reportThreshold === 'critical' ? 'selected' : ''}>Critical Only</option>
          <option value="high" ${teamLead.reportingSettings.reportThreshold === 'high' ? 'selected' : ''}>High and Above</option>
          <option value="medium" ${teamLead.reportingSettings.reportThreshold === 'medium' ? 'selected' : ''}>Medium and Above</option>
          <option value="low" ${teamLead.reportingSettings.reportThreshold === 'low' ? 'selected' : ''}>Low and Above</option>
          <option value="all" ${teamLead.reportingSettings.reportThreshold === 'all' ? 'selected' : ''}>All Issues</option>
        </select>
      </div>
      <div class="form-group">
        <label>Report Frequency:</label>
        <select id="reportFrequency" onchange="updateSettings()">
          <option value="real-time" ${teamLead.reportingSettings.reportFrequency === 'real-time' ? 'selected' : ''}>Real-time</option>
          <option value="daily" ${teamLead.reportingSettings.reportFrequency === 'daily' ? 'selected' : ''}>Daily</option>
          <option value="weekly" ${teamLead.reportingSettings.reportFrequency === 'weekly' ? 'selected' : ''}>Weekly</option>
          <option value="monthly" ${teamLead.reportingSettings.reportFrequency === 'monthly' ? 'selected' : ''}>Monthly</option>
        </select>
      </div>
    </div>
    
    <div class="member-list">
      <h2>Team Members</h2>
      ${teamLead.teamMembers.map(member => `
        <div class="member-item">
          <h3>${member.name}</h3>
          <p>Role: ${member.role} | Level: ${member.securityLevel}</p>
          <p>Vulnerabilities Found: ${member.vulnerabilitiesFound} | Fixed: ${member.vulnerabilitiesFixed}</p>
          <p>Last Activity: ${new Date(member.lastActivity).toLocaleDateString()}</p>
        </div>
      `).join('')}
    </div>
    
    <script>
      const vscode = acquireVsCodeApi();
      
      function updateSettings() {
        const settings = {
          enabled: document.getElementById('enableReporting').checked,
          reportThreshold: document.getElementById('reportThreshold').value,
          reportFrequency: document.getElementById('reportFrequency').value,
          reportTo: ${JSON.stringify(teamLead.reportingSettings.reportTo)},
          includePatterns: ${teamLead.reportingSettings.includePatterns},
          includeLearningProgress: ${teamLead.reportingSettings.includeLearningProgress},
          includeTeamAnalytics: ${teamLead.reportingSettings.includeTeamAnalytics}
        };
        
        vscode.postMessage({ command: 'updateReportingSettings', settings });
      }
    </script>
  </body>
  </html>
  `;
}

function getUserProfileHtml(user: UserProfile | null, history: VulnerabilityHistory[]): string {
  if (!user) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CipherMate - Authentication</title>
        <style>
            :root {
                --border-radius: 0;
                --spacing-xs: 4px;
                --spacing-sm: 8px;
                --spacing-md: 12px;
                --spacing-lg: 16px;
                --spacing-xl: 20px;
                --spacing-xxl: 24px;
                --spacing-xxxl: 32px;
                --font-size-xs: 11px;
                --font-size-sm: 12px;
                --font-size-md: 13px;
                --font-size-lg: 14px;
                --font-size-xl: 16px;
                --font-size-xxl: 18px;
                --font-size-xxxl: 24px;
                --font-weight-normal: 400;
                --font-weight-medium: 500;
                --font-weight-semibold: 600;
                --font-weight-bold: 700;
            }
            
            * { box-sizing: border-box; }
            
            body {
                font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
                font-size: var(--font-size-md);
                color: var(--vscode-foreground);
                background: var(--vscode-editor-background);
                margin: 0;
                padding: var(--spacing-xl);
                line-height: 1.5;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .login-container {
                max-width: 480px;
                width: 100%;
                text-align: center;
            }
            
            .login-card {
                background: var(--vscode-panel-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 0;
                padding: var(--spacing-xxxl);
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
                position: relative;
                overflow: hidden;
            }
            
            .login-card::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 3px;
                background: linear-gradient(90deg, var(--vscode-textLink-foreground), var(--vscode-textLink-foreground));
            }
            
            .logo {
                font-size: var(--font-size-xxxl);
                font-weight: var(--font-weight-bold);
                color: var(--vscode-textLink-foreground);
                margin-bottom: var(--spacing-lg);
                letter-spacing: -0.5px;
            }
            
            .login-title {
                font-size: var(--font-size-xl);
                font-weight: var(--font-weight-semibold);
                margin-bottom: var(--spacing-sm);
                color: var(--vscode-foreground);
            }
            
            .login-subtitle {
                color: var(--vscode-descriptionForeground);
                margin-bottom: var(--spacing-xxxl);
                font-size: var(--font-size-sm);
                line-height: 1.6;
            }
            
            .auth-providers {
                display: flex;
                flex-direction: column;
                gap: var(--spacing-md);
                margin-bottom: var(--spacing-xxl);
            }
            
            .auth-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: var(--spacing-md);
                padding: var(--spacing-md) var(--spacing-xl);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 0;
                font-size: var(--font-size-md);
                font-weight: var(--font-weight-medium);
                cursor: pointer;
                transition: all 0.2s ease;
                text-decoration: none;
                color: var(--vscode-foreground);
                background: var(--vscode-button-background);
                position: relative;
                overflow: hidden;
            }
            
            .auth-btn:hover {
                background: var(--vscode-button-hoverBackground);
                border-color: var(--vscode-textLink-foreground);
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            }
            
            .auth-btn:active {
                transform: translateY(0);
            }
            
            .auth-btn.github {
                background: #24292e;
                color: white;
                border-color: #24292e;
            }
            
            .auth-btn.github:hover {
                background: #1a1e22;
                border-color: #1a1e22;
            }
            
            .auth-btn.google {
                background: #ffffff;
                color: #5f6368;
                border-color: #dadce0;
            }
            
            .auth-btn.google:hover {
                background: #f8f9fa;
                border-color: #5f6368;
            }
            
            .auth-btn.microsoft {
                background: #0078d4;
                color: white;
                border-color: #0078d4;
            }
            
            .auth-btn.microsoft:hover {
                background: #106ebe;
                border-color: #106ebe;
            }
            
            .auth-icon {
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: var(--font-size-lg);
            }
            
            .auth-text {
                flex: 1;
                text-align: center;
            }
            
            .divider {
                display: flex;
                align-items: center;
                margin: var(--spacing-xxl) 0;
                color: var(--vscode-descriptionForeground);
                font-size: var(--font-size-sm);
            }
            
            .divider::before,
            .divider::after {
                content: '';
                flex: 1;
                height: 1px;
                background: var(--vscode-panel-border);
            }
            
            .divider span {
                padding: 0 var(--spacing-md);
                background: var(--vscode-panel-background);
            }
            
            .security-note {
                padding: var(--spacing-md);
                background: var(--vscode-input-background);
                border-radius: var(--border-radius);
                font-size: var(--font-size-xs);
                color: var(--vscode-descriptionForeground);
                line-height: 1.5;
                border-left: 3px solid var(--vscode-textLink-foreground);
            }
            
            .security-note strong {
                color: var(--vscode-foreground);
            }
            
            .loading {
                opacity: 0.6;
                pointer-events: none;
            }
            
            .loading .auth-btn {
                position: relative;
            }
            
            .loading .auth-btn::after {
                content: '';
                position: absolute;
                top: 50%;
                left: 50%;
                width: 16px;
                height: 16px;
                margin: -8px 0 0 -8px;
                border: 2px solid transparent;
                border-top: 2px solid currentColor;
                border-radius: 0 !important;
                animation: spin 1s linear infinite;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    </head>
    <body>
        <div class="login-container">
            <div class="login-card">
                <div class="logo">CipherMate</div>
                <h2 class="login-title">Welcome to CipherMate</h2>
                <p class="login-subtitle">
                    Choose your preferred authentication method to access advanced security analysis features.
                    Your data is encrypted and stored securely.
                </p>
                
                <div class="auth-providers">
                    <button class="auth-btn github" onclick="loginWithProvider('github')">
                        <div class="auth-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                            </svg>
                        </div>
                        <div class="auth-text">Continue with GitHub</div>
                    </button>
                    
                    <button class="auth-btn google" onclick="loginWithProvider('google')">
                        <div class="auth-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                            </svg>
                        </div>
                        <div class="auth-text">Continue with Google</div>
                    </button>
                    
                    <button class="auth-btn microsoft" onclick="loginWithProvider('microsoft')">
                        <div class="auth-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24">
                                <path fill="#F25022" d="M1 1h10v10H1z"/>
                                <path fill="#00A4EF" d="M13 1h10v10H13z"/>
                                <path fill="#7FBA00" d="M1 13h10v10H1z"/>
                                <path fill="#FFB900" d="M13 13h10v10H13z"/>
                            </svg>
                        </div>
                        <div class="auth-text">Continue with Microsoft</div>
                    </button>
                </div>
                
                <div class="divider">
                    <span>Secure Authentication</span>
                </div>
                
                <div class="security-note">
                    <strong>Enterprise Security:</strong> All authentication is handled through OAuth 2.0 with industry-standard encryption. 
                    Your credentials are never stored locally, and all data is encrypted using AES-256-CBC.
                </div>
            </div>
        </div>
        
        <script>
            const vscode = acquireVsCodeApi();
            
            function loginWithProvider(provider) {
                // Add loading state
                document.body.classList.add('loading');
                
                vscode.postMessage({
                    command: 'loginWithProvider',
                    provider: provider
                });
            }
            
            // Legacy function for backward compatibility
            function loginWithGitHub() {
                loginWithProvider('github');
            }
        </script>
    </body>
    </html>
    `;
  }

  // Group history by date
  const historyByDate = history.reduce((acc, entry) => {
    const date = entry.scanDate.toDateString();
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(entry);
    return acc;
  }, {} as { [key: string]: VulnerabilityHistory[] });

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CipherMate - User Profile</title>
        <style>
            :root {
                --border-radius: 0;
                --spacing-xs: 4px;
                --spacing-sm: 8px;
                --spacing-md: 12px;
                --spacing-lg: 16px;
                --spacing-xl: 20px;
                --spacing-xxl: 24px;
                --font-size-xs: 11px;
                --font-size-sm: 12px;
                --font-size-md: 13px;
                --font-size-lg: 14px;
                --font-size-xl: 16px;
                --font-size-xxl: 18px;
                --font-weight-normal: 400;
                --font-weight-medium: 500;
                --font-weight-semibold: 600;
                --font-weight-bold: 700;
            }
            
            * { box-sizing: border-box; }
            
            body {
                font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
                font-size: var(--font-size-md);
                color: var(--vscode-foreground);
                background: var(--vscode-editor-background);
                margin: 0;
                padding: var(--spacing-xl);
                line-height: 1.5;
            }
            
            .profile-header {
                background: var(--vscode-panel-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: var(--border-radius);
                padding: var(--spacing-xl);
                margin-bottom: var(--spacing-xl);
                display: flex;
                align-items: center;
                gap: var(--spacing-lg);
            }
            
            .avatar {
                width: 80px;
                height: 80px;
                border-radius: 0 !important;
                border: 2px solid var(--vscode-panel-border);
            }
            
            .profile-info h1 {
                margin: 0 0 var(--spacing-sm) 0;
                font-size: var(--font-size-xl);
                font-weight: var(--font-weight-semibold);
            }
            
            .profile-info p {
                margin: 0;
                color: var(--vscode-descriptionForeground);
            }
            
            .profile-stats {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                gap: var(--spacing-md);
                margin-top: var(--spacing-lg);
            }
            
            .stat-item {
                text-align: center;
                padding: var(--spacing-md);
                background: var(--vscode-input-background);
                border-radius: var(--border-radius);
            }
            
            .stat-value {
                font-size: var(--font-size-lg);
                font-weight: var(--font-weight-bold);
                color: var(--vscode-textLink-foreground);
                display: block;
            }
            
            .stat-label {
                font-size: var(--font-size-xs);
                color: var(--vscode-descriptionForeground);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .history-section {
                background: var(--vscode-panel-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: var(--border-radius);
                padding: var(--spacing-xl);
                margin-bottom: var(--spacing-xl);
            }
            
            .section-title {
                font-size: var(--font-size-lg);
                font-weight: var(--font-weight-semibold);
                margin: 0 0 var(--spacing-lg) 0;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            
            .date-group {
                margin-bottom: var(--spacing-lg);
            }
            
            .date-header {
                font-size: var(--font-size-md);
                font-weight: var(--font-weight-medium);
                color: var(--vscode-textLink-foreground);
                margin-bottom: var(--spacing-sm);
                padding-bottom: var(--spacing-xs);
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            
            .history-item {
                background: var(--vscode-input-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: var(--border-radius);
                padding: var(--spacing-md);
                margin-bottom: var(--spacing-sm);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .history-info h4 {
                margin: 0 0 var(--spacing-xs) 0;
                font-size: var(--font-size-md);
                font-weight: var(--font-weight-medium);
            }
            
            .history-info p {
                margin: 0;
                font-size: var(--font-size-sm);
                color: var(--vscode-descriptionForeground);
            }
            
            .vulnerability-summary {
                display: flex;
                gap: var(--spacing-sm);
            }
            
            .severity-badge {
                padding: 2px 6px;
                border-radius: 3px;
                font-size: var(--font-size-xs);
                font-weight: var(--font-weight-medium);
            }
            
            .severity-critical { background: #dc3545; color: white; }
            .severity-high { background: #fd7e14; color: white; }
            .severity-medium { background: #ffc107; color: black; }
            .severity-low { background: #28a745; color: white; }
            
            .logout-btn {
                background: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
                border: 1px solid var(--vscode-button-border);
                border-radius: var(--border-radius);
                padding: var(--spacing-sm) var(--spacing-md);
                font-size: var(--font-size-sm);
                cursor: pointer;
            }
            
            .logout-btn:hover {
                background: var(--vscode-button-secondaryHoverBackground);
            }
        </style>
    </head>
    <body>
        <div class="profile-header">
            <img src="${user.avatarUrl}" alt="${user.displayName}" class="avatar">
            <div class="profile-info">
                <h1>${user.displayName}</h1>
                <p>@${user.username}</p>
                <p>${user.email}</p>
            </div>
            <button class="logout-btn" onclick="logout()">Logout</button>
        </div>
        
        <div class="profile-stats">
            <div class="stat-item">
                <span class="stat-value">${history.length}</span>
                <span class="stat-label">Total Scans</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${history.reduce((sum, h) => sum + h.summary.total, 0)}</span>
                <span class="stat-label">Vulnerabilities Found</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${history.reduce((sum, h) => sum + h.summary.critical, 0)}</span>
                <span class="stat-label">Critical Issues</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${new Set(history.map(h => h.projectName)).size}</span>
                <span class="stat-label">Projects Scanned</span>
            </div>
        </div>
        
        <div class="history-section">
            <h2 class="section-title">
                Vulnerability History
                <span style="font-size: var(--font-size-sm); color: var(--vscode-descriptionForeground);">
                    ${history.length} scans
                </span>
            </h2>
            
            ${Object.keys(historyByDate).length === 0 ? 
                '<p style="text-align: center; color: var(--vscode-descriptionForeground);">No scan history available</p>' :
                Object.entries(historyByDate).map(([date, entries]) => `
                    <div class="date-group">
                        <div class="date-header">${date}</div>
                        ${entries.map(entry => `
                            <div class="history-item">
                                <div class="history-info">
                                    <h4>${entry.projectName} - ${entry.scanType}</h4>
                                    <p>${entry.scanDate.toLocaleTimeString()}</p>
                                </div>
                                <div class="vulnerability-summary">
                                    ${entry.summary.critical > 0 ? `<span class="severity-badge severity-critical">${entry.summary.critical} Critical</span>` : ''}
                                    ${entry.summary.high > 0 ? `<span class="severity-badge severity-high">${entry.summary.high} High</span>` : ''}
                                    ${entry.summary.medium > 0 ? `<span class="severity-badge severity-medium">${entry.summary.medium} Medium</span>` : ''}
                                    ${entry.summary.low > 0 ? `<span class="severity-badge severity-low">${entry.summary.low} Low</span>` : ''}
                                    <span style="font-size: var(--font-size-sm); color: var(--vscode-descriptionForeground);">
                                        ${entry.summary.total} total
                                    </span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `).join('')
            }
        </div>
        
        <script>
            const vscode = acquireVsCodeApi();
            
            function logout() {
                vscode.postMessage({
                    command: 'logout'
                });
      }
    </script>
  </body>
  </html>
  `;
}

function getTeamSetupHtml(): string {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <title>CipherMate Team Setup</title>
    <style>
      body { font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); padding: 2rem; }
      .form-group { margin: 1rem 0; }
      label { display: block; margin-bottom: 0.5rem; }
      input, select { width: 100%; padding: 0.5rem; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; }
      button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; margin-top: 1rem; }
    </style>
  </head>
  <body>
    <h1>Setup Team Collaboration</h1>
    
    <div class="form-group">
      <label>Team Lead Name:</label>
      <input type="text" id="teamLeadName" placeholder="Your name">
    </div>
    
    <div class="form-group">
      <label>Team Lead Email:</label>
      <input type="email" id="teamLeadEmail" placeholder="your.email@company.com">
    </div>
    
    <div class="form-group">
      <label>Reporting Email:</label>
      <input type="email" id="reportingEmail" placeholder="security@company.com">
    </div>
    
    <div class="form-group">
      <label>Initial Team Members (comma-separated):</label>
      <input type="text" id="teamMembers" placeholder="john@company.com, jane@company.com">
    </div>
    
    <button onclick="createTeam()">Create Team</button>
    
    <script>
      const vscode = acquireVsCodeApi();
      
      function createTeam() {
        const teamData = {
          id: 'team_' + Date.now(),
          name: document.getElementById('teamLeadName').value,
          email: document.getElementById('teamLeadEmail').value,
          permissions: {
            canManageMembers: true,
            canViewReports: true,
            canEnforcePolicies: true,
            canOverrideSettings: true,
            canAccessAnalytics: true,
            canManageIntegrations: true
          },
          teamMembers: document.getElementById('teamMembers').value.split(',').map(email => ({
            id: 'member_' + Date.now() + Math.random(),
            name: email.split('@')[0],
            email: email.trim(),
            role: 'developer',
            securityLevel: 'beginner',
            isActive: true,
            lastActivity: Date.now(),
            learningProgress: {},
            vulnerabilitiesFound: 0,
            vulnerabilitiesFixed: 0
          })),
          reportingSettings: {
            enabled: true,
            reportThreshold: 'high',
            reportFrequency: 'real-time',
            reportTo: [document.getElementById('reportingEmail').value],
            includePatterns: true,
            includeLearningProgress: true,
            includeTeamAnalytics: true
          },
          securityPolicies: []
        };
        
        vscode.postMessage({ command: 'createTeam', teamData });
      }
    </script>
  </body>
  </html>
  `;
}

function getSidebarSettingsHtml(settings: any, panel: vscode.WebviewPanel, context: vscode.ExtensionContext): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CipherMate Settings</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: var(--vscode-font-family);
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            height: 100vh;
            display: flex;
            overflow: hidden;
        }
        .sidebar {
            width: 250px;
            background: var(--vscode-sideBar-background);
            border-right: 1px solid var(--vscode-panel-border);
            display: flex;
            flex-direction: column;
            overflow-y: auto;
        }
        .sidebar-header {
            padding: 20px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .sidebar-header h2 {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 4px;
        }
        .sidebar-header p {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .nav-item {
            padding: 10px 16px;
            cursor: pointer;
            border-left: 3px solid transparent;
            transition: all 0.2s;
            font-size: 13px;
        }
        .nav-item:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .nav-item.active {
            background: var(--vscode-list-activeSelectionBackground);
            border-left-color: var(--vscode-textLink-foreground);
            color: var(--vscode-textLink-foreground);
        }
        .main-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .content-header {
            padding: 20px 24px;
            border-bottom: 1px solid var(--vscode-panel-border);
            background: var(--vscode-titleBar-activeBackground);
        }
        .content-header h1 {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 4px;
        }
        .content-header p {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .content-body {
            flex: 1;
            overflow-y: auto;
            padding: 24px;
        }
        .section {
            display: none;
        }
        .section.active {
            display: block;
        }
        .setting-group {
            margin-bottom: 24px;
        }
        .setting-group-title {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 12px;
            color: var(--vscode-foreground);
        }
        .setting-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .setting-label {
            flex: 1;
        }
        .setting-label-title {
            font-size: 13px;
            font-weight: 500;
            margin-bottom: 4px;
        }
        .setting-label-desc {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .setting-control {
            margin-left: 16px;
        }
        input[type="text"],
        input[type="url"],
        select {
            padding: 6px 10px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-family: inherit;
            font-size: 13px;
            min-width: 200px;
        }
        input:focus, select:focus {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: -1px;
        }
        .checkbox-wrapper {
            position: relative;
            display: inline-block;
            width: 44px;
            height: 24px;
        }
        .checkbox-wrapper input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        .checkbox-slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 24px;
            transition: 0.2s;
        }
        .checkbox-slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 2px;
            bottom: 2px;
            background-color: var(--vscode-foreground);
            border-radius: 50%;
            transition: 0.2s;
        }
        input:checked + .checkbox-slider {
            background-color: var(--vscode-button-background);
        }
        input:checked + .checkbox-slider:before {
            transform: translateX(20px);
        }
        .save-button {
            position: fixed;
            bottom: 20px;
            right: 24px;
            padding: 10px 20px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 500;
            font-size: 13px;
        }
        .save-button:hover {
            opacity: 0.8;
        }
    </style>
</head>
<body>
    <div class="sidebar">
        <div class="sidebar-header">
            <h2>CIPHERMATE</h2>
            <p>Settings</p>
        </div>
        <div class="nav-item active" data-section="providers">Providers</div>
        <div class="nav-item" data-section="scanning">Scanning</div>
        <div class="nav-item" data-section="ai">AI Configuration</div>
        <div class="nav-item" data-section="notifications">Notifications</div>
        <div class="nav-item" data-section="team">Team</div>
        <div class="nav-item" data-section="advanced">Advanced</div>
    </div>
    <div class="main-content">
        <div class="content-header">
            <h1 id="sectionTitle">Providers</h1>
            <p id="sectionDescription">Configure AI providers and models</p>
        </div>
        <div class="content-body">
            <div class="section active" id="providers">
                <div class="setting-group">
                    <div class="setting-group-title">API Provider</div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Provider Type</div>
                            <div class="setting-label-desc">Choose your AI provider</div>
                        </div>
                        <div class="setting-control">
                            <select id="aiProvider">
                                <option value="local" ${settings.aiProvider === 'local' ? 'selected' : ''}>Local (LM Studio/Ollama)</option>
                                <option value="openrouter" ${settings.aiProvider === 'openrouter' ? 'selected' : ''}>OpenRouter</option>
                                <option value="openai" ${settings.aiProvider === 'openai' ? 'selected' : ''}>OpenAI</option>
                                <option value="anthropic" ${settings.aiProvider === 'anthropic' ? 'selected' : ''}>Anthropic</option>
                                <option value="gemini" ${settings.aiProvider === 'gemini' ? 'selected' : ''}>Google Gemini</option>
                                <option value="custom" ${settings.aiProvider === 'custom' ? 'selected' : ''}>Custom</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="setting-group">
                    <div class="setting-group-title">Local AI Configuration</div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">LM Studio URL</div>
                            <div class="setting-label-desc">Local AI endpoint (default: http://localhost:1234)</div>
                        </div>
                        <div class="setting-control">
                            <input type="url" id="lmStudioUrl" value="${settings.lmStudioUrl || 'http://localhost:1234/v1/chat/completions'}" />
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Ollama URL</div>
                            <div class="setting-label-desc">Ollama endpoint (default: http://localhost:11434)</div>
                        </div>
                        <div class="setting-control">
                            <input type="url" id="ollamaUrl" value="${settings.ollamaUrl || 'http://localhost:11434/v1/chat/completions'}" />
                        </div>
                    </div>
                </div>
            </div>
            <div class="section" id="scanning">
                <div class="setting-group">
                    <div class="setting-group-title">Scanning Tools</div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Enable Semgrep</div>
                            <div class="setting-label-desc">Use Semgrep for static analysis</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" id="enableSemgrep" ${settings.enableSemgrep ? 'checked' : ''} />
                                <span class="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Enable Bandit</div>
                            <div class="setting-label-desc">Use Bandit for Python security scanning</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" id="enableBandit" ${settings.enableBandit ? 'checked' : ''} />
                                <span class="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
            <div class="section" id="ai">
                <div class="setting-group">
                    <div class="setting-group-title">AI Configuration</div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Use Cloud AI</div>
                            <div class="setting-label-desc">Use cloud-based AI service instead of local</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" id="useCloudAI" ${settings.useCloudAI ? 'checked' : ''} />
                                <span class="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
            <div class="section" id="notifications">
                <div class="setting-group">
                    <div class="setting-group-title">Notification Settings</div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Enable Notifications</div>
                            <div class="setting-label-desc">Show notifications for scan results</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" id="enableNotifications" ${settings.enableNotifications !== false ? 'checked' : ''} />
                                <span class="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
            <div class="section" id="team">
                <div class="setting-group">
                    <div class="setting-group-title">Team Settings</div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Team Collaboration</div>
                            <div class="setting-label-desc">Enable team features</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" id="enableTeam" />
                                <span class="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
            <div class="section" id="advanced">
                <div class="setting-group">
                    <div class="setting-group-title">Advanced Settings</div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Debug Mode</div>
                            <div class="setting-label-desc">Enable debug logging</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" id="debugMode" />
                                <span class="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <button class="save-button" onclick="saveSettings()">Save</button>
    <script>
        const vscode = acquireVsCodeApi();
        const sections = {
            providers: { title: 'Providers', desc: 'Configure AI providers and models' },
            scanning: { title: 'Scanning', desc: 'Configure scanning tools and behavior' },
            ai: { title: 'AI Configuration', desc: 'Configure AI settings' },
            notifications: { title: 'Notifications', desc: 'Configure notification preferences' },
            team: { title: 'Team', desc: 'Configure team collaboration settings' },
            advanced: { title: 'Advanced', desc: 'Advanced configuration options' }
        };
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const section = item.dataset.section;
                switchSection(section);
            });
        });
        function switchSection(section) {
            document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
            document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
            document.querySelector(\`[data-section="\${section}"]\`).classList.add('active');
            document.getElementById(section).classList.add('active');
            document.getElementById('sectionTitle').textContent = sections[section].title;
            document.getElementById('sectionDescription').textContent = sections[section].desc;
        }
        function saveSettings() {
            const settings = {
                aiProvider: document.getElementById('aiProvider').value,
                lmStudioUrl: document.getElementById('lmStudioUrl').value,
                ollamaUrl: document.getElementById('ollamaUrl').value,
                enableSemgrep: document.getElementById('enableSemgrep').checked,
                enableBandit: document.getElementById('enableBandit').checked,
                scanOnSave: document.getElementById('scanOnSave') ? document.getElementById('scanOnSave').checked : true,
                useCloudAI: document.getElementById('useCloudAI').checked,
                enableNotifications: document.getElementById('enableNotifications').checked
            };
            vscode.postMessage({ command: 'saveSettings', settings: settings });
        }
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'settingsSaved') {
                vscode.postMessage({ command: 'showStatus', text: 'Settings saved successfully' });
            }
        });
    </script>
</body>
</html>`;
}

