import * as vscode from 'vscode';
import { BaseAIProvider, AIRequest, AIResponse, ProviderConfig } from './providers/base-provider';
import { ProviderFactory, ProviderType } from './providers/provider-factory';

/**
 * Multi-Provider AI Service
 * 
 * Unified service that works with 450+ AI models:
 * - Claude Sonnet 4.5 (via Anthropic or OpenRouter)
 * - Gemini 2.5 Pro (via Google or OpenRouter)
 * - GPT-5 (via OpenAI or OpenRouter)
 * - 450+ more models (via OpenRouter)
 * 
 * Supports:
 * - Automatic failover between providers
 * - Provider switching without code changes
 * - Unified interface for all providers
 */
export class MultiProviderAIService {
  private context: vscode.ExtensionContext;
  private primaryProvider!: BaseAIProvider;
  private fallbackProviders: BaseAIProvider[] = [];
  private currentProviderType!: ProviderType;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    console.log(`MultiProviderAIService: Constructor called`);
    console.log(`MultiProviderAIService: Reading settings now...`);
    
    // Read settings immediately to see what we get
    const config = vscode.workspace.getConfiguration('ciphermate');
    const providerSetting = config.get('ai.provider');
    console.log(`MultiProviderAIService: Raw provider setting value:`, providerSetting);
    console.log(`MultiProviderAIService: Provider setting type:`, typeof providerSetting);
    
    this.initializeProviders();
  }

  /**
   * Initialize primary and fallback providers
   */
  private initializeProviders(): void {
    // Use inspect to see where settings come from (workspace vs global vs default)
    const config = vscode.workspace.getConfiguration('ciphermate');
    
    // Inspect the provider setting to see all sources
    const providerInspect = config.inspect('ai.provider');
    console.log(`MultiProviderAIService: Provider setting inspection:`, {
      defaultValue: providerInspect?.defaultValue,
      globalValue: providerInspect?.globalValue,
      workspaceValue: providerInspect?.workspaceValue,
      workspaceFolderValue: providerInspect?.workspaceFolderValue,
    });
    
    // Get all AI-related settings for debugging
    const allSettings = {
      'ai.provider': config.get('ai.provider'),
      'ai.ollama.apiUrl': config.get('ai.ollama.apiUrl'),
      'ai.ollama.model': config.get('ai.ollama.model'),
      'ai.fallbackProviders': config.get('ai.fallbackProviders'),
    };
    console.log(`MultiProviderAIService: All AI settings:`, JSON.stringify(allSettings, null, 2));
    console.log(`MultiProviderAIService: Workspace folders:`, vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath));
    
    // Primary provider - prioritize workspace value if it exists
    let providerType: ProviderType;
    if (providerInspect?.workspaceValue !== undefined) {
      providerType = providerInspect.workspaceValue as ProviderType;
      console.log(`MultiProviderAIService: Using workspace value: ${providerType}`);
    } else if (providerInspect?.workspaceFolderValue !== undefined) {
      providerType = providerInspect.workspaceFolderValue as ProviderType;
      console.log(`MultiProviderAIService: Using workspace folder value: ${providerType}`);
    } else if (providerInspect?.globalValue !== undefined) {
      providerType = providerInspect.globalValue as ProviderType;
      console.log(`MultiProviderAIService: Using global value: ${providerType}`);
    } else {
      providerType = (providerInspect?.defaultValue || 'openrouter') as ProviderType;
      console.log(`MultiProviderAIService: Using default value: ${providerType}`);
    }
    
    // TEMPORARY FIX: Force Ollama if settings aren't working
    // Check if Ollama URL is configured - if so, force Ollama provider
    const ollamaUrl = config.get('ai.ollama.apiUrl');
    const ollamaUrlInspect = config.inspect('ai.ollama.apiUrl');
    console.log(`MultiProviderAIService: Ollama URL check:`, {
      value: ollamaUrl,
      workspaceValue: ollamaUrlInspect?.workspaceValue,
      globalValue: ollamaUrlInspect?.globalValue,
    });
    
    if (ollamaUrl && typeof ollamaUrl === 'string' && ollamaUrl.trim() !== '' && ollamaUrl !== 'http://localhost:11434') {
      console.log(`MultiProviderAIService: Ollama URL is configured (${ollamaUrl}), FORCING Ollama provider`);
      providerType = 'ollama';
    } else {
      console.log(`MultiProviderAIService: Ollama URL not configured or is default, using providerType: ${providerType}`);
    }
    
    this.currentProviderType = providerType;
    console.log(`MultiProviderAIService: Final provider type: ${this.currentProviderType}`);
    console.log(`MultiProviderAIService: About to create provider with type: ${this.currentProviderType}`);
    
    this.primaryProvider = ProviderFactory.createProvider(this.context, this.currentProviderType);
    console.log(`MultiProviderAIService: Primary provider created: ${this.primaryProvider.getName()}`);

    // Fallback providers (if configured)
    const fallbackProviders = config.get('ai.fallbackProviders', []) as ProviderType[];
    console.log(`MultiProviderAIService: Fallback providers: ${fallbackProviders.length}`);
    this.fallbackProviders = fallbackProviders.map(type => 
      ProviderFactory.createProvider(this.context, type)
    );
  }

  /**
   * Call AI with automatic failover
   * Matches Core's error handling behavior
   */
  async callAI(request: AIRequest): Promise<AIResponse> {
    // Try primary provider first
    try {
      return await this.primaryProvider.callAI(request);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`Primary provider failed: ${errorMessage}. Trying fallback providers...`);
      
      // Try fallback providers
      for (const fallbackProvider of this.fallbackProviders) {
        try {
          return await fallbackProvider.callAI(request);
        } catch (fallbackError) {
          const fallbackErrorMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          console.warn(`Fallback provider ${fallbackProvider.getName()} failed: ${fallbackErrorMsg}`);
          continue;
        }
      }

      // All providers failed - provide helpful error message (matches CLI exactly)
      const providerName = this.primaryProvider.getName();
      
      // Match CLI error format exactly - just pass through the error message from the provider
      // The provider already formats errors correctly (matches CLI)
      throw new Error(errorMessage);
    }
  }

  /**
   * Switch to a different provider
   */
  switchProvider(providerType: ProviderType): void {
    this.currentProviderType = providerType;
    this.primaryProvider = ProviderFactory.createProvider(this.context, providerType);
    
    // Save preference
    const config = vscode.workspace.getConfiguration('ciphermate');
    config.update('ai.provider', providerType, vscode.ConfigurationTarget.Global);
  }

  /**
   * Get current provider
   */
  getCurrentProvider(): BaseAIProvider {
    return this.primaryProvider;
  }

  /**
   * Get current provider type
   */
  getCurrentProviderType(): ProviderType {
    return this.currentProviderType;
  }

  /**
   * Test connection to current provider
   */
  async testConnection(): Promise<{ success: boolean; error?: string; latency?: number }> {
    return await this.primaryProvider.testConnection();
  }

  /**
   * Get list of available providers
   */
  static getAvailableProviders(): Array<{ type: ProviderType; name: string; models: number }> {
    return ProviderFactory.getAvailableProviders();
  }

  /**
   * Get supported models for current provider
   */
  getSupportedModels(): string[] {
    return this.primaryProvider.getSupportedModels();
  }

  /**
   * Get supported models for a specific provider type
   */
  static getProviderModels(providerType: ProviderType): string[] {
    return ProviderFactory.getProviderModels(providerType);
  }
}

