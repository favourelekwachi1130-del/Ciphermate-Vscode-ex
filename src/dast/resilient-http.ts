/**
 * Resilient HTTP Client for DAST
 *
 * - Retries: transient failures (network, 5xx, timeout)
 * - Exponential backoff
 * - Circuit breaker: pause after N consecutive 429/503
 * - Graceful degradation
 */

import { httpRequest, HttpRequestOptions, HttpResponse } from './http-client';

export interface ResilientHttpOptions extends HttpRequestOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  /** Pause duration when circuit opens (ms) */
  circuitBreakerPauseMs?: number;
  /** Consecutive 429/503 to trigger circuit */
  circuitBreakerThreshold?: number;
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

function isRetryable(status: number, error: boolean): boolean {
  if (error) return true;
  if (status === 0) return true; // network error
  if (status >= 500 && status <= 599) return true;
  if (status === 429 || status === 503) return true;
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

  let lastResponse: HttpResponse | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const backoff = retryDelayMs * Math.pow(2, attempt - 1);
      await delay(Math.min(backoff, 15000));
    }

    try {
      const resp = await httpRequest(opts);
      lastResponse = resp;

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
      if (attempt < maxRetries && isRetryable(0, true)) continue;
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
