/**
 * OpenAI Provider - EXACT port from Cyber-Claude CLI
 * Ported from: Cyber-Claude/src/agent/providers/openai.ts
 */

import OpenAI from 'openai';
import { AIProvider, ConversationMessage } from './cli-base';

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;

  constructor(apiKey: string, model: string, maxTokens: number = 4096) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
    this.maxTokens = maxTokens;
  }

  async chat(messages: ConversationMessage[], systemPrompt: string): Promise<string> {
    try {
      // Convert to OpenAI message format with system prompt first
      const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...messages.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        }))
      ];

      console.log(`OpenAI: Sending message to OpenAI (${this.model})`);

      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: openaiMessages,
      });

      const content = response.choices[0]?.message?.content || '';

      console.log('OpenAI: Received response from OpenAI');
      return content;
    } catch (error) {
      console.error('OpenAI: Error communicating with OpenAI:', error);
      throw new Error(`OpenAI API error: ${error}`);
    }
  }

  getProviderName(): string {
    return 'OpenAI (ChatGPT)';
  }
}

