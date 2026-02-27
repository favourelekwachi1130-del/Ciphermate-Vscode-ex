/**
 * Upload pentest findings to a file host and return a shareable link.
 * Uses 0x0.st with transfer.sh fallback - no API key required.
 */

import * as https from 'https';
import * as vscode from 'vscode';

const UPLOAD_URL_0X0 = 'https://0x0.st';
const UPLOAD_URL_TRANSFER = 'https://transfer.sh';

export interface ExtractedFinding {
  endpoint: string;
  method?: string;
  severity: string;
  type: string;
  title: string;
  description?: string;
  payload?: string;
  curlReplay?: string;
  responseSnippet?: string;
  responseStatus?: number;
  responseHeaders?: string;
  evidence?: string;
  paramName?: string;
  paramLocation?: string;
  cwe?: string;
  cve?: string;
  recommendation?: string;
  [key: string]: unknown;
}

export interface ExtractedScan {
  targetUrl: string;
  scanId: string;
  timestamp: string;
  endpointsTested: number;
  attacksPerformed: number;
  attacksNotConfirmed: number;
  confirmedVulnerabilities: number;
  findings: ExtractedFinding[];
}

function safeParseMeta(m: unknown): Record<string, unknown> {
  if (!m) return {};
  if (typeof m === 'object') return m as Record<string, unknown>;
  try {
    return (typeof m === 'string' ? JSON.parse(m || '{}') : {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function extractMaterialsFromVulns(
  vulns: any[],
  scanMetadata?: { targetUrl?: string; endpointsTested?: number; attacksPerformed?: number; attacksNotConfirmed?: number }
): ExtractedScan {
  const targetUrl = scanMetadata?.targetUrl || 'Unknown';
  const findings: ExtractedFinding[] = vulns.map((v: any) => {
    const meta = safeParseMeta(v.metadata);
    const base: ExtractedFinding = {
      endpoint: v.file || v.path || v.endpoint || targetUrl,
      method: v.method || meta.method as string,
      severity: (v.severity || 'info').toUpperCase(),
      type: v.type || v.vulnerabilityType || v.tool || 'Security Issue',
      title: v.title || v.extra?.message || v.description || 'Finding',
      description: v.description || v.extra?.message,
      payload: v.payload ?? meta.payload,
      curlReplay: v.curlReplay ?? meta.curlReplay,
      responseSnippet: v.responseSnippet ?? meta.responseSnippet,
      responseStatus: v.responseStatus ?? meta.responseStatus,
      responseHeaders: v.responseHeaders ?? meta.responseHeaders as string,
      evidence: v.evidence ?? meta.evidence,
      paramName: v.paramName ?? meta.paramName,
      paramLocation: v.paramLocation ?? meta.paramLocation,
      cwe: v.cwe ?? meta.cwe,
      cve: v.cve ?? meta.cve,
      recommendation: v.recommendation || v.fix,
    };
    const extra: Record<string, unknown> = {};
    for (const k of Object.keys(meta)) {
      if (!(k in base) && meta[k] != null) extra[k] = meta[k];
    }
    return { ...base, ...extra } as ExtractedFinding;
  });
  return {
    targetUrl,
    scanId: '',
    timestamp: new Date().toISOString(),
    endpointsTested: scanMetadata?.endpointsTested ?? 0,
    attacksPerformed: scanMetadata?.attacksPerformed ?? 0,
    attacksNotConfirmed: scanMetadata?.attacksNotConfirmed ?? 0,
    confirmedVulnerabilities: findings.length,
    findings,
  };
}

export function buildFindingsJson(extracted: ExtractedScan, scanId?: string): string {
  const out = { ...extracted, scanId: scanId || extracted.scanId };
  return JSON.stringify(out, null, 2);
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function uploadTo0x0(content: string, filename: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const boundary = '----CipherMate' + Math.random().toString(36).slice(2);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/json\r\n\r\n`, 'utf8'),
      Buffer.from(content, 'utf8'),
      Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
    ]);
    const opts: https.RequestOptions = {
      hostname: '0x0.st',
      port: 443,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        'User-Agent': UA,
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          const link = (data || '').trim();
          resolve(link.startsWith('http') ? link : `https://0x0.st${link.startsWith('/') ? link : '/' + link}`);
        } else {
          reject(new Error(`${res.statusCode} ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function uploadToTransferSh(content: string, filename: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(content, 'utf8');
    const opts: https.RequestOptions = {
      hostname: 'transfer.sh',
      port: 443,
      path: `/${encodeURIComponent(filename)}`,
      method: 'PUT',
      headers: {
        'Content-Length': buf.length,
        'Content-Type': 'application/json',
        'User-Agent': UA,
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve((data || '').trim());
        } else {
          reject(new Error(`${res.statusCode} ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

/**
 * Upload content to file host (0x0.st, with transfer.sh fallback) and return the shareable URL.
 */
export function uploadToFileHost(content: string, filename: string = 'findings.json'): Promise<string> {
  return uploadTo0x0(content, filename).catch(() =>
    uploadToTransferSh(content, filename)
  );
}
