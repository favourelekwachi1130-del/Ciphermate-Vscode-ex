/**
 * Timing-based vulnerability detection
 *
 * Measures response times to detect blind SQLi, blind XPath, and similar.
 */

export interface TimingResult {
  url: string;
  paramName: string;
  payload: string;
  baselineMs: number;
  attackMs: number;
  deltaMs: number;
  thresholdMs: number;
  vulnerable: boolean;
}

const BLIND_THRESHOLD_MS = 4000;

export function isTimingAnomaly(
  baselineMs: number,
  attackMs: number,
  thresholdMs = BLIND_THRESHOLD_MS
): boolean {
  return attackMs >= thresholdMs && attackMs > baselineMs + (thresholdMs - 500);
}

export function measureTiming(
  fn: () => Promise<void>
): Promise<number> {
  const start = Date.now();
  return fn().then(() => Date.now() - start);
}
