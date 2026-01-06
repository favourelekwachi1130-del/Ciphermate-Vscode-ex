import * as vscode from 'vscode';
import { telemetry } from '../monitoring/telemetry';

// Error Categories
export enum ErrorCategory {
  NETWORK = 'network',
  FILE_SYSTEM = 'file_system',
  AUTHENTICATION = 'authentication',
  SCANNING = 'scanning',
  CONFIGURATION = 'configuration',
  MEMORY = 'memory',
  PERMISSION = 'permission',
  UNKNOWN = 'unknown'
}

// Error Severity Levels
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Error Context
export interface ErrorContext {
  operation: string;
  component: string;
  userId?: string;
  workspacePath?: string;
  timestamp: number;
  additionalData?: { [key: string]: any };
}

// Recovery Strategy
export interface RecoveryStrategy {
  name: string;
  description: string;
  canRecover: (error: Error, context: ErrorContext) => boolean;
  recover: (error: Error, context: ErrorContext) => Promise<boolean>;
  priority: number; // Lower number = higher priority
}

// Error Recovery Manager
export class ErrorRecoveryManager {
  private strategies: RecoveryStrategy[] = [];
  private retryAttempts: Map<string, number> = new Map();
  private maxRetries = 3;
  private retryDelay = 1000; // 1 second

  constructor() {
    this.registerDefaultStrategies();
  }

  // Register a recovery strategy
  registerStrategy(strategy: RecoveryStrategy): void {
    this.strategies.push(strategy);
    this.strategies.sort((a, b) => a.priority - b.priority);
  }

  // Attempt to recover from an error
  async attemptRecovery(error: Error, context: ErrorContext): Promise<boolean> {
    const errorKey = this.getErrorKey(error, context);
    const attempts = this.retryAttempts.get(errorKey) || 0;

    if (attempts >= this.maxRetries) {
      telemetry.trackError(error, context.operation, {
        category: this.categorizeError(error),
        severity: this.assessSeverity(error),
        maxRetriesExceeded: true
      });
      return false;
    }

    this.retryAttempts.set(errorKey, attempts + 1);

    // Find applicable recovery strategies
    const applicableStrategies = this.strategies.filter(strategy => 
      strategy.canRecover(error, context)
    );

    if (applicableStrategies.length === 0) {
      telemetry.trackError(error, context.operation, {
        category: this.categorizeError(error),
        severity: this.assessSeverity(error),
        noRecoveryStrategy: true
      });
      return false;
    }

    // Try each strategy in order of priority
    for (const strategy of applicableStrategies) {
      try {
        const recovered = await strategy.recover(error, context);
        if (recovered) {
          telemetry.trackEvent('error_recovery_success', {
            strategy: strategy.name,
            operation: context.operation,
            attempts: attempts + 1
          });
          
          // Clear retry count on successful recovery
          this.retryAttempts.delete(errorKey);
          return true;
        }
      } catch (recoveryError) {
        telemetry.trackError(recoveryError as Error, 'recovery_strategy', {
          strategy: strategy.name,
          originalError: error.message
        });
      }
    }

    // If no strategy succeeded, wait before next retry
    await this.delay(this.retryDelay * Math.pow(2, attempts)); // Exponential backoff
    return false;
  }

  // Categorize error type
  categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    if (message.includes('network') || message.includes('connection') || message.includes('timeout')) {
      return ErrorCategory.NETWORK;
    }
    if (message.includes('file') || message.includes('directory') || message.includes('path')) {
      return ErrorCategory.FILE_SYSTEM;
    }
    if (message.includes('auth') || message.includes('login') || message.includes('token')) {
      return ErrorCategory.AUTHENTICATION;
    }
    if (message.includes('scan') || message.includes('analysis')) {
      return ErrorCategory.SCANNING;
    }
    if (message.includes('config') || message.includes('setting')) {
      return ErrorCategory.CONFIGURATION;
    }
    if (message.includes('memory') || message.includes('heap')) {
      return ErrorCategory.MEMORY;
    }
    if (message.includes('permission') || message.includes('access')) {
      return ErrorCategory.PERMISSION;
    }

