/**
 * Base provider interface - EXACT match to Cyber-Claude CLI
 * Ported from: Cyber-Claude/src/agent/providers/base.ts
 */

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIProvider {
  /**
   * Send a message and get a response
   * EXACT signature from CLI
   */
  chat(messages: ConversationMessage[], systemPrompt: string): Promise<string>;

  /**
   * Get provider name
   * EXACT signature from CLI
   */
  getProviderName(): string;
}

