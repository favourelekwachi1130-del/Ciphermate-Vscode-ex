import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

// Mitigate MaxListenersExceededWarning (e.g. from winston/file streams)
EventEmitter.defaultMaxListeners = 200;
import { OAuthCallbackServer } from './oauth/callback-server';
import { RedTeamOperationsCenter } from './redteam/operations-center';
import { PenetrationTestingEngine } from './redteam/penetration-testing';
import { SocialEngineeringToolkit } from './redteam/social-engineering';
import { AILearningEngine } from './redteam/ai-learning-engine';
import { AIAgentCore } from './ai-agent/core';
import { ChatInterface } from './ai-agent/chat-interface';
import { ScanDataService } from './database/scan-data-service';
import { DiskStorageService } from './storage/disk-storage-service';
import { ApiKeyStorage } from './core/api-key-storage';
import { getLiveDiagnosticsService } from './core/live-diagnostics-service';
import { wrapWebviewHtml } from './security/webview-csp';

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
// Memory management: Limit scan results stored in memory
const MAX_SCAN_RESULTS_IN_MEMORY = 5000; // Limit to 5000 vulnerabilities in memory
let lastScanResults: any[] = [];

/**
 * Clean up old scan results to prevent memory issues
 */
function cleanupScanResults(): void {
  if (lastScanResults.length > MAX_SCAN_RESULTS_IN_MEMORY) {
    // Keep only the most recent results, sorted by severity
    const severityOrder: Record<string, number> = {
      'critical': 0, 'error': 0,
      'high': 1, 'warning': 1,
      'medium': 2, 'info': 2,
      'low': 3
    };
    
    lastScanResults = lastScanResults
      .sort((a, b) => {
        const aSev = severityOrder[(a.severity || '').toLowerCase()] ?? 4;
        const bSev = severityOrder[(b.severity || '').toLowerCase()] ?? 4;
        return aSev - bSev;
      })
      .slice(0, MAX_SCAN_RESULTS_IN_MEMORY);
    
    console.log(`Memory cleanup: Reduced scan results from ${lastScanResults.length + (lastScanResults.length - MAX_SCAN_RESULTS_IN_MEMORY)} to ${lastScanResults.length}`);
  }
}

// Store highlighted vulnerabilities for CodeLens
interface HighlightedVulnerability {
  filePath: string;
  lineNumber: number;
  vulnerability: any | null;
  document: string;
}

let highlightedVulnerabilities = new Map<string, HighlightedVulnerability>();

// CodeLens Provider for Explain buttons
class VulnerabilityCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  public refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    
    // Check if CodeLens is enabled
    const settings = getVSCodeSettings();
    if (!settings.ui.showCodeLens) {
      return codeLenses;
    }
    
    const filePath = document.uri.fsPath;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    
    // Normalize path for comparison
    const normalizePath = (p: string): string => {
      if (!p) return '';
      const normalized = path.normalize(p.trim());
      if (workspaceRoot && !path.isAbsolute(normalized)) {
        return path.join(workspaceRoot, normalized);
      }
      return normalized;
    };
    
    const normalizedDocPath = normalizePath(filePath);
    
    // Find vulnerabilities for this file
    for (const [key, info] of highlightedVulnerabilities.entries()) {
      const normalizedInfoPath = normalizePath(info.filePath);
      if (info.document === document.uri.toString() || normalizedInfoPath === normalizedDocPath) {
        const line = info.lineNumber - 1; // Convert to 0-based index
        if (line >= 0 && line < document.lineCount) {
          const range = new vscode.Range(line, 0, line, 0);
          const vulnerabilityType = info.vulnerability ? detectVulnerabilityType(info.vulnerability) : 'Security Issue';
          const codeLens = new vscode.CodeLens(range, {
            title: `🔍 Explain ${vulnerabilityType}`,
            command: 'ciphermate.explainLine',
            arguments: [info.filePath, info.lineNumber, info.vulnerability]
          });
          codeLenses.push(codeLens);
        }
      }
    }
    
    return codeLenses;
  }

  public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken): vscode.CodeLens {
    return codeLens;
  }
}

const vulnerabilityCodeLensProvider = new VulnerabilityCodeLensProvider();
let resultsPanel: vscode.WebviewPanel | null = null;
let encryptionKey: Buffer | null = null;
let activeCodeReviewer: ActiveCodeReviewer | null = null;
let scanDataService: ScanDataService | null = null;

// Export functions for use in other modules
export function getScanDataService(): ScanDataService | null {
  return scanDataService;
}

export function setLastScanResults(results: any[]): void {
  lastScanResults = results;
  cleanupScanResults(); // Clean up if too many results
}

export function getLastScanResults(): any[] {
  return Array.isArray(lastScanResults) ? lastScanResults : [];
}

export async function postResultsToWebviewExported(): Promise<void> {
  return postResultsToWebview();
}

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
let logger: any = null; // Will be initialized in activate()

// Encryption functions
function generateEncryptionKey(): Buffer {
  return crypto.randomBytes(32); // 256-bit key
}

