import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BaseAIProvider, ProviderConfig } from './base-provider';
import { OpenAIProvider } from './openai-provider';
import { AnthropicProvider } from './anthropic-provider';
import { GeminiProvider } from './gemini-provider';
import { OpenRouterProvider } from './openrouter-provider';
import { OllamaProvider } from './ollama-provider-adapter';

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
 */
export class ProviderFactory {
  /**
   * Create a provider instance based on configuration
   */
  static createProvider(context: vscode.ExtensionContext, providerType?: ProviderType): BaseAIProvider {
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

    // Get provider-specific configuration
    const apiKey = config.get(`ai.${providerType}.apiKey`, '') as string;
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
      
      // CRITICAL FIX: If we still have localhost, read settings.json file directly
      if (apiUrl === 'http://localhost:11434' || apiUrl === defaultApiUrl) {
        console.log(`ProviderFactory: WARNING - Still using localhost, reading .vscode/settings.json directly...`);
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          try {
            const settingsPath = path.join(workspaceFolders[0].uri.fsPath, '.vscode', 'settings.json');
            if (fs.existsSync(settingsPath)) {
              const settingsContent = fs.readFileSync(settingsPath, 'utf8');
              const settings = JSON.parse(settingsContent);
              
              // Try to find the Ollama URL in settings
              const ollamaUrl = settings['ciphermate.ai.ollama.apiUrl'] || 
                               settings['ciphermate']?.ai?.ollama?.apiUrl ||
                               settings['ciphermate']?.['ai.ollama']?.apiUrl;
              
              if (ollamaUrl && typeof ollamaUrl === 'string' && ollamaUrl.trim() !== '') {
                apiUrl = ollamaUrl.trim();
                console.log(`ProviderFactory: SUCCESS - Read Ollama URL directly from settings.json: ${apiUrl}`);
                // Also show in VS Code output
                vscode.window.showInformationMessage(`Using Ollama at: ${apiUrl}`);
              } else {
                console.log(`ProviderFactory: Could not find Ollama URL in settings.json`);
              }
            } else {
              console.log(`ProviderFactory: settings.json not found at: ${settingsPath}`);
            }
          } catch (error) {
            console.error(`ProviderFactory: Error reading settings.json:`, error);
          }
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
      
      // If still empty, try reading from settings.json directly (like URL)
      if (!model || model === '') {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          try {
            const settingsPath = path.join(workspaceFolders[0].uri.fsPath, '.vscode', 'settings.json');
            if (fs.existsSync(settingsPath)) {
              const settingsContent = fs.readFileSync(settingsPath, 'utf8');
              const settings = JSON.parse(settingsContent);
              
              const ollamaModel = settings['ciphermate.ai.ollama.model'] || 
                                 settings['ciphermate']?.ai?.ollama?.model ||
                                 settings['ciphermate']?.['ai.ollama']?.model;
              
              if (ollamaModel && typeof ollamaModel === 'string' && ollamaModel.trim() !== '') {
                model = ollamaModel.trim();
                console.log(`ProviderFactory: SUCCESS - Read Ollama model directly from settings.json: ${model}`);
              }
            }
          } catch (error) {
            console.error(`ProviderFactory: Error reading model from settings.json:`, error);
          }
        }
      }
    } else {
      model = config.get(`ai.${providerType}.model`, '') as string;
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
   * Get supported models for a provider
   */
  static getProviderModels(providerType: ProviderType): string[] {
    const tempProvider = ProviderFactory.createProvider(
      {} as vscode.ExtensionContext,
      providerType
    );
    return tempProvider.getSupportedModels();
  }
}


