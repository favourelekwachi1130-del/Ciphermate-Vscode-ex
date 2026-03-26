/**
 * CipherMate Design Token System
 *
 * Single source of truth for all visual styling across every webview panel.
 * Injects a unified CSS variable layer on top of VS Code's theme variables.
 *
 * Design direction: precision security tool — dark, authoritative, tight.
 * Think Burp Suite Pro meets Linear. Clean grids, sharp edges with intentional radius,
 * clear severity signalling, no decoration for its own sake.
 */

import { getFontConfigCss, getFontApplyCss } from './font-config';

// ─────────────────────────────────────────────────────────────────────────────
// Brand accent — warm signal orange (already used in dashboard/results)
// ─────────────────────────────────────────────────────────────────────────────
export const BRAND_ACCENT = '#c47a3a';       // primary accent — scan results, CTA buttons, active states
export const BRAND_ACCENT_DIM = '#9a5e2a';   // pressed / active
export const BRAND_ACCENT_GLOW = 'rgba(196, 122, 58, 0.15)'; // focus rings, hover glows

// ─────────────────────────────────────────────────────────────────────────────
// Severity — consistent across ALL panels, theme-aware with opacity so
// they don't break on light themes
// ─────────────────────────────────────────────────────────────────────────────
export const SEVERITY_TOKENS = {
  critical: {
    bg: 'rgba(200, 30, 30, 0.15)',
    border: 'rgba(200, 30, 30, 0.6)',
    text: '#ef4444',
    solid: '#c41e1e',
    label: '#ffffff',
  },
  high: {
    bg: 'rgba(220, 100, 20, 0.12)',
    border: 'rgba(220, 100, 20, 0.5)',
    text: '#f97316',
    solid: '#dc6414',
    label: '#ffffff',
  },
  medium: {
    bg: 'rgba(202, 138, 4, 0.12)',
    border: 'rgba(202, 138, 4, 0.5)',
    text: '#eab308',
    solid: '#ca8a04',
    label: '#111111',
  },
  low: {
    bg: 'rgba(22, 163, 74, 0.10)',
    border: 'rgba(22, 163, 74, 0.4)',
    text: '#22c55e',
    solid: '#16a34a',
    label: '#ffffff',
  },
  info: {
    bg: 'rgba(14, 165, 233, 0.10)',
    border: 'rgba(14, 165, 233, 0.4)',
    text: '#38bdf8',
    solid: '#0ea5e9',
    label: '#ffffff',
  },
};

/**
 * Generate the shared CSS variable block that every webview panel should import.
 * Include at the top of every <style> block: ${getDesignTokensCSS()}
 */
