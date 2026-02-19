import * as vscode from 'vscode';
import { BaseAIProvider, ProviderConfig } from './base-provider';
import { OpenAIProvider } from './openai-provider';
import { AnthropicProvider } from './anthropic-provider';
import { GeminiProvider } from './gemini-provider';
import { OpenRouterProvider } from './openrouter-provider';
import { OllamaProvider } from './ollama-provider-adapter';
import { ApiKeyStorage } from '../../core/api-key-storage';

export type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'ollama' | 'custom';

/**
 * Factory for creating AI providers
 * 
 * Supports:
 * - OpenAI (GPT-4, GPT-5, etc.)
 * - Anthropic (Claude Sonnet 4.5, etc.)
 * - Google Gemini (Gemini 2.5 Pro, etc.)
 * - OpenRouter (450+ models unified)
 * - Custom providers (via API URL)
 * 
 * API keys are read from SecretStorage (OS keychain) first, with fallback/migration from settings.
 */
export class ProviderFactory {
  /**
   * Create a provider instance based on configuration.
   * API keys are resolved from SecretStorage (secure) or config (fallback with migration).
   * @param forCoding When true, use ai.codingModel for coding tasks (scans, fixes, code explain). Otherwise use primary model.
   */
  static async createProvider(context: vscode.ExtensionContext, providerType?: ProviderType, forCoding = true): Promise<BaseAIProvider> {
    const config = vscode.workspace.getConfiguration('ciphermate');
    
    // If provider type not specified, try to auto-detect from config
    if (!providerType) {
      providerType = config.get('ai.provider', 'openrouter') as ProviderType;
    }
    
    console.log(`ProviderFactory: Creating provider with type: ${providerType}`);
    console.log(`ProviderFactory: Config value for ai.provider: ${config.get('ai.provider')}`);
    
    // CRITICAL: If providerType is 'ollama', verify and log
    if (providerType === 'ollama') {
      const ollamaUrl = config.get('ai.ollama.apiUrl', 'http://localhost:11434');
      console.log(`ProviderFactory: Creating OLLAMA provider with URL: ${ollamaUrl}`);
    } else {
      console.log(`ProviderFactory: Creating ${providerType.toUpperCase()} provider (NOT Ollama)`);
    }

    // Get API key from SecretStorage (secure) or config (fallback with migration)
    const apiKeyStorage = new ApiKeyStorage(context, config);
    const apiKey = providerType === 'ollama' ? '' : (await apiKeyStorage.getForProvider(providerType));
    // For Ollama, default URL is localhost:11434, for others use empty string
    const defaultApiUrl = providerType === 'ollama' ? 'http://localhost:11434' : '';
    
    // For Ollama, VS Code stores nested settings as objects
    let apiUrl: string;
    if (providerType === 'ollama') {
      // VS Code stores nested settings like ai.ollama as an object
      // Try reading the nested object first
      const ollamaConfig = config.get('ai.ollama') as any;
      console.log(`ProviderFactory: Ollama config object:`, JSON.stringify(ollamaConfig));
      
      // Inspect to see where it's coming from
      const urlInspect = config.inspect('ai.ollama.apiUrl');
      const objectInspect = config.inspect('ai.ollama');
      console.log(`ProviderFactory: Ollama URL inspection (dot notation):`, JSON.stringify({
        defaultValue: urlInspect?.defaultValue,
        globalValue: urlInspect?.globalValue,
        workspaceValue: urlInspect?.workspaceValue,
        workspaceFolderValue: urlInspect?.workspaceFolderValue,
      }));
      console.log(`ProviderFactory: Ollama object inspection:`, JSON.stringify({
        defaultValue: objectInspect?.defaultValue,
        globalValue: objectInspect?.globalValue,
        workspaceValue: objectInspect?.workspaceValue,
        workspaceFolderValue: objectInspect?.workspaceFolderValue,
      }));
      
      // Try multiple ways to read the URL
      // Method 1: Nested object
      if (ollamaConfig && typeof ollamaConfig === 'object' && ollamaConfig.apiUrl) {
        apiUrl = ollamaConfig.apiUrl as string;
        console.log(`ProviderFactory: Found Ollama URL in nested object: ${apiUrl}`);
      }
      // Method 2: Dot notation
      else if (urlInspect?.workspaceValue || urlInspect?.globalValue) {
        apiUrl = (urlInspect.workspaceValue || urlInspect.globalValue || defaultApiUrl) as string;
        console.log(`ProviderFactory: Found Ollama URL via inspect: ${apiUrl}`);
      }
      // Method 3: Direct get
      else {
        const directUrl = config.get('ai.ollama.apiUrl', '') as string;
        if (directUrl && directUrl !== '') {
          apiUrl = directUrl;
          console.log(`ProviderFactory: Found Ollama URL via direct get: ${apiUrl}`);
        } else {
          apiUrl = defaultApiUrl;
          console.log(`ProviderFactory: Using default Ollama URL: ${apiUrl}`);
        }
      }
      
    } else {
      apiUrl = config.get(`ai.${providerType}.apiUrl`, defaultApiUrl) as string;
    }
    
    // Read model - for Ollama, also try nested object approach (matches URL reading logic)
    let model: string;
    if (providerType === 'ollama') {
      // Try multiple ways to read the model (same as URL)
      const modelInspect = config.inspect('ai.ollama.model');
      const ollamaConfig = config.get('ai.ollama') as any;
      
      // Method 1: Nested object
      if (ollamaConfig && typeof ollamaConfig === 'object' && ollamaConfig.model) {
        model = ollamaConfig.model as string;
        console.log(`ProviderFactory: Found Ollama model in nested object: ${model}`);
      }
      // Method 2: Dot notation via inspect
      else if (modelInspect?.workspaceValue || modelInspect?.globalValue) {
        model = (modelInspect.workspaceValue || modelInspect.globalValue || '') as string;
        console.log(`ProviderFactory: Found Ollama model via inspect: ${model}`);
      }
      // Method 3: Direct get
      else {
        const directModel = config.get('ai.ollama.model', '') as string;
        if (directModel && directModel !== '') {
          model = directModel;
          console.log(`ProviderFactory: Found Ollama model via direct get: ${model}`);
        } else {
          model = '';
          console.log(`ProviderFactory: No Ollama model found in config`);
        }
      }
      
    } else {
      // For coding tasks (scans, fixes), prefer ai.codingModel; for conversation use ai.conversationModel
      const codingModel = config.get<string>('ai.codingModel', '');
      const conversationModel = config.get<string>('ai.conversationModel', '');
      const primaryModel = config.get(`ai.${providerType}.model`, '') as string;
      if (forCoding && codingModel && codingModel.trim() !== '') {
        model = codingModel.trim();
        console.log(`ProviderFactory: Using coding model: ${model}`);
      } else if (!forCoding && conversationModel && conversationModel.trim() !== '') {
        model = conversationModel.trim();
        console.log(`ProviderFactory: Using conversation model: ${model}`);
      } else {
        model = primaryModel;
      }
    }
    
    // Redirect invalid/deprecated OpenRouter model IDs to valid ones
    const MODEL_ALIASES: Record<string, string> = {
      'anthropic/claude-sonnet-4-20250514': 'anthropic/claude-sonnet-4'  // Invalid ID, was 400 from OpenRouter
    };
    if (model && MODEL_ALIASES[model]) {
      console.log(`ProviderFactory: Redirecting deprecated model ${model} -> ${MODEL_ALIASES[model]}`);
      model = MODEL_ALIASES[model];
    }

    // For Ollama, use model EXACTLY as configured (no normalization) - matches CLI behavior
    // The CLI doesn't normalize model names, so we don't either
    if (providerType === 'ollama' && !model) {
      // Only set default if no model is configured
      model = 'deepseek-r1:14b'; // Match CLI default
      console.log(`ProviderFactory: Using default Ollama model: ${model}`);
    } else if (providerType === 'ollama' && model) {
      console.log(`ProviderFactory: Using configured Ollama model exactly as provided: ${model}`);
    }
    
    // Match CLI timeout: 15 minutes (900000ms) for Ollama, 30 seconds for others
    const defaultTimeout = providerType === 'ollama' ? 900000 : 30000;
    const timeout = config.get(`ai.${providerType}.timeout`, defaultTimeout) as number;
    
    console.log(`ProviderFactory: Final config for ${providerType}:`, {
      apiUrl,
      model,
      timeout
    });

    const providerConfig: ProviderConfig = {
      apiKey,
      apiUrl,
      model,
      timeout,
      maxRetries: 3
    };

    switch (providerType) {
      case 'openai':
        return new OpenAIProvider(providerConfig);
      
      case 'anthropic':
        return new AnthropicProvider(providerConfig);
      
      case 'gemini':
        return new GeminiProvider(providerConfig);
      
      case 'openrouter':
        return new OpenRouterProvider(providerConfig);
      
      case 'ollama':
        return new OllamaProvider(providerConfig);
      
      case 'custom':
        // For custom providers, use OpenRouter-compatible format or create custom provider
        // You can extend this to support any API-compatible service
        return new OpenRouterProvider({
          ...providerConfig,
          apiUrl: apiUrl || providerConfig.apiUrl
        });
      
      default:
        // Default to OpenRouter as it supports the most models
        return new OpenRouterProvider(providerConfig);
    }
  }

