import { AIProvider, AIChatOptions, ConversationMessage } from './cli-base';

/**
 * Ollama Provider - EXACT port from Cyber-Claude CLI
 * Ported from: Cyber-Claude/src/agent/providers/ollama.ts
 * 
 * Supports: DeepSeek Coder, Llama, Mistral, CodeLlama, and any Ollama-compatible model
 * See: https://ollama.ai
 */
export class OllamaProvider implements AIProvider {
  private baseUrl: string;
  private model: string;

  constructor(baseUrl: string = 'http://localhost:11434', model: string) {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async chat(messages: ConversationMessage[], systemPrompt: string, options?: AIChatOptions): Promise<string> {
    try {
      const userImages = options?.userImages?.length ? options.userImages : undefined;
      console.log(`Ollama: Sending message to Ollama (${this.model})`);
      
      // Build messages array with system prompt first (EXACT match to CLI).
      // Vision models (llava, bakllava, llama3.2-vision, etc.): pass base64 in `images` on the last user message.
      const mapped = messages.map((msg, idx) => {
        const isLastUser =
          msg.role === 'user' && idx === messages.length - 1 && userImages && userImages.length > 0;
        const text =
          isLastUser && (!msg.content || !String(msg.content).trim())
            ? '(see attached image(s))'
            : msg.content;
        const row: { role: string; content: string; images?: string[] } = {
          role: msg.role,
          content: text,
        };
        if (isLastUser) {
          row.images = userImages.map((img) => img.base64);
        }
        return row;
      });

      const ollamaMessages = [{ role: 'system', content: systemPrompt }, ...mapped];

      // Set a long timeout for DeepSeek-R1 and other reasoning models
      const timeoutController = new AbortController();
      const timeoutMs = 900000; // 15 minutes (EXACT match to CLI)
      const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

      const external = options?.signal;
      let fetchSignal: AbortSignal = timeoutController.signal;
      if (external && typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).any === 'function') {
        fetchSignal = (AbortSignal as any).any([timeoutController.signal, external]);
      } else if (external) {
        const merged = new AbortController();
        const abortMerged = () => merged.abort();
        timeoutController.signal.addEventListener('abort', abortMerged);
        external.addEventListener('abort', abortMerged);
        if (external.aborted) merged.abort();
        fetchSignal = merged.signal;
      }

      try {
        const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.model,
            messages: ollamaMessages,
        stream: false,
        options: {
              temperature: 0.7,
              num_ctx: 8192,
              num_predict: 8192
            }
          }),
          signal: fetchSignal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Ollama API returned status ${response.status}: ${await response.text()}`);
        }

        const data = await response.json() as {
          message?: {
            content?: string;
          };
        };

        if (!data.message || !data.message.content) {
          throw new Error('Invalid response from Ollama API');
        }

        // Debug logging for AI response debugging (especially for small models like deepseek-coder)
        console.log('Ollama: Raw response data:', JSON.stringify(data, null, 2).substring(0, 1000));
        console.log('Ollama: Response content preview:', data.message?.content?.substring(0, 500));

        console.log('Ollama: Received response from Ollama');
        return data.message.content;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      console.error('Ollama: Error communicating with Ollama:', error);
                  
      // Provide helpful error messages (EXACT match to CLI)
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          if (options?.signal?.aborted) {
            throw error;
          }
          throw new Error(
            `Request to Ollama timed out after 15 minutes. ` +
            `This can happen with DeepSeek-R1 on complex questions. Try:\n` +
            `  1. Ask a simpler question\n` +
            `  2. Use a smaller model (deepseek-r1:8b or gemma3:4b)\n` +
            `  3. Ensure your system has enough RAM`
          );
        }
        const msg = (error.message || String(error)).toLowerCase();
        if (msg.includes('fetch') || msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('failed')) {
          throw new Error(
            `Failed to connect to Ollama at ${this.baseUrl}. ` +
            `Make sure Ollama is running (ollama serve) and the model is pulled (ollama pull ${this.model})`
          );
        }
      }

      throw new Error(`Ollama API error: ${error}`);
    }
  }

  getProviderName(): string {
    return `Ollama (${this.model})`;
  }
}
