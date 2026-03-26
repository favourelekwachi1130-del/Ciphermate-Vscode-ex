/**
 * Scripter Engine - CipherMate's agentic AI
 *
 * Single tier: everyone gets the best. Powered by OpenRouter (or your fine-tuned model when ready).
 * The agentic workflow uses skills (SKILL.md) and intent; no plan levels.
 *
 * Key sync: when a CipherMate or OpenRouter key is stored, it is synced so
 * optional classic fix engine can use the same key.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─────────────────────────────────────────────────────────────────────────────
// Single tier: everyone gets the best (OpenRouter; fine-tuned model when ready)
// ─────────────────────────────────────────────────────────────────────────────

export type ScripterTier = 'scripter';

export interface ScripterTierConfig {
  id: ScripterTier;
  displayName: string;
  tagline: string;
  costMultiplier: number;
  model: string;
  contextLength: number;
  maxTokens: number;
  useCases: string[];
}

export const SCRIPTER_TIERS: Record<ScripterTier, ScripterTierConfig> = {
  scripter: {
    id: 'scripter',
    displayName: 'Scripter',
    tagline: 'Best model for all tasks',
    costMultiplier: 1,
    model: 'openrouter/auto',
    contextLength: 200000,
    maxTokens: 32000,
    useCases: ['Security scans', 'Fixes', 'Audits', 'Pentest', 'Chat', 'Code review'],
  },
};

export const DEFAULT_TIER: ScripterTier = 'scripter';

// ─────────────────────────────────────────────────────────────────────────────
// Token balance (stub — connects to CipherMate billing API)
// ─────────────────────────────────────────────────────────────────────────────

export interface ScripterTokenBalance {
  available: number;
  used: number;
  plan: 'free' | 'starter' | 'pro' | 'enterprise';
}

const CIPHERMATE_API_URL = 'https://api.ciphermate.ai';

export class ScripterTokenManager {
  private context: vscode.ExtensionContext;
  private _balance: ScripterTokenBalance | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async getBalance(): Promise<ScripterTokenBalance> {
    if (this._balance) return this._balance;
    try {
      const apiKey = await this.context.secrets.get('ciphermate.api.key');
      if (!apiKey) {
        return { available: 0, used: 0, plan: 'free' };
      }
      const resp = await fetch(`${CIPHERMATE_API_URL}/v1/tokens/balance`, {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      });
      if (!resp.ok) return { available: 0, used: 0, plan: 'free' };
      this._balance = await resp.json() as ScripterTokenBalance;
      return this._balance;
    } catch {
      return { available: 0, used: 0, plan: 'free' };
    }
  }

  invalidateCache(): void {
    this._balance = null;
  }

  async openBuyTokens(): Promise<void> {
    vscode.env.openExternal(vscode.Uri.parse(`${CIPHERMATE_API_URL}/billing/tokens`));
  }

  async openManagePlan(): Promise<void> {
    vscode.env.openExternal(vscode.Uri.parse(`${CIPHERMATE_API_URL}/billing/plan`));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Kode key sync - keeps ~/.kode.json in sync with the active key
// ─────────────────────────────────────────────────────────────────────────────

const KODE_CONFIG_PATH = path.join(os.homedir(), '.kode.json');

/**
 * Read ~/.kode.json (or return a default skeleton if it doesn't exist).
 */
function readKodeConfig(): Record<string, unknown> {
  try {
    if (fs.existsSync(KODE_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(KODE_CONFIG_PATH, 'utf-8'));
    }
  } catch {
    // corrupt file - rebuild
  }
  return {};
}

/**
 * Write object to ~/.kode.json atomically.
 */
function writeKodeConfig(config: Record<string, unknown>): void {
  const tmp = KODE_CONFIG_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf-8');
  fs.renameSync(tmp, KODE_CONFIG_PATH);
}

/**
 * Sync the active OpenRouter key and Scripter tier model into ~/.kode.json.
 *
 * Called automatically when:
 *   - A token purchase completes and the key is stored
 *   - The user changes their Scripter tier
 *   - The extension activates and a key is already present
 *
 * This means Kode-powered features (fix generation, DAST, explanations)
 * always use the same key the user paid for — no manual configuration.
 */
