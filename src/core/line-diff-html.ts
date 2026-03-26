/**
 * Line-based diff for chat webview (red/green, Cursor-style).
 * No external deps — LCS on lines for modest file sizes.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type LineDiffOp = { t: 'eq' | 'ins' | 'del'; line: string };

/** Max combined lines before we skip heavy DP (avoids extension host freeze). */
const MAX_LINE_DP = 6000;

/**
 * Compute a Myers-style line diff via LCS dynamic programming.
 */
export function computeLineDiffOps(oldText: string, newText: string): LineDiffOp[] {
  const a = oldText.split(/\r?\n/);
  const b = newText.split(/\r?\n/);
  if (a.length + b.length > MAX_LINE_DP) {
    return [
      {
        t: 'eq',
        line:
          '[Diff skipped: file is very large. Click the panel below to open the edited file in the editor.]',
      },
    ];
  }
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  const ops: LineDiffOp[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.unshift({ t: 'eq', line: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ t: 'ins', line: b[j - 1] });
      j--;
    } else if (i > 0) {
      ops.unshift({ t: 'del', line: a[i - 1] });
      i--;
    }
  }
  return ops;
}

/** Collapse long runs of unchanged lines for readability (keep context). */
export function trimDiffOps(ops: LineDiffOp[], context = 3, maxShown = 400): LineDiffOp[] {
  if (ops.length <= maxShown) {
    return ops;
  }
  const out: LineDiffOp[] = [];
  let i = 0;
  while (i < ops.length && out.length < maxShown) {
    if (ops[i].t !== 'eq') {
      out.push(ops[i]);
      i++;
      continue;
    }
    let runStart = i;
    while (i < ops.length && ops[i].t === 'eq') {
      i++;
    }
    const runLen = i - runStart;
    if (runLen <= context * 2 + 1) {
      for (let k = runStart; k < i; k++) {
        out.push(ops[k]);
      }
      continue;
    }
    for (let k = runStart; k < runStart + context; k++) {
      out.push(ops[k]);
    }
    out.push({ t: 'eq', line: ` … (${runLen - context * 2} unchanged lines) … ` });
    for (let k = i - context; k < i; k++) {
      out.push(ops[k]);
    }
  }
  if (i < ops.length) {
    out.push({ t: 'eq', line: ' … (diff truncated for display; open file for full content) … ' });
  }
  return out;
}

export function lineDiffOpsToHtml(ops: LineDiffOp[]): string {
  const parts: string[] = [];
  for (const op of ops) {
    const esc = escapeHtml(op.line);
    if (op.t === 'eq') {
      parts.push(`<div class="cm-diff-line cm-diff-same"><span class="cm-diff-prefix"> </span><code>${esc}</code></div>`);
    } else if (op.t === 'del') {
      parts.push(`<div class="cm-diff-line cm-diff-del"><span class="cm-diff-prefix">−</span><code>${esc}</code></div>`);
    } else {
      parts.push(`<div class="cm-diff-line cm-diff-add"><span class="cm-diff-prefix">+</span><code>${esc}</code></div>`);
    }
  }
  return parts.join('');
}

export function buildFileEditDiffHtml(before: string, after: string): string {
  const ops = trimDiffOps(computeLineDiffOps(before, after));
  return lineDiffOpsToHtml(ops);
}
