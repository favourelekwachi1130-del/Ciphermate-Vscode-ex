/**
 * Optional integration with open-source pentest tools (nuclei, ffuf).
 * When available in PATH, run them against the target and merge findings.
 * No time limits - runs as long as the tool takes.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DastAttackResult } from './types';

const execFileAsync = promisify(execFile);

const SEVERITY_MAP: Record<string, string> = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
  info: 'info',
  unknown: 'info',
};

interface NucleiJsonLine {
  template?: string;
  'template-id'?: string;
  'template-url'?: string;
  info?: {
    name?: string;
    author?: string | string[];
    severity?: string;
    description?: string;
  };
  type?: string;
  host?: string;
  'matched-at'?: string;
  'curl-command'?: string;
  [key: string]: unknown;
}

function mapSeverity(s: string): string {
  const lower = (s || 'info').toLowerCase();
  return SEVERITY_MAP[lower] || 'info';
}

/** Check if a binary is in PATH */
export async function hasBinary(name: string): Promise<boolean> {
  try {
    await execFileAsync(name, ['-version'], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/** Run nuclei against target. Returns findings or empty array on failure. No time limit. */
export async function runNuclei(
  targetUrl: string,
  options?: { severity?: string[]; timeout?: number }
): Promise<DastAttackResult[]> {
  const timeout = options?.timeout ?? 0; // 0 = no limit
  const args = [
    '-u', targetUrl,
    '-jsonl',
    '-silent',
    '-nc',
    '-severity', (options?.severity ?? ['critical', 'high', 'medium']).join(','),
    '-rate-limit', '80',
    '-concurrency', '50',
    '-timeout', '30',
  ];

  const tmpDir = os.tmpdir();
  const outFile = path.join(tmpDir, `ciphermate-nuclei-${Date.now()}.jsonl`);
  args.push('-jsonl-export', outFile);

  try {
    const opts: { timeout?: number } = {};
    if (timeout > 0) opts.timeout = timeout * 1000;
    await execFileAsync('nuclei', args, opts);
  } catch (e: unknown) {
    const code = (e as { code?: number })?.code;
    if (code === 1 && fs.existsSync(outFile)) {
      // Nuclei exits 1 when findings are found - that's success for us
    } else {
      try { fs.unlinkSync(outFile); } catch { /* ignore */ }
      return [];
    }
  }

  const results: DastAttackResult[] = [];
  if (!fs.existsSync(outFile)) return results;

  try {
    const content = fs.readFileSync(outFile, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed) as NucleiJsonLine;
        const info = obj.info || {};
        const severity = mapSeverity(info.severity || 'info');
        const title = (info.name as string) || obj['template-id'] || 'Nuclei finding';
        const endpoint = obj['matched-at'] || obj.host || targetUrl;
        results.push({
          type: 'nuclei',
          severity: severity as 'critical' | 'high' | 'medium' | 'low' | 'info',
          title,
          description: (info.description as string) || title,
          endpoint,
          method: 'GET',
          payload: obj['template-id'] || '',
          evidence: obj['curl-command'] ?? undefined,
          curlReplay: obj['curl-command'] ?? undefined,
          metadata: {
            tool: 'nuclei',
            template: obj.template,
            'template-id': obj['template-id'],
          },
        });
      } catch {
        /* skip malformed line */
      }
    }
  } finally {
    try { fs.unlinkSync(outFile); } catch { /* ignore */ }
  }
  return results;
}

/** Run ffuf for directory discovery. Returns discovered paths. Uses -o file -of json. */
export async function runFfufDiscovery(
  targetUrl: string,
  options?: { wordlist?: string; timeout?: number }
): Promise<string[]> {
  const timeout = options?.timeout ?? 0;
  const base = targetUrl.replace(/\/$/, '') + '/';
  const tmp = path.join(os.tmpdir(), `ciphermate-ffuf-${Date.now()}.txt`);
  const tmpOut = path.join(os.tmpdir(), `ciphermate-ffuf-out-${Date.now()}.json`);
  const wordlistPath = options?.wordlist && fs.existsSync(options.wordlist)
    ? options.wordlist
    : tmp;

  if (wordlistPath === tmp) {
    const common = ['admin', 'api', 'login', 'dashboard', 'config', 'backup', 'wp-admin', '.git', 'debug', 'status'];
    fs.writeFileSync(tmp, common.join('\n'), 'utf8');
  }

  try {
    const opts: { timeout?: number } = {};
    if (timeout > 0) opts.timeout = timeout * 1000;
    await execFileAsync(
      'ffuf',
      ['-u', `${base}FUZZ`, '-w', wordlistPath, '-mc', '200,301,302,403', '-o', tmpOut, '-of', 'json', '-s'],
      opts
    );
    if (!fs.existsSync(tmpOut)) return [];
    const raw = fs.readFileSync(tmpOut, 'utf8');
    const data = JSON.parse(raw) as { results?: Array<{ url?: string; input?: { FUZZ?: string } }> };
    const results: string[] = [];
    for (const r of data.results || []) {
      const p = r.url || r.input?.FUZZ;
      if (p) results.push(base + p);
    }
    return results;
  } catch {
    return [];
  } finally {
    try { fs.unlinkSync(tmpOut); } catch { /* ignore */ }
    if (wordlistPath === tmp) try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}
