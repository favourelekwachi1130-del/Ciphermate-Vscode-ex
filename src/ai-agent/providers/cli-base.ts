/**
 * Base provider interface - EXACT match to Cyber-Claude CLI
 * Ported from: Cyber-Claude/src/agent/providers/base.ts
 */

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Optional args for chat (extension host); CLI parity preserved via optional param. */
export interface AIChatOptions {
  signal?: AbortSignal;
  /** If set, appended as vision parts on the last user turn (OpenAI/OpenRouter-compatible providers). */
  userImages?: Array<{ mimeType: string; base64: string }>;
}

export interface AIProvider {
  /**
   * Send a message and get a response
   * EXACT signature from CLI
   */
  chat(messages: ConversationMessage[], systemPrompt: string, options?: AIChatOptions): Promise<string>;

  /**
   * Get provider name
   * EXACT signature from CLI
   */
  getProviderName(): string;
}

