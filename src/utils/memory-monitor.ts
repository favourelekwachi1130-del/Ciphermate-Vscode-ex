/**
 * Memory Monitor Utility
 * 
 * Tracks memory usage and provides cleanup recommendations
 */

export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  heapUsedMB: number;
  heapTotalMB: number;
  usagePercent: number;
}

export class MemoryMonitor {
  private static instance: MemoryMonitor | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private warningThresholdMB: number = 700; // 700MB warning threshold
  private criticalThresholdMB: number = 950; // 950MB critical threshold (VS Code extension host can reach ~900MB)

  private constructor() {}

  static getInstance(): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor();
    }
    return MemoryMonitor.instance;
  }

  /**
   * Get current memory usage statistics
   */
  getMemoryStats(): MemoryStats {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    const heapTotalMB = usage.heapTotal / 1024 / 1024;
    const usagePercent = (usage.heapUsed / usage.heapTotal) * 100;

    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
      heapUsedMB,
      heapTotalMB,
      usagePercent
    };
  }

  /**
   * Check if memory usage is high
   */
  isMemoryHigh(): boolean {
    const stats = this.getMemoryStats();
    return stats.heapUsedMB > this.warningThresholdMB;
  }

  /**
   * Check if memory usage is critical
   */
  isMemoryCritical(): boolean {
    const stats = this.getMemoryStats();
    return stats.heapUsedMB > this.criticalThresholdMB;
  }

  /**
   * Get memory status message
   */
  getMemoryStatus(): { level: 'ok' | 'warning' | 'critical'; message: string } {
    const stats = this.getMemoryStats();
    
    if (stats.heapUsedMB > this.criticalThresholdMB) {
      return {
        level: 'critical',
        message: `Critical: ${stats.heapUsedMB.toFixed(2)}MB used (${stats.usagePercent.toFixed(1)}%)`
      };
    } else if (stats.heapUsedMB > this.warningThresholdMB) {
      return {
        level: 'warning',
        message: `Warning: ${stats.heapUsedMB.toFixed(2)}MB used (${stats.usagePercent.toFixed(1)}%)`
      };
    }
    
    return {
      level: 'ok',
      message: `Memory: ${stats.heapUsedMB.toFixed(2)}MB used (${stats.usagePercent.toFixed(1)}%)`
    };
  }

  /**
   * Start monitoring memory usage
   */
  startMonitoring(intervalMs: number = 30000): void {
    if (this.checkInterval) {
      this.stopMonitoring();
    }

    this.checkInterval = setInterval(() => {
      const status = this.getMemoryStatus();
      
      if (status.level === 'critical') {
        console.warn(`[MemoryMonitor] ${status.message} - Consider cleanup`);
        // Trigger cleanup if available
        if (typeof (global as any).performMemoryCleanup === 'function') {
          (global as any).performMemoryCleanup();
        }
      } else if (status.level === 'warning') {
        console.log(`[MemoryMonitor] ${status.message}`);
      }
    }, intervalMs);
  }

  /**
   * Stop monitoring memory usage
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Set warning threshold
   */
  setWarningThreshold(mb: number): void {
    this.warningThresholdMB = mb;
  }

  /**
   * Set critical threshold
   */
  setCriticalThreshold(mb: number): void {
    this.criticalThresholdMB = mb;
  }

  /**
   * Format memory stats for logging
   */
  formatStats(): string {
    const stats = this.getMemoryStats();
    return `Heap: ${stats.heapUsedMB.toFixed(2)}MB / ${stats.heapTotalMB.toFixed(2)}MB (${stats.usagePercent.toFixed(1)}%) | RSS: ${(stats.rss / 1024 / 1024).toFixed(2)}MB`;
  }
}

// Export singleton instance
export const memoryMonitor = MemoryMonitor.getInstance();
