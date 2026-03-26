/**
 * CipherMate API Provider
 *
 * The primary AI provider for all CipherMate users.
 * Calls api.ciphermate.ai — CipherMate's own backend — using the user's
 * CipherMate token (cm-xxx). The backend routes to Anthropic, OpenAI,
 * Gemini, etc. using CipherMate's own API keys.
 *
 * Users NEVER need their own API keys. Just like Cursor.
 *
 * Flow:
 *   Scripter (default): Always calls api.ciphermate.ai — no user API key required.
 *   - With cm-xxx token (from ciphermate.ai): premium plan, higher limits.
 *   - Without token: anonymous free tier — backend allocates min free tokens.
 *   Other providers (openrouter, anthropic, etc.): only when user explicitly selects them.
 *
 * The backend API is OpenAI-compatible so any OpenAI SDK / tool works with it.
 */

import * as https from 'https';
import * as http from 'http';
import { BaseAIProvider, AIRequest, AIResponse, ProviderConfig } from './base-provider';

export const CIPHERMATE_API_BASE = 'https://api.ciphermate.ai';
export const CIPHERMATE_API_V1 = `${CIPHERMATE_API_BASE}/v1`;

export const CIPHERMATE_TOKEN_PREFIX = 'cm-';

/** Check if a token is a CipherMate-issued token */
export function isCiphermateToken(token: string | undefined): boolean {
  return !!token && token.startsWith(CIPHERMATE_TOKEN_PREFIX);
}

// ─────────────────────────────────────────────────────────────────────────────
// Model catalog — all models available through CipherMate
// Users select these, not raw provider slugs
// ─────────────────────────────────────────────────────────────────────────────

export interface CiphermateModel {
  /** Internal ID sent to api.ciphermate.ai */
  id: string;
  /** User-facing name (shown in model picker) */
  displayName: string;
  /** Provider that powers it (transparent to users) */
  provider: 'anthropic' | 'openai' | 'google' | 'meta' | 'mistral' | 'openrouter';
  /** Category for the picker */
  category: 'scripter' | 'claude' | 'openai' | 'google' | 'open';
  /** Context window */
  contextLength: number;
  /** Whether available on all plans */
  freeWithCiphermate: boolean;
  /** Short capability label */
  capability: 'fast' | 'balanced' | 'powerful' | 'max';
}

