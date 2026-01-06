/**
 * CyberAgent - EXACT port from Cyber-Claude CLI with automatic fallback
 * Ported from: Cyber-Claude/src/agent/core.ts
 * 
 * This is the EXACT same implementation as the CLI, adapted to read from VS Code settings
 * Enhanced with automatic provider fallback for better reliability
 */

import * as vscode from 'vscode';
import { AgentMode } from './cyber-agent-adapter';
import { SYSTEM_PROMPTS } from './cyber-agent-prompts';
import { AIProvider, ConversationMessage } from './providers/cli-base';
import { ClaudeProvider } from './providers/cli-claude';
import { GeminiProvider } from './providers/cli-gemini';
import { OllamaProvider } from './providers/ollama-provider';
import { OpenAIProvider } from './providers/cli-openai';
import { getModelById } from './cli-models';
import {
  isCreditError,
  isAuthError,
  isRateLimitError,
  getErrorSuggestion,
  getNextAvailableProvider,
  checkProviderAvailability,
  ProviderType,
  DEFAULT_FALLBACK_CHAIN
} from './providers/cli-fallback';

export interface AgentConfig {
  mode: AgentMode;
  apiKey?: string;  // Anthropic API key (for Claude)
  googleApiKey?: string;  // Google API key (for Gemini)
  openaiApiKey?: string;  // OpenAI API key (for ChatGPT)
  model?: string;
  maxTokens?: number;
  safeMode?: boolean;
}

export class CyberAgent {
  private provider: AIProvider;
  private mode: AgentMode;
  private conversationHistory: ConversationMessage[] = [];
  private systemPrompt: string;
  private model: string;
  private providerType: ProviderType;

  constructor(agentConfig: AgentConfig) {
    this.mode = agentConfig.mode;
    this.model = agentConfig.model || 'claude-sonnet-4-5'; // fallback
    this.systemPrompt = this.getSystemPrompt(agentConfig.mode);

    // Determine provider based on model (EXACT match to CLI)
    // CLI uses getModelById which searches by model.id field
    const modelInfo = getModelById(agentConfig.model || 'claude-sonnet-4-5');
    let providerType = modelInfo?.model.provider || 'claude';
    
    // Special handling: If model contains ':' or matches Ollama patterns but isn't in AVAILABLE_MODELS,
    // treat as Ollama (for custom models like 'deepseek-coder:latest')
    if (!modelInfo && agentConfig.model) {
      const modelLower = agentConfig.model.toLowerCase();
      // Check if it looks like an Ollama model (contains ':' or known Ollama prefixes)
      if (modelLower.includes(':') || 
          modelLower.includes('deepseek') || 
          modelLower.includes('gemma') || 
          modelLower.includes('llama') || 
          modelLower.includes('codellama') ||
          modelLower.includes('mistral') ||
          modelLower.includes('qwen')) {
        providerType = 'ollama';
      }
    }

    // Initialize appropriate provider (EXACT match to CLI)
    this.providerType = providerType as ProviderType;

    if (providerType === 'gemini') {
      if (!agentConfig.googleApiKey) {
        throw new Error('Google API key required for Gemini models. Set GOOGLE_API_KEY in .env or use --model with Claude/Ollama.');
      }
      this.provider = new GeminiProvider(agentConfig.googleApiKey, agentConfig.model || 'gemini-2.5-flash');
      console.log(`CyberAgent initialized with Gemini (${agentConfig.model}) in ${agentConfig.mode} mode`);
    } else if (providerType === 'openai') {
      if (!agentConfig.openaiApiKey) {
        throw new Error('OpenAI API key required for GPT models. Set OPENAI_API_KEY in .env or use --model with Claude/Gemini/Ollama.');
      }
      this.provider = new OpenAIProvider(
        agentConfig.openaiApiKey,
        agentConfig.model || 'gpt-5.1',
        agentConfig.maxTokens || 4096
      );
      console.log(`CyberAgent initialized with OpenAI (${agentConfig.model}) in ${agentConfig.mode} mode`);
    } else if (providerType === 'ollama') {
      // Ollama (local models) - EXACT match to CLI
      const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      this.provider = new OllamaProvider(ollamaBaseUrl, agentConfig.model || 'deepseek-r1:14b');
      console.log(`CyberAgent initialized with Ollama (${agentConfig.model}) at ${ollamaBaseUrl} in ${agentConfig.mode} mode`);
    } else {
      // Default to Claude (EXACT match to CLI)
      if (!agentConfig.apiKey) {
        throw new Error('Anthropic API key required for Claude models. Set ANTHROPIC_API_KEY in .env or use --model with Gemini/Ollama.');
      }
      this.provider = new ClaudeProvider(
        agentConfig.apiKey,
        agentConfig.model || 'claude-sonnet-4-5',
        agentConfig.maxTokens || 4096
      );
      console.log(`CyberAgent initialized with Claude (${agentConfig.model}) in ${agentConfig.mode} mode`);
    }
  }

