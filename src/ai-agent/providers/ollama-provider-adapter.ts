/**
 * Ollama Provider Adapter - Wraps CLI OllamaProvider to work with BaseAIProvider interface
 * This allows the extension to use the exact CLI implementation while maintaining compatibility
 */

import { BaseAIProvider, AIRequest, AIResponse, ProviderConfig } from './base-provider';
import { OllamaProvider as CLIOllamaProvider } from './ollama-provider';

export class OllamaProvider extends BaseAIProvider {
  private cliProvider: CLIOllamaProvider;

  constructor(config: ProviderConfig) {
    super(config);
    
    // Extract baseUrl and model from config
    const baseUrl = config.apiUrl || 'http://localhost:11434';
    const model = config.model || 'deepseek-r1:14b';
    
    // Create CLI provider with exact signature: (baseUrl, model)
    this.cliProvider = new CLIOllamaProvider(baseUrl, model);
  }

  getName(): string {
    return 'Ollama';
  }

  getSupportedModels(): string[] {
    return [
      'deepseek-r1:14b',
      'deepseek-r1:8b',
      'gemma3:4b',
      'deepseek-coder:6.7b',
      'deepseek-coder:1.3b',
      'deepseek-coder:33b',
      'deepseek-coder:latest',
      'codellama:7b',
      'codellama:13b',
      'codellama:34b',
      'mistral:7b',
      'llama2:7b',
      'llama2:13b',
      'qwen2.5-coder:7b',
      'qwen2.5-coder:32b',
    ];
  }

  async callAI(request: AIRequest): Promise<AIResponse> {
    // Convert AIRequest to CLI format
    let systemPrompt = '';
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    
    // Extract system prompt and convert messages
    for (const msg of request.messages) {
      if (msg.role === 'system') {
        systemPrompt = msg.content;
      } else if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      } else if (msg.role === 'tool') {
        // Convert tool messages to assistant messages for CLI
        messages.push({
          role: 'assistant',
          content: msg.content
        });
      }
    }
    
    // Call CLI provider
    const response = await this.cliProvider.chat(messages, systemPrompt);
    
    // Convert response to AIResponse format
    return {
      content: response,
      finish_reason: 'stop',
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      },
      model: this.config.model
    };
  }

  async testConnection(): Promise<{ success: boolean; error?: string; latency?: number }> {
    const startTime = Date.now();
    try {
      // Test with a simple message
      const response = await this.cliProvider.chat(
        [{ role: 'user', content: 'Hello' }],
        'You are a helpful assistant.'
      );
      const latency = Date.now() - startTime;
      
      return {
        success: true,
        latency
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latency
      };
    }
  }
}

