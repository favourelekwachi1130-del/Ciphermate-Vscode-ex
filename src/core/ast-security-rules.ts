/**
 * AST-based security rules for JS/TS
 * Phase 2: Structural patterns instead of regex - fewer false positives
 */

import * as parser from '@babel/parser';
// @ts-ignore - default export
import traverse from '@babel/traverse';

export interface ASTFinding {
  line: number;
  column?: number;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  type: string;
  fix?: string;
}

const JS_TS_EXTS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];

export function runASTRules(content: string, filePath: string): ASTFinding[] {
  const ext = filePath.includes('.') ? '.' + filePath.split('.').pop() : '';
  if (!JS_TS_EXTS.includes(ext?.toLowerCase())) return [];

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

  const findings: ASTFinding[] = [];

  traverse(ast, {
    CallExpression(path: any) {
      const callee = path.node.callee;
      const line = path.node.loc?.start?.line ?? 0;
      if (!line) return;

      const name = (callee as any).name ?? (callee as any).property?.name;
      if (!name) return;

      if (name === 'eval') {
        findings.push({
          line,
          column: path.node.loc?.start?.column,
          description: 'eval() enables code injection',
          severity: 'HIGH',
          type: 'code-injection',
          fix: 'Avoid eval(); use JSON.parse or safe alternatives',
        });
        return;
      }

      if (name === 'exec' || name === 'execSync') {
        findings.push({
          line,
          description: 'Child process exec - validate/sanitize input',
          severity: 'HIGH',
          type: 'command-injection',
          fix: 'Use execFile with args array, or validate input strictly',
        });
      }
    },
    AssignmentExpression(path: any) {
      const left = path.node.left;
      const line = path.node.loc?.start?.line ?? 0;
      if (!line) return;

      if ((left as any).property?.name === 'innerHTML') {
        findings.push({
          line,
          description: 'innerHTML assignment - XSS risk if content is user-controlled',
          severity: 'HIGH',
          type: 'xss',
          fix: 'Use textContent or sanitize with DOMPurify',
        });
      }
    },
    MemberExpression(path: any) {
      const obj = (path.node.object as any).name;
      const prop = (path.node.property as any).name;
      const line = path.node.loc?.start?.line ?? 0;
      if (!line) return;

      if (prop === 'dangerouslySetInnerHTML') {
        findings.push({
          line,
          description: 'dangerouslySetInnerHTML - XSS risk',
          severity: 'HIGH',
          type: 'xss',
          fix: 'Sanitize HTML or use safe alternatives',
        });
      }
    },
  });

  return findings;
}
