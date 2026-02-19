/**
 * Infrastructure as Code (IaC) Scanner
 *
 * Scans Terraform, CloudFormation & Kubernetes for misconfigurations.
 * Replaces Bridgecrew / Wiz Code - built-in rule-based analysis.
 *
 * Supported formats:
 * - Terraform: .tf, .tf.json
 * - CloudFormation: .yaml, .yml, .json (AWS templates)
 * - Kubernetes: .yaml, .yml (manifests)
 */

import * as path from 'path';
import * as fs from 'fs';
import { BaseScanner } from './base-scanner';
import { ScanResult, Vulnerability, Severity } from './types';

interface IacRule {
  id: string;
  name: string;
  severity: Severity;
  description: string;
  cwe?: string[];
  fix?: string;
  fixable?: boolean;
  fixComplexity?: 'simple' | 'moderate' | 'complex';
  /** Terraform: resource type + attribute pattern */
  terraform?: { resource?: string; pattern: RegExp; linePattern?: RegExp };
  /** YAML/JSON: JSONPath-like or regex on content */
  yamlPattern?: RegExp;
}

/** Check for inline suppression: # ciphermate:ignore IAC-XXX or // ciphermate:ignore IAC-XXX */
function isSuppressed(content: string, matchIndex: number, ruleId: string): boolean {
  const before = content.substring(0, matchIndex);
  const lines = before.split('\n');
  const IGNORE_RE = new RegExp(`ciphermate:ignore\\s+(?:${ruleId}|\\*)\\b`, 'i');
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 10); i--) {
    const line = lines[i];
    if (IGNORE_RE.test(line)) return true;
  }
  return false;
}

