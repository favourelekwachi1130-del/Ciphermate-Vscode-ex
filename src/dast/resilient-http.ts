/**
 * Resilient HTTP Client for DAST
 *
 * - Retries: transient failures (network, 5xx, timeout, 403 when retryOn403)
 * - Exponential backoff
 * - WAF evasion: rotate browser-like headers on 403 retry
 * - Circuit breaker: pause after N consecutive 429/503 (disabled in unrestricted)
 */

import { httpRequest, HttpRequestOptions, HttpResponse } from './http-client';
import { getEvasionHeaders } from './waf-evasion';

export interface ResilientHttpOptions extends HttpRequestOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  /** Pause duration when circuit opens (ms) */
  circuitBreakerPauseMs?: number;
  /** Consecutive 429/503 to trigger circuit */
  circuitBreakerThreshold?: number;
  /** Retry 403 (Cloudflare/WAF block) with rotated browser headers */
  retryOn403?: boolean;
  /** URL for evasion header generation (e.g. Origin, Referer) */
  evasionUrl?: string;
}

export interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  open: boolean;
}

const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000;
const DEFAULT_CIRCUIT_PAUSE = 30000;
const DEFAULT_CIRCUIT_THRESHOLD = 5;

/** Shared circuit breaker per target origin */
const circuitByOrigin = new Map<string, CircuitBreakerState>();

function getOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

function isRetryable(status: number, error: boolean, retryOn403: boolean): boolean {
  if (error) return true;
  if (status === 0) return true; // network error
  if (status >= 500 && status <= 599) return true;
  if (status === 429 || status === 503) return true;
  if (retryOn403 && status === 403) return true; // Cloudflare/WAF block - retry with evasion
  return false;
}

/** Sleep helper */
function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Execute HTTP request with retries and circuit breaker.
 * Uses circuit breaker per target origin to avoid hammering rate-limited targets.
 */
export async function httpRequestWithRetry(opts: ResilientHttpOptions): Promise<HttpResponse> {
  const maxRetries = opts.maxRetries ?? DEFAULT_RETRIES;
  const retryDelayMs = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY;
  const circuitPause = opts.circuitBreakerPauseMs ?? DEFAULT_CIRCUIT_PAUSE;
  const circuitThreshold = opts.circuitBreakerThreshold ?? DEFAULT_CIRCUIT_THRESHOLD;

  const origin = getOrigin(opts.url);
  let state = circuitByOrigin.get(origin);
  if (!state) {
    state = { failures: 0, lastFailureTime: 0, open: false };
    circuitByOrigin.set(origin, state);
  }

  if (state.open) {
    const elapsed = Date.now() - state.lastFailureTime;
    if (elapsed < circuitPause) {
      return {
        status: 503,
        body: `Circuit breaker open for ${origin}. Retry after ${Math.ceil((circuitPause - elapsed) / 1000)}s.`,
        headers: {},
        durationMs: 0,
      };
    }
    state.open = false;
    state.failures = 0;
  }

  const retryOn403 = opts.retryOn403 ?? false;
  const evasionUrl = opts.evasionUrl ?? opts.url;
  let lastResponse: HttpResponse | null = null;
  let currentOpts = { ...opts };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const baseBackoff = retryDelayMs * Math.pow(2, attempt - 1);
      const maxBackoff = retryOn403 ? 45000 : 15000; // longer backoff for WAF evasion
      await delay(Math.min(baseBackoff, maxBackoff));
      if (retryOn403) {
        currentOpts = { ...currentOpts, headers: { ...currentOpts.headers, ...getEvasionHeaders(evasionUrl) } };
      }
    }

    try {
      const resp = await httpRequest(currentOpts);
      lastResponse = resp;

      if (resp.status === 403 && retryOn403 && attempt < maxRetries) continue;
      if (resp.status === 429 || resp.status === 503) {
        state.failures++;
        state.lastFailureTime = Date.now();
        if (state.failures >= circuitThreshold) {
          state.open = true;
        }
        if (attempt < maxRetries) continue;
      } else {
        state.failures = 0;
      }

      return resp;
    } catch (e) {
      lastResponse = {
        status: 0,
        body: e instanceof Error ? e.message : String(e),
        headers: {},
        durationMs: 0,
      };
      if (attempt < maxRetries && isRetryable(0, true, retryOn403)) continue;
      throw e;
    }
  }

  return lastResponse!;
}

/** Reset circuit breaker for an origin (e.g. before new scan) */
export function resetCircuitBreaker(url?: string): void {
  if (url) {
    circuitByOrigin.delete(getOrigin(url));
  } else {
    circuitByOrigin.clear();
  }
}
