/**
 * Gemini Provider - EXACT port from Cyber-Claude CLI
 * Ported from: Cyber-Claude/src/agent/providers/gemini.ts
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIProvider, ConversationMessage } from './cli-base';

export class GeminiProvider implements AIProvider {
  private client: GoogleGenerativeAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  async chat(messages: ConversationMessage[], systemPrompt: string): Promise<string> {
    try {
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

      // Send the last message
      const result = await chat.sendMessage(lastMessage.content);
      const response = result.response;
      const text = response.text();

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

