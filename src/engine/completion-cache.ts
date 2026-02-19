/**
 * Completion Cache - Debounce and cache for AI-powered inline completions
 * Based on Continue's autocomplete patterns (Phase 1.2)
 */

export interface CompletionCacheKey {
  filePath: string;
  line: number;
  prefixHash: string;
}

export interface CompletionCacheEntry {
  completion: string;
  timestamp: number;
}

const DEBOUNCE_MS = 300;
const CACHE_TTL_MS = 60_000; // 1 minute
const MAX_CACHE_SIZE = 100;

/**
 * Simple hash for prefix content (first N chars of line)
 */
function hashPrefix(prefix: string): string {
  let h = 0;
  for (let i = 0; i < Math.min(prefix.length, 200); i++) {
    h = ((h << 5) - h) + prefix.charCodeAt(i) | 0;
  }
  return String(h >>> 0);
}

/**
 * Debouncer for completion requests
 */
export class CompletionDebouncer {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastTrigger = 0;

  debounce(fn: () => void): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.lastTrigger = Date.now();
      fn();
    }, DEBOUNCE_MS);
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  getDebounceMs(): number {
    return DEBOUNCE_MS;
  }
}

/**
 * Cache for AI completions by file + position + prefix
 * Reduces redundant LLM calls when user backspaces or re-types
 */
export class CompletionCache {
  private cache = new Map<string, CompletionCacheEntry>();
  private keyOrder: string[] = [];

  private makeKey(filePath: string, line: number, prefix: string): string {
    return `${filePath}:${line}:${hashPrefix(prefix)}`;
  }

  get(filePath: string, line: number, prefix: string): string | null {
    const key = this.makeKey(filePath, line, prefix);
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(key);
      this.keyOrder = this.keyOrder.filter(k => k !== key);
      return null;
    }
    return entry.completion;
  }

  set(filePath: string, line: number, prefix: string, completion: string): void {
    const key = this.makeKey(filePath, line, prefix);
    this.cache.set(key, { completion, timestamp: Date.now() });
    this.keyOrder = this.keyOrder.filter(k => k !== key).concat(key);
    while (this.keyOrder.length > MAX_CACHE_SIZE) {
      const evict = this.keyOrder.shift();
      if (evict) this.cache.delete(evict);
    }
  }

  clear(): void {
    this.cache.clear();
    this.keyOrder = [];
  }
}

/**
 * Post-process completion: strip repetition, fix indentation, stop at logical boundaries
 */
export function postProcessCompletion(raw: string, baseIndent?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let out = raw.trimEnd();

  // Remove obvious repetition (e.g. "foo foo foo" -> "foo")
  const words = out.split(/\s+/);
  if (words.length >= 3) {
    const lastTwo = words.slice(-2).join(' ');
    const prev = words.slice(0, -2).join(' ');
    if (prev.endsWith(lastTwo)) {
      out = words.slice(0, -2).join(' ');
    }
  }

  // Stop at common statement boundaries
  const stopPatterns = [
    /\n\n\n+/,  // triple newline
    /;\s*$/,   // semicolon at end
    /\{\s*$/,  // brace
  ];
  for (const re of stopPatterns) {
    const m = out.match(re);
    if (m && m.index !== undefined) {
      out = out.slice(0, m.index + m[0].length);
    }
  }

  return out;
}