function getEncryptionKey(context: vscode.ExtensionContext): Buffer {
  if (encryptionKey) {return encryptionKey;}
  
  const keyPath = path.join(context.globalStorageUri.fsPath, ENCRYPTION_KEY_FILE);
  
  try {
    // Ensure directory exists first
    const dir = path.dirname(keyPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Try to read existing key
    if (fs.existsSync(keyPath)) {
      const keyData = fs.readFileSync(keyPath);
      // Validate key is correct size (32 bytes for AES-256)
      if (keyData.length === 32) {
        encryptionKey = keyData;
        return encryptionKey;
      } else {
        // Invalid key file, regenerate
        console.warn('Invalid encryption key file detected, regenerating...');
      }
    }
    
    // Generate new key and save it
    encryptionKey = generateEncryptionKey();
    fs.writeFileSync(keyPath, encryptionKey, { mode: 0o600 }); // Secure file permissions
  } catch (error) {
    console.error('Error handling encryption key:', error);
    // Use a deterministic fallback key based on storage path to maintain consistency
    // This ensures the same key is used even if file operations fail
    const storagePath = context.globalStorageUri.fsPath;
    encryptionKey = crypto.scryptSync(storagePath + 'ciphermate-stable-key', 'salt-v1', 32);
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
    // Validate encrypted data format
    if (!encryptedData || typeof encryptedData !== 'string') {
      return null;
    }
    
    const parts = encryptedData.split(':');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      // Invalid format - clear corrupted data
      return null;
    }
    
    const key = getEncryptionKey(context);
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    // Validate IV and encrypted data are valid hex
    if (iv.length === 0 || encrypted.length === 0) {
      return null;
    }
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (error: any) {
    // Silently handle decryption failures - data may be corrupted or key changed
    // Don't log as error since this is expected when encryption key changes or data is corrupted
    if (error?.message?.includes('BAD_DECRYPT') || error?.code === 'ERR_OSSL_BAD_DECRYPT') {
      // This is a known case - corrupted or incompatible encrypted data
      // Return null to allow fallback to default values
      return null;
    }
    // For other errors, still return null but could log if needed
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

/**
 * Get VS Code configuration settings with defaults
 */
function getVSCodeSettings() {
  const config = vscode.workspace.getConfiguration('ciphermate');
  return {
    // Scanner settings
    scanners: {
      enableDependency: config.get<boolean>('scanners.enableDependency', true),
      enableSecrets: config.get<boolean>('scanners.enableSecrets', true),
      enableSmartContract: config.get<boolean>('scanners.enableSmartContract', true),
      enableCodePattern: config.get<boolean>('scanners.enableCodePattern', true),
      enableSemgrep: config.get<boolean>('enableSemgrep', true),
      enableBandit: config.get<boolean>('enableBandit', true),
    },
    // Scan behavior
    scanBehavior: {
      scanOnStartup: config.get<boolean>('scanBehavior.scanOnStartup', false),
      scanMode: config.get<'full' | 'incremental' | 'changed-only'>('scanBehavior.scanMode', 'incremental'),
      maxFileSize: config.get<number>('scanBehavior.maxFileSize', 1048576),
      excludePatterns: config.get<string[]>('scanBehavior.excludePatterns', [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/target/**',
        '**/vendor/**',
        '**/.venv/**',
        '**/venv/**'
      ]),
      severityFilter: config.get<string[]>('scanBehavior.severityFilter', []),
    },
    // CVE settings
    cve: {
      enabled: config.get<boolean>('cve.enabled', true),
      cacheEnabled: config.get<boolean>('cve.cacheEnabled', true),
      cacheTTLHours: config.get<number>('cve.cacheTTLHours', 24),
      apiPreference: config.get<'nvd' | 'mitre' | 'both'>('cve.apiPreference', 'both'),
      rateLimitDelay: config.get<number>('cve.rateLimitDelay', 200),
    },
    // UI settings
    ui: {
      showCodeLens: config.get<boolean>('ui.showCodeLens', true),
      highlightDuration: config.get<number>('ui.highlightDuration', 5),
      showGutterIcon: config.get<boolean>('ui.showGutterIcon', true),
      showOverviewRuler: config.get<boolean>('ui.showOverviewRuler', true),
      codeLensPosition: config.get<'above' | 'inline'>('ui.codeLensPosition', 'above'),
      theme: config.get<'auto' | 'light' | 'dark'>('ui.theme', 'auto'),
      compactMode: config.get<boolean>('ui.compactMode', false),
    },
    // Notification settings
    notifications: {
      enabled: config.get<boolean>('notifications.enabled', true),
      minSeverity: config.get<'info' | 'low' | 'medium' | 'high' | 'critical'>('notifications.minSeverity', 'medium'),
      showPopups: config.get<boolean>('notifications.showPopups', true),
      soundEnabled: config.get<boolean>('notifications.soundEnabled', false),
    },
    // Performance settings
    performance: {
      maxConcurrentScans: config.get<number>('performance.maxConcurrentScans', 5),
      scanTimeout: config.get<number>('performance.scanTimeout', 300000),
      cacheEnabled: config.get<boolean>('performance.cacheEnabled', true),
      cacheTTLHours: config.get<number>('performance.cacheTTLHours', 24),
    },
    // Explain settings
    explain: {
      enabled: config.get<boolean>('explain.enabled', true),
      provider: config.get<string>('explain.provider', 'same-as-chat'),
      maxLength: config.get<number>('explain.maxLength', 500),
      includeCodeContext: config.get<boolean>('explain.includeCodeContext', true),
      codeContextLines: config.get<number>('explain.codeContextLines', 5),
    },
    // AI provider (for providers section in settings UI)
    aiProvider: config.get<string>('ai.provider', 'openrouter'),
    openrouterModel: config.get<string>('ai.openrouter.model', 'openrouter/free'),
    conversationModel: config.get<string>('ai.conversationModel', ''),
  };
}

/**
 * Export comprehensive security audit report
 */
async function exportSecurityAudit(context: vscode.ExtensionContext): Promise<void> {
  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspacePath = workspaceFolders?.[0]?.uri.fsPath || 'Unknown';
    const workspaceName = workspaceFolders?.[0]?.name || 'Unknown Project';
    
    // Helper function to safely convert timestamp to Date
    const safeDate = (timestamp: any): Date => {
      if (timestamp instanceof Date) {
        return timestamp;
      }
      if (typeof timestamp === 'number') {
        return new Date(timestamp);
      }
      if (typeof timestamp === 'string') {
        const parsed = Date.parse(timestamp);
        return isNaN(parsed) ? new Date() : new Date(parsed);
      }
      return new Date();
    };
    
    // Get scan data
    let results = Array.isArray(lastScanResults) ? lastScanResults : [];
    let scanStatistics = null;
    let recentScans: any[] = [];
    
    if (scanDataService) {
      scanStatistics = scanDataService.getStatistics();
      recentScans = scanDataService.getRecentScans(10);
      
      // Ensure timestamps are Date objects
      recentScans = recentScans.map(scan => ({
        ...scan,
        timestamp: safeDate(scan.timestamp)
      }));
      
      if (recentScans.length > 0 && results.length === 0) {
        const latestScan = recentScans[0];
        const dbVulns = scanDataService.getVulnerabilities(latestScan.id);
        results = dbVulns.map(v => ({
          tool: v.type || 'Unknown',
          path: v.file,
          start: { line: v.line || 0 },
          severity: v.severity?.toUpperCase() || 'INFO',
          extra: {
            message: v.description || v.title,
            severity: v.severity,
            cwe: v.cwe,
            cve: v.cve
          },
          title: v.title,
          description: v.description,
          fix: v.fix,
          fixable: v.fixable,
          cwe: v.cwe,
          cve: v.cve,
          metadata: v.metadata ? JSON.parse(v.metadata) : {}
        }));
      }
    }
    
    // Calculate statistics
    const stats = {
      total: results.length,
      critical: results.filter((r: any) => (r.severity || '').toUpperCase() === 'CRITICAL' || (r.severity || '').toUpperCase() === 'ERROR').length,
      high: results.filter((r: any) => (r.severity || '').toUpperCase() === 'HIGH' || (r.severity || '').toUpperCase() === 'WARNING').length,
      medium: results.filter((r: any) => (r.severity || '').toUpperCase() === 'MEDIUM' || (r.severity || '').toUpperCase() === 'INFO').length,
      low: results.filter((r: any) => (r.severity || '').toUpperCase() === 'LOW').length
    };
    
    // Group by type and file
    const byType: Record<string, number> = {};
    const byFile: Record<string, number> = {};
    
    results.forEach((r: any) => {
      const type = r.tool || r.type || 'Unknown';
      byType[type] = (byType[type] || 0) + 1;
      
      const file = r.path || r.filename || 'Unknown';
      byFile[file] = (byFile[file] || 0) + 1;
    });
    
    // Generate HTML report
    const reportHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Security Audit Report - ${workspaceName}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #fff;
            padding: 40px;
        }
        .header {
            border-bottom: 3px solid #007acc;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .header h1 {
            color: #007acc;
            font-size: 32px;
            margin-bottom: 10px;
        }
        .header .meta {
            color: #666;
            font-size: 14px;
        }
        .executive-summary {
            background: #f5f5f5;
            padding: 25px;
            border-left: 4px solid #007acc;
            margin-bottom: 30px;
        }
        .executive-summary h2 {
            color: #007acc;
            margin-bottom: 15px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .stat-card {
            background: white;
            border: 2px solid #ddd;
            padding: 20px;
            text-align: center;
            border-radius: 0;
        }
        .stat-card.critical { border-color: #d32f2f; }
        .stat-card.high { border-color: #f57c00; }
        .stat-card.medium { border-color: #1976d2; }
        .stat-card.low { border-color: #666; }
        .stat-number {
            font-size: 36px;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .stat-card.critical .stat-number { color: #d32f2f; }
        .stat-card.high .stat-number { color: #f57c00; }
        .stat-card.medium .stat-number { color: #1976d2; }
        .stat-card.low .stat-number { color: #666; }
        .stat-label {
            text-transform: uppercase;
            font-size: 12px;
            letter-spacing: 1px;
            color: #666;
        }
        .section {
            margin: 40px 0;
        }
        .section h2 {
            color: #007acc;
            border-bottom: 2px solid #007acc;
            padding-bottom: 10px;
            margin-bottom: 20px;
        }
        .vulnerability-item {
            background: #f9f9f9;
            border-left: 4px solid #ddd;
            padding: 15px;
            margin-bottom: 15px;
            page-break-inside: avoid;
        }
        .vulnerability-item.critical { border-left-color: #d32f2f; }
        .vulnerability-item.high { border-left-color: #f57c00; }
        .vulnerability-item.medium { border-left-color: #1976d2; }
        .vulnerability-item.low { border-left-color: #666; }
        .vuln-header {
            display: flex;
            justify-content: space-between;
            align-items: start;
            margin-bottom: 10px;
        }
        .vuln-title {
            font-weight: bold;
            font-size: 16px;
            color: #333;
        }
        .vuln-severity {
            padding: 4px 12px;
            border-radius: 0;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
        }
        .vuln-severity.critical { background: #d32f2f; color: white; }
        .vuln-severity.high { background: #f57c00; color: white; }
        .vuln-severity.medium { background: #1976d2; color: white; }
        .vuln-severity.low { background: #666; color: white; }
        .vuln-details {
            margin-top: 10px;
            font-size: 14px;
        }
        .vuln-details p {
            margin: 5px 0;
        }
        .vuln-file {
            font-family: 'Courier New', monospace;
            color: #007acc;
            font-weight: bold;
        }
        .recommendations {
            background: #e3f2fd;
            padding: 20px;
            border-left: 4px solid #1976d2;
            margin-top: 30px;
        }
        .recommendations h3 {
            color: #1976d2;
            margin-bottom: 15px;
        }
        .recommendations ul {
            margin-left: 20px;
        }
        .recommendations li {
            margin: 8px 0;
        }
        @media print {
            body { padding: 20px; }
            .vulnerability-item { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Security Audit Report</h1>
        <div class="meta">
            <p><strong>Project:</strong> ${workspaceName}</p>
            <p><strong>Scan Date:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>Generated By:</strong> CipherMate Security Scanner</p>
        </div>
    </div>
    
    <div class="executive-summary">
        <h2>Executive Summary</h2>
        <p>This security audit report provides a comprehensive analysis of vulnerabilities identified in the codebase. 
        The scan identified <strong>${stats.total}</strong> security issues across the repository, with 
        <strong>${stats.critical}</strong> critical, <strong>${stats.high}</strong> high, 
        <strong>${stats.medium}</strong> medium, and <strong>${stats.low}</strong> low severity findings.</p>
        
        <div class="stats-grid">
            <div class="stat-card critical">
                <div class="stat-number">${stats.critical}</div>
                <div class="stat-label">Critical</div>
            </div>
            <div class="stat-card high">
                <div class="stat-number">${stats.high}</div>
                <div class="stat-label">High</div>
            </div>
            <div class="stat-card medium">
                <div class="stat-number">${stats.medium}</div>
                <div class="stat-label">Medium</div>
            </div>
            <div class="stat-card low">
                <div class="stat-number">${stats.low}</div>
                <div class="stat-label">Low</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.total}</div>
                <div class="stat-label">Total</div>
            </div>
        </div>
    </div>
    
    <div class="section">
        <h2>Detailed Findings</h2>
        ${results.map((r: any, idx: number) => {
          const severity = (r.severity || 'INFO').toLowerCase();
          const severityClass = severity === 'critical' || severity === 'error' ? 'critical' :
                               severity === 'high' || severity === 'warning' ? 'high' :
                               severity === 'medium' || severity === 'info' ? 'medium' : 'low';
          return `
        <div class="vulnerability-item ${severityClass}">
            <div class="vuln-header">
                <div class="vuln-title">${idx + 1}. ${r.title || r.extra?.message || r.description || 'Security Issue'}</div>
                <span class="vuln-severity ${severityClass}">${(r.severity || 'INFO').toUpperCase()}</span>
            </div>
            <div class="vuln-details">
                <p><strong>Description:</strong> ${r.description || r.extra?.message || 'No description available'}</p>
                <p><strong>Location:</strong> <span class="vuln-file">${r.path || r.filename || 'Unknown'}:${r.start?.line || r.line_number || 'N/A'}</span></p>
                ${r.cwe ? `<p><strong>CWE:</strong> ${r.cwe}</p>` : ''}
                ${r.cve ? `<p><strong>CVE:</strong> ${r.cve}</p>` : ''}
                ${r.tool ? `<p><strong>Detected By:</strong> ${r.tool}</p>` : ''}
                ${r.fix ? `<p><strong>Recommended Fix:</strong> ${r.fix}</p>` : ''}
            </div>
        </div>`;
        }).join('')}
    </div>
    
    <div class="section">
        <h2>Vulnerability Distribution</h2>
        <h3>By Type</h3>
        <ul>
            ${Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => 
              `<li><strong>${type}:</strong> ${count} finding(s)</li>`
            ).join('')}
        </ul>
        
        <h3 style="margin-top: 20px;">Top Affected Files</h3>
        <ul>
            ${Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([file, count]) => 
              `<li><strong>${file}:</strong> ${count} finding(s)</li>`
            ).join('')}
        </ul>
    </div>
    
    <div class="recommendations">
        <h3>Recommendations</h3>
        <ul>
            <li>Address all <strong>Critical</strong> and <strong>High</strong> severity issues immediately</li>
            <li>Review and remediate medium severity issues within 30 days</li>
            <li>Implement secure coding practices and regular security scanning</li>
            <li>Establish a vulnerability management process</li>
            <li>Conduct regular security training for development teams</li>
            <li>Consider implementing automated security testing in CI/CD pipeline</li>
        </ul>
    </div>
    
    <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #ddd; text-align: center; color: #666; font-size: 12px;">
        <p>Report generated by CipherMate Security Scanner</p>
        <p>© ${new Date().getFullYear()} CipherMate. All rights reserved.</p>
    </div>
</body>
</html>`;
    
    // Save report
    const reportPath = path.join(workspacePath, `security-audit-${Date.now()}.html`);
    fs.writeFileSync(reportPath, reportHtml, 'utf8');
    
    // Open the report
    const uri = vscode.Uri.file(reportPath);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
    
    // Offer to save as PDF (user can use browser print)
    const action = await vscode.window.showInformationMessage(
      `Security audit report generated successfully!`,
      'Open in Browser',
      'OK'
    );
    
    if (action === 'Open in Browser') {
      vscode.env.openExternal(uri);
    }
    
    logger?.info('Security audit report exported', { reportPath, vulnerabilityCount: results.length });
  } catch (error: any) {
    logger?.error('Failed to export security audit', error as Error);
    vscode.window.showErrorMessage(`Failed to export security audit: ${error.message}`);
  }
}

/**
 * Show notification asking user to review dashboard after scan
 */
async function promptReviewDashboard(scanType: string, resultCount: number, criticalCount: number = 0) {
  const message = resultCount > 0 
    ? `Scan complete: ${resultCount} ${resultCount === 1 ? 'issue' : 'issues'} found${criticalCount > 0 ? ` (${criticalCount} critical)` : ''}. Review dashboard?`
    : `Scan complete: No issues found. Review dashboard?`;
  
  const action = await vscode.window.showInformationMessage(
    message,
    'View Dashboard',
    'Dismiss'
  );
  
  if (action === 'View Dashboard') {
    await vscode.commands.executeCommand('ciphermate.showResults');
  }
}

async function postResultsToWebview() {
  // Only update if panel already exists - don't auto-open
  if (!resultsPanel || !resultsPanel.webview) {
    logger?.info('Results panel not open, skipping update (user can open manually)');
    return;
  }
  
  try {
    // Load scan data: lastScanResults -> encrypted storage -> database (most recent scan)
    let results = Array.isArray(lastScanResults) ? lastScanResults : [];
    if (results.length === 0 && extensionContext) {
      const saved = loadEncryptedData(extensionContext);
      if (saved && Array.isArray(saved) && saved.length > 0) {
        lastScanResults = saved;
        results = saved;
        logger?.info('postResultsToWebview: Restored from encrypted storage', { count: results.length });
      }
    }
    // Filter out user-marked false positives
    const ctx = extensionContext;
    const suppressions = new Set<string>(ctx?.globalState.get<string[]>('ciphermate.falsePositiveSuppressions', []) || []);
    results = results.filter((r: any) => {
      const path = (r.path || r.filename || r.file || '').trim();
      const line = r.start?.line ?? r.line ?? r.line_number ?? 0;
      const desc = (r.extra?.message || r.issue_text || r.description || '').slice(0, 60);
      const key = `suppress:${path}:${line}:${desc}`;
      return !suppressions.has(key);
    });
    // Merge Eagle Eye (silent save) findings into results
    try {
      const { getEagleEyeService } = require('./core/eagle-eye-service');
      const eagleFindings = getEagleEyeService().getSessionFindings();
      const eagleAsResults = eagleFindings
        .filter((f: any) => {
          const key = `suppress:${f.filePath}:${f.line}:${(f.message || '').slice(0, 60)}`;
          return !suppressions.has(key);
        })
        .map((f: any) => ({
        path: f.filePath,
        start: { line: f.line },
        extra: { message: f.message },
        tool: f.tool || 'Eagle Eye',
        severity: f.severity,
        check_id: f.ruleId,
        eagleEye: true,
      }));
      results = [...eagleAsResults, ...results];
    } catch { /* Eagle Eye not available */ }
    let recentScans: any[] = [];
    let latestScanInfo = null;
    
    logger?.info('postResultsToWebview: Starting', { 
      lastScanResultsLength: lastScanResults.length,
      hasScanDataService: !!scanDataService
    });
    
    if (scanDataService) {
      try {
        // Get recent scans for history
        recentScans = scanDataService.getRecentScans(10);
        
        logger?.info('postResultsToWebview: Got recent scans', { 
          recentScansCount: recentScans.length,
          currentResultsLength: results.length
        });
        
        latestScanInfo = recentScans.length > 0 ? recentScans[0] : null;
        // When no in-memory results, load latest scan from database so Refresh shows something
        if (recentScans.length > 0 && results.length === 0 && latestScanInfo) {
          try {
            const dbVulns = scanDataService.getVulnerabilities(latestScanInfo.id);
            results = dbVulns.map((v: any) => ({
              tool: v.type || 'Unknown',
              path: v.file || '',
              file: v.file,
              start: { line: v.line || 0 },
              line: v.line,
              severity: (v.severity || 'INFO').toUpperCase(),
              extra: { message: v.description || v.title, severity: v.severity, cwe: v.cwe, cve: v.cve },
              title: v.title,
              description: v.description,
            }));
            lastScanResults = results;
            logger?.info('postResultsToWebview: Loaded from database', { scanId: latestScanInfo.id, count: results.length });
          } catch (e) {
            logger?.warn('postResultsToWebview: Failed to load from database', e as Error);
          }
        }
      } catch (error) {
        logger?.error('Failed to load scan data from database', error as Error);
        // Fallback to lastScanResults
      }
    }
    
    logger?.info('postResultsToWebview: After loading', { 
      resultsLength: results.length,
      hasLatestScanInfo: !!latestScanInfo
    });
    
    // Ensure we have valid results array
    if (!Array.isArray(results)) {
      results = [];
    }
    
    // Enhance results with detected vulnerability types for better categorization
    results = results.map(r => {
      // Detect vulnerability type if not already set
      if (!r.vulnerabilityType) {
        try {
          r.vulnerabilityType = detectVulnerabilityType(r);
        } catch (error) {
          // Fallback to existing type or tool name
          r.vulnerabilityType = r.type || r.check_id || r.tool || 'Security Issue';
        }
      }
      return r;
    });
    
    // Calculate statistics from CURRENT scan results only (not aggregated)
    const currentScanStatistics = {
      totalVulnerabilities: results.length,
      criticalCount: results.filter((r: any) => {
        const s = (r.severity || '').toUpperCase();
        return s === 'CRITICAL' || s === 'ERROR';
      }).length,
      highCount: results.filter((r: any) => {
        const s = (r.severity || '').toUpperCase();
        return s === 'HIGH' || s === 'WARNING';
      }).length,
      mediumCount: results.filter((r: any) => {
        const s = (r.severity || '').toUpperCase();
        return s === 'MEDIUM' || s === 'INFO';
      }).length,
      lowCount: results.filter((r: any) => {
        const s = (r.severity || '').toUpperCase();
        return s === 'LOW';
      }).length,
      latestScan: latestScanInfo
    };
    
    logger?.info('Posting results to webview', { 
      resultCount: results.length,
      currentScanStats: currentScanStatistics,
      hasRecentScans: recentScans.length > 0,
      panelExists: !!resultsPanel,
      webviewExists: !!resultsPanel?.webview
    });
    
    // Ensure webview is available
    if (!resultsPanel || !resultsPanel.webview) {
      logger?.warn('Cannot post to webview - panel or webview not available');
      return;
    }
    
    // Get vulnerability analysis for charts and trends
    let vulnerabilityAnalysis = null;
    if (scanDataService) {
      try {
        vulnerabilityAnalysis = scanDataService.getVulnerabilityAnalysis(30);
        logger?.info('Loaded vulnerability analysis', {
          hasTrends: !!(vulnerabilityAnalysis?.trends?.length),
          trendsCount: vulnerabilityAnalysis?.trends?.length || 0
        });
      } catch (error) {
        logger?.warn('Failed to load vulnerability analysis', error as Error);
      }
    }
    
    // Send comprehensive data to webview (using current scan statistics, not aggregated)
    try {
      const suppressionsList = Array.from(suppressions);
      const message = { 
        command: 'updateResults', 
        results: results,
        scanStatistics: currentScanStatistics, // Use current scan stats, not aggregated
        recentScans: recentScans,
        vulnerabilityAnalysis: vulnerabilityAnalysis, // Include analysis for charts and trends
        suppressions: suppressionsList
      };
      
      logger?.info('Posting message to webview', { 
        resultCount: results.length,
        hasPanel: !!resultsPanel,
        hasWebview: !!resultsPanel?.webview,
        messageSize: JSON.stringify(message).length
      });
      
      if (!resultsPanel || !resultsPanel.webview) {
        logger?.error('Cannot post message - panel or webview is null');
        return;
      }
      
      resultsPanel.webview.postMessage(message);
      logger?.info('Successfully posted message to webview', { 
        resultCount: results.length,
        messageSize: JSON.stringify(message).length
      });
    } catch (error) {
      logger?.error('Failed to post message to webview', error as Error);
      console.error('Error posting to webview:', error);
      throw error;
    }
  } catch (error) {
    logger?.error('Failed to post results to webview', error as Error);
    // Fallback to basic results
    if (resultsPanel) {
      const fallbackResults = Array.isArray(lastScanResults) ? lastScanResults : [];
      resultsPanel.webview.postMessage({ 
        command: 'updateResults', 
        results: fallbackResults 
      });
    }
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
  // Check notification settings
  const settings = getVSCodeSettings();
  
  // If notifications are disabled, only log to console
  if (!settings.notifications.enabled) {
    console.log(`[${type.toUpperCase()}] ${message}${details ? ` - ${details}` : ''}`);
    return;
  }
  
  // Check severity filter
  const severityMap: Record<NotificationType, string> = {
    [NotificationType.VULNERABILITY]: 'high',
    [NotificationType.ERROR]: 'critical',
    [NotificationType.WARNING]: 'medium',
    [NotificationType.FIX]: 'medium',
    [NotificationType.SUGGESTION]: 'low',
    [NotificationType.INFO]: 'info',
  };
  
  const severityOrder: Record<string, number> = {
    info: 0,
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  
  const notificationSeverity = severityMap[type] || 'info';
  const minSeverityOrder = severityOrder[settings.notifications.minSeverity] || 0;
  const notificationSeverityOrder = severityOrder[notificationSeverity] || 0;
  
  // Only show if severity meets minimum threshold
  if (notificationSeverityOrder < minSeverityOrder) {
    console.log(`[${type.toUpperCase()}] ${message}${details ? ` - ${details}` : ''} (filtered by severity)`);
    return;
  }
  
  const prefixes = {
    [NotificationType.VULNERABILITY]: '[SECURITY]',
    [NotificationType.SUGGESTION]: '[SUGGESTION]',
    [NotificationType.FIX]: '[FIX]',
    [NotificationType.INFO]: '[INFO]',
    [NotificationType.WARNING]: '[WARNING]',
    [NotificationType.ERROR]: '[ERROR]'
  };

  const fullMessage = `${prefixes[type]} CipherMate: ${message}`;
  
  // Only show popups if enabled
  if (settings.notifications.showPopups) {
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
    const profile = decryptData(encryptedProfile, context);
    if (!profile) {
      // Clear corrupted data
      await context.workspaceState.update('ciphermate.userProfile', undefined);
    }
    return profile;
  } catch (error) {
    // Clear corrupted data on error
    try {
      await context.workspaceState.update('ciphermate.userProfile', undefined);
    } catch (clearError) {
      // Ignore errors when clearing
    }
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
    const history = decryptData(encryptedHistory, context);
    if (!history) {
      // Clear corrupted data
      await context.workspaceState.update('ciphermate.vulnerabilityHistory', undefined);
      return [];
    }
    return history || [];
  } catch (error) {
    // Clear corrupted data on error
    try {
      await context.workspaceState.update('ciphermate.vulnerabilityHistory', undefined);
    } catch (clearError) {
      // Ignore errors when clearing
    }
    return [];
  }
}

function getFallbackExplanation(issue: any, vulnerabilityType: string): string {
  // Normalize type for lookup (e.g. "Weak Credential Management" -> "Hardcoded Secret")
  const typeKey = /weak credential|hardcoded secret|secret|credential/i.test(vulnerabilityType)
    ? 'Hardcoded Secret' : vulnerabilityType;
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

  return explanations[typeKey] || explanations[vulnerabilityType] || `
This is a security vulnerability that has been detected in your code.

Vulnerability Type: ${vulnerabilityType}
File: ${issue.path || issue.filename || 'Unknown'}
Line: ${issue.start?.line || issue.line_number || 'Unknown'}
Severity: ${issue.extra?.severity || issue.severity || 'Unknown'}

To get detailed AI-powered explanations, configure your AI provider (OpenRouter, OpenAI, LM Studio, or Ollama) in CipherMate Settings.
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
      tool: v.metadata?.scanner || v.type || 'Scanner',
      path: v.file,
      start: { line: v.line || 0 },
      extra: { message: v.description || v.title },
      severity: (v.severity || 'info').toUpperCase(),
      type: v.type,
      ...v,
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

/** Use configured AI provider (OpenRouter, OpenAI, etc.) for explanations; fallback to LM Studio/Ollama */
async function callAIForExplanation(prompt: string, extensionContext: vscode.ExtensionContext): Promise<string> {
  const config = vscode.workspace.getConfiguration('ciphermate');
  const provider = config.get<string>('ai.provider', 'openrouter');
  const cloudProviders = ['openrouter', 'openai', 'anthropic', 'gemini', 'custom'];
  if (cloudProviders.includes(provider)) {
    try {
      const { MultiProviderAIService } = require('./ai-agent/multi-provider-service');
      const aiService = new MultiProviderAIService(extensionContext);
      const res = await aiService.callAI({
        messages: [
          { role: 'system', content: 'You are a security expert. Explain vulnerabilities clearly for developers.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.4,
        max_tokens: 2048
      });
      return res?.content?.trim() || '';
    } catch (e) {
      throw e; // Re-throw so caller can show fallback
    }
  }
  return callLmStudio(prompt);
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
  const diskStorage = new DiskStorageService(context);
  
  // Try disk storage first, fallback to globalState for migration
  let encrypted = '';
  if (diskStorage.exists(MEMORY_KEY)) {
    encrypted = diskStorage.get<string>(MEMORY_KEY, '');
  } else {
    // Migrate from globalState if exists
    encrypted = context.globalState.get(MEMORY_KEY, '');
    if (encrypted) {
      diskStorage.update(MEMORY_KEY, encrypted);
      // Clear from globalState after migration
      context.globalState.update(MEMORY_KEY, undefined);
    }
  }
  
  if (!encrypted) {
    return createNewDeveloperProfile();
  }
  
  try {
    const profile = decryptData(encrypted, context);
    if (!profile) {
      // Decryption failed - clear corrupted data and create new profile
      diskStorage.delete(MEMORY_KEY);
      return createNewDeveloperProfile();
    }
    return profile;
  } catch (e) {
    // Clear corrupted data on any error
    try {
      diskStorage.delete(MEMORY_KEY);
    } catch (clearError) {
      // Ignore errors when clearing
    }
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
  const diskStorage = new DiskStorageService(context);
  diskStorage.update(MEMORY_KEY, encrypted);
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

export function detectVulnerabilityType(issue: any): string {
  // Get all available text fields for comprehensive detection
  const description = (issue.extra?.message || issue.issue_text || issue.check_id || issue.description || issue.title || '').toLowerCase();
  const checkId = (issue.check_id || issue.type || '').toLowerCase();
  const tool = (issue.tool || '').toLowerCase();
  const code = (issue.code || '').toLowerCase();
  
  // Combine all text for comprehensive matching
  const combinedText = `${description} ${checkId} ${tool} ${code}`;
  
  // SQL Injection - comprehensive detection
  if (combinedText.includes('sql') && (combinedText.includes('injection') || combinedText.includes('query') || combinedText.includes('concatenat'))) {
    return 'SQL Injection';
  }
  if (combinedText.includes('nosql') && combinedText.includes('injection')) {
    return 'NoSQL Injection';
  }
  
  // XSS - comprehensive detection
  if (combinedText.includes('xss') || combinedText.includes('cross-site scripting') || 
      combinedText.includes('cross site') || combinedText.includes('innerhtml') ||
      combinedText.includes('dangerouslysetinnerhtml') || combinedText.includes('eval(') ||
      (combinedText.includes('dom') && combinedText.includes('manipulation'))) {
    return 'Cross-Site Scripting (XSS)';
  }
  
  // Command Injection
  if (combinedText.includes('command injection') || combinedText.includes('cmd injection') ||
      combinedText.includes('os command') || combinedText.includes('shell injection') ||
      combinedText.includes('exec(') || combinedText.includes('system(') ||
      combinedText.includes('popen(') || combinedText.includes('subprocess')) {
    return 'Command Injection';
  }
  
  // Path Traversal
  if (combinedText.includes('path traversal') || combinedText.includes('directory traversal') ||
      combinedText.includes('../') || combinedText.includes('..\\') ||
      combinedText.includes('file inclusion') || combinedText.includes('lfi') ||
      combinedText.includes('rfi')) {
    return 'Path Traversal / Directory Traversal';
  }
  
  // Authentication Issues
  if (combinedText.includes('authentication bypass') || combinedText.includes('auth bypass') ||
      combinedText.includes('weak authentication') || combinedText.includes('missing authentication') ||
      combinedText.includes('broken authentication')) {
    return 'Authentication Bypass';
  }
  if (combinedText.includes('brute force') || combinedText.includes('rate limit') ||
      combinedText.includes('account lockout')) {
    return 'Authentication Weakness';
  }
  
  // Authorization Issues
  if (combinedText.includes('authorization') || combinedText.includes('permission') ||
      combinedText.includes('access control') || combinedText.includes('privilege') ||
      combinedText.includes('idor') || combinedText.includes('insecure direct object')) {
    return 'Authorization / Access Control';
  }
  
  // Input Validation
  if (combinedText.includes('input validation') || combinedText.includes('unsanitized input') ||
      combinedText.includes('unvalidated input') || combinedText.includes('tainted data') ||
      combinedText.includes('user input')) {
    return 'Input Validation';
  }
  
  // Credential Management
  if (combinedText.includes('password') || combinedText.includes('credential') ||
      combinedText.includes('hardcoded') || combinedText.includes('secret') ||
      combinedText.includes('api key') || combinedText.includes('api_token') ||
      combinedText.includes('private key') || combinedText.includes('private_key') ||
      combinedText.includes('aws_access') || combinedText.includes('bearer token')) {
    if (combinedText.includes('weak') || combinedText.includes('plaintext') || combinedText.includes('hardcoded')) {
      return 'Weak Credential Management';
    }
    return 'Credential Management';
  }
  
  // Encryption & Cryptography
  if (combinedText.includes('encryption') || combinedText.includes('crypto') ||
      combinedText.includes('cipher') || combinedText.includes('hash')) {
    if (combinedText.includes('weak') || combinedText.includes('md5') || combinedText.includes('sha1') ||
        combinedText.includes('des') || combinedText.includes('rc4') || combinedText.includes('ssl') ||
        combinedText.includes('tls') && combinedText.includes('weak')) {
      return 'Weak Cryptography';
    }
    return 'Cryptography / Encryption';
  }
  
  // Session Management
  if (combinedText.includes('session') || combinedText.includes('token') ||
      combinedText.includes('cookie') || combinedText.includes('jwt')) {
    if (combinedText.includes('fixation') || combinedText.includes('hijack') ||
        combinedText.includes('weak') || combinedText.includes('insecure')) {
      return 'Session Management Weakness';
    }
    return 'Session Management';
  }
  
  // SSRF
  if (combinedText.includes('ssrf') || combinedText.includes('server-side request forgery') ||
      combinedText.includes('server side request')) {
    return 'Server-Side Request Forgery (SSRF)';
  }
  
  // CSRF
  if (combinedText.includes('csrf') || combinedText.includes('cross-site request forgery') ||
      combinedText.includes('cross site request')) {
    return 'Cross-Site Request Forgery (CSRF)';
  }
  
  // XXE
  if (combinedText.includes('xxe') || combinedText.includes('xml external entity') ||
      combinedText.includes('xml injection')) {
    return 'XML External Entity (XXE)';
  }
  
  // Deserialization
  if (combinedText.includes('deserialization') || combinedText.includes('unserialize') ||
      combinedText.includes('pickle') || combinedText.includes('marshal')) {
    return 'Insecure Deserialization';
  }
  
  // Race Condition
  if (combinedText.includes('race condition') || combinedText.includes('time-of-check') ||
      combinedText.includes('toctou')) {
    return 'Race Condition / TOCTOU';
  }
  
  // Buffer Overflow
  if (combinedText.includes('buffer overflow') || combinedText.includes('buffer overrun') ||
      combinedText.includes('stack overflow') || combinedText.includes('heap overflow')) {
    return 'Buffer Overflow';
  }
  
  // Integer Overflow
  if (combinedText.includes('integer overflow') || combinedText.includes('integer underflow') ||
      combinedText.includes('arithmetic overflow')) {
    return 'Integer Overflow';
  }
  
  // Format String
  if (combinedText.includes('format string') || combinedText.includes('printf') ||
      combinedText.includes('sprintf')) {
    return 'Format String Vulnerability';
  }
  
  // LDAP Injection
  if (combinedText.includes('ldap injection') || combinedText.includes('ldap query')) {
    return 'LDAP Injection';
  }
  
  // XPATH Injection
  if (combinedText.includes('xpath injection') || combinedText.includes('xpath query')) {
    return 'XPath Injection';
  }
  
  // HTTP Header Injection
  if (combinedText.includes('header injection') || combinedText.includes('http header') ||
      combinedText.includes('response splitting')) {
    return 'HTTP Header Injection';
  }
  
  // Open Redirect
  if (combinedText.includes('open redirect') || combinedText.includes('unvalidated redirect') ||
      combinedText.includes('url redirect')) {
    return 'Open Redirect';
  }
  
  // Insecure Random
  if (combinedText.includes('insecure random') || combinedText.includes('weak random') ||
      combinedText.includes('math.random') || combinedText.includes('predictable random')) {
    return 'Insecure Random Number Generation';
  }
  
  // Weak Hash
  if (combinedText.includes('weak hash') || combinedText.includes('md5') ||
      combinedText.includes('sha1') || combinedText.includes('crc32')) {
    return 'Weak Hash Algorithm';
  }
  
  // Information Disclosure
  if (combinedText.includes('information disclosure') || combinedText.includes('information leak') ||
      combinedText.includes('sensitive data') || combinedText.includes('debug mode') ||
      combinedText.includes('stack trace') || combinedText.includes('error message')) {
    return 'Information Disclosure';
  }
  
  // Security Misconfiguration
  if (combinedText.includes('misconfiguration') || combinedText.includes('default password') ||
      combinedText.includes('debug enabled') || combinedText.includes('verbose error') ||
      combinedText.includes('exposed endpoint') || combinedText.includes('cors misconfiguration')) {
    return 'Security Misconfiguration';
  }
  
  // Insecure Direct Object Reference
  if (combinedText.includes('idor') || combinedText.includes('insecure direct object reference') ||
      combinedText.includes('direct object')) {
    return 'Insecure Direct Object Reference (IDOR)';
  }
  
  // Business Logic Flaw
  if (combinedText.includes('business logic') || combinedText.includes('logic flaw') ||
      combinedText.includes('workflow bypass')) {
    return 'Business Logic Flaw';
  }
  
  // Denial of Service
  if (combinedText.includes('denial of service') || combinedText.includes('dos') ||
      combinedText.includes('ddos') || combinedText.includes('resource exhaustion') ||
      combinedText.includes('reDoS') || combinedText.includes('regex dos')) {
    return 'Denial of Service (DoS)';
  }
  
  // Code Injection
  if (combinedText.includes('code injection') || combinedText.includes('remote code execution') ||
      combinedText.includes('rce') || combinedText.includes('arbitrary code')) {
    return 'Code Injection / RCE';
  }
  
  // Template Injection
  if (combinedText.includes('template injection') || combinedText.includes('ssti') ||
      combinedText.includes('server-side template')) {
    return 'Server-Side Template Injection (SSTI)';
  }
  
  // File Upload
  if (combinedText.includes('file upload') || combinedText.includes('unrestricted upload') ||
      combinedText.includes('malicious file')) {
    return 'Unrestricted File Upload';
  }
  
  // Insecure Communication
  if (combinedText.includes('insecure communication') || combinedText.includes('http instead of https') ||
      combinedText.includes('mixed content') || combinedText.includes('ssl') ||
      combinedText.includes('tls') && combinedText.includes('weak')) {
    return 'Insecure Communication';
  }
  
  // Weak Password Policy
  if (combinedText.includes('weak password') || combinedText.includes('password policy') ||
      combinedText.includes('password complexity')) {
    return 'Weak Password Policy';
  }
  
  // Missing Security Headers
  if (combinedText.includes('security header') || combinedText.includes('csp') ||
      combinedText.includes('x-frame-options') || combinedText.includes('hsts')) {
    return 'Missing Security Headers';
  }
  
  // Insecure API
  if (combinedText.includes('api') && (combinedText.includes('insecure') ||
      combinedText.includes('unauthenticated') || combinedText.includes('rate limit'))) {
    return 'Insecure API';
  }
  
  // Dependency Vulnerability
  if (combinedText.includes('dependency') || combinedText.includes('vulnerable library') ||
      combinedText.includes('outdated') || combinedText.includes('cve-')) {
    return 'Vulnerable Dependency';
  }
  
  // Log Injection
  if (combinedText.includes('log injection') || combinedText.includes('log forging')) {
    return 'Log Injection';
  }
  
  // Time-based Attack
  if (combinedText.includes('timing attack') || combinedText.includes('time-based')) {
    return 'Timing Attack';
  }
  
  // Return generic if no specific match found
  return 'Security Issue';
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
let extensionContext: vscode.ExtensionContext | null = null;

function loadTeamData(context: vscode.ExtensionContext): TeamLead | null {
  const diskStorage = new DiskStorageService(context);
  
  // Try disk storage first, fallback to globalState for migration
  let encrypted = '';
  if (diskStorage.exists(TEAM_DATA_KEY)) {
    encrypted = diskStorage.get<string>(TEAM_DATA_KEY, '');
  } else {
    // Migrate from globalState if exists
    encrypted = context.globalState.get(TEAM_DATA_KEY, '');
    if (encrypted) {
      diskStorage.update(TEAM_DATA_KEY, encrypted);
      // Clear from globalState after migration
      context.globalState.update(TEAM_DATA_KEY, undefined);
    }
  }
  
  if (!encrypted) {return null;}
  
  try {
    const data = decryptData(encrypted, context);
    if (!data) {
      // Clear corrupted data
      diskStorage.delete(TEAM_DATA_KEY);
    }
    return data;
  } catch (e) {
    // Clear corrupted data on error
    try {
      diskStorage.delete(TEAM_DATA_KEY);
    } catch (clearError) {
      // Ignore errors when clearing
    }
    return null;
  }
}

function saveTeamData(teamData: TeamLead, context: vscode.ExtensionContext) {
  const encrypted = encryptData(teamData, context);
  const diskStorage = new DiskStorageService(context);
  diskStorage.update(TEAM_DATA_KEY, encrypted);
}

function loadTeamReports(context: vscode.ExtensionContext): TeamVulnerabilityReport[] {
  const diskStorage = new DiskStorageService(context);
  
  // Try disk storage first, fallback to globalState for migration
  let encrypted = '';
  if (diskStorage.exists(TEAM_REPORTS_KEY)) {
    encrypted = diskStorage.get<string>(TEAM_REPORTS_KEY, '');
  } else {
    // Migrate from globalState if exists
    encrypted = context.globalState.get(TEAM_REPORTS_KEY, '');
    if (encrypted) {
      diskStorage.update(TEAM_REPORTS_KEY, encrypted);
      // Clear from globalState after migration
      context.globalState.update(TEAM_REPORTS_KEY, undefined);
    }
  }
  
  if (!encrypted) {return [];}
  
  try {
    const data = decryptData(encrypted, context);
    if (!data) {
      // Clear corrupted data
      diskStorage.delete(TEAM_REPORTS_KEY);
      return [];
    }
    return data || [];
  } catch (e) {
    // Clear corrupted data on error
    try {
      diskStorage.delete(TEAM_REPORTS_KEY);
    } catch (clearError) {
      // Ignore errors when clearing
    }
    return [];
  }
}

function saveTeamReports(reports: TeamVulnerabilityReport[], context: vscode.ExtensionContext) {
  const encrypted = encryptData(reports, context);
  const diskStorage = new DiskStorageService(context);
  diskStorage.update(TEAM_REPORTS_KEY, encrypted);
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

/**
 * Migrate large data from globalState to disk storage
 * This is a one-time migration that happens during extension activation
 */
function migrateLargeDataToDisk(context: vscode.ExtensionContext): void {
  try {
    const diskStorage = new DiskStorageService(context);
    
    // List of keys that should be migrated to disk storage
    const keysToMigrate = [
      'ciphermate.db.scans',
      'ciphermate.db.vulnerabilities',
      'ciphermate.db.users',
      'ciphermate.chatSessions',
      MEMORY_KEY,
      TEAM_DATA_KEY,
      TEAM_REPORTS_KEY,
      'ciphermate.fixBackups',
      'ciphermate.fixUndoStack'
    ];
    
    const migrated = diskStorage.migrateFromGlobalState(keysToMigrate);
    
    if (migrated > 0) {
      console.log(`CipherMate: Migrated ${migrated} large data keys from globalState to disk storage`);
      
      // Force clear migrated keys from globalState to prevent warning
      // This ensures old data is completely removed
      for (const key of keysToMigrate) {
        const value = context.globalState.get(key);
        if (value !== undefined) {
          // Only clear if it's large (string length > 1000 or object/array)
          const size = typeof value === 'string' ? value.length : JSON.stringify(value).length;
          if (size > 1000) {
            context.globalState.update(key, undefined);
            console.log(`CipherMate: Cleared large key from globalState: ${key} (${size} bytes)`);
          }
        }
      }
    } else {
      console.log('CipherMate: No data to migrate (already using disk storage)');
    }
  } catch (error) {
    console.error('CipherMate: Failed to migrate data to disk storage:', error);
    // Don't throw - migration failure shouldn't prevent extension activation
  }
}

export function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
  // Migrate large data to disk storage on activation
  migrateLargeDataToDisk(context);
  
  // Register global memory cleanup for MemoryMonitor to call when critical
  (global as any).performMemoryCleanup = () => {
    cleanupScanResults();
    if (typeof (global as any).gc === 'function') {
      try { (global as any).gc(); } catch { /* gc not available */ }
    }
  };

  // Initialize memory monitoring (optional, only in development)
  if (process.env.NODE_ENV === 'development' || vscode.workspace.getConfiguration('ciphermate').get<boolean>('enableMemoryMonitoring', false)) {
    try {
      const { memoryMonitor } = require('./utils/memory-monitor');
      memoryMonitor.startMonitoring(30000); // Check every 30 seconds
      logger?.info('Memory monitoring enabled');
    } catch (error) {
      // Memory monitor not critical, continue without it
    }
  }
  
  // Initialize Enterprise Infrastructure
  logger = new EnterpriseLogger();
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

  // Initialize Scan Data Service (database with JWT authentication)
  scanDataService = new ScanDataService(context, logger);
  logger.info('Scan data service initialized');

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
    welcomeTreeView.reveal(welcomeTreeProvider.getStartedItem);
    chatInterface.show();
  });

  // Register view provider for activity bar
  class WelcomeTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
      this._onDidChangeTreeData.fire();
    }

    readonly getStartedItem: vscode.TreeItem;
    readonly configureSettingsItem: vscode.TreeItem;
    readonly viewResultsItem: vscode.TreeItem;

    constructor() {
      this.getStartedItem = new vscode.TreeItem('Get Started', vscode.TreeItemCollapsibleState.None);
      this.getStartedItem.command = { command: 'ciphermate', title: 'Open CipherMate' };
      this.getStartedItem.iconPath = new vscode.ThemeIcon('rocket');
      this.getStartedItem.tooltip = 'Open CipherMate welcome screen';

      this.configureSettingsItem = new vscode.TreeItem('Configure Settings', vscode.TreeItemCollapsibleState.None);
      this.configureSettingsItem.command = { command: 'ciphermate.advancedSettings', title: 'Open Settings' };
      this.configureSettingsItem.iconPath = new vscode.ThemeIcon('settings-gear');
      this.configureSettingsItem.tooltip = 'Configure API keys and settings';

      this.viewResultsItem = new vscode.TreeItem('View Results', vscode.TreeItemCollapsibleState.None);
      this.viewResultsItem.command = { command: 'ciphermate.showResults', title: 'Show Results' };
      this.viewResultsItem.iconPath = new vscode.ThemeIcon('list-unordered');
      this.viewResultsItem.tooltip = 'View security scan results';
    }

    getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
      if (element) {
        return [];
      }
      return [this.getStartedItem, this.configureSettingsItem, this.viewResultsItem];
    }
    
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
      return element;
    }
    
    getParent(element: vscode.TreeItem): vscode.TreeItem | undefined {
      return undefined; // Flat tree - all items are top-level
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
    
    getParent(element: vscode.TreeItem): vscode.TreeItem | undefined {
      return undefined; // Flat tree
    }
  }

  const welcomeTreeProvider = new WelcomeTreeDataProvider();
  const findingsTreeProvider = new FindingsTreeDataProvider();
  const welcomeTreeView = vscode.window.createTreeView('ciphermateWelcome', { treeDataProvider: welcomeTreeProvider });

  context.subscriptions.push(
    welcomeTreeView,
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

  // Init AI Security Analyzer (for CipherMate SAST + Eagle Eye)
  try {
    const { getAISecurityAnalyzer } = require('./core/ai-security-analyzer');
    getAISecurityAnalyzer().init(context);
  } catch (_) { /* optional */ }

  // Eagle Eye: AI-powered silent save watcher - scans on save, notifies in dashboard
  const eagleEyeEnabled = vscode.workspace.getConfiguration('ciphermate').get<boolean>('eagleEye.enabled', true);
  if (eagleEyeEnabled) {
    try {
      const { getEagleEyeService } = require('./core/eagle-eye-service');
      const eagleEye = getEagleEyeService();
      eagleEye.initialize(context);
      eagleEye.setOnFindingsChanged(() => postResultsToWebview());
      context.subscriptions.push({ dispose: () => eagleEye.dispose() });
      logger?.info('Eagle Eye service initialized');
    } catch (e) {
      logger?.warn('Eagle Eye service failed to initialize', e as Error);
    }
  }

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
      cleanupScanResults(); // Clean up if too many results
      
      logger?.info('Intelligent scan completed', { resultCount: lastScanResults.length });
      
      // Save to encrypted storage (legacy support)
      saveEncryptedData(lastScanResults, context);
      await saveVulnerabilityHistory(lastScanResults, 'Intelligent Scan', context);
      
      // Persist to scan database for History (when available)
      if (scanDataService) {
        try {
          await scanDataService.saveScan({
            scanType: 'Intelligent Scan',
            workspacePath,
            vulnerabilities: lastScanResults,
            timestamp: new Date(),
            duration: 0,
          });
        } catch (e) {
          logger?.warn('Failed to save scan to database', e as Error);
        }
      }
      
      // Ensure results reach the dashboard: if panel is closed but we have results, open it
      // (webviewReady + retries will then transmit data)
      if (lastScanResults.length > 0 && !resultsPanel) {
        await vscode.commands.executeCommand('ciphermate.showResults');
      }
      await postResultsToWebview();
      
      // Prompt user to review dashboard
      const criticalCount = lastScanResults.filter(r => r.severity === 'CRITICAL' || r.severity === 'ERROR').length;
      await promptReviewDashboard('Repository Scan', lastScanResults.length, criticalCount);
      
      if (lastScanResults.length > 0) {
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

  // Command: Run Benchmark
  let benchmarkDisposable = vscode.commands.registerCommand('ciphermate.runBenchmark', async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      showNotification(NotificationType.ERROR, 'No workspace folder open.');
      return;
    }
    const workspacePath = workspaceFolders[0].uri.fsPath;
    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'CipherMate Benchmark...', cancellable: false },
        async () => {
          const { runBenchmark, formatBenchmarkReport } = await import('./core/benchmark-runner');
          const result = await runBenchmark(workspacePath, context);
          const report = formatBenchmarkReport(result);
          const channel = vscode.window.createOutputChannel('CipherMate Benchmark');
          channel.clear();
          channel.append(report);
          channel.show();
          showNotification(NotificationType.INFO, `Benchmark: ${result.total} findings in ${(result.durationMs / 1000).toFixed(1)}s`);
        }
      );
    } catch (e) {
      showNotification(NotificationType.ERROR, 'Benchmark failed', String(e));
    }
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
      cleanupScanResults(); // Clean up if too many results
      console.log('Final results after deduplication:', lastScanResults.length, 'items');
      saveEncryptedData(lastScanResults, context);
      postResultsToWebview();
      
      // Prompt user to review dashboard
      const criticalCount = lastScanResults.filter(r => r.severity === 'CRITICAL' || r.severity === 'ERROR').length;
      promptReviewDashboard('Semgrep Analysis', lastScanResults.length, criticalCount);
      
      if (lastScanResults.length > 0) {
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
        
        // Prompt user to review dashboard
        const criticalCount = lastScanResults.filter((r: any) => r.severity === 'HIGH' || r.severity === 'CRITICAL').length;
        promptReviewDashboard('Bandit Analysis', lastScanResults.length, criticalCount);
        
        if (lastScanResults.length > 0) {
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
      { enableScripts: true }
    );
    const vsCodeSettings = getVSCodeSettings();
    panel.webview.html = getSettingsHtml(vsCodeSettings, panel.webview);
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === 'saveSettings') {
        const config = vscode.workspace.getConfiguration('ciphermate');
        try {
          // Save all settings to VS Code configuration
          await config.update('scanners.enableDependency', message.settings.scanners?.enableDependency, vscode.ConfigurationTarget.Global);
          await config.update('scanners.enableSecrets', message.settings.scanners?.enableSecrets, vscode.ConfigurationTarget.Global);
          await config.update('scanners.enableSmartContract', message.settings.scanners?.enableSmartContract, vscode.ConfigurationTarget.Global);
          await config.update('scanners.enableCodePattern', message.settings.scanners?.enableCodePattern, vscode.ConfigurationTarget.Global);
          await config.update('enableSemgrep', message.settings.enableSemgrep, vscode.ConfigurationTarget.Global);
          await config.update('enableBandit', message.settings.enableBandit, vscode.ConfigurationTarget.Global);
          await config.update('scanOnSave', message.settings.scanOnSave, vscode.ConfigurationTarget.Global);
          await config.update('scanInterval', message.settings.scanInterval, vscode.ConfigurationTarget.Global);
          panel.webview.postMessage({ command: 'settingsSaved' });
          vscode.window.showInformationMessage('CipherMate settings saved!');
        } catch (error) {
          panel.webview.postMessage({ command: 'settingsError', error: String(error) });
        }
      }
    });
  });

  // Command: Advanced Settings (sidebar-based like Kilo Code)
  let advancedSettingsDisposable = vscode.commands.registerCommand('ciphermate.advancedSettings', async () => {
    welcomeTreeView.reveal(welcomeTreeProvider.configureSettingsItem);
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
    panel.onDidChangeViewState((e) => {
      if (e.webviewPanel.visible) {
        welcomeTreeView.reveal(welcomeTreeProvider.configureSettingsItem);
      }
    });
    const vsCodeSettings = getVSCodeSettings();
    const apiKeyStorage = new ApiKeyStorage(context);
    const apiKeysConfigured = {
      openrouter: await apiKeyStorage.has('openrouter'),
      openai: await apiKeyStorage.has('openai'),
      anthropic: await apiKeyStorage.has('anthropic'),
      gemini: await apiKeyStorage.has('gemini'),
    };
    panel.webview.html = getSidebarSettingsHtml(vsCodeSettings, panel, context, apiKeysConfigured);
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === 'saveSettings') {
        const config = vscode.workspace.getConfiguration('ciphermate');
        try {
          // Save all settings to VS Code configuration
          const settings = message.settings;

          // Save API keys FIRST so they persist even if other updates fail
          if (settings.apiKeys) {
            const apiKeyStorage = new ApiKeyStorage(context);
            const providers = ['openrouter', 'openai', 'anthropic', 'gemini'] as const;
            for (const provider of providers) {
              const key = settings.apiKeys[provider];
              if (key && key.trim()) {
                await apiKeyStorage.set(provider, key.trim());
              }
            }
          }
          
          // Scanner settings
          if (settings.scanners) {
            await config.update('scanners.enableDependency', settings.scanners.enableDependency, vscode.ConfigurationTarget.Global);
            await config.update('scanners.enableSecrets', settings.scanners.enableSecrets, vscode.ConfigurationTarget.Global);
            await config.update('scanners.enableSmartContract', settings.scanners.enableSmartContract, vscode.ConfigurationTarget.Global);
            await config.update('scanners.enableCodePattern', settings.scanners.enableCodePattern, vscode.ConfigurationTarget.Global);
          }
          if (settings.enableSemgrep !== undefined) await config.update('enableSemgrep', settings.enableSemgrep, vscode.ConfigurationTarget.Global);
          if (settings.enableBandit !== undefined) await config.update('enableBandit', settings.enableBandit, vscode.ConfigurationTarget.Global);
          
          // Scan behavior
          if (settings.scanBehavior) {
            await config.update('scanBehavior.scanOnStartup', settings.scanBehavior.scanOnStartup, vscode.ConfigurationTarget.Global);
            await config.update('scanBehavior.scanMode', settings.scanBehavior.scanMode, vscode.ConfigurationTarget.Global);
            await config.update('scanBehavior.maxFileSize', settings.scanBehavior.maxFileSize, vscode.ConfigurationTarget.Global);
            await config.update('scanBehavior.excludePatterns', settings.scanBehavior.excludePatterns, vscode.ConfigurationTarget.Global);
            await config.update('scanBehavior.severityFilter', settings.scanBehavior.severityFilter, vscode.ConfigurationTarget.Global);
          }
          if (settings.scanOnSave !== undefined) await config.update('scanOnSave', settings.scanOnSave, vscode.ConfigurationTarget.Global);
          if (settings.scanInterval !== undefined) await config.update('scanInterval', settings.scanInterval, vscode.ConfigurationTarget.Global);
          
          // CVE settings
          if (settings.cve) {
            await config.update('cve.enabled', settings.cve.enabled, vscode.ConfigurationTarget.Global);
            await config.update('cve.cacheEnabled', settings.cve.cacheEnabled, vscode.ConfigurationTarget.Global);
            await config.update('cve.cacheTTLHours', settings.cve.cacheTTLHours, vscode.ConfigurationTarget.Global);
            await config.update('cve.apiPreference', settings.cve.apiPreference, vscode.ConfigurationTarget.Global);
            await config.update('cve.rateLimitDelay', settings.cve.rateLimitDelay, vscode.ConfigurationTarget.Global);
          }
          
          // UI settings
          if (settings.ui) {
            await config.update('ui.showCodeLens', settings.ui.showCodeLens, vscode.ConfigurationTarget.Global);
            await config.update('ui.highlightDuration', settings.ui.highlightDuration, vscode.ConfigurationTarget.Global);
            await config.update('ui.showGutterIcon', settings.ui.showGutterIcon, vscode.ConfigurationTarget.Global);
            await config.update('ui.showOverviewRuler', settings.ui.showOverviewRuler, vscode.ConfigurationTarget.Global);
            await config.update('ui.codeLensPosition', settings.ui.codeLensPosition, vscode.ConfigurationTarget.Global);
            await config.update('ui.theme', settings.ui.theme, vscode.ConfigurationTarget.Global);
            await config.update('ui.compactMode', settings.ui.compactMode, vscode.ConfigurationTarget.Global);
          }
          
          // Notification settings
          if (settings.notifications) {
            await config.update('notifications.enabled', settings.notifications.enabled, vscode.ConfigurationTarget.Global);
            await config.update('notifications.minSeverity', settings.notifications.minSeverity, vscode.ConfigurationTarget.Global);
            await config.update('notifications.showPopups', settings.notifications.showPopups, vscode.ConfigurationTarget.Global);
            await config.update('notifications.soundEnabled', settings.notifications.soundEnabled, vscode.ConfigurationTarget.Global);
          }
          
          // Performance settings
          if (settings.performance) {
            await config.update('performance.maxConcurrentScans', settings.performance.maxConcurrentScans, vscode.ConfigurationTarget.Global);
            await config.update('performance.scanTimeout', settings.performance.scanTimeout, vscode.ConfigurationTarget.Global);
            await config.update('performance.cacheEnabled', settings.performance.cacheEnabled, vscode.ConfigurationTarget.Global);
            await config.update('performance.cacheTTLHours', settings.performance.cacheTTLHours, vscode.ConfigurationTarget.Global);
          }
          
          // Explain settings
          if (settings.explain) {
            await config.update('explain.enabled', settings.explain.enabled, vscode.ConfigurationTarget.Global);
            await config.update('explain.provider', settings.explain.provider, vscode.ConfigurationTarget.Global);
            await config.update('explain.maxLength', settings.explain.maxLength, vscode.ConfigurationTarget.Global);
            await config.update('explain.includeCodeContext', settings.explain.includeCodeContext, vscode.ConfigurationTarget.Global);
            await config.update('explain.codeContextLines', settings.explain.codeContextLines, vscode.ConfigurationTarget.Global);
          }
          
          // AI provider, Ollama URL, OpenRouter model, and API keys (store keys securely in SecretStorage / OS keychain)
          if (settings.aiProvider !== undefined) {
            await config.update('ai.provider', settings.aiProvider, vscode.ConfigurationTarget.Global);
          }
          if (settings.openrouterModel !== undefined) {
            const openrouter = config.get<{ model?: string; apiKey?: string; timeout?: number }>('ai.openrouter') || {};
            await config.update('ai.openrouter', { ...openrouter, model: settings.openrouterModel }, vscode.ConfigurationTarget.Global);
          }
          if (settings.ollamaUrl) {
            const url = settings.ollamaUrl.replace(/\/v1\/chat\/completions.*$/, '').replace(/\/$/, '') || 'http://localhost:11434';
            // VS Code does not allow updating nested properties of object configs;
            // we must update the whole ai.ollama object.
            const ollama = config.get<{ apiUrl?: string; model?: string; timeout?: number }>('ai.ollama') || {};
            await config.update('ai.ollama', { ...ollama, apiUrl: url }, vscode.ConfigurationTarget.Global);
          }
          // API keys saved at top of try block
          
          panel.webview.postMessage({ command: 'settingsSaved' });
          vscode.window.showInformationMessage('CipherMate settings saved successfully!');
        } catch (error) {
          panel.webview.postMessage({ command: 'settingsError', error: String(error) });
          vscode.window.showErrorMessage(`Failed to save settings: ${error}`);
        }
      } else if (message.command === 'navigateTo') {
        // Handle navigation commands from settings panel
        vscode.commands.executeCommand(message.target);
      } else if (message.command === 'showResults') {
        // Handle show results command
        vscode.commands.executeCommand('ciphermate.showResults');
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
  let resultsDisposable = vscode.commands.registerCommand('ciphermate.showResults', async () => {
    welcomeTreeView.reveal(welcomeTreeProvider.viewResultsItem);
    // If panel already exists, just reveal it and update with latest data
    if (resultsPanel) {
      resultsPanel.reveal(vscode.ViewColumn.One, false);
      // Ensure it's updated with the latest data
      await postResultsToWebview();
      return;
    }
    
    resultsPanel = vscode.window.createWebviewPanel(
      'ciphermateResults',
      'CipherMate Results',
      vscode.ViewColumn.One, // Open in full tab by default
      { 
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri]
      }
    );
    resultsPanel.onDidChangeViewState((e) => {
      if (e.webviewPanel.visible) {
        welcomeTreeView.reveal(welcomeTreeProvider.viewResultsItem);
      }
    });
    resultsPanel.webview.html = getResultsPanelHtml(context, resultsPanel);
    
    // Handle panel disposal
    resultsPanel.onDidDispose(() => {
      resultsPanel = null;
    }, null, context.subscriptions);
    
    resultsPanel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === 'webviewReady') {
        // Webview is ready, send initial data
        logger?.info('Results webview ready, sending initial data');
        await postResultsToWebview();
      } else if (message.command === 'refresh') {
        // Refresh the results by re-running the last scan or just updating the display
        await postResultsToWebview();
        showNotification(NotificationType.INFO, 'Results refreshed');
      } else if (message.command === 'scanMe') {
        // Trigger a new scan
        vscode.commands.executeCommand('ciphermate.scan');
      } else if (message.command === 'exportResults') {
        // Export current results as professional security audit
        await exportSecurityAudit(context);
      } else if (message.command === 'clear') {
        // Clear current scan results from display
        lastScanResults = [];
        await postResultsToWebview();
        showNotification(NotificationType.INFO, 'Results cleared');
      } else if (message.command === 'openSettings') {
        // Open settings
        vscode.commands.executeCommand('ciphermate.advancedSettings');
      } else if (message.command === 'loadScan') {
        // Load a specific scan from database
        if (scanDataService && message.scanId) {
          try {
            const vulns = scanDataService.getVulnerabilities(message.scanId);
            const results = vulns.map(v => ({
              tool: v.type || 'Unknown',
              path: v.file,
              start: { line: v.line || 0 },
              severity: v.severity?.toUpperCase() || 'INFO',
              extra: {
                message: v.description || v.title,
                severity: v.severity,
                cwe: v.cwe,
                cve: v.cve
              },
              title: v.title,
              description: v.description,
              fix: v.fix,
              fixable: v.fixable,
              cwe: v.cwe,
              cve: v.cve,
              metadata: v.metadata ? JSON.parse(v.metadata) : {}
            }));
            lastScanResults = results;
            cleanupScanResults(); // Clean up if too many results
            postResultsToWebview().catch(err => {
              logger?.error('Failed to post scan results', err as Error);
            });
            showNotification(NotificationType.INFO, 'Scan loaded from history');
          } catch (error) {
            logger?.error('Failed to load scan', error as Error);
            showNotification(NotificationType.ERROR, 'Failed to load scan from history');
          }
        }
      } else if (message.command === 'openFile') {
        // Open file at specific line and highlight it
        // Split the view: move results panel to right side, open file on left side
        let filePath = message.filePath?.trim();
        let lineNumber = parseInt(message.lineNumber);
        
        logger?.info('openFile command received', { filePath, lineNumber: message.lineNumber, parsedLineNumber: lineNumber });
        
        // Validate file path before attempting to open
        if (!filePath || filePath === '' || filePath === 'undefined' || filePath === 'null') {
          logger?.warn('openFile: Invalid file path', { filePath });
          vscode.window.showWarningMessage('Invalid file path');
          return;
        }
        
        // Validate line number - use the actual line number from message, don't default to 1
        if (isNaN(lineNumber) || lineNumber < 1) {
          logger?.warn('openFile: Invalid line number, using 1', { lineNumber, original: message.lineNumber });
          lineNumber = 1;
        } else {
          logger?.info('openFile: Using line number', { lineNumber });
        }
        
        // Normalize file path to absolute
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot && !path.isAbsolute(filePath)) {
          filePath = path.join(workspaceRoot, filePath);
        }
        
        try {
          // Move results panel to column Two (right side) to create split view
          if (resultsPanel) {
            resultsPanel.reveal(vscode.ViewColumn.Two, false);
          }
          
          const uri = vscode.Uri.file(filePath);
          vscode.workspace.openTextDocument(uri).then(
            (document) => {
              // Fix: Ensure line number is valid and within document bounds
              const validLineNumber = Math.max(1, Math.min(lineNumber, document.lineCount));
              const lineIndex = Math.max(0, validLineNumber - 1);
              const position = new vscode.Position(lineIndex, 0);
              
              // Open file in column One (left side), creating split view with results panel on right
              vscode.window.showTextDocument(document, {
                selection: new vscode.Range(position, position),
                viewColumn: vscode.ViewColumn.One,
                preview: false
              }).then(
                (editor) => {
                  // Highlight the line by revealing it in the center and selecting it
                  const lineRange = new vscode.Range(
                    lineIndex,
                    0,
                    lineIndex,
                    Number.MAX_VALUE
                  );
                  editor.revealRange(lineRange, vscode.TextEditorRevealType.InCenter);
                  editor.selection = new vscode.Selection(lineRange.start, lineRange.end);
                  
                  // Get UI settings for decoration
                  const settings = getVSCodeSettings();
                  const highlightDuration = settings.ui.highlightDuration * 1000; // Convert to milliseconds
                  
                  // Build decoration options based on settings
                  const decorationOptions: vscode.DecorationRenderOptions = {
                    backgroundColor: new vscode.ThemeColor('editor.selectionBackground'),
                    isWholeLine: true,
                    border: '2px solid',
                    borderColor: new vscode.ThemeColor('textLink.foreground'),
                  };
                  
                  // Add gutter icon if enabled
                  if (settings.ui.showGutterIcon) {
                    decorationOptions.gutterIconPath = vscode.Uri.parse('data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="13" fill="#007acc" opacity="0.4"/><circle cx="14" cy="14" r="11" fill="none" stroke="#007acc" stroke-width="2"/><text x="14" y="19" font-size="18" font-weight="bold" fill="#007acc" text-anchor="middle" font-family="Arial, sans-serif">?</text></svg>').toString('base64'));
                    decorationOptions.gutterIconSize = 'contain';
                  }
                  
                  // Add overview ruler if enabled
                  if (settings.ui.showOverviewRuler) {
                    decorationOptions.overviewRulerColor = new vscode.ThemeColor('textLink.foreground');
                    decorationOptions.overviewRulerLane = vscode.OverviewRulerLane.Right;
                  }
                  
                  const decorationType = vscode.window.createTextEditorDecorationType(decorationOptions);
                  // Find the vulnerability for this line - normalize paths for comparison
                  const normalizePath = (p: string): string => {
                    if (!p) return '';
                    const normalized = path.normalize(p.trim());
                    if (workspaceRoot && !path.isAbsolute(normalized)) {
                      return path.join(workspaceRoot, normalized);
                    }
                    return normalized;
                  };
                  
                  const normalizedFilePath = normalizePath(filePath);
                  const vulnerability = lastScanResults.find((r: any) => {
                    const rPath = normalizePath(r.path || r.filename || '');
                    const rLine = r.start?.line || r.line_number || 0;
                    // Match by normalized path and line number (allow ±1 line tolerance)
                    return rPath === normalizedFilePath && Math.abs(rLine - validLineNumber) <= 1;
                  });
                  
                  editor.setDecorations(decorationType, [lineRange]);
                  
                  // Store vulnerability info for CodeLens (no notification popup)
                  highlightedVulnerabilities.set(`${filePath}:${validLineNumber}`, {
                    filePath,
                    lineNumber: validLineNumber,
                    vulnerability,
                    document: document.uri.toString()
                  });
                  
                  // Trigger CodeLens refresh to show Explain button above the line
                  setTimeout(() => {
                    vulnerabilityCodeLensProvider.refresh();
                  }, 100);
                    
                    // Remove decoration after configured duration
                    setTimeout(() => {
                      decorationType.dispose();
                    }, highlightDuration);
                    
                    // Ensure results panel stays visible on right side after opening file
                    if (resultsPanel) {
                      resultsPanel.reveal(vscode.ViewColumn.Two, false);
                    }
                    
                    logger?.info('File opened and highlighted', { filePath, lineNumber: validLineNumber, vulnerabilityFound: !!vulnerability });
                  },
                  (showError) => {
                    logger?.error('Failed to display file', showError as Error);
                    vscode.window.showErrorMessage(`Failed to display file: ${showError.message}`);
                  }
                );
              },
              (openError) => {
                logger?.error('Could not open file', openError as Error);
                vscode.window.showErrorMessage(`Could not open file "${filePath}": ${openError.message}`);
              }
            );
          } catch (error: any) {
            logger?.error('Error opening file', error as Error);
            vscode.window.showErrorMessage(`Error opening file: ${error.message}`);
          }
      } else if (message.command === 'explainVulnerability') {
        const idx = message.index;
        const issue = lastScanResults[idx];
        if (!issue) { return; }
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const relPath = (issue.path || issue.filename || issue.file || '').trim();
        const absPath = workspaceRoot && relPath && !path.isAbsolute(relPath) ? path.join(workspaceRoot, relPath) : relPath;
        const codeContext = getCodeContext(absPath, issue.start?.line || issue.line_number || 0);
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
          const response = await callAIForExplanation(explainPrompt, context);
          resultsPanel?.webview.postMessage({
            command: 'showExplanation',
            title: `Security Explanation - ${vulnerabilityType}`,
            text: response
          });
        } catch (error) {
          const fallbackExplanation = getFallbackExplanation(issue, vulnerabilityType);
          const provider = vscode.workspace.getConfiguration('ciphermate').get<string>('ai.provider', 'openrouter');
          const configHint = provider === 'openrouter' 
            ? 'Add your OpenRouter API key in CipherMate Settings → AI Providers (openrouter.ai for free tier).'
            : provider === 'openai' 
              ? 'Add your OpenAI API key in CipherMate Settings.'
              : 'Configure your AI provider (OpenRouter, OpenAI, or LM Studio) in CipherMate Settings.';
          resultsPanel?.webview.postMessage({
            command: 'showExplanation',
            title: `Security Explanation - ${vulnerabilityType}`,
            text: `AI Explanation Unavailable\n\n${fallbackExplanation}\n\nNote: ${configHint}`
          });
        }
      } else if (message.command === 'generateFix') {
        // Fix single vulnerability from Results panel (Merge Fix button)
        const idx = message.index;
        const issue = lastScanResults[idx];
        if (!issue) {
          showNotification(NotificationType.WARNING, 'Vulnerability not found');
          return;
        }
        const vuln = scanResultToVulnerability(issue, idx);
        vscode.commands.executeCommand('ciphermate.generateFix', vuln);
      } else if (message.command === 'generateFixAll') {
        // Fix All / Merge All - batch fix visible results
        const indices = message.indices as number[] | undefined;
        const vulns = (indices ?? lastScanResults.map((_, i) => i))
          .map(i => lastScanResults[i])
          .filter(Boolean)
          .map((issue, i) => scanResultToVulnerability(issue, indices?.[i] ?? i));
        if (vulns.length === 0) {
          showNotification(NotificationType.WARNING, 'No vulnerabilities to fix');
          return;
        }
        vscode.commands.executeCommand('ciphermate.batchFix', vulns);
      } else if (message.command === 'markFalsePositive') {
        const idx = message.index;
        const issue = lastScanResults[idx];
        if (!issue) return;
        const fp = (issue.path || issue.filename || issue.file || '').trim();
        const line = issue.start?.line ?? issue.line ?? issue.line_number ?? 0;
        const desc = (issue.extra?.message || issue.issue_text || issue.description || '').slice(0, 60);
        const key = `suppress:${fp}:${line}:${desc}`;
        const suppressions = new Set<string>(context.globalState.get<string[]>('ciphermate.falsePositiveSuppressions', []) || []);
        suppressions.add(key);
        context.globalState.update('ciphermate.falsePositiveSuppressions', Array.from(suppressions));
        showNotification(NotificationType.INFO, 'Dismissed from findings');
        postResultsToWebview();
      } else if (message.command === 'restoreSuppression') {
        const key = message.key;
        if (!key) return;
        const suppressions = new Set<string>(context.globalState.get<string[]>('ciphermate.falsePositiveSuppressions', []) || []);
        suppressions.delete(key);
        context.globalState.update('ciphermate.falsePositiveSuppressions', Array.from(suppressions));
        showNotification(NotificationType.INFO, 'Restored to findings');
        postResultsToWebview();
      } else if (message.command === 'clearSuppressions') {
        context.globalState.update('ciphermate.falsePositiveSuppressions', []);
        showNotification(NotificationType.INFO, 'All dismissed items restored');
        postResultsToWebview();
      } else if (message.command === 'fixIt' || message.command === 'explain') {
        const idx = message.index;
        const issue = lastScanResults[idx];
        if (!issue) { return; }

        if (message.command === 'fixIt') {
          // Wire Fix it to actual code application: generate fix proposal and apply to files
          try {
            const vulnerability = scanResultToVulnerability(issue, idx);
            if (!vulnerability.code && vulnerability.file) {
              vulnerability.code = getCodeContext(vulnerability.file, vulnerability.line || 1);
            }
            await vscode.commands.executeCommand('ciphermate.generateFix', vulnerability);
          } catch (err) {
            logger?.error('Fix it failed', err as Error);
            const errorMsg = err instanceof Error ? err.message : String(err);
            resultsPanel?.webview.postMessage({ command: 'llmResponse', index: idx, action: 'fixIt', response: `Could not apply fix: ${errorMsg}` });
            showNotification(NotificationType.ERROR, 'Fix failed', errorMsg);
          }
          return;
        }

        // Explain: AI analysis only (no file edits)
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const relPath = (issue.path || issue.filename || issue.file || '').trim();
        const absPath = workspaceRoot && relPath && !path.isAbsolute(relPath) ? path.join(workspaceRoot, relPath) : relPath;
        const codeContext = getCodeContext(absPath, issue.start?.line || issue.line_number || 0);
        const vulnerabilityType = detectVulnerabilityType(issue);
        const basePrompt = `
As a security expert, explain this vulnerability in detail:

Vulnerability: ${issue.extra?.message || issue.issue_text || issue.check_id || 'Security issue'}
File: ${issue.path || issue.file}:${issue.start?.line || issue.line_number}
Tool: ${issue.tool}
Severity: ${issue.severity}

ACTUAL CODE FROM FILE:
\`\`\`
${codeContext || issue.code || 'Code not available'}
\`\`\`

Please provide:
1. A detailed explanation of the vulnerability based on the actual code shown
2. The potential impact and risks
3. How attackers could exploit this specific code
4. Why this is a security concern
5. Related security concepts
`;
        logger.info('AI analysis initiated', { operation: 'vulnerability_explanation', vulnerabilityType });

        // Get personalized prompt based on developer's learning history
        const personalizedPrompt = getPersonalizedPrompt(basePrompt, vulnerabilityType, context);
        
        try {
          const response = await callLmStudioEnhanced(personalizedPrompt, codeContext);
          
          // Track conversation for memory
          addConversationEntry({
            timestamp: Date.now(),
            vulnerability: vulnerabilityType,
            question: 'Explain this vulnerability',
            aiResponse: response
          }, context);
          
          // Update learning progress
          updateLearningProgress(vulnerabilityType, context);
          
          resultsPanel?.webview.postMessage({ command: 'llmResponse', index: idx, action: message.command, response });
          showNotification(NotificationType.SUGGESTION, 'AI has generated a personalized explanation for the vulnerability');
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
    
    // Send current results to the webview - use multiple attempts since webview loads asynchronously
    const sendData = () => {
      postResultsToWebview().catch(err => {
        logger?.error('Failed to post results to webview', err as Error);
      });
    };
    
    sendData();
    setTimeout(sendData, 150);
    setTimeout(sendData, 400);
    setTimeout(sendData, 800);
    // webviewReady message also triggers postResultsToWebview
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
    
    panel.webview.html = getTeamDashboardHtml(teamLead!, teamVulnerabilityReports, panel.webview);
    
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
    
    panel.webview.html = getTeamSetupHtml(panel.webview);
    
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

  // Command: Lookup CVE
  let lookupCVEDisposable = vscode.commands.registerCommand('ciphermate.lookupCVE', async () => {
    const cveId = await vscode.window.showInputBox({
      prompt: 'Enter CVE ID (e.g., CVE-2024-1234)',
      placeHolder: 'CVE-2024-1234',
      validateInput: (value) => {
        if (!value) {
          return 'CVE ID is required';
        }
        const cveRegex = /^CVE-\d{4}-\d{4,}$/i;
        if (!cveRegex.test(value.trim())) {
          return 'Invalid CVE format. Expected: CVE-YYYY-NNNNN';
        }
        return null;
      },
    });

    if (!cveId) {
      return;
    }

    const normalizedCveId = cveId.trim().toUpperCase();
    
    try {
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Looking up ${normalizedCveId}...`,
          cancellable: false,
        },
        async (progress) => {
          const { cveLookupService } = await import('./scanners/cve-lookup-service');
          const cveData = await cveLookupService.lookupCVE(normalizedCveId);

          if (!cveData) {
            vscode.window.showWarningMessage(
              `CVE ${normalizedCveId} not found in the database.`,
              'Open in Browser'
            ).then((action) => {
              if (action === 'Open in Browser') {
                vscode.env.openExternal(vscode.Uri.parse(`https://nvd.nist.gov/vuln/detail/${normalizedCveId}`));
              }
            });
            return;
          }

          // Display CVE details in a webview panel
          const panel = vscode.window.createWebviewPanel(
            'cveDetails',
            `CVE ${normalizedCveId}`,
            vscode.ViewColumn.One,
            { enableScripts: true }
          );

          const cvssInfo = cveData.cvss?.v3 || cveData.cvss?.v2;
          const cvssScore = cvssInfo ? `${cvssInfo.score} (${cvssInfo.severity})` : 'Not available';
          
          panel.webview.html = wrapWebviewHtml(panel.webview, `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body {
                  font-family: var(--vscode-font-family);
                  padding: 20px;
                  color: var(--vscode-foreground);
                  background: var(--vscode-editor-background);
                }
                h1 { color: var(--vscode-textLink-foreground); margin-top: 0; }
                .section { margin: 20px 0; padding: 15px; background: var(--vscode-panel-background); border: 1px solid var(--vscode-panel-border); }
                .label { font-weight: bold; color: var(--vscode-descriptionForeground); }
                .value { margin-top: 5px; }
                .cvss { font-size: 24px; font-weight: bold; color: var(--vscode-textLink-foreground); }
                a { color: var(--vscode-textLink-foreground); }
              </style>
            </head>
            <body>
              <h1>${cveData.id}</h1>
              
              <div class="section">
                <div class="label">CVSS Score</div>
                <div class="cvss">${cvssScore}</div>
              </div>
              
              ${cveData.description ? `
              <div class="section">
                <div class="label">Description</div>
                <div class="value">${cveData.description}</div>
              </div>
              ` : ''}
              
              ${cveData.published ? `
              <div class="section">
                <div class="label">Published</div>
                <div class="value">${new Date(cveData.published).toLocaleDateString()}</div>
              </div>
              ` : ''}
              
              ${cveData.remediation ? `
              <div class="section">
                <div class="label">Remediation</div>
                <div class="value">${cveData.remediation.replace(/\n/g, '<br>')}</div>
              </div>
              ` : ''}
              
              ${cveData.references && cveData.references.length > 0 ? `
              <div class="section">
                <div class="label">References</div>
                <div class="value">
                  ${cveData.references.map((ref: string) => `<a href="${ref}" target="_blank">${ref}</a>`).join('<br>')}
                </div>
              </div>
              ` : ''}
              
              <div class="section">
                <a href="https://nvd.nist.gov/vuln/detail/${normalizedCveId}" target="_blank">View on NVD</a>
              </div>
            </body>
            </html>
          `);
        }
      );
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to lookup CVE: ${error.message}`);
    }
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
      
      // Prompt user to review dashboard
      const criticalCount = prioritizedVulns.filter((v: any) => v.severity === 'CRITICAL' || v.severity === 'ERROR').length;
      promptReviewDashboard('RAG Analysis', prioritizedVulns.length, criticalCount);
      
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
      
      // Prompt user to review dashboard
      const criticalCount = lastScanResults.filter((r: any) => r.severity === 'CRITICAL' || r.severity === 'ERROR').length;
      promptReviewDashboard('AI Analysis', lastScanResults.length, criticalCount);
      
      if (lastScanResults.length > 0) {
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
      
      // Prompt user to review dashboard
      const criticalCount = lastScanResults.filter((r: any) => r.severity === 'CRITICAL' || r.severity === 'HIGH').length;
      promptReviewDashboard('Red Team Analysis', lastScanResults.length, criticalCount);
      
      if (lastScanResults.length > 0) {
        showNotification(NotificationType.VULNERABILITY, `Red team analysis: ${lastScanResults.length} attack vectors identified (${criticalCount} critical/high)`);
      } else {
        logger.info('Red team analysis completed', { attackVectors: 0 });
      }
    } catch (e) {
      console.error('Red team analysis error:', e);
      showNotification(NotificationType.ERROR, 'Red team analysis failed', String(e));
    }
  });

  // Live Static Analysis - always-on rule-based security diagnostics (no AI required)
  const liveDiagnosticsModule = require('./core/live-diagnostics-service');
  const liveDiagnosticsService = liveDiagnosticsModule.getLiveDiagnosticsService();

  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('ciphermate.enableLiveReview')) {
      liveDiagnosticsService.setEnabled(vscode.workspace.getConfiguration('ciphermate').get('enableLiveReview', true));
    }
  });

  liveDiagnosticsService.setEnabled(vscode.workspace.getConfiguration('ciphermate').get('enableLiveReview', true));

  const liveReviewChangeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
    const config = vscode.workspace.getConfiguration('ciphermate');
    if (!config.get('enableLiveReview', true)) return;
    liveDiagnosticsService.analyzeDocument(event.document);
  });

  const liveReviewOpenDisposable = vscode.workspace.onDidOpenTextDocument((document) => {
    const config = vscode.workspace.getConfiguration('ciphermate');
    if (!config.get('enableLiveReview', true)) return;
    liveDiagnosticsService.analyzeDocument(document);
  });

  // Analyze already-open documents on activation
  vscode.workspace.textDocuments.forEach((doc) => {
    if (vscode.workspace.getConfiguration('ciphermate').get('enableLiveReview', true) && isCodeFile(doc.fileName)) {
      liveDiagnosticsService.analyzeDocument(doc);
    }
  });

  // Register inline suggestion provider
  const inlineSuggestionDisposable = vscode.languages.registerInlineCompletionItemProvider(
    { scheme: 'file' },
    inlineSuggestionProvider
  );

  // Register CodeLens provider for Explain buttons
  const codeLensDisposable = vscode.languages.registerCodeLensProvider(
    { scheme: 'file' },
    vulnerabilityCodeLensProvider
  );

  // Command: Explain line (triggered by CodeLens)
  let explainLineDisposable = vscode.commands.registerCommand('ciphermate.explainLine', async (filePath: string, lineNumber: number, vulnerability: any | null) => {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    let normalizedPath = filePath;
    
    // Normalize path
    if (workspaceRoot && !path.isAbsolute(filePath)) {
      normalizedPath = path.join(workspaceRoot, filePath);
    }
    
    try {
      const uri = vscode.Uri.file(normalizedPath);
      const document = await vscode.workspace.openTextDocument(uri);
      const codeContext = getCodeContext(normalizedPath, lineNumber);
      const vulnerabilityType = vulnerability ? detectVulnerabilityType(vulnerability) : 'Security Issue';
      
      let explainPrompt: string;
      if (vulnerability) {
        // Explain specific vulnerability
        explainPrompt = `
As a security expert, provide a brief explanation of this vulnerability:

Vulnerability: ${vulnerability.extra?.message || vulnerability.issue_text || vulnerability.check_id || 'Security issue'}
File: ${vulnerability.path || vulnerability.filename}
Line: ${vulnerability.start?.line || vulnerability.line_number || 1}
Severity: ${vulnerability.extra?.severity || vulnerability.severity || 'Unknown'}
Type: ${vulnerabilityType}

Code Context:
${codeContext}

Provide a concise explanation (2-3 sentences) of what this vulnerability is and why it's dangerous.
        `;
      } else {
        // Explain code at this line (general security analysis)
        const lineText = document.lineAt(Math.max(0, lineNumber - 1)).text;
        explainPrompt = `
As a security expert, analyze this line of code for potential security issues:

File: ${normalizedPath}
Line: ${lineNumber}
Code: ${lineText}

Code Context:
${codeContext}

Provide a brief security analysis (2-3 sentences) of this code line, highlighting any potential security concerns.
        `;
      }
        
      callLmStudio(explainPrompt).then((response) => {
        // Show explanation in a webview panel or notification
        if (resultsPanel) {
          resultsPanel.webview.postMessage({
            command: 'showExplanation',
            title: `Security Explanation - ${vulnerabilityType}`,
            text: response
          });
          resultsPanel.reveal(vscode.ViewColumn.Two, false);
        } else {
          vscode.window.showInformationMessage(
            `${vulnerabilityType}: ${response.substring(0, 200)}${response.length > 200 ? '...' : ''}`,
            'View Full Explanation'
          ).then((viewAction) => {
            if (viewAction === 'View Full Explanation') {
              vscode.commands.executeCommand('ciphermate.showResults');
            }
          });
        }
      }).catch((error) => {
        let fallbackExplanation: string;
        if (vulnerability) {
          fallbackExplanation = getFallbackExplanation(vulnerability, vulnerabilityType);
        } else {
          fallbackExplanation = `This line of code may contain security concerns. Review the code carefully for common vulnerabilities like injection attacks, insecure deserialization, or improper access control.`;
        }
        
        if (resultsPanel) {
          resultsPanel.webview.postMessage({
            command: 'showExplanation',
            title: `Security Explanation - ${vulnerabilityType}`,
            text: fallbackExplanation
          });
          resultsPanel.reveal(vscode.ViewColumn.Two, false);
        } else {
          vscode.window.showInformationMessage(fallbackExplanation.substring(0, 200));
        }
      });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to explain line: ${error.message}`);
    }
  });

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

    panel.webview.html = wrapWebviewHtml(panel.webview, `
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
    `);

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

    panel.webview.html = getUserProfileHtml(panel.webview, currentUser, vulnerabilityHistory);

    panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'loginWithProvider':
          await authenticateWithProvider(message.provider, context);
          panel.webview.html = getUserProfileHtml(panel.webview, currentUser, vulnerabilityHistory);
          break;
        case 'loginWithGitHub':
          await authenticateWithProvider('github', context);
          panel.webview.html = getUserProfileHtml(panel.webview, currentUser, vulnerabilityHistory);
          break;
        case 'logout':
          await logout(context);
          panel.webview.html = getUserProfileHtml(panel.webview, currentUser, vulnerabilityHistory);
          break;
      }
    });
  }

  // Convert scan result (from lastScanResults) to FixService Vulnerability format
  function scanResultToVulnerability(issue: any, index: number): any {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    let filePath = (issue.path || issue.filename || issue.file || '').trim();
    if (workspaceRoot && filePath && !path.isAbsolute(filePath)) {
      filePath = path.join(workspaceRoot, filePath);
    }
    const line = issue.start?.line ?? issue.line ?? issue.line_number ?? 1;
    const desc = (issue.extra?.message) || issue.issue_text || issue.check_id || issue.message || issue.description || 'Security issue';
    const sev = (issue.severity || issue.extra?.severity || 'medium').toString().toLowerCase();
    const severityMap: Record<string, string> = {
      critical: 'critical', error: 'critical', high: 'high', warning: 'high',
      medium: 'medium', info: 'medium', low: 'low'
    };
    return {
      id: `vuln-${index}-${Date.now()}`,
      type: issue.type || issue.tool || 'security-issue',
      severity: severityMap[sev] || 'medium',
      title: desc,
      description: desc,
      file: filePath,
      line,
      column: issue.start?.col ?? issue.column,
      code: issue.code || issue.match || issue.extra?.lines,
      cwe: issue.cwe || issue.extra?.cwe,
      metadata: issue.metadata || {}
    };
  }

  // Fix System Commands
  const { FixService } = require('./fix-system');
  const fixService = new FixService(context);

  // Connect fix service to chat interface for result communication
  // This allows fix results to be shown in the chat UI
  if (chatInterface && typeof chatInterface.setFixService === 'function') {
    chatInterface.setFixService(fixService);
  }

  // Generate a fix for a vulnerability
  let generateFixDisposable = vscode.commands.registerCommand('ciphermate.generateFix', async (vulnerability: any) => {
    if (!vulnerability) {
      vscode.window.showWarningMessage('No vulnerability provided for fix generation');
      return;
    }

    try {
      // Show progress while generating fix
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'CipherMate: Generating secure fix...',
        cancellable: false
      }, async (progress) => {
        progress.report({ increment: 0, message: 'Analyzing vulnerability...' });

        // Generate the fix proposal
        const proposal = await fixService.generateFix(vulnerability);

        progress.report({ increment: 50, message: 'Generating diff preview...' });

        // Generate preview diff
        const diff = await fixService.previewFix(proposal);

        progress.report({ increment: 100, message: 'Fix generated!' });

        // Show the fix preview with options
        const confidencePercent = Math.round(proposal.confidence * 100);
        const choice = await vscode.window.showInformationMessage(
          `Fix Generated for ${vulnerability.type || 'vulnerability'}\n\n` +
          `File: ${proposal.vulnerability.file}\n` +
          `Confidence: ${confidencePercent}%\n` +
          `Risk Level: ${proposal.riskLevel}\n` +
          `Changes: +${diff.additions} -${diff.deletions} lines\n\n` +
          `${proposal.explanation}`,
          { modal: true },
          'Apply Fix',
          'Preview Diff',
          'Cancel'
        );

        if (choice === 'Apply Fix') {
          const result = await fixService.applyFix(proposal, true);
          if (result.success) {
            vscode.window.showInformationMessage(
              `Fix applied successfully to ${proposal.vulnerability.file}. You can undo with "CipherMate: Undo Last Fix"`
            );
          } else {
            vscode.window.showErrorMessage(`Failed to apply fix: ${result.error}`);
          }
        } else if (choice === 'Preview Diff') {
          // Show diff in output channel
          const outputChannel = vscode.window.createOutputChannel('CipherMate Fix Preview');
          outputChannel.clear();
          outputChannel.appendLine('='.repeat(60));
          outputChannel.appendLine(`FIX PREVIEW: ${proposal.vulnerability.file}`);
          outputChannel.appendLine('='.repeat(60));
          outputChannel.appendLine('');
          outputChannel.appendLine(`Vulnerability: ${vulnerability.type || 'Security Issue'}`);
          outputChannel.appendLine(`Severity: ${vulnerability.severity || 'Unknown'}`);
          outputChannel.appendLine(`Confidence: ${confidencePercent}%`);
          outputChannel.appendLine(`Risk Level: ${proposal.riskLevel}`);
          outputChannel.appendLine('');
          outputChannel.appendLine('--- ORIGINAL CODE ---');
          outputChannel.appendLine(proposal.originalCode);
          outputChannel.appendLine('');
          outputChannel.appendLine('+++ FIXED CODE +++');
          outputChannel.appendLine(proposal.fixedCode);
          outputChannel.appendLine('');
          outputChannel.appendLine('--- EXPLANATION ---');
          outputChannel.appendLine(proposal.explanation);
          if (proposal.securityImprovements && proposal.securityImprovements.length > 0) {
            outputChannel.appendLine('');
            outputChannel.appendLine('--- SECURITY IMPROVEMENTS ---');
            proposal.securityImprovements.forEach((imp: string) => {
              outputChannel.appendLine(`• ${imp}`);
            });
          }
          outputChannel.show();

          // After showing preview, offer to apply
          const applyChoice = await vscode.window.showInformationMessage(
            'Would you like to apply this fix?',
            'Apply Fix',
            'Cancel'
          );
          if (applyChoice === 'Apply Fix') {
            const result = await fixService.applyFix(proposal, true);
            if (result.success) {
              vscode.window.showInformationMessage(
                `Fix applied successfully. You can undo with "CipherMate: Undo Last Fix"`
              );
            } else {
              vscode.window.showErrorMessage(`Failed to apply fix: ${result.error}`);
            }
          }
        }
      });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to generate fix: ${error.message || error}`);
    }
  });

  let previewFixDisposable = vscode.commands.registerCommand('ciphermate.previewFix', async (fixId: string) => {
    const proposals = fixService.getPendingProposals();
    const proposal = proposals.find((p: any) => p.id === fixId);
    if (proposal) {
      const diff = await fixService.previewFix(proposal);
      vscode.window.showInformationMessage(`Preview for fix: ${diff.additions} additions, ${diff.deletions} deletions`);
    } else {
      vscode.window.showWarningMessage('Fix proposal not found');
    }
  });

  let applySelectedFixDisposable = vscode.commands.registerCommand('ciphermate.applySelectedFix', async (fixId: string, confirmed: boolean = false) => {
    const proposals = fixService.getPendingProposals();
    const proposal = proposals.find((p: any) => p.id === fixId);
    if (proposal) {
      if (!confirmed) {
        const diff = await fixService.previewFix(proposal);
        const choice = await vscode.window.showInformationMessage(
          `Apply fix to ${proposal.vulnerability.file}?\n\nConfidence: ${Math.round(proposal.confidence * 100)}%\nRisk: ${proposal.riskLevel}\nChanges: ${diff.additions} additions, ${diff.deletions} deletions`,
          { modal: true },
          'Apply Fix',
          'Cancel'
        );
        if (choice !== 'Apply Fix') {
          return;
        }
      }
      const result = await fixService.applyFix(proposal, true);
      if (result.success) {
        vscode.window.showInformationMessage(`Fix applied successfully. You can undo with "CipherMate: Undo Last Fix"`);
      } else {
        vscode.window.showErrorMessage(`Failed to apply fix: ${result.error}`);
      }
    } else {
      vscode.window.showWarningMessage('Fix proposal not found');
    }
  });

  let undoLastFixDisposable = vscode.commands.registerCommand('ciphermate.undoLastFix', async () => {
    const canUndo = await fixService.canUndo();
    if (!canUndo) {
      vscode.window.showInformationMessage('No fixes to undo');
      return;
    }
    const choice = await vscode.window.showWarningMessage(
      'Undo the last applied fix?',
      { modal: true },
      'Undo',
      'Cancel'
    );
    if (choice === 'Undo') {
      const success = await fixService.undoLastFix();
      if (success) {
        vscode.window.showInformationMessage('Fix undone successfully');
      } else {
        vscode.window.showErrorMessage('Failed to undo fix');
      }
    }
  });

  let batchFixDisposable = vscode.commands.registerCommand('ciphermate.batchFix', async (vulnerabilities: any[]) => {
    if (!vulnerabilities || vulnerabilities.length === 0) {
      vscode.window.showWarningMessage('No vulnerabilities provided for batch fix');
      return;
    }

    try {
      // Show progress while generating fixes
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'CipherMate: Generating batch fixes...',
        cancellable: true
      }, async (progress, token) => {
        const proposals: any[] = [];
        const total = vulnerabilities.length;

        // Generate fix proposals for each vulnerability
        for (let i = 0; i < vulnerabilities.length; i++) {
          if (token.isCancellationRequested) {
            vscode.window.showInformationMessage('Batch fix generation cancelled');
            return;
          }

          const vuln = vulnerabilities[i];
          progress.report({
            increment: (100 / total),
            message: `Generating fix ${i + 1}/${total}: ${vuln.type || 'vulnerability'}...`
          });

          try {
            const proposal = await fixService.generateFix(vuln);
            // Only include proposals with real code fixes (not comment-only advice)
            if (proposal && !fixService.isProposalCommentOnly(proposal)) {
              proposals.push(proposal);
            }
          } catch (error: any) {
            console.error(`Failed to generate fix for vulnerability ${i + 1}:`, error);
            // Continue with other vulnerabilities
          }
        }

        const failedCount = total - proposals.length;
        if (proposals.length === 0) {
          vscode.window.showErrorMessage(
            failedCount > 0
              ? `Could not generate automatic fixes for any of ${total} findings. Configure an AI provider in CipherMate Settings for AI-powered fixes, or fix manually.`
              : 'No vulnerabilities to fix'
          );
          return;
        }

        // Filter out comment-only "fixes" (advice blocks, not real code edits)
        const executableProposals = fixService.filterApplyableProposals(proposals);
        const skipped = proposals.length - executableProposals.length;
        if (executableProposals.length === 0) {
          vscode.window.showErrorMessage(
            `No executable fixes available. ${skipped} finding(s) need AI or manual fixes. Configure an AI provider in CipherMate Settings.`
          );
          return;
        }
        if (skipped > 0) {
          vscode.window.showInformationMessage(
            `${skipped} finding(s) could not be auto-fixed (advice only). ${executableProposals.length} fix(es) will be applied.`
          );
        }

        // Generate batch preview
        const preview = await fixService.generateBatchPreview(executableProposals);

        // Show summary and confirmation
        const highConfidence = executableProposals.filter((p: any) => p.confidence >= 0.7).length;
        const lowConfidence = executableProposals.length - highConfidence;

        const failedNote = failedCount > 0 ? ` (${failedCount} could not be auto-fixed)` : '';
        const choice = await vscode.window.showInformationMessage(
          `Batch Fix Summary\n\n` +
          `Fixable: ${executableProposals.length} of ${total} findings${failedNote}\n` +
          `High confidence (≥70%): ${highConfidence}\n` +
          `Low confidence (<70%): ${lowConfidence}\n` +
          `Files affected: ${preview.summary.totalFiles}\n` +
          `Total changes: +${preview.summary.totalAdditions} -${preview.summary.totalDeletions} lines\n` +
          `Overall confidence: ${Math.round(preview.summary.overallConfidence * 100)}%`,
          { modal: true },
          'Apply All Fixes',
          'Apply High Confidence Only',
          'Cancel'
        );

        if (choice === 'Apply All Fixes') {
          const result = await fixService.applyBatchFixes(executableProposals, true);
          vscode.window.showInformationMessage(
            `Batch fix complete: ${result.successful} applied, ${result.failed} failed. Use "CipherMate: Undo Last Fix" to rollback.`
          );
        } else if (choice === 'Apply High Confidence Only') {
          const highConfidenceProposals = executableProposals.filter((p: any) => p.confidence >= 0.7);
          if (highConfidenceProposals.length === 0) {
            vscode.window.showWarningMessage('No high confidence fixes available');
            return;
          }
          const result = await fixService.applyBatchFixes(highConfidenceProposals, true);
          vscode.window.showInformationMessage(
            `Batch fix complete: ${result.successful} applied, ${result.failed} failed. Use "CipherMate: Undo Last Fix" to rollback.`
          );
        }
      });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Batch fix failed: ${error.message || error}`);
    }
  });

  let showFixHistoryDisposable = vscode.commands.registerCommand('ciphermate.showFixHistory', async () => {
    const history = await fixService.getUndoHistory();
    if (history.length === 0) {
      vscode.window.showInformationMessage('No fix history available');
      return;
    }
    const items: vscode.QuickPickItem[] = history.map((entry: any) => ({
      label: `${entry.backup.filePath}`,
      description: `Applied: ${new Date(entry.addedAt).toLocaleString()}`,
      detail: `Fix ID: ${entry.fixResultId}`
    }));
    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a fix to view details or undo',
      canPickMany: false
    });
    if (selected) {
      const choice = await vscode.window.showInformationMessage(
        `Fix: ${selected.label}\n${selected.description || ''}`,
        'Undo This Fix',
        'Close'
      );
      if (choice === 'Undo This Fix') {
        const entry = history.find((e: any) => e.backup.filePath === selected.label);
        if (entry) {
          const success = await fixService.undoFix(entry.fixResultId);
          if (success) {
            vscode.window.showInformationMessage('Fix undone successfully');
          } else {
            vscode.window.showErrorMessage('Failed to undo fix');
          }
        }
      }
    }
  });

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
    benchmarkDisposable,
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
    liveReviewChangeDisposable,
    liveReviewOpenDisposable,
    { dispose: () => liveDiagnosticsService.dispose() }, 
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
    redTeamOpsDisposable,
    generateFixDisposable,
    previewFixDisposable,
    applySelectedFixDisposable,
    undoLastFixDisposable,
    batchFixDisposable,
    showFixHistoryDisposable,
    lookupCVEDisposable,
    codeLensDisposable,
    explainLineDisposable
  );
}

export function deactivate() {
  if (activeCodeReviewer) {
    activeCodeReviewer.dispose();
    activeCodeReviewer = null;
  }
}

function getSettingsHtml(settings: any, webview: vscode.Webview) {
  return wrapWebviewHtml(webview, `
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
  `);
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
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 20px;
                height: 20px;
                margin-right: var(--spacing-sm);
                color: var(--vscode-textLink-foreground);
                opacity: 0.8;
            }
            
            .section-icon svg {
                width: 100%;
                height: 100%;
            }
            
            .section-icon-old {
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
                            <div class="setting-title">Live Static Analysis</div>
                            <div class="setting-description">Always watch code and point out security issues as you edit (squiggles in Problems panel)</div>
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
                        <span class="section-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                            </svg>
                        </span>
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
                        <span class="section-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path>
                                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                            </svg>
                        </span>
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
  
  return wrapWebviewHtml(panel.webview, `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CipherMate Home</title>
        <style>
            :root {
                --border-radius: 10px;
                --border-radius-sm: 6px;
                --accent-warm: #b86f4a;
                --accent-sage: #5a7d6e;
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
            }
            
            body {
                font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
                font-size: var(--font-size-md);
                font-weight: var(--font-weight-normal);
                color: var(--vscode-foreground);
                background: linear-gradient(160deg, var(--vscode-editor-background) 0%, var(--vscode-panel-background) 50%, rgba(107, 144, 128, 0.04) 100%);
                margin: 0;
                padding: 0;
                line-height: 1.6;
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
                background: linear-gradient(180deg, rgba(184, 111, 74, 0.2) 0%, var(--vscode-panel-background) 100%);
                border-radius: var(--border-radius);
                border: 1px solid var(--vscode-panel-border);
                box-shadow: var(--shadow-sm);
            }
            
      .logo {
                font-size: var(--font-size-xxxl);
                font-weight: var(--font-weight-bold);
                color: var(--accent-warm);
                margin-bottom: var(--spacing-sm);
        display: flex;
        align-items: center;
                justify-content: center;
                gap: var(--spacing-sm);
            }
            
            .logo img {
                /* Use CSS filter that adapts based on background brightness */
                /* Invert logo by default - will be overridden if light mode */
                filter: brightness(0) invert(1);
                transition: filter 0.3s ease, opacity 0.3s ease;
                opacity: 0.95;
            }
            
            /* If foreground color is dark (light theme), keep logo dark (no invert) */
            /* This uses CSS custom properties to detect theme */
            body:has([style*="color: rgb(0"]):not(:has([style*="color: rgb(255"])) .logo img,
            body:has([style*="color: rgb(1"]):not(:has([style*="color: rgb(255"])) .logo img,
            body:has([style*="color: rgb(2"]):not(:has([style*="color: rgb(255"])) .logo img {
                filter: none !important;
                opacity: 1 !important;
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
                border-radius: 12px;
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
                border-radius: 0;
                overflow: hidden;
                position: relative;
            }
            
            .progress-fill {
                height: 100%;
                background: var(--vscode-progressBar-background);
                border-radius: 0;
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
                    <img src="${panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'images', 'icon.svg'))}" alt="CipherMate" width="24" height="24" style="margin-right: 8px; background: transparent !important; border-radius: 0 !important;" id="home-logo">
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
            
            // Detect theme and adapt logo - using getComputedStyle directly
            function adaptLogoToTheme() {
                const logoImgs = document.querySelectorAll('.logo img');
                if (logoImgs.length === 0) {
                    setTimeout(adaptLogoToTheme, 100);
                    return;
                }
                
                try {
                    // Get foreground color as RGB string
                    const fgColor = window.getComputedStyle(document.body).color;
                    
                    // Parse RGB - split by comma and extract numbers
                    const parts = fgColor.replace(/[rgb()\\s]/g, '').split(',');
                    
                    if (parts.length >= 3) {
                        const r = parseInt(parts[0]) || 0;
                        const g = parseInt(parts[1]) || 0;
                        const b = parseInt(parts[2]) || 0;
                        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                        
                        logoImgs.forEach(img => {
                            if (brightness > 180) {
                                // Light text = dark background - invert logo to white
                                img.style.filter = 'brightness(0) invert(1)';
                                img.style.opacity = '0.95';
                            } else {
                                // Dark text = light background - keep logo dark
                                img.style.filter = 'none';
                                img.style.opacity = '1';
                            }
                        });
                    } else {
                        // Fallback: check background
                        const bgColor = window.getComputedStyle(document.body).backgroundColor;
                        const bgParts = bgColor.replace(/[rgb()\\s]/g, '').split(',');
                        
                        if (bgParts.length >= 3) {
                            const r = parseInt(bgParts[0]) || 0;
                            const g = parseInt(bgParts[1]) || 0;
                            const b = parseInt(bgParts[2]) || 0;
                            const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                            
                            logoImgs.forEach(img => {
                                if (brightness < 128) {
                                    img.style.filter = 'brightness(0) invert(1)';
                                    img.style.opacity = '0.95';
                                } else {
                                    img.style.filter = 'none';
                                    img.style.opacity = '1';
                                }
                            });
                        }
                    }
                } catch (e) {
                    // Silent fail - keep default inverted
                }
            }
            
            // Run multiple times to catch theme changes
            adaptLogoToTheme();
            window.addEventListener('load', adaptLogoToTheme);
            setTimeout(adaptLogoToTheme, 100);
            setTimeout(adaptLogoToTheme, 500);
            
            // Watch for any style changes
            const observer = new MutationObserver(adaptLogoToTheme);
            observer.observe(document.body, {
                attributes: true,
                attributeFilter: ['style', 'class'],
                childList: true,
                subtree: true
            });
            
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
  `);
}

function getResultsPanelHtml(context?: vscode.ExtensionContext, panel?: vscode.WebviewPanel) {
  // Get logo URI if context and panel are available
  let logoUri = '';
  if (context && panel) {
    logoUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'images', 'icon.svg')
    ).toString();
  }
  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CipherMate Results</title>
    <style>
        :root {
            --border-radius: 10px;
            --border-radius-sm: 6px;
            --border-radius-lg: 14px;
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
            --accent-warm: #b86f4a;
            --accent-warm-soft: rgba(184, 111, 74, 0.35);
            --accent-sage: #5a7d6e;
            --accent-sage-soft: rgba(90, 125, 110, 0.3);
        }
        
        * {
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'SF Pro Text', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: var(--font-size-md);
            font-weight: var(--font-weight-normal);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            margin: 0;
            padding: 0;
            line-height: 1.65;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            position: relative;
        }
        
        body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: var(--accent-warm);
            z-index: 1000;
            pointer-events: none;
        }
        
        .container {
            padding: var(--spacing-xl);
            max-width: 100%;
            overflow-x: visible;
            overflow-y: visible;
        }
        
        .header {
            margin-bottom: var(--spacing-xxl);
            padding-bottom: var(--spacing-xl);
            border-bottom: 2px solid var(--vscode-panel-border);
            position: relative;
            background: var(--vscode-panel-background);
            padding-top: var(--spacing-lg);
            padding-left: var(--spacing-xl);
            padding-right: var(--spacing-xl);
            margin-left: calc(-1 * var(--spacing-xl));
            margin-right: calc(-1 * var(--spacing-xl));
            border-radius: var(--border-radius-lg);
            overflow: visible;
        }
        
        .title {
            font-size: 22px;
            font-weight: 600;
            color: var(--vscode-foreground);
            margin: 0 0 var(--spacing-xs) 0;
            letter-spacing: -0.01em;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'SF Pro Text', Roboto, 'Helvetica Neue', Arial, sans-serif;
            position: relative;
            padding-left: var(--spacing-lg);
            display: flex;
            align-items: center;
            gap: var(--spacing-md);
        }
        
        .title::before {
            content: '';
            position: absolute;
            left: 0;
            top: 50%;
            transform: translateY(-50%);
            width: 4px;
            height: 24px;
            background: var(--accent-warm);
            border-radius: 2px;
        }
        
        .title-logo {
            width: 24px;
            height: 24px;
            flex-shrink: 0;
        }
        
        .subtitle {
            font-size: var(--font-size-md);
            color: var(--vscode-descriptionForeground);
            margin: 0 0 var(--spacing-lg) 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
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
            padding: var(--spacing-xs) var(--spacing-md);
            background: var(--vscode-panel-background);
            border: 2px solid var(--vscode-panel-border);
            border-left: 4px solid var(--accent-warm);
            border-radius: var(--border-radius-sm);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-weight: 500;
        }
        
        .scan-time {
            font-size: var(--font-size-sm);
            color: var(--vscode-descriptionForeground);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: var(--vscode-panel-background);
            padding: var(--spacing-xs) var(--spacing-md);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 0;
            font-weight: 500;
            letter-spacing: 0.02em;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
            gap: var(--spacing-md);
            margin-bottom: var(--spacing-xl);
        }
        
        .stat-card {
            background: var(--vscode-panel-background);
            border: 2px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: var(--spacing-lg);
            text-align: center;
            transition: all 0.2s ease;
            position: relative;
            overflow: hidden;
        }
        
        .stat-card:hover {
            transform: translateY(-1px);
        }
        
        .stat-number {
            font-size: 32px;
            font-weight: 700;
            color: var(--vscode-foreground);
            display: block;
            margin-bottom: var(--spacing-xs);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            letter-spacing: -0.03em;
            line-height: 1.1;
        }
        
        .stat-label {
            font-size: var(--font-size-sm);
            color: var(--vscode-descriptionForeground);
            text-transform: none;
            letter-spacing: 0;
            font-weight: var(--font-weight-medium);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        }
        
        .stat-critical {
            background: #2d1515;
            border: 2px solid #c62828;
        }
        .stat-critical .stat-number {
            color: #ef5350;
            font-weight: 700;
        }
        .stat-critical .stat-label {
            color: #b0b0b0;
        }
        
        .stat-high {
            background: #2d200a;
            border: 2px solid #e65100;
        }
        .stat-high .stat-number {
            color: #ff9800;
            font-weight: 700;
        }
        .stat-high .stat-label {
            color: #b0b0b0;
        }
        
        .stat-medium {
            background: #0d2137;
            border: 2px solid #1565c0;
        }
        .stat-medium .stat-number {
            color: #42a5f5;
            font-weight: 700;
        }
        .stat-medium .stat-label {
            color: #b0b0b0;
        }
        
        .stat-low {
            background: #1e1e1e;
            border: 2px solid #616161;
        }
        .stat-low .stat-number {
            color: #9e9e9e;
            font-weight: 600;
        }
        .stat-low .stat-label {
            color: #b0b0b0;
        }
        
        .stat-card:not(.stat-critical):not(.stat-high):not(.stat-medium):not(.stat-low) {
            background: #1a1a1a;
            border: 2px solid #404040;
        }
        .stat-card:not(.stat-critical):not(.stat-high):not(.stat-medium):not(.stat-low) .stat-number {
            color: var(--vscode-foreground);
            font-weight: 700;
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
            border-radius: 0;
            font-size: var(--font-size-sm);
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            text-decoration: none;
            white-space: nowrap;
            min-height: 36px;
            position: relative;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        }
        
        .btn:active {
            transform: scale(0.98);
        }
        
        .btn:focus {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: 2px;
        }
        
        .btn-primary {
            background: var(--accent-warm);
            color: #fff;
            border: 2px solid #a86b47;
            border-radius: var(--border-radius-sm);
        }
        
        .btn-primary:hover {
            background: #c97a52;
            border-color: var(--accent-warm);
            transform: translateY(-1px);
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
        
        .btn-history {
            background-color: transparent;
            color: var(--vscode-foreground);
            border-color: var(--vscode-input-border);
            display: inline-flex;
            align-items: center;
            gap: var(--spacing-xs);
        }
        
        .btn-history:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        .btn-history svg {
            width: 16px;
            height: 16px;
        }
        
        .results-section {
            background-color: var(--vscode-panel-background);
            border: 2px solid var(--vscode-panel-border);
            border-radius: var(--border-radius-lg);
            overflow: visible;
            position: relative;
        }
        
        .results-section::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            border-radius: var(--border-radius-lg) var(--border-radius-lg) 0 0;
            background: var(--accent-warm);
        }
        
        .results-header {
            background: var(--vscode-panel-background);
            padding: var(--spacing-lg);
            border-bottom: 2px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: var(--spacing-sm);
            position: relative;
        }
        
        .results-title {
            font-size: var(--font-size-lg);
            font-weight: var(--font-weight-semibold);
            color: var(--vscode-foreground);
            margin: 0;
        }
        
        .results-header-actions {
            display: flex;
            align-items: center;
            gap: var(--spacing-sm);
        }
        
        .results-count {
            font-size: var(--font-size-sm);
            background-color: var(--vscode-input-background);
            color: var(--vscode-foreground);
            padding: var(--spacing-xs) var(--spacing-sm);
            border-radius: var(--border-radius-sm);
            font-weight: 500;
            border: 1px solid var(--vscode-input-border);
        }
        
        .results-content {
            max-height: 60vh;
            overflow-y: auto;
        }
        
        .result-item {
            display: flex;
            align-items: flex-start;
            padding: var(--spacing-lg);
            margin: 0 var(--spacing-sm) var(--spacing-md) var(--spacing-sm);
            border-bottom: 1px solid var(--vscode-panel-border);
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            z-index: 1;
            background: var(--vscode-panel-background);
            border-left: 4px solid transparent;
            border-radius: var(--border-radius-sm);
        }
        
        .result-item::before {
            content: '';
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 4px;
            border-radius: var(--border-radius-sm) 0 0 var(--border-radius-sm);
            background: var(--accent-warm);
            opacity: 0;
            transition: opacity 0.25s ease;
        }
        
        .result-item:last-child {
            border-bottom: none;
            margin-bottom: 0;
        }
        
        .result-item:hover {
            background: var(--vscode-list-hoverBackground);
            transform: translateX(4px);
            border-left-color: var(--accent-warm);
            z-index: 10;
        }
        
        .result-item:hover::before {
            opacity: 1;
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
            background: #c62828;
            color: #ffffff;
            border: 2px solid #b71c1c;
            font-weight: var(--font-weight-bold);
        }
        
        .severity-high {
            background: #e65100;
            color: #ffffff;
            border: 2px solid #bf360c;
            font-weight: var(--font-weight-bold);
        }
        
        .severity-medium {
            background: #1565c0;
            color: #ffffff;
            border: 2px solid #0d47a1;
            font-weight: var(--font-weight-semibold);
        }
        
        .severity-low {
            background: #616161;
            color: #ffffff;
            border: 2px solid #424242;
            font-weight: var(--font-weight-medium);
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
            margin: 0 0 var(--spacing-xs) 0;
            flex: 1;
            min-width: 0;
            line-height: 1.4;
            word-wrap: break-word;
            overflow-wrap: break-word;
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
            transition: all 0.15s ease;
        }
        
        .tool-badge:hover {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            transform: scale(1.05);
        }
        
        .confidence-badge {
            display: inline-flex;
            align-items: center;
            margin-left: var(--spacing-xs);
            padding: 2px 6px;
            font-size: 10px;
            background-color: var(--accent-sage-soft);
            color: var(--vscode-foreground);
            border-radius: var(--border-radius-sm);
        }
        
        .result-description {
            font-size: var(--font-size-sm);
            color: var(--vscode-descriptionForeground);
            margin-bottom: var(--spacing-md);
            margin-top: var(--spacing-xs);
            line-height: 1.5;
            word-wrap: break-word;
            overflow-wrap: break-word;
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
            user-select: none;
            -webkit-user-select: none;
        }
        
        .result-file:hover {
            text-decoration: underline;
        }
        
        .result-file:active {
            outline: none;
        }
        
        .result-actions {
            display: flex;
            gap: var(--spacing-sm);
            margin-top: var(--spacing-md);
            flex-wrap: wrap;
        }
        
        .action-btn {
            display: inline-flex;
            align-items: center;
            padding: 6px 12px;
            border: 1px solid var(--vscode-input-border);
            border-radius: var(--border-radius-sm);
            background-color: transparent;
            color: var(--vscode-foreground);
            font-size: var(--font-size-xs);
            font-weight: var(--font-weight-medium);
            cursor: pointer;
            transition: all 0.2s ease;
        }
        
        .action-btn:hover {
            background-color: var(--vscode-list-hoverBackground);
            border-color: var(--vscode-focusBorder);
        }
        
        .action-btn-primary {
            background: var(--accent-warm);
            color: #fff;
            border-color: #a86b47;
        }
        
        .action-btn-primary:hover {
            background: #c97a52;
        }
        
        .no-results {
            text-align: center;
            padding: var(--spacing-xxl) var(--spacing-xl);
            color: var(--vscode-descriptionForeground);
        }
        
        .no-results-icon {
            font-size: 48px;
            margin-bottom: var(--spacing-lg);
            opacity: 0.6;
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
            line-height: 1.5;
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
            border-top-color: var(--accent-warm);
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
            border-radius: var(--border-radius-lg);
            padding: 0;
            max-width: 580px;
            max-height: 80vh;
            width: 90%;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
            overflow: hidden;
        }
        
        .suppressions-intro {
            font-size: var(--font-size-sm);
            color: var(--vscode-descriptionForeground);
            margin: 0 0 var(--spacing-lg) 0;
            line-height: 1.5;
        }
        
        .suppression-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: var(--spacing-md);
            margin-bottom: var(--spacing-sm);
            background: var(--vscode-input-background);
            border-radius: var(--border-radius-sm);
            border: 1px solid var(--vscode-panel-border);
        }
        
        .suppression-item-info {
            flex: 1;
            min-width: 0;
        }
        
        .suppression-item-file {
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: var(--font-size-sm);
            color: var(--vscode-textLink-foreground);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        .suppression-item-desc {
            font-size: var(--font-size-xs);
            color: var(--vscode-descriptionForeground);
            margin-top: 2px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
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
        
        /* Filters and Analysis */
        .filters-section {
            background-color: var(--vscode-panel-background);
            border: 1px solid var(--vscode-panel-border);
            padding: var(--spacing-lg);
            margin-bottom: var(--spacing-xl);
            border-radius: var(--border-radius);
        }
        
        .filters-row {
            display: flex;
            gap: var(--spacing-md);
            flex-wrap: wrap;
            align-items: center;
        }
        
        .filter-group {
            display: flex;
            align-items: center;
            gap: var(--spacing-sm);
        }
        
        .filter-label {
            font-size: var(--font-size-sm);
            color: var(--vscode-descriptionForeground);
            font-weight: var(--font-weight-medium);
        }
        
        .filter-select {
            padding: var(--spacing-xs) var(--spacing-sm);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            font-size: var(--font-size-sm);
            cursor: pointer;
        }
        
        .filter-select:focus {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: 2px;
        }
        
        /* Vulnerability Analysis Section */
        .analysis-section {
            background-color: var(--vscode-panel-background);
            border: 1px solid var(--vscode-panel-border);
            padding: var(--spacing-lg);
            margin-bottom: var(--spacing-xl);
        }
        
        .analysis-title {
            font-size: var(--font-size-lg);
            font-weight: var(--font-weight-semibold);
            color: var(--vscode-foreground);
            margin: 0 0 var(--spacing-lg) 0;
            padding-bottom: var(--spacing-sm);
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .analysis-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: var(--spacing-lg);
            margin-bottom: var(--spacing-lg);
        }
        
        .analysis-card {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-panel-border);
            padding: var(--spacing-md);
        }
        
        .analysis-card-title {
            font-size: var(--font-size-sm);
            font-weight: var(--font-weight-semibold);
            color: var(--vscode-foreground);
            margin: 0 0 var(--spacing-sm) 0;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        
        .analysis-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        
        .analysis-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: var(--spacing-xs) 0;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .analysis-item:last-child {
            border-bottom: none;
        }
        
        .analysis-item-label {
            font-size: var(--font-size-sm);
            color: var(--vscode-foreground);
            flex: 1;
        }
        
        .analysis-item-count {
            font-size: var(--font-size-sm);
            font-weight: var(--font-weight-semibold);
            color: var(--vscode-descriptionForeground);
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
        }
        
        /* Scan History */
        .history-section {
            background-color: var(--vscode-panel-background);
            border: 1px solid var(--vscode-panel-border);
            padding: var(--spacing-lg);
            margin-bottom: var(--spacing-xl);
        }
        
        .history-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: var(--spacing-lg);
            padding-bottom: var(--spacing-sm);
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .history-title {
            font-size: var(--font-size-lg);
            font-weight: var(--font-weight-semibold);
            color: var(--vscode-foreground);
            margin: 0;
        }
        
        .history-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        
        .history-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: var(--spacing-md);
            border-bottom: 1px solid var(--vscode-panel-border);
            cursor: pointer;
            transition: background-color 0.15s ease;
        }
        
        .history-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        .history-item:last-child {
            border-bottom: none;
        }
        
        .history-info {
            flex: 1;
        }
        
        .history-scan-type {
            font-size: var(--font-size-md);
            font-weight: var(--font-weight-medium);
            color: var(--vscode-foreground);
            margin: 0 0 var(--spacing-xs) 0;
        }
        
        .history-time {
            font-size: var(--font-size-xs);
            color: var(--vscode-descriptionForeground);
            font-family: var(--vscode-editor-font-family, monospace);
        }
        
        .history-stats {
            display: flex;
            gap: var(--spacing-sm);
        }
        
        .history-stat {
            font-size: var(--font-size-xs);
            padding: 2px 6px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }
        
        /* Explanation Panel */
        .explanation-panel {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 2000;
            backdrop-filter: blur(2px);
        }
        
        .explanation-content {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            max-width: 700px;
            max-height: 80vh;
            width: 90%;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        
        .explanation-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: var(--spacing-lg);
            border-bottom: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-panel-background);
        }
        
        .explanation-header h2 {
            font-size: var(--font-size-lg);
            font-weight: var(--font-weight-semibold);
            color: var(--vscode-foreground);
            margin: 0;
        }
        
        .close-btn {
            background: none;
            border: none;
            color: var(--vscode-foreground);
            font-size: var(--font-size-xl);
            cursor: pointer;
            padding: var(--spacing-xs);
            transition: background-color 0.15s ease;
        }
        
        .close-btn:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        .explanation-text {
            padding: var(--spacing-lg);
            overflow-y: auto;
            color: var(--vscode-foreground);
            line-height: 1.6;
            white-space: pre-wrap;
            font-size: var(--font-size-sm);
        }
        
        /* Graphical Analysis Section */
        .graphical-analysis-section {
            background: var(--vscode-panel-background);
            border: 2px solid var(--vscode-panel-border);
            padding: var(--spacing-xl);
            margin-bottom: var(--spacing-xl);
            border-radius: 8px;
            overflow: visible;
        }
        
        .section-title {
            font-size: 18px;
            font-weight: 600;
            color: var(--vscode-foreground);
            margin: 0 0 var(--spacing-xl) 0;
            padding-bottom: var(--spacing-md);
            border-bottom: 2px solid var(--vscode-panel-border);
            text-transform: none;
            letter-spacing: -0.01em;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        }
        
        .charts-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: var(--spacing-xl);
        }
        
        .chart-container {
            background: var(--vscode-editor-background);
            border: 2px solid var(--vscode-panel-border);
            padding: var(--spacing-lg);
            border-radius: 8px;
            overflow: visible;
        }
        
        .chart-title {
            font-size: var(--font-size-md);
            font-weight: var(--font-weight-semibold);
            color: var(--vscode-foreground);
            margin: 0 0 var(--spacing-md) 0;
            text-align: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            letter-spacing: 0.02em;
            text-transform: none;
        }
        
        .chart-wrapper {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 200px;
        }
        
        canvas {
            max-width: 100%;
            height: auto;
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
        <h1 class="title">
            ${logoUri ? `<img src="${logoUri}" alt="CipherMate" class="title-logo" style="background: transparent !important; border-radius: 0 !important;">` : ''}
            Security Analysis
        </h1>
        <p class="subtitle">Vulnerability assessment for your workspace</p>
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
    
    <!-- Graphical Analysis Section -->
    <div class="graphical-analysis-section">
        <h2 class="section-title">Graphical Analysis</h2>
        <div class="charts-grid">
            <div class="chart-container">
                <h3 class="chart-title">Severity Distribution</h3>
                <div class="chart-wrapper">
                    <canvas id="severityChart" width="300" height="300"></canvas>
                </div>
            </div>
            <div class="chart-container">
                <h3 class="chart-title">Vulnerability Trends</h3>
                <div class="chart-wrapper">
                    <canvas id="trendChart" width="400" height="200"></canvas>
                </div>
            </div>
            <div class="chart-container">
                <h3 class="chart-title">Top Vulnerability Types</h3>
                <div class="chart-wrapper">
                    <canvas id="typeChart" width="500" height="220"></canvas>
                </div>
            </div>
        </div>
    </div>
    
    <div class="controls">
        <button class="btn btn-primary" onclick="startScan()">Take a look</button>
        <button class="btn btn-refresh" onclick="refreshResults()" id="refresh-btn">Refresh</button>
        <button class="btn btn-secondary" onclick="exportResults()">Export</button>
        <button class="btn btn-history" onclick="showScanHistory()" title="View Scan History">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            History
        </button>
        <button class="btn btn-ghost" onclick="clearResults()">Clear Results</button>
    </div>
    
    <!-- Filters Section -->
    <div class="filters-section">
        <div class="filters-row">
            <div class="filter-group">
                <label class="filter-label">Severity:</label>
                <select class="filter-select" id="severity-filter" onchange="applyFilters()">
                    <option value="all">All</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                </select>
            </div>
            <div class="filter-group">
                <label class="filter-label">Sort by:</label>
                <select class="filter-select" id="sort-filter" onchange="applyFilters()">
                    <option value="severity">Severity</option>
                    <option value="file">File</option>
                    <option value="type">Type</option>
                </select>
            </div>
            <div class="filter-group">
                <label class="filter-label">View:</label>
                <select class="filter-select" id="view-filter" onchange="switchView()">
                    <option value="results">Current Results</option>
                    <option value="analysis">Vulnerability Analysis</option>
                    <option value="history">Scan History</option>
                </select>
            </div>
        </div>
    </div>
    
    <!-- Vulnerability Analysis Section -->
    <div class="analysis-section" id="analysis-section" style="display: none;">
        <h2 class="analysis-title">Vulnerability Analysis</h2>
        <div class="analysis-grid" id="analysis-grid">
            <div class="analysis-card">
                <h3 class="analysis-card-title">By Severity</h3>
                <ul class="analysis-list" id="severity-analysis"></ul>
            </div>
            <div class="analysis-card">
                <h3 class="analysis-card-title">By Type</h3>
                <ul class="analysis-list" id="type-analysis"></ul>
            </div>
            <div class="analysis-card">
                <h3 class="analysis-card-title">By File</h3>
                <ul class="analysis-list" id="file-analysis"></ul>
            </div>
        </div>
    </div>
    
    <!-- Scan History Section -->
    <div class="history-section" id="history-section" style="display: none;">
        <div class="history-header">
            <h2 class="history-title">Scan History</h2>
            <button class="btn btn-ghost" onclick="hideScanHistory()" style="font-size: var(--font-size-sm);">Close</button>
        </div>
        <ul class="history-list" id="history-list"></ul>
    </div>
    
    <div class="results-section" id="results-section">
        <div class="results-header">
            <h2 class="results-title">What we found</h2>
            <div class="results-header-actions">
                <span class="results-count" id="results-count">All clear</span>
                <button class="action-btn action-btn-primary" id="fix-all-btn" onclick="fixAllVulnerabilities()" style="display: none;" title="Apply fixes to all findings across the repository">Fix all findings</button>
                <button class="action-btn" id="manage-suppressions-btn" onclick="showSuppressionsModal()" style="display: none;" title="Items you've dismissed">Manage dismissed</button>
                <button class="action-btn action-btn-ghost" id="clear-suppressions-btn" onclick="clearSuppressions()" style="display: none;" title="Bring back all dismissed items">Restore all</button>
            </div>
        </div>
        <div class="results-content" id="results-container">
            <div class="loading">
                <div class="loading-spinner"></div>
                Taking a look...
            </div>
        </div>
    </div>
    
    <!-- Explanation Panel -->
    <div class="explanation-panel" id="explanationPanel">
        <div class="explanation-content">
            <div class="explanation-header">
                <h2 id="explanationTitle">Explanation</h2>
                <button class="close-btn" id="closeExplanation">Close</button>
            </div>
            <div class="explanation-text" id="explanationText">
                Loading...
            </div>
        </div>
    </div>
    
    <!-- Suppressions Modal -->
    <div class="modal-overlay" id="suppressionsModal" onclick="if(event.target===this)hideSuppressionsModal()">
        <div class="modal-content" onclick="event.stopPropagation()">
            <div class="modal-header">
                <h2 class="modal-title">Dismissed items</h2>
                <button class="modal-close" onclick="hideSuppressionsModal()">&times;</button>
            </div>
            <div class="modal-body">
                <p class="suppressions-intro" id="suppressions-intro">Items you've marked as "not an issue" won't show in your findings. You can restore them here.</p>
                <div id="suppressions-list"></div>
                <button class="btn btn-secondary" id="clear-suppressions-modal-btn" onclick="clearSuppressionsFromModal()" style="margin-top: 12px; display: none;">Restore all dismissed</button>
            </div>
        </div>
    </div>
    <script>
      const vscode = acquireVsCodeApi();
      let lastResults = [];
      let suppressionsData = [];
      let vulnerabilityAnalysisData = null;
      let recentScansData = [];
      let currentFilter = 'all';
      let currentSort = 'severity';
      let currentView = 'results';
      
      // Notify extension that webview is ready
      console.log('Webview script loaded, sending webviewReady message');
      vscode.postMessage({ command: 'webviewReady' });
      
      // Also request data immediately
      setTimeout(() => {
        console.log('Requesting initial data from extension');
        vscode.postMessage({ command: 'refresh' });
      }, 100);
        
      function renderCharts(results, stats) {
        // Get theme colors for readable text
        const getThemeColor = (cssVar) => {
          const tempEl = document.createElement('div');
          tempEl.style.color = \`var(\${cssVar})\`;
          document.body.appendChild(tempEl);
          const color = window.getComputedStyle(tempEl).color;
          document.body.removeChild(tempEl);
          return color || '#ffffff';
        };
        
        const foregroundColor = getThemeColor('--vscode-foreground');
        const descriptionColor = getThemeColor('--vscode-descriptionForeground');
        const backgroundColor = getThemeColor('--vscode-panel-background');
        
        // Severity Distribution Pie Chart
        const severityCtx = document.getElementById('severityChart');
        if (severityCtx) {
          const ctx = severityCtx.getContext('2d');
          const total = stats.critical + stats.high + stats.medium + stats.low || 1;
          const colors = ['#d32f2f', '#f57c00', '#1976d2', '#757575'];
          const data = [stats.critical, stats.high, stats.medium, stats.low];
          const labels = ['Critical', 'High', 'Medium', 'Low'];
          
          // Clear canvas
          ctx.clearRect(0, 0, severityCtx.width, severityCtx.height);
          
          // Draw pie chart
          let currentAngle = -Math.PI / 2;
          const centerX = severityCtx.width / 2;
          const centerY = severityCtx.height / 2;
          const radius = Math.min(centerX, centerY) - 20;
          
          data.forEach((value, index) => {
            if (value > 0) {
              const sliceAngle = (value / total) * 2 * Math.PI;
              ctx.beginPath();
              ctx.moveTo(centerX, centerY);
              ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
              ctx.closePath();
              ctx.fillStyle = colors[index];
              ctx.fill();
              ctx.strokeStyle = backgroundColor;
              ctx.lineWidth = 2;
              ctx.stroke();
              
              // Label with professional styling - use white for contrast on colored slices
              const labelAngle = currentAngle + sliceAngle / 2;
              const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
              const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              // Add subtle text shadow for better readability
              ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
              ctx.shadowBlur = 3;
              ctx.shadowOffsetX = 1;
              ctx.shadowOffsetY = 1;
              ctx.fillText(value.toString(), labelX, labelY);
              ctx.shadowBlur = 0;
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 0;
              
              currentAngle += sliceAngle;
            }
          });
          
          // Legend with professional styling - use theme colors
          let legendY = severityCtx.height - 85;
          labels.forEach((label, index) => {
            if (data[index] > 0) {
              // Legend color box
              ctx.fillStyle = colors[index];
              ctx.fillRect(10, legendY, 16, 16);
              ctx.strokeStyle = backgroundColor;
              ctx.lineWidth = 1;
              ctx.strokeRect(10, legendY, 16, 16);
              
              // Legend text - use theme foreground color
              ctx.fillStyle = foregroundColor;
              ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
              ctx.textAlign = 'left';
              ctx.fillText(\`\${label}\`, 32, legendY + 7);
              
              // Count with emphasis - use theme foreground color
              ctx.fillStyle = foregroundColor;
              ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
              ctx.textAlign = 'right';
              ctx.fillText(data[index].toString(), severityCtx.width - 10, legendY + 7);
              
              legendY += 22;
            }
          });
        }
        
        // Trend Chart (Bar Chart) - Use real data from vulnerabilityAnalysis
        const trendCtx = document.getElementById('trendChart');
        if (trendCtx) {
          const ctx = trendCtx.getContext('2d');
          ctx.clearRect(0, 0, trendCtx.width, trendCtx.height);
          
          // Get theme colors for this chart context
          const getThemeColor = (cssVar) => {
            const tempEl = document.createElement('div');
            tempEl.style.color = \`var(\${cssVar})\`;
            document.body.appendChild(tempEl);
            const color = window.getComputedStyle(tempEl).color;
            document.body.removeChild(tempEl);
            return color || '#ffffff';
          };
          const foregroundColor = getThemeColor('--vscode-foreground');
          const descriptionColor = getThemeColor('--vscode-descriptionForeground');
          const backgroundColor = getThemeColor('--vscode-panel-background');
          
          // Use real trend data from vulnerabilityAnalysis if available
          let trendData = [];
          if (vulnerabilityAnalysisData && vulnerabilityAnalysisData.trends && vulnerabilityAnalysisData.trends.length > 0) {
            // Use real trends from database
            trendData = vulnerabilityAnalysisData.trends
              .slice(-7) // Last 7 data points
              .map(trend => ({
                date: new Date(trend.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                count: trend.count || 0
              }));
          } else if (recentScansData && recentScansData.length > 0) {
            // Fallback: Generate trends from recent scans
            const scanMap = new Map();
            recentScansData.forEach(scan => {
              const date = new Date(scan.timestamp);
              const dateKey = date.toISOString().split('T')[0];
              scanMap.set(dateKey, (scanMap.get(dateKey) || 0) + (scan.totalVulnerabilities || 0));
            });
            
            const today = new Date();
            for (let i = 6; i >= 0; i--) {
              const date = new Date(today);
              date.setDate(date.getDate() - i);
              const dateKey = date.toISOString().split('T')[0];
              trendData.push({
                date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                count: scanMap.get(dateKey) || 0
              });
            }
          } else {
            // No data available - show current total only
            const today = new Date();
            trendData = [{
              date: today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              count: stats.total
            }];
          }
          
          if (trendData.length > 0) {
            const maxCount = Math.max(...trendData.map(d => d.count), 1);
            const barWidth = trendCtx.width / trendData.length - 10;
            const maxBarHeight = trendCtx.height - 60;
            
            trendData.forEach((data, index) => {
              const barHeight = (data.count / maxCount) * maxBarHeight;
              const x = index * (trendCtx.width / trendData.length) + 5;
              const y = trendCtx.height - barHeight - 40;
              
              ctx.fillStyle = '#1565c0';
              ctx.fillRect(x, y, barWidth, barHeight);
              
              // Add subtle border
              ctx.strokeStyle = '#0d47a1';
              ctx.lineWidth = 1;
              ctx.strokeRect(x, y, barWidth, barHeight);
              
              // Count label on top of bar - use theme foreground color
              ctx.fillStyle = foregroundColor;
              ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(data.count.toString(), x + barWidth / 2, y - 6);
              
              // Date label below bar - use theme description color
              ctx.fillStyle = descriptionColor;
              ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(data.date, x + barWidth / 2, trendCtx.height - 18);
            });
          } else {
            // Show "No data" message with professional styling - use theme description color
            ctx.fillStyle = descriptionColor;
            ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No trend data available', trendCtx.width / 2, trendCtx.height / 2);
          }
        }
        
        // Type Chart (Horizontal Bar)
        const typeCtx = document.getElementById('typeChart');
        if (typeCtx) {
          const ctx = typeCtx.getContext('2d');
          ctx.clearRect(0, 0, typeCtx.width, typeCtx.height);
          
          // Get theme colors for this chart context
          const getThemeColor = (cssVar) => {
            const tempEl = document.createElement('div');
            tempEl.style.color = \`var(\${cssVar})\`;
            document.body.appendChild(tempEl);
            const color = window.getComputedStyle(tempEl).color;
            document.body.removeChild(tempEl);
            return color || '#ffffff';
          };
          const foregroundColor = getThemeColor('--vscode-foreground');
          const descriptionColor = getThemeColor('--vscode-descriptionForeground');
          
          // Group by detected vulnerability type (not scanner name)
          const typeCounts = {};
          results.forEach(r => {
            // Use detected vulnerability type, fallback to type field, then tool name
            const vulnType = r.vulnerabilityType || r.type || r.check_id || r.tool || 'Security Issue';
            typeCounts[vulnType] = (typeCounts[vulnType] || 0) + 1;
          });
          
          const sortedTypes = Object.entries(typeCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
          
          if (sortedTypes.length === 0) {
            // Show "No data" message - use theme description color
            ctx.fillStyle = descriptionColor;
            ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No vulnerability data available', typeCtx.width / 2, typeCtx.height / 2);
            return;
          }
          
          const maxCount = Math.max(...sortedTypes.map(([_, count]) => count), 1);
          const barHeight = 28;
          const spacing = 8;
          const startY = 25;
          const labelAreaWidth = 180; // Increased space for full labels
          const barStartX = labelAreaWidth + 10;
          
          sortedTypes.forEach(([type, count], index) => {
            const y = startY + index * (barHeight + spacing);
            const barWidth = (count / maxCount) * (typeCtx.width - barStartX - 60);
            
            // Draw bar
            ctx.fillStyle = '#1976d2';
            ctx.fillRect(barStartX, y, barWidth, barHeight);
            
            // Draw count badge on bar - use white for contrast on blue bar
            if (barWidth > 40) {
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
              ctx.textAlign = 'left';
              ctx.fillText(count.toString(), barStartX + 6, y + 19);
            }
            
            // Draw full vulnerability type label (no truncation) - use theme foreground color
            ctx.fillStyle = foregroundColor;
            ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign = 'left';
            
            // Handle long labels with word wrapping or ellipsis if needed
            const maxLabelWidth = labelAreaWidth - 5;
            let displayLabel = type;
            
            // Measure text width
            const metrics = ctx.measureText(displayLabel);
            if (metrics.width > maxLabelWidth) {
              // Try to truncate intelligently at word boundaries
              const words = displayLabel.split(' ');
              displayLabel = '';
              for (const word of words) {
                const testLabel = displayLabel + (displayLabel ? ' ' : '') + word;
                const testMetrics = ctx.measureText(testLabel);
                if (testMetrics.width > maxLabelWidth) {
                  displayLabel = displayLabel + (displayLabel ? '...' : '');
                  break;
                }
                displayLabel = testLabel;
              }
            }
            
            ctx.fillText(displayLabel, 5, y + 19);
            
            // Draw count on right side if bar is too small - use theme foreground color
            if (barWidth <= 40) {
              ctx.fillStyle = foregroundColor;
              ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
              ctx.textAlign = 'right';
              ctx.fillText(count.toString(), typeCtx.width - 5, y + 19);
            }
          });
        }
      }
      
      function renderResults(results) {
            console.log('renderResults called with', results?.length || 0, 'results');
            
            // Ensure results is an array
            if (!Array.isArray(results)) {
              console.warn('renderResults: results is not an array', typeof results, results);
              results = [];
            }
            
            // Apply filters and sorting
            let filtered = filterResults(results);
            filtered = sortResults(filtered);
            
            const container = document.getElementById('results-container');
            if (!container) {
              console.error('renderResults: results-container element not found');
              return;
            }
            
            console.log('renderResults: filtered results', filtered.length);
            
            const stats = {
                total: results.length,
                critical: 0,
                high: 0,
                medium: 0,
                low: 0
            };
            
            filtered.forEach(r => {
                const severity = (r.severity || '').toUpperCase();
                if (severity === 'CRITICAL' || severity === 'ERROR' || severity === 'CRITICAL') stats.critical++;
                else if (severity === 'HIGH' || severity === 'WARNING') stats.high++;
                else if (severity === 'MEDIUM' || severity === 'INFO') stats.medium++;
                else stats.low++;
            });
            
            // Update stats
            document.getElementById('total-count').textContent = stats.total;
            document.getElementById('critical-count').textContent = stats.critical;
            document.getElementById('high-count').textContent = stats.high;
            document.getElementById('medium-count').textContent = stats.medium;
            document.getElementById('low-count').textContent = stats.low;
            
            // Update results count - friendly copy
            let countText = 'All clear';
            if (stats.total === 1) countText = '1 thing to review';
            else if (stats.total > 1) countText = \`\${stats.total} things to review\`;
            document.getElementById('results-count').textContent = countText;
            const fixAllBtn = document.getElementById('fix-all-btn');
            if (fixAllBtn) fixAllBtn.style.display = filtered.length > 0 ? 'inline-block' : 'none';
            const manageBtn = document.getElementById('manage-suppressions-btn');
            const clearSuppBtn = document.getElementById('clear-suppressions-btn');
            if (manageBtn) manageBtn.style.display = suppressionsData.length > 0 ? 'inline-block' : 'none';
            if (clearSuppBtn) clearSuppBtn.style.display = suppressionsData.length > 0 ? 'inline-block' : 'none';
            
            // Render charts
            renderCharts(results, stats);
            
            if (filtered.length === 0) {
                const fixAllBtn = document.getElementById('fix-all-btn');
                if (fixAllBtn) fixAllBtn.style.display = 'none';
                const emptyMessage = results.length === 0 
                  ? 'Click "Take a look" above to run a scan, or press Ctrl+Shift+P (Mac: Cmd+Shift+P) and run "CipherMate: Intelligent Scan". Results will appear here.'
                  : 'Nothing matches the filter. Try adjusting the severity.';
                const emptyIcon = results.length === 0 ? '🔍' : '✓';
                const emptyTitle = results.length === 0 ? 'No scan yet' : 'Looking good from here';
                container.innerHTML = \`
                    <div class="no-results">
                        <div class="no-results-icon">\${emptyIcon}</div>
                        <div class="no-results-title">\${emptyTitle}</div>
                        <div class="no-results-description">\${emptyMessage}</div>
                    </div>
                \`;
          return;
        }
            
            let html = '';
            
            for (let i = 0; i < filtered.length; i++) {
                const r = filtered[i];
                const origIdx = lastResults.indexOf(r);
                let severityClass = 'severity-low';
                let severityText = r.severity || 'INFO';
                
                if (r.severity === 'ERROR' || r.severity === 'CRITICAL') {
                    severityClass = 'severity-critical';
                } else if (r.severity === 'HIGH') {
                    severityClass = 'severity-high';
                } else if (r.severity === 'MEDIUM' || r.severity === 'WARNING') {
                    severityClass = 'severity-medium';
                }
                
                const filePath = (r.path || r.filename || r.file || '').trim();
                // Extract line number from multiple possible fields
                const lineNumber = r.start?.line || r.line || r.line_number || (r.start ? r.start.line : null) || 0;
                // Format file path with line number: /path/to/file.js:42
                const fileLine = filePath ? \`\${filePath}\${lineNumber > 0 ? ':' + lineNumber : ''}\` : 'No file path';
                const desc = (r.extra && r.extra.message) || r.issue_text || r.check_id || r.message || r.description || 'Security issue detected';
                const tool = r.tool || 'Unknown';
                
                // Only make file path clickable if it's valid - use mousedown to prevent accidental triggers
                // Fix: Use actual lineNumber if > 0, otherwise default to 1 for navigation
                const validLineNumber = lineNumber > 0 ? lineNumber : 1;
                console.log('Rendering vulnerability:', { filePath, lineNumber, validLineNumber, hasStart: !!r.start });
                const fileLinkHtml = filePath && filePath !== '' && filePath !== 'undefined' && filePath !== 'null'
                  ? \`<a href="#" class="result-file" onmousedown="event.preventDefault(); console.log('Opening file:', '\${filePath.replace(/'/g, "\\'")}', \${validLineNumber}); openFile('\${filePath.replace(/'/g, "\\'")}', \${validLineNumber}); return false;" onclick="return false;">\${fileLine}</a>\`
                  : \`<span class="result-file" style="color: var(--vscode-descriptionForeground);">\${fileLine}</span>\`;
                
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
                                    \${r.metadata?.confidence != null ? \`<span class="confidence-badge" title="AI confidence">\${r.metadata.confidence}%</span>\` : ''}
                                </div>
                            </div>
                            <div class="result-description">
                                \${fileLinkHtml}
                            </div>
                            <div class="result-actions">
                                <button class="action-btn" onclick="event.stopPropagation(); explainVulnerability(\${origIdx})">Tell me more</button>
                                <button class="action-btn action-btn-primary" onclick="event.stopPropagation(); fixVulnerability(\${origIdx})">Fix it</button>
                                <button class="action-btn action-btn-ghost" onclick="event.stopPropagation(); markFalsePositive(\${origIdx})" title="Dismiss — not a real issue">Dismiss</button>
                                \${r.patch ? \`<button class="action-btn action-btn-primary" onclick="event.stopPropagation(); applyPatch(\${origIdx})">Apply Fix</button>\` : ''}
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
      
      function filterResults(results) {
        if (currentFilter === 'all') return results;
        return results.filter(r => {
          const severity = (r.severity || '').toLowerCase();
          if (currentFilter === 'critical') return severity === 'critical' || severity === 'error';
          if (currentFilter === 'high') return severity === 'high' || severity === 'warning';
          if (currentFilter === 'medium') return severity === 'medium' || severity === 'info';
          if (currentFilter === 'low') return severity === 'low';
          return true;
        });
      }
      
      function sortResults(results) {
        return [...results].sort((a, b) => {
          if (currentSort === 'severity') {
            const severityOrder = { 'critical': 1, 'error': 1, 'high': 2, 'warning': 2, 'medium': 3, 'info': 3, 'low': 4 };
            const aSev = severityOrder[(a.severity || '').toLowerCase()] || 5;
            const bSev = severityOrder[(b.severity || '').toLowerCase()] || 5;
            return aSev - bSev;
          } else if (currentSort === 'file') {
            const aFile = (a.path || a.filename || '').toLowerCase();
            const bFile = (b.path || b.filename || '').toLowerCase();
            return aFile.localeCompare(bFile);
          } else if (currentSort === 'type') {
            const aType = (a.tool || a.type || '').toLowerCase();
            const bType = (b.tool || b.type || '').toLowerCase();
            return aType.localeCompare(bType);
          }
          return 0;
        });
      }
      
      function applyFilters() {
        currentFilter = document.getElementById('severity-filter').value;
        currentSort = document.getElementById('sort-filter').value;
        renderResults(lastResults);
      }
      
      function switchView() {
        currentView = document.getElementById('view-filter').value;
        const resultsSection = document.getElementById('results-section');
        const analysisSection = document.getElementById('analysis-section');
        const historySection = document.getElementById('history-section');
        
        if (currentView === 'results') {
          resultsSection.style.display = 'block';
          analysisSection.style.display = 'none';
          historySection.style.display = 'none';
        } else if (currentView === 'analysis') {
          resultsSection.style.display = 'none';
          analysisSection.style.display = 'block';
          historySection.style.display = 'none';
        } else if (currentView === 'history') {
          resultsSection.style.display = 'none';
          analysisSection.style.display = 'none';
          historySection.style.display = 'block';
        }
      }
      
      function showScanHistory() {
        const resultsSection = document.getElementById('results-section');
        const analysisSection = document.getElementById('analysis-section');
        const historySection = document.getElementById('history-section');
        
        resultsSection.style.display = 'none';
        analysisSection.style.display = 'none';
        historySection.style.display = 'block';
        
        // Update view filter dropdown
        const viewFilter = document.getElementById('view-filter');
        if (viewFilter) {
          viewFilter.value = 'history';
        }
      }
      
      function hideScanHistory() {
        const resultsSection = document.getElementById('results-section');
        const historySection = document.getElementById('history-section');
        
        resultsSection.style.display = 'block';
        historySection.style.display = 'none';
        
        // Update view filter dropdown
        const viewFilter = document.getElementById('view-filter');
        if (viewFilter) {
          viewFilter.value = 'results';
        }
      }
      
      function renderVulnerabilityAnalysis(analysis) {
        if (!analysis) {
          // If no analysis provided, generate from current results
          const typeCounts = {};
          lastResults.forEach(r => {
            const vulnType = r.vulnerabilityType || r.type || r.check_id || r.tool || 'Security Issue';
            typeCounts[vulnType] = (typeCounts[vulnType] || 0) + 1;
          });
          
          // Render by type from current results
          const typeList = document.getElementById('type-analysis');
          if (typeList) {
            typeList.innerHTML = '';
            Object.entries(typeCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
              .forEach(([type, count]) => {
                const item = document.createElement('li');
                item.className = 'analysis-item';
                item.innerHTML = \`
                  <span class="analysis-item-label">\${type}</span>
                  <span class="analysis-item-count">\${count}</span>
                \`;
                typeList.appendChild(item);
              });
          }
          return;
        }
        
        // Render by severity
        const severityList = document.getElementById('severity-analysis');
        if (severityList && analysis.bySeverity) {
          severityList.innerHTML = '';
          Object.entries(analysis.bySeverity).forEach(([severity, count]) => {
            const item = document.createElement('li');
            item.className = 'analysis-item';
            item.innerHTML = \`
              <span class="analysis-item-label">\${severity.charAt(0).toUpperCase() + severity.slice(1)}</span>
              <span class="analysis-item-count">\${count}</span>
            \`;
            severityList.appendChild(item);
          });
        }
        
        // Render by type - use database analysis if available, otherwise use current results
        const typeList = document.getElementById('type-analysis');
        if (typeList) {
          typeList.innerHTML = '';
          
          // Prefer database analysis, but fallback to current results if needed
          let typeData = analysis.byType;
          if (!typeData || Object.keys(typeData).length === 0) {
            // Generate from current results
            const typeCounts = {};
            lastResults.forEach(r => {
              const vulnType = r.vulnerabilityType || r.type || r.check_id || r.tool || 'Security Issue';
              typeCounts[vulnType] = (typeCounts[vulnType] || 0) + 1;
            });
            typeData = typeCounts;
          }
          
          Object.entries(typeData)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .forEach(([type, count]) => {
              const item = document.createElement('li');
              item.className = 'analysis-item';
              item.innerHTML = \`
                <span class="analysis-item-label">\${type}</span>
                <span class="analysis-item-count">\${count}</span>
              \`;
              typeList.appendChild(item);
            });
        }
        
        // Render by file
        const fileList = document.getElementById('file-analysis');
        if (fileList && analysis.byFile) {
          fileList.innerHTML = '';
          Object.entries(analysis.byFile).slice(0, 10).forEach(([file, count]) => {
            const item = document.createElement('li');
            item.className = 'analysis-item';
            const fileName = file.split('/').pop() || file;
            item.innerHTML = \`
              <span class="analysis-item-label" title="\${file}">\${fileName}</span>
              <span class="analysis-item-count">\${count}</span>
            \`;
            fileList.appendChild(item);
          });
        }
      }
      
      function renderScanHistory(scans) {
        const historyList = document.getElementById('history-list');
        if (!historyList) return;
        
        historyList.innerHTML = '';
        scans.forEach(scan => {
          const item = document.createElement('li');
          item.className = 'history-item';
          const scanTime = new Date(scan.timestamp).toLocaleString();
          item.innerHTML = \`
            <div class="history-info">
              <div class="history-scan-type">\${scan.scanType || 'Security Scan'}</div>
              <div class="history-time">\${scanTime}</div>
            </div>
            <div class="history-stats">
              <span class="history-stat" style="color: var(--vscode-inputValidation-errorForeground);">\${scan.criticalCount || 0} Critical</span>
              <span class="history-stat" style="color: var(--vscode-inputValidation-warningForeground);">\${scan.highCount || 0} High</span>
              <span class="history-stat">\${scan.totalVulnerabilities || 0} Total</span>
            </div>
          \`;
          item.onclick = () => {
            vscode.postMessage({ command: 'loadScan', scanId: scan.id });
          };
          historyList.appendChild(item);
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
            showExplanation('One moment...', 'Looking this up for you...');
            
            // Send message to extension to get AI explanation
            vscode.postMessage({ 
                command: 'explainVulnerability', 
                index: index 
            });
        }
        
        function fixVulnerability(index) {
            vscode.postMessage({ command: 'generateFix', index: index });
        }
        
        function fixAllVulnerabilities() {
            // Fix ALL findings from the scan - every file with a vulnerability in the repository
            const allResults = lastResults && lastResults.length ? lastResults : [];
            if (allResults.length === 0) return;
            const indices = allResults.map((r, i) => i);
            vscode.postMessage({ command: 'generateFixAll', indices: indices });
        }
        
        function markFalsePositive(index) {
            vscode.postMessage({ command: 'markFalsePositive', index: index });
        }
        
        function showSuppressionsModal() {
            const modal = document.getElementById('suppressionsModal');
            const listEl = document.getElementById('suppressions-list');
            const clearBtn = document.getElementById('clear-suppressions-modal-btn');
            if (!modal || !listEl) return;
            listEl.innerHTML = '';
            if (suppressionsData.length === 0) {
                listEl.innerHTML = '<p class="suppressions-intro" style="margin: 0;">No dismissed items. When you mark something as "not an issue," it will show up here.</p>';
                if (clearBtn) clearBtn.style.display = 'none';
            } else {
                suppressionsData.forEach(key => {
                    const m = key.match(/^suppress:(.+?):(\d+):(.+)$/);
                    const path = m ? m[1] : '';
                    const line = m ? m[2] : '';
                    const desc = m ? m[3] : key;
                    const shortPath = path.split(/[/\\\\]/).pop() || path;
                    const item = document.createElement('div');
                    item.className = 'suppression-item';
                    const esc = (s) => (s||'').replace(/'/g, "\\\\'");
                    item.innerHTML = \`<div class="suppression-item-info"><div class="suppression-item-file" title="\${path}">\${shortPath}:\${line}</div><div class="suppression-item-desc" title="\${desc}">\${desc}</div></div><button class="action-btn" onclick="restoreSuppression('\${esc(key)}')">Restore</button>\`;
                    listEl.appendChild(item);
                });
                if (clearBtn) clearBtn.style.display = 'inline-block';
            }
            modal.style.display = 'block';
        }
        
        function hideSuppressionsModal() {
            const modal = document.getElementById('suppressionsModal');
            if (modal) modal.style.display = 'none';
        }
        
        function restoreSuppression(key) {
            vscode.postMessage({ command: 'restoreSuppression', key: key });
            hideSuppressionsModal();
        }
        
        function clearSuppressions() {
            vscode.postMessage({ command: 'clearSuppressions' });
            hideSuppressionsModal();
        }
        
        function clearSuppressionsFromModal() {
            vscode.postMessage({ command: 'clearSuppressions' });
            hideSuppressionsModal();
        }
        
        function showExplanation(title, text) {
            document.getElementById('explanationTitle').textContent = title;
            document.getElementById('explanationText').textContent = text;
            document.getElementById('explanationPanel').style.display = 'block';
        }
        
        function openFile(filePath, lineNumber) {
            // Validate file path - prevent auto-opening invalid paths
            if (!filePath || filePath.trim() === '' || filePath === 'undefined' || filePath === 'null') {
                console.warn('openFile: No valid file path provided', filePath);
                return;
            }
            
            // Ensure line number is valid - use actual lineNumber if provided and > 0, otherwise default to 1
            let line = 1;
            if (lineNumber !== undefined && lineNumber !== null && lineNumber !== '') {
                const parsed = parseInt(lineNumber, 10);
                console.log('openFile: Parsing line number', { original: lineNumber, parsed, isNaN: isNaN(parsed) });
                if (!isNaN(parsed) && parsed > 0) {
                    line = parsed;
                } else {
                    console.warn('openFile: Invalid line number, using 1', { lineNumber, parsed });
                }
            } else {
                console.warn('openFile: No line number provided, using 1', { lineNumber });
            }
            
            console.log('openFile: Opening file', filePath, 'at line', line);
            
            // Send message to extension to open the file
            vscode.postMessage({
                command: 'openFile',
                filePath: filePath.trim(),
                lineNumber: line
            });
        }
        
      window.addEventListener('message', function(event) {
            const message = event.data;
            console.log('Webview received message:', message.command, {
              resultCount: message.results?.length || 0,
              hasStatistics: !!message.scanStatistics,
              hasRecentScans: message.recentScans?.length || 0
            });
            
        if (message.command === 'updateResults') {
          if (message.suppressions && Array.isArray(message.suppressions)) {
            suppressionsData = message.suppressions;
          }
          console.log('Processing updateResults command', {
            resultsLength: message.results?.length || 0,
            results: message.results
          });
          lastResults = message.results || [];
          
          // Store vulnerability analysis and recent scans for charts
          if (message.vulnerabilityAnalysis) {
            vulnerabilityAnalysisData = message.vulnerabilityAnalysis;
          }
          if (message.recentScans) {
            recentScansData = message.recentScans;
          }
          
          renderResults(lastResults);
          
          // Update with CURRENT scan statistics only (not aggregated)
          if (message.scanStatistics) {
            const stats = message.scanStatistics;
            // Use current scan stats, not aggregated totals
            document.getElementById('total-count').textContent = stats.totalVulnerabilities || lastResults.length;
            document.getElementById('critical-count').textContent = stats.criticalCount || 0;
            document.getElementById('high-count').textContent = stats.highCount || 0;
            document.getElementById('medium-count').textContent = stats.mediumCount || 0;
            document.getElementById('low-count').textContent = stats.lowCount || 0;
          } else {
            // Fallback: calculate from current results
            const stats = {
              total: lastResults.length,
              critical: lastResults.filter((r) => {
                const s = (r.severity || '').toUpperCase();
                return s === 'CRITICAL' || s === 'ERROR';
              }).length,
              high: lastResults.filter((r) => {
                const s = (r.severity || '').toUpperCase();
                return s === 'HIGH' || s === 'WARNING';
              }).length,
              medium: lastResults.filter((r) => {
                const s = (r.severity || '').toUpperCase();
                return s === 'MEDIUM' || s === 'INFO';
              }).length,
              low: lastResults.filter((r) => {
                const s = (r.severity || '').toUpperCase();
                return s === 'LOW';
              }).length
            };
            document.getElementById('total-count').textContent = stats.total;
            document.getElementById('critical-count').textContent = stats.critical;
            document.getElementById('high-count').textContent = stats.high;
            document.getElementById('medium-count').textContent = stats.medium;
            document.getElementById('low-count').textContent = stats.low;
          }
          
          // Render vulnerability analysis if available
          if (message.vulnerabilityAnalysis) {
            renderVulnerabilityAnalysis(message.vulnerabilityAnalysis);
          }
          
          // Render scan history if available
          if (message.recentScans && message.recentScans.length > 0) {
            renderScanHistory(message.recentScans);
          }
          
          // Render charts with current results and stats
          const chartStats = {
            total: lastResults.length,
            critical: parseInt(document.getElementById('critical-count').textContent) || 0,
            high: parseInt(document.getElementById('high-count').textContent) || 0,
            medium: parseInt(document.getElementById('medium-count').textContent) || 0,
            low: parseInt(document.getElementById('low-count').textContent) || 0
          };
          renderCharts(lastResults, chartStats);
          
          // Update scan status based on whether we have results
          if (lastResults.length === 0) {
            updateScanStatus('Ready to scan');
            document.getElementById('scan-time').textContent = '';
          } else {
            updateScanStatus('Scan complete');
            updateRefreshButton(false);
            const now = new Date();
            document.getElementById('scan-time').textContent = now.toLocaleTimeString();
          }
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
  if (panel) {
    return wrapWebviewHtml(panel.webview, htmlBody);
  }
  return htmlBody;
}

function getTeamDashboardHtml(teamLead: TeamLead, reports: TeamVulnerabilityReport[], webview: vscode.Webview): string {
  return wrapWebviewHtml(webview, `
  <!DOCTYPE html>
  <html>
  <head>
    <title>CipherMate Team Dashboard</title>
    <style>
      body { font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
      .header { background: var(--vscode-sideBar-background); padding: 1rem; border-bottom: 1px solid var(--vscode-editorWidget-border); }
      .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; padding: 1rem; }
      .stat-card { background: var(--vscode-editorWidget-background); padding: 1rem; border-radius: 0; }
      .member-list { padding: 1rem; }
      .member-item { background: var(--vscode-editorWidget-background); margin: 0.5rem 0; padding: 1rem; border-radius: 0; }
      .reporting-settings { padding: 1rem; }
      .form-group { margin: 1rem 0; }
      label { display: block; margin-bottom: 0.5rem; }
      input, select { width: 100%; padding: 0.5rem; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 0; }
      button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 0.5rem 1rem; border-radius: 0; cursor: pointer; }
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
  `);
}

function getUserProfileHtml(webview: vscode.Webview, user: UserProfile | null, history: VulnerabilityHistory[]): string {
  if (!user) {
    return wrapWebviewHtml(webview, `
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
    `);
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

  return wrapWebviewHtml(webview, `
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
                border-radius: 0;
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
  `);
}

function getTeamSetupHtml(webview: vscode.Webview): string {
  return wrapWebviewHtml(webview, `
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
  `);
}

function getSidebarSettingsHtml(settings: any, panel: vscode.WebviewPanel, context: vscode.ExtensionContext, apiKeysConfigured?: { openrouter: boolean; openai: boolean; anthropic: boolean; gemini: boolean }): string {
  const keys = apiKeysConfigured || { openrouter: false, openai: false, anthropic: false, gemini: false };
  const placeholder = (provider: string) => keys[provider as keyof typeof keys]
    ? '✓ Key configured - enter new key to replace'
    : 'Enter key (stored in system keychain)';
  return wrapWebviewHtml(panel.webview, `<!DOCTYPE html>
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
        input[type="password"],
        input[type="number"],
        select {
            padding: 6px 10px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 0;
            font-family: inherit;
            font-size: 13px;
            min-width: 200px;
        }
        input[type="number"] {
            min-width: 120px;
            text-align: center;
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
            border-radius: 0;
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
            border-radius: 0;
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
            border-radius: 0;
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
        <div class="nav-item active" data-section="scanners">Scanners</div>
        <div class="nav-item" data-section="scanBehavior">Scan Behavior</div>
        <div class="nav-item" data-section="cve">CVE Lookup</div>
        <div class="nav-item" data-section="ui">UI & Display</div>
        <div class="nav-item" data-section="notifications">Notifications</div>
        <div class="nav-item" data-section="performance">Performance</div>
        <div class="nav-item" data-section="explain">Explain & AI</div>
        <div class="nav-item" data-section="providers">AI Providers</div>
    </div>
    <div class="main-content">
        <div class="content-header">
            <h1 id="sectionTitle">Scanners</h1>
            <p id="sectionDescription">Enable or disable security scanners</p>
        </div>
        <div class="content-body">
            <div class="section active" id="scanners">
                <div class="setting-group">
                    <div class="setting-group-title">Core Scanners</div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Dependency Scanner</div>
                            <div class="setting-label-desc">Scan package.json, requirements.txt, and other dependency files for CVEs</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" id="scanners.enableDependency" ${settings.scanners?.enableDependency !== false ? 'checked' : ''} />
                                <span class="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Secrets Scanner</div>
                            <div class="setting-label-desc">Detect hardcoded API keys, passwords, and credentials</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" id="scanners.enableSecrets" ${settings.scanners?.enableSecrets !== false ? 'checked' : ''} />
                                <span class="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Smart Contract Scanner</div>
                            <div class="setting-label-desc">Scan Solidity files for blockchain vulnerabilities</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" id="scanners.enableSmartContract" ${settings.scanners?.enableSmartContract !== false ? 'checked' : ''} />
                                <span class="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Code Pattern Scanner</div>
                            <div class="setting-label-desc">Detect OWASP Top 10 vulnerabilities (SQL injection, XSS, etc.)</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" id="scanners.enableCodePattern" ${settings.scanners?.enableCodePattern !== false ? 'checked' : ''} />
                                <span class="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
                <div class="setting-group">
                    <div class="setting-group-title">External Tools</div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Enable Semgrep</div>
                            <div class="setting-label-desc">Use Semgrep for advanced static analysis</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" id="enableSemgrep" ${settings.scanners?.enableSemgrep !== false ? 'checked' : ''} />
                                <span class="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Enable Bandit</div>
                            <div class="setting-label-desc">Use Bandit for Python-specific security scanning</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" id="enableBandit" ${settings.scanners?.enableBandit !== false ? 'checked' : ''} />
                                <span class="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
            <div class="section" id="scanBehavior">
                <div class="setting-group">
                    <div class="setting-group-title">Scan Behavior</div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Scan on Save</div>
                            <div class="setting-label-desc">Automatically scan files when saved</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" id="scanOnSave" ${settings.scanOnSave !== false ? 'checked' : ''} />
                                <span class="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Scan on Startup</div>
                            <div class="setting-label-desc">Run scan automatically when workspace opens</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" id="scanBehavior.scanOnStartup" ${settings.scanBehavior?.scanOnStartup ? 'checked' : ''} />
                                <span class="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Scan Mode</div>
                            <div class="setting-label-desc">How to scan files</div>
                        </div>
                        <div class="setting-control">
                            <select id="scanBehavior.scanMode">
                                <option value="full" ${settings.scanBehavior?.scanMode === 'full' ? 'selected' : ''}>Full (scan everything)</option>
                                <option value="incremental" ${settings.scanBehavior?.scanMode === 'incremental' || !settings.scanBehavior?.scanMode ? 'selected' : ''}>Incremental (changed files only)</option>
                                <option value="changed-only" ${settings.scanBehavior?.scanMode === 'changed-only' ? 'selected' : ''}>Changed Only (currently modified)</option>
                            </select>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Max File Size (bytes)</div>
                            <div class="setting-label-desc">Skip files larger than this size</div>
                        </div>
                        <div class="setting-control">
                            <input type="number" id="scanBehavior.maxFileSize" value="${settings.scanBehavior?.maxFileSize || 1048576}" min="1024" max="10485760" />
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Scan Interval</div>
                            <div class="setting-label-desc">Number of saves before triggering full scan</div>
                        </div>
                        <div class="setting-control">
                            <input type="number" id="scanInterval" value="${settings.scanInterval || 1}" min="1" max="100" />
                        </div>
                    </div>
                </div>
            </div>
            <div class="section" id="cve">
                <div class="setting-group">
                    <div class="setting-group-title">CVE Lookup</div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Enable CVE Enrichment</div>
                            <div class="setting-label-desc">Automatically enrich vulnerabilities with CVE data</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" id="cve.enabled" ${settings.cve?.enabled !== false ? 'checked' : ''} />
                                <span class="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Enable Caching</div>
                            <div class="setting-label-desc">Cache CVE lookups to reduce API calls</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" id="cve.cacheEnabled" ${settings.cve?.cacheEnabled !== false ? 'checked' : ''} />
                                <span class="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Cache TTL (hours)</div>
                            <div class="setting-label-desc">How long to cache CVE data</div>
                        </div>
                        <div class="setting-control">
                            <input type="number" id="cve.cacheTTLHours" value="${settings.cve?.cacheTTLHours || 24}" min="1" max="168" />
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">API Preference</div>
                            <div class="setting-label-desc">Which CVE database to use</div>
                        </div>
                        <div class="setting-control">
                            <select id="cve.apiPreference">
                                <option value="nvd" ${settings.cve?.apiPreference === 'nvd' ? 'selected' : ''}>NVD Only</option>
                                <option value="mitre" ${settings.cve?.apiPreference === 'mitre' ? 'selected' : ''}>MITRE Only</option>
                                <option value="both" ${settings.cve?.apiPreference === 'both' || !settings.cve?.apiPreference ? 'selected' : ''}>Both (with fallback)</option>
                            </select>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Rate Limit Delay (ms)</div>
                            <div class="setting-label-desc">Delay between CVE lookups</div>
                        </div>
                        <div class="setting-control">
                            <input type="number" id="cve.rateLimitDelay" value="${settings.cve?.rateLimitDelay || 200}" min="0" max="2000" />
                        </div>
                    </div>
                </div>
            </div>
            <div class="section" id="ui">
                <div class="setting-group">
                    <div class="setting-group-title">UI & Display Settings</div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Show CodeLens</div>
                            <div class="setting-label-desc">Show Explain button above vulnerability lines</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" id="ui.showCodeLens" ${settings.ui?.showCodeLens !== false ? 'checked' : ''} />
                                <span class="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Highlight Duration (seconds)</div>
                            <div class="setting-label-desc">How long to keep lines highlighted</div>
                        </div>
                        <div class="setting-control">
                            <input type="number" id="ui.highlightDuration" value="${settings.ui?.highlightDuration || 5}" min="1" max="60" />
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Show Gutter Icon</div>
                            <div class="setting-label-desc">Show question mark icon in gutter</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" id="ui.showGutterIcon" ${settings.ui?.showGutterIcon !== false ? 'checked' : ''} />
                                <span class="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Show Overview Ruler</div>
                            <div class="setting-label-desc">Show indicators in scrollbar</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" id="ui.showOverviewRuler" ${settings.ui?.showOverviewRuler !== false ? 'checked' : ''} />
                                <span class="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">CodeLens Position</div>
                            <div class="setting-label-desc">Where to show Explain button</div>
                        </div>
                        <div class="setting-control">
                            <select id="ui.codeLensPosition">
                                <option value="above" ${settings.ui?.codeLensPosition === 'above' || !settings.ui?.codeLensPosition ? 'selected' : ''}>Above Line</option>
                                <option value="inline" ${settings.ui?.codeLensPosition === 'inline' ? 'selected' : ''}>Inline</option>
                            </select>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Theme</div>
                            <div class="setting-label-desc">UI theme preference</div>
                        </div>
                        <div class="setting-control">
                            <select id="ui.theme">
                                <option value="auto" ${settings.ui?.theme === 'auto' || !settings.ui?.theme ? 'selected' : ''}>Auto (match VS Code)</option>
                                <option value="light" ${settings.ui?.theme === 'light' ? 'selected' : ''}>Light</option>
                                <option value="dark" ${settings.ui?.theme === 'dark' ? 'selected' : ''}>Dark</option>
                            </select>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Compact Mode</div>
                            <div class="setting-label-desc">Use compact UI layout</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" id="ui.compactMode" ${settings.ui?.compactMode ? 'checked' : ''} />
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
                                <input type="checkbox" id="notifications.enabled" ${settings.notifications?.enabled !== false ? 'checked' : ''} />
                                <span class="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Minimum Severity</div>
                            <div class="setting-label-desc">Only show notifications at or above this severity</div>
                        </div>
                        <div class="setting-control">
                            <select id="notifications.minSeverity">
                                <option value="info" ${settings.notifications?.minSeverity === 'info' ? 'selected' : ''}>Info (all)</option>
                                <option value="low" ${settings.notifications?.minSeverity === 'low' ? 'selected' : ''}>Low</option>
                                <option value="medium" ${settings.notifications?.minSeverity === 'medium' || !settings.notifications?.minSeverity ? 'selected' : ''}>Medium</option>
                                <option value="high" ${settings.notifications?.minSeverity === 'high' ? 'selected' : ''}>High</option>
                                <option value="critical" ${settings.notifications?.minSeverity === 'critical' ? 'selected' : ''}>Critical Only</option>
                            </select>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Show Popups</div>
                            <div class="setting-label-desc">Show popup notifications</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" id="notifications.showPopups" ${settings.notifications?.showPopups !== false ? 'checked' : ''} />
                                <span class="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Sound Alerts</div>
                            <div class="setting-label-desc">Play sound for critical vulnerabilities</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" id="notifications.soundEnabled" ${settings.notifications?.soundEnabled ? 'checked' : ''} />
                                <span class="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
            <div class="section" id="performance">
                <div class="setting-group">
                    <div class="setting-group-title">Performance Settings</div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Max Concurrent Scans</div>
                            <div class="setting-label-desc">Number of scanners that can run simultaneously</div>
                        </div>
                        <div class="setting-control">
                            <input type="number" id="performance.maxConcurrentScans" value="${settings.performance?.maxConcurrentScans || 5}" min="1" max="20" />
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Scan Timeout (ms)</div>
                            <div class="setting-label-desc">Maximum time to wait for scan completion</div>
                        </div>
                        <div class="setting-control">
                            <input type="number" id="performance.scanTimeout" value="${settings.performance?.scanTimeout || 300000}" min="10000" max="1800000" />
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Enable Caching</div>
                            <div class="setting-label-desc">Cache scan results to avoid re-scanning unchanged files</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" id="performance.cacheEnabled" ${settings.performance?.cacheEnabled !== false ? 'checked' : ''} />
                                <span class="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Cache TTL (hours)</div>
                            <div class="setting-label-desc">How long to cache scan results</div>
                        </div>
                        <div class="setting-control">
                            <input type="number" id="performance.cacheTTLHours" value="${settings.performance?.cacheTTLHours || 24}" min="1" max="168" />
                        </div>
                    </div>
                </div>
            </div>
            <div class="section" id="explain">
                <div class="setting-group">
                    <div class="setting-group-title">Explain & AI Settings</div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Enable AI Explanations</div>
                            <div class="setting-label-desc">Allow AI to generate vulnerability explanations</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" id="explain.enabled" ${settings.explain?.enabled !== false ? 'checked' : ''} />
                                <span class="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">AI Provider</div>
                            <div class="setting-label-desc">Which AI provider to use for explanations</div>
                        </div>
                        <div class="setting-control">
                            <select id="explain.provider">
                                <option value="same-as-chat" ${settings.explain?.provider === 'same-as-chat' || !settings.explain?.provider ? 'selected' : ''}>Same as Chat</option>
                                <option value="openrouter" ${settings.explain?.provider === 'openrouter' ? 'selected' : ''}>OpenRouter</option>
                                <option value="openai" ${settings.explain?.provider === 'openai' ? 'selected' : ''}>OpenAI</option>
                                <option value="anthropic" ${settings.explain?.provider === 'anthropic' ? 'selected' : ''}>Anthropic</option>
                                <option value="gemini" ${settings.explain?.provider === 'gemini' ? 'selected' : ''}>Google Gemini</option>
                                <option value="ollama" ${settings.explain?.provider === 'ollama' ? 'selected' : ''}>Ollama</option>
                            </select>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Max Explanation Length</div>
                            <div class="setting-label-desc">Maximum characters for brief explanations</div>
                        </div>
                        <div class="setting-control">
                            <input type="number" id="explain.maxLength" value="${settings.explain?.maxLength || 500}" min="100" max="2000" />
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Include Code Context</div>
                            <div class="setting-label-desc">Include surrounding code in explanations</div>
                        </div>
                        <div class="setting-control">
                            <label class="checkbox-wrapper">
                                <input type="checkbox" id="explain.includeCodeContext" ${settings.explain?.includeCodeContext !== false ? 'checked' : ''} />
                                <span class="checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Code Context Lines</div>
                            <div class="setting-label-desc">Number of lines before/after to include</div>
                        </div>
                        <div class="setting-control">
                            <input type="number" id="explain.codeContextLines" value="${settings.explain?.codeContextLines || 5}" min="0" max="20" />
                        </div>
                    </div>
                </div>
            </div>
            <div class="section" id="providers">
                <div class="setting-group">
                    <div class="setting-group-title">API Provider</div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Provider Type</div>
                            <div class="setting-label-desc">Choose your AI provider</div>
                        </div>
                        <div class="setting-control">
                            <select id="aiProvider">
                                <option value="ollama" ${settings.aiProvider === 'ollama' ? 'selected' : ''}>Local (Ollama)</option>
                                <option value="openrouter" ${settings.aiProvider === 'openrouter' ? 'selected' : ''}>OpenRouter (450+ models)</option>
                                <option value="openai" ${settings.aiProvider === 'openai' ? 'selected' : ''}>OpenAI</option>
                                <option value="anthropic" ${settings.aiProvider === 'anthropic' ? 'selected' : ''}>Anthropic (Claude)</option>
                                <option value="gemini" ${settings.aiProvider === 'gemini' ? 'selected' : ''}>Google Gemini</option>
                                <option value="custom" ${settings.aiProvider === 'custom' ? 'selected' : ''}>Custom</option>
                            </select>
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">OpenRouter API Key</div>
                            <div class="setting-label-desc">Stored securely in system keychain. Get key at https://openrouter.ai</div>
                        </div>
                        <div class="setting-control">
                            <input type="password" id="apiKey.openrouter" placeholder="${placeholder('openrouter')}" autocomplete="off" />
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">OpenRouter Model</div>
                            <div class="setting-label-desc">Use <code>openrouter/free</code> (free, auto-selects models). Or see https://openrouter.ai/models for other models.</div>
                        </div>
                        <div class="setting-control">
                            <input type="text" id="openrouterModel" value="${(settings.openrouterModel || 'openrouter/free').replace(/"/g, '&quot;')}" placeholder="openrouter/free" />
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">OpenAI API Key</div>
                            <div class="setting-label-desc">Stored securely in system keychain</div>
                        </div>
                        <div class="setting-control">
                            <input type="password" id="apiKey.openai" placeholder="${placeholder('openai')}" autocomplete="off" />
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Anthropic (Claude) API Key</div>
                            <div class="setting-label-desc">Stored securely in system keychain</div>
                        </div>
                        <div class="setting-control">
                            <input type="password" id="apiKey.anthropic" placeholder="${placeholder('anthropic')}" autocomplete="off" />
                        </div>
                    </div>
                    <div class="setting-item">
                        <div class="setting-label">
                            <div class="setting-label-title">Google Gemini API Key</div>
                            <div class="setting-label-desc">Stored securely in system keychain</div>
                        </div>
                        <div class="setting-control">
                            <input type="password" id="apiKey.gemini" placeholder="${placeholder('gemini')}" autocomplete="off" />
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
            scanners: { title: 'Scanners', desc: 'Enable or disable security scanners' },
            scanBehavior: { title: 'Scan Behavior', desc: 'Configure how scans are performed' },
            cve: { title: 'CVE Lookup', desc: 'Configure CVE enrichment settings' },
            ui: { title: 'UI & Display', desc: 'Customize the user interface' },
            notifications: { title: 'Notifications', desc: 'Configure notification preferences' },
            performance: { title: 'Performance', desc: 'Performance and caching settings' },
            explain: { title: 'Explain & AI', desc: 'AI-powered explanation settings' },
            providers: { title: 'AI Providers', desc: 'Configure AI providers and models' }
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
        function navigateTo(command) {
            vscode.postMessage({
                command: 'navigateTo',
                target: command
            });
        }
        function saveSettings() {
            const settings = {
                scanners: {
                    enableDependency: document.getElementById('scanners.enableDependency').checked,
                    enableSecrets: document.getElementById('scanners.enableSecrets').checked,
                    enableSmartContract: document.getElementById('scanners.enableSmartContract').checked,
                    enableCodePattern: document.getElementById('scanners.enableCodePattern').checked,
                    enableSemgrep: document.getElementById('enableSemgrep').checked,
                    enableBandit: document.getElementById('enableBandit').checked
                },
                scanBehavior: {
                    scanOnStartup: document.getElementById('scanBehavior.scanOnStartup').checked,
                    scanMode: document.getElementById('scanBehavior.scanMode').value,
                    maxFileSize: parseInt(document.getElementById('scanBehavior.maxFileSize').value) || 1048576
                },
                scanOnSave: document.getElementById('scanOnSave') ? document.getElementById('scanOnSave').checked : true,
                scanInterval: parseInt(document.getElementById('scanInterval').value) || 1,
                cve: {
                    enabled: document.getElementById('cve.enabled').checked,
                    cacheEnabled: document.getElementById('cve.cacheEnabled').checked,
                    cacheTTLHours: parseInt(document.getElementById('cve.cacheTTLHours').value) || 24,
                    apiPreference: document.getElementById('cve.apiPreference').value,
                    rateLimitDelay: parseInt(document.getElementById('cve.rateLimitDelay').value) || 200
                },
                ui: {
                    showCodeLens: document.getElementById('ui.showCodeLens').checked,
                    highlightDuration: parseInt(document.getElementById('ui.highlightDuration').value) || 5,
                    showGutterIcon: document.getElementById('ui.showGutterIcon').checked,
                    showOverviewRuler: document.getElementById('ui.showOverviewRuler').checked,
                    codeLensPosition: document.getElementById('ui.codeLensPosition').value,
                    theme: document.getElementById('ui.theme').value,
                    compactMode: document.getElementById('ui.compactMode').checked
                },
                notifications: {
                    enabled: document.getElementById('notifications.enabled').checked,
                    minSeverity: document.getElementById('notifications.minSeverity').value,
                    showPopups: document.getElementById('notifications.showPopups').checked,
                    soundEnabled: document.getElementById('notifications.soundEnabled').checked
                },
                performance: {
                    maxConcurrentScans: parseInt(document.getElementById('performance.maxConcurrentScans').value) || 5,
                    scanTimeout: parseInt(document.getElementById('performance.scanTimeout').value) || 300000,
                    cacheEnabled: document.getElementById('performance.cacheEnabled').checked,
                    cacheTTLHours: parseInt(document.getElementById('performance.cacheTTLHours').value) || 24
                },
                explain: {
                    enabled: document.getElementById('explain.enabled').checked,
                    provider: document.getElementById('explain.provider').value,
                    maxLength: parseInt(document.getElementById('explain.maxLength').value) || 500,
                    includeCodeContext: document.getElementById('explain.includeCodeContext').checked,
                    codeContextLines: parseInt(document.getElementById('explain.codeContextLines').value) || 5
                },
                aiProvider: document.getElementById('aiProvider') ? document.getElementById('aiProvider').value : 'openrouter',
                openrouterModel: document.getElementById('openrouterModel') ? document.getElementById('openrouterModel').value?.trim() || 'openrouter/free' : 'openrouter/free',
                lmStudioUrl: document.getElementById('lmStudioUrl') ? document.getElementById('lmStudioUrl').value : 'http://localhost:1234/v1/chat/completions',
                ollamaUrl: document.getElementById('ollamaUrl') ? document.getElementById('ollamaUrl').value : 'http://localhost:11434/v1/chat/completions',
                useCloudAI: document.getElementById('useCloudAI') ? document.getElementById('useCloudAI').checked : false,
                apiKeys: {
                    openrouter: document.getElementById('apiKey.openrouter')?.value?.trim() || '',
                    openai: document.getElementById('apiKey.openai')?.value?.trim() || '',
                    anthropic: document.getElementById('apiKey.anthropic')?.value?.trim() || '',
                    gemini: document.getElementById('apiKey.gemini')?.value?.trim() || ''
                }
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
</html>`);
}

