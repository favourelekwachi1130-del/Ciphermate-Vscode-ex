/**
 * Unified types for repository security scanning
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Vulnerability {
  id: string;
  type: string;
  severity: Severity;
  title: string;
  description: string;
  file: string;
  line?: number;
  column?: number;
  code?: string;
  cwe?: string[];
  cve?: string[];
  fix?: string;
  references?: string[];
  metadata?: Record<string, any>;
}

export interface ScanResult {
  scanner: string;
  success: boolean;
  vulnerabilities: Vulnerability[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  duration: number;
  timestamp: Date;
  error?: string;
  metadata?: Record<string, any>;
}

export interface RepositoryScanResult {
  success: boolean;
  results: ScanResult[];
  aggregated: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  duration: number;
  timestamp: Date;
  workspacePath: string;
}

export interface ScannerConfig {
  enabled: boolean;
  options?: Record<string, any>;
}

export interface RepositoryScannerConfig {
  dependency: ScannerConfig;
  secrets: ScannerConfig;
  smartContract: ScannerConfig;
  codePatterns: ScannerConfig;
  ssl: ScannerConfig;
  logAnalysis: ScannerConfig;
}

