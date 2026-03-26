/**
 * Path Guard — Prevents path traversal attacks
 *
 * All file operations in the fix system that use vulnerability-provided or
 * AI-provided paths must go through these guards.
 *
 * Attack prevented: "../../../etc/passwd" or "%2F..%2Fetc" in scan results
 * or AI-generated file plans causing writes outside the workspace.
 */

import * as path from 'path';
import * as fs from 'fs';

export class PathTraversalError extends Error {
  constructor(attempted: string, root: string) {
    super(`Path traversal blocked: "${attempted}" is outside workspace root "${root}"`);
    this.name = 'PathTraversalError';
  }
}

/**
 * Resolve a path and verify it stays within the workspace root.
 * Throws PathTraversalError if the resolved path escapes the root.
 *
 * @param workspaceRoot  Absolute path to the workspace root
 * @param relativePath   Path from vulnerability data or AI response (may be malicious)
 * @returns Absolute, safe path within workspaceRoot
 */
export function guardPath(workspaceRoot: string, relativePath: string): string {
  if (!workspaceRoot || !relativePath) {
    throw new PathTraversalError(relativePath, workspaceRoot);
  }

  // Decode any URL-encoded traversal attempts
  let decoded = relativePath;
  try { decoded = decodeURIComponent(relativePath); } catch { /* invalid encoding — use as-is */ }

  // Remove null bytes (used to bypass extension checks)
  decoded = decoded.replace(/\0/g, '');

  const absoluteRoot = path.resolve(workspaceRoot);
  const resolved = path.resolve(absoluteRoot, decoded);

  // The critical check: resolved path must START with the workspace root
  if (!resolved.startsWith(absoluteRoot + path.sep) && resolved !== absoluteRoot) {
    throw new PathTraversalError(relativePath, workspaceRoot);
  }

  return resolved;
}

/**
 * Safe version of guardPath that returns null instead of throwing.
 * Use when you want to silently skip dangerous paths.
 */
export function guardPathSafe(workspaceRoot: string, relativePath: string): string | null {
  try {
    return guardPath(workspaceRoot, relativePath);
  } catch {
    console.warn(`PathGuard: Blocked traversal attempt: "${relativePath}"`);
    return null;
  }
}

/**
 * Resolve an absolute path from a vulnerability and verify it's in the workspace.
 * Handles both relative and absolute paths from scan results.
 */
export function resolveVulnerabilityPath(workspaceRoot: string, vulnFile: string): string {
  if (!vulnFile) throw new PathTraversalError('(empty)', workspaceRoot);

  // If already absolute, verify it's inside workspace
  if (path.isAbsolute(vulnFile)) {
    const absoluteRoot = path.resolve(workspaceRoot);
    const resolved = path.resolve(vulnFile);
    if (!resolved.startsWith(absoluteRoot + path.sep) && resolved !== absoluteRoot) {
      throw new PathTraversalError(vulnFile, workspaceRoot);
    }
    return resolved;
  }

  // Relative path — guard it
  return guardPath(workspaceRoot, vulnFile);
}

/**
 * Validate a list of AI-generated file paths, returning only safe ones.
 * Used in fix-service.ts when processing AI file plans.
 */
export function filterSafePaths(workspaceRoot: string, paths: string[]): string[] {
  return paths
    .map((p) => guardPathSafe(workspaceRoot, p))
    .filter((p): p is string => p !== null);
}

/**
 * Verify a file path for reading (must exist + be inside workspace).
 */
export function guardReadPath(workspaceRoot: string, filePath: string): string {
  const safe = resolveVulnerabilityPath(workspaceRoot, filePath);
  if (!fs.existsSync(safe)) {
    throw new Error(`File not found: "${safe}"`);
  }
  return safe;
}

/**
 * Normalize paths from the AI / chat UX to a safe absolute path inside the workspace.
 *
 * Chat users (and models) often pass `/src/server.js` meaning **workspace root**, not OS root.
 * Node's `path.resolve("/src/server.js")` would point at the filesystem root and writes fail
 * (model may wrongly say "read-only").
 */
export function normalizeAgentFilePath(workspaceRoot: string, filePath: string): string {
  if (!workspaceRoot || !filePath) {
    throw new PathTraversalError(filePath || '(empty)', workspaceRoot || '(no workspace)');
  }

  let decoded = filePath.trim().replace(/\0/g, '');
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    /* use as-is */
  }
  decoded = decoded.replace(/\\/g, path.sep);

  const absoluteRoot = path.resolve(workspaceRoot);
  const direct = path.resolve(decoded);

  // Already an absolute path inside the workspace
  if (direct.startsWith(absoluteRoot + path.sep) || direct === absoluteRoot) {
    return direct;
  }

  const stripLeadingSeparators = (s: string): string => {
    let out = s;
    while (out.startsWith(path.sep)) {
      out = out.slice(path.sep.length);
    }
    return out;
  };

  // "/src/app.js" or "\src\file" (chat = workspace root, not OS root) when not already a valid absolute path
  if (decoded.startsWith(path.sep)) {
    const relFromSlash = stripLeadingSeparators(decoded);
    if (relFromSlash) {
      const candidate = path.resolve(absoluteRoot, relFromSlash);
      if (candidate.startsWith(absoluteRoot + path.sep) || candidate === absoluteRoot) {
        return candidate;
      }
    }
  }

  // Plain relative (src/foo, ./src/foo)
  const rel = stripLeadingSeparators(decoded.replace(/^\.\//, ''));
  return guardPath(absoluteRoot, rel || '.');
}
