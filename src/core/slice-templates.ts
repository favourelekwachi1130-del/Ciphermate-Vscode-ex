/**
 * Slice Templates — Devansh Methodology
 *
 * Framework-specific slices from case studies. Each slice targets a known
 * bug class with concrete grep/AST patterns.
 *
 * Case studies:
 * - Parse Server: isMaster checked but isReadOnly not → authz-boundary
 * - HonoJS: JWT algorithm fallback → jwt-algorithm
 * - ElysiaJS: Cookie decoded init bug → cookie-signature
 * - harden-runner: Syscall coverage gaps → syscall-coverage
 * - BullFrog: DNS parsing edge cases → dns-parsing
 * - Better-Hub: Markdown rendering XSS → markdown-render
 */

export interface SliceTemplate {
  id: string;
  name: string;
  description: string;
  /** Bug class this slice targets */
  bugClass: string;
  /** Frameworks this applies to (empty = generic) */
  frameworks: string[];
  /** Regex patterns to find relevant code */
  patterns: Array<{
    pattern: string;
    flags?: string;
    description?: string;
  }>;
  /** Anti-patterns: if present with no mitigation, flag */
  antiPatterns?: Array<{
    pattern: string;
    flags?: string;
    mitigation?: string;
  }>;
  /** LLM prompt hint for this slice */
  auditHint?: string;
}

