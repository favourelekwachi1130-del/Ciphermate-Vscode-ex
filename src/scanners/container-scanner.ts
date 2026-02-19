/**
 * Container Image Scanner
 *
 * Scans container images for OS package vulnerabilities.
 * Replaces Snyk Container / Docker Scout.
 *
 * - Dockerfile analysis: unpinned base images, bad practices
 * - Optional Trivy: when `trivy` is in PATH, runs trivy image/config for real CVE data
 */

import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseScanner } from './base-scanner';
import { ScanResult, Vulnerability, Severity } from './types';

const execAsync = promisify(exec);

const CONTAINER_FILE_NAMES = ['Dockerfile', 'Containerfile', 'docker-compose.yml', 'docker-compose.yaml'];
const DOCKERFILE_EXT = /\.dockerfile$/i;

interface ContainerRule {
  id: string;
  name: string;
  severity: Severity;
  description: string;
  cwe?: string[];
  fix?: string;
  pattern: RegExp;
}

const DOCKERFILE_RULES: ContainerRule[] = [
  {
    id: 'CONT-001',
    name: 'Unpinned base image (latest tag)',
    severity: 'high',
    description: 'Using :latest tag leads to non-reproducible builds and potential supply chain issues.',
    cwe: ['CWE-1329'],
    fix: 'Pin to a specific digest or version tag, e.g. FROM alpine:3.19.0',
    pattern: /FROM\s+[\w./-]+:(?:latest|stable|LTS)\b/i,
  },
  // CONT-003 is checked separately (no USER in file)
  {
    id: 'CONT-004',
    name: 'Insecure package fetch (curl | sh)',
    severity: 'high',
    description: 'Piping curl/wget to shell executes untrusted code.',
    cwe: ['CWE-494'],
    fix: 'Download to file, verify checksum, then execute',
    pattern: /RUN\s+.*(?:curl|wget)\s+[^|]*\s*\|\s*(?:sh|bash)/i,
  },
  {
    id: 'CONT-005',
    name: 'apt-get without --no-install-recommends',
    severity: 'low',
    description: 'Installing recommended packages increases image size and attack surface.',
    fix: 'Use apt-get install -y --no-install-recommends',
    pattern: /RUN\s+.*apt-get\s+install(?![^;]*--no-install-recommends)/i,
  },
  {
    id: 'CONT-006',
    name: 'Sensitive file in image',
    severity: 'medium',
    description: 'Copying .env or secrets into image exposes them in the final image.',
    cwe: ['CWE-522'],
    fix: 'Use runtime secrets or build args; add sensitive files to .dockerignore',
    pattern: /COPY\s+.*\.(?:env|pem|key|secret|crt)\b/i,
  },
  {
    id: 'CONT-007',
    name: 'ADD from remote URL',
    severity: 'high',
    description: 'ADD downloads from URLs; use COPY + RUN curl/wget for better control and checksums.',
    cwe: ['CWE-494'],
    fix: 'Use COPY for local files; use RUN curl/wget with checksum verification for remotes',
    pattern: /^\s*ADD\s+https?:\/\//im,
  },
  {
    id: 'CONT-008',
    name: 'Potential secret in ARG',
    severity: 'high',
    description: 'ARG can expose secrets in image layers. Use RUN --mount=type=secret for build secrets.',
    cwe: ['CWE-798'],
    fix: 'Use Docker BuildKit: RUN --mount=type=secret,id=key',
    pattern: /ARG\s+(?:API_KEY|SECRET|PASSWORD|TOKEN|CREDENTIAL)\s*=/i,
  },
  {
    id: 'CONT-009',
    name: 'sudo in RUN (indicates root)',
    severity: 'medium',
    description: 'Using sudo suggests container runs as root. Run as non-root user instead.',
    cwe: ['CWE-250'],
    fix: 'Add USER directive and remove sudo',
    pattern: /RUN\s+.*\bsudo\b/i,
  },
];

