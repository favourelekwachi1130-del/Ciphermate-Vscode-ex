import * as vscode from 'vscode';
import { configManager, CipherMateConfig } from '../config/enterprise-config';

// Telemetry Event Types
export interface TelemetryEvent {
  name: string;
  timestamp: number;
  properties: { [key: string]: any };
  measurements: { [key: string]: number };
  userId?: string;
  sessionId: string;
}

// Performance Metrics
export interface PerformanceMetrics {
  operation: string;
  duration: number;
  memoryUsage: number;
  cpuUsage?: number;
  success: boolean;
  errorType?: string;
}

// Usage Analytics
export interface UsageAnalytics {
  feature: string;
  action: string;
  timestamp: number;
  userId?: string;
  sessionId: string;
  context: {
    workspaceType: string;
    fileCount: number;
    language: string;
  };
}

// Telemetry Service
export class TelemetryService {
  private events: TelemetryEvent[] = [];
  private metrics: PerformanceMetrics[] = [];
  private analytics: UsageAnalytics[] = [];
  private sessionId: string;
  private config: CipherMateConfig;
  private flushTimer?: NodeJS.Timeout;
  private isEnabled: boolean;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.config = configManager.getConfig();
    this.isEnabled = this.config.telemetry.enabled;
    
    if (this.isEnabled) {
      this.startFlushTimer();
    }
  }

  // Event Tracking
  trackEvent(name: string, properties: { [key: string]: any } = {}, measurements: { [key: string]: number } = {}): void {
    if (!this.isEnabled) {return;}

    const event: TelemetryEvent = {
      name,
      timestamp: Date.now(),
      properties: this.anonymizeData(properties),
      measurements,
      sessionId: this.sessionId
    };

    this.events.push(event);
    this.checkFlushThreshold();
  }

  // Performance Tracking
  trackPerformance(metrics: PerformanceMetrics): void {
    if (!this.isEnabled) {return;}

    this.metrics.push(metrics);
    this.checkFlushThreshold();
  }

  // Usage Analytics
  trackUsage(feature: string, action: string, context: { [key: string]: any } = {}): void {
    if (!this.isEnabled) {return;}

    const analytics: UsageAnalytics = {
      feature,
      action,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      context: {
        workspaceType: this.getWorkspaceType(),
        fileCount: this.getFileCount(),
        language: this.getPrimaryLanguage(),
        ...context
      }
    };

    this.analytics.push(analytics);
    this.checkFlushThreshold();
  }

  // Error Tracking
  trackError(error: Error, context: string, properties: { [key: string]: any } = {}): void {
    this.trackEvent('error', {
      errorMessage: error.message,
      errorStack: error.stack,
      context,
      ...properties
    }, {
      errorCount: 1
    });
  }

  // Feature Usage
  trackFeatureUsage(feature: string, action: string, success: boolean = true): void {
    this.trackEvent('feature_usage', {
      feature,
      action,
      success
    }, {
      usageCount: 1
    });

    this.trackUsage(feature, action, { success });
  }

  // Scan Analytics
  trackScan(scanType: string, vulnerabilitiesFound: number, duration: number, success: boolean): void {
    this.trackEvent('scan_completed', {
      scanType,
      vulnerabilitiesFound,
      success
    }, {
      duration,
      vulnerabilityCount: vulnerabilitiesFound
    });

    this.trackUsage('scanning', scanType, {
      vulnerabilitiesFound,
      duration,
      success
    });
  }

  // Authentication Analytics
  trackAuthentication(provider: string, success: boolean, duration: number): void {
    this.trackEvent('authentication', {
      provider,
      success
    }, {
      duration
    });

    this.trackUsage('authentication', provider, {
      success,
      duration
    });
  }

  // Flush data to endpoint
  async flush(): Promise<void> {
    if (!this.isEnabled || (this.events.length === 0 && this.metrics.length === 0 && this.analytics.length === 0)) {
      return;
    }

    try {
      const payload = {
        events: this.events,
        metrics: this.metrics,
        analytics: this.analytics,
        sessionId: this.sessionId,
        timestamp: Date.now(),
        version: this.config.version
      };

      await this.sendToEndpoint(payload);

      // Clear buffers after successful send
      this.events = [];
      this.metrics = [];
      this.analytics = [];

    } catch (error) {
      console.error('Failed to flush telemetry data:', error);
    }
  }

  // Get aggregated metrics
  getMetrics(): {
    events: number;
    metrics: number;
    analytics: number;
    sessionDuration: number;
    featureUsage: { [feature: string]: number };
    errorCount: number;
  } {
    const featureUsage: { [feature: string]: number } = {};
    let errorCount = 0;

    this.events.forEach(event => {
      if (event.name === 'feature_usage') {
        const feature = event.properties.feature;
        featureUsage[feature] = (featureUsage[feature] || 0) + 1;
      }
      if (event.name === 'error') {
        errorCount++;
      }
    });

    return {
      events: this.events.length,
      metrics: this.metrics.length,
      analytics: this.analytics.length,
      sessionDuration: Date.now() - parseInt(this.sessionId.split('-')[0]),
      featureUsage,
      errorCount
    };
  }

  // Enable/Disable telemetry
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    configManager.set('telemetry.enabled', enabled);
    
    if (enabled) {
      this.startFlushTimer();
    } else {
      this.stopFlushTimer();
      this.flush(); // Send any remaining data
    }
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private anonymizeData(data: { [key: string]: any }): { [key: string]: any } {
    if (!this.config.telemetry.anonymizeData) {
      return data;
    }

    const anonymized = { ...data };
    
    // Remove or hash sensitive information
    const sensitiveKeys = ['email', 'username', 'path', 'filePath', 'url'];
    sensitiveKeys.forEach(key => {
      if (anonymized[key]) {
        anonymized[key] = this.hashValue(anonymized[key]);
      }
    });

    return anonymized;
  }

  private hashValue(value: string): string {
    // Simple hash function for anonymization
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      const char = value.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  private getWorkspaceType(): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {return 'unknown';}
    
    const files = vscode.workspace.fs.readDirectory(workspaceFolder.uri);
    // This would need to be async in real implementation
    return 'project';
  }

  private getFileCount(): number {
    // Simplified implementation
    return vscode.workspace.textDocuments.length;
  }

  private getPrimaryLanguage(): string {
    const activeEditor = vscode.window.activeTextEditor;
    return activeEditor?.document.languageId || 'unknown';
  }

  private checkFlushThreshold(): void {
    const threshold = this.config.telemetry.batchSize;
    if (this.events.length >= threshold || this.metrics.length >= threshold || this.analytics.length >= threshold) {
      this.flush();
    }
  }

  private startFlushTimer(): void {
    this.stopFlushTimer();
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.telemetry.flushInterval);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  private async sendToEndpoint(payload: any): Promise<void> {
    // In a real implementation, this would send to the telemetry endpoint
    // For now, we'll just log it
    console.log('Telemetry payload:', JSON.stringify(payload, null, 2));
  }

  dispose(): void {
    this.stopFlushTimer();
    this.flush(); // Send any remaining data
  }
}

// Global telemetry instance
export const telemetry = new TelemetryService();




