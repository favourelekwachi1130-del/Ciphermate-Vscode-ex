/**
 * Mastra Adapter - Bridges ChatInterface with Mastra Agent
 * 
 * Provides memory-managed AI responses using Mastra's built-in memory system
 */

import * as vscode from 'vscode';

// Optional Mastra imports - will fail gracefully if packages not installed
let Agent: any = null;
let createSecurityAgent: any = null;

try {
  const mastraAgent = require('../mastra/agents/security-agent');
  createSecurityAgent = mastraAgent.createSecurityAgent;
  // Try to import Agent type (may fail if @mastra/core not installed)
  try {
    Agent = require('@mastra/core/agent').Agent;
  } catch {
    // Agent type not critical for runtime
  }
} catch (error) {
  console.warn('Mastra packages not available:', error);
}

export class MastraAdapter {
  private agent: any = null;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    
    // Check if Mastra is available
    if (!createSecurityAgent) {
      throw new Error('Mastra packages not installed. Run: npm install');
    }
  }

  /**
   * Initialize Mastra agent (lazy initialization)
   */
  private async getAgent(): Promise<any> {
    if (!createSecurityAgent) {
      throw new Error('Mastra packages not available');
    }
    
    if (!this.agent) {
      try {
        this.agent = createSecurityAgent(this.context);
      } catch (error: any) {
        console.error('Failed to create Mastra agent:', error);
        // Check if it's a native module error
        if (error.message?.includes('darwin-arm64') || error.message?.includes('Cannot find module')) {
          throw new Error('Mastra native dependencies not available. Please run: npm install');
        }
        throw new Error(`Mastra agent initialization failed: ${error.message || error}`);
      }
    }
    return this.agent;
  }

  /**
   * Process user request with Mastra's memory management
   */
  async processRequest(
    userRequest: string,
    workspacePath?: string
  ): Promise<string> {
    try {
      const agent = await this.getAgent();
      
      // Get workspace path
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const resourceId = workspacePath || 
                         workspaceFolders?.[0]?.uri.fsPath || 
                         'default';
      
      // Generate thread ID from current session or create new one
      const threadId = `thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const memoryOpts = { 
        memory: { thread: threadId, resource: resourceId },
        modelSettings: { maxOutputTokens: 8192 }
      };
      let response: any;

      // Try generate() first (V2/AI SDK v5). On V4/model mismatch errors, fall back to generateLegacy().
      // If generateLegacy() then fails with "V2 models not supported", we have a ping-pong conflict
      // and re-throw the original error so the user sees the real model compatibility issue.
      try {
        response = await agent.generate(userRequest, memoryOpts);
      } catch (err: any) {
        const msg = err?.message || String(err);
        const needsLegacy = msg.includes('streamLegacy') || msg.includes('AI SDK v4') || msg.includes('not compatible with stream');
        if (needsLegacy && typeof agent.generateLegacy === 'function') {
          try {
            response = await agent.generateLegacy(userRequest, memoryOpts);
          } catch (legacyErr: any) {
            const legacyMsg = legacyErr?.message || String(legacyErr);
            const isV2ForLegacy = legacyMsg.includes('V2 models are not supported for generateLegacy') || legacyMsg.includes('Please use generate instead');
            if (isV2ForLegacy) {
              console.warn('Mastra API conflict: model classified as both V4 and V2. Re-throwing original error.');
              throw err;
            }
            throw legacyErr;
          }
        } else {
          throw err;
        }
      }

      // generate() returns { text: Promise<string> }; generateLegacy() returns { text: string }
      const text = typeof response.text === 'string' ? response.text : await response.text;
      return text || 'No response generated';
    } catch (error) {
      console.error('Mastra agent error:', error);
      throw error;
    }
  }

  /**
   * Stream response (for future use)
   */
  async *streamRequest(
    userRequest: string,
    workspacePath?: string
  ): AsyncGenerator<string, void, unknown> {
    try {
      const agent = await this.getAgent();
      
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const resourceId = workspacePath || 
                         workspaceFolders?.[0]?.uri.fsPath || 
                         'default';
      
      const threadId = `thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const memoryOpts = { 
        memory: { thread: threadId, resource: resourceId },
        modelSettings: { maxOutputTokens: 8192 }
      };

      let stream: any;
      try {
        stream = await agent.stream(userRequest, memoryOpts);
      } catch (err: any) {
        const msg = err?.message || String(err);
        const needsLegacy = msg.includes('streamLegacy') || msg.includes('AI SDK v4') || msg.includes('not compatible with stream');
        if (needsLegacy && typeof agent.streamLegacy === 'function') {
          try {
            stream = await agent.streamLegacy(userRequest, memoryOpts);
          } catch (legacyErr: any) {
            const legacyMsg = legacyErr?.message || String(legacyErr);
            const isV2ForLegacy = legacyMsg.includes('V2 models are not supported for streamLegacy') || legacyMsg.includes('Please use stream instead');
            if (isV2ForLegacy) {
              console.warn('Mastra API conflict: model classified as both V4 and V2. Re-throwing original error.');
              throw err;
            }
            throw legacyErr;
          }
        } else {
          throw err;
        }
      }

      const textStream = stream.textStream || stream;
      for await (const chunk of textStream) {
        yield typeof chunk === 'string' ? chunk : (chunk?.textDelta ?? '');
      }
    } catch (error) {
      console.error('Mastra streaming error:', error);
      throw error;
    }
  }

  /**
   * Get citations (if available from Mastra)
   */
  getCitations(): string {
    // Mastra handles citations internally through memory
    // Return empty for now, can be enhanced later
    return '';
  }

  /**
   * Clear memory for a specific thread/resource
   */
  async clearMemory(threadId?: string, resourceId?: string): Promise<void> {
    // Mastra handles memory cleanup automatically through processors
    // This is mainly for explicit cleanup if needed
    if (this.agent && threadId && resourceId) {
      // Memory cleanup is handled by Mastra's TokenLimiter and processors
      // No manual cleanup needed
    }
  }

  /**
   * Reset agent (useful for testing)
   */
  reset(): void {
    this.agent = null;
  }
}
