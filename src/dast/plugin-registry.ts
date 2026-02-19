/**
 * DAST Plugin Registry - Extensible attack modules
 *
 * Register custom attack plugins for org-specific payloads and checks.
 */

import { DastAttackPlugin, DastEndpoint, DastAttackResult, DastAuth } from './types';
import { httpRequest } from './http-client';

const plugins: DastAttackPlugin[] = [];

export function registerPlugin(plugin: DastAttackPlugin): void {
  if (!plugins.find(p => p.id === plugin.id)) {
    plugins.push(plugin);
  }
}

export function getPlugins(): DastAttackPlugin[] {
  return [...plugins];
}

export function clearPlugins(): void {
  plugins.length = 0;
}

/** Create HTTP wrapper for plugins */
export function createHttpContext(auth?: DastAuth, timeout = 10000) {
  return {
    httpRequest: async (opts: { url: string; method: string; headers?: Record<string, string>; body?: string }) => {
      const res = await httpRequest({
        url: opts.url,
        method: opts.method,
        headers: opts.headers,
        body: opts.body,
        auth,
        timeout,
      });
      return res;
    },
  };
}

/** Run all registered plugins */
export async function runPlugins(
  endpoints: DastEndpoint[],
  baseUrl: string,
  auth?: DastAuth,
  timeout = 10000
): Promise<DastAttackResult[]> {
  const vulns: DastAttackResult[] = [];
  const ctx = createHttpContext(auth, timeout);

  for (const plugin of plugins) {
    try {
      for (const ep of endpoints.slice(0, 10)) {
        const results = await plugin.run(
          ep,
          baseUrl,
          auth,
          ctx as any
        );
        vulns.push(...results);
      }
    } catch (e) {
      console.warn(`DAST plugin ${plugin.id} failed:`, e);
    }
  }

  return vulns;
}
