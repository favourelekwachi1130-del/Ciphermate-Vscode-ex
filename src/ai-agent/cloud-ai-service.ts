import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';

/**
 * Cloud AI Service - For your custom trained agentic AI
 * 
 * This service connects to your own trained AI model deployed as a service.
 * You can train the model on security analysis patterns and deploy at scale.
 */

export interface CloudAIConfig {
  apiUrl: string;
  apiKey?: string;
  modelName?: string;
  timeout?: number;
  version?: string;
}

export interface CloudAIRequest {
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }>;
    tool_call_id?: string;
    name?: string;
  }>;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: any;
    };
  }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface CloudAIResponse {
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  finish_reason?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class CloudAIService {
  private config: CloudAIConfig;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from VS Code settings
   */
  private loadConfig(): CloudAIConfig {
    const config = vscode.workspace.getConfiguration('ciphermate');
    return {
      apiUrl: config.get('cloudAI.apiUrl', 'https://api.ciphermate.ai/v1/chat/completions'),
      apiKey: config.get('cloudAI.apiKey', ''),
      modelName: config.get('cloudAI.modelName', 'ciphermate-security-agent'),
      timeout: config.get('cloudAI.timeout', 30000),
      version: config.get('cloudAI.version', '1.0')
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<CloudAIConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();
  }

  /**
   * Save configuration to VS Code settings
   */
  private saveConfig(): void {
    const config = vscode.workspace.getConfiguration('ciphermate');
    config.update('cloudAI.apiUrl', this.config.apiUrl, vscode.ConfigurationTarget.Global);
    if (this.config.apiKey) {
      config.update('cloudAI.apiKey', this.config.apiKey, vscode.ConfigurationTarget.Global);
    }
    if (this.config.modelName) {
      config.update('cloudAI.modelName', this.config.modelName, vscode.ConfigurationTarget.Global);
    }
  }

  /**
   * Call your custom trained AI model
   */
  async callAI(request: CloudAIRequest): Promise<CloudAIResponse> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.config.apiUrl);
      const timeout = this.config.timeout || 30000;

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'CipherMate-VSCode-Extension',
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
          ...(this.config.version && { 'X-API-Version': this.config.version })
        },
        timeout: timeout
      };

      const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => { data += chunk; });
        
        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`API Error: ${res.statusCode} - ${data}`));
              return;
            }

            const parsed = JSON.parse(data);
            
            // Handle different response formats
            const response: CloudAIResponse = {
              content: parsed.choices?.[0]?.message?.content || parsed.content || '',
              tool_calls: parsed.choices?.[0]?.message?.tool_calls,
              finish_reason: parsed.choices?.[0]?.finish_reason,
              usage: parsed.usage
            };

            resolve(response);
          } catch (e) {
            reject(new Error(`Invalid response format: ${e instanceof Error ? e.message : String(e)}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Network error: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      // Send request
      const requestBody = {
        model: this.config.modelName,
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

  /**
   * Test connection to AI service
   */
  async testConnection(): Promise<{ success: boolean; error?: string; latency?: number }> {
    const startTime = Date.now();
    
    try {
      const response = await this.callAI({
        messages: [
          {
            role: 'system',
            content: 'You are CipherMate security AI. Respond with "SUCCESS" if you can read this.'
          },
          {
            role: 'user',
            content: 'Test connection'
          }
        ]
      });

      const latency = Date.now() - startTime;
      
      if (response.content.includes('SUCCESS')) {
        return { success: true, latency };
      } else {
        return { success: false, error: 'Invalid response', latency };
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latency
      };
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): CloudAIConfig {
    return { ...this.config };
  }
}


