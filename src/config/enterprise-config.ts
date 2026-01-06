import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Enterprise Configuration Schema
export interface CipherMateConfig {
  // Core Settings
  version: string;
  environment: 'development' | 'staging' | 'production';
  
  // Logging Configuration
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    maxFileSize: number;
    maxFiles: number;
    enableConsole: boolean;
    enableFile: boolean;
  };
  
  // Security Configuration
  security: {
    encryption: {
      algorithm: 'aes-256-cbc' | 'aes-256-gcm';
      keySize: 128 | 192 | 256;
      saltRounds: number;
    };
    authentication: {
      sessionTimeout: number;
      maxLoginAttempts: number;
      lockoutDuration: number;
    };
    dataRetention: {
      maxHistoryDays: number;
      autoCleanup: boolean;
    };
  };
  
  // Performance Configuration
  performance: {
    scanning: {
      timeout: number;
      maxConcurrency: number;
      chunkSize: number;
      memoryLimit: number;
    };
    caching: {
      enabled: boolean;
      ttl: number;
      maxSize: number;
      strategy: 'lru' | 'fifo' | 'ttl';
    };
    monitoring: {
      enabled: boolean;
      sampleRate: number;
      metricsRetention: number;
    };
  };
  
  // AI/ML Configuration
  ai: {
    providers: {
      lmStudio: {
        enabled: boolean;
        endpoint: string;
        timeout: number;
        maxRetries: number;
      };
      openai: {
        enabled: boolean;
        apiKey: string;
        model: string;
        timeout: number;
      };
    };
    analysis: {
      maxTokens: number;
      temperature: number;
      batchSize: number;
    };
  };
  
  // Network Configuration
  network: {
    timeout: number;
    retries: number;
    retryDelay: number;
    userAgent: string;
    proxy?: {
      host: string;
      port: number;
      username?: string;
      password?: string;
    };
  };
  
  // Feature Flags
  features: {
    inlineSuggestions: boolean;
    realTimeScanning: boolean;
    teamCollaboration: boolean;
    complianceReporting: boolean;
    redTeamMode: boolean;
    advancedAnalytics: boolean;
  };
  
  // Telemetry Configuration
  telemetry: {
    enabled: boolean;
    endpoint: string;
    batchSize: number;
    flushInterval: number;
    anonymizeData: boolean;
  };
}

// Configuration Manager
export class ConfigurationManager {
  private config: CipherMateConfig;
  private configPath: string;
  private watcher?: vscode.FileSystemWatcher;

  constructor() {
    this.configPath = this.getConfigPath();
    this.config = this.getDefaultConfig();
    this.loadConfiguration();
    this.setupWatcher();
  }

  getConfig(): CipherMateConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<CipherMateConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfiguration();
  }

  get<T>(path: string, defaultValue?: T): T {
    const keys = path.split('.');
    let value: any = this.config;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return defaultValue as T;
      }
    }
    
    return value as T;
  }

  set<T>(path: string, value: T): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    let target: any = this.config;
    
    for (const key of keys) {
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key];
    }
    
    target[lastKey] = value;
    this.saveConfiguration();
  }

  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Validate logging level
    if (!['debug', 'info', 'warn', 'error'].includes(this.config.logging.level)) {
      errors.push('Invalid logging level');
    }
    
    // Validate encryption algorithm
    if (!['aes-256-cbc', 'aes-256-gcm'].includes(this.config.security.encryption.algorithm)) {
      errors.push('Invalid encryption algorithm');
    }
    
    // Validate key size
    if (![128, 192, 256].includes(this.config.security.encryption.keySize)) {
      errors.push('Invalid encryption key size');
    }
    
    // Validate timeout values
    if (this.config.performance.scanning.timeout <= 0) {
      errors.push('Scanning timeout must be positive');
    }
    
    if (this.config.performance.scanning.maxConcurrency <= 0 || this.config.performance.scanning.maxConcurrency > 10) {
      errors.push('Max concurrency must be between 1 and 10');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  private getConfigPath(): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      return path.join(workspaceFolder.uri.fsPath, '.ciphermate', 'config.json');
    }
    return path.join(os.homedir(), '.ciphermate', 'config.json');
  }

  private getDefaultConfig(): CipherMateConfig {
    return {
      version: '1.0.2',
      environment: 'development',
      
      logging: {
        level: 'info',
        maxFileSize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
        enableConsole: true,
        enableFile: true
      },
      
      security: {
        encryption: {
          algorithm: 'aes-256-cbc',
          keySize: 256,
          saltRounds: 12
        },
        authentication: {
          sessionTimeout: 3600000, // 1 hour
          maxLoginAttempts: 5,
          lockoutDuration: 900000 // 15 minutes
        },
        dataRetention: {
          maxHistoryDays: 90,
          autoCleanup: true
        }
      },
      
      performance: {
        scanning: {
          timeout: 300000, // 5 minutes
          maxConcurrency: 3,
          chunkSize: 1024 * 1024, // 1MB
          memoryLimit: 512 * 1024 * 1024 // 512MB
        },
        caching: {
          enabled: true,
          ttl: 3600000, // 1 hour
          maxSize: 100 * 1024 * 1024, // 100MB
          strategy: 'lru'
        },
        monitoring: {
          enabled: true,
          sampleRate: 0.1, // 10%
          metricsRetention: 7 * 24 * 3600000 // 7 days
        }
      },
      
      ai: {
        providers: {
          lmStudio: {
            enabled: true,
            endpoint: 'http://localhost:1234/v1/chat/completions',
            timeout: 30000,
            maxRetries: 3
          },
          openai: {
            enabled: false,
            apiKey: '',
            model: 'gpt-4',
            timeout: 30000
          }
        },
        analysis: {
          maxTokens: 4000,
          temperature: 0.1,
          batchSize: 10
        }
      },
      
      network: {
        timeout: 30000,
        retries: 3,
        retryDelay: 1000,
        userAgent: 'CipherMate/1.0.2'
      },
      
      features: {
        inlineSuggestions: true,
        realTimeScanning: true,
        teamCollaboration: true,
        complianceReporting: true,
        redTeamMode: true,
        advancedAnalytics: true
      },
      
      telemetry: {
        enabled: false,
        endpoint: 'https://telemetry.ciphermate.com/v1/metrics',
        batchSize: 100,
        flushInterval: 60000, // 1 minute
        anonymizeData: true
      }
    };
  }

  private loadConfiguration(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const loadedConfig = JSON.parse(configData);
        this.config = { ...this.getDefaultConfig(), ...loadedConfig };
      }
    } catch (error) {
      console.error('Failed to load configuration:', error);
      // Use default configuration
    }
  }

  private saveConfiguration(): void {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Failed to save configuration:', error);
    }
  }

  private setupWatcher(): void {
    const configDir = path.dirname(this.configPath);
    if (fs.existsSync(configDir)) {
      this.watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(configDir, 'config.json')
      );
      
      this.watcher.onDidChange(() => {
        this.loadConfiguration();
      });
    }
  }

  dispose(): void {
    this.watcher?.dispose();
  }
}

// Global configuration instance
export const configManager = new ConfigurationManager();
