/**
 * Multi-Provider Fallback System - EXACT port from Cyber-Claude CLI
 * Ported from: Cyber-Claude/src/agent/providers/fallback.ts
 * Adapted to use VS Code settings instead of environment variables
 */

import * as vscode from 'vscode';

export type ProviderType = 'claude' | 'gemini' | 'ollama' | 'openai';

export interface ProviderStatus {
  provider: ProviderType;
  available: boolean;
  reason?: string;
  models: string[];
}

export interface FallbackConfig {
  autoFallback: boolean;
  preferredProvider?: ProviderType;
  fallbackChain: ProviderType[];
}

// Default fallback chain prioritizing cloud providers then local (EXACT match to CLI)
export const DEFAULT_FALLBACK_CHAIN: ProviderType[] = ['claude', 'openai', 'gemini', 'ollama'];

// Model recommendations by provider (EXACT match to CLI)
export const PROVIDER_MODELS: Record<ProviderType, string[]> = {
  claude: ['claude-sonnet-4-5-20250929', 'claude-sonnet-4-20250514', 'claude-3-5-haiku-latest'],
  openai: ['gpt-5.1', 'gpt-5', 'gpt-5-mini'],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  ollama: ['deepseek-r1:8b', 'gemma3:4b']
};

/**
 * Check if error is a credit/billing error
 * EXACT match to CLI
 */
export function isCreditError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('credit balance is too low') ||
      message.includes('insufficient credits') ||
      message.includes('billing') ||
      message.includes('payment required') ||
      message.includes('quota exceeded')
    );
  }
  return false;
}

/**
 * Check if error is an authentication error
 * EXACT match to CLI
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('invalid api key') ||
      message.includes('invalid x-api-key') ||
      message.includes('api key not valid') ||
      message.includes('unauthorized') ||
      message.includes('authentication') ||
      message.includes('401')
    );
  }
  return false;
}

/**
 * Check if error is a rate limit error
 * EXACT match to CLI
 */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('429')
    );
  }
  return false;
}

/**
 * Check if Ollama is running locally
 * EXACT match to CLI, adapted for VS Code
 */