/**
 * Choose the right model name for Kode based on key type.
 * Kode validates model names — it accepts gpt-4o (OpenAI registry) and
 * claude-3-5-haiku-20241022 (Anthropic registry) but rejects OpenRouter slugs.
 */
function getKodeModelName(tierConfig: ScripterTierConfig, isCmToken: boolean): string {
  if (isCmToken) {
    // CipherMate backend accepts Scripter tier IDs and resolves them server-side
    // Kode doesn't validate these since we're setting provider: "openai" with
    // CipherMate's endpoint. Map to a real model name Kode's validator accepts.
    const tierToModel: Record<string, string> = {
      scripter: 'gpt-4o',
    };
    return tierToModel[tierConfig.id] ?? 'gpt-4o';
  }
  // Direct model slug
  return tierConfig.model;
}

export function syncKeyToKode(apiKey: string, tierConfig: ScripterTierConfig): void {
  try {
    const existing = readKodeConfig();

    const profiles: Record<string, unknown>[] = Array.isArray(existing.modelProfiles)
      ? (existing.modelProfiles as Record<string, unknown>[])
      : [];

    // Strategy: inject into Kode's built-in profiles rather than creating a new one.
    // Kode validates profile schemas and rejects profiles with unknown fields — a custom
    // profile named 'ciphermate-scripter' gets flagged as invalid and Kode falls back to
    // an empty-key profile, causing 401 auth loops.
    //
    // Fix: update the existing 'openrouter-default' profile (Kode knows it) or add a clean
    // minimal profile without any __ciphermateManaged metadata inside the profile object.
    // We track the managed state in a top-level field instead.

    const MANAGED_PROFILE_NAME = 'openrouter-ciphermate';
    const isCmToken = apiKey.startsWith('cm-');

    // When using CipherMate API: endpoint is api.ciphermate.ai, model is a real name
    // When using OpenRouter fallback: endpoint is openrouter.ai, model is the OR slug
    const apiUrl = isCmToken
      ? (vscode.workspace.getConfiguration('ciphermate').get<string>('scripterMax.apiUrl') || 'https://api.ciphermate.ai/v1')
      : 'https://openrouter.ai/api/v1';

    const modelName = getKodeModelName(tierConfig, isCmToken);

    // Remove any previous attempts (both old name and new name)
    const cleanedProfiles = profiles.filter((p) => {
      const name = String((p as any).name ?? '');
      return name !== 'ciphermate-scripter' && name !== MANAGED_PROFILE_NAME;
    });

    // Also update the built-in 'openrouter-default' with the current key
    const updatedProfiles = cleanedProfiles.map((p) => {
      if ((p as any).name === 'openrouter-default') {
        return { ...p, apiKey, apiUrl, modelName };
      }
      return p;
    });

    // Create a clean, Kode-schema-compatible profile (no custom __ fields inside profile)
    const managedProfile: Record<string, unknown> = {
      name: MANAGED_PROFILE_NAME,
      provider: 'openai',
      modelName,           // real model name Kode validator accepts
      apiKey,
      apiUrl,              // CipherMate API or OpenRouter
      maxTokens: tierConfig.maxTokens,
      contextLength: tierConfig.contextLength,
      isActive: true,
      createdAt: Date.now(),
    };

    const updatedConfig: Record<string, unknown> = {
      ...existing,
      primaryProvider: 'openai',
      // Track managed state at top level (not inside profile — avoids schema rejection)
      __ciphermateManaged: MANAGED_PROFILE_NAME,
      __ciphermateTier: tierConfig.id,
      modelProfiles: [...updatedProfiles, managedProfile],
      modelPointers: {
        ...(typeof existing.modelPointers === 'object' && existing.modelPointers !== null
          ? existing.modelPointers
          : {}),
        main: MANAGED_PROFILE_NAME,
        task: MANAGED_PROFILE_NAME,
        compact: MANAGED_PROFILE_NAME,
        quick: MANAGED_PROFILE_NAME,
      },
    };

    writeKodeConfig(updatedConfig);
    console.log(`ScripterEngine: Synced key to ~/.kode.json → profile "${MANAGED_PROFILE_NAME}" (tier: ${tierConfig.displayName})`);
  } catch (e) {
    console.warn('ScripterEngine: Failed to sync key to ~/.kode.json', e);
  }
}

