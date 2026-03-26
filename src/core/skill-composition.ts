/**
 * Skill Composition Layer — Option C
 *
 * Composes multiple skills per request for higher-quality, context-aware analysis.
 * Maps (task, intent, message context) → list of skills → merged content with token budget.
 *
 * Quality-first: focused skills, no truncation of critical content, smart deduplication.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { ScripterMaxTask } from '../engine/scripter-max-engine';
import type { SecurityIntent } from '../ai-agent/intent-recognizer';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SkillRegistryEntry {
  id: string;
  name: string;
  description: string;
  tags: string[];
  source: 'ciphermate' | 'antigravity' | 'workspace';
  /** Resolved path to SKILL.md */
  path: string | null;
  /** Higher = included first when budget allows */
  priority: number;
  /** Max chars to include from this skill (0 = use default) */
  maxChars?: number;
}

export interface ComposeOptions {
  maxTotalChars?: number;
  /** Include antigravity skills when available */
  useAntigravity?: boolean;
  /** Workspace root for resolving paths */
  workspaceRoot?: string;
  /** Extension path for built-in skills */
  extensionPath?: string;
}

export interface ComposeResult {
  content: string;
  skillsUsed: string[];
  truncated: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SKILL_DIR = 'skills';
const DEFAULT_MAX_TOTAL_CHARS = 16_000;
const DEFAULT_SKILL_MAX_CHARS = 8_000;
const ANTIGRAVITY_SKILLS_DIR = 'antigravity';

/** Context keywords (CipherMate skills) — always included when composition enabled */
const CONTEXT_KEYWORD_SKILLS_CIPHERMATE: Array<{ keywords: RegExp[]; skillIds: string[] }> = [
  { keywords: [/\bdebug/i, /\bbug\b/i], skillIds: ['debugging'] },
  { keywords: [/\bedit\b/i, /\bmodify\b/i, /\bchange\s*code/i], skillIds: ['code-editing'] },
  { keywords: [/\bcomplete\b/i, /\bautocomplete\b/i, /\bsuggest\b/i], skillIds: ['code-completion'] },
  { keywords: [/\bcreate\s*file/i, /\bnew\s*file/i, /\badd\s*file/i], skillIds: ['file-creation'] },
  { keywords: [/\bfix\b/i, /\bremediat/i, /\bpatch\b/i], skillIds: ['code-editing', 'debugging'] },
];

/** Context keywords (antigravity skills) — only when useAntigravity */
const CONTEXT_KEYWORD_SKILLS_ANTIGRAVITY: Array<{ keywords: RegExp[]; skillIds: string[] }> = [
  { keywords: [/\bapi\b/i, /\brest\b/i, /\bgraphql\b/i, /\bendpoint/i], skillIds: ['api-security-best-practices'] },
  { keywords: [/\battack\s*tree/i, /\bthreat\s*model/i], skillIds: ['attack-tree-construction'] },
  { keywords: [/\bauth\b/i, /\bjwt\b/i, /\boauth\b/i, /\bsession\b/i], skillIds: ['auth-implementation-patterns'] },
  { keywords: [/\bpentest\b/i, /\bexploit\b/i, /\bred\s*team/i], skillIds: ['ethical-hacking-methodology'] },
  { keywords: [/\bfuzz/i, /\bbug\s*bounty/i], skillIds: ['api-fuzzing-bug-bounty'] },
  { keywords: [/\bdebug/i, /\bbug\b/i], skillIds: ['systematic-debugging'] },
];

/** Task → primary skill (required) + optional secondary by tier */
const TASK_PRIMARY_SKILLS: Record<ScripterMaxTask, string> = {
  'vulnerability-analysis': 'vulnerability-analysis',
  'pentest-strategy': 'pentest-strategy',
  'security-audit': 'security-audit',
  'code-fix-expert': 'code-fix-expert',
  'general': 'general',
};

/** Intent → CipherMate extra skills (always included) */
const INTENT_EXTRA_SKILLS_CIPHERMATE: Partial<Record<SecurityIntent, string[]>> = {
  FIX_VULNERABILITIES: ['code-editing', 'code-completion', 'debugging', 'file-creation'],
};

/** Intent → antigravity extra skills (only when useAntigravity); keys may extend beyond SecurityIntent. */
const INTENT_EXTRA_SKILLS_ANTIGRAVITY: Record<string, string[]> = {
  SCAN_DAST: ['api-security-testing'],
  SCAN_PENTEST: ['attack-tree-construction', 'ethical-hacking-methodology'],
  BUILD_THREAT_MODEL: ['attack-tree-construction'],
  AUDIT_SLICE: ['api-security-best-practices', 'audit-context-building'],
  FIX_VULNERABILITIES: ['systematic-debugging'],
  ANALYZE: ['audit-context-building'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Skill Registry
// ─────────────────────────────────────────────────────────────────────────────

function getBuiltInSkillIds(): string[] {
  return ['vulnerability-analysis', 'pentest-strategy', 'security-audit', 'code-fix-expert', 'general'];
}

function getAntigravitySkillIds(): string[] {
  return [
    'api-security-best-practices',
    'api-security-testing',
    'api-fuzzing-bug-bounty',
    'attack-tree-construction',
    'audit-context-building',
    'audit-skills',
    'auth-implementation-patterns',
    'ethical-hacking-methodology',
    'systematic-debugging',
  ];
}

function resolveSkillPath(
  skillId: string,
  source: 'ciphermate' | 'antigravity' | 'workspace',
  extensionPath: string,
  workspaceRoot?: string
): string | null {
  const baseDirs: string[] = [];
  if (source === 'ciphermate' || source === 'workspace') {
    if (extensionPath) baseDirs.push(path.join(extensionPath, SKILL_DIR, skillId));
    if (workspaceRoot) baseDirs.push(path.join(workspaceRoot, SKILL_DIR, skillId));
  }
  if (source === 'antigravity') {
    if (extensionPath) baseDirs.push(path.join(extensionPath, SKILL_DIR, ANTIGRAVITY_SKILLS_DIR, skillId));
    if (workspaceRoot) baseDirs.push(path.join(workspaceRoot, SKILL_DIR, ANTIGRAVITY_SKILLS_DIR, skillId));
  }

  for (const dir of baseDirs) {
    const skillPath = path.join(dir, 'SKILL.md');
    if (fs.existsSync(skillPath)) return skillPath;
  }
  return null;
}

function loadSkillContent(skillPath: string, maxChars: number): string {
  try {
    const raw = fs.readFileSync(skillPath, 'utf-8');
    // Strip YAML frontmatter if present (antigravity format)
    let content = raw.replace(/^---[\s\S]*?---\s*\n?/, '').trim();
    if (content.length > maxChars) {
      content = content.slice(0, maxChars) + '\n\n[... skill truncated for context ...]';
    }
    return content;
  } catch {
    return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Composition Logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve which skills to compose for a given request.
 * Order: primary (required) first, then context-based, then intent-based.
 * Deduplicates and respects priority.
 */
function resolveSkillIds(
  task: ScripterMaxTask,
  message: string,
  intent?: SecurityIntent,
  useAntigravity?: boolean
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  // 1. Primary skill (always first)
  const primary = TASK_PRIMARY_SKILLS[task];
  if (primary && !seen.has(primary)) {
    seen.add(primary);
    ordered.push(primary);
  }

  // 2a. Context keywords (CipherMate skills) — always
  for (const { keywords, skillIds } of CONTEXT_KEYWORD_SKILLS_CIPHERMATE) {
    const matches = keywords.some((k) => k.test(message));
    if (matches) {
      for (const id of skillIds) {
        if (!seen.has(id)) {
          seen.add(id);
          ordered.push(id);
        }
      }
    }
  }

  // 2b. Context keywords (antigravity skills) — only when useAntigravity
  if (useAntigravity) {
    for (const { keywords, skillIds } of CONTEXT_KEYWORD_SKILLS_ANTIGRAVITY) {
      const matches = keywords.some((k) => k.test(message));
      if (matches) {
        for (const id of skillIds) {
          if (!seen.has(id)) {
            seen.add(id);
            ordered.push(id);
          }
        }
      }
    }
  }

  // 3a. Intent-based extra skills (CipherMate) — always
  if (intent) {
    const extra = INTENT_EXTRA_SKILLS_CIPHERMATE[intent];
    if (extra) {
      for (const id of extra) {
        if (!seen.has(id)) {
          seen.add(id);
          ordered.push(id);
        }
      }
    }
  }

  // 3b. Intent-based extra skills (antigravity) — only when useAntigravity
  if (intent && useAntigravity) {
    const extra = INTENT_EXTRA_SKILLS_ANTIGRAVITY[intent];
    if (extra) {
      for (const id of extra) {
        if (!seen.has(id)) {
          seen.add(id);
          ordered.push(id);
        }
      }
    }
  }

  return ordered;
}

/**
 * Load and merge skill content with token budget.
 * Primary skill gets full budget first; secondaries fill remainder.
 */
function mergeSkillContents(
  skillIds: string[],
  extensionPath: string,
  workspaceRoot: string | undefined,
  useAntigravity: boolean,
  maxTotalChars: number
): { content: string; used: string[]; truncated: boolean } {
  const used: string[] = [];
  const sections: string[] = [];
  let remaining = maxTotalChars;
  let truncated = false;

  for (const skillId of skillIds) {
    if (remaining <= 0) break;

    const isBuiltIn = getBuiltInSkillIds().includes(skillId);
    const isAntigravity = getAntigravitySkillIds().includes(skillId);
    const source: 'ciphermate' | 'antigravity' | 'workspace' = isAntigravity ? 'antigravity' : 'ciphermate';

    if (isAntigravity && !useAntigravity) continue;

    const skillPath = resolveSkillPath(skillId, source, extensionPath, workspaceRoot);
    if (!skillPath) continue;

    const budget = isBuiltIn ? Math.min(remaining, DEFAULT_SKILL_MAX_CHARS) : Math.min(remaining, 4000);
    const content = loadSkillContent(skillPath, budget);
    if (!content.trim()) continue;

    used.push(skillId);
    sections.push(`## Skill: ${skillId}\n\n${content}`);
    remaining -= content.length + 50; // +50 for section header
    if (remaining <= 0) truncated = true;
  }

  const merged = sections.join('\n\n---\n\n');
  return { content: merged, used, truncated };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compose skill content for a Scripter Max request.
 * Uses task, message, and optional intent to select and merge multiple skills.
 */
export function composeSkills(
  task: ScripterMaxTask,
  message: string,
  opts: ComposeOptions & { intent?: SecurityIntent }
): ComposeResult {
  const extensionPath = opts.extensionPath ?? '';
  const workspaceRoot = opts.workspaceRoot;
  const maxTotalChars = opts.maxTotalChars ?? DEFAULT_MAX_TOTAL_CHARS;
  const useAntigravity = opts.useAntigravity ?? true;

  const skillIds = resolveSkillIds(task, message, opts.intent, useAntigravity);
  const { content, used, truncated } = mergeSkillContents(
    skillIds,
    extensionPath,
    workspaceRoot,
    useAntigravity,
    maxTotalChars
  );

  if (content.trim().length === 0) {
    return {
      content: getFallbackStub(task),
      skillsUsed: [],
      truncated: false,
    };
  }

  return { content, skillsUsed: used, truncated };
}

function getFallbackStub(task: ScripterMaxTask): string {
  const stubs: Record<ScripterMaxTask, string> = {
    'vulnerability-analysis': `# Vulnerability Analysis
Perform deep security vulnerability analysis: precise classification, STRIDE categorisation,
attack surface assessment, taint path from source to sink, CVE/cwe references, and remediation.`,
    'pentest-strategy': `# Pentest Strategy
Build an offensive security assessment plan: reconnaissance, MITRE ATT&CK mapping,
prioritized attack vectors, injection/auth/SSRF/business-logic checks.`,
    'security-audit': `# Security Audit
Full codebase audit: dependency CVEs, secret detection, auth architecture, injection and crypto review,
OWASP ASVS alignment, compliance gaps, and remediation roadmap.`,
    'code-fix-expert': `# Code Fix Expert
Generate production-ready security fixes: full file context, impact analysis, language-specific patterns
(parameterized queries, env vars, encoding), and verification steps.`,
    general: `# General security analysis
Provide thorough, structured security analysis and actionable recommendations.`,
  };
  return stubs[task] ?? stubs.general;
}

/**
 * Get the list of skill IDs that would be composed for a request (for debugging/UI).
 */
export function getComposableSkillIds(
  task: ScripterMaxTask,
  message: string,
  intent?: SecurityIntent,
  useAntigravity = true
): string[] {
  return resolveSkillIds(task, message, intent, useAntigravity);
}
