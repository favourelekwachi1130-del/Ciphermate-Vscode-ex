/**
 * DAST AI - Dual-provider support
 *
 * Strategist: OpenRouter/Claude (quality, 1 call)
 * Agent swarm: Ollama (volume, many parallel calls)
 *
 * Allows dedicating separate AI systems for max effectiveness.
 */

import * as vscode from 'vscode';
import { ProviderFactory, ProviderType } from '../ai-agent/providers/provider-factory';
import { BaseAIProvider } from '../ai-agent/providers/base-provider';
import { AIRequest, AIResponse } from '../ai-agent/providers/base-provider';

export type DastProviderRole = 'strategist' | 'swarm';

/** Get AI provider for DAST role. Strategist = quality (OpenRouter). Swarm = volume (Ollama). */
export async function getDastAIProvider(
  context: vscode.ExtensionContext,
  role: DastProviderRole
): Promise<BaseAIProvider> {
  const config = vscode.workspace.getConfiguration('ciphermate');
  const strategist = (config.get('dast.ai.strategistProvider', 'openrouter') || 'openrouter') as ProviderType;
  const swarm = (config.get('dast.ai.agentSwarmProvider', 'ollama') || 'ollama') as ProviderType;

  const type = role === 'strategist' ? strategist : swarm;
  return ProviderFactory.createProvider(context, type, true);
}

/** Call AI using the provider for the given role */
export async function callDastAI(
  context: vscode.ExtensionContext,
  role: DastProviderRole,
  request: AIRequest
): Promise<AIResponse> {
  const provider = await getDastAIProvider(context, role);
  return provider.callAI(request);
}
