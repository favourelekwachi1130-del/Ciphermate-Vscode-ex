/**
 * Claude Provider - EXACT port from Cyber-Claude CLI
 * Ported from: Cyber-Claude/src/agent/providers/claude.ts
 */

import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, AIChatOptions, ConversationMessage } from './cli-base';

export class ClaudeProvider implements AIProvider {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(apiKey: string, model: string, maxTokens: number = 4096) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.maxTokens = maxTokens;
  }

  async chat(messages: ConversationMessage[], systemPrompt: string, options?: AIChatOptions): Promise<string> {
    try {
      const userImages = options?.userImages?.length ? options.userImages : undefined;

      const toMediaType = (mime: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' => {
        const m = (mime || '').toLowerCase();
        if (m.includes('png')) return 'image/png';
        if (m.includes('gif')) return 'image/gif';
        if (m.includes('webp')) return 'image/webp';
        return 'image/jpeg';
      };

      // Convert to Anthropic message format; attach images to the last user turn only
      const anthropicMessages: Anthropic.MessageParam[] = messages.map((msg, idx) => {
        const isLastUser =
          msg.role === 'user' && idx === messages.length - 1 && userImages && userImages.length > 0;
        if (isLastUser) {
          const blocks: Anthropic.ContentBlockParam[] = [];
          for (const img of userImages) {
            const mediaType = toMediaType(img.mimeType || 'image/jpeg');
            blocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: img.base64,
              },
            });
          }
          blocks.push({
            type: 'text',
            text: msg.content || '(see attached image(s))',
          });
          return { role: 'user' as const, content: blocks };
        }
        return {
          role: msg.role,
          content: msg.content,
        };
      });

      console.log(`Claude: Sending message to Claude (${this.model})`);

      const response = await (this.client.messages.create as any)(
        {
          model: this.model,
          max_tokens: this.maxTokens,
          system: systemPrompt,
          messages: anthropicMessages,
        },
        options?.signal ? { signal: options.signal } : undefined
      );

      // Extract text from response
      const assistantMessage = response.content
        .filter((block: Anthropic.ContentBlock) => block.type === 'text')
        .map((block: Anthropic.ContentBlock) => (block as Anthropic.TextBlock).text)
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

