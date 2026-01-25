/**
 * Diff Generator for Vulnerability Fixes
 *
 * Generates unified diff format and HTML diff for displaying
 * fix previews to users before they confirm changes.
 */

import { FixDiff } from './types';

export class DiffGenerator {
  /**
   * Generate a unified diff between original and fixed code
   */
  generateUnifiedDiff(original: string, fixed: string, filePath: string): FixDiff {
    const originalLines = original.split('\n');
    const fixedLines = fixed.split('\n');

    // Calculate additions and deletions
    const additions = this.countAdditions(originalLines, fixedLines);
    const deletions = this.countDeletions(originalLines, fixedLines);

    // Generate unified diff format
    const unified = this.createUnifiedDiff(originalLines, fixedLines, filePath);

    // Generate HTML diff
    const html = this.createHtmlDiff(originalLines, fixedLines);

    return {
      filePath,
      unified,
      html,
      additions,
      deletions,
      originalLines,
      newLines: fixedLines
    };
  }

  /**
   * Generate a context-aware diff showing surrounding lines
   */
  generateContextDiff(
    original: string,
    fixed: string,
    filePath: string,
    startLine: number,
    contextLines: number = 3
  ): FixDiff {
    const originalLines = original.split('\n');
    const fixedLines = fixed.split('\n');

    // Get context range
    const contextStart = Math.max(0, startLine - 1 - contextLines);
    const contextEnd = Math.min(originalLines.length, startLine - 1 + originalLines.length + contextLines);

    // Create diff with context
    const unified = this.createContextualUnifiedDiff(
      originalLines,
      fixedLines,
      filePath,
      startLine,
      contextLines
    );

    const html = this.createHtmlDiff(originalLines, fixedLines);

    return {
      filePath,
      unified,
      html,
      additions: this.countAdditions(originalLines, fixedLines),
      deletions: this.countDeletions(originalLines, fixedLines),
      originalLines,
      newLines: fixedLines
    };
  }