function findContainerFiles(dir: string): string[] {
  const results: string[] = [];
  function walk(d: string): void {
    try {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) {
          if (!e.name.startsWith('.') && e.name !== 'node_modules') walk(full);
        } else if (e.isFile()) {
          const lower = e.name.toLowerCase();
          if (CONTAINER_FILE_NAMES.some(n => lower === n.toLowerCase()) || DOCKERFILE_EXT.test(e.name)) {
            results.push(full);
          }
        }
      }
    } catch (_) {}
  }
  walk(dir);
  return results;
}

function extractBaseImages(content: string): string[] {
  const images: string[] = [];
  const fromRe = /FROM\s+(?:--platform=\S+\s+)?([^\s#]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(content)) !== null) {
    const img = m[1].trim();
    if (img && !img.startsWith('${') && !images.includes(img)) images.push(img);
  }
  return images;
}

function parseDockerCompose(content: string, fileRel: string): Vulnerability[] {
  const vulns: Vulnerability[] = [];
  const lines = content.split('\n');

  const imageRe = /^\s*image:\s*(.+)$/i;
  const privilegedRe = /^\s*privileged:\s*true/i;
  const capAddRe = /^\s*cap_add:/i;

  let inService = false;
  let serviceIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;

    // Detect service block (top-level key under services:)
    if (/^\w+:\s*$/.test(trimmed) && indent <= 2) {
      inService = indent > 0;
      serviceIndent = indent;
    }

    if (inService || indent > 1) {
      const imgM = line.match(imageRe);
      if (imgM) {
        const img = imgM[1].trim().replace(/^['"]|['"]$/g, '');
        if (img && !img.startsWith('${')) {
          if (/:latest\b/i.test(img) || (!img.includes(':') && !img.includes('@'))) {
            vulns.push({
              id: `compose-latest-${fileRel}-${i}-${Date.now()}`,
              type: 'CONT-001',
              severity: 'high',
              title: 'Unpinned image in docker-compose',
              description: `Service uses unpinned image "${img}". Pin to a specific digest or version.`,
              file: fileRel,
              line: i + 1,
              cwe: ['CWE-1329'],
              fix: 'Pin image to a specific digest (e.g. image@sha256:...) or version tag',
              metadata: { scanner: 'container-compose' },
            });
          }
        }
      }

      if (privilegedRe.test(line)) {
        vulns.push({
          id: `compose-privileged-${fileRel}-${i}-${Date.now()}`,
          type: 'CONT-011',
          severity: 'high',
          title: 'Privileged container',
          description: 'privileged: true disables security restrictions. Use specific capabilities instead.',
          file: fileRel,
          line: i + 1,
          fix: 'Avoid privileged; use cap_add for specific capabilities only if needed',
          metadata: { scanner: 'container-compose' },
        });
      }

      if (capAddRe.test(line)) {
        const restOfBlock = lines.slice(i, Math.min(i + 6, lines.length)).join('\n');
        if (/\b(?:ALL|SYS_ADMIN|NET_ADMIN|CAP_SYS_RAWIO)\b/i.test(restOfBlock)) {
          vulns.push({
            id: `compose-cap-${fileRel}-${i}-${Date.now()}`,
            type: 'CONT-012',
            severity: 'medium',
            title: 'Broad capability added',
            description: 'cap_add includes sensitive capabilities. Prefer minimal privileges.',
            file: fileRel,
            line: i + 1,
            fix: 'Only add capabilities strictly required; avoid SYS_ADMIN, NET_ADMIN, etc.',
            metadata: { scanner: 'container-compose' },
          });
        }
      }
    }
  }
  return vulns;
}

function parseTrivyImageJson(stdout: string, fileRel: string): Vulnerability[] {
  const vulns: Vulnerability[] = [];
  try {
    const data = JSON.parse(stdout);
    const results = data.Results || [];
    for (const r of results) {
      const target = r.Target || '';
      const vulnList = r.Vulnerabilities || [];
      for (const v of vulnList) {
        const sev = (v.Severity || 'UNKNOWN').toLowerCase();
        const severity: Severity = sev === 'critical' ? 'critical' : sev === 'high' ? 'high' : sev === 'medium' ? 'medium' : sev === 'low' ? 'low' : 'info';
        vulns.push({
          id: `trivy-${v.VulnerabilityID || v.PkgName}-${Date.now()}`,
          type: 'container-cve',
          severity,
          title: `${v.VulnerabilityID || 'CVE'} in ${v.PkgName || target}`,
          description: v.Description || v.Title || `Vulnerability in ${v.PkgName}`,
          file: fileRel,
          line: 1,
          cwe: v.CweID ? [v.CweID] : undefined,
          cve: v.VulnerabilityID ? [v.VulnerabilityID] : undefined,
          fix: v.FixedVersion ? `Upgrade to ${v.FixedVersion}` : undefined,
          metadata: {
            pkgName: v.PkgName,
            installedVersion: v.InstalledVersion,
            fixedVersion: v.FixedVersion,
            target,
            scanner: 'trivy',
          },
        });
      }
    }
  } catch (_) {}
  return vulns;
}

const DEFAULT_TRIVY_TIMEOUT_MS = 120000; // 2 minutes
const DEFAULT_TRIVY_RETRIES = 2;
const MAX_IMAGES_TO_SCAN = 3;

async function runTrivyImage(
  image: string,
  timeoutMs: number,
  retries: number
): Promise<string | null> {
  const cmd = `trivy image --format json --scanners vuln --quiet ${image}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { stdout } = await execAsync(cmd, {
        timeout: Math.ceil(timeoutMs / 1000),
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, TRIVY_TIMEOUT: String(Math.ceil(timeoutMs / 1000)) },
      });
      return stdout;
    } catch {
      if (attempt === retries) return null;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  return null;
}

async function runTrivyConfig(filePath: string, timeoutMs: number): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`trivy config --format json --quiet "${filePath}"`, {
      timeout: Math.ceil(timeoutMs / 1000),
      maxBuffer: 5 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return null;
  }
}

function parseTrivyConfigJson(stdout: string, fileRel: string): Vulnerability[] {
  const vulns: Vulnerability[] = [];
  try {
    const data = JSON.parse(stdout);
    const results = data.Results || [];
    for (const r of results) {
      const target = r.Target || '';
      const list = r.Misconfigurations || [];
      for (const m of list) {
        const sev = (m.Severity || 'UNKNOWN').toLowerCase();
        const severity: Severity =
          sev === 'critical' ? 'critical' : sev === 'high' ? 'high' : sev === 'medium' ? 'medium' : sev === 'low' ? 'low' : 'info';
        vulns.push({
          id: `trivy-config-${m.ID || 'cfg'}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          type: 'container-misconfig',
          severity,
          title: m.Title || m.ID || 'Trivy misconfiguration',
          description: m.Message || m.Description || '',
          file: fileRel,
          line: m.PrimaryCode?.StartLine ?? 1,
          fix: m.Resolution,
          metadata: { scanner: 'trivy-config', id: m.ID, target },
        });
      }
    }
  } catch (_) {}
  return vulns;
}

