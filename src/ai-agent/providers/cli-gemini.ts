/**
 * Gemini Provider - EXACT port from Cyber-Claude CLI
 * Ported from: Cyber-Claude/src/agent/providers/gemini.ts
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIProvider, AIChatOptions, ConversationMessage } from './cli-base';

export class GeminiProvider implements AIProvider {
  private client: GoogleGenerativeAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  async chat(messages: ConversationMessage[], systemPrompt: string, options?: AIChatOptions): Promise<string> {
    try {
      const userImages = options?.userImages?.length ? options.userImages : undefined;
      console.log(`Gemini: Sending message to Gemini (${this.model})`);

      const genModel = this.client.getGenerativeModel({
        model: this.model,
        systemInstruction: systemPrompt,
      });

      // Convert conversation history to Gemini format
      const history = messages.slice(0, -1).map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

      // Get the last user message
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role !== 'user') {
        throw new Error('Last message must be from user');
      }

      // Create chat session with history
      const chat = genModel.startChat({
        history: history,
      });

      const mimeOrDefault = (m: string) => {
        const x = (m || '').toLowerCase();
        if (x.includes('png')) return 'image/png';
        if (x.includes('gif')) return 'image/gif';
        if (x.includes('webp')) return 'image/webp';
        return 'image/jpeg';
      };

      const lastParts: Array<
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
      > = [{ text: lastMessage.content || '(see attached image(s))' }];
      if (userImages?.length) {
        for (const img of userImages) {
          lastParts.push({
            inlineData: {
              mimeType: mimeOrDefault(img.mimeType || 'image/jpeg'),
              data: img.base64,
            },
          });
        }
      }

      const sendPromise = chat.sendMessage(lastParts).then((result) => result.response.text());

      const text = options?.signal
        ? await Promise.race([
            sendPromise,
            new Promise<string>((_, reject) => {
              const sig = options.signal!;
              if (sig.aborted) {
                reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
                return;
              }
              sig.addEventListener(
                'abort',
                () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })),
                { once: true }
              );
            })
          ])
        : await sendPromise;

      console.log('Gemini: Received response from Gemini');
      return text;
    } catch (error) {
      console.error('Gemini: Error communicating with Gemini:', error);
      throw new Error(`Gemini API error: ${error}`);
    }
  }

  getProviderName(): string {
    return 'Gemini (Google)';
  }
}