  /**
   * Get list of all available providers
   */
  static getAvailableProviders(): Array<{ type: ProviderType; name: string; models: number }> {
    return [
      { type: 'openrouter', name: 'OpenRouter', models: 450 },
      { type: 'ollama', name: 'Ollama (Local)', models: 50 },
      { type: 'openai', name: 'OpenAI', models: 10 },
      { type: 'anthropic', name: 'Anthropic (Claude)', models: 7 },
      { type: 'gemini', name: 'Google Gemini', models: 6 },
      { type: 'custom', name: 'Custom API', models: 0 }
    ];
  }

  /**
   * Get supported models for a provider. Uses sync creation with empty API key (models list is static).
   */
  static getProviderModels(providerType: ProviderType): string[] {
    return ProviderFactory.createProviderForModelsOnly(providerType).getSupportedModels();
  }

  /**
   * Create a minimal provider instance for model listing only (no API key needed).
   */
  private static createProviderForModelsOnly(providerType: ProviderType): BaseAIProvider {
    const config = vscode.workspace.getConfiguration('ciphermate');
    const defaultApiUrl = providerType === 'ollama' ? 'http://localhost:11434' : '';
    const apiUrl = providerType === 'ollama'
      ? (config.get('ai.ollama.apiUrl', '') || 'http://localhost:11434')
      : config.get(`ai.${providerType}.apiUrl`, defaultApiUrl) as string;
    const model = providerType === 'ollama'
      ? (config.get('ai.ollama.model', '') || 'deepseek-coder:6.7b')
      : config.get(`ai.${providerType}.model`, '') as string;
    const defaultTimeout = providerType === 'ollama' ? 900000 : 30000;
    const timeout = config.get(`ai.${providerType}.timeout`, defaultTimeout) as number;
    const providerConfig: ProviderConfig = { apiKey: '', apiUrl, model, timeout, maxRetries: 3 };

    switch (providerType) {
      case 'openai': return new OpenAIProvider(providerConfig);
      case 'anthropic': return new AnthropicProvider(providerConfig);
      case 'gemini': return new GeminiProvider(providerConfig);
      case 'openrouter': return new OpenRouterProvider(providerConfig);
      case 'ollama': return new OllamaProvider(providerConfig);
      case 'custom': return new OpenRouterProvider({ ...providerConfig, apiUrl: apiUrl || providerConfig.apiUrl });
      default: return new OpenRouterProvider(providerConfig);
    }
  }
}