export const SLICE_TEMPLATES: SliceTemplate[] = [
  {
    id: 'authz-boundary',
    name: 'Authorization boundary (master vs read-only)',
    description: 'Handlers that check isMaster but not isReadOnly; privilege escalation risk.',
    bugClass: 'authorization-bypass',
    frameworks: ['parse-server', 'express', 'generic'],
    patterns: [
      { pattern: 'isMaster|masterKey|master_key', flags: 'i', description: 'Master key usage' },
      { pattern: 'isReadOnly|readOnly|read_only', flags: 'i', description: 'Read-only flag' },
      { pattern: '(req\\.user|context\\.user|auth)\\.(role|permission|isAdmin)', description: 'Role checks' },
    ],
    antiPatterns: [
      {
        pattern: 'isMaster|masterKey',
        mitigation: 'Ensure isReadOnly is also checked when restricting write operations',
      },
    ],
    auditHint: 'Look for handlers that accept master key but do not enforce isReadOnly. An attacker with read-only key could escalate to write.',
  },
  {
    id: 'jwt-algorithm',
    name: 'JWT algorithm fallback / alg confusion',
    description: 'JWT verification that trusts alg from token or falls back to HS256.',
    bugClass: 'jwt-algorithm-confusion',
    frameworks: ['hono', 'express', 'fastify', 'elysia', 'generic'],
    patterns: [
      { pattern: 'jwt\\.verify|verify\\.jwt|jsonwebtoken', flags: 'i', description: 'JWT verify calls' },
      { pattern: 'header\\.alg|decoded\\.header\\.alg|alg\\s*:', description: 'Algorithm from token' },
      { pattern: 'HS256|RS256|ES256|none', description: 'Algorithm constants' },
      { pattern: 'algorithm\\s*:|algorithms\\s*:', description: 'Algorithm option' },
    ],
    antiPatterns: [
      {
        pattern: 'header\\.alg|decoded\\.header\\.alg',
        mitigation: 'Never trust alg from token. Use a whitelist: algorithms: ["RS256"]',
      },
    ],
    auditHint: 'If the code uses alg from the token header or has a default algorithm, an attacker can force algorithm confusion (e.g. RS256→HS256 with public key as secret).',
  },
  {
    id: 'cookie-signature',
    name: 'Cookie signature / decoded init',
    description: 'Cookie signed incorrectly, decoded used before init, or secrets rotation bug.',
    bugClass: 'cookie-forgery',
    frameworks: ['elysia', 'hono', 'express', 'fastify', 'generic'],
    patterns: [
      { pattern: 'signed|cookie\\.sign|cookie\\.verify', flags: 'i', description: 'Cookie signing' },
      { pattern: 'decoded|decoded\\.', description: 'Decoded value usage' },
      { pattern: 'secret|signingKey|secretKey', flags: 'i', description: 'Signing secrets' },
      { pattern: 'rotate|rotation|rotateSecret', flags: 'i', description: 'Secret rotation' },
    ],
    antiPatterns: [
      {
        pattern: 'decoded|decoded\\.',
        mitigation: 'Ensure decoded is initialized only after successful verification. Check for init race.',
      },
    ],
    auditHint: 'Elysia cookie bug: decoded used before proper init. Also check: are secrets rotated without invalidating old cookies?',
  },
  {
    id: 'syscall-coverage',
    name: 'Syscall / sandbox coverage gaps',
    description: 'Seccomp/syscall filter missing network egress (e.g. UDP send).',
    bugClass: 'sandbox-escape',
    frameworks: ['harden-runner', 'generic'],
    patterns: [
      { pattern: 'seccomp|syscall|PR_SET_SECCOMP', flags: 'i', description: 'Syscall filtering' },
      { pattern: 'sendto|sendmsg|UDP|SOCK_DGRAM', description: 'UDP send' },
      { pattern: 'allow|whitelist|permit', flags: 'i', description: 'Allowed syscalls' },
    ],
    antiPatterns: [
      {
        pattern: 'seccomp|syscall',
        mitigation: 'Ensure all network egress syscalls (sendto, sendmsg, etc.) are either allowed or explicitly blocked with rationale',
      },
    ],
    auditHint: 'Compare syscall allowlist to actual network usage. UDP send* often missed in sandbox configs.',
  },
  {
    id: 'dns-parsing',
    name: 'DNS / protocol parsing edge cases',
    description: 'DNS or TCP segment parsing; first message only, truncation, malformed.',
    bugClass: 'protocol-parsing',
    frameworks: ['generic'],
    patterns: [
      { pattern: 'dns|parseDns|parseMessage', flags: 'i', description: 'DNS parsing' },
      { pattern: 'TCP|segment|packet', description: 'TCP segment handling' },
      { pattern: 'firstMessage|first\\.message|message\\[0\\]', description: 'First message only' },
    ],
    antiPatterns: [
      {
        pattern: 'message\\[0\\]|firstMessage|first\\.message',
        mitigation: 'TCP can deliver multiple messages in one segment. Handle all messages, not just first.',
      },
    ],
    auditHint: 'BullFrog: first message only parsed per TCP segment. Check for truncation, multiple messages, malformed payloads.',
  },
  {
    id: 'markdown-render',
    name: 'Markdown / user content rendering',
    description: 'User content rendered as markdown/HTML without sanitization; XSS.',
    bugClass: 'xss',
    frameworks: ['generic'],
    patterns: [
      { pattern: 'marked|markdown|showdown|remark|rehype', flags: 'i', description: 'Markdown libs' },
      { pattern: 'dangerouslySetInnerHTML|innerHTML|render\\(html\\)', description: 'Raw HTML injection' },
      { pattern: 'sanitize|DOMPurify|xss', flags: 'i', description: 'Sanitization' },
    ],
    antiPatterns: [
      {
        pattern: 'marked|markdown|dangerouslySetInnerHTML',
        mitigation: 'Sanitize user content before render. Use DOMPurify or allowlist tags.',
      },
    ],
    auditHint: 'Better-Hub: user markdown rendered without sanitization. Check: is user input sanitized before markdown/HTML render?',
  },
  {
    id: 'sql-injection',
    name: 'SQL / query construction',
    description: 'String concatenation or template in SQL; injection risk.',
    bugClass: 'sql-injection',
    frameworks: ['generic'],
    patterns: [
      { pattern: 'query|execute|raw\\(|sql\\(', flags: 'i', description: 'Query execution' },
      { pattern: '\\$\\s*\\{|\\+\\s*["\']|concat\\s*\\(', description: 'String interpolation in SQL' },
      { pattern: 'SELECT|INSERT|UPDATE|DELETE', flags: 'i', description: 'SQL keywords' },
    ],
    antiPatterns: [
      {
        pattern: '\\+\\s*["\']|`\\$\\{|\\$\\(',
        mitigation: 'Use parameterized queries. Never interpolate user input into SQL.',
      },
    ],
    auditHint: 'Any user input in SQL string = injection. Check for parameterized queries.',
  },
  {
    id: 'ssrf',
    name: 'Server-side request forgery',
    description: 'URL or host from user input used in fetch/request.',
    bugClass: 'ssrf',
    frameworks: ['generic'],
    patterns: [
      { pattern: 'fetch\\(|axios\\.|request\\(|http\\.get|https\\.get', description: 'HTTP client' },
      { pattern: 'url|uri|host|endpoint', flags: 'i', description: 'URL params' },
      { pattern: 'localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0', description: 'Internal host refs' },
    ],
    antiPatterns: [
      {
        pattern: 'fetch\\(|request\\(|http\\.get',
        mitigation: 'Validate URL/host against allowlist. Block internal IPs (127.0.0.1, 169.254.x.x, etc).',
      },
    ],
    auditHint: 'Can user control the URL? Check for internal IP bypass (0.0.0.0, ::1, DNS rebinding).',
  },
];

/**
 * Get templates applicable to a given framework set
 */
export function getTemplatesForFrameworks(frameworks: string[]): SliceTemplate[] {
  const set = new Set(frameworks.map((f) => f.toLowerCase()));
  return SLICE_TEMPLATES.filter(
    (t) =>
      t.frameworks.length === 0 ||
      t.frameworks.some((f) => set.has(f.toLowerCase())) ||
      t.frameworks.includes('generic')
  );
}

/**
 * Get all templates (for generic audit)
 */
export function getAllTemplates(): SliceTemplate[] {
  return SLICE_TEMPLATES;
}

/**
 * Get template by ID
 */
export function getTemplateById(id: string): SliceTemplate | undefined {
  return SLICE_TEMPLATES.find((t) => t.id === id);
}
