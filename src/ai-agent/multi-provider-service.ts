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
  private initPromise: Promise<void>;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    console.log(`MultiProviderAIService: Constructor called`);
    console.log(`MultiProviderAIService: Reading settings now...`);
    
    // Read settings immediately to see what we get
    const config = vscode.workspace.getConfiguration('ciphermate');
    const providerSetting = config.get('ai.provider');
    console.log(`MultiProviderAIService: Raw provider setting value:`, providerSetting);
    console.log(`MultiProviderAIService: Provider setting type:`, typeof providerSetting);
    
    this.initPromise = this.initializeProviders();
  }

  /**
   * Ensure providers are initialized (waits if async init still in progress)
   */
  private async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  /**
   * Initialize primary and fallback providers (async - resolves API keys from SecretStorage)
   */
  private async initializeProviders(): Promise<void> {
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
    
    // Respect user's explicit ai.provider choice. Do NOT override with Ollama when
    // user has set ai.provider to openrouter, openai, anthropic, etc.
    // Only use Ollama when ai.provider is explicitly 'ollama' (or when no provider is set and
    // user has OLLAMA_BASE_URL env or explicitly configured ai.ollama.apiUrl as their intent).
    const envOllamaUrl = process.env.OLLAMA_BASE_URL;
    const ollamaUrlInspect = config.inspect('ai.ollama.apiUrl');
    const hasEnvOllama = envOllamaUrl && envOllamaUrl.trim() !== '';
    const hasExplicitOllamaConfig = ollamaUrlInspect?.workspaceValue !== undefined ||
                                   ollamaUrlInspect?.globalValue !== undefined;

    // Only switch to Ollama if user has NOT explicitly chosen another provider.
    // workspaceValue/globalValue on ai.provider means user made a deliberate choice.
    const userChoseNonOllama = providerInspect?.workspaceValue !== undefined ||
                               providerInspect?.globalValue !== undefined;
    const explicitProviderIsOllama = (providerInspect?.workspaceValue ?? providerInspect?.globalValue ?? providerInspect?.defaultValue) === 'ollama';

    if (!explicitProviderIsOllama && userChoseNonOllama) {
      // User chose openrouter, openai, etc. - respect it, do not override with Ollama
      console.log(`MultiProviderAIService: User chose ${providerType}, not overriding with Ollama`);
    } else if ((hasEnvOllama || hasExplicitOllamaConfig) && !userChoseNonOllama) {
      // No explicit provider choice - use Ollama if configured
      providerType = 'ollama';
      console.log(`MultiProviderAIService: Using Ollama (env or config), providerType: ${providerType}`);
    } else {
      console.log(`MultiProviderAIService: Using providerType: ${providerType}`);
    }
    
    this.currentProviderType = providerType;
    console.log(`MultiProviderAIService: Final provider type: ${this.currentProviderType}`);
    console.log(`MultiProviderAIService: About to create provider with type: ${this.currentProviderType}`);
    
    this.primaryProvider = await ProviderFactory.createProvider(this.context, this.currentProviderType);
    console.log(`MultiProviderAIService: Primary provider created: ${this.primaryProvider.getName()}`);

    // Fallback providers (if configured)
    const fallbackProviders = config.get('ai.fallbackProviders', []) as ProviderType[];
    console.log(`MultiProviderAIService: Fallback providers: ${fallbackProviders.length}`);
    this.fallbackProviders = await Promise.all(
      fallbackProviders.map(type => ProviderFactory.createProvider(this.context, type))
    );
  }

  /**
   * Call AI with automatic failover and seamless provider switching
   * Matches Core's error handling behavior
   */
  async callAI(request: AIRequest): Promise<AIResponse> {
    await this.ensureInitialized();
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
  async switchProvider(providerType: ProviderType): Promise<void> {
    console.log(`MultiProviderAIService: Switching provider to ${providerType}`);
    this.currentProviderType = providerType;
    this.primaryProvider = await ProviderFactory.createProvider(this.context, providerType);
    console.log(`MultiProviderAIService: Provider switched to ${this.primaryProvider.getName()}`);
    
    // Save preference
    const config = vscode.workspace.getConfiguration('ciphermate');
    config.update('ai.provider', providerType, vscode.ConfigurationTarget.Global);
  }

  /**
   * Get current provider
   */
  async getCurrentProvider(): Promise<BaseAIProvider> {
    await this.ensureInitialized();
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
    await this.ensureInitialized();
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
  async getSupportedModels(): Promise<string[]> {
    await this.ensureInitialized();
    return this.primaryProvider.getSupportedModels();
  }

  /**
   * Get supported models for a specific provider type
   */
  static getProviderModels(providerType: ProviderType): string[] {
    return ProviderFactory.getProviderModels(providerType);
  }
}

