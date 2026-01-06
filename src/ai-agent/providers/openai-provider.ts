import * as https from 'https';
import * as http from 'http';
import { BaseAIProvider, AIRequest, AIResponse, ProviderConfig } from './base-provider';

/**
 * OpenAI Provider (GPT-4, GPT-3.5, GPT-5, etc.)
 */
export class OpenAIProvider extends BaseAIProvider {
  private baseUrl = 'https://api.openai.com/v1';

  constructor(config: ProviderConfig) {
    super(config);
    if (config.apiUrl) {
      this.baseUrl = config.apiUrl.replace(/\/v1\/chat\/completions.*$/, '');
    }
  }

  getName(): string {
    return 'OpenAI';
  }

  getSupportedModels(): string[] {
    return [
      'gpt-5',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo',
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo-preview',
      'gpt-4-0125-preview',
      'gpt-4-1106-preview'
    ];
  }

  async callAI(request: AIRequest): Promise<AIResponse> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.baseUrl}/v1/chat/completions`);
      const timeout = this.config.timeout || 30000;

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
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
              reject(new Error(`OpenAI API Error: ${res.statusCode} - ${data}`));
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
            reject(new Error(`Invalid OpenAI response: ${e instanceof Error ? e.message : String(e)}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

      const requestBody = {
        model: this.config.model || 'gpt-4',
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