  private getSystemPrompt(mode: AgentMode): string {
    const basePrompt = SYSTEM_PROMPTS.base;
    const modePrompt = SYSTEM_PROMPTS[mode] || '';
    return modePrompt ? `${basePrompt}\n\n${modePrompt}` : basePrompt;
  }

  /**
   * Send a message to the agent and get a response
   * EXACT match to CLI implementation with automatic fallback
   */
  async chat(userMessage: string): Promise<string> {
    try {
      // Add user message to history
      this.conversationHistory.push({
        role: 'user',
        content: userMessage,
      });

      console.log(`CyberAgent: Sending message to ${this.provider.getProviderName()} (mode: ${this.mode})`);

      // Call provider's chat method (EXACT match to CLI)
      const assistantMessage = await this.provider.chat(
        this.conversationHistory,
        this.systemPrompt
      );

      // Add assistant response to history
      this.conversationHistory.push({
        role: 'assistant',
        content: assistantMessage,
      });

      console.log(`CyberAgent: Received response from ${this.provider.getProviderName()}`);
      return assistantMessage;
    } catch (error) {
      // Remove the failed user message from history
      this.conversationHistory.pop();

      // Try automatic fallback to other providers if available
      const fallbackResult = await this.tryFallbackProviders(userMessage);
      if (fallbackResult) {
        return fallbackResult;
      }

      // Provide helpful error messages based on error type (EXACT match to CLI)
      if (isCreditError(error) || isAuthError(error) || isRateLimitError(error)) {
        const suggestion = getErrorSuggestion(error, this.providerType);
        console.error(`CyberAgent: Provider error:\n${suggestion}`);
        throw new Error(`${this.provider.getProviderName()} API error.\n\n${suggestion}`);
      }

      console.error('CyberAgent: Error in chat:', error);
      throw new Error(`Failed to communicate with ${this.provider.getProviderName()}: ${error}`);
    }
  }

