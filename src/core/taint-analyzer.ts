/**
 * Taint Analysis - Track user input to dangerous sinks
 * Lightweight: within function scope, track sources → sinks
 */

import * as parser from '@babel/parser';
// @ts-ignore
import traverse from '@babel/traverse';

export interface TaintFinding {
  line: number;
  column?: number;
  source: string;
  sink: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  type: string;
  fix?: string;
}

const SOURCE_PATTERNS = [
  { obj: 'req', prop: 'body', name: 'req.body' },
  { obj: 'req', prop: 'query', name: 'req.query' },
  { obj: 'req', prop: 'params', name: 'req.params' },
  { obj: 'req', prop: 'headers', name: 'req.headers' },
  { obj: 'req', prop: 'cookies', name: 'req.cookies' },
  { obj: 'req', prop: 'query', name: 'req.query' },
  { obj: 'request', prop: 'body', name: 'request.body' },
  { obj: 'ctx', prop: 'request', name: 'ctx.request (user input)' },
  { obj: 'process', prop: 'argv', name: 'process.argv' },
];

const SINK_CONFIG: Array<{ name: string; severity: 'CRITICAL' | 'HIGH' | 'MEDIUM'; type: string }> = [
  { name: 'eval', severity: 'CRITICAL', type: 'code-injection' },
  { name: 'exec', severity: 'CRITICAL', type: 'command-injection' },
  { name: 'execSync', severity: 'CRITICAL', type: 'command-injection' },
  { name: 'innerHTML', severity: 'HIGH', type: 'xss' },
  { name: 'document.write', severity: 'HIGH', type: 'xss' },
  { name: 'query', severity: 'CRITICAL', type: 'sql-injection' },
  { name: 'execute', severity: 'CRITICAL', type: 'sql-injection' },
];

export function runTaintAnalysis(content: string, filePath: string): TaintFinding[] {
  const ext = filePath.includes('.') ? '.' + filePath.split('.').pop() : '';
  if (!['.js', '.jsx', '.ts', '.tsx'].includes(ext?.toLowerCase())) return [];

  let ast;
  try {
    ast = parser.parse(content, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: true,
    });
  } catch {
    return [];
  }

  const findings: TaintFinding[] = [];
  const taintedIds = new Set<string>();
  const sourceLocations = new Map<string, { line: number; name: string }>();

  function isSource(node: any): { name: string } | null {
    if (node?.type === 'MemberExpression') {
      const obj = (node.object as any).name;
      const prop = (node.property as any).name ?? (node.property as any).value;
      const match = SOURCE_PATTERNS.find((p) => p.obj === obj && p.prop === prop);
      if (match) return { name: match.name };
    }
    return null;
  }

  function getCalleeName(node: any): string | null {
    const c = node.callee;
    if (c?.type === 'Identifier') return c.name;
    if (c?.type === 'MemberExpression') {
      const p = (c.property as any).name;
      const o = (c.object as any).name;
      if (o === 'document' && p === 'write') return 'document.write';
      if (o === 'child_process' || o === 'childProcess') return p;
      return p;
    }
    return null;
  }

  function addTainted(name: string, line: number, sourceName: string) {
    taintedIds.add(name);
    sourceLocations.set(name, { line, name: sourceName });
  }

  traverse(ast, {
    VariableDeclarator(path: any) {
      const init = path.node.init;
      const id = path.node.id;
      if (id?.type !== 'Identifier' || !init) return;
      const src = isSource(init);
      if (src) {
        const line = path.node.loc?.start?.line ?? 0;
        addTainted(id.name, line, src.name);
      }
      if (init?.type === 'Identifier' && taintedIds.has(init.name)) {
        addTainted(id.name, path.node.loc?.start?.line ?? 0, sourceLocations.get(init.name)?.name ?? '');
      }
    },
    AssignmentExpression(path: any) {
      const left = path.node.left;
      const right = path.node.right;
      // Taint propagation: left = source|tainted
      if (left?.type === 'Identifier') {
        const src = isSource(right);
        if (src) addTainted(left.name, path.node.loc?.start?.line ?? 0, src.name);
        if (right?.type === 'Identifier' && taintedIds.has(right.name)) {
          addTainted(left.name, path.node.loc?.start?.line ?? 0, sourceLocations.get(right.name)?.name ?? '');
        }
      }
      // innerHTML sink: elem.innerHTML = tainted
      if (left?.type === 'MemberExpression' && (left.property as any)?.name === 'innerHTML') {
        const base = (left.object as any)?.name;
        const rightVal = path.node.right;
        const src = isSource(rightVal);
        const fromTaint = rightVal?.type === 'Identifier' && taintedIds.has(rightVal.name);
        if (src || fromTaint) {
          findings.push({
            line: path.node.loc?.start?.line ?? 0,
            source: src?.name ?? sourceLocations.get((rightVal as any)?.name)?.name ?? 'user input',
            sink: 'innerHTML',
            description: `Tainted data reaches innerHTML - XSS risk`,
            severity: 'HIGH',
            type: 'xss',
            fix: 'Sanitize with DOMPurify or use textContent',
          });
        }
      }
    },
    CallExpression(path: any) {
      const calleeName = getCalleeName(path.node);
      if (!calleeName) return;

      const sinkCfg = SINK_CONFIG.find((s) => s.name === calleeName || calleeName.includes(s.name));
      if (!sinkCfg) return;

      const arg = path.node.arguments[0];
      if (!arg) return;

      let fromTaint = false;
      let sourceName = '';

      if (arg?.type === 'Identifier') {
        if (taintedIds.has(arg.name)) {
          fromTaint = true;
          sourceName = sourceLocations.get(arg.name)?.name ?? 'user input';
        }
      } else if (arg?.type === 'MemberExpression') {
        const base = arg.object?.name ?? (arg.object as any)?.name;
        if (taintedIds.has(base)) {
          fromTaint = true;
          sourceName = sourceLocations.get(base)?.name ?? 'user input';
        }
      } else if (arg?.type === 'BinaryExpression' && arg.operator === '+') {
        const check = (n: any): boolean => {
          if (n?.type === 'Identifier') return taintedIds.has(n.name);
          if (n?.type === 'MemberExpression') return taintedIds.has((n.object as any)?.name);
          return false;
        };
        if (check(arg.left) || check(arg.right)) {
          fromTaint = true;
          sourceName = 'user input (concatenation)';
        }
      }

      if (fromTaint) {
        findings.push({
          line: path.node.loc?.start?.line ?? 0,
          column: path.node.loc?.start?.column,
          source: sourceName,
          sink: calleeName,
          description: `Tainted data from ${sourceName} reaches ${calleeName} - ${sinkCfg.type} risk`,
          severity: sinkCfg.severity,
          type: sinkCfg.type,
          fix: 'Validate and sanitize user input before use',
        });
      }
    },
  });

  return findings;
}
