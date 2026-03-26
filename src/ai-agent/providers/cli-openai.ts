/**
 * OpenAI Provider - EXACT port from Cyber-Claude CLI
 * Ported from: Cyber-Claude/src/agent/providers/openai.ts
 */

import OpenAI from 'openai';
import { AIProvider, AIChatOptions, ConversationMessage } from './cli-base';

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;
  private baseURL?: string;

  constructor(apiKey: string, model: string, maxTokens: number = 4096, baseURL?: string) {
    this.client = new OpenAI({ apiKey, ...(baseURL && { baseURL }) });
    this.model = model;
    this.maxTokens = maxTokens;
    this.baseURL = baseURL;
  }

  async chat(messages: ConversationMessage[], systemPrompt: string, options?: AIChatOptions): Promise<string> {
    try {
      const userImages = options?.userImages?.length ? options.userImages : undefined;
      const mapped = messages.map((msg, idx) => {
        const isLastUser =
          msg.role === 'user' && idx === messages.length - 1 && userImages && userImages.length > 0;
        if (isLastUser) {
          const parts: OpenAI.ChatCompletionContentPart[] = [
            { type: 'text', text: msg.content || '(see attached image)' }
          ];
          for (const img of userImages) {
            const mime = img.mimeType || 'image/png';
            parts.push({
              type: 'image_url',
              image_url: { url: `data:${mime};base64,${img.base64}` }
            });
          }
          return { role: 'user' as const, content: parts };
        }
        return {
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        };
      });

      const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...mapped
      ];

      console.log(`OpenAI: Sending message to OpenAI (${this.model})`);

      const response = await this.client.chat.completions.create(
        {
          model: this.model,
          max_tokens: this.maxTokens,
          messages: openaiMessages
        },
        { signal: options?.signal }
      );

      const content = response.choices[0]?.message?.content || '';

      console.log('OpenAI: Received response from OpenAI');
      return content;
    } catch (error: any) {
      console.error('OpenAI: Error communicating with OpenAI:', error);
      if (error?.name === 'AbortError' || options?.signal?.aborted) {
        throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
      }
      throw new Error(`OpenAI API error: ${error}`);
    }
  }

  getProviderName(): string {
    return this.baseURL?.includes('openrouter') ? 'OpenRouter' : 'OpenAI (ChatGPT)';
  }
}

