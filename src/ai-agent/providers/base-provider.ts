/**
 * Base AI Provider Interface
 * 
 * This defines the common interface all AI providers must implement.
 * Allows CipherMate to work with any AI model (Claude, Gemini, GPT-5, etc.)
 */

export interface AIRequest {
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

export interface AIResponse {
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
  model?: string;
}

export interface ProviderConfig {
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  timeout?: number;
  maxRetries?: number;
  [key: string]: any; // Allow provider-specific config
}

/**
 * Base class for all AI providers
 */
export abstract class BaseAIProvider {
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  /**
   * Call the AI model
   */
  abstract callAI(request: AIRequest): Promise<AIResponse>;

  /**
   * Test connection to the provider
   */
  abstract testConnection(): Promise<{ success: boolean; error?: string; latency?: number }>;

  /**
   * Get provider name
   */
  abstract getName(): string;

  /**
   * Get supported models
   */
  abstract getSupportedModels(): string[];

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): ProviderConfig {
    return { ...this.config };
  }
}


