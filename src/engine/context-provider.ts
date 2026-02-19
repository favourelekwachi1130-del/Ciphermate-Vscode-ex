/**
 * Context Provider - Multi-source code context (Continue-style)
 * Phase 1.1: File prefix/suffix, LSP definitions, imported files
 */

import * as vscode from 'vscode';
import * as path from 'path';

export interface ContextItem {
  type: 'prefix' | 'suffix' | 'lsp' | 'import' | 'recent';
  content: string;
  label?: string;
}

export interface ContextOptions {
  prefixLines?: number;
  suffixLines?: number;
  includeLsp?: boolean;
  includeRecentFiles?: number;
}

const DEFAULT_PREFIX_LINES = 30;
const DEFAULT_SUFFIX_LINES = 15;
const DEFAULT_RECENT_FILES = 3;

export class ContextProvider {
  private recentFileUris: vscode.Uri[] = [];
  private readonly maxRecent = 20;

  constructor() {
    vscode.workspace.onDidOpenTextDocument(doc => {
      if (doc.uri.scheme === 'file' && !this.recentFileUris.some(u => u.fsPath === doc.uri.fsPath)) {
        this.recentFileUris.unshift(doc.uri);
        this.recentFileUris = this.recentFileUris.slice(0, this.maxRecent);
      }
    });
  }

  /**
   * Get multi-source context for a position in a document
   */
  async getContextForPosition(
    document: vscode.TextDocument,
    position: vscode.Position,
    options: ContextOptions = {}
  ): Promise<ContextItem[]> {
    const prefixLines = options.prefixLines ?? DEFAULT_PREFIX_LINES;
    const suffixLines = options.suffixLines ?? DEFAULT_SUFFIX_LINES;
    const includeLsp = options.includeLsp ?? true;
    const includeRecent = options.includeRecentFiles ?? 0;

    const items: ContextItem[] = [];

    // 1. File prefix (lines before cursor)
    const prefixStart = Math.max(0, position.line - prefixLines);
    const prefixContent: string[] = [];
    for (let i = prefixStart; i < position.line; i++) {
      prefixContent.push(document.lineAt(i).text);
    }
    if (prefixContent.length > 0) {
      items.push({
        type: 'prefix',
        content: prefixContent.join('\n'),
        label: `File prefix (${prefixContent.length} lines)`
      });
    }

    // 2. File suffix (lines after cursor)
    const suffixEnd = Math.min(document.lineCount - 1, position.line + suffixLines);
    const suffixContent: string[] = [];
    for (let i = position.line + 1; i <= suffixEnd; i++) {
      suffixContent.push(document.lineAt(i).text);
    }
    if (suffixContent.length > 0) {
      items.push({
        type: 'suffix',
        content: suffixContent.join('\n'),
        label: `File suffix (${suffixContent.length} lines)`
      });
    }

    // 3. LSP context: definitions/references for symbol at position
    if (includeLsp) {
      const lspContent = await this.getLspContext(document, position);
      if (lspContent) {
        items.push({
          type: 'lsp',
          content: lspContent,
          label: 'LSP definitions'
        });
      }
    }

    // 4. Recent files (snippets from recently opened files in same workspace)
    if (includeRecent > 0) {
      const recentContent = await this.getRecentFilesContext(document, includeRecent);
      if (recentContent) {
        items.push({
          type: 'recent',
          content: recentContent,
          label: 'Recent files'
        });
      }
    }

    return items;
  }

  private async getLspContext(document: vscode.TextDocument, position: vscode.Position): Promise<string | null> {
    try {
      const range = document.getWordRangeAtPosition(position);
      if (!range) return null;

      const word = document.getText(range);
      if (!word || word.length < 2) return null;

      // Get definitions
      const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeDefinitionProvider',
        document.uri,
        position
      );

      const parts: string[] = [];
      if (definitions && definitions.length > 0) {
        for (const def of definitions.slice(0, 3)) {
          if (def.uri.fsPath !== document.uri.fsPath) {
            try {
              const doc = await vscode.workspace.openTextDocument(def.uri);
              const line = doc.lineAt(def.range.start.line).text;
              parts.push(`  ${path.basename(def.uri.fsPath)}:${def.range.start.line + 1}: ${line.trim()}`);
            } catch {
              // skip
            }
          }
        }
      }

      if (parts.length === 0) return null;
      return `Definitions for "${word}":\n` + parts.join('\n');
    } catch {
      return null;
    }
  }

  private async getRecentFilesContext(currentDoc: vscode.TextDocument, count: number): Promise<string | null> {
    const workspaceRoot = vscode.workspace.getWorkspaceFolder(currentDoc.uri)?.uri.fsPath;
    if (!workspaceRoot) return null;

    const parts: string[] = [];
    let added = 0;

    for (const uri of this.recentFileUris) {
      if (added >= count) break;
      if (uri.fsPath === currentDoc.uri.fsPath) continue;
      if (!uri.fsPath.startsWith(workspaceRoot)) continue;

      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        const lines = doc.getText().split('\n').slice(0, 15).join('\n');
        if (lines.trim().length > 0) {
          parts.push(`--- ${path.relative(workspaceRoot, uri.fsPath)} ---\n${lines}`);
          added++;
        }
      } catch {
        // skip
      }
    }

    return parts.length > 0 ? parts.join('\n\n') : null;
  }

  /**
   * Get a simple code context string (backward compatible with getCodeContext)
   */
  async getCodeContextString(
    documentOrPath: vscode.TextDocument | string,
    lineNumber: number,
    options?: { before?: number; after?: number }
  ): Promise<string> {
    const before = options?.before ?? 5;
    const after = options?.after ?? 5;

    let document: vscode.TextDocument;
    if (typeof documentOrPath === 'string') {
      try {
        document = await vscode.workspace.openTextDocument(vscode.Uri.file(documentOrPath));
      } catch {
        return 'Unable to read file context';
      }
    } else {
      document = documentOrPath;
    }

    const start = Math.max(0, lineNumber - 1 - before);
    const end = Math.min(document.lineCount - 1, lineNumber - 1 + after);
    const lines: string[] = [];
    for (let i = start; i <= end; i++) {
      lines.push(document.lineAt(i).text);
    }
    return lines.join('\n');
  }
}

let _contextProvider: ContextProvider | null = null;

export function getContextProvider(): ContextProvider {
  if (!_contextProvider) {
    _contextProvider = new ContextProvider();
  }
  return _contextProvider;
}
