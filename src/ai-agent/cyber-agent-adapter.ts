/**
 * CyberAgent Adapter - Uses EXACT CLI implementation
 * 
 * This adapter wraps the CLI's CyberAgent and reads from VS Code settings
 * All AI logic is EXACTLY the same as Cyber-Claude CLI
 */

import * as vscode from 'vscode';
import { CyberAgent, createCyberAgentFromSettings } from './cli-cyber-agent';
import type { AIChatOptions } from './providers/cli-base';

export type AgentMode = 'base' | 'redteam' | 'blueteam' | 'desktopsecurity' | 'webpentest' | 'osint' | 'smartcontract';

export interface CyberAgentConfig {
  mode?: AgentMode;
  model?: string;
  maxTokens?: number;
  useConversationModel?: boolean;
}

export class CyberAgentAdapter {
  private context: vscode.ExtensionContext;
  private cyberAgent!: CyberAgent;
  private mode: AgentMode;
  private useConversationModel: boolean;
  private initPromise: Promise<void>;

  constructor(context: vscode.ExtensionContext, config: CyberAgentConfig = {}) {
    this.context = context;
    this.mode = config.mode || 'base';
    this.useConversationModel = config.useConversationModel ?? true;
    this.initPromise = this.refreshAgent();
  }

  private async refreshAgent(): Promise<void> {
    this.cyberAgent = await createCyberAgentFromSettings(this.context, this.mode, this.useConversationModel);
    console.log(`CyberAgentAdapter: Initialized with mode: ${this.mode}, provider: ${this.cyberAgent.getProviderName()}`);
  }

  private async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  /**
   * Send a message to the agent and get a response
   * EXACT match to CLI's CyberAgent.chat()
   * Refreshes agent before each call so settings changes (model, API key) take effect immediately.
   */
  async chat(userMessage: string, chatOptions?: AIChatOptions): Promise<string> {
    await this.ensureInitialized();
    const prevHistory = this.cyberAgent.getHistory();
    await this.refreshAgent();
    if (prevHistory.length > 0) {
      this.cyberAgent.setHistory(prevHistory);
    }
    return this.cyberAgent.chat(userMessage, chatOptions);
  }

  /**
   * Run a specific security analysis task
   * EXACT match to CLI's CyberAgent.analyze()
   */
  async analyze(task: string, context?: any): Promise<string> {
    await this.refreshAgent();
    return this.cyberAgent.analyze(task, context);
  }

  /**
   * Change the agent's mode
   * EXACT match to CLI's CyberAgent.setMode()
   */
  setMode(mode: AgentMode): void {
    this.mode = mode;
    this.cyberAgent?.setMode(mode);
  }

  /**
   * Clear conversation history
   * EXACT match to CLI's CyberAgent.clearHistory()
   */
  clearHistory(): void {
    this.cyberAgent?.clearHistory();
  }

  /**
   * Get current mode
   * EXACT match to CLI's CyberAgent.getMode()
   */
  getMode(): AgentMode {
    return this.cyberAgent?.getMode() ?? this.mode;
  }

  /**
   * Get conversation history
   * EXACT match to CLI's CyberAgent.getHistory()
   */
  getHistory() {
    return this.cyberAgent?.getHistory() ?? [];
  }

  /**
   * Get provider name
   * EXACT match to CLI's CyberAgent.getProviderName()
   */
  getProviderName(): string {
    return this.cyberAgent?.getProviderName() ?? 'Initializing...';
  }
}

