/**
 * CyberAgent Adapter - Uses EXACT CLI implementation
 * 
 * This adapter wraps the CLI's CyberAgent and reads from VS Code settings
 * All AI logic is EXACTLY the same as Cyber-Claude CLI
 */

import * as vscode from 'vscode';
import { CyberAgent, createCyberAgentFromSettings } from './cli-cyber-agent';

export type AgentMode = 'base' | 'redteam' | 'blueteam' | 'desktopsecurity' | 'webpentest' | 'osint' | 'smartcontract';

export interface CyberAgentConfig {
  mode?: AgentMode;
  model?: string;
  maxTokens?: number;
}

export class CyberAgentAdapter {
  private context: vscode.ExtensionContext;
  private cyberAgent: CyberAgent;
  private mode: AgentMode;

  constructor(context: vscode.ExtensionContext, config: CyberAgentConfig = {}) {
    this.context = context;
    this.mode = config.mode || 'base';
    
    // Create CyberAgent using EXACT CLI implementation
    // It reads from VS Code settings but uses CLI's exact logic
    this.cyberAgent = createCyberAgentFromSettings(context, this.mode);
    
    console.log(`CyberAgentAdapter: Initialized with mode: ${this.mode}, provider: ${this.cyberAgent.getProviderName()}`);
  }

  /**
   * Send a message to the agent and get a response
   * EXACT match to CLI's CyberAgent.chat()
   */
  async chat(userMessage: string): Promise<string> {
    return this.cyberAgent.chat(userMessage);
  }

  /**
   * Run a specific security analysis task
   * EXACT match to CLI's CyberAgent.analyze()
   */
  async analyze(task: string, context?: any): Promise<string> {
    return this.cyberAgent.analyze(task, context);
  }

  /**
   * Change the agent's mode
   * EXACT match to CLI's CyberAgent.setMode()
   */
  setMode(mode: AgentMode): void {
    this.mode = mode;
    this.cyberAgent.setMode(mode);
  }

  /**
   * Clear conversation history
   * EXACT match to CLI's CyberAgent.clearHistory()
   */
  clearHistory(): void {
    this.cyberAgent.clearHistory();
  }

  /**
   * Get current mode
   * EXACT match to CLI's CyberAgent.getMode()
   */
  getMode(): AgentMode {
    return this.cyberAgent.getMode();
  }

  /**
   * Get conversation history
   * EXACT match to CLI's CyberAgent.getHistory()
   */
  getHistory() {
    return this.cyberAgent.getHistory();
  }

  /**
   * Get provider name
   * EXACT match to CLI's CyberAgent.getProviderName()
   */
  getProviderName(): string {
    return this.cyberAgent.getProviderName();
  }
}

