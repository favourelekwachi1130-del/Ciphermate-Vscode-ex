/**
 * DAST Report Generator - SARIF, curl replay, executive summary
 */

import { DastScanResult, DastAttackResult } from './types';
import { toCurl } from './http-client';

/** Generate SARIF 2.1.0 format for GitHub Security, DefectDojo, etc. */
export function toSarif(result: DastScanResult): object {
  const ruleIds = Array.from(new Set(result.vulnerabilities.map(v => v.type.replace(/[^a-zA-Z0-9]/g, '_'))));
  const rules = ruleIds.map(type => {
    const v = result.vulnerabilities.find(x => x.type.replace(/[^a-zA-Z0-9]/g, '_') === type);
    return {
      id: type,
      name: type,
      shortDescription: { text: v?.title || type },
      fullDescription: { text: v?.recommendation || '' },
    };
  });
  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'CipherMate DAST',
          version: '2.0',
          rules,
        },
      },
      results: result.vulnerabilities.map((v) => ({
        ruleId: v.type.replace(/[^a-zA-Z0-9]/g, '_'),
        level: v.severity === 'critical' || v.severity === 'high' ? 'error' : v.severity === 'medium' ? 'warning' : 'note',
        message: { text: v.title },
        locations: [{
          physicalLocation: {
            artifactLocation: { uri: v.endpoint },
            region: { startLine: 1 },
          },
        }],
      })),
    }],
  };
}

/** Generate curl commands for each finding */
export function toCurlReplays(vulns: DastAttackResult[], baseHeaders?: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const v of vulns) {
    if (v.curlReplay) {
      map.set(v.endpoint + '::' + v.type, v.curlReplay);
    } else {
      const url = injectPayloadIntoUrl(v.endpoint, v.paramName, v.payload);
      map.set(v.endpoint + '::' + v.type, toCurl({
        url,
        method: v.method,
        headers: baseHeaders || {},
      }));
    }
  }
  return map;
}

function injectPayloadIntoUrl(url: string, param?: string, payload?: string): string {
  if (!param || !payload) return url;
  try {
    const u = new URL(url);
    u.searchParams.set(param, payload);
    return u.toString();
  } catch {
    return url;
  }
}

/** Executive summary for stakeholders */
export function generateExecutiveSummary(result: DastScanResult): string {
  const crit = result.vulnerabilities.filter(v => v.severity === 'critical').length;
  const high = result.vulnerabilities.filter(v => v.severity === 'high').length;
  const med = result.vulnerabilities.filter(v => v.severity === 'medium').length;

  const lines: string[] = [];
  lines.push(`DAST Scan: ${result.targetUrl}`);
  lines.push(`Duration: ${(result.duration / 1000).toFixed(1)}s | Endpoints: ${result.endpointsTested} | Attacks: ${result.attacksPerformed}`);
  lines.push('');
  lines.push(`Findings: ${result.vulnerabilities.length} total (${crit} critical, ${high} high, ${med} medium)`);

  if (crit > 0) {
    lines.push('');
    lines.push('CRITICAL: Immediate remediation required.');
  }
  if (high > 0) {
    lines.push('');
    lines.push('HIGH: Prioritize within 7 days.');
  }

  if (result.securityHeaders?.length) {
    const missing = result.securityHeaders.filter(h => !h.present).length;
    if (missing > 0) {
      lines.push('');
      lines.push(`Security Headers: ${missing} recommended headers missing.`);
    }
  }

  return lines.join('\n');
}

/** Pentest report: High+ findings for guarantee/audit (No High+? Money back.) */
export function generatePentestHighPlusReport(
  targetUrl: string,
  highPlusFindings: Array<{ severity: string; title: string; endpoint: string; curlReplay?: string }>,
  duration: number
): string {
  const lines: string[] = [];
  lines.push(`═══════════════════════════════════════════════════════════════`);
  lines.push(`  PENTEST REPORT – HIGH+ FINDINGS`);
  lines.push(`  Target: ${targetUrl}`);
  lines.push(`  Duration: ${(duration / 1000).toFixed(1)}s`);
  lines.push(`  No High+ finding? Money back.`);
  lines.push(`═══════════════════════════════════════════════════════════════`);
  lines.push('');
  if (highPlusFindings.length === 0) {
    lines.push('  ✓ No Critical or High findings.');
    lines.push('');
    return lines.join('\n');
  }
  const crit = highPlusFindings.filter(f => f.severity === 'critical').length;
  const high = highPlusFindings.filter(f => f.severity === 'high').length;
  lines.push(`  CRITICAL: ${crit} | HIGH: ${high}`);
  lines.push('');
  for (const f of highPlusFindings) {
    lines.push(`  [${f.severity.toUpperCase()}] ${f.title}`);
    lines.push(`    Endpoint: ${f.endpoint}`);
    if (f.curlReplay) {
      lines.push(`    Replay: ${f.curlReplay.slice(0, 120)}...`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
