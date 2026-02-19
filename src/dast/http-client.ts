/**
 * DAST HTTP Client - Parallel requests with adaptive throttling
 */

import { DastAuth } from './types';

export interface HttpRequestOptions {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string | Buffer | Uint8Array;
  auth?: DastAuth;
  timeout?: number;
}

export interface HttpResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
  durationMs?: number;
}

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': 'CipherMate-DAST/2.0',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
};

export const BRUTAL_USER_AGENT = 'CipherMate-Inferno/1.0 (DAST-Brutal)';

/** Run with concurrency limit */
export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;

  async function worker(): Promise<void> {
    while (idx < items.length) {
      const i = idx++;
      if (i >= items.length) break;
      try {
        results[i] = await fn(items[i], i);
      } catch (e) {
        (results as any)[i] = undefined;
      }
    }
  }

  const workers = Array(Math.min(concurrency, items.length)).fill(null).map(() => worker());
  await Promise.all(workers);
  return results;
}

/** Adaptive delay - backs off on 429/503 */
export function getAdaptiveDelay(
  status: number,
  lastDelay: number,
  rateLimitHeader?: string
): number {
  if (status === 429 || status === 503) {
    const retryAfter = rateLimitHeader ? parseInt(rateLimitHeader, 10) * 1000 : 5000;
    return Math.max(lastDelay * 2, retryAfter, 2000);
  }
  return lastDelay;
}

/** Execute HTTP request */
export async function httpRequest(opts: HttpRequestOptions): Promise<HttpResponse> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = opts.timeout ?? 10000;
  const tid = setTimeout(() => controller.abort(), timeout);

  const headers: Record<string, string> = { ...DEFAULT_HEADERS, ...opts.headers };
  if (opts.auth?.type === 'bearer' && opts.auth.credentials) {
    headers['Authorization'] = `Bearer ${opts.auth.credentials}`;
  }
  if (opts.auth?.type === 'apiKey' && opts.auth.headerName && opts.auth.credentials) {
    headers[opts.auth.headerName] = opts.auth.credentials;
  }
  if (opts.auth?.type === 'basic' && opts.auth.username && opts.auth.password) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${opts.auth.username}:${opts.auth.password}`).toString('base64');
  }

  try {
    const res = await fetch(opts.url, {
      method: opts.method,
      headers,
      body: opts.body,
      signal: controller.signal,
    });

    const h: Record<string, string> = {};
    res.headers.forEach((v, k) => (h[k.toLowerCase()] = v));

    const text = await res.text();
    clearTimeout(tid);
    return {
      status: res.status,
      body: text,
      headers: h,
      durationMs: Date.now() - start,
    };
  } catch (e: any) {
    clearTimeout(tid);
    return {
      status: 0,
      body: e.message || 'Request failed',
      headers: {},
      durationMs: Date.now() - start,
    };
  }
}

/** Generate curl command for replay */
export function toCurl(opts: HttpRequestOptions, payload?: string): string {
  const h = { ...DEFAULT_HEADERS, ...opts.headers };
  if (opts.auth?.type === 'bearer' && opts.auth.credentials) {
    h['Authorization'] = `Bearer ${opts.auth.credentials}`;
  }
  const headerArgs = Object.entries(h)
    .map(([k, v]) => `-H '${k}: ${v.replace(/'/g, "'\\''")}'`)
    .join(' ');
  const method = opts.method !== 'GET' ? `-X ${opts.method}` : '';
  const body = opts.body
    ? typeof opts.body === 'string'
      ? `-d '${opts.body.replace(/'/g, "'\\''")}'`
      : `--data-binary @-  # (binary body - paste request body)`
    : '';
  const parts = ['curl', method, headerArgs, `'${opts.url}'`, body].filter(Boolean);
  return parts.join(' ');
}
