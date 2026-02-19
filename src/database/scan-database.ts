/**
 * Enterprise-grade SQLite database service for CipherMate
 * Provides secure JWT-wrapped database access for scan storage
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { DiskStorageService } from '../storage/disk-storage-service';

// Use Node.js built-in SQLite3 or better-sqlite3 if available
// Dynamic require to prevent webpack from trying to resolve it at build time
let Database: any = null;

function tryLoadBetterSqlite3(): any {
  try {
    // better-sqlite3 is in webpack externals - direct require works at runtime
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('better-sqlite3');
  } catch {
    return null;
  }
}

// Simple JWT-like token implementation using Node.js crypto
class SimpleJWT {
  private secret: string;

  constructor(secret: string) {
    this.secret = secret;
  }

  sign(payload: any, expiresIn: string = '24h'): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const exp = expiresIn === '24h' ? now + 86400 : now + 3600;
    
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify({ ...payload, exp, iat: now })).toString('base64url');
    
    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');
    
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  verify(token: string): { userId: string } | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      
      const [encodedHeader, encodedPayload, signature] = parts;
      
      // Verify signature
      const expectedSignature = crypto
        .createHmac('sha256', this.secret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest('base64url');
      
      if (signature !== expectedSignature) return null;
      
      // Decode payload
      const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());
      
      // Check expiration
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return null;
      }
      
      return { userId: payload.userId };
    } catch {
      return null;
    }
  }
}

export interface ScanRecord {
  id: string;
  userId: string;
  scanType: string;
  projectName: string;
  workspacePath: string;
  timestamp: Date;
  duration: number;
  totalVulnerabilities: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  status: 'completed' | 'failed' | 'in_progress';
  metadata?: Record<string, any>;
}

export interface VulnerabilityRecord {
  id: string;
  scanId: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  file: string;
  line?: number;
  column?: number;
  code?: string;
  cwe?: string;
  cve?: string;
  fix?: string;
  fixable?: boolean;
  fixComplexity?: string;
  references?: string;
  metadata?: string; // JSON string
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  provider: string;
  createdAt: Date;
  lastActiveAt: Date;
}

export class ScanDatabase {
  private db: any;
  private dbPath: string;
  private jwt: SimpleJWT;
  private context: vscode.ExtensionContext;
  private logger: any;
  private diskStorage: DiskStorageService;

  constructor(context: vscode.ExtensionContext, logger?: any) {
    this.context = context;
    this.logger = logger;
    this.diskStorage = new DiskStorageService(context);
    
    // Initialize database path
    const storagePath = context.globalStorageUri.fsPath;
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }
    
    this.dbPath = path.join(storagePath, 'ciphermate_scans.db');
    
    // Generate or load JWT secret and initialize JWT handler
    const jwtSecret = this.getOrCreateJWTSecret();
    this.jwt = new SimpleJWT(jwtSecret);
    
    // Initialize database
    this.initializeDatabase();
  }

  private getOrCreateJWTSecret(): string {
    const secretKey = 'ciphermate.jwt.secret';
    let secret = this.context.globalState.get<string>(secretKey);
    
    if (!secret) {
      // Generate a secure random secret
      secret = crypto.randomBytes(64).toString('hex');
      this.context.globalState.update(secretKey, secret);
    }
    
    return secret;
  }

  private initializeDatabase(): void {
    try {
      // Try to load better-sqlite3 at runtime if not already loaded
      if (!Database) {
        Database = tryLoadBetterSqlite3();
      }
      
      if (Database) {
        // Use better-sqlite3 if available
        this.db = new Database(this.dbPath);
        this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better concurrency
        this.db.pragma('foreign_keys = ON'); // Enable foreign key constraints
      } else {
        // Fallback: Use file-based storage with encryption
        this.logger?.warn('SQLite3 not available, using encrypted file storage');
        return;
      }

      // Create tables
      this.createTables();
      
      this.logger?.info('Scan database initialized', { path: this.dbPath });
    } catch (error: any) {
      this.logger?.error('Failed to initialize database', error);
      throw error;
    }
  }

  private createTables(): void {
    if (!this.db) return;

    // Users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        lastActiveAt INTEGER NOT NULL
      )
    `);

    // Scans table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scans (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        scanType TEXT NOT NULL,
        projectName TEXT NOT NULL,
        workspacePath TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        totalVulnerabilities INTEGER NOT NULL,
        criticalCount INTEGER NOT NULL DEFAULT 0,
        highCount INTEGER NOT NULL DEFAULT 0,
        mediumCount INTEGER NOT NULL DEFAULT 0,
        lowCount INTEGER NOT NULL DEFAULT 0,
        infoCount INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'completed',
        metadata TEXT,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Vulnerabilities table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vulnerabilities (
        id TEXT PRIMARY KEY,
        scanId TEXT NOT NULL,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        file TEXT NOT NULL,
        line INTEGER,
        column INTEGER,
        code TEXT,
        cwe TEXT,
        cve TEXT,
        fix TEXT,
        fixable INTEGER DEFAULT 0,
        fixComplexity TEXT,
        references TEXT,
        metadata TEXT,
        FOREIGN KEY (scanId) REFERENCES scans(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_scans_userId ON scans(userId);
      CREATE INDEX IF NOT EXISTS idx_scans_timestamp ON scans(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_vulnerabilities_scanId ON vulnerabilities(scanId);
      CREATE INDEX IF NOT EXISTS idx_vulnerabilities_severity ON vulnerabilities(severity);
      CREATE INDEX IF NOT EXISTS idx_vulnerabilities_file ON vulnerabilities(file);
    `);
  }

  /**
   * Generate JWT token for database operations
   */
  private generateToken(userId: string, expiresIn: string = '24h'): string {
    return this.jwt.sign({ userId, timestamp: Date.now() }, expiresIn);
  }

  /**
   * Verify JWT token
   */
  private verifyToken(token: string): { userId: string } | null {
    return this.jwt.verify(token);
  }

  /**
   * Save or update user
   */
  saveUser(user: UserRecord): string {
    if (!this.db) {
      // Fallback to encrypted storage
      return this.saveUserFallback(user);
    }

    const token = this.generateToken(user.id);
    
    const stmt = this.db.prepare(`
      INSERT INTO users (id, email, name, provider, createdAt, lastActiveAt)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        name = excluded.name,
        lastActiveAt = excluded.lastActiveAt
    `);

    stmt.run(
      user.id,
      user.email,
      user.name,
      user.provider,
      user.createdAt.getTime(),
      user.lastActiveAt.getTime()
    );

    return token;
  }

  /**
   * Save scan record
   */
  async saveScan(scan: ScanRecord, vulnerabilities: VulnerabilityRecord[]): Promise<string> {
    if (!this.db) {
      return this.saveScanFallback(scan, vulnerabilities);
    }

    const token = this.generateToken(scan.userId);

    const scanStmt = this.db.prepare(`
      INSERT INTO scans (
        id, userId, scanType, projectName, workspacePath, timestamp,
        duration, totalVulnerabilities, criticalCount, highCount,
        mediumCount, lowCount, infoCount, status, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const vulnStmt = this.db.prepare(`
      INSERT INTO vulnerabilities (
        id, scanId, type, severity, title, description, file, line, column,
        code, cwe, cve, fix, fixable, fixComplexity, references, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((scan: ScanRecord, vulnerabilities: VulnerabilityRecord[]) => {
      scanStmt.run(
        scan.id,
        scan.userId,
        scan.scanType,
        scan.projectName,
        scan.workspacePath,
        scan.timestamp.getTime(),
        scan.duration,
        scan.totalVulnerabilities,
        scan.criticalCount,
        scan.highCount,
        scan.mediumCount,
        scan.lowCount,
        scan.infoCount,
        scan.status,
        scan.metadata ? JSON.stringify(scan.metadata) : null
      );

      for (const vuln of vulnerabilities) {
        vulnStmt.run(
          vuln.id,
          vuln.scanId,
          vuln.type,
          vuln.severity,
          vuln.title,
          vuln.description,
          vuln.file,
          vuln.line || null,
          vuln.column || null,
          vuln.code || null,
          vuln.cwe || null,
          vuln.cve || null,
          vuln.fix || null,
          vuln.fixable ? 1 : 0,
          vuln.fixComplexity || null,
          vuln.references || null,
          vuln.metadata || null
        );
      }
    });

    insertMany(scan, vulnerabilities);

    this.logger?.info('Scan saved to database', { scanId: scan.id, vulnerabilityCount: vulnerabilities.length });
    return token;
  }

  /**
   * Get scans for a user
   */
  getScans(userId: string, limit: number = 50): ScanRecord[] {
    if (!this.db) {
      return this.getScansFallback(userId, limit);
    }

    const stmt = this.db.prepare(`
      SELECT * FROM scans
      WHERE userId = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(userId, limit);
    return rows.map((row: any) => this.rowToScanRecord(row));
  }

  /**
   * Get vulnerabilities for a scan
   */
  getVulnerabilities(scanId: string): VulnerabilityRecord[] {
    if (!this.db) {
      return this.getVulnerabilitiesFallback(scanId);
    }

    const stmt = this.db.prepare(`
      SELECT * FROM vulnerabilities
      WHERE scanId = ?
      ORDER BY 
        CASE severity
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END,
        line ASC
    `);

    const rows = stmt.all(scanId);
    return rows.map((row: any) => this.rowToVulnerabilityRecord(row));
  }

  /**
   * Get scan statistics for dashboard
   */
  getScanStatistics(userId: string): {
    totalScans: number;
    totalVulnerabilities: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    recentScans: ScanRecord[];
  } {
    if (!this.db) {
      return this.getScanStatisticsFallback(userId);
    }

    const statsStmt = this.db.prepare(`
      SELECT 
        COUNT(*) as totalScans,
        SUM(totalVulnerabilities) as totalVulnerabilities,
        SUM(criticalCount) as criticalCount,
        SUM(highCount) as highCount,
        SUM(mediumCount) as mediumCount,
        SUM(lowCount) as lowCount
      FROM scans
      WHERE userId = ?
    `);

    const stats = statsStmt.get(userId);
    const recentScans = this.getScans(userId, 10);

    return {
      totalScans: stats?.totalScans || 0,
      totalVulnerabilities: stats?.totalVulnerabilities || 0,
      criticalCount: stats?.criticalCount || 0,
      highCount: stats?.highCount || 0,
      mediumCount: stats?.mediumCount || 0,
      lowCount: stats?.lowCount || 0,
      recentScans
    };
  }

  /**
   * Get vulnerability analysis for dashboard
   */
  getVulnerabilityAnalysis(userId: string, days: number = 30): {
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
    byFile: Record<string, number>;
    trends: Array<{ date: string; count: number }>;
  } {
    if (!this.db) {
      return this.getVulnerabilityAnalysisFallback(userId, days);
    }

    const cutoffDate = Date.now() - (days * 24 * 60 * 60 * 1000);

    // By severity
    const severityStmt = this.db.prepare(`
      SELECT severity, COUNT(*) as count
      FROM vulnerabilities v
      JOIN scans s ON v.scanId = s.id
      WHERE s.userId = ? AND s.timestamp >= ?
      GROUP BY severity
    `);
    const severityRows = severityStmt.all(userId, cutoffDate);
    const bySeverity: Record<string, number> = {};
    severityRows.forEach((row: any) => {
      bySeverity[row.severity] = row.count;
    });

    // By type
    const typeStmt = this.db.prepare(`
      SELECT type, COUNT(*) as count
      FROM vulnerabilities v
      JOIN scans s ON v.scanId = s.id
      WHERE s.userId = ? AND s.timestamp >= ?
      GROUP BY type
      ORDER BY count DESC
      LIMIT 20
    `);
    const typeRows = typeStmt.all(userId, cutoffDate);
    const byType: Record<string, number> = {};
    typeRows.forEach((row: any) => {
      byType[row.type] = row.count;
    });

    // By file
    const fileStmt = this.db.prepare(`
      SELECT file, COUNT(*) as count
      FROM vulnerabilities v
      JOIN scans s ON v.scanId = s.id
      WHERE s.userId = ? AND s.timestamp >= ?
      GROUP BY file
      ORDER BY count DESC
      LIMIT 20
    `);
    const fileRows = fileStmt.all(userId, cutoffDate);
    const byFile: Record<string, number> = {};
    fileRows.forEach((row: any) => {
      byFile[row.file] = row.count;
    });

    // Trends (daily counts)
    const trendsStmt = this.db.prepare(`
      SELECT 
        DATE(s.timestamp / 1000, 'unixepoch') as date,
        COUNT(v.id) as count
      FROM scans s
      LEFT JOIN vulnerabilities v ON v.scanId = s.id
      WHERE s.userId = ? AND s.timestamp >= ?
      GROUP BY date
      ORDER BY date ASC
    `);
    const trendsRows = trendsStmt.all(userId, cutoffDate);
    const trends = trendsRows.map((row: any) => ({
      date: row.date,
      count: row.count
    }));

    return { bySeverity, byType, byFile, trends };
  }

  // Helper methods for row conversion
  private rowToScanRecord(row: any): ScanRecord {
    return {
      id: row.id,
      userId: row.userId,
      scanType: row.scanType,
      projectName: row.projectName,
      workspacePath: row.workspacePath,
      timestamp: new Date(row.timestamp),
      duration: row.duration,
      totalVulnerabilities: row.totalVulnerabilities,
      criticalCount: row.criticalCount,
      highCount: row.highCount,
      mediumCount: row.mediumCount,
      lowCount: row.lowCount,
      infoCount: row.infoCount,
      status: row.status as 'completed' | 'failed' | 'in_progress',
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }

  private rowToVulnerabilityRecord(row: any): VulnerabilityRecord {
    return {
      id: row.id,
      scanId: row.scanId,
      type: row.type,
      severity: row.severity,
      title: row.title,
      description: row.description,
      file: row.file,
      line: row.line || undefined,
      column: row.column || undefined,
      code: row.code || undefined,
      cwe: row.cwe || undefined,
      cve: row.cve || undefined,
      fix: row.fix || undefined,
      fixable: row.fixable === 1,
      fixComplexity: row.fixComplexity || undefined,
      references: row.references || undefined,
      metadata: row.metadata || undefined
    };
  }

  // Fallback methods for when SQLite is not available
  // These now use disk storage instead of globalState
  private saveUserFallback(user: UserRecord): string {
    const token = this.generateToken(user.id);
    // Store in disk storage
    const users = this.diskStorage.get<UserRecord[]>('ciphermate.db.users', []);
    const index = users.findIndex(u => u.id === user.id);
    if (index >= 0) {
      users[index] = user;
    } else {
      users.push(user);
    }
    this.diskStorage.update('ciphermate.db.users', users);
    return token;
  }

  private async saveScanFallback(scan: ScanRecord, vulnerabilities: VulnerabilityRecord[]): Promise<string> {
    const token = this.generateToken(scan.userId);
    // Store in disk storage
    const scans = this.diskStorage.get<ScanRecord[]>('ciphermate.db.scans', []);
    scans.push(scan);
    this.diskStorage.update('ciphermate.db.scans', scans);
    
    const vulns = this.diskStorage.get<VulnerabilityRecord[]>('ciphermate.db.vulnerabilities', []);
    vulnerabilities.forEach(v => vulns.push(v));
    this.diskStorage.update('ciphermate.db.vulnerabilities', vulns);
    
    return token;
  }

  private getScansFallback(userId: string, limit: number): ScanRecord[] {
    const scans = this.diskStorage.get<ScanRecord[]>('ciphermate.db.scans', []);
    return scans
      .filter(s => s.userId === userId)
      .map(s => ({
        ...s,
        timestamp: s.timestamp instanceof Date ? s.timestamp : new Date(s.timestamp)
      }))
      .sort((a, b) => {
        const aTime = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
        const bTime = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
        return bTime - aTime;
      })
      .slice(0, limit);
  }

  private getVulnerabilitiesFallback(scanId: string): VulnerabilityRecord[] {
    const vulns = this.diskStorage.get<VulnerabilityRecord[]>('ciphermate.db.vulnerabilities', []);
    return vulns.filter(v => v.scanId === scanId);
  }

  private getScanStatisticsFallback(userId: string) {
    const scans = this.getScansFallback(userId, 1000);
    const totalVulnerabilities = scans.reduce((sum, s) => sum + s.totalVulnerabilities, 0);
    const criticalCount = scans.reduce((sum, s) => sum + s.criticalCount, 0);
    const highCount = scans.reduce((sum, s) => sum + s.highCount, 0);
    const mediumCount = scans.reduce((sum, s) => sum + s.mediumCount, 0);
    const lowCount = scans.reduce((sum, s) => sum + s.lowCount, 0);

    return {
      totalScans: scans.length,
      totalVulnerabilities,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      recentScans: scans.slice(0, 10)
    };
  }

  private getVulnerabilityAnalysisFallback(userId: string, days: number) {
    const scans = this.getScansFallback(userId, 1000);
    const cutoffDate = Date.now() - (days * 24 * 60 * 60 * 1000);
    const recentScans = scans.filter(s => {
      const timestamp = s.timestamp instanceof Date ? s.timestamp : new Date(s.timestamp);
      return timestamp.getTime() >= cutoffDate;
    });
    const vulns = this.diskStorage.get<VulnerabilityRecord[]>('ciphermate.db.vulnerabilities', []);
    const recentVulns = vulns.filter(v => {
      const scan = recentScans.find(s => s.id === v.scanId);
      return scan !== undefined;
    });

    const bySeverity: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const byFile: Record<string, number> = {};

    recentVulns.forEach(v => {
      bySeverity[v.severity] = (bySeverity[v.severity] || 0) + 1;
      byType[v.type] = (byType[v.type] || 0) + 1;
      byFile[v.file] = (byFile[v.file] || 0) + 1;
    });

    // Simple trends (group by day)
    const trends: Array<{ date: string; count: number }> = [];
    const dayMap: Record<string, number> = {};
    recentScans.forEach(s => {
      const date = new Date(s.timestamp).toISOString().split('T')[0];
      dayMap[date] = (dayMap[date] || 0) + s.totalVulnerabilities;
    });
    Object.entries(dayMap).forEach(([date, count]) => {
      trends.push({ date, count });
    });
    trends.sort((a, b) => a.date.localeCompare(b.date));

    return { bySeverity, byType, byFile, trends };
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
    }
  }
}
