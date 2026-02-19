/**
 * DAST - Surface Monitoring v2
 *
 * AI-powered runtime testing for web apps & APIs.
 * Replaces StackHawk & Intruder. Insanely powerful.
 */

export * from './types';
export * from './attack-payloads';
export * from './endpoint-discovery';
export * from './response-analyzer';
export {
  runWithConcurrency,
  getAdaptiveDelay,
  httpRequest,
  toCurl,
  type HttpRequestOptions,
  type HttpResponse as DastHttpResponse,
} from './http-client';
export * from './report-generator';
export * from './dast-scanner';
export * from './attacks';
export * from './plugin-registry';
