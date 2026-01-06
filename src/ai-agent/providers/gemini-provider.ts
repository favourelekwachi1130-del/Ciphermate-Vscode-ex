import * as https from 'https';
import * as http from 'http';
import { BaseAIProvider, AIRequest, AIResponse, ProviderConfig } from './base-provider';

/**
 * Google Gemini Provider (Gemini 2.5 Pro, Gemini Pro, etc.)
 */
export class GeminiProvider extends BaseAIProvider {
  private baseUrl = 'https://generativelanguage.googleapis.com';

  constructor(config: ProviderConfig) {
    super(config);
    if (config.apiUrl) {
      this.baseUrl = config.apiUrl.replace(/\/v1.*$/, '');
    }
  }

  getName(): string {
    return 'Google Gemini';
  }

  getSupportedModels(): string[] {
    return [
      'gemini-2.0-flash-exp',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-1.5-pro-latest',
      'gemini-1.5-flash-latest',
      'gemini-pro',
      'gemini-pro-vision'
    ];
  }

  async callAI(request: AIRequest): Promise<AIResponse> {
    return new Promise((resolve, reject) => {
      const modelName = this.config.model || 'gemini-1.5-pro';
      const url = new URL(`${this.baseUrl}/v1/models/${modelName}:generateContent?key=${this.config.apiKey}`);
      const timeout = this.config.timeout || 30000;

      // Convert messages format (Gemini uses different format)
      const systemInstruction = request.messages.find(m => m.role === 'system')?.content || '';
      const conversationMessages = request.messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
              reject(new Error(`Gemini API Error: ${res.statusCode} - ${data}`));
              return;
            }

            const parsed = JSON.parse(data);
            
            // Gemini response format
            const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
            resolve({
              content,
              finish_reason: parsed.candidates?.[0]?.finishReason,
              usage: parsed.usageMetadata ? {
                prompt_tokens: parsed.usageMetadata.promptTokenCount || 0,
                completion_tokens: parsed.usageMetadata.candidatesTokenCount || 0,
                total_tokens: parsed.usageMetadata.totalTokenCount || 0
              } : undefined,
              model: modelName
            });
          } catch (e) {
            reject(new Error(`Invalid Gemini response: ${e instanceof Error ? e.message : String(e)}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

      const requestBody: any = {
        contents: conversationMessages
      };

      if (systemInstruction) {
        requestBody.systemInstruction = {
          parts: [{ text: systemInstruction }]
        };
      }

      // Add generation config
      requestBody.generationConfig = {
        temperature: request.temperature || 0.7,
        maxOutputTokens: request.max_tokens || 2000
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


