/**
 * Engine - BlueberryAI/Continue-style context and completion utilities
 */

export { ContextProvider, getContextProvider, ContextItem, ContextOptions } from './context-provider';
export {
  CompletionCache,
  CompletionDebouncer,
  postProcessCompletion,
  CompletionCacheKey,
  CompletionCacheEntry
} from './completion-cache';
export { resolveAtMentions, ResolvedMention } from './at-mentions';