export class ContainerScanner extends BaseScanner {
  getName(): string {
    return 'container-scanner';
  }

  getDescription(): string {
    return 'Scans container images for OS package vulnerabilities (replaces Snyk/Docker Scout)';
  }

  async isAvailable(): Promise<boolean> {
    const enabled = this.config.get<boolean>('scanners.enableContainer', true);
    if (!enabled) return false;
    const files = findContainerFiles(this.workspacePath);
    return files.length > 0;
  }

  async scan(): Promise<ScanResult> {
    const startTime = Date.now();
    const vulnerabilities: Vulnerability[] = [];
    const useTrivy = this.config.get<boolean>('scanners.container.useTrivy', true);
    const trivyTimeoutMs = this.config.get<number>('scanners.container.trivyTimeoutMs', DEFAULT_TRIVY_TIMEOUT_MS);
    const trivyRetries = this.config.get<number>('scanners.container.trivyRetries', DEFAULT_TRIVY_RETRIES);
    const useTrivyConfig = this.config.get<boolean>('scanners.container.useTrivyConfig', true);

    const files = findContainerFiles(this.workspacePath);
    let trivyAvailable = false;
    if (useTrivy) {
      try {
        await execAsync('trivy --version');
        trivyAvailable = true;
      } catch {
        /* Trivy not installed */
      }
    }

    for (const f of files) {
      const rel = path.relative(this.workspacePath, f);
      const content = fs.readFileSync(f, 'utf8');

      // Skip docker-compose for Dockerfile rules (only FROM/COPY/RUN apply)
      const isDockerfile = !/docker-compose/i.test(path.basename(f));
      if (isDockerfile) {
        // CONT-003: No USER directive - container runs as root
        if (/FROM\s+/i.test(content) && /(?:RUN|ENTRYPOINT|CMD)\s+/i.test(content) && !/^\s*USER\s+/mi.test(content)) {
          const firstRun = content.search(/(?:RUN|ENTRYPOINT|CMD)\s+/i);
          const lineNum = firstRun >= 0 ? content.substring(0, firstRun).split('\n').length : 1;
          vulnerabilities.push({
            id: this.generateVulnId('CONT-003', rel, lineNum),
            type: 'CONT-003',
            severity: 'high',
            title: 'Container may run as root',
            description: 'Dockerfile has no USER directive. Containers run as root by default.',
            file: rel,
            line: lineNum,
            cwe: ['CWE-250'],
            fix: 'Add USER directive to run as non-root (e.g. USER nobody or USER 1000)',
            metadata: { scanner: 'container-dockerfile' },
          });
        }

        // CONT-010: No HEALTHCHECK
        if (/FROM\s+/i.test(content) && !/^\s*HEALTHCHECK\s+/mi.test(content)) {
          const lastFrom = content.lastIndexOf('FROM');
          const lineNum = lastFrom >= 0 ? content.substring(0, lastFrom).split('\n').length + 1 : 1;
          vulnerabilities.push({
            id: this.generateVulnId('CONT-010', rel, lineNum),
            type: 'CONT-010',
            severity: 'low',
            title: 'No HEALTHCHECK directive',
            description: 'Container has no HEALTHCHECK. Orchestrators cannot detect unhealthy containers.',
            file: rel,
            line: lineNum,
            fix: 'Add HEALTHCHECK CMD to your Dockerfile',
            metadata: { scanner: 'container-dockerfile' },
          });
        }

        for (const rule of DOCKERFILE_RULES) {
          const m = content.match(rule.pattern);
          if (m && m.index !== undefined) {
            const lineNum = content.substring(0, m.index).split('\n').length;
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
              metadata: { scanner: 'container-dockerfile' },
            });
          }
        }

        // Trivy config: scan Dockerfile for misconfig (no image pull, fast)
        if (trivyAvailable && useTrivyConfig) {
          const configOut = await runTrivyConfig(f, trivyTimeoutMs);
          if (configOut) {
            const configVulns = parseTrivyConfigJson(configOut, rel);
            vulnerabilities.push(...configVulns);
          }
        }

        // Trivy image: scan base images for OS package CVEs
        if (trivyAvailable) {
          const images = extractBaseImages(content);
          for (const img of images.slice(0, MAX_IMAGES_TO_SCAN)) {
            const tag = img.includes(':') ? img : `${img}:latest`;
            const out = await runTrivyImage(tag, trivyTimeoutMs, trivyRetries);
            if (out) {
              const trivyVulns = parseTrivyImageJson(out, rel);
              vulnerabilities.push(...trivyVulns);
            }
          }
        }
      } else {
        // docker-compose: extract images, privileged, cap_add
        const composeVulns = parseDockerCompose(content, rel);
        vulnerabilities.push(...composeVulns);
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
        filesScanned: files.length,
        trivyUsed: trivyAvailable,
      },
    };
  }
}
