/**
 * Architecture-Inferred Threat Model — Research Direction #11
 *
 * When no CVE history exists (new project, internal tool), infer a minimal
 * threat model from static discovery: entry points, frameworks, trust boundaries.
 */

import { discoverEntryPoints } from './entry-point-discovery';
import type { ThreatModel } from './threat-model-from-cve';

/** Framework → default high-risk ops */
const FRAMEWORK_RISKS: Record<string, string[]> = {
  express: ['authz checks', 'parsing untrusted input', 'session handling'],
  fastify: ['authz checks', 'parsing untrusted input', 'cookie signing'],
  hono: ['authz checks', 'JWT verification', 'parsing untrusted input'],
  elysia: ['authz checks', 'cookie decoded init', 'parsing untrusted input'],
  django: ['authz checks', 'CSRF', 'SQL injection', 'template injection'],
  flask: ['authz checks', 'SQL injection', 'template injection'],
  nestjs: ['authz checks', 'JWT', 'validation pipes'],
  trpc: ['authz checks', 'input validation', 'RPC context'],
  grpc: ['authz checks', 'deserialization', 'service-to-service'],
  kafka: ['deserialization', 'message validation', 'consumer authz'],
  generic: ['deserialization', 'authz checks', 'parsing untrusted input'],
};

/**
 * Infer a minimal threat model from workspace structure (no CVEs required).
 */
export function inferThreatModelFromArchitecture(workspaceRoot: string): ThreatModel {
  const discovery = discoverEntryPoints(workspaceRoot);

  const highRiskOps = new Set<string>();
  for (const fw of discovery.frameworks) {
    const risks = FRAMEWORK_RISKS[fw.toLowerCase()] ?? FRAMEWORK_RISKS.generic;
    risks.forEach((r) => highRiskOps.add(r));
  }
  if (highRiskOps.size === 0) {
    FRAMEWORK_RISKS.generic.forEach((r) => highRiskOps.add(r));
  }

  const entryPoints = discovery.entryPoints
    .slice(0, 15)
    .map((e) => e.signature || `${e.type}: ${e.file}`);

  const trustBoundaries = discovery.trustBoundaries.map((t) => `${t.type}: ${t.description}`);

  return {
    sliceFocus: `Entry points and trust boundaries from ${discovery.frameworks.length ? discovery.frameworks.join(', ') : 'static analysis'}`,
    entryPoints,
    trustBoundaries,
    highRiskOps: Array.from(highRiskOps),
    attackerModel: 'remote-unauthenticated',
    priorCves: [],
    cveDescriptions: [],
    generatedAt: Date.now(),
  };
}
