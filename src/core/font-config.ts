/**
 * Font configuration for CipherMate UI.
 * Lets users choose their preferred fonts via settings.
 */

import * as vscode from 'vscode';

const DEFAULT_UI_FONT = '-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, \'Helvetica Neue\', Arial, sans-serif';
const DEFAULT_CODE_FONT = '\'Consolas\', \'Monaco\', \'Cascadia Code\', monospace';

export interface FontConfig {
  fontFamily: string;
  fontFamilyCode: string;
}

/**
 * Get font configuration from user settings.
 * For webviews: uses CSS variables when empty so VS Code theme applies.
 * For standalone HTML (export, War Room in browser): use raw values.
 */
export function getFontConfig(): FontConfig {
  const config = vscode.workspace.getConfiguration('ciphermate');
  const custom = (config.get<string>('fontFamily') || '').trim();
  const customCode = (config.get<string>('fontFamilyCode') || '').trim();
  return {
    fontFamily: custom || 'var(--vscode-font-family, ' + DEFAULT_UI_FONT + ')',
    fontFamilyCode: customCode || 'var(--vscode-editor-font-family, ' + DEFAULT_CODE_FONT + ')',
  };
}

/** Get raw font values for standalone HTML (no VS Code variables) */
export function getFontConfigRaw(): FontConfig {
  const config = vscode.workspace.getConfiguration('ciphermate');
  const custom = (config.get<string>('fontFamily') || '').trim();
  const customCode = (config.get<string>('fontFamilyCode') || '').trim();
  return {
    fontFamily: custom || DEFAULT_UI_FONT,
    fontFamilyCode: customCode || DEFAULT_CODE_FONT,
  };
}

/**
 * Get CSS custom properties for font injection into webview HTML.
 * Use in a :root or body rule.
 */
export function getFontConfigCss(): string {
  const { fontFamily, fontFamilyCode } = getFontConfig();
  return `--ciphermate-font: ${fontFamily}; --ciphermate-font-code: ${fontFamilyCode};`;
}

/**
 * Get CSS rules that apply font settings to body and code elements.
 * Use after :root { getFontConfigCss() } so the variables are defined.
 */
export function getFontApplyCss(): string {
  return `body, .cm-root, .vscode-body { font-family: var(--ciphermate-font) !important; }
    code, pre, .cm-code, [data-code] { font-family: var(--ciphermate-font-code) !important; }`;
}