  /**
   * Try fallback providers automatically
   * Uses EXACT CLI fallback logic from fallback.ts
   */
  private async tryFallbackProviders(userMessage: string, attemptedProviders: Set<ProviderType> = new Set()): Promise<string | null> {
    const config = vscode.workspace.getConfiguration('ciphermate');
    const fallbackEnabled = config.get('ai.enableAutoFallback', true) as boolean;
    
    if (!fallbackEnabled) {
      return null;
    }

    // Mark current provider as attempted
    attemptedProviders.add(this.providerType);

    // Use CLI's getNextAvailableProvider (EXACT match)
    const nextProvider = await getNextAvailableProvider(this.providerType, DEFAULT_FALLBACK_CHAIN);
    
    if (!nextProvider) {
      console.log(`CyberAgent: No available fallback providers found`);
      return null;
    }

    // Prevent infinite loops - if we've already tried this provider, stop
    if (attemptedProviders.has(nextProvider.provider)) {
      console.log(`CyberAgent: Already attempted ${nextProvider.provider}, stopping fallback chain`);
      return null;
    }

    console.log(`CyberAgent: Primary provider failed, trying fallback provider: ${nextProvider.provider}...`);
    
    try {
      // Get provider configuration
      let agentConfig: AgentConfig | null = null;
      
      if (nextProvider.provider === 'claude') {
        const apiKey = config.get('ai.anthropic.apiKey', '') as string;
        if (apiKey) {
          agentConfig = {
            mode: this.mode,
            model: nextProvider.model,
            apiKey,
            maxTokens: 4096,
          };
        }
      } else if (nextProvider.provider === 'openai') {
        const apiKey = config.get('ai.openai.apiKey', '') as string;
        if (apiKey) {
          agentConfig = {
            mode: this.mode,
            model: nextProvider.model,
            openaiApiKey: apiKey,
            maxTokens: 4096,
          };
        }
      } else if (nextProvider.provider === 'gemini') {
        const apiKey = config.get('ai.gemini.apiKey', '') as string;
        if (apiKey) {
          agentConfig = {
            mode: this.mode,
            model: nextProvider.model,
            googleApiKey: apiKey,
            maxTokens: 4096,
          };
        }
      } else if (nextProvider.provider === 'ollama') {
        const ollamaUrl = config.get('ai.ollama.apiUrl', 'http://localhost:11434') as string;
        process.env.OLLAMA_BASE_URL = ollamaUrl;
        agentConfig = {
          mode: this.mode,
          model: nextProvider.model,
          maxTokens: 4096,
        };
      }
      
      if (agentConfig) {
        const fallbackAgent = new CyberAgent(agentConfig);
        
        // Try the fallback provider (it will handle its own fallback if needed)
        const response = await fallbackAgent.chat(userMessage);
        
        // Success! Update current provider
        this.provider = fallbackAgent['provider'];
        this.providerType = nextProvider.provider;
        
        console.log(`CyberAgent: Fallback successful! Now using ${this.provider.getProviderName()}`);
        
        // Notify user about fallback
        vscode.window.showInformationMessage(
          `Switched to ${this.provider.getProviderName()} due to primary provider failure`
        );
        
        return response;
      }
    } catch (fallbackError) {
      console.warn(`CyberAgent: Fallback provider ${nextProvider.provider} also failed:`, fallbackError);
      // Try next provider in chain (pass attemptedProviders to prevent loops)
      return this.tryFallbackProviders(userMessage, attemptedProviders);
    }
    
    return null; // All fallbacks failed
  }

  /**
   * Run a specific security analysis task
   * EXACT match to CLI implementation
   */
  async analyze(task: string, context?: any): Promise<string> {
    const prompt = this.buildAnalysisPrompt(task, context);
    return this.chat(prompt);
  }

  private buildAnalysisPrompt(task: string, context?: any): string {
    let prompt = task;

    if (context) {
      prompt += '\n\nContext:\n' + JSON.stringify(context, null, 2);
    }

    return prompt;
  }

  /**
   * Change the agent's mode
   * EXACT match to CLI implementation
   */
  setMode(mode: AgentMode): void {
    this.mode = mode;
    this.systemPrompt = this.getSystemPrompt(mode);
    console.log(`CyberAgent: Agent mode changed to ${mode}`);
  }

  /**
   * Clear conversation history
   * EXACT match to CLI implementation
   */
  clearHistory(): void {
    this.conversationHistory = [];
    console.log('CyberAgent: Conversation history cleared');
  }

  /**
   * Get current mode
   * EXACT match to CLI implementation
   */
  getMode(): AgentMode {
    return this.mode;
  }

  /**
   * Get conversation history
   * EXACT match to CLI implementation
   */
  getHistory(): ConversationMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * Get current model
   * EXACT match to CLI implementation
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Get provider name
   * EXACT match to CLI implementation
   */
  getProviderName(): string {
    return this.provider.getProviderName();
  }
}

/**
 * Create CyberAgent from VS Code settings
 * Reads settings and creates config matching CLI's AgentConfig
 * EXACTLY matches how CLI determines provider and model
 */
