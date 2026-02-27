/**
 * Scan Data Service - Connects scan pipeline to database
 * Handles conversion between scan results and database records
 */

import * as vscode from 'vscode';
import { ScanDatabase, ScanRecord, VulnerabilityRecord, UserRecord } from './scan-database';
import { Vulnerability } from '../scanners/types';
import { detectVulnerabilityType } from '../extension';

export interface ScanData {
  scanType: string;
  workspacePath: string;
  vulnerabilities: any[];
  duration: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class ScanDataService {
  private database: ScanDatabase;
  private context: vscode.ExtensionContext;
  private logger: any;
  private currentUserId: string | null = null;

  constructor(context: vscode.ExtensionContext, logger?: any) {
    this.context = context;
    this.logger = logger;
    this.database = new ScanDatabase(context, logger);
    
    // Get current user ID from context
    this.loadCurrentUser();
  }

  private loadCurrentUser(): void {
    // Try to get user from context
    const userProfile = this.context.globalState.get<any>('ciphermate.userProfile');
    if (userProfile && userProfile.id) {
      this.currentUserId = userProfile.id;
    } else {
      // Create anonymous user
      this.currentUserId = this.getOrCreateAnonymousUser();
    }
  }

  private getOrCreateAnonymousUser(): string {
    let userId = this.context.globalState.get<string>('ciphermate.anonymousUserId');
    
    if (!userId) {
      userId = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.context.globalState.update('ciphermate.anonymousUserId', userId);
      
      // Create user record
      const user: UserRecord = {
        id: userId,
        email: 'anonymous@ciphermate.local',
        name: 'Anonymous User',
        provider: 'local',
        createdAt: new Date(),
        lastActiveAt: new Date()
      };
      
      this.database.saveUser(user);
    }
    
    return userId;
  }

  /**
   * Save scan results to database
   */
  async saveScan(scanData: ScanData): Promise<string> {
    if (!this.currentUserId) {
      this.loadCurrentUser();
    }

    const projectName = vscode.workspace.workspaceFolders?.[0]?.name || 'Unknown Project';
    
    // Calculate severity counts
    const vulnerabilities = this.normalizeVulnerabilities(scanData.vulnerabilities);
    const criticalCount = vulnerabilities.filter(v => 
      v.severity === 'critical' || v.severity === 'CRITICAL' || v.severity === 'error' || v.severity === 'ERROR'
    ).length;
    const highCount = vulnerabilities.filter(v => 
      v.severity === 'high' || v.severity === 'HIGH' || v.severity === 'warning' || v.severity === 'WARNING'
    ).length;
    const mediumCount = vulnerabilities.filter(v => 
      v.severity === 'medium' || v.severity === 'MEDIUM' || v.severity === 'info' || v.severity === 'INFO'
    ).length;
    const lowCount = vulnerabilities.filter(v => 
      v.severity === 'low' || v.severity === 'LOW'
    ).length;
    const infoCount = vulnerabilities.filter(v => 
      v.severity === 'info' || v.severity === 'INFO'
    ).length;

    // Create scan record
    const scanRecord: ScanRecord = {
      id: `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: this.currentUserId!,
      scanType: scanData.scanType,
      projectName,
      workspacePath: scanData.workspacePath,
      timestamp: scanData.timestamp || new Date(),
      duration: scanData.duration || 0,
      totalVulnerabilities: vulnerabilities.length,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      infoCount,
      status: 'completed',
      metadata: scanData.metadata
    };

    // Convert vulnerabilities to records
    const vulnerabilityRecords: VulnerabilityRecord[] = vulnerabilities.map((vuln, index) => {
      // Use enhanced vulnerability type detection if available, otherwise fallback
      let detectedType = 'Security Issue';
      try {
        detectedType = detectVulnerabilityType(vuln);
      } catch (error) {
        // Fallback to original type if detection fails
        detectedType = vuln.type || vuln.check_id || vuln.rule || 'Security Issue';
      }
      
      return {
      id: `vuln_${scanRecord.id}_${index}`,
      scanId: scanRecord.id,
      type: detectedType,
      severity: this.normalizeSeverity(vuln.severity),
      title: vuln.title || vuln.message || vuln.issue_text || 'Security Issue',
      description: vuln.description || vuln.message || vuln.issue_text || '',
      file: vuln.file || vuln.path || vuln.filename || '',
      line: vuln.line || vuln.start?.line || vuln.line_number || undefined,
      column: vuln.column || vuln.start?.col || undefined,
      code: vuln.code || vuln.lines || undefined,
      cwe: Array.isArray(vuln.cwe) ? vuln.cwe.join(',') : vuln.cwe,
      cve: Array.isArray(vuln.cve) ? vuln.cve.join(',') : vuln.cve,
      fix: vuln.fix || vuln.remediation || undefined,
      fixable: vuln.fixable !== undefined ? vuln.fixable : (vuln.fix ? true : false),
      fixComplexity: vuln.fixComplexity || undefined,
      references: Array.isArray(vuln.references) ? vuln.references.join(',') : vuln.references,
      metadata: (() => {
        const m: Record<string, unknown> = { ...(typeof vuln.metadata === 'object' && vuln.metadata ? vuln.metadata : {}) };
        if (vuln.payload) m.payload = vuln.payload;
        if (vuln.curlReplay) m.curlReplay = vuln.curlReplay;
        if (vuln.responseSnippet) m.responseSnippet = vuln.responseSnippet;
        if (vuln.paramName) m.paramName = vuln.paramName;
        if (vuln.evidence) m.evidence = vuln.evidence;
        return Object.keys(m).length ? JSON.stringify(m) : undefined;
      })()
      };
    });

    // Save to database
    const token = await this.database.saveScan(scanRecord, vulnerabilityRecords);
    
    this.logger?.info('Scan saved to database', {
      scanId: scanRecord.id,
      userId: this.currentUserId,
      vulnerabilityCount: vulnerabilities.length
    });

    return scanRecord.id;
  }

  /**
   * Get recent scans for dashboard
   */
  getRecentScans(limit: number = 10): ScanRecord[] {
    if (!this.currentUserId) {
      this.loadCurrentUser();
    }
    return this.database.getScans(this.currentUserId!, limit);
  }

  /**
   * Get scan statistics for dashboard
   */
  getStatistics() {
    if (!this.currentUserId) {
      this.loadCurrentUser();
    }
    return this.database.getScanStatistics(this.currentUserId!);
  }

  /**
   * Get vulnerability analysis
   */
  getVulnerabilityAnalysis(days: number = 30) {
    if (!this.currentUserId) {
      this.loadCurrentUser();
    }
    return this.database.getVulnerabilityAnalysis(this.currentUserId!, days);
  }

  /**
   * Get vulnerabilities for a specific scan
   */
  getVulnerabilities(scanId: string): VulnerabilityRecord[] {
    return this.database.getVulnerabilities(scanId);
  }

  /**
   * Normalize vulnerabilities from different scanner formats
   */
  private normalizeVulnerabilities(vulnerabilities: any[]): any[] {
    return vulnerabilities.map(v => ({
      ...v,
      severity: this.normalizeSeverity(v.severity),
      type: v.type || v.check_id || v.rule || 'Unknown',
      file: v.file || v.path || v.filename || '',
      line: v.line || v.start?.line || v.line_number,
      description: v.description || v.message || v.issue_text || ''
    }));
  }

  /**
   * Normalize severity to lowercase standard format
   */
  private normalizeSeverity(severity: string | undefined): string {
    if (!severity) return 'info';
    
    const normalized = severity.toLowerCase();
    if (['critical', 'error'].includes(normalized)) return 'critical';
    if (['high', 'warning'].includes(normalized)) return 'high';
    if (['medium', 'info'].includes(normalized)) return 'medium';
    if (normalized === 'low') return 'low';
    return 'info';
  }

  /**
   * Update current user
   */
  setUser(user: { id: string; email: string; name: string; provider: string }): void {
    this.currentUserId = user.id;
    
    const userRecord: UserRecord = {
      id: user.id,
      email: user.email,
      name: user.name,
      provider: user.provider,
      createdAt: new Date(),
      lastActiveAt: new Date()
    };
    
    this.database.saveUser(userRecord);
    this.context.globalState.update('ciphermate.userProfile', user);
  }

  /**
   * Close database connection
   */
  close(): void {
    this.database.close();
  }
}