/**
 * Remove the CipherMate-managed profile from ~/.kode.json.
 * Called when the user logs out or revokes their key.
 */
export function removeKeyFromKode(): void {
  try {
    const existing = readKodeConfig();
    if (!existing.modelProfiles) return;

    const MANAGED_NAMES = new Set(['ciphermate-scripter', 'openrouter-ciphermate']);
    const profiles = (existing.modelProfiles as Record<string, unknown>[]).filter(
      (p) => !MANAGED_NAMES.has(String((p as any).name ?? ''))
    );

    const pointers = typeof existing.modelPointers === 'object' && existing.modelPointers !== null
      ? { ...(existing.modelPointers as Record<string, unknown>) }
      : {};

    // If pointers were pointing at our profile, clear them
    for (const [k, v] of Object.entries(pointers)) {
      if (v === 'ciphermate-scripter') delete pointers[k];
    }

    writeKodeConfig({ ...existing, modelProfiles: profiles, modelPointers: pointers });
    console.log('ScripterEngine: Removed CipherMate key from ~/.kode.json');
  } catch (e) {
    console.warn('ScripterEngine: Failed to remove key from ~/.kode.json', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scripter Engine - main class
// ─────────────────────────────────────────────────────────────────────────────

export class ScripterEngine {
  private context: vscode.ExtensionContext;
  public readonly tokens: ScripterTokenManager;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.tokens = new ScripterTokenManager(context);
  }

  /**
   * Whether the user explicitly chose their own model (openrouter, anthropic, etc.).
   * In own-key mode, Scripter tiers are bypassed and the user's key is used directly.
   * When ai.provider is "scripter" (default), we are NOT in own-key mode — Scripter is primary.
   */
  isOwnKeyMode(): boolean {
    const config = vscode.workspace.getConfiguration('ciphermate');
    const provider = config.get<string>('ai.provider', 'scripter');
    if (provider === 'scripter') return false;
    const openrouterKey = config.get<string>('ai.openrouter.apiKey', '');
    const anthropicKey = config.get<string>('ai.anthropic.apiKey', '');
    const openaiKey = config.get<string>('ai.openai.apiKey', '');
    return !!(openrouterKey || anthropicKey || openaiKey);
  }

  /**
   * Get the currently selected Scripter tier (from settings).
   */
  getActiveTier(): ScripterTier {
    const config = vscode.workspace.getConfiguration('ciphermate');
    const tier = config.get<string>('scripter.tier', DEFAULT_TIER) as ScripterTier;
    return SCRIPTER_TIERS[tier] ? tier : DEFAULT_TIER;
  }

  /**
   * Get the tier config for a given tier (or the active tier).
   */
  getTierConfig(tier?: ScripterTier): ScripterTierConfig {
    return SCRIPTER_TIERS[tier ?? this.getActiveTier()];
  }

  /**
   * Get the OpenRouter model string to use for the active tier.
   * This is the internal routing — NOT shown to users.
   */
  getActiveModel(): string {
    return this.getTierConfig().model;
  }

  /**
   * Get OpenRouter API key from CipherMate token system OR own-key.
   * In Scripter mode: reads from CipherMate secret store (key purchased from us).
   * In own-key mode: reads from user-configured provider keys.
   */
  async getAPIKey(): Promise<string | undefined> {
    if (this.isOwnKeyMode()) {
      const config = vscode.workspace.getConfiguration('ciphermate');
      const provider = config.get<string>('ai.provider', 'scripter');
      const key = config.get<string>(`ai.${provider}.apiKey`, '');
      if (key) return key;
      return await this.context.secrets.get(`ciphermate.ai.${provider}.apiKey`);
    }
    return await this.context.secrets.get('ciphermate.openrouter.key');
  }

  /**
   * Store a CipherMate token (cm-xxx) after purchase.
   * This is the PRIMARY token for CipherMate's own API — no OpenRouter/Anthropic keys needed.
   * Automatically syncs to ~/.kode.json so Kode works too.
   */
  async storeCiphermateToken(token: string): Promise<void> {
    // Store as the primary CipherMate API token
    await this.context.secrets.store('ciphermate.api.token', token);
    // Also store in the legacy slot so existing code paths find it
    if (token.startsWith('sk-or-') || token.startsWith('cm-')) {
      await this.context.secrets.store('ciphermate.openrouter.key', token);
    }
    syncKeyToKode(token, this.getTierConfig());
    this.tokens.invalidateCache();
    try {
      const { getScripterKeyPool } = await import('./scripter-key-pool');
      await getScripterKeyPool(this.context).refresh();
    } catch { /* pool not critical */ }
  }

  /**
   * Store the CipherMate OpenRouter key (called after a token purchase).
   * @deprecated Use storeCiphermateToken() for new cm- tokens.
   */
  async storeKey(apiKey: string): Promise<void> {
    return this.storeCiphermateToken(apiKey);
  }

  /**
   * Remove the stored key (logout / revoke).
   * Cleans up ~/.kode.json automatically.
   */
  async revokeKey(): Promise<void> {
    await this.context.secrets.delete('ciphermate.openrouter.key');
    removeKeyFromKode();
    this.tokens.invalidateCache();
  }

  /**
   * On extension activation: if a key is already stored, ensure ~/.kode.json
   * is up-to-date (handles Kode updates or deleted config).
   */
  async syncOnActivation(): Promise<void> {
    // Find the best available key from any source and sync it to Kode
    const key = await this.getAPIKey();
    if (key) {
      syncKeyToKode(key, this.getTierConfig());
    }
  }

  /**
   * Build an OpenRouter-compatible provider config for the active tier.
   * Used by MultiProviderAIService when routing through Scripter.
   */
  async buildProviderConfig(): Promise<{
    provider: 'openrouter';
    model: string;
    apiKey: string;
    apiUrl: string;
    maxTokens: number;
  } | null> {
    const apiKey = await this.getAPIKey();
    if (!apiKey) return null;
    const tier = this.getTierConfig();
    return {
      provider: 'openrouter',
      model: tier.model,
      apiKey,
      apiUrl: 'https://openrouter.ai/api/v1',
      maxTokens: tier.maxTokens,
    };
  }

  /**
   * Show tier picker in VS Code quick pick (no model names exposed).
   */
  async showTierPicker(): Promise<ScripterTier | undefined> {
    const activeTier = this.getActiveTier();
    const items = Object.values(SCRIPTER_TIERS).map((t) => ({
      label: `${t.displayName}${t.id === activeTier ? '  ✓' : ''}`,
      description: t.tagline,
      detail: `${t.costMultiplier}x tokens · Best for: ${t.useCases.slice(0, 2).join(', ')}`,
      tierId: t.id,
    }));

    const pick = await vscode.window.showQuickPick(items, {
      title: 'Select Scripter Engine Tier',
      placeHolder: 'Choose a Scripter tier for your tasks',
    });

    if (!pick) return undefined;
    const tier = pick.tierId as ScripterTier;
    await vscode.workspace.getConfiguration('ciphermate').update('scripter.tier', tier, vscode.ConfigurationTarget.Global);

    // Re-sync Kode config with the new tier's model
    if (!this.isOwnKeyMode()) {
      const key = await this.context.secrets.get('ciphermate.openrouter.key');
      if (key) syncKeyToKode(key, SCRIPTER_TIERS[tier]);
    }

    return tier;
  }

  /**
   * Show token balance status bar message.
   */
  async showTokenStatus(): Promise<void> {
    if (this.isOwnKeyMode()) {
      vscode.window.showInformationMessage('CipherMate: Own-key mode active. Scripter tiers bypassed.');
      return;
    }
    const balance = await this.tokens.getBalance();
    const tier = this.getTierConfig();
    const msg = balance.available > 0
      ? `Scripter Engine: ${balance.available.toLocaleString()} tokens available (${tier.displayName} active)`
      : `Scripter Engine: No tokens. Click to buy.`;
    const action = await vscode.window.showInformationMessage(msg, 'Buy Tokens', 'Change Plan');
    if (action === 'Buy Tokens') await this.tokens.openBuyTokens();
    if (action === 'Change Plan') await this.tokens.openManagePlan();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

let _instance: ScripterEngine | null = null;

export function getScripterEngine(context?: vscode.ExtensionContext): ScripterEngine {
  if (!_instance) {
    if (!context) throw new Error('ScripterEngine: context required for first init');
    _instance = new ScripterEngine(context);
  }
  return _instance;
}