  /**
   * Create unified diff format string
   */
  private createUnifiedDiff(originalLines: string[], fixedLines: string[], filePath: string): string {
    const lines: string[] = [];

    // Header
    lines.push(`--- a/${filePath}`);
    lines.push(`+++ b/${filePath}`);

    // Find the differences using LCS-based approach
    const hunks = this.computeHunks(originalLines, fixedLines);

    for (const hunk of hunks) {
      // Hunk header
      lines.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`);

      // Hunk content
      for (const line of hunk.lines) {
        lines.push(line);
      }
    }

    return lines.join('\n');
  }

  /**
   * Create contextual unified diff with surrounding lines
   */
  private createContextualUnifiedDiff(
    originalLines: string[],
    fixedLines: string[],
    filePath: string,
    startLine: number,
    contextLines: number
  ): string {
    const lines: string[] = [];

    // Header
    lines.push(`--- a/${filePath}`);
    lines.push(`+++ b/${filePath}`);

    const oldStart = Math.max(1, startLine - contextLines);
    const oldCount = originalLines.length + contextLines * 2;
    const newCount = fixedLines.length + contextLines * 2;

    // Hunk header
    lines.push(`@@ -${oldStart},${oldCount} +${oldStart},${newCount} @@`);

    // Context before
    const fullOriginalLines = originalLines;
    for (let i = startLine - 1 - contextLines; i < startLine - 1 && i >= 0; i++) {
      // We don't have access to full file, so skip context for now
    }

    // Deletions (original lines)
    for (const line of originalLines) {
      lines.push(`-${line}`);
    }

    // Additions (fixed lines)
    for (const line of fixedLines) {
      lines.push(`+${line}`);
    }

    return lines.join('\n');
  }

  /**
   * Create HTML diff for webview display
   */
  private createHtmlDiff(originalLines: string[], fixedLines: string[]): string {
    const rows: string[] = [];

    // Table header
    rows.push('<table class="diff-table">');
    rows.push('<thead><tr><th>Original</th><th>Fixed</th></tr></thead>');
    rows.push('<tbody>');

    // Compute line-by-line diff
    const maxLines = Math.max(originalLines.length, fixedLines.length);

    for (let i = 0; i < maxLines; i++) {
      const origLine = originalLines[i];
      const fixedLine = fixedLines[i];

      rows.push('<tr>');

      // Original line
      if (origLine !== undefined) {
        const isDeletion = fixedLine === undefined || origLine !== fixedLine;
        const cssClass = isDeletion ? 'diff-deletion' : 'diff-unchanged';
        rows.push(`<td class="${cssClass}"><pre>${this.escapeHtml(origLine)}</pre></td>`);
      } else {
        rows.push('<td class="diff-empty"></td>');
      }

      // Fixed line
      if (fixedLine !== undefined) {
        const isAddition = origLine === undefined || origLine !== fixedLine;
        const cssClass = isAddition ? 'diff-addition' : 'diff-unchanged';
        rows.push(`<td class="${cssClass}"><pre>${this.escapeHtml(fixedLine)}</pre></td>`);
      } else {
        rows.push('<td class="diff-empty"></td>');
      }

      rows.push('</tr>');
    }

    rows.push('</tbody>');
    rows.push('</table>');

    // Add CSS styles
    const css = `
      <style>
        .diff-table {
          width: 100%;
          border-collapse: collapse;
          font-family: monospace;
          font-size: 13px;
        }
        .diff-table th {
          background: var(--vscode-editor-background);
          border: 1px solid var(--vscode-panel-border);
          padding: 8px;
          text-align: left;
        }
        .diff-table td {
          border: 1px solid var(--vscode-panel-border);
          padding: 4px 8px;
          vertical-align: top;
        }
        .diff-table pre {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-all;
        }
        .diff-deletion {
          background: rgba(255, 0, 0, 0.15);
          color: var(--vscode-errorForeground);
        }
        .diff-addition {
          background: rgba(0, 255, 0, 0.15);
          color: var(--vscode-gitDecoration-addedResourceForeground);
        }
        .diff-unchanged {
          background: transparent;
        }
        .diff-empty {
          background: var(--vscode-editor-background);
        }
      </style>
    `;

    return css + rows.join('\n');
  }

  /**
   * Generate a side-by-side HTML diff
   */
  generateSideBySideHtml(original: string, fixed: string): string {
    const originalLines = original.split('\n');
    const fixedLines = fixed.split('\n');

    const rows: string[] = [];

    rows.push('<div class="side-by-side-diff">');

    // Original side
    rows.push('<div class="diff-pane original-pane">');
    rows.push('<div class="diff-header">Original</div>');
    rows.push('<div class="diff-content">');
    for (let i = 0; i < originalLines.length; i++) {
      const line = originalLines[i];
      const fixedLine = fixedLines[i];
      const isChanged = fixedLine === undefined || line !== fixedLine;
      const cssClass = isChanged ? 'line-removed' : 'line-unchanged';
      rows.push(`<div class="diff-line ${cssClass}"><span class="line-number">${i + 1}</span><span class="line-content">${this.escapeHtml(line)}</span></div>`);
    }
    rows.push('</div></div>');

    // Fixed side
    rows.push('<div class="diff-pane fixed-pane">');
    rows.push('<div class="diff-header">Fixed</div>');
    rows.push('<div class="diff-content">');
    for (let i = 0; i < fixedLines.length; i++) {
      const line = fixedLines[i];
      const origLine = originalLines[i];
      const isChanged = origLine === undefined || line !== origLine;
      const cssClass = isChanged ? 'line-added' : 'line-unchanged';
      rows.push(`<div class="diff-line ${cssClass}"><span class="line-number">${i + 1}</span><span class="line-content">${this.escapeHtml(line)}</span></div>`);
    }
    rows.push('</div></div>');

    rows.push('</div>');

    // Add CSS
    const css = `
      <style>
        .side-by-side-diff {
          display: flex;
          gap: 16px;
          font-family: var(--vscode-editor-font-family);
          font-size: 13px;
        }
        .diff-pane {
          flex: 1;
          border: 1px solid var(--vscode-panel-border);
          overflow: hidden;
        }
        .diff-header {
          background: var(--vscode-sideBarSectionHeader-background);
          padding: 8px 12px;
          font-weight: 600;
          border-bottom: 1px solid var(--vscode-panel-border);
        }
        .diff-content {
          max-height: 400px;
          overflow-y: auto;
        }
        .diff-line {
          display: flex;
          padding: 2px 8px;
          border-bottom: 1px solid var(--vscode-panel-border);
        }
        .line-number {
          width: 40px;
          text-align: right;
          padding-right: 12px;
          color: var(--vscode-editorLineNumber-foreground);
          user-select: none;
        }
        .line-content {
          flex: 1;
          white-space: pre-wrap;
          word-break: break-all;
        }
        .line-removed {
          background: rgba(255, 0, 0, 0.1);
        }
        .line-added {
          background: rgba(0, 255, 0, 0.1);
        }
        .line-unchanged {
          background: transparent;
        }
      </style>
    `;

    return css + rows.join('\n');
  }

  /**
   * Generate inline diff with markers
   */
  generateInlineDiff(original: string, fixed: string): string {
    const originalLines = original.split('\n');
    const fixedLines = fixed.split('\n');

    const lines: string[] = [];

    // Show deletions
    for (const line of originalLines) {
      lines.push(`<span class="deletion">- ${this.escapeHtml(line)}</span>`);
    }

    // Show additions
    for (const line of fixedLines) {
      lines.push(`<span class="addition">+ ${this.escapeHtml(line)}</span>`);
    }

    const css = `
      <style>
        .deletion {
          display: block;
          background: rgba(255, 0, 0, 0.15);
          color: var(--vscode-errorForeground);
          padding: 2px 8px;
          font-family: monospace;
        }
        .addition {
          display: block;
          background: rgba(0, 255, 0, 0.15);
          color: var(--vscode-gitDecoration-addedResourceForeground);
          padding: 2px 8px;
          font-family: monospace;
        }
      </style>
    `;

    return css + `<div class="inline-diff">${lines.join('\n')}</div>`;
  }

  /**
   * Compute diff hunks for unified diff format
   */
  private computeHunks(
    originalLines: string[],
    fixedLines: string[]
  ): Array<{
    oldStart: number;
    oldCount: number;
    newStart: number;
    newCount: number;
    lines: string[];
  }> {
    const hunks: Array<{
      oldStart: number;
      oldCount: number;
      newStart: number;
      newCount: number;
      lines: string[];
    }> = [];

    // Simple diff: treat entire block as one hunk
    const hunk = {
      oldStart: 1,
      oldCount: originalLines.length,
      newStart: 1,
      newCount: fixedLines.length,
      lines: [] as string[]
    };

    // Add deletions
    for (const line of originalLines) {
      hunk.lines.push(`-${line}`);
    }

    // Add additions
    for (const line of fixedLines) {
      hunk.lines.push(`+${line}`);
    }

    hunks.push(hunk);

    return hunks;
  }

  /**
   * Count additions between original and fixed
   */
  private countAdditions(originalLines: string[], fixedLines: string[]): number {
    let additions = 0;

    for (const line of fixedLines) {
      if (!originalLines.includes(line)) {
        additions++;
      }
    }

    // Also count if fixed has more lines
    if (fixedLines.length > originalLines.length) {
      additions += fixedLines.length - originalLines.length;
    }

    return Math.max(additions, fixedLines.length);
  }

  /**
   * Count deletions between original and fixed
   */
  private countDeletions(originalLines: string[], fixedLines: string[]): number {
    let deletions = 0;

    for (const line of originalLines) {
      if (!fixedLines.includes(line)) {
        deletions++;
      }
    }

    return Math.max(deletions, originalLines.length);
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Get change statistics for a diff
   */
  getChangeStats(original: string, fixed: string): {
    additions: number;
    deletions: number;
    changes: number;
    unchanged: number;
  } {
    const originalLines = original.split('\n');
    const fixedLines = fixed.split('\n');

    const additions = this.countAdditions(originalLines, fixedLines);
    const deletions = this.countDeletions(originalLines, fixedLines);

    // Count unchanged lines
    let unchanged = 0;
    for (const line of originalLines) {
      if (fixedLines.includes(line)) {
        unchanged++;
      }
    }

    return {
      additions,
      deletions,
      changes: additions + deletions,
      unchanged
    };
  }
}