    return ErrorCategory.UNKNOWN;
  }

  // Assess error severity
  assessSeverity(error: Error): ErrorSeverity {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    if (name.includes('critical') || message.includes('fatal')) {
      return ErrorSeverity.CRITICAL;
    }
    if (name.includes('error') || message.includes('failed')) {
      return ErrorSeverity.HIGH;
    }
    if (name.includes('warning') || message.includes('timeout')) {
      return ErrorSeverity.MEDIUM;
    }

    return ErrorSeverity.LOW;
  }

  // Get user-friendly error message
  getUserFriendlyMessage(error: Error, context: ErrorContext): string {
    const category = this.categorizeError(error);
    const severity = this.assessSeverity(error);

    const messages: { [key in ErrorCategory]: string } = {
      [ErrorCategory.NETWORK]: 'Network connection issue. Please check your internet connection and try again.',
      [ErrorCategory.FILE_SYSTEM]: 'File system error. Please check file permissions and disk space.',
      [ErrorCategory.AUTHENTICATION]: 'Authentication failed. Please log in again.',
      [ErrorCategory.SCANNING]: 'Scanning operation failed. Please try again or check your project files.',
      [ErrorCategory.CONFIGURATION]: 'Configuration error. Please check your settings.',
      [ErrorCategory.MEMORY]: 'Memory issue detected. Please restart VS Code if problems persist.',
      [ErrorCategory.PERMISSION]: 'Permission denied. Please check file and folder permissions.',
      [ErrorCategory.UNKNOWN]: 'An unexpected error occurred. Please try again.'
    };

    let message = messages[category];

    if (severity === ErrorSeverity.CRITICAL) {
      message = `Critical Error: ${message}`;
    } else if (severity === ErrorSeverity.HIGH) {
      message = `Error: ${message}`;
    }

    return message;
  }

  private registerDefaultStrategies(): void {
    // Network error recovery
    this.registerStrategy({
      name: 'network_retry',
      description: 'Retry network operations with exponential backoff',
      priority: 1,
      canRecover: (error, context) => 
        this.categorizeError(error) === ErrorCategory.NETWORK,
      recover: async (error, context) => {
        await this.delay(2000); // Wait 2 seconds
        return true; // Assume recovery after delay
      }
    });

    // File system error recovery
    this.registerStrategy({
      name: 'file_system_retry',
      description: 'Retry file system operations',
      priority: 2,
      canRecover: (error, context) => 
        this.categorizeError(error) === ErrorCategory.FILE_SYSTEM,
      recover: async (error, context) => {
        // Try to create missing directories
        if (context.workspacePath) {
          try {
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(context.workspacePath));
            return true;
          } catch (e) {
            return false;
          }
        }
        return false;
      }
    });

    // Authentication error recovery
    this.registerStrategy({
      name: 'auth_refresh',
      description: 'Refresh authentication tokens',
      priority: 3,
      canRecover: (error, context) => 
        this.categorizeError(error) === ErrorCategory.AUTHENTICATION,
      recover: async (error, context) => {
        // Trigger re-authentication
        await vscode.commands.executeCommand('ciphermate.login');
        return true;
      }
    });

    // Memory error recovery
    this.registerStrategy({
      name: 'memory_cleanup',
      description: 'Perform memory cleanup and garbage collection',
      priority: 4,
      canRecover: (error, context) => 
        this.categorizeError(error) === ErrorCategory.MEMORY,
      recover: async (error, context) => {
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
        return true;
      }
    });

    // Configuration error recovery
    this.registerStrategy({
      name: 'config_reset',
      description: 'Reset configuration to defaults',
      priority: 5,
      canRecover: (error, context) => 
        this.categorizeError(error) === ErrorCategory.CONFIGURATION,
      recover: async (error, context) => {
        // Reset configuration
        await vscode.commands.executeCommand('ciphermate.clearData');
        return true;
      }
    });
  }

  private getErrorKey(error: Error, context: ErrorContext): string {
    return `${context.operation}-${context.component}-${error.name}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Clear retry attempts for a specific operation
  clearRetryAttempts(operation: string): void {
    for (const [key] of this.retryAttempts) {
      if (key.startsWith(operation)) {
        this.retryAttempts.delete(key);
      }
    }
  }

  // Get retry statistics
  getRetryStats(): { [operation: string]: number } {
    const stats: { [operation: string]: number } = {};
    for (const [key, attempts] of this.retryAttempts) {
      const operation = key.split('-')[0];
      stats[operation] = (stats[operation] || 0) + attempts;
    }
    return stats;
  }
}

// Global error recovery manager
export const errorRecovery = new ErrorRecoveryManager();

// Error handling decorator
export function withErrorRecovery(operation: string, component: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const context: ErrorContext = {
        operation,
        component,
        timestamp: Date.now(),
        workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      };

      try {
        return await method.apply(this, args);
      } catch (error) {
        const recovered = await errorRecovery.attemptRecovery(error as Error, context);
        
        if (recovered) {
          // Retry the operation after recovery
          return await method.apply(this, args);
        } else {
          // Show user-friendly error message
          const userMessage = errorRecovery.getUserFriendlyMessage(error as Error, context);
          vscode.window.showErrorMessage(userMessage);
          throw error;
        }
      }
    };

    return descriptor;
  };
}




