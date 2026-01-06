import * as https from 'https';
import * as http from 'http';
import { BaseAIProvider, AIRequest, AIResponse, ProviderConfig } from './base-provider';

/**
 * OpenRouter Provider - Unified access to 450+ AI models
 * 
 * Supports: GPT-5, Claude Sonnet 4.5, Gemini 2.5 Pro, Llama, Mistral, and 450+ more
 * See: https://openrouter.ai/models
 */
export class OpenRouterProvider extends BaseAIProvider {
  private baseUrl = 'https://openrouter.ai/api/v1';

  constructor(config: ProviderConfig) {
    super(config);
    if (config.apiUrl) {
      this.baseUrl = config.apiUrl.replace(/\/v1\/chat\/completions.*$/, '');
    }
  }

  getName(): string {
    return 'OpenRouter';
  }

  getSupportedModels(): string[] {
    // OpenRouter supports 450+ models. Common ones:
    return [
      // OpenAI
      'openai/gpt-5',
      'openai/gpt-4-turbo',
      'openai/gpt-4',
      'openai/gpt-3.5-turbo',
      // Anthropic
      'anthropic/claude-sonnet-4-20250514',
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3-opus',
      // Google
      'google/gemini-2.0-flash-exp',
      'google/gemini-pro-1.5',
      'google/gemini-flash-1.5',
      // Meta
      'meta-llama/llama-3.1-405b-instruct',
      'meta-llama/llama-3.1-70b-instruct',
      'meta-llama/llama-3.1-8b-instruct',
      // Mistral
      'mistralai/mistral-large',
      'mistralai/mixtral-8x7b-instruct',
      // Cohere
      'cohere/command-r-plus',
      'cohere/command-r',
      // Perplexity
      'perplexity/llama-3.1-sonar-large-128k-online',
      // And 400+ more...
    ];
  }

  async callAI(request: AIRequest): Promise<AIResponse> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.baseUrl}/chat/completions`);
      const timeout = this.config.timeout || 30000;

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'HTTP-Referer': 'https://github.com/ciphermate', // Optional: for analytics
          'X-Title': 'CipherMate Security AI', // Optional: for analytics
          'User-Agent': 'CipherMate-VSCode-Extension'
        },
        timeout
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`OpenRouter API Error: ${res.statusCode} - ${data}`));
              return;
            }

            const parsed = JSON.parse(data);
            
            resolve({
              content: parsed.choices?.[0]?.message?.content || '',
              tool_calls: parsed.choices?.[0]?.message?.tool_calls,
              finish_reason: parsed.choices?.[0]?.finish_reason,
              usage: parsed.usage,
              model: parsed.model
            });
          } catch (e) {
            reject(new Error(`Invalid OpenRouter response: ${e instanceof Error ? e.message : String(e)}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

      const requestBody = {
        model: this.config.model || 'openai/gpt-4',
        messages: request.messages,
        ...(request.tools && { tools: request.tools }),
        temperature: request.temperature || 0.7,
        max_tokens: request.max_tokens || 2000,
        ...(request.stream !== undefined && { stream: request.stream })
      };

      req.write(JSON.stringify(requestBody));
      req.end();
    });
  }

  async testConnection(): Promise<{ success: boolean; error?: string; latency?: number }> {
    const startTime = Date.now();
    try {
      const response = await this.callAI({
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Say "SUCCESS" if you can read this.' }
        ],
        max_tokens: 10
      });

      const latency = Date.now() - startTime;
      if (response.content.includes('SUCCESS')) {
        return { success: true, latency };
      }
      return { success: false, error: 'Invalid response', latency };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latency: Date.now() - startTime
      };
    }
  }
}


