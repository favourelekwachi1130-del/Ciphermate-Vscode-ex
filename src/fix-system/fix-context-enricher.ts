/**
 * Fix Context Enricher
 *
 * Gathers vulnerability-aware context before fix generation:
 * language/framework, existing security patterns in the file, and impact file list.
 * Optional workspace context (AGENTS.md, related files, stack) for heavy context awareness.
 */

import * as path from 'path';
import type { Vulnerability } from '../scanners/types';
import type { VulnFixStrategy } from './vulnerability-fix-strategies';
import type { WorkspaceContext } from './workspace-context-loader';

export interface EnrichedFixContext {
  language: 'js' | 'ts' | 'python' | 'php' | 'ruby' | 'go' | 'other';
  /** Detected framework/ORM hints from code */
  frameworkHints: string[];
  /** Existing security patterns found in the file (so fix can match) */
  existingPatterns: string[];
  /** Files that may need changes (primary + .env, .gitignore, etc.) */
  impactFiles: string[];
  /** One-line summary for the model */
  summary: string;
  /** Full code context (truncated if huge) */
  codeSnippet: string;
  /** Project instructions (AGENTS.md) when workspace context loaded */
  agentsMd: string;
  /** Related files content for prompt (path -> snippet) */
  relatedFilesBlock: string;
  /** Stack snippet (package.json / requirements) and label */
  stackSnippet: string;
  stackLabel: string;
}

const EXT_TO_LANG: Record<string, EnrichedFixContext['language']> = {
  '.js': 'js',
  '.jsx': 'js',
  '.mjs': 'js',
  '.cjs': 'js',
  '.ts': 'ts',
  '.tsx': 'ts',
  '.py': 'python',
  '.php': 'php',
  '.rb': 'ruby',
  '.go': 'go',
};

/** Detect language from file path */
function detectLanguage(filePath: string): EnrichedFixContext['language'] {
  const ext = path.extname(filePath || '').toLowerCase();
  return EXT_TO_LANG[ext] ?? 'other';
}

/** Scan code for framework/ORM/DB hints */
function detectFrameworkHints(code: string): string[] {
  const hints: string[] = [];
  if (/\brequire\s*\(\s*['"]pg['"]|from\s+['"]pg['"]/.test(code)) { hints.push('pg'); }
  if (/\brequire\s*\(\s*['"]mysql2?['"]|from\s+['"]mysql2?['"]/.test(code)) { hints.push('mysql'); }
  if (/\bknex\s*\(|require\s*\(\s*['"]knex['"]/.test(code)) { hints.push('knex'); }
  if (/\bsequelize|TypeORM|Prisma|mongoose/.test(code)) { hints.push('ORM'); }
  if (/\bexpress\s*\(|require\s*\(\s*['"]express['"]/.test(code)) { hints.push('express'); }
  if (/\bflask|django|FastAPI/.test(code)) { hints.push('Python web'); }
  if (/\bPDO|mysqli/.test(code)) { hints.push('PHP DB'); }
  if (/\bprocess\.env\.|getenv\s*\(|os\.environ/.test(code)) { hints.push('env vars'); }
  if (/\b\.query\s*\(|\.execute\s*\(|prepare\s*\(/.test(code)) { hints.push('query/execute'); }
  return hints;
}

/** Scan code for existing security-related patterns (so we match project style) */
function detectExistingPatterns(code: string): string[] {
  const patterns: string[] = [];
  if (/process\.env\.\w+|getenv\s*\(|os\.environ\.get\s*\(/.test(code)) { patterns.push('env vars for config'); }
  if (/\$1|\?\s*\)|:id|%s|prepare\s*\(|\.where\s*\(/.test(code)) { patterns.push('parameterized/bound queries'); }
  if (/textContent|innerHTML|htmlspecialchars|escape\s*\(|sanitize/.test(code)) { patterns.push('output encoding/sanitization'); }
  if (/path\.resolve\s*\(|path\.join\s*\(|realpath|basename/.test(code)) { patterns.push('path resolution'); }
  if (/spawn\s*\([^,]+,\s*\[/.test(code) || /subprocess\.run\s*\(\[/.test(code)) { patterns.push('array-arg spawn (no shell)'); }
  return patterns;
}

/** Build impact file list: primary file + strategy-related files (e.g. .env, .gitignore) */
function buildImpactFiles(primaryFile: string, strategy: VulnFixStrategy): string[] {
  return [primaryFile, ...strategy.relatedFiles].filter(Boolean);
}

const MAX_SNIPPET = 12000;

/**
 * Enrich context for a vulnerability fix: language, frameworks, existing patterns, impact files.
 * If workspaceContext is provided (from loadWorkspaceContext), injects AGENTS.md, related files, and stack.
 */
export function enrichFixContext(
  vulnerability: Vulnerability,
  codeContext: string,
  strategy: VulnFixStrategy,
  workspaceRoot?: string,
  workspaceContext?: WorkspaceContext
): EnrichedFixContext {
  const filePath = vulnerability.file || '';
  const code = (codeContext || vulnerability.code || '').trim();
  const language = detectLanguage(filePath);
  const frameworkHints = detectFrameworkHints(code);
  const existingPatterns = detectExistingPatterns(code);
  const primaryFile = filePath || 'unknown';
  const impactFiles = buildImpactFiles(primaryFile, strategy);

  let codeSnippet = code.length > MAX_SNIPPET ? code.slice(0, MAX_SNIPPET) + '\n\n[... truncated ...]' : code;
  let agentsMd = '';
  let relatedFilesBlock = '';
  let stackSnippet = '';
  let stackLabel = '';

  if (workspaceContext) {
    codeSnippet = workspaceContext.primaryFileContent.length > MAX_SNIPPET
      ? workspaceContext.primaryFileContent.slice(0, MAX_SNIPPET) + '\n\n[... truncated ...]'
      : workspaceContext.primaryFileContent;
    agentsMd = workspaceContext.agentsMd || '';
    relatedFilesBlock = workspaceContext.relatedFiles
      .map((f) => `## ${f.path}\n\`\`\`\n${f.content.slice(0, 4000)}\n\`\`\``)
      .join('\n\n');
    stackSnippet = workspaceContext.stackSnippet || '';
    stackLabel = workspaceContext.stackLabel || '';
  }

  const summaryParts: string[] = [
    `Language: ${language}`,
    stackLabel ? `Stack: ${stackLabel}` : (frameworkHints.length ? `Stack: ${frameworkHints.join(', ')}` : ''),
    existingPatterns.length ? `Existing patterns: ${existingPatterns.join(', ')}` : '',
    impactFiles.length > 1 ? `Impact files: ${impactFiles.join(', ')}` : '',
  ].filter(Boolean);

  return {
    language,
    frameworkHints,
    existingPatterns,
    impactFiles,
    summary: summaryParts.join('. '),
    codeSnippet,
    agentsMd,
    relatedFilesBlock,
    stackSnippet,
    stackLabel,
  };
}
