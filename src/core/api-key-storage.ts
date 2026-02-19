/**
 * Enterprise-grade API key storage using VS Code SecretStorage
 * 
 * Secrets are stored in the OS keychain (macOS Keychain, Windows Credential Manager,
 * Linux libsecret) - never in plain text in settings.json.
 * 
 * Migration: On first read, if a key exists in settings but not in SecretStorage,
 * it is migrated automatically and removed from settings for security.
 */

import * as vscode from 'vscode';

const SECRET_PREFIX = 'ciphermate.ai.';
const PROVIDERS_WITH_KEYS = ['openrouter', 'openai', 'anthropic', 'gemini', 'custom'] as const;

export type ApiKeyProvider = typeof PROVIDERS_WITH_KEYS[number];

export class ApiKeyStorage {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('ciphermate')
  ) {}

  /**
   * Get API key for a provider. Checks SecretStorage first, then config (with migration).
   */
  async get(provider: ApiKeyProvider): Promise<string> {
    const secretKey = SECRET_PREFIX + provider + '.apiKey';
    
    // 1. Try SecretStorage first (secure)
    let value = await this.context.secrets.get(secretKey);
    
    // 2. Fallback: migrate from settings if present
    if (!value || value.trim() === '') {
      const configKey = `ai.${provider}.apiKey`;
      const fromConfig = this.config.get<string>(configKey, '') || '';
      if (fromConfig && fromConfig.trim() !== '') {
        await this.set(provider, fromConfig);
        // Remove from config: get parent object, delete apiKey, write back
        try {
          const parent = this.config.get<Record<string, unknown>>(`ai.${provider}`, {});
          if (parent && typeof parent === 'object') {
            const updated = { ...parent };
            delete updated.apiKey;
            await this.config.update(`ai.${provider}`, updated, vscode.ConfigurationTarget.Global);
          }
        } catch {
          // Migration cleanup best-effort; key is now in SecretStorage
        }
        value = fromConfig;
      }
    }
    
    return value || '';
  }

  /**
   * Store API key securely in SecretStorage (OS keychain).
   * Never logs or persists the key in plain text.
   */
  async set(provider: ApiKeyProvider, value: string): Promise<void> {
    const secretKey = SECRET_PREFIX + provider + '.apiKey';
    if (value && value.trim() !== '') {
      await this.context.secrets.store(secretKey, value.trim());
    } else {
      await this.context.secrets.delete(secretKey);
    }
  }

  /**
   * Delete stored API key
   */
  async delete(provider: ApiKeyProvider): Promise<void> {
    const secretKey = SECRET_PREFIX + provider + '.apiKey';
    await this.context.secrets.delete(secretKey);
  }

  /**
   * Check if a key is configured (without revealing it)
   */
  async has(provider: ApiKeyProvider): Promise<boolean> {
    const key = await this.get(provider);
    return !!key && key.trim() !== '';
  }

  /**
   * Get API key for any provider type (for ProviderFactory)
   */
  async getForProvider(providerType: string): Promise<string> {
    if (PROVIDERS_WITH_KEYS.includes(providerType as ApiKeyProvider)) {
      return this.get(providerType as ApiKeyProvider);
    }
    return '';
  }
}