export function createCyberAgentFromSettings(context: vscode.ExtensionContext, mode: AgentMode = 'base'): CyberAgent {
  const config = vscode.workspace.getConfiguration('ciphermate');
  
  // Read provider from settings
  const provider = config.get('ai.provider', 'ollama') as string;
  
  // Read model and API keys based on provider
  let model: string;
  let anthropicApiKey: string | undefined;
  let googleApiKey: string | undefined;
  let openaiApiKey: string | undefined;
  let ollamaBaseUrl: string | undefined;
  
  if (provider === 'ollama') {
    // Ollama - read model and URL
    model = config.get('ai.ollama.model', 'deepseek-r1:14b') as string;
    ollamaBaseUrl = config.get('ai.ollama.apiUrl', 'http://localhost:11434') as string;
    
    // Set OLLAMA_BASE_URL environment variable (CLI uses this)
    process.env.OLLAMA_BASE_URL = ollamaBaseUrl;
    
    // For Ollama, use model exactly as configured (CLI doesn't normalize)
    // Try to find model in AVAILABLE_MODELS, but if not found, use as-is
    // This allows custom Ollama models like 'deepseek-coder:latest'
    const modelByKey = getModelById(model);
    if (modelByKey) {
      model = modelByKey.model.id; // Convert key to ID if found
    }
    // Otherwise, use model exactly as user configured it (e.g., 'deepseek-coder:latest')
    
    // Create AgentConfig - CyberAgent will detect Ollama based on model pattern
    const agentConfig: AgentConfig = {
      mode,
      model: model, // Use model as-is (e.g., 'deepseek-coder:latest')
      maxTokens: 4096,
    };
    
    return new CyberAgent(agentConfig);
  } else if (provider === 'anthropic' || provider === 'claude') {
    // Claude - read model and API key
    model = config.get('ai.anthropic.model', 'claude-sonnet-4-5') as string;
    anthropicApiKey = config.get('ai.anthropic.apiKey', '') as string;
    
    // Convert model key to ID if needed
    const modelByKey = getModelById(model);
    if (modelByKey) {
      model = modelByKey.model.id;
    }
  } else if (provider === 'gemini') {
    // Gemini - read model and API key
    model = config.get('ai.gemini.model', 'gemini-2.5-flash') as string;
    googleApiKey = config.get('ai.gemini.apiKey', '') as string;
    
    // Convert model key to ID if needed
    const modelByKey = getModelById(model);
    if (modelByKey) {
      model = modelByKey.model.id;
    }
  } else if (provider === 'openai') {
    // OpenAI - read model and API key
    model = config.get('ai.openai.model', 'gpt-5.1') as string;
    openaiApiKey = config.get('ai.openai.apiKey', '') as string;
    
    // Convert model key to ID if needed
    const modelByKey = getModelById(model);
    if (modelByKey) {
      model = modelByKey.model.id;
    }
  } else {
    // Default to Ollama if provider not recognized
    model = config.get('ai.ollama.model', 'deepseek-r1:14b') as string;
    ollamaBaseUrl = config.get('ai.ollama.apiUrl', 'http://localhost:11434') as string;
    process.env.OLLAMA_BASE_URL = ollamaBaseUrl;
    
    const modelByKey = getModelById(model);
    if (modelByKey) {
      model = modelByKey.model.id;
    }
    
    // Create with Ollama
    const agentConfig: AgentConfig = {
      mode,
      model: model,
      maxTokens: 4096,
    };
    
    const agent = new CyberAgent(agentConfig);
    if (agent['providerType'] !== 'ollama') {
      agent['providerType'] = 'ollama';
      agent['provider'] = new OllamaProvider(ollamaBaseUrl, model);
    }
    return agent;
  }
  
  // Create AgentConfig matching CLI's interface (EXACT match)
  const agentConfig: AgentConfig = {
    mode,
    model: model,
    apiKey: anthropicApiKey,
    googleApiKey: googleApiKey,
    openaiApiKey: openaiApiKey,
    maxTokens: 4096,
  };
  
  return new CyberAgent(agentConfig);
}

