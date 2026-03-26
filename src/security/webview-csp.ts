/**
 * Webview Content Security Policy
 *
 * Generates nonce-based CSP headers for every VS Code webview panel.
 * Prevents XSS by ensuring only nonce-tagged scripts execute — no inline
 * scripts, no eval(), no data: URIs, no external resources.
 *
 * Usage:
 *   const { nonce, csp } = generateWebviewCSP(panel.webview);
 *   // Inject nonce into every <script nonce="${nonce}"> and <style nonce="${nonce}">
 *   // Inject csp into <meta http-equiv="Content-Security-Policy" content="${csp}">
 */

import * as crypto from 'crypto';
import type { Webview } from 'vscode';

export interface WebviewCSP {
  /** Random nonce for this panel load — must be added to every script/style tag */
  nonce: string;
  /** Full CSP string to inject into the HTML meta tag */
  cspContent: string;
}

/**
 * Generate a fresh nonce and CSP policy for a webview.
 * Call once per panel HTML generation — nonce must be unique per page load.
 */
export function generateWebviewCSP(webview: Webview): WebviewCSP {
  const nonce = crypto.randomBytes(16).toString('base64');

  // webview.cspSource allows VS Code's own extension resource URIs (vscode-resource:)
  const cspContent = [
    `default-src 'none'`,
    // Scripts: only nonce-tagged inline scripts — no external URLs, no eval
    `script-src 'nonce-${nonce}'`,
    // Styles: nonce-tagged inline styles + VS Code's own resource host
    `style-src 'nonce-${nonce}' ${webview.cspSource}`,
    // Images: VS Code resources + data URIs for icons
    `img-src ${webview.cspSource} data:`,
    // Fonts: VS Code resources only
    `font-src ${webview.cspSource}`,
    // No frames, no objects, no workers
    `frame-src 'none'`,
    `object-src 'none'`,
    `worker-src 'none'`,
    // Connections: VS Code resource host only (no arbitrary fetch from webview)
    `connect-src 'none'`,
    // Block base tag hijacking
    `base-uri 'none'`,
    // Block form submissions
    `form-action 'none'`,
  ].join('; ');

  return { nonce, cspContent };
}

/**
 * Generate the <meta> CSP tag string.
 */
export function metaCSPTag(csp: WebviewCSP): string {
  return `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(csp.cspContent)}">`;
}

/**
 * Escape a string for safe use as an HTML attribute value.
 */
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * Head tags for a webview: CSP meta + nonce for inline script/style tags.
 */
export function webviewHeadSecurity(webview: Webview): { nonce: string; cspMetaTag: string } {
  const csp = generateWebviewCSP(webview);
  return { nonce: csp.nonce, cspMetaTag: metaCSPTag(csp) };
}

/**
 * Inject strict CSP and nonces into extension-generated webview HTML.
 * Call with the same Webview instance that will display the document.
 */
export function wrapWebviewHtml(webview: Webview, html: string): string {
  const { nonce, cspMetaTag } = webviewHeadSecurity(webview);
  let out = html;
  const viewportMatch = out.match(/<meta\s+name="viewport"[^>]*>/i);
  if (viewportMatch) {
    out = out.replace(viewportMatch[0], `${viewportMatch[0]}\n    ${cspMetaTag}`);
  } else {
    out = out.replace(/<head(\s[^>]*)?>/i, (m) => `${m}\n    ${cspMetaTag}`);
  }
  return out
    .replace(/<style>/g, `<style nonce="${nonce}">`)
    .replace(/<script>/g, `<script nonce="${nonce}">`);
}