export const CIPHERMATE_MODELS: CiphermateModel[] = [
  // ── Scripter (single tier: best for all tasks; OpenRouter now, fine-tune later) ───
  { id: 'scripter', displayName: 'Scripter', provider: 'openrouter', category: 'scripter', contextLength: 200000, freeWithCiphermate: true, capability: 'max' },

  // ── Claude models ────────────────────────────────────────────────────────
  { id: 'claude-3-5-haiku-20241022',     displayName: 'Claude 3.5 Haiku',    provider: 'anthropic', category: 'claude', contextLength: 200000, freeWithCiphermate: true,  capability: 'fast' },
  { id: 'claude-3-5-sonnet-20241022',    displayName: 'Claude 3.5 Sonnet',   provider: 'anthropic', category: 'claude', contextLength: 200000, freeWithCiphermate: true,  capability: 'balanced' },
  { id: 'claude-sonnet-4-20250514',      displayName: 'Claude Sonnet 4',     provider: 'anthropic', category: 'claude', contextLength: 200000, freeWithCiphermate: false, capability: 'powerful' },
  { id: 'claude-opus-4-20250514',        displayName: 'Claude Opus 4',       provider: 'anthropic', category: 'claude', contextLength: 200000, freeWithCiphermate: false, capability: 'max' },

  // ── OpenAI models ────────────────────────────────────────────────────────
  { id: 'gpt-4o-mini',  displayName: 'GPT-4o mini',   provider: 'openai', category: 'openai', contextLength: 128000, freeWithCiphermate: true,  capability: 'fast' },
  { id: 'gpt-4o',       displayName: 'GPT-4o',        provider: 'openai', category: 'openai', contextLength: 128000, freeWithCiphermate: false, capability: 'balanced' },
  { id: 'o3-mini',      displayName: 'o3-mini',       provider: 'openai', category: 'openai', contextLength: 128000, freeWithCiphermate: false, capability: 'powerful' },
  { id: 'o3',           displayName: 'o3',            provider: 'openai', category: 'openai', contextLength: 128000, freeWithCiphermate: false, capability: 'max' },

  // ── Google models ────────────────────────────────────────────────────────
  { id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash',   provider: 'google', category: 'google', contextLength: 1000000, freeWithCiphermate: true,  capability: 'fast' },
  { id: 'gemini-2.5-pro',   displayName: 'Gemini 2.5 Pro',     provider: 'google', category: 'google', contextLength: 1000000, freeWithCiphermate: false, capability: 'powerful' },

  // ── Open source ───────────────────────────────────────────────────────────
  { id: 'meta-llama-3.1-70b-instruct',  displayName: 'Llama 3.1 70B',   provider: 'meta',    category: 'open', contextLength: 128000, freeWithCiphermate: true,  capability: 'balanced' },
  { id: 'mistral-large-latest',         displayName: 'Mistral Large',   provider: 'mistral', category: 'open', contextLength: 128000, freeWithCiphermate: false, capability: 'balanced' },
];

export const DEFAULT_CIPHERMATE_MODEL = 'scripter';

export function getModelById(id: string): CiphermateModel | undefined {
  return CIPHERMATE_MODELS.find((m) => m.id === id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export class CiphermateApiProvider extends BaseAIProvider {
  private baseUrl: string;

  constructor(config: ProviderConfig) {
    super(config);
    this.baseUrl = config.apiUrl || CIPHERMATE_API_V1;
  }

  getName(): string { return 'CipherMate'; }

  getSupportedModels(): string[] {
    return CIPHERMATE_MODELS.map((m) => m.id);
  }

  async callAI(request: AIRequest): Promise<AIResponse> {
    const MAX_RETRIES = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) await sleep(Math.min(1000 * Math.pow(2, attempt - 1), 8000));
      try {
        return await this.singleCall(request);
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        const msg = lastError.message;
        // Don't retry on auth/billing errors
        if (msg.includes('401') || msg.includes('402') || msg.includes('403')) throw lastError;
        // Retry on 429 / 5xx
      }
    }
    throw lastError ?? new Error('CipherMate API: all retry attempts exhausted');
  }

  private singleCall(request: AIRequest): Promise<AIResponse> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model: this.config.model || DEFAULT_CIPHERMATE_MODEL,
        messages: request.messages,
        ...(request.tools && { tools: request.tools }),
        temperature: request.temperature ?? 0.7,
        max_tokens: request.max_tokens || 8192,
        ...(request.stream !== undefined && { stream: request.stream }),
      });

      const url = new URL(`${this.baseUrl}/chat/completions`);
      const lib = url.protocol === 'https:' ? https : http;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(body)),
        'X-CipherMate-Client': '1.1.0',
        'X-CipherMate-Extension': 'vscode',
      };
      if (this.config.apiKey && this.config.apiKey.trim()) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      } else {
        headers['X-CipherMate-Anonymous'] = '1';
      }

      const req = lib.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers,
          timeout: this.config.timeout || 60000,
        },
        (res) => {
          let data = '';
          res.on('data', (c) => { data += c; });
          res.on('end', () => {
            try {
              const status = res.statusCode ?? 0;

              if (status === 401) {
                reject(new Error('CipherMate: 401 — token invalid or expired. Re-activate at ciphermate.ai'));
                return;
              }
              if (status === 402) {
                reject(new Error('CipherMate: 402 — no credits remaining. Top up at ciphermate.ai/billing'));
                return;
              }
              if (status === 403) {
                reject(new Error('CipherMate: 403 — this model requires a higher plan. Upgrade at ciphermate.ai/plans'));
                return;
              }
              if (status === 429) {
                reject(new Error(`CipherMate: 429 — rate limited. Retry in a moment.`));
                return;
              }
              if (status >= 500) {
                reject(new Error(`CipherMate: server error (${status}). Auto-retrying.`));
                return;
              }
              if (status >= 400) {
                reject(new Error(`CipherMate API error (${status}): ${data.slice(0, 200)}`));
                return;
              }

              const parsed = JSON.parse(data);
              resolve({
                content: parsed.choices?.[0]?.message?.content ?? '',
                tool_calls: parsed.choices?.[0]?.message?.tool_calls,
                finish_reason: parsed.choices?.[0]?.finish_reason,
                usage: parsed.usage,
                model: parsed.model,
              });
            } catch (e) {
              reject(new Error(`CipherMate: invalid response — ${e instanceof Error ? e.message : String(e)}`));
            }
          });
          res.on('error', reject);
        }
      );
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('CipherMate: request timed out')); });
      req.write(body);
      req.end();
    });
  }

  /** Lightweight connection test — uses /v1/models (no tokens spent) */
  async testConnection(): Promise<{ success: boolean; error?: string; latency?: number }> {
    const start = Date.now();
    return new Promise((resolve) => {
      const url = new URL(`${this.baseUrl}/models`);
      const headers: Record<string, string> = {};
      if (this.config.apiKey && this.config.apiKey.trim()) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      } else {
        headers['X-CipherMate-Anonymous'] = '1';
      }
      const req = https.request(
        {
          hostname: url.hostname, port: 443, path: url.pathname, method: 'GET',
          headers,
          timeout: 10000,
        },
        (res) => {
          res.resume();
          const ms = Date.now() - start;
          if (res.statusCode === 200) resolve({ success: true, latency: ms });
          else if (res.statusCode === 401) resolve({ success: false, error: 'Invalid token', latency: ms });
          else resolve({ success: false, error: `HTTP ${res.statusCode}`, latency: ms });
        }
      );
      req.on('error', (e) => resolve({ success: false, error: e.message, latency: Date.now() - start }));
      req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'timeout', latency: Date.now() - start }); });
      req.end();
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
