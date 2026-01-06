/**
 * Provider Status Checker - Interactive provider availability checking
 * Used by settings UI to show provider status and test connections
 */

import * as vscode from 'vscode';
import { createCyberAgentFromSettings } from './cli-cyber-agent';

export interface ProviderStatus {
  provider: string;
  available: boolean;
  configured: boolean;
  reason?: string;
  latency?: number;
  model?: string;
}

/**
 * Check status of all providers
 */
export async function checkAllProviders(): Promise<ProviderStatus[]> {
  const config = vscode.workspace.getConfiguration('ciphermate');
  const statuses: ProviderStatus[] = [];

  // Check Claude
  const claudeApiKey = config.get('ai.anthropic.apiKey', '') as string;
  statuses.push({
    provider: 'Claude (Anthropic)',
    available: false,
    configured: !!claudeApiKey,
    reason: claudeApiKey ? 'API key configured' : 'API key not set',
  });

  // Check OpenAI
  const openaiApiKey = config.get('ai.openai.apiKey', '') as string;
  statuses.push({
    provider: 'OpenAI',
    available: false,
    configured: !!openaiApiKey,
    reason: openaiApiKey ? 'API key configured' : 'API key not set',
  });

  // Check Gemini
  const geminiApiKey = config.get('ai.gemini.apiKey', '') as string;
  statuses.push({
    provider: 'Gemini (Google)',
    available: false,
    configured: !!geminiApiKey,
    reason: geminiApiKey ? 'API key configured' : 'API key not set',
  });

  // Check Ollama
  const ollamaUrl = config.get('ai.ollama.apiUrl', 'http://localhost:11434') as string;
  const ollamaModel = config.get('ai.ollama.model', 'deepseek-r1:14b') as string;
  
  try {
    const startTime = Date.now();
    const response = await fetch(`${ollamaUrl}/api/tags`, { 
      method: 'GET',
      signal: AbortSignal.timeout(3000) // 3 second timeout
    });
    const latency = Date.now() - startTime;
    
    if (response.ok) {
      const data = await response.json() as { models?: Array<{ name: string }> };
      const models = data.models || [];
      const hasModel = models.some((m: any) => m.name === ollamaModel || m.name.startsWith(ollamaModel.split(':')[0]));
      
      statuses.push({
        provider: 'Ollama (Local)',
        available: true,
        configured: true,
        latency,
        model: ollamaModel,
        reason: hasModel ? `Model ${ollamaModel} available` : `Model ${ollamaModel} not found. Available: ${models.map((m: any) => m.name).join(', ')}`,
      });
    } else {
      statuses.push({
        provider: 'Ollama (Local)',
        available: false,
        configured: true,
        reason: `Server responded with status ${response.status}`,
      });
    }
  } catch (error: any) {
    statuses.push({
      provider: 'Ollama (Local)',
      available: false,
      configured: true,
      reason: error.message?.includes('timeout') ? 'Connection timeout - Ollama may not be running' : `Connection failed: ${error.message}`,
    });
  }

  return statuses;
}

/**
 * Test a specific provider
 */
export async function testProvider(providerType: string): Promise<{ success: boolean; error?: string; latency?: number }> {
  const startTime = Date.now();
  
  try {
    // Create a test agent with the specified provider
    const config = vscode.workspace.getConfiguration('ciphermate');
    
    // Temporarily set provider
    const originalProvider = config.get('ai.provider', 'ollama');
    await config.update('ai.provider', providerType, vscode.ConfigurationTarget.Global);
    
    try {
      const agent = createCyberAgentFromSettings(vscode.extensions.getExtension('ciphermate.ciphermate')?.exports?.context || {} as any, 'base');
      const response = await agent.chat('Hello');
      const latency = Date.now() - startTime;
      
      // Restore original provider
      await config.update('ai.provider', originalProvider, vscode.ConfigurationTarget.Global);
      
      return { success: true, latency };
    } catch (error: any) {
      // Restore original provider
      await config.update('ai.provider', originalProvider, vscode.ConfigurationTarget.Global);
      throw error;
    }
  } catch (error: any) {
    const latency = Date.now() - startTime;
    return {
      success: false,
      error: error.message || String(error),
      latency,
    };
  }
}

/**
 * Get current provider status
 */
export async function getCurrentProviderStatus(): Promise<ProviderStatus | null> {
  const config = vscode.workspace.getConfiguration('ciphermate');
  const provider = config.get('ai.provider', 'ollama') as string;
  
  const allStatuses = await checkAllProviders();
  return allStatuses.find(s => s.provider.toLowerCase().includes(provider.toLowerCase())) || null;
}

