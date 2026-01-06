import * as https from 'https';
import * as http from 'http';
import { BaseAIProvider, AIRequest, AIResponse, ProviderConfig } from './base-provider';

/**
 * Anthropic Provider (Claude Sonnet 4.5, Claude 3 Opus, etc.)
 */
export class AnthropicProvider extends BaseAIProvider {
  private baseUrl = 'https://api.anthropic.com';

  constructor(config: ProviderConfig) {
    super(config);
    if (config.apiUrl) {
      this.baseUrl = config.apiUrl.replace(/\/v1\/messages.*$/, '');
    }
  }

  getName(): string {
    return 'Anthropic';
  }

  getSupportedModels(): string[] {
    return [
      'claude-sonnet-4-20250514',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-sonnet-20240620',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
      'claude-3-7-sonnet-20250219'
    ];
  }

  async callAI(request: AIRequest): Promise<AIResponse> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.baseUrl}/v1/messages`);
      const timeout = this.config.timeout || 30000;

      // Convert messages format (Anthropic uses different format)
      const anthropicMessages = request.messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        }));

      const systemMessage = request.messages.find(m => m.role === 'system')?.content || '';

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey || '',
          'anthropic-version': '2023-06-01',
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
              reject(new Error(`Anthropic API Error: ${res.statusCode} - ${data}`));
              return;
            }

            const parsed = JSON.parse(data);
            
            // Anthropic response format is different
            const content = parsed.content?.[0]?.text || '';
            resolve({
              content,
              finish_reason: parsed.stop_reason,
              usage: parsed.usage ? {
                prompt_tokens: parsed.usage.input_tokens || 0,
                completion_tokens: parsed.usage.output_tokens || 0,
                total_tokens: (parsed.usage.input_tokens || 0) + (parsed.usage.output_tokens || 0)
              } : undefined,
              model: parsed.model
            });
          } catch (e) {
            reject(new Error(`Invalid Anthropic response: ${e instanceof Error ? e.message : String(e)}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

      const requestBody: any = {
        model: this.config.model || 'claude-3-5-sonnet-20241022',
        max_tokens: request.max_tokens || 2000,
        messages: anthropicMessages
      };

      if (systemMessage) {
        requestBody.system = systemMessage;
      }

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


