/**
 * Claude Provider - EXACT port from Cyber-Claude CLI
 * Ported from: Cyber-Claude/src/agent/providers/claude.ts
 */

import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, ConversationMessage } from './cli-base';

export class ClaudeProvider implements AIProvider {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(apiKey: string, model: string, maxTokens: number = 4096) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.maxTokens = maxTokens;
  }

  async chat(messages: ConversationMessage[], systemPrompt: string): Promise<string> {
    try {
      // Convert to Anthropic message format
      const anthropicMessages: Anthropic.MessageParam[] = messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      console.log(`Claude: Sending message to Claude (${this.model})`);

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: anthropicMessages,
      });

      // Extract text from response
      const assistantMessage = response.content
        .filter((block) => block.type === 'text')
        .map((block) => (block as Anthropic.TextBlock).text)
        .join('\n');

      console.log('Claude: Received response from Claude');
      return assistantMessage;
    } catch (error) {
      console.error('Claude: Error communicating with Claude:', error);
      throw new Error(`Claude API error: ${error}`);
    }
  }

  getProviderName(): string {
    return 'Claude (Anthropic)';
  }
}