export async function isOllamaRunning(baseUrl: string = 'http://localhost:11434'): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, { 
      signal: AbortSignal.timeout(2000) // 2 second timeout
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

/**
 * Get list of available Ollama models
 * EXACT match to CLI, adapted for VS Code
 */
export async function getOllamaModels(baseUrl: string = 'http://localhost:11434'): Promise<string[]> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, { 
      signal: AbortSignal.timeout(2000) // 2 second timeout
    });
    if (response.ok) {
      const data = await response.json() as { models?: Array<{ name: string }> };
      if (data.models) {
        return data.models.map((m) => m.name);
      }
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Check availability of all providers
 * EXACT match to CLI logic, adapted to read from VS Code settings
 */
export async function checkProviderAvailability(): Promise<ProviderStatus[]> {
  const config = vscode.workspace.getConfiguration('ciphermate');
  const statuses: ProviderStatus[] = [];

  // Check Claude (Anthropic)
  const claudeApiKey = config.get('ai.anthropic.apiKey', '') as string;
  if (claudeApiKey && claudeApiKey.trim() !== '') {
    statuses.push({
      provider: 'claude',
      available: true,
      models: PROVIDER_MODELS.claude
    });
  } else {
    statuses.push({
      provider: 'claude',
      available: false,
      reason: 'ciphermate.ai.anthropic.apiKey not set',
      models: []
    });
  }

  // Check OpenAI
  const openaiApiKey = config.get('ai.openai.apiKey', '') as string;
  if (openaiApiKey && openaiApiKey.trim() !== '') {
    statuses.push({
      provider: 'openai',
      available: true,
      models: PROVIDER_MODELS.openai
    });
  } else {
    statuses.push({
      provider: 'openai',
      available: false,
      reason: 'ciphermate.ai.openai.apiKey not set',
      models: []
    });
  }

  // Check Gemini
  const geminiApiKey = config.get('ai.gemini.apiKey', '') as string;
  if (geminiApiKey && geminiApiKey.trim() !== '') {
    statuses.push({
      provider: 'gemini',
      available: true,
      models: PROVIDER_MODELS.gemini
    });
  } else {
    statuses.push({
      provider: 'gemini',
      available: false,
      reason: 'ciphermate.ai.gemini.apiKey not set',
      models: []
    });
  }

  // Check Ollama
  const ollamaUrl = config.get('ai.ollama.apiUrl', 'http://localhost:11434') as string;
  const ollamaRunning = await isOllamaRunning(ollamaUrl);
  if (ollamaRunning) {
    const models = await getOllamaModels(ollamaUrl);
    statuses.push({
      provider: 'ollama',
      available: true,
      models: models.length > 0 ? models : PROVIDER_MODELS.ollama
    });
  } else {
    statuses.push({
      provider: 'ollama',
      available: false,
      reason: 'Ollama not running (start with: ollama serve)',
      models: []
    });
  }

  return statuses;
}

/**
 * Get helpful error message with fallback suggestions
 * EXACT match to CLI, adapted for VS Code settings
 */
export function getErrorSuggestion(error: unknown, currentProvider: ProviderType): string {
  const suggestions: string[] = [];

  if (isCreditError(error)) {
    suggestions.push(`${currentProvider} API credits depleted.`);
    if (currentProvider === 'claude') {
      suggestions.push('Options:');
      suggestions.push('  1. Add credits at https://console.anthropic.com/');
      suggestions.push('  2. Try OpenAI: Set ciphermate.ai.provider to "openai"');
      suggestions.push('  3. Try Gemini: Set ciphermate.ai.provider to "gemini"');
      suggestions.push('  4. Use Ollama (free, local): ollama pull deepseek-r1:8b');
    } else if (currentProvider === 'openai') {
      suggestions.push('Options:');
      suggestions.push('  1. Add credits at https://platform.openai.com/');
      suggestions.push('  2. Try Claude: Set ciphermate.ai.provider to "anthropic"');
      suggestions.push('  3. Try Gemini: Set ciphermate.ai.provider to "gemini"');
      suggestions.push('  4. Use Ollama (free, local): ollama pull deepseek-r1:8b');
    } else if (currentProvider === 'gemini') {
      suggestions.push('Options:');
      suggestions.push('  1. Check billing at https://aistudio.google.com/');
      suggestions.push('  2. Try Claude: Set ciphermate.ai.provider to "anthropic"');
      suggestions.push('  3. Try OpenAI: Set ciphermate.ai.provider to "openai"');
      suggestions.push('  4. Use Ollama (free, local): ollama pull deepseek-r1:8b');
    }
  } else if (isAuthError(error)) {
    suggestions.push(`${currentProvider} API key is invalid.`);
    if (currentProvider === 'claude') {
      suggestions.push('Check your ciphermate.ai.anthropic.apiKey in settings');
      suggestions.push('Get a new key at: https://console.anthropic.com/');
    } else if (currentProvider === 'openai') {
      suggestions.push('Check your ciphermate.ai.openai.apiKey in settings');
      suggestions.push('Get a new key at: https://platform.openai.com/');
    } else if (currentProvider === 'gemini') {
      suggestions.push('Check your ciphermate.ai.gemini.apiKey in settings');
      suggestions.push('Get a new key at: https://aistudio.google.com/apikey');
    }
    suggestions.push('Or use Ollama (no API key needed): ollama pull gemma3:4b');
  } else if (isRateLimitError(error)) {
    suggestions.push(`${currentProvider} rate limit reached. Wait a moment or try another provider.`);
  }

  return suggestions.join('\n');
}

/**
 * Get the next available provider in fallback chain
 * EXACT match to CLI
 */
export async function getNextAvailableProvider(
  currentProvider: ProviderType,
  fallbackChain: ProviderType[] = DEFAULT_FALLBACK_CHAIN
): Promise<{ provider: ProviderType; model: string } | null> {
  const statuses = await checkProviderAvailability();
  const currentIndex = fallbackChain.indexOf(currentProvider);

  // Start from the next provider in chain
  for (let i = currentIndex + 1; i < fallbackChain.length; i++) {
    const provider = fallbackChain[i];
    const status = statuses.find(s => s.provider === provider);

    if (status?.available && status.models.length > 0) {
      return {
        provider,
        model: status.models[0]
      };
    }
  }

  return null;
}

/**
 * Log provider health status
 * EXACT match to CLI, adapted for VS Code console
 */
export async function logProviderHealth(): Promise<void> {
  const statuses = await checkProviderAvailability();
  const available = statuses.filter(s => s.available);

  if (available.length === 0) {
    console.warn('No AI providers available!');
    console.info('Options:');
    console.info('  1. Set ciphermate.ai.anthropic.apiKey for Claude');
    console.info('  2. Set ciphermate.ai.openai.apiKey for OpenAI/ChatGPT');
    console.info('  3. Set ciphermate.ai.gemini.apiKey for Gemini');
    console.info('  4. Install Ollama for free local models: https://ollama.com');
  } else {
    console.info(`Available AI providers: ${available.map(s => s.provider).join(', ')}`);
  }

  // Log detailed status for debugging
  for (const status of statuses) {
    if (!status.available) {
      console.debug(`${status.provider}: ${status.reason}`);
    }
  }
}