export function getDesignTokensCSS(): string {
  return `
    :root {
      ${getFontConfigCss()}
      font-family: var(--ciphermate-font);

      /* ── Brand ───────────────────────────────────────────────────────── */
      --cm-accent:       ${BRAND_ACCENT};
      --cm-accent-dim:   ${BRAND_ACCENT_DIM};
      --cm-accent-glow:  ${BRAND_ACCENT_GLOW};
      --cm-accent-text:  #ffffff;

      /* ── Radius scale ────────────────────────────────────────────────── */
      /* Consistent across all panels — surgical, not rounded like a toy app */
      --cm-radius-xs:  2px;
      --cm-radius-sm:  4px;
      --cm-radius:     6px;
      --cm-radius-md:  8px;
      --cm-radius-lg:  12px;

      /* ── Spacing scale ───────────────────────────────────────────────── */
      --cm-space-1:  4px;
      --cm-space-2:  8px;
      --cm-space-3:  12px;
      --cm-space-4:  16px;
      --cm-space-5:  20px;
      --cm-space-6:  24px;
      --cm-space-8:  32px;
      --cm-space-10: 40px;
      --cm-space-12: 48px;

      /* ── Typography ──────────────────────────────────────────────────── */
      --cm-text-xs:   11px;
      --cm-text-sm:   12px;
      --cm-text-base: 13px;
      --cm-text-md:   14px;
      --cm-text-lg:   16px;
      --cm-text-xl:   18px;
      --cm-text-2xl:  22px;
      --cm-text-3xl:  28px;

      --cm-weight-normal:    400;
      --cm-weight-medium:    500;
      --cm-weight-semibold:  600;
      --cm-weight-bold:      700;

      --cm-leading-tight:  1.3;
      --cm-leading-normal: 1.5;
      --cm-leading-relaxed:1.7;

      /* ── Severity: theme-safe opacity-based colors ───────────────────── */
      --cm-critical-bg:     ${SEVERITY_TOKENS.critical.bg};
      --cm-critical-border: ${SEVERITY_TOKENS.critical.border};
      --cm-critical-text:   ${SEVERITY_TOKENS.critical.text};
      --cm-critical-solid:  ${SEVERITY_TOKENS.critical.solid};

      --cm-high-bg:         ${SEVERITY_TOKENS.high.bg};
      --cm-high-border:     ${SEVERITY_TOKENS.high.border};
      --cm-high-text:       ${SEVERITY_TOKENS.high.text};
      --cm-high-solid:      ${SEVERITY_TOKENS.high.solid};

      --cm-medium-bg:       ${SEVERITY_TOKENS.medium.bg};
      --cm-medium-border:   ${SEVERITY_TOKENS.medium.border};
      --cm-medium-text:     ${SEVERITY_TOKENS.medium.text};
      --cm-medium-solid:    ${SEVERITY_TOKENS.medium.solid};

      --cm-low-bg:          ${SEVERITY_TOKENS.low.bg};
      --cm-low-border:      ${SEVERITY_TOKENS.low.border};
      --cm-low-text:        ${SEVERITY_TOKENS.low.text};
      --cm-low-solid:       ${SEVERITY_TOKENS.low.solid};

      --cm-info-bg:         ${SEVERITY_TOKENS.info.bg};
      --cm-info-border:     ${SEVERITY_TOKENS.info.border};
      --cm-info-text:       ${SEVERITY_TOKENS.info.text};
      --cm-info-solid:      ${SEVERITY_TOKENS.info.solid};

      /* ── Shadow scale ────────────────────────────────────────────────── */
      --cm-shadow-xs:  0 1px 2px rgba(0, 0, 0, 0.08);
      --cm-shadow-sm:  0 1px 4px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08);
      --cm-shadow-md:  0 4px 8px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.10);
      --cm-shadow-lg:  0 8px 24px rgba(0, 0, 0, 0.18), 0 4px 8px rgba(0, 0, 0, 0.12);

      /* ── Transition ──────────────────────────────────────────────────── */
      --cm-transition-fast:   all 0.12s ease;
      --cm-transition:        all 0.18s ease;
      --cm-transition-slow:   all 0.28s ease;
    }
    ${getFontApplyCss()}

    /* ── Global reset (selective — not the nuclear border-radius: 0 !important) ── */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    /* ── Shared component primitives ─────────────────────────────────────── */

    /* Severity badges — unified across all panels */
    .cm-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: var(--cm-radius-sm);
      font-size: var(--cm-text-xs);
      font-weight: var(--cm-weight-bold);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      border: 1px solid transparent;
      white-space: nowrap;
    }
    .cm-badge.critical { background: var(--cm-critical-bg); color: var(--cm-critical-text); border-color: var(--cm-critical-border); }
    .cm-badge.high     { background: var(--cm-high-bg);     color: var(--cm-high-text);     border-color: var(--cm-high-border); }
    .cm-badge.medium   { background: var(--cm-medium-bg);   color: var(--cm-medium-text);   border-color: var(--cm-medium-border); }
    .cm-badge.low      { background: var(--cm-low-bg);      color: var(--cm-low-text);       border-color: var(--cm-low-border); }
    .cm-badge.info     { background: var(--cm-info-bg);     color: var(--cm-info-text);     border-color: var(--cm-info-border); }

    /* Buttons */
    .cm-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--cm-space-1);
      padding: var(--cm-space-2) var(--cm-space-4);
      font-family: var(--ciphermate-font);
      font-size: var(--cm-text-sm);
      font-weight: var(--cm-weight-medium);
      border-radius: var(--cm-radius-sm);
      cursor: pointer;
      transition: var(--cm-transition);
      border: 1px solid transparent;
      white-space: nowrap;
    }
    .cm-btn:disabled { opacity: 0.45; cursor: not-allowed; }

    .cm-btn-primary {
      background: var(--cm-accent);
      color: var(--cm-accent-text);
      border-color: var(--cm-accent-dim);
    }
    .cm-btn-primary:hover:not(:disabled) {
      background: var(--cm-accent-dim);
      box-shadow: 0 0 0 2px var(--cm-accent-glow);
    }

    .cm-btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border-color: var(--vscode-panel-border);
    }
    .cm-btn-secondary:hover:not(:disabled) {
      background: var(--vscode-button-secondaryHoverBackground);
      border-color: var(--cm-accent);
    }

    .cm-btn-ghost {
      background: transparent;
      color: var(--vscode-foreground);
      border-color: transparent;
    }
    .cm-btn-ghost:hover:not(:disabled) {
      background: var(--vscode-list-hoverBackground);
    }

    /* Cards */
    .cm-card {
      background: var(--vscode-panel-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: var(--cm-radius-md);
      overflow: hidden;
    }

    /* Stat card */
    .cm-stat-card {
      background: var(--vscode-panel-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: var(--cm-radius-md);
      padding: var(--cm-space-4) var(--cm-space-5);
      position: relative;
      overflow: hidden;
      transition: var(--cm-transition);
    }
    .cm-stat-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
    }
    .cm-stat-card.critical::before { background: var(--cm-critical-solid); }
    .cm-stat-card.high::before     { background: var(--cm-high-solid); }
    .cm-stat-card.medium::before   { background: var(--cm-medium-solid); }
    .cm-stat-card.low::before      { background: var(--cm-low-solid); }
    .cm-stat-card:hover {
      border-color: var(--cm-accent);
      box-shadow: var(--cm-shadow-sm);
      transform: translateY(-1px);
    }

    /* Input */
    .cm-input {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: var(--cm-radius-sm);
      padding: var(--cm-space-2) var(--cm-space-3);
      font-family: var(--ciphermate-font);
      font-size: var(--cm-text-md);
      transition: var(--cm-transition-fast);
      width: 100%;
    }
    .cm-input:focus {
      outline: none;
      border-color: var(--cm-accent);
      box-shadow: 0 0 0 2px var(--cm-accent-glow);
    }

    /* Divider */
    .cm-divider {
      border: none;
      border-top: 1px solid var(--vscode-panel-border);
      margin: var(--cm-space-4) 0;
    }

    /* Label */
    .cm-label {
      font-size: var(--cm-text-xs);
      font-weight: var(--cm-weight-medium);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
    }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--vscode-scrollbarSlider-hoverBackground); }
  `;
}

/**
 * Shared severity badge HTML helper — use in all panels for consistency.
 */
export function severityBadge(severity: string): string {
  const s = severity?.toLowerCase() ?? 'info';
  const labels: Record<string, string> = {
    critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info'
  };
  return `<span class="cm-badge ${s}">${labels[s] ?? s}</span>`;
}
