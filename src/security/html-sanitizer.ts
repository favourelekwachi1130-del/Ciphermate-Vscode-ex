/**
 * HTML Sanitizer
 *
 * Sanitizes untrusted strings before injection into webview innerHTML.
 * Used for: AI responses, scan result titles, vulnerability descriptions,
 * pentest findings — anything that originates from an external source.
 *
 * Strategy: allowlist-based tag and attribute stripping.
 * No DOMPurify (browser-only), no jsdom (too heavy for VS Code extension).
 * This is a defense-in-depth layer — the primary defense is nonce-based CSP.
 */

/** Tags allowed in sanitized output */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'strong', 'em', 'b', 'i', 'u', 'code', 'pre', 'kbd', 'samp',
  'blockquote', 'q',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'span', 'div', 'section', 'article',
  'details', 'summary',
  'dl', 'dt', 'dd',
  'mark', 'del', 'ins',
]);

/** Attributes allowed per tag (empty set = no attrs allowed) */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  'a':    new Set([]),   // <a> completely stripped — no href to prevent javascript: URIs
  'code': new Set(['class']),   // for syntax highlighting class names
  'pre':  new Set(['class']),
  'span': new Set(['class']),
  'div':  new Set(['class']),
  'td':   new Set(['colspan', 'rowspan']),
  'th':   new Set(['colspan', 'rowspan', 'scope']),
  'table': new Set(['class']),
};

const DEFAULT_ALLOWED_ATTRS = new Set<string>(); // all others: no attributes

/** Dangerous patterns that should never appear even in text nodes */
const DANGEROUS_PATTERNS = [
  /javascript:/gi,
  /vbscript:/gi,
  /data:text\/html/gi,
  /on\w+\s*=/gi,  // onclick=, onload=, etc.
];

/**
 * Escape HTML special characters in a plain text string.
 * Use for any user/AI-controlled content that should NOT contain HTML.
 */
export function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

/**
 * Sanitize HTML from untrusted sources (AI responses, scan tool output, etc.).
 * Strips disallowed tags, strips disallowed attributes, removes dangerous patterns.
 *
 * For plain text that should never contain HTML markup, use escapeHtml() instead.
 */
export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';

  // Step 1: Remove dangerous patterns from the raw string before any parsing
  let clean = html;
  for (const pattern of DANGEROUS_PATTERNS) {
    clean = clean.replace(pattern, '[removed]');
  }

  // Step 2: Strip/allowlist tags using regex (lightweight, no DOM dependency)
  // Replace all tags: keep allowed ones (with filtered attrs), strip disallowed ones
  clean = clean.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g, (match, tagName) => {
    const tag = tagName.toLowerCase();

    // Closing tags for allowed tags: pass through (no attributes on closing tags)
    if (match.startsWith('</')) {
      return ALLOWED_TAGS.has(tag) ? `</${tag}>` : '';
    }

    // Self-closing or opening tags for allowed tags
    if (ALLOWED_TAGS.has(tag)) {
      const allowedAttrs = ALLOWED_ATTRS[tag] ?? DEFAULT_ALLOWED_ATTRS;
      if (allowedAttrs.size === 0) {
        return match.endsWith('/>') ? `<${tag}/>` : `<${tag}>`;
      }
      // Filter attributes
      const attrs = filterAttributes(match, allowedAttrs);
      return match.endsWith('/>') ? `<${tag}${attrs}/>` : `<${tag}${attrs}>`;
    }

    // Disallowed tag: remove entirely but keep content (non-destructive strip)
    return '';
  });

  // Step 3: Verify no dangerous content slipped through encoding tricks
  // (e.g., double-encoded &#106;avascript:)
  clean = clean.replace(/&#[xX]?[0-9a-fA-F]+;/g, (entity) => {
    // Allow common safe entities only
    const safe = ['&amp;', '&lt;', '&gt;', '&quot;', '&#39;', '&nbsp;', '&#96;'];
    return safe.includes(entity) ? entity : '';
  });

  return clean;
}

function filterAttributes(tag: string, allowedAttrs: Set<string>): string {
  const attrRegex = /\s([a-zA-Z][a-zA-Z0-9\-]*)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*))?/g;
  let filtered = '';
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(tag)) !== null) {
    const attrName = m[1].toLowerCase();
    if (allowedAttrs.has(attrName)) {
      // Additional check: no javascript: in attribute values
      const fullAttr = m[0];
      if (!DANGEROUS_PATTERNS.some((p) => p.test(fullAttr))) {
        filtered += fullAttr;
      }
    }
  }
  return filtered;
}

/**
 * Sanitize a vulnerability title or short description.
 * Strips ALL HTML — plain text only.
 */
export function sanitizeVulnTitle(title: string): string {
  return escapeHtml(String(title ?? '').trim().slice(0, 500));
}

/**
 * Sanitize a URL for safe use in href or src attributes.
 * Only allows http:, https:, and vscode-resource: schemes.
 */
export function sanitizeUrl(url: string): string {
  const s = String(url ?? '').trim();
  if (/^https?:\/\//i.test(s) || /^vscode-resource:/i.test(s)) return escapeAttr(s);
  return '#'; // block everything else
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