const IAC_RULES: IacRule[] = [
  // Terraform - S3
  {
    id: 'IAC-TF-001',
    name: 'S3 bucket allows public access',
    severity: 'high',
    description: 'S3 bucket may be publicly accessible. Ensure block_public_acls and similar are set.',
    cwe: ['CWE-284', 'CWE-200'],
    fix: 'Set block_public_acls = true, block_public_policy = true on aws_s3_bucket_public_access_block',
    terraform: { resource: 'aws_s3_bucket', pattern: /resource\s+["']aws_s3_bucket["']\s+[^{]+\{/ },
    yamlPattern: /AWS::S3::Bucket|PublicRead|PublicReadWrite|acl.*public/i,
  },
  {
    id: 'IAC-TF-002',
    name: 'S3 bucket encryption disabled',
    severity: 'high',
    description: 'S3 bucket does not enforce server-side encryption.',
    cwe: ['CWE-311'],
    fix: 'Add server_side_encryption_configuration to aws_s3_bucket',
    terraform: { pattern: /aws_s3_bucket.*\n(?:(?!server_side_encryption)[\s\S])*?\{/ },
    yamlPattern: /BucketEncryption|ServerSideEncryptionByDefault/i,
  },
  // Terraform - Security Group
  {
    id: 'IAC-TF-003',
    name: 'Security group allows 0.0.0.0/0 ingress',
    severity: 'high',
    description: 'Security group opens ingress to the entire internet (0.0.0.0/0).',
    cwe: ['CWE-284'],
    fix: 'Restrict cidr_blocks to specific IP ranges or VPC CIDR',
    fixable: true,
    fixComplexity: 'moderate',
    terraform: { pattern: /cidr_blocks\s*=\s*\[?\s*["']0\.0\.0\.0\/0["']\s*\]?/i },
  },
  // Terraform - IAM
  {
    id: 'IAC-TF-004',
    name: 'IAM policy allows "*" action',
    severity: 'high',
    description: 'IAM policy grants unrestricted action (*). Apply least privilege.',
    cwe: ['CWE-284'],
    fix: 'Replace "*" with specific allowed actions',
    terraform: { pattern: /["']Action["']\s*:\s*\[?\s*["']\*["']/ },
    yamlPattern: /["']Action["']\s*:\s*\[?\s*["']\*["']/,
  },
  // Terraform - RDS / Encryption
  {
    id: 'IAC-TF-005',
    name: 'RDS instance storage not encrypted',
    severity: 'high',
    description: 'RDS database storage is not encrypted at rest.',
    cwe: ['CWE-311'],
    fix: 'Set storage_encrypted = true on aws_db_instance',
    terraform: { pattern: /resource\s+["']aws_db_instance["'][^}]+(?!storage_encrypted)[\s\S]*?\{/ },
  },
  {
    id: 'IAC-TF-006',
    name: 'EC2/EBS volume unencrypted',
    severity: 'medium',
    description: 'EBS volume does not have encryption enabled.',
    cwe: ['CWE-311'],
    fix: 'Set encrypted = true on aws_ebs_volume',
    terraform: { pattern: /aws_ebs_volume[^}]+(?!encrypted\s*=\s*true)[\s\S]*?\{/ },
  },
  // Kubernetes
  {
    id: 'IAC-K8S-001',
    name: 'Privileged container',
    severity: 'high',
    description: 'Container runs with privileged: true, granting host-level access.',
    cwe: ['CWE-250'],
    fix: 'Remove privileged: true or use securityContext with minimal privileges',
    fixable: true,
    fixComplexity: 'simple',
    yamlPattern: /privileged\s*:\s*true/i,
  },
  {
    id: 'IAC-K8S-002',
    name: 'Container runs as root',
    severity: 'high',
    description: 'Container runs as root (runAsUser: 0). Use non-root user.',
    cwe: ['CWE-250'],
    fix: 'Set runAsUser to non-zero and runAsNonRoot: true',
    fixable: true,
    fixComplexity: 'simple',
    yamlPattern: /runAsUser\s*:\s*0|runAsRoot\s*:\s*true/i,
  },
  {
    id: 'IAC-K8S-003',
    name: 'hostNetwork or hostPID enabled',
    severity: 'high',
    description: 'Pod shares host network/PID namespace. Avoid in production.',
    cwe: ['CWE-276'],
    fix: 'Set hostNetwork: false and hostPID: false',
    fixable: true,
    fixComplexity: 'simple',
    yamlPattern: /hostNetwork\s*:\s*true|hostPID\s*:\s*true|hostIPC\s*:\s*true/i,
  },
  {
    id: 'IAC-K8S-005',
    name: 'Default service account',
    severity: 'medium',
    description: 'Pod may run with default service account. Use dedicated limited account.',
    cwe: ['CWE-284'],
    fix: 'Create a dedicated ServiceAccount with minimal RBAC',
    yamlPattern: /(?:serviceAccountName|serviceAccount)\s*:\s*["']?default["']?/i,
  },
  {
    id: 'IAC-K8S-006',
    name: 'Root filesystem explicitly writable',
    severity: 'medium',
    description: 'readOnlyRootFilesystem: false allows container root to be written.',
    cwe: ['CWE-732'],
    fix: 'Set readOnlyRootFilesystem: true in securityContext',
    fixable: true,
    fixComplexity: 'simple',
    yamlPattern: /readOnlyRootFilesystem\s*:\s*false/i,
  },
  {
    id: 'IAC-K8S-007',
    name: 'allowPrivilegeEscalation enabled',
    severity: 'high',
    description: 'Container can escalate privileges. Disable for least privilege.',
    cwe: ['CWE-250'],
    fix: 'Set allowPrivilegeEscalation: false in securityContext',
    fixable: true,
    fixComplexity: 'simple',
    yamlPattern: /allowPrivilegeEscalation\s*:\s*true/i,
  },
  {
    id: 'IAC-TF-007',
    name: 'Security group allows 0.0.0.0/0 egress',
    severity: 'medium',
    description: 'Security group opens egress to the entire internet.',
    cwe: ['CWE-284'],
    fix: 'Restrict egress cidr_blocks to required destinations',
    fixable: true,
    fixComplexity: 'moderate',
    terraform: { pattern: /egress[\s\S]*?cidr_blocks\s*=\s*\[?\s*["']0\.0\.0\.0\/0["']\s*\]?/is },
  },
  // CloudFormation
  {
    id: 'IAC-CFN-001',
    name: 'CloudFormation resource without deletion policy',
    severity: 'low',
    description: 'Critical resources (RDS, etc.) should have DeletionPolicy to prevent accidental data loss.',
    yamlPattern: /AWS::RDS::DBInstance|AWS::DynamoDB::Table/,
  },
];

function findFilesByExt(dir: string, exts: string[]): string[] {
  const results: string[] = [];
  function walk(d: string): void {
    try {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) {
          if (!e.name.startsWith('.') && e.name !== 'node_modules') walk(full);
        } else if (e.isFile()) {
          const ext = path.extname(e.name).toLowerCase();
          const lower = e.name.toLowerCase();
          if (exts.includes(ext) || (lower.endsWith('.tf.json') && exts.includes('.json'))) {
            results.push(full);
          }
        }
      }
    } catch (_) {}
  }
  walk(dir);
  return results;
}

function findFilesByGlob(dir: string, patterns: string[]): string[] {
  const exts: string[] = [];
  if (patterns.some(p => p.includes('tf'))) exts.push('.tf');
  if (patterns.some(p => p.includes('tf.json'))) exts.push('.json');
  if (patterns.some(p => p.includes('yaml') || p.includes('yml'))) {
    exts.push('.yaml', '.yml');
  }
  if (patterns.some(p => p === '*.json')) exts.push('.json');
  const all = findFilesByExt(dir, [...new Set(exts)]);
  if (patterns.includes('*.json') && !patterns.some(p => p.includes('tf'))) {
    return all.filter(p => p.endsWith('.json'));
  }
  return all;
}

function getFileType(filePath: string): 'terraform' | 'cloudformation' | 'kubernetes' {
  const name = path.basename(filePath).toLowerCase();
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.tf' || filePath.endsWith('.tf.json')) return 'terraform';
  if (
    /template|cloudformation|cfn|stack/i.test(name) ||
    (ext === '.json' && fs.readFileSync(filePath, 'utf8').includes('AWS::'))
  ) {
    return 'cloudformation';
  }
  if ([ '.yaml', '.yml' ].includes(ext)) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (/kind:\s*(Deployment|Pod|Service|ConfigMap|Secret|StatefulSet|DaemonSet|CronJob|Job)/.test(content)) return 'kubernetes';
    if (/AWS::|AWSTemplateFormatVersion/.test(content)) return 'cloudformation';
    if (/apiVersion:\s*(v1|apps\/v1|batch\/v1)/.test(content)) return 'kubernetes';
  }
  return 'terraform'; // fallback for .tf
}

export class IacScanner extends BaseScanner {
  getName(): string {
    return 'iac-scanner';
  }

  getDescription(): string {
    return 'Scans Terraform, CloudFormation & Kubernetes for misconfigurations (replaces Bridgecrew/Wiz)';
  }

  async isAvailable(): Promise<boolean> {
    const enabled = this.config.get<boolean>('scanners.enableIac', true);
    if (!enabled) return false;
    const tf = findFilesByGlob(this.workspacePath, ['*.tf', '*.tf.json']);
    const yaml = findFilesByGlob(this.workspacePath, ['*.yaml', '*.yml']);
    return tf.length > 0 || yaml.length > 0;
  }

  async scan(): Promise<ScanResult> {
    const startTime = Date.now();
    const vulnerabilities: Vulnerability[] = [];

    const tfFiles = findFilesByGlob(this.workspacePath, ['*.tf', '*.tf.json']);
    const yamlFiles = findFilesByGlob(this.workspacePath, ['*.yaml', '*.yml']);
    const jsonFiles = findFilesByExt(this.workspacePath, ['.json']).filter(p => {
      try {
        return p.endsWith('.tf.json') || fs.readFileSync(p, 'utf8').includes('AWS::');
      } catch {
        return false;
      }
    });

    const allFiles = [...new Set([...tfFiles, ...yamlFiles, ...jsonFiles])];
    const seen = new Set<string>();
    for (const f of allFiles) {
      if (seen.has(f)) continue;
      seen.add(f);
      const rel = path.relative(this.workspacePath, f);
      const content = fs.readFileSync(f, 'utf8');
      const fileType = getFileType(f);

      for (const rule of IAC_RULES) {
        let matched = false;
        let lineNum = 1;
        let matchIndex = -1;

        if (fileType === 'terraform' && rule.terraform) {
          const m = content.match(rule.terraform.pattern);
          if (m && m.index !== undefined) {
            matched = true;
            lineNum = content.substring(0, m.index).split('\n').length;
            matchIndex = m.index;
          }
        }
        if (!matched && (fileType === 'cloudformation' || fileType === 'kubernetes') && rule.yamlPattern) {
          const m = content.match(rule.yamlPattern);
          if (m && m.index !== undefined) {
            matched = true;
            lineNum = content.substring(0, m.index).split('\n').length;
            matchIndex = m.index;
          }
        }
        if (!matched && fileType === 'terraform' && rule.yamlPattern) {
          const m = content.match(rule.yamlPattern);
          if (m && m.index !== undefined) {
            matched = true;
            lineNum = content.substring(0, m.index).split('\n').length;
            matchIndex = m.index;
          }
        }

        if (matched && matchIndex >= 0 && !isSuppressed(content, matchIndex, rule.id)) {
          vulnerabilities.push({
            id: this.generateVulnId(rule.id, rel, lineNum),
            type: rule.id,
            severity: rule.severity,
            title: rule.name,
            description: rule.description,
            file: rel,
            line: lineNum,
            cwe: rule.cwe,
            fix: rule.fix,
            fixable: rule.fixable,
            fixComplexity: rule.fixComplexity,
            metadata: { iacType: fileType, ruleId: rule.id },
          });
        }
      }
    }

    return {
      scanner: this.getName(),
      success: true,
      vulnerabilities,
      summary: this.calculateSummary(vulnerabilities),
      duration: Date.now() - startTime,
      timestamp: new Date(),
      metadata: {
        terraformFiles: tfFiles.length,
        yamlFiles: yamlFiles.length,
        cloudFormationFiles: jsonFiles.length,
      },
    };
  }
}
