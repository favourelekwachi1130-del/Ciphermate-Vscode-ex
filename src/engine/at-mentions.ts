/**
 * @-Mention resolution for chat - @file, @codebase, etc.
 * Phase 3.1 of BLUEBERRYAI_IMPLEMENTATION_ROADMAP
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface ResolvedMention {
  type: 'file' | 'codebase' | 'scan';
  raw: string;
  content: string;
  label: string;
}

// Match @file followed by path - supports compound extensions (e.g. .php7.2.py, .d.ts)
const FILE_PATTERN = /@file\s+([^\s@]+)/gi;
const FILE_QUOTED_PATTERN = /@file\s+"([^"]+)"/gi;

async function findFileInWorkspace(relPath: string): Promise<string | null> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return null;

  const normalized = relPath.replace(/^\.\//, '').replace(/\\/g, '/');
  for (const folder of folders) {
    const fullPath = path.join(folder.uri.fsPath, normalized);
    if (fs.existsSync(fullPath)) {
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) return fullPath;
      } catch {
        // skip
      }
    }
    // Also try without leading path (search by basename) or partial match
    const basename = path.basename(normalized);
    if (basename === normalized || !path.isAbsolute(relPath)) {
      const found = await vscode.workspace.findFiles(
        `**/${basename}`,
        '**/node_modules/**',
        10
      );
      // Prefer exact basename match
      const exactMatch = found.find(u => path.basename(u.fsPath) === basename);
      if (exactMatch) return exactMatch.fsPath;
      if (found.length > 0) return found[0].fsPath;
    }
  }
  return null;
}

export async function resolveAtMentions(message: string): Promise<{
  enriched: string;
  addedContext: ResolvedMention[];
  cleanedMessage: string;
}> {
  const addedContext: ResolvedMention[] = [];
  let cleanedMessage = message;

  const fileRefs = new Set<string>();
  let m: RegExpExecArray | null;

  const resetFileRegex = () => {
    FILE_PATTERN.lastIndex = 0;
    FILE_QUOTED_PATTERN.lastIndex = 0;
  };

  while ((m = FILE_PATTERN.exec(message)) !== null) {
    fileRefs.add(m[1].trim());
  }
  resetFileRegex();
  while ((m = FILE_QUOTED_PATTERN.exec(message)) !== null) {
    fileRefs.add(m[1].trim());
  }
  resetFileRegex();

  const contextParts: string[] = [];

  for (const ref of fileRefs) {
    const filePath = await findFileInWorkspace(ref);
    if (filePath) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const label = path.relative(
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
          filePath
        );
        addedContext.push({
          type: 'file',
          raw: `@file ${ref}`,
          content,
          label
        });
        contextParts.push(`[File: ${label}]\n\`\`\`\n${content}\n\`\`\``);
      } catch {
        // Skip if we can't read
      }
    }
  }

  let enriched = message;
  if (contextParts.length > 0) {
    enriched = `[User added the following file(s) for context]\n\n${contextParts.join('\n\n')}\n\n---\n\n[User message]\n${message}`;
  }

  return { enriched, addedContext, cleanedMessage };
}
