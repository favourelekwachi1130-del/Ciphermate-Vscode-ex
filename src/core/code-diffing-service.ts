/**
 * Code Diffing Service
 * 
 * Owns all code diffing logic:
 * - Unified diff generation
 * - Context-aware diffs
 * - Code patching algorithms
 * - Line-by-line comparison
 * - Hunk calculation
 * 
 * NO dependencies on Mastra or AI frameworks.
 */

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

export interface DiffResult {
  filePath: string;
  unified: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  changes: number;
}

export class CodeDiffingService {
  /**
   * Generate unified diff between two code strings
   */
  generateDiff(original: string, modified: string, filePath: string): DiffResult {
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');

    const hunks = this.computeHunks(originalLines, modifiedLines);
    const unified = this.createUnifiedDiff(originalLines, modifiedLines, filePath, hunks);

    const additions = this.countAdditions(originalLines, modifiedLines);
    const deletions = this.countDeletions(originalLines, modifiedLines);

    return {
      filePath,
      unified,
      hunks,
      additions,
      deletions,
      changes: additions + deletions,
    };
  }

  /**
   * Generate context-aware diff
   */
  generateContextDiff(
    original: string,
    modified: string,
    filePath: string,
    startLine: number,
    contextLines: number = 3
  ): DiffResult {
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');

    // Extract context around the change
    const contextStart = Math.max(0, startLine - contextLines);
    const contextEnd = Math.min(originalLines.length, startLine + contextLines);

    const contextOriginal = originalLines.slice(contextStart, contextEnd);
    const contextModified = modifiedLines.slice(contextStart, contextEnd);

    const hunks = this.computeHunks(contextOriginal, contextModified);
    const unified = this.createUnifiedDiff(
      contextOriginal,
      contextModified,
      filePath,
      hunks,
      contextStart + 1
    );

    return {
      filePath,
      unified,
      hunks,
      additions: this.countAdditions(contextOriginal, contextModified),
      deletions: this.countDeletions(contextOriginal, contextModified),
      changes: 0,
    };
  }

  /**
   * Compute diff hunks using longest common subsequence
   */
  private computeHunks(original: string[], modified: string[]): DiffHunk[] {
    const hunks: DiffHunk[] = [];
    const lcs = this.longestCommonSubsequence(original, modified);

    let oldIndex = 0;
    let newIndex = 0;
    let lcsIndex = 0;

    while (oldIndex < original.length || newIndex < modified.length) {
      // Find next common line
      let commonStart = oldIndex;
      let commonEnd = oldIndex;

      while (
        lcsIndex < lcs.length &&
        oldIndex < original.length &&
        original[oldIndex] === lcs[lcsIndex]
      ) {
        oldIndex++;
        newIndex++;
        lcsIndex++;
        commonEnd = oldIndex;
      }

      // If there are changes, create a hunk
      if (oldIndex < original.length || newIndex < modified.length) {
        const hunkStart = commonStart;
        let hunkOldEnd = oldIndex;
        let hunkNewEnd = newIndex;

        // Collect all changes until next common sequence
        while (
          (oldIndex < original.length && original[oldIndex] !== lcs[lcsIndex]) ||
          (newIndex < modified.length && modified[newIndex] !== lcs[lcsIndex])
        ) {
          if (oldIndex < original.length && original[oldIndex] !== lcs[lcsIndex]) {
            oldIndex++;
            hunkOldEnd = oldIndex;
          }
          if (newIndex < modified.length && modified[newIndex] !== lcs[lcsIndex]) {
            newIndex++;
            hunkNewEnd = newIndex;
          }
        }

        // Create hunk
        const hunkLines: string[] = [];
        for (let i = hunkStart; i < hunkOldEnd; i++) {
          hunkLines.push(`-${original[i]}`);
        }
        for (let i = commonStart; i < hunkNewEnd; i++) {
          if (i < modified.length) {
            hunkLines.push(`+${modified[i]}`);
          }
        }

        hunks.push({
          oldStart: hunkStart + 1,
          oldCount: hunkOldEnd - hunkStart,
          newStart: commonStart + 1,
          newCount: hunkNewEnd - commonStart,
          lines: hunkLines,
        });
      }
    }

    return hunks;
  }

  /**
   * Longest Common Subsequence algorithm
   */
  private longestCommonSubsequence(a: string[], b: string[]): string[] {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    // Build DP table
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Reconstruct LCS
    const lcs: string[] = [];
    let i = m;
    let j = n;

    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        lcs.unshift(a[i - 1]);
        i--;
        j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }

    return lcs;
  }

  /**
   * Create unified diff format string
   */
  private createUnifiedDiff(
    original: string[],
    modified: string[],
    filePath: string,
    hunks: DiffHunk[],
    lineOffset: number = 0
  ): string {
    const lines: string[] = [];

    // Header
    lines.push(`--- a/${filePath}`);
    lines.push(`+++ b/${filePath}`);

    // Hunks
    for (const hunk of hunks) {
      lines.push(
        `@@ -${hunk.oldStart + lineOffset},${hunk.oldCount} +${hunk.newStart + lineOffset},${hunk.newCount} @@`
      );
      lines.push(...hunk.lines);
    }

    return lines.join('\n');
  }

  /**
   * Count additions
   */
  private countAdditions(original: string[], modified: string[]): number {
    let additions = 0;
    const lcs = this.longestCommonSubsequence(original, modified);

    let originalIndex = 0;
    let modifiedIndex = 0;
    let lcsIndex = 0;

    while (modifiedIndex < modified.length) {
      if (lcsIndex < lcs.length && modified[modifiedIndex] === lcs[lcsIndex]) {
        modifiedIndex++;
        originalIndex++;
        lcsIndex++;
      } else {
        additions++;
        modifiedIndex++;
      }
    }

    return additions;
  }

  /**
   * Count deletions
   */
  private countDeletions(original: string[], modified: string[]): number {
    let deletions = 0;
    const lcs = this.longestCommonSubsequence(original, modified);

    let originalIndex = 0;
    let modifiedIndex = 0;
    let lcsIndex = 0;

    while (originalIndex < original.length) {
      if (lcsIndex < lcs.length && original[originalIndex] === lcs[lcsIndex]) {
        originalIndex++;
        modifiedIndex++;
        lcsIndex++;
      } else {
        deletions++;
        originalIndex++;
      }
    }

    return deletions;
  }

  /**
   * Apply patch to code
   */
  applyPatch(original: string, diff: DiffResult): string {
    const originalLines = original.split('\n');
    const result: string[] = [];
    let originalIndex = 0;

    for (const hunk of diff.hunks) {
      // Add unchanged lines before hunk
      while (originalIndex < hunk.oldStart - 1) {
        result.push(originalLines[originalIndex]);
        originalIndex++;
      }

      // Process hunk
      for (const line of hunk.lines) {
        if (line.startsWith('-')) {
          // Deletion - skip original line
          originalIndex++;
        } else if (line.startsWith('+')) {
          // Addition - add new line
          result.push(line.substring(1));
        } else {
          // Context - keep original line
          result.push(originalLines[originalIndex]);
          originalIndex++;
        }
      }
    }

    // Add remaining unchanged lines
    while (originalIndex < originalLines.length) {
      result.push(originalLines[originalIndex]);
      originalIndex++;
    }

    return result.join('\n');
  }
}

// Singleton instance
let codeDiffingServiceInstance: CodeDiffingService | null = null;

export function getCodeDiffingService(): CodeDiffingService {
  if (!codeDiffingServiceInstance) {
    codeDiffingServiceInstance = new CodeDiffingService();
  }
  return codeDiffingServiceInstance;
}
