import * as vscode from 'vscode';
import { AIAgentCore, AgentRequest, AgentResponse } from './core';
import { AgenticCore } from './agentic-core';
import { CyberAgentAdapter } from './cyber-agent-adapter';

/**
 * Conversational Chat Interface - The only UI users need
 * 
 * Simple, direct conversation. No buttons, no complexity.
 * Just tell CipherMate what you need.
 */

interface ChatSession {
  id: string;
  name: string;
  theme: string;
  messages: Array<{role: 'user' | 'assistant', content: string, timestamp: Date}>;
  createdAt: Date;
  updatedAt: Date;
}

export class ChatInterface {
  private panel: vscode.WebviewPanel | null = null;
  private agent: AIAgentCore;
  private agenticCore: AgenticCore;
  private cyberAgent: CyberAgentAdapter;
  private context: vscode.ExtensionContext;
  private messageHistory: Array<{role: 'user' | 'assistant', content: string, timestamp: Date}> = [];
  private useAgenticCore: boolean = true; // Use agentic core by default
  private useCyberAgent: boolean = true; // Use CyberAgent for conversational AI
  private currentSession: ChatSession | null = null;
  private chatSessions: ChatSession[] = [];
  private thinkingSteps: string[] = [];

  constructor(context: vscode.ExtensionContext, agent: AIAgentCore) {
    this.context = context;
    this.agent = agent;
    this.agenticCore = new AgenticCore(context);
    this.cyberAgent = new CyberAgentAdapter(context, { mode: 'base' });
    this.loadChatSessions();
    this.createNewSession();
    
    // Listen for workspace changes to auto-retry pending requests
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      const state = this.agenticCore.getState();
      if (state.context.pendingRequest) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          // Workspace opened, retry the pending request
          const pendingRequest = state.context.pendingRequest;
          state.context.pendingRequest = undefined;
          
          if (this.panel) {
            this.addMessage('assistant', `Great! I see you've opened a repository. Let me retry your previous request: "${pendingRequest}"`);
            // Small delay to let the message appear
            setTimeout(() => {
              this.processUserMessage(pendingRequest);
            }, 500);
          }
        }
      }
    });
  }

  /**
   * Create a new chat session
   */
  createNewSession(name?: string, theme?: string): void {
    const sessionId = `chat-${Date.now()}`;
    const sessionName = name || this.generateSessionName();
    const sessionTheme = theme || this.generateTheme();
    
    this.currentSession = {
      id: sessionId,
      name: sessionName,
      theme: sessionTheme,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.messageHistory = [];
    this.chatSessions.push(this.currentSession);
    this.saveChatSessions();
    
    if (this.panel) {
      this.panel.webview.postMessage({
        command: 'sessionChanged',
        session: this.currentSession
      });
    }
  }

  /**
   * Generate a session name based on first message or default
   */
  private generateSessionName(): string {
    if (this.messageHistory.length > 0) {
      const firstMessage = this.messageHistory[0].content;
      // Extract key words from first message
      if (firstMessage.toLowerCase().includes('scan')) return 'Security Scan';
      if (firstMessage.toLowerCase().includes('fix')) return 'Vulnerability Fixes';
      if (firstMessage.toLowerCase().includes('explain')) return 'Security Explanation';
      return firstMessage.substring(0, 30) + (firstMessage.length > 30 ? '...' : '');
    }
    return `Chat ${new Date().toLocaleDateString()}`;
  }

  /**
   * Generate a theme color
   */
  private generateTheme(): string {
    const themes = ['blue', 'green', 'purple', 'orange', 'red', 'teal'];
    return themes[Math.floor(Math.random() * themes.length)];
  }

  /**
   * Load chat sessions from storage
   */
  private loadChatSessions(): void {
    try {
      const saved = this.context.globalState.get<ChatSession[]>('ciphermate.chatSessions', []);
      this.chatSessions = saved.map(s => ({
        ...s,
        createdAt: new Date(s.createdAt),
        updatedAt: new Date(s.updatedAt),
        messages: s.messages.map(m => ({
          ...m,
          timestamp: new Date(m.timestamp)
        }))
      }));
    } catch (error) {
      console.error('Failed to load chat sessions:', error);
      this.chatSessions = [];
    }
  }

  /**
   * Save chat sessions to storage
   */
  private saveChatSessions(): void {
    try {
      // Keep only last 50 sessions
      if (this.chatSessions.length > 50) {
        this.chatSessions = this.chatSessions.slice(-50);
      }
      this.context.globalState.update('ciphermate.chatSessions', this.chatSessions);
    } catch (error) {
      console.error('Failed to save chat sessions:', error);
    }
  }

  /**
   * Update current session name
   */
  updateSessionName(name: string): void {
    if (this.currentSession) {
      this.currentSession.name = name;
      this.currentSession.updatedAt = new Date();
      this.saveChatSessions();
      
      if (this.panel) {
        this.panel.webview.postMessage({
          command: 'sessionChanged',
          session: this.currentSession
        });
      }
    }
  }

  /**
   * Load a specific session
   */
  loadSession(sessionId: string): void {
    const session = this.chatSessions.find(s => s.id === sessionId);
    if (session) {
      this.currentSession = session;
      this.messageHistory = [...session.messages];
      
      if (this.panel) {
        this.panel.webview.postMessage({
          command: 'loadSession',
          session: session,
          messages: session.messages
        });
      }
    }
  }

  /**
   * Get all chat sessions
   */
  getChatSessions(): ChatSession[] {
    return [...this.chatSessions].sort((a, b) => 
      b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  }

  /**
   * Show or reveal the chat interface
   */
  show(): void {
    try {
      if (this.panel) {
        // Force update HTML to ensure latest changes are shown
        this.panel.webview.html = this.getChatHtml();
        this.setupMessageHandlers();
        // Restore messages after HTML is updated
        this.restoreMessages();
        this.panel.reveal();
        return;
      }

      this.panel = vscode.window.createWebviewPanel(
        'ciphermateChat',
        'CipherMate',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: false, // Disable to ensure fresh HTML on reload
          localResourceRoots: [this.context.extensionUri]
        }
      );

      this.panel.webview.html = this.getChatHtml();
      this.setupMessageHandlers();

      this.panel.onDidDispose(() => {
        this.panel = null;
      });

      // Restore existing messages or send initial greeting
      this.restoreMessages();
      
      // Check if we should show continue chat button
      setTimeout(() => {
        if (this.messageHistory.length > 0) {
          this.panel?.webview.postMessage({
            command: 'messageCount',
            count: this.messageHistory.length
          });
        }
      }, 200);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open chat: ${error}`);
      console.error('Chat interface error:', error);
    }
  }

  /**
   * Restore messages from messageHistory when webview is recreated
   */
  private restoreMessages(): void {
    if (!this.panel) {
      return;
    }

    // Wait for webview to be ready before sending messages
    setTimeout(() => {
      if (this.messageHistory.length > 0) {
        // Restore all existing messages
        console.log(`Restoring ${this.messageHistory.length} messages to webview`);
        this.messageHistory.forEach((msg) => {
          this.panel?.webview.postMessage({
            command: 'addMessage',
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp.toISOString()
          });
        });
      } else {
        // No existing messages, send initial greeting
        this.addMessage('assistant', 'CipherMate ready. How can I help secure your code?');
      }
    }, 100); // Small delay to ensure webview is ready
  }

  /**
   * Process user message
   */
  async processUserMessage(message: string): Promise<void> {
    if (!this.panel) {
      this.show();
    }

    // Add user message to chat
    this.addMessage('user', message);

    // Check for "who built you" / "who created you" type questions
    const creatorQuestionPatterns = [
      /who.*built.*you|who.*created.*you|who.*made.*you|who.*are.*you.*built.*by|who.*is.*your.*creator|who.*is.*your.*developer/i
    ];
    const isCreatorQuestion = creatorQuestionPatterns.some((pattern: RegExp) => pattern.test(message));
    
    if (isCreatorQuestion) {
      // Hide thinking and respond immediately
      this.hideThinking();
      this.clearThinking();
      const creatorResponse = `Hello! I'm CipherMate, an AI-powered cybersecurity assistant specializing in repository security and code analysis.\n\n` +
        `I was built by **Emmanuel Elekwachi**, a developer. I'm here to help you with security scanning, vulnerability detection, and code analysis. How can I assist you today?`;
      this.addMessage('assistant', creatorResponse);
      return;
    }

    // Check for casual greetings - let AI handle with warm response, but show thinking
    const greetingPatterns = [
      /^hi$|^hello$|^hey$|^hi!$|^hello!$|^hey!$/i
    ];
    const isGreeting = greetingPatterns.some((pattern: RegExp) => pattern.test(message.trim()));

    // Show thinking indicator for all messages (including greetings)
    this.showThinking();
    
    // For greetings, show thinking step to indicate active processing
    if (isGreeting) {
      this.showThinkingStep('Thinking...');
    }

    // Detect security-related requests (use agentic core) or conversational (use CyberAgent)
    // Define patterns outside try block so they're accessible in catch block
    const securityRequestPatterns: RegExp[] = [
      /scan|find|check|analyze|detect|audit/i,
      /secret|key|password|token|credential/i,
      /vulnerabilit|dependenc|package/i
    ];
    const isSecurityRequest = securityRequestPatterns.some((pattern: RegExp) => pattern.test(message));

    try {
      // Get current context
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const workspacePath = workspaceFolders?.[0]?.uri.fsPath;
      const hasWorkspace = workspaceFolders && workspaceFolders.length > 0;

      // Check if we have a pending request from when no workspace was open
      const agenticState = this.agenticCore.getState();
      if (agenticState.context.pendingRequest && hasWorkspace) {
        // User opened a workspace, retry the pending request
        const pendingRequest = agenticState.context.pendingRequest;
        agenticState.context.pendingRequest = undefined; // Clear it
        this.addMessage('assistant', `Great! I see you've opened a repository. Let me retry your previous request: "${pendingRequest}"`);
        message = pendingRequest; // Use the pending request instead
      }

      let responseText: string;
      const isSmartContractRequest = /smart.?contract|solidity|\.sol|web3|blockchain/i.test(message);
      const isWebSecurityRequest = /web|http|api|endpoint|owasp|xss|sql.?injection/i.test(message);

      if (isSecurityRequest && this.useAgenticCore) {
        // Show thinking process
        this.showThinking();
        this.showThinkingStep('Analyzing your request...');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Check workspace first
        if (!hasWorkspace) {
          this.showThinkingStep('Checking workspace...');
          await new Promise(resolve => setTimeout(resolve, 400));
          this.showThinkingStep('Preparing response...');
          await new Promise(resolve => setTimeout(resolve, 300));
        } else {
          this.showThinkingStep('Detecting workspace and preparing scanners...');
          await new Promise(resolve => setTimeout(resolve, 400));
          
          this.showThinkingStep('Running comprehensive security scan...');
        }
        
        try {
          // Use agentic core - true autonomous agent with tool calling
          responseText = await this.agenticCore.processRequest(message, workspacePath);
        } catch (error) {
          // If AI fails, use fallback - don't show error to user
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log('AI request failed, using fallback:', errorMessage);
          
          // Check if it's an AI provider error (including timeout and channel closed)
          const isAIProviderError = errorMessage.includes('All AI providers failed') || 
              (errorMessage.includes('model') && errorMessage.includes('not found')) ||
              errorMessage.includes('Ollama API Error') ||
              errorMessage.includes('API Error') ||
              errorMessage.includes('404') ||
              errorMessage.includes('timeout') ||
              errorMessage.includes('Channel closed');
          
          if (isAIProviderError) {
            if (!hasWorkspace) {
              // Use simple no-workspace message
              responseText = this.getNoWorkspaceFallbackMessage(message);
            } else {
              // Check if scan might have completed despite AI failure
              const state = this.agenticCore.getState();
              const hasScanResults = (state.scanResults && state.scanResults.length > 0) || 
                                     (state.vulnerabilities && state.vulnerabilities.length > 0);
              
              if (hasScanResults) {
                // Scan completed - show results even though AI failed
                responseText = `I completed the security scan successfully! However, I'm having trouble with the AI service for generating the detailed report.\n\n` +
                  `**Scan Results:**\n` +
                  `- Found ${state.vulnerabilities.length} potential issues\n` +
                  `- Check the VS Code Problems panel for details\n\n` +
                  `**To get AI-powered analysis:**\n` +
                  `- Configure your AI provider in Settings (⚙ icon)\n` +
                  `- Or pull the model: \`ollama pull deepseek-coder:latest\`\n\n` +
                  `**Note:** Security scans work independently of AI. The AI is only used for generating detailed reports.`;
              } else {
                // For workspace requests, provide helpful guidance without showing the error
                responseText = `I'm ready to help you ${message.toLowerCase()}, but I'm having trouble connecting to the AI service.\n\n` +
                  `**Quick fixes:**\n` +
                  `- Make sure your AI provider is configured (Settings ⚙ icon)\n` +
                  `- If using Ollama, pull the model: \`ollama pull deepseek-coder:latest\`\n` +
                  `- Or configure a different AI provider\n\n` +
                  `**Good news:** Your repository scan can still work! The security scanners don't require AI. ` +
                  `Try running the scan again once your AI provider is set up.`;
              }
            }
          } else {
            // Other errors - still provide helpful message
            if (!hasWorkspace) {
              responseText = this.getNoWorkspaceFallbackMessage(message);
            } else {
              responseText = `I encountered an issue while processing your request. Please try again. If the problem persists, check your AI provider configuration in Settings.`;
            }
          }
        }
        
        // Clear thinking and show final result
        await new Promise(resolve => setTimeout(resolve, 200));
        this.clearThinking();
        this.hideThinking();
        
        // Get state for additional context
        const state = this.agenticCore.getState();
        if (state.vulnerabilities.length > 0) {
          // Don't add extra message, it's already in the response
        }
      } else {
        // Use CyberAgent for conversational responses (regular human communication)
        // Set mode based on request type
        if (isSmartContractRequest) {
          this.cyberAgent.setMode('smartcontract');
        } else if (isWebSecurityRequest) {
          this.cyberAgent.setMode('webpentest');
        } else {
          this.cyberAgent.setMode('base');
        }

        // For regular human communication, use the message as-is
        // Only add workspace context if it's relevant to the conversation
        const needsWorkspaceContext = /code|file|project|repository|workspace/i.test(message);
        const contextMessage = (workspacePath && needsWorkspaceContext)
          ? `${message}\n\nContext: Working in repository at ${workspacePath}`
          : message;

        // Show thinking for conversational requests
        this.showThinkingStep('Thinking...');
        
        // Add timeout to prevent hanging (increased to 60 seconds for complex conversations)
        try {
          responseText = await Promise.race([
            this.cyberAgent.chat(contextMessage),
            new Promise<string>((_, reject) => {
              setTimeout(() => reject(new Error('Request timed out after 60 seconds')), 60000);
            })
          ]);
          
          // Success - clear thinking and return response
          this.clearThinking();
        } catch (chatError) {
          const chatErrorMessage = chatError instanceof Error ? chatError.message : String(chatError);
          console.log('CyberAgent chat failed:', chatErrorMessage);
          
          // Clear thinking on error
          this.clearThinking();
          
          // Provide friendly fallback response based on error type
          if (chatErrorMessage.includes('timeout')) {
            responseText = `I'm taking longer than expected to respond. This might be due to:\n\n` +
              `- AI provider connection issues\n` +
              `- Network latency\n` +
              `- Model processing time\n\n` +
              `**Quick fixes:**\n` +
              `- Check your AI provider configuration in Settings (⚙ icon)\n` +
              `- Try again in a moment\n` +
              `- Or try rephrasing your question\n\n` +
              `**Note:** Security scans (like "scan my repository") work independently of AI and don't require configuration.`;
          } else if (chatErrorMessage.includes('All AI providers failed') || 
                     chatErrorMessage.includes('model') && (chatErrorMessage.includes('not found') || chatErrorMessage.includes('404')) ||
                     chatErrorMessage.includes('Ollama API Error') ||
                     chatErrorMessage.includes('API Error')) {
            // AI provider configuration issue
            const modelMatch = chatErrorMessage.match(/model ['"]([^'"]+)['"]/);
            const modelName = modelMatch ? modelMatch[1] : null;
            
            responseText = `I'm having trouble connecting to the AI service right now.\n\n`;
            
            if (chatErrorMessage.includes('not found') || chatErrorMessage.includes('404')) {
              if (modelName) {
                responseText += `**The issue:** The AI model "${modelName}" isn't available.\n\n`;
                responseText += `**To fix:**\n`;
                responseText += `- Pull the model: \`ollama pull ${modelName}\`\n`;
                responseText += `- Or configure a different model in Settings (⚙ icon)\n`;
          } else {
                responseText += `**The issue:** The configured AI model isn't available.\n\n`;
                responseText += `**To fix:** Configure your AI provider in Settings (⚙ icon)\n`;
              }
            } else {
              responseText += `**Possible causes:**\n`;
              responseText += `- AI model isn't available\n`;
              responseText += `- API keys aren't configured\n`;
              responseText += `- Network connection issues\n\n`;
              responseText += `**To fix:** Go to Settings (⚙ icon) and configure your AI provider\n`;
            }
            
            responseText += `\n**Good news:** Security scans work independently of AI! `;
            responseText += `Try asking "scan my repository" - it should work even without AI configured.`;
          } else {
            // Generic error - provide helpful conversational response
            responseText = `I encountered an issue while processing your request. ` +
              `This might be due to AI provider configuration or network issues.\n\n` +
              `**What I can help with:**\n` +
              `- General questions and conversation (when AI is configured)\n` +
              `- Security scans: "scan my repository" (works without AI)\n` +
              `- Finding secrets: "find hardcoded secrets"\n` +
              `- Checking dependencies: "check dependencies"\n` +
              `- Smart contract analysis: "scan smart contracts"\n\n` +
              `**To enable full conversational support:**\n` +
              `Configure your AI provider in Settings (⚙ icon). ` +
              `Security features work independently and don't require AI configuration.`;
          }
        }
      }

      // Hide thinking indicator (if not already hidden)
      this.hideThinking();

      // Add agent response
      this.addMessage('assistant', responseText);

      } catch (error) {
        this.hideThinking();
        this.clearThinking();
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Always provide helpful message - never show raw errors
        console.log('Error caught in chat interface:', errorMessage);
        
        // Determine if this was a security request or regular conversation
        const wasSecurityRequest = securityRequestPatterns.some((pattern: RegExp) => pattern.test(message));
        
        // Check if it's an AI provider error - provide helpful guidance
        if (errorMessage.includes('All AI providers failed') || 
            errorMessage.includes('model') && (errorMessage.includes('not found') || errorMessage.includes('404')) ||
            errorMessage.includes('Ollama API Error') ||
            errorMessage.includes('API Error') ||
            errorMessage.includes('timeout')) {
          
          // Extract model name if available
          const modelMatch = errorMessage.match(/model ['"]([^'"]+)['"]/);
          const modelName = modelMatch ? modelMatch[1] : null;
          
          // AI provider issue - guide user to configure or use fallback
          let helpfulMessage = `I'm having trouble connecting to the AI service right now.\n\n`;
          
          if (errorMessage.includes('timeout')) {
            helpfulMessage += `**The issue:** The request timed out. This usually means:\n\n`;
            helpfulMessage += `- AI provider is slow or unresponsive\n`;
            helpfulMessage += `- Network connection issues\n`;
            helpfulMessage += `- Model is processing a complex request\n\n`;
            helpfulMessage += `**To fix:**\n`;
            helpfulMessage += `- Check your AI provider configuration in Settings (⚙ icon)\n`;
            helpfulMessage += `- Try again in a moment\n`;
            if (wasSecurityRequest) {
              helpfulMessage += `- Security scans work independently of AI - try "scan my repository"\n\n`;
            } else {
              helpfulMessage += `- Or try rephrasing your question\n\n`;
            }
          } else if (errorMessage.includes('not found') || errorMessage.includes('404')) {
            if (modelName) {
            helpfulMessage += `**The issue:** The AI model "${modelName}" isn't available.\n\n`;
            helpfulMessage += `**To fix this:**\n`;
            helpfulMessage += `- Pull the model: \`ollama pull ${modelName}\`\n`;
            helpfulMessage += `- Or configure a different model in Settings (⚙ icon)\n`;
            helpfulMessage += `- Or use a different AI provider\n\n`;
            } else {
              helpfulMessage += `**The issue:** The configured AI model isn't available.\n\n`;
              helpfulMessage += `**To fix:** Configure your AI provider in Settings (⚙ icon)\n\n`;
            }
          } else {
            helpfulMessage += `**Possible causes:**\n`;
            helpfulMessage += `- AI model isn't available\n`;
            helpfulMessage += `- API keys aren't configured\n`;
            helpfulMessage += `- Network connection issues\n\n`;
            helpfulMessage += `**To fix:** Go to Settings (⚙ icon) and configure your AI provider\n\n`;
          }
          
          if (wasSecurityRequest) {
          helpfulMessage += `**Good news:** Security scans don't require AI! They work independently. `;
          helpfulMessage += `Try asking "scan my repository" - it should work even without AI configured.`;
          } else {
            helpfulMessage += `**Note:** Security scans (like "scan my repository") work independently of AI and don't require configuration.`;
          }
          
          this.addMessage('assistant', helpfulMessage);
        } else {
          // Other errors - provide helpful message based on request type
          if (wasSecurityRequest) {
          this.addMessage('assistant', 
              `I encountered an issue while processing your security request.\n\n` +
            `**Try asking:**\n` +
            `- "scan my repository" (works without AI)\n` +
            `- "find hardcoded secrets"\n` +
            `- "check dependencies"\n\n` +
              `Or configure your AI provider in Settings (⚙ icon) for detailed AI-powered analysis.`
            );
          } else {
            this.addMessage('assistant', 
              `I encountered an issue while processing your request. ` +
              `This might be due to AI provider configuration or network issues.\n\n` +
              `**What I can help with:**\n` +
              `- General questions and conversation (when AI is configured)\n` +
              `- Security scans: "scan my repository" (works without AI)\n` +
              `- Finding secrets: "find hardcoded secrets"\n` +
              `- Checking dependencies: "check dependencies"\n` +
              `- Smart contract analysis: "scan smart contracts"\n\n` +
              `**To enable full conversational support:**\n` +
              `Configure your AI provider in Settings (⚙ icon). ` +
              `Security features work independently and don't require AI configuration.`
            );
          }
        }
      }
  }

  /**
   * Get simple no-workspace fallback message (no AI needed)
   */
  private getNoWorkspaceFallbackMessage(originalRequest: string): string {
    // Check if we've already asked about this (to vary responses)
    const previousMessages = this.messageHistory
      .filter(msg => msg.role === 'assistant')
      .slice(-3)
      .map(msg => msg.content.toLowerCase());
    
    const hasAskedBefore = previousMessages.some(msg => 
      msg.includes('open folder') || msg.includes('file → open') || msg.includes('cmd+o')
    );
    
    const fallbacks = hasAskedBefore ? [
      `Oh, I still need a folder open to help with that! Could you open your project folder using File → Open Folder? Once it's open, I'll get right on it.`,
      `Almost there! Just need you to open your folder first - File → Open Folder (or Cmd+O). Then I can help you with that right away.`,
      `Let me help with that once you open your folder! Just go to File → Open Folder and I'll automatically take care of it.`,
      `I'm ready to help! Just need your folder open first - File → Open Folder will do it. Then I'll handle the rest automatically.`
    ] : [
      `I'd love to help you ${originalRequest.toLowerCase()}! To get started, please open your project folder using File → Open Folder (or press Cmd+O / Ctrl+O). Once you open it, I'll automatically take care of it.`,
      `Ready to help! First, could you open your project folder? Just go to File → Open Folder (or Cmd+O), and I'll automatically ${originalRequest.toLowerCase()} once it's open.`,
      `I can help with that! To get started, please open your folder using File → Open Folder. Once it's open, I'll automatically ${originalRequest.toLowerCase()} for you.`
    ];
    
    // Pick a random one for variety
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  private addMessage(role: 'user' | 'assistant', content: string): void {
    const message = {
      role,
      content,
      timestamp: new Date()
    };
    
    this.messageHistory.push(message);
    
    // Ensure current session exists
    if (!this.currentSession) {
      this.createNewSession();
    }
    
    // Update current session and save immediately
    if (this.currentSession) {
      this.currentSession.messages.push(message);
      this.currentSession.updatedAt = new Date();
      // Auto-update session name if it's still default
      if (this.currentSession.messages.length === 1 && role === 'user') {
        this.currentSession.name = this.generateSessionName();
      }
      // Save chat history immediately after each message
      this.saveChatSessions();
    }

    // Hide thinking indicator when assistant responds
    if (role === 'assistant') {
      this.hideThinking();
      this.clearThinking();
    }

    if (this.panel) {
      this.panel.webview.postMessage({
        command: 'addMessage',
        role,
        content,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Show thinking process (like Cursor)
   */
  private showThinkingStep(step: string): void {
    this.thinkingSteps.push(step);
    if (this.panel) {
      this.panel.webview.postMessage({
        command: 'thinkingStep',
        step: step,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Clear thinking process
   */
  private clearThinking(): void {
    this.thinkingSteps = [];
    if (this.panel) {
      this.panel.webview.postMessage({
        command: 'clearThinking'
      });
    }
  }

  private showThinking(): void {
    if (this.panel) {
      this.panel.webview.postMessage({ command: 'showThinking' });
    }
  }

  private hideThinking(): void {
    if (this.panel) {
      this.panel.webview.postMessage({ command: 'hideThinking' });
    }
  }

  private setupMessageHandlers(): void {
    if (!this.panel) {
      console.error('ChatInterface: No panel available for message handlers');
      return;
    }

    console.log('ChatInterface: Setting up message handlers');
    this.panel.webview.onDidReceiveMessage(async (message) => {
      console.log('ChatInterface: Received message:', message);
      
      try {
        if (message.command === 'log') {
          // Handle logs from webview
          const level = message.level || 'info';
          const logMessage = message.message || '';
          const data = message.data || {};
          if (level === 'error') {
            console.error(`[Webview] ${logMessage}`, data);
          } else if (level === 'warn') {
            console.warn(`[Webview] ${logMessage}`, data);
          } else {
            console.log(`[Webview] ${logMessage}`, data);
          }
          return;
        } else if (message.command === 'sendMessage') {
          console.log('ChatInterface: Processing sendMessage with text:', message.text);
          await this.processUserMessage(message.text);
        } else if (message.command === 'clearChat') {
          this.messageHistory = [];
          this.agent.clearHistory();
          this.agenticCore.getState().conversation = [];
          this.cyberAgent.clearHistory();
          this.panel?.webview.postMessage({ command: 'clearMessages' });
          this.addMessage('assistant', 'Chat cleared. How can I help secure your code?');
        } else if (message.command === 'openSettings') {
          vscode.commands.executeCommand('ciphermate.advancedSettings');
        } else if (message.command === 'showResults') {
          vscode.commands.executeCommand('ciphermate.showResults');
        } else if (message.command === 'goHome') {
          // Save current session before going home
          if (this.currentSession && this.messageHistory.length > 0) {
            this.currentSession.messages = [...this.messageHistory];
            this.saveChatSessions();
          }
          // Switch to welcome mode
          this.panel?.webview.postMessage({ command: 'switchToWelcome' });
        } else if (message.command === 'restoreChat') {
          // Restore chat messages when user clicks "Continue Chat"
          // Ensure current session exists and sync messageHistory with session
          if (!this.currentSession && this.messageHistory.length > 0) {
            // Create session from existing messages
            this.createNewSession();
          }
          if (this.currentSession && this.messageHistory.length > 0) {
            // Sync session with current messageHistory
            this.currentSession.messages = [...this.messageHistory];
            this.currentSession.updatedAt = new Date();
            this.saveChatSessions();
          }
          this.restoreMessages();
        } else if (message.command === 'getMessageCount') {
          // Send message count to show/hide continue chat button
          this.panel?.webview.postMessage({
            command: 'messageCount',
            count: this.messageHistory.length
          });
        } else {
          console.warn('ChatInterface: Unknown command:', message.command);
        }
      } catch (error) {
        console.error('ChatInterface: Error handling message:', error);
        vscode.window.showErrorMessage(`Error processing message: ${error}`);
      }
    });
  }

  private getChatHtml(): string {
    // Load the cm 3.jpg logo (will be styled grey with no background)
    const logoJpgUri = this.panel?.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'images', 'cm 3.png')
    ) || '';
    const logoSvgUri = this.panel?.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'images', 'icon.svg')
    ) || '';
    const logoPngUri = this.panel?.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'images', 'icon.png')
    ) || '';
    const logoUri = logoJpgUri || logoSvgUri || logoPngUri;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CipherMate</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            border-radius: 0 !important;
            -webkit-border-radius: 0 !important;
            -moz-border-radius: 0 !important;
            -ms-border-radius: 0 !important;
            -o-border-radius: 0 !important;
        }
        
        *:before,
        *:after {
            border-radius: 0 !important;
            -webkit-border-radius: 0 !important;
            -moz-border-radius: 0 !important;
            -ms-border-radius: 0 !important;
            -o-border-radius: 0 !important;
        }
        
        /* Force no rounded corners on all form elements */
        input, textarea, button, select {
            border-radius: 0 !important;
            -webkit-border-radius: 0 !important;
            -moz-border-radius: 0 !important;
            -ms-border-radius: 0 !important;
            -o-border-radius: 0 !important;
        }
        
        /* Force no rounded corners on all divs and containers */
        div, section, article, aside, header, footer, nav {
            border-radius: 0 !important;
            -webkit-border-radius: 0 !important;
            -moz-border-radius: 0 !important;
        }

        body {
            font-family: var(--vscode-font-family);
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .welcome-screen {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            width: 100%;
            max-width: 720px;
            padding: 80px 40px;
        }

        .logo-container {
            margin-bottom: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .logo {
            width: 120px;
            height: 120px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            position: relative;
        }

        .logo img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            background: transparent !important;
            filter: grayscale(100%) brightness(0.7) contrast(1.2);
            opacity: 1;
            image-rendering: -webkit-optimize-contrast;
            image-rendering: crisp-edges;
        }
        
        .logo {
            background: transparent !important;
        }
        
        .logo-container {
            background: transparent !important;
        }
        
        /* Force transparent background on logo images */
        img[src*="cm 3"],
        img[src*="icon"] {
            background: transparent !important;
        }

        .welcome-title {
            font-size: 32px;
            font-weight: 600;
            margin-bottom: 20px;
            text-align: center;
            letter-spacing: -0.3px;
            color: var(--vscode-foreground);
            line-height: 1.2;
            font-family: var(--vscode-font-family);
        }

        .welcome-subtitle {
            font-size: 15px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 64px;
            text-align: center;
            line-height: 1.7;
            max-width: 600px;
            font-weight: 400;
            opacity: 0.9;
        }

        .chat-section {
            width: 100%;
            max-width: 640px;
            margin-bottom: 24px;
        }

        .chat-input-wrapper {
            position: relative;
            width: 100%;
            margin-bottom: 16px;
        }

        .chat-input-container {
            position: relative;
            width: 100%;
            background: var(--vscode-input-background);
            border: 1.5px solid var(--vscode-input-border);
            padding: 18px 20px;
            display: flex;
            align-items: center;
            gap: 12px;
            transition: all 0.2s ease;
            border-radius: 0 !important;
            -webkit-border-radius: 0 !important;
            -moz-border-radius: 0 !important;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        .chat-input-container:focus-within {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
        }

        .chat-input {
            flex: 1;
            background: transparent;
            border: none;
            color: var(--vscode-input-foreground);
            font-family: var(--vscode-font-family);
            font-size: 14px;
            outline: none;
            height: 22px;
            line-height: 1.5;
        }

        .chat-input::placeholder {
            color: var(--vscode-descriptionForeground);
        }

        .rotating-placeholder {
            position: absolute;
            left: 18px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.3s ease;
            white-space: nowrap;
        }

        .rotating-placeholder.active {
            opacity: 0.65;
        }

        .rotating-placeholder.fade-out {
            opacity: 0;
        }

        .rotating-placeholder.fade-in {
            opacity: 0.65;
        }

        .chat-input:focus + .rotating-placeholder,
        .chat-input:not(:placeholder-shown) + .rotating-placeholder {
            opacity: 0;
        }

        .send-button-main {
            padding: 12px 24px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-border);
            cursor: pointer;
            font-weight: 500;
            font-size: 15px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.2s ease;
            flex-shrink: 0;
            border-radius: 0 !important;
            -webkit-border-radius: 0 !important;
            -moz-border-radius: 0 !important;
            min-height: 36px;
        }
        
        .send-button-main span {
            font-weight: 500;
        }

        .send-button-main:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .send-button-main:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .use-own-model {
            width: 100%;
            padding: 14px 18px;
            background: var(--vscode-panel-background);
            border: 1px solid var(--vscode-panel-border);
            border-top: 2px solid var(--vscode-panel-border);
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            transition: background-color 0.2s ease, border-color 0.2s ease;
            border-radius: 0 !important;
            -webkit-border-radius: 0 !important;
            -moz-border-radius: 0 !important;
        }

        .use-own-model:hover {
            background: var(--vscode-list-hoverBackground);
            border-color: var(--vscode-focusBorder);
        }

        .use-own-model-content {
            display: flex;
            align-items: center;
            gap: 14px;
        }

        .use-own-model-icon {
            width: 18px;
            height: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--vscode-textLink-foreground);
            font-size: 16px;
        }

        .use-own-model-text {
            display: flex;
            flex-direction: column;
            gap: 3px;
        }

        .use-own-model-title {
            font-size: 13px;
            font-weight: 500;
            color: var(--vscode-foreground);
            letter-spacing: 0.1px;
        }

        .use-own-model-desc {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            line-height: 1.4;
        }

        .use-own-model-arrow {
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
            transition: color 0.2s ease;
        }

        .use-own-model:hover .use-own-model-arrow {
            color: var(--vscode-foreground);
        }

        .continue-chat {
            width: 100%;
            padding: 14px 18px;
            background: var(--vscode-panel-background);
            border: 1px solid var(--vscode-panel-border);
            border-top: 2px solid var(--vscode-textLink-foreground);
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            transition: background-color 0.2s ease, border-color 0.2s ease;
            border-radius: 0 !important;
            -webkit-border-radius: 0 !important;
            -moz-border-radius: 0 !important;
            margin-bottom: 12px;
        }

        .continue-chat:hover {
            background: var(--vscode-list-hoverBackground);
            border-color: var(--vscode-textLink-foreground);
        }

        .header {
            display: none;
            padding: 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            background: var(--vscode-panel-background);
            position: relative;
        }

        .header-content {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .back-button {
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            border: 1px solid var(--vscode-panel-border);
            color: var(--vscode-foreground);
            cursor: pointer;
            transition: all 0.2s ease;
            flex-shrink: 0;
            border-radius: 0 !important;
            -webkit-border-radius: 0 !important;
            -moz-border-radius: 0 !important;
            font-size: 18px;
        }

        .back-button:hover {
            background: var(--vscode-list-hoverBackground);
            border-color: var(--vscode-focusBorder);
        }

        .header-text {
            flex: 1;
        }

        .header h1 {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 4px;
        }

        .header p {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .messages {
            display: none;
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            flex-direction: column;
            gap: 16px;
            background: var(--vscode-editor-background);
            width: 100%;
            min-height: 200px;
            position: relative;
        }

        body.chat-mode .welcome-screen {
            display: none;
        }

        body.chat-mode .header {
            display: block;
        }

        body.chat-mode .messages {
            display: flex;
        }

        body.chat-mode {
            justify-content: flex-start;
            align-items: stretch;
            padding: 0;
            width: 100%;
            height: 100vh;
            overflow: hidden;
        }
        
        body.chat-mode .header {
            flex-shrink: 0;
        }
        
        body.chat-mode .messages {
            flex: 1 1 auto;
            min-height: 0;
            overflow-y: auto;
        }
        
        body.chat-mode .input-area {
            flex-shrink: 0;
        }
        
        body.chat-mode .header,
        body.chat-mode .messages,
        body.chat-mode .input-area {
            width: 100%;
        }

        .message {
            display: flex;
            gap: 12px;
            max-width: 85%;
        }

        .message.user {
            align-self: flex-end;
            flex-direction: row-reverse;
        }

        .message.assistant {
            align-self: flex-start;
        }

        .message-avatar {
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 500;
            font-size: 13px;
            flex-shrink: 0;
            border: 1px solid var(--vscode-panel-border);
        }

        .message.user .message-avatar {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .message.assistant .message-avatar {
            background: var(--vscode-inputValidation-infoBackground);
            color: var(--vscode-inputValidation-infoForeground);
        }

        .message-content {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-panel-border);
            padding: 12px 16px;
            line-height: 1.5;
            word-wrap: break-word;
        }

        .message.user .message-content {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .message.assistant .message-content {
            background: var(--vscode-input-background);
        }

        .thinking {
            display: none;
            padding: 16px 20px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-panel-border);
            border-left: 3px solid var(--vscode-textLink-foreground);
            margin: 8px 0;
            align-items: center;
            gap: 12px;
            font-family: 'Courier New', 'Monaco', 'Menlo', monospace;
            font-size: 13px;
            color: var(--vscode-foreground);
            opacity: 0;
            transition: opacity 0.2s ease;
        }

        .thinking.active {
            display: flex;
            opacity: 1;
        }

        .thinking-gear {
            width: 20px;
            height: 20px;
            flex-shrink: 0;
            animation: spin 1.5s linear infinite;
        }

        @keyframes spin {
            from {
                transform: rotate(0deg);
            }
            to {
                transform: rotate(360deg);
            }
        }

        .thinking-gear svg {
            width: 100%;
            height: 100%;
            /* Use theme-aware color that works in both light and dark */
            fill: var(--vscode-textLink-foreground);
            opacity: 0.85;
        }

        /* Better color for dark theme */
        .vscode-dark .thinking-gear svg,
        .vscode-high-contrast .thinking-gear svg {
            fill: var(--vscode-textLink-foreground);
            opacity: 0.9;
        }

        /* Better color for light theme */
        .vscode-light .thinking-gear svg {
            fill: #0066cc;
            opacity: 0.8;
        }

        .thinking-text {
            flex: 1;
            font-weight: 500;
            letter-spacing: 0.3px;
            color: var(--vscode-foreground);
        }

        .thinking-dots {
            display: inline-block;
            animation: pulse 1.5s ease-in-out infinite;
            color: var(--vscode-descriptionForeground);
        }

        @keyframes pulse {
            0%, 100% {
                opacity: 0.4;
            }
            50% {
                opacity: 1;
            }
        }

        /* Border color adjustments for themes */
        .vscode-light .thinking {
            border-left-color: #0066cc;
            background: #f3f3f3;
        }

        .vscode-dark .thinking {
            border-left-color: var(--vscode-textLink-foreground);
            background: var(--vscode-input-background);
        }

        .input-area {
            display: none;
            padding: 16px;
            border-top: 1px solid var(--vscode-panel-border);
            background: var(--vscode-panel-background);
        }

        body.chat-mode .input-area {
            display: block;
        }

        .input-container {
            display: flex;
            gap: 8px;
            align-items: flex-end;
        }

        .input-wrapper {
            flex: 1;
            position: relative;
        }

        #messageInput {
            width: 100%;
            padding: 10px 16px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            font-family: var(--vscode-font-family);
            font-size: 14px;
            height: 44px;
            border-radius: 0 !important;
            -webkit-border-radius: 0 !important;
            -moz-border-radius: 0 !important;
        }

        #messageInput:focus {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: -1px;
        }

        #sendButton {
            width: 40px;
            height: 40px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-border);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            border-radius: 0 !important;
            -webkit-border-radius: 0 !important;
            -moz-border-radius: 0 !important;
            font-size: 18px;
        }

        #sendButton:hover {
            background: var(--vscode-button-hoverBackground);
        }

        #sendButton:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .quick-actions {
            display: flex;
            gap: 8px;
            margin-top: 8px;
            flex-wrap: wrap;
        }

        .welcome-quick-actions {
            display: flex;
            gap: 8px;
            margin-top: 16px;
            margin-bottom: 16px;
            flex-wrap: wrap;
            width: 100%;
            justify-content: center;
        }

        .quick-action {
            padding: 10px 18px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1.5px solid var(--vscode-button-border);
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s ease;
            border-radius: 0 !important;
            -webkit-border-radius: 0 !important;
            -moz-border-radius: 0 !important;
            white-space: nowrap;
            letter-spacing: 0.1px;
        }

        .quick-action:hover {
            background: var(--vscode-button-secondaryHoverBackground);
            border-color: var(--vscode-focusBorder);
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .quick-action:active {
            transform: translateY(0);
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        textarea,
        button,
        input {
            border-radius: 0 !important;
            -webkit-border-radius: 0 !important;
            -moz-border-radius: 0 !important;
            -ms-border-radius: 0 !important;
            -o-border-radius: 0 !important;
        }
        
        code {
            background: var(--vscode-textCodeBlock-background);
            padding: 2px 4px;
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            border-radius: 0 !important;
            -webkit-border-radius: 0 !important;
            -moz-border-radius: 0 !important;
        }
    </style>
</head>
<body>
    <div class="welcome-screen">
        <div class="logo-container">
            <div class="logo">
                ${logoUri ? `<img src="${logoUri}" alt="CipherMate" style="background: transparent !important; border-radius: 0 !important;">` : '<div style="font-size: 48px; font-weight: bold; color: var(--vscode-descriptionForeground);">CM</div>'}
            </div>
        </div>
        
        <h1 class="welcome-title">Welcome to CipherMate</h1>
        <p class="welcome-subtitle">AI-powered security assistant for VS Code. Secure your code with intelligent vulnerability detection and AI-powered fixes.</p>
        
        <div class="chat-section">
            <div class="chat-input-wrapper">
                <form id="welcomeForm">
                <div class="chat-input-container">
                        <input 
                            type="text"
                        id="chatInput" 
                        class="chat-input"
                        placeholder=""
                            autocomplete="off"
                        />
                    <span class="rotating-placeholder active" id="rotatingPlaceholder">Ask anything...</span>
                        <button class="send-button-main" id="sendButtonMain" type="submit" aria-label="Send message">
                        <span>Send</span>
                    </button>
                </div>
                </form>
            </div>
            
            <div class="continue-chat" id="continueChat" style="display: none;">
                <div class="use-own-model-content">
                    <div class="use-own-model-icon">💬</div>
                    <div class="use-own-model-text">
                        <div class="use-own-model-title">Continue Chat</div>
                        <div class="use-own-model-desc">Resume your previous conversation</div>
                    </div>
                </div>
                <div class="use-own-model-arrow">→</div>
            </div>
            
            <div class="welcome-quick-actions">
                <div class="quick-action" data-action="scan my repository">Scan Repository</div>
                <div class="quick-action" data-action="find hardcoded secrets">Find Secrets</div>
                <div class="quick-action" data-action="scan smart contracts">Scan Contracts</div>
                <div class="quick-action" data-action="check dependencies">Check Dependencies</div>
                <div class="quick-action" data-action="show results">View Results</div>
            </div>
            
            <div class="use-own-model" id="useOwnModel" data-action="settings">
                <div class="use-own-model-content">
                    <div class="use-own-model-icon">⚙</div>
                    <div class="use-own-model-text">
                        <div class="use-own-model-title">Configure AI Provider</div>
                        <div class="use-own-model-desc">Set up OpenAI, Anthropic, OpenRouter, Ollama, or other models</div>
                    </div>
                </div>
                <div class="use-own-model-arrow">→</div>
            </div>
        </div>
    </div>

    <div class="header">
        <div class="header-content">
            <button class="back-button" id="backButton" type="button" aria-label="Go back to homepage" title="Go back to homepage">
                ←
            </button>
            <div class="header-text">
                <h1>CipherMate</h1>
                <p>AI-powered security assistant. Just tell me what you need.</p>
            </div>
        </div>
    </div>

    <div class="messages" id="messages">
        <div class="thinking" id="thinking">
            <div class="thinking-gear">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12A3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5a3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97c0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.4-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1c0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z"/>
                </svg>
            </div>
            <span class="thinking-text">Processing<span class="thinking-dots">...</span></span>
        </div>
    </div>

    <div class="input-area">
        <form id="chatForm">
        <div class="input-container">
            <div class="input-wrapper">
                    <input 
                        type="text"
                    id="messageInput" 
                    placeholder="Type your request... "
                        autocomplete="off"
                    />
            </div>
                <button id="sendButton" type="submit" aria-label="Send message">
                <span style="font-size: 18px;">→</span>
            </button>
        </div>
        </form>
        <div class="quick-actions">
            <div class="quick-action" data-action="scan my repository">Scan Repository</div>
            <div class="quick-action" data-action="find hardcoded secrets">Find Secrets</div>
            <div class="quick-action" data-action="scan smart contracts">Scan Contracts</div>
            <div class="quick-action" data-action="check dependencies">Check Dependencies</div>
            <div class="quick-action" data-action="show results">View Results</div>
        </div>
    </div>

    <script>
        // Acquire VS Code API once at the top level (can only be called once)
        let vscode = null;
        try {
            if (typeof acquireVsCodeApi !== 'undefined') {
                vscode = acquireVsCodeApi();
                console.log('=== VS Code API acquired successfully ===');
            } else {
                console.error('=== ERROR: acquireVsCodeApi is not available ===');
            }
        } catch (e) {
            console.error('=== ERROR: Failed to acquire VS Code API:', e, '===');
        }
        
        // Helper function to send errors to extension host
        function logToExtensionHost(level, message, data) {
            try {
                if (vscode && typeof vscode.postMessage === 'function') {
                    vscode.postMessage({
                        command: 'log',
                        level: level,
                        message: message,
                        data: data
                    });
                } else {
                    // Fallback to console if vscode API not available
                    if (level === 'error') {
                        console.error(message, data);
                    } else if (level === 'warn') {
                        console.warn(message, data);
                    } else {
                        console.log(message, data);
                    }
                }
            } catch (e) {
                // Fallback to console if postMessage fails
                if (level === 'error') {
                    console.error(message, data);
                } else if (level === 'warn') {
                    console.warn(message, data);
                } else {
                    console.log(message, data);
                }
            }
        }
        
        console.log('=== CipherMate Webview Script Loading ===');
        console.log('=== Script execution started at:', new Date().toISOString(), '===');
        logToExtensionHost('info', 'Webview script loading', { timestamp: new Date().toISOString() });
        
        // Wait for DOM to be ready
        function initChatInterface() {
            console.log('=== INITIALIZING CHAT INTERFACE ===');
            console.log('=== Document ready state:', document.readyState, '===');
            console.log('=== Script is RUNNING ===');
            console.log('=== Body exists:', !!document.body, '===');
            logToExtensionHost('info', 'Initializing Chat Interface', { 
                readyState: document.readyState,
                bodyExists: !!document.body
            });
            
            // Verify vscode API is available
            if (!vscode || typeof vscode.postMessage !== 'function') {
                const errorMsg = 'VS Code API is not available!';
                console.error('=== ERROR:', errorMsg, '===');
                alert(errorMsg);
                logToExtensionHost('error', errorMsg, {});
                return;
            }
            console.log('=== vscode API acquired:', !!vscode, '===');
            console.log('=== vscode.postMessage available:', typeof vscode.postMessage === 'function', '===');
            
            if (!vscode || typeof vscode.postMessage !== 'function') {
                console.error('=== ERROR: vscode.postMessage is not available! ===');
                alert('VS Code postMessage API is not available!');
                return;
            }
            
            // Get all elements with detailed logging
            const messagesContainer = document.getElementById('messages');
            const messageInput = document.getElementById('messageInput');
            const sendButton = document.getElementById('sendButton');
            const thinking = document.getElementById('thinking');
            const quickActions = document.querySelectorAll('.quick-action');
            const welcomeQuickActions = document.querySelectorAll('.welcome-quick-actions .quick-action');
            const chatInput = document.getElementById('chatInput');
            const sendButtonMain = document.getElementById('sendButtonMain');
            const rotatingPlaceholder = document.getElementById('rotatingPlaceholder');
            const useOwnModel = document.getElementById('useOwnModel');
            const continueChatBtn = document.getElementById('continueChat');
            const backButton = document.getElementById('backButton');
            const body = document.body;
            
            console.log('=== Elements found ===');
            console.log('messagesContainer:', !!messagesContainer, messagesContainer);
            console.log('messageInput:', !!messageInput, messageInput);
            console.log('sendButton:', !!sendButton, sendButton);
            console.log('quickActions (chat mode):', quickActions.length, Array.from(quickActions));
            console.log('welcomeQuickActions (welcome screen):', welcomeQuickActions.length, Array.from(welcomeQuickActions));
            console.log('chatInput found:', !!chatInput, chatInput);
            if (chatInput) {
                console.log('chatInput tagName:', chatInput.tagName);
                console.log('chatInput type:', chatInput.type);
            }
            console.log('sendButtonMain:', !!sendButtonMain, sendButtonMain);
            console.log('rotatingPlaceholder:', !!rotatingPlaceholder, rotatingPlaceholder);
            console.log('useOwnModel:', !!useOwnModel, useOwnModel);
            console.log('body:', !!body, body);
            
            if (!body) {
                console.error('=== ERROR: Body element not found! ===');
                return;
            }

            // Rotating placeholder suggestions
            const suggestions = [
            'Ask anything...',
            'Scan my code for vulnerabilities',
            'Find security issues in this file',
            'Explain this security concern',
            'How do I fix this vulnerability?',
            'Review my authentication code',
            'Check for SQL injection risks',
            'Analyze my API security'
        ];

            let currentSuggestionIndex = 0;
            let placeholderInterval;

            function startRotatingPlaceholder() {
            if (chatInput && rotatingPlaceholder) {
                // Set initial suggestion
                rotatingPlaceholder.textContent = suggestions[0];
                currentSuggestionIndex = 1;
                
                placeholderInterval = setInterval(function() {
                    if (chatInput.value.trim() === '' && document.activeElement !== chatInput) {
                        // Fade out
                        rotatingPlaceholder.classList.add('fade-out');
                        rotatingPlaceholder.classList.remove('fade-in');
                        
                        setTimeout(function() {
                            rotatingPlaceholder.textContent = suggestions[currentSuggestionIndex];
                            currentSuggestionIndex = (currentSuggestionIndex + 1) % suggestions.length;
                            
                            // Fade in
                            rotatingPlaceholder.classList.remove('fade-out');
                            rotatingPlaceholder.classList.add('fade-in');
                        }, 200);
                    }
                }, 3500);
            }
        }

            function stopRotatingPlaceholder() {
                if (placeholderInterval) {
                    clearInterval(placeholderInterval);
                }
            }

            function switchToWelcomeMode() {
            console.log('Switching to welcome mode...');
            
            // Get all elements fresh
            const body = document.body;
            const welcomeScreen = document.querySelector('.welcome-screen');
            const header = document.querySelector('.header');
            const messagesContainer = document.getElementById('messages');
            const inputArea = document.querySelector('.input-area');
            const chatInput = document.getElementById('chatInput');
            
            // Remove chat-mode class
            body.classList.remove('chat-mode');
            
            // Explicitly show welcome screen
            if (welcomeScreen) {
                welcomeScreen.style.display = 'flex';
                console.log('Welcome screen shown');
            } else {
                console.error(' Welcome screen not found!');
            }
            
            // Explicitly hide header
            if (header) {
                header.style.display = 'none';
                console.log('Header hidden');
            }
            
            // Explicitly hide messages container
            if (messagesContainer) {
                messagesContainer.style.display = 'none';
                // Clear all messages except thinking element
                const thinkingEl = document.getElementById('thinking');
                while (messagesContainer.firstChild) {
                    messagesContainer.removeChild(messagesContainer.firstChild);
                }
                // Re-add thinking element if it exists
                if (thinkingEl) {
                    messagesContainer.appendChild(thinkingEl);
                }
                console.log('Messages container hidden');
            }
            
            // Explicitly hide input area
            if (inputArea) {
                inputArea.style.display = 'none';
                console.log(' Input area hidden');
            }
            
            // Reset body styles for welcome mode
            body.style.justifyContent = 'center';
            body.style.alignItems = 'center';
            body.style.padding = '20px';
            body.style.width = '100%';
            body.style.height = '100vh';
            body.style.overflow = 'auto';
            body.style.display = 'flex';
            body.style.flexDirection = 'column';
            body.style.background = 'var(--vscode-editor-background)';
            
            // Focus welcome input
            if (chatInput) {
                chatInput.value = '';
                chatInput.focus();
                startRotatingPlaceholder();
                console.log(' Chat input focused');
            }
            
            // Show continue chat button if there's history
            updateContinueChatButton();
            
            // Reattach event listeners for welcome screen buttons
            setupWelcomeScreenButtons();
            
            console.log(' Welcome mode activated');
        }
        
        function setupWelcomeScreenButtons() {
            console.log(' Setting up welcome screen buttons...');
            
            // Get fresh references to all welcome screen elements
            const welcomeQuickActions = document.querySelectorAll('.welcome-quick-actions .quick-action');
            const useOwnModel = document.getElementById('useOwnModel');
            const continueChatBtn = document.getElementById('continueChat');
            const chatInput = document.getElementById('chatInput');
            const sendButtonMain = document.getElementById('sendButtonMain');
            const welcomeForm = document.getElementById('welcomeForm');
            
            // Set up welcome quick action buttons
            if (welcomeQuickActions && welcomeQuickActions.length > 0) {
                console.log('=== RE-SETUP: Found', welcomeQuickActions.length, 'welcome quick action buttons ===');
                welcomeQuickActions.forEach(function(action, index) {
                    const actionText = action.getAttribute('data-action');
                    console.log('=== RE-SETUP: Welcome quick action', index, ':', actionText, '===');
                    action.style.cursor = 'pointer';
                    
                    // Remove old listeners by cloning (this removes all event listeners)
                    const newAction = action.cloneNode(true);
                    action.parentNode.replaceChild(newAction, action);
                    
                    // Reattach click listener
                    newAction.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('=== WELCOME QUICK ACTION CLICKED ===', actionText);
                        handleQuickActionClick(newAction, actionText);
                    });
                });
            } else {
                console.warn('=== WARNING: No welcome quick action buttons found ===');
            }
            
            // Set up "Configure AI Provider" button
            if (useOwnModel) {
                // Clone to remove old listeners
                const newUseOwnModel = useOwnModel.cloneNode(true);
                useOwnModel.parentNode.replaceChild(newUseOwnModel, useOwnModel);
                
                newUseOwnModel.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('=== Configure AI Provider clicked ===');
                    if (vscode && typeof vscode.postMessage === 'function') {
                        vscode.postMessage({
                            command: 'openSettings'
                        });
                    } else {
                        console.error('vscode.postMessage not available');
                    }
                });
                console.log(' Configure AI Provider button set up');
            }
            
            // Set up "Continue Chat" button
            if (continueChatBtn) {
                // Clone to remove old listeners but preserve ID
                const newContinueChatBtn = continueChatBtn.cloneNode(true);
                newContinueChatBtn.id = 'continueChat'; // Ensure ID is preserved
                continueChatBtn.parentNode.replaceChild(newContinueChatBtn, continueChatBtn);
                
                // Get fresh reference after replacement
                const continueChatBtnRef = document.getElementById('continueChat');
                if (continueChatBtnRef) {
                    continueChatBtnRef.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('=== Continue Chat clicked ===');
                        switchToChatMode();
                    });
                    console.log(' Continue Chat button set up');
                } else {
                    console.error(' Continue Chat button not found after replacement');
                }
            } else {
                console.warn(' Continue Chat button not found');
            }
            
            // Set up welcome form submission - use event delegation to avoid cloning issues
            // Don't clone form/input/button as it breaks DOM structure
            if (welcomeForm && chatInput && sendButtonMain) {
                // Use one-time flag to prevent duplicate handlers
                if (!welcomeForm.hasAttribute('data-handlers-attached')) {
                    welcomeForm.setAttribute('data-handlers-attached', 'true');
                    
                    welcomeForm.addEventListener('submit', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        const input = document.getElementById('chatInput');
                        if (input && input.value.trim() && !isSubmittingWelcome) {
                            sendWelcomeMessage();
                        }
                        return false;
                    });
                    
                    chatInput.addEventListener('keydown', function(e) {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            e.stopPropagation();
                            const input = document.getElementById('chatInput');
                            if (input && input.value.trim() && !isSubmittingWelcome) {
                                sendWelcomeMessage();
                            }
                            return false;
                        }
                    });
                    
                    sendButtonMain.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        const input = document.getElementById('chatInput');
                        if (input && input.value.trim() && !isSubmittingWelcome) {
                            sendWelcomeMessage();
                        }
                        return false;
                    });
                    
                    console.log(' Welcome form handlers attached');
                } else {
                    console.log(' Welcome form handlers already attached, skipping');
                }
            }
        }

        function switchToChatMode(text) {
            if (!text) text = undefined;
            body.classList.add('chat-mode');
            if (messageInput) {
                if (text) {
                    messageInput.value = text;
                }
                messageInput.focus();
                if (text) {
                    // Small delay to ensure input is ready
                    setTimeout(function() {
                        sendMessage();
                    }, 50);
                }
            }
            // Request messages from extension to restore chat
            if (vscode && typeof vscode.postMessage === 'function') {
                vscode.postMessage({
                    command: 'restoreChat'
                });
            }
        }
        
            function updateContinueChatButton() {
            // Request message count from extension
            if (vscode && typeof vscode.postMessage === 'function') {
                vscode.postMessage({
                    command: 'getMessageCount'
                });
            }
        }

            // Prevent duplicate submissions
            let isSubmittingWelcome = false;

            function sendWelcomeMessage() {
            console.log('sendWelcomeMessage CALLED');
            
            // Prevent duplicate submissions
            if (isSubmittingWelcome) {
                console.log(' Already submitting, ignoring duplicate call');
                return;
            }
            isSubmittingWelcome = true;
            
            const chatInputEl = document.getElementById('chatInput');
            if (!chatInputEl) {
                console.error('sendWelcomeMessage: chatInput not found');
                isSubmittingWelcome = false;
                return;
            }
            
            const text = chatInputEl.value.trim();
            console.log('sendWelcomeMessage: Input value:', text);
            if (!text) {
                console.log('sendWelcomeMessage: Empty message, not sending');
                isSubmittingWelcome = false;
                return;
            }

            console.log('sendWelcomeMessage: Processing message:', text);
            
            // Store text before clearing
            const messageText = text;

            stopRotatingPlaceholder();
            
            // Clear the welcome input immediately to prevent double submission
            chatInputEl.value = '';
            
            // Get elements fresh (don't rely on closure variables)
            const body = document.body;
            const messagesContainer = document.getElementById('messages');
            const header = document.querySelector('.header');
            const inputArea = document.querySelector('.input-area');
            const welcomeScreen = document.querySelector('.welcome-screen');
            
            // Switch to chat mode immediately - use direct style manipulation for reliability
            console.log('Switching to chat mode...');
            console.log('Body:', !!body, body);
            console.log('Messages container:', !!messagesContainer, messagesContainer);
            console.log('Header:', !!header, header);
            console.log('Input area:', !!inputArea, inputArea);
            console.log('Welcome screen:', !!welcomeScreen, welcomeScreen);
            
            // STEP 1: Validate all elements exist
            if (!messagesContainer) {
                console.error('Messages container not found! Cannot proceed.');
                alert('Error: Messages container not found. Please reload the extension.');
                isSubmittingWelcome = false;
                return;
            }
            
            // STEP 2: Set up body layout FIRST (critical for flex layout to work)
            body.classList.add('chat-mode');
            body.style.setProperty('display', 'flex', 'important');
            body.style.setProperty('flex-direction', 'column', 'important');
            body.style.setProperty('height', '100vh', 'important');
            body.style.setProperty('width', '100%', 'important');
            body.style.setProperty('overflow', 'hidden', 'important');
            body.style.setProperty('padding', '0', 'important');
            body.style.setProperty('margin', '0', 'important');
            body.style.setProperty('justify-content', 'flex-start', 'important');
            body.style.setProperty('align-items', 'stretch', 'important');
            body.style.setProperty('background-color', 'var(--vscode-editor-background)', 'important');
            body.style.setProperty('visibility', 'visible', 'important');
            body.style.setProperty('opacity', '1', 'important');
            
            // STEP 3: Hide welcome screen with !important to ensure it's hidden
            if (welcomeScreen) {
                welcomeScreen.style.setProperty('display', 'none', 'important');
                welcomeScreen.style.setProperty('visibility', 'hidden', 'important');
                welcomeScreen.style.setProperty('opacity', '0', 'important');
                welcomeScreen.style.setProperty('z-index', '-1', 'important');
                console.log(' Welcome screen hidden');
            }
            
            // STEP 4: Show header
            if (header) {
                header.style.setProperty('display', 'block', 'important');
                header.style.setProperty('width', '100%', 'important');
                header.style.setProperty('flex-shrink', '0', 'important');
                header.style.setProperty('visibility', 'visible', 'important');
                console.log(' Header shown');
            }
            
            // STEP 5: Show messages container with all necessary styles
            messagesContainer.style.setProperty('display', 'flex', 'important');
            messagesContainer.style.setProperty('flex-direction', 'column', 'important');
            messagesContainer.style.setProperty('flex', '1 1 auto', 'important');
            messagesContainer.style.setProperty('overflow-y', 'auto', 'important');
            messagesContainer.style.setProperty('padding', '16px', 'important');
            messagesContainer.style.setProperty('width', '100%', 'important');
            messagesContainer.style.setProperty('min-height', '200px', 'important');
            messagesContainer.style.setProperty('background-color', 'var(--vscode-editor-background)', 'important');
            messagesContainer.style.setProperty('color', 'var(--vscode-editor-foreground)', 'important');
            messagesContainer.style.setProperty('position', 'relative', 'important');
            messagesContainer.style.setProperty('visibility', 'visible', 'important');
            messagesContainer.style.setProperty('opacity', '1', 'important');
            messagesContainer.style.setProperty('z-index', '1', 'important');
            console.log(' Messages container shown');
            
            // Add a temporary visible element to ensure container is rendering
            if (!document.getElementById('test-visibility')) {
                const testDiv = document.createElement('div');
                testDiv.id = 'test-visibility';
                testDiv.style.padding = '8px';
                testDiv.style.color = 'var(--vscode-editor-foreground)';
                testDiv.style.fontSize = '12px';
                testDiv.textContent = 'Chat loading...';
                messagesContainer.appendChild(testDiv);
                setTimeout(function() {
                    const testEl = document.getElementById('test-visibility');
                    if (testEl && testEl.parentNode) {
                        testEl.parentNode.removeChild(testEl);
                    }
                }, 2000);
            }
            
            // STEP 6: Ensure thinking element exists (it's already in HTML, just verify)
            let thinkingEl = document.getElementById('thinking');
            if (!thinkingEl) {
                // Create thinking element using DOM methods instead of innerHTML
                thinkingEl = document.createElement('div');
                thinkingEl.className = 'thinking';
                thinkingEl.id = 'thinking';
                thinkingEl.style.display = 'none';
                
                const gearDiv = document.createElement('div');
                gearDiv.className = 'thinking-gear';
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('viewBox', '0 0 24 24');
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', 'M12 15.5A3.5 3.5 0 0 1 8.5 12A3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5a3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97c0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.4-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1c0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z');
                svg.appendChild(path);
                gearDiv.appendChild(svg);
                
                const textSpan = document.createElement('span');
                textSpan.className = 'thinking-text';
                textSpan.innerHTML = 'Processing<span class="thinking-dots">...</span>';
                
                thinkingEl.appendChild(gearDiv);
                thinkingEl.appendChild(textSpan);
                messagesContainer.appendChild(thinkingEl);
            }
            
            // STEP 7: Show input area
            if (inputArea) {
                inputArea.style.setProperty('display', 'block', 'important');
                inputArea.style.setProperty('width', '100%', 'important');
                inputArea.style.setProperty('flex-shrink', '0', 'important');
                inputArea.style.setProperty('visibility', 'visible', 'important');
                console.log(' Input area shown');
            }
            
            // STEP 8: Force reflow to ensure all styles are applied
            void body.offsetHeight;
            void messagesContainer.offsetHeight;
            
            // STEP 9: Verify everything is visible after styles are applied
            setTimeout(function() {
                const finalMessagesStyle = window.getComputedStyle(messagesContainer);
                console.log(' === FINAL VERIFICATION ===');
                console.log('Messages container display:', finalMessagesStyle.display);
                console.log('Messages container visibility:', finalMessagesStyle.visibility);
                console.log('Messages container height:', messagesContainer.offsetHeight);
                console.log('Messages container width:', messagesContainer.offsetWidth);
                console.log('Messages container background:', finalMessagesStyle.backgroundColor);
                console.log('Body has chat-mode class:', body.classList.contains('chat-mode'));
                console.log('Body display:', window.getComputedStyle(body).display);
                console.log('Body height:', body.offsetHeight);
                
                // If still not visible, try one more aggressive approach
                if (finalMessagesStyle.display === 'none' || messagesContainer.offsetHeight === 0) {
                    console.error('Messages container still not visible! Trying emergency fix...');
                    messagesContainer.style.setProperty('display', 'flex', 'important');
                    messagesContainer.style.setProperty('flex-direction', 'column', 'important');
                    messagesContainer.style.setProperty('flex', '1 1 auto', 'important');
                    messagesContainer.style.setProperty('overflow-y', 'auto', 'important');
                    messagesContainer.style.setProperty('padding', '16px', 'important');
                    messagesContainer.style.setProperty('width', '100%', 'important');
                    messagesContainer.style.setProperty('min-height', '200px', 'important');
                    messagesContainer.style.setProperty('background-color', 'var(--vscode-editor-background)', 'important');
                    messagesContainer.style.setProperty('color', 'var(--vscode-editor-foreground)', 'important');
                    messagesContainer.style.setProperty('visibility', 'visible', 'important');
                    messagesContainer.style.setProperty('opacity', '1', 'important');
                    messagesContainer.style.setProperty('position', 'relative', 'important');
                    messagesContainer.style.setProperty('z-index', '1', 'important');
                }
            }, 100);
            
            console.log(' Chat mode fully activated');
            
            // Send message via vscode.postMessage
            console.log('sendWelcomeMessage: Sending message to extension:', messageText);
            try {
                if (!vscode || typeof vscode.postMessage !== 'function') {
                    console.error('sendWelcomeMessage: vscode.postMessage not available');
                    return;
                }
                vscode.postMessage({
                    command: 'sendMessage',
                    text: messageText
                });
                console.log('sendWelcomeMessage: Message sent successfully');
            } catch (error) {
                console.error('sendWelcomeMessage: Error sending message:', error);
            } finally {
                // Reset flag after a short delay to allow processing
                setTimeout(function() {
                    isSubmittingWelcome = false;
                }, 1000);
            }
            
            // Focus chat input after switching
            setTimeout(function() {
                const messageInputEl = document.getElementById('messageInput');
                if (messageInputEl) {
                    messageInputEl.focus();
                }
            }, 100);
        }

            function addMessage(role, content, timestamp) {
            console.log('addMessage called:', role, content ? content.substring(0, 50) : '');
            const container = document.getElementById('messages');
            if (!container) {
                console.error(' addMessage: messages container not found!');
                return;
            }
            
            try {
            const messageDiv = document.createElement('div');
                messageDiv.className = 'message ' + role;
                messageDiv.style.cssText = 'display: flex; gap: 12px; max-width: 85%; margin: 8px 0;';
            
            const avatar = document.createElement('div');
            avatar.className = 'message-avatar';
            avatar.textContent = role === 'user' ? 'You' : 'CM';
                avatar.style.cssText = 'width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-weight: 500; font-size: 13px; flex-shrink: 0; border: 1px solid var(--vscode-panel-border); background: var(--vscode-button-background); color: var(--vscode-button-foreground);';
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.textContent = content;
                contentDiv.style.cssText = 'background: var(--vscode-input-background); border: 1px solid var(--vscode-panel-border); padding: 12px 16px; line-height: 1.5; word-wrap: break-word; color: var(--vscode-editor-foreground);';
                
                if (role === 'user') {
                    contentDiv.style.cssText += 'background: var(--vscode-button-background); color: var(--vscode-button-foreground);';
                }
            
            messageDiv.appendChild(avatar);
            messageDiv.appendChild(contentDiv);
            
                // Insert before thinking element if it exists, otherwise append
                const thinkingEl = document.getElementById('thinking');
                if (thinkingEl && thinkingEl.parentNode === container) {
                    container.insertBefore(messageDiv, thinkingEl);
                } else {
                    container.appendChild(messageDiv);
                }
                
                container.scrollTop = container.scrollHeight;
                console.log(' Message added successfully. Container children:', container.children.length);
            } catch (error) {
                console.error(' Error in addMessage:', error);
                // Fallback: add simple text
                const fallback = document.createElement('div');
                fallback.textContent = '[' + role + ']: ' + (content || '');
                fallback.style.cssText = 'padding: 10px; margin: 5px; background: yellow; color: black;';
                container.appendChild(fallback);
            }
        }

            // Prevent duplicate submissions
            let isSubmittingChat = false;

            function sendMessage() {
            console.log(' sendMessage CALLED ');
            
            // Prevent duplicate submissions
            if (isSubmittingChat) {
                console.log(' Already submitting, ignoring duplicate call');
                return;
            }
            isSubmittingChat = true;
            
            const messageInputEl = document.getElementById('messageInput');
            if (!messageInputEl) {
                console.error('sendMessage: messageInput not found');
                isSubmittingChat = false;
                return;
            }
            
            const text = messageInputEl.value.trim();
            console.log('sendMessage: Input value:', text);
            if (!text) {
                console.log('sendMessage: Empty message, not sending');
                isSubmittingChat = false;
                return;
            }

            console.log('sendMessage: Processing message:', text);

            // Store text before clearing
            const messageText = text;

            // Clear input immediately to prevent double submission
            messageInputEl.value = '';
            
            // Don't add message here - let the extension handle it to avoid duplicates
            
            // Send to extension
            console.log('sendMessage: Sending message to extension:', messageText);
            try {
                if (!vscode || typeof vscode.postMessage !== 'function') {
                    console.error('sendMessage: vscode.postMessage not available');
                    return;
                }
                vscode.postMessage({
                    command: 'sendMessage',
                    text: messageText
                });
                console.log('sendMessage: Message sent successfully');
            } catch (error) {
                console.error('sendMessage: Error sending message:', error);
            } finally {
                // Reset flag after a short delay to allow processing
                setTimeout(function() {
                    isSubmittingChat = false;
                }, 1000);
            }
        }

            // Welcome screen chat input handlers
            if (chatInput) {
            chatInput.addEventListener('focus', function() {
                stopRotatingPlaceholder();
                if (rotatingPlaceholder) {
                    rotatingPlaceholder.classList.remove('active');
                }
            });

            chatInput.addEventListener('blur', function() {
                if (chatInput.value.trim() === '') {
                    startRotatingPlaceholder();
                    if (rotatingPlaceholder) {
                        rotatingPlaceholder.classList.add('active');
                    }
                }
            });

            // Make sendWelcomeMessage available globally
            window.sendWelcomeMessage = sendWelcomeMessage;
            
            // Initial form setup - will be replaced by setupWelcomeScreenButtons() when switching back
            // So we only set up handlers if setupWelcomeScreenButtons hasn't run yet
            const welcomeForm = document.getElementById('welcomeForm');
            const sendButtonMain = document.getElementById('sendButtonMain');
            
            // Only set up if elements exist and haven't been cloned yet
            if (welcomeForm && !welcomeForm.hasAttribute('data-setup-complete')) {
                welcomeForm.setAttribute('data-setup-complete', 'true');
                welcomeForm.addEventListener('submit', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                    console.log(' Form submitted - welcomeForm (initial)');
                        sendWelcomeMessage();
                    return false;
                });
            }
            
            if (chatInput && !chatInput.hasAttribute('data-setup-complete')) {
                chatInput.setAttribute('data-setup-complete', 'true');
                chatInput.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        console.log(' Enter pressed in chatInput (initial)');
                        sendWelcomeMessage();
                        return false;
                    }
                });
            }
            
            if (sendButtonMain && !sendButtonMain.hasAttribute('data-setup-complete')) {
                sendButtonMain.setAttribute('data-setup-complete', 'true');
                sendButtonMain.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log(' Send button clicked (initial)');
                    sendWelcomeMessage();
                    return false;
                });
            }
        }

            // Continue chat button - initial setup (will be re-setup in setupWelcomeScreenButtons when needed)
            if (continueChatBtn) {
                console.log('=== Setting up continueChat button (initial) ===');
                continueChatBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('=== continueChat clicked (initial handler) ===');
                    switchToChatMode();
                });
            } else {
                console.warn('=== WARNING: continueChat button not found (initial setup) ===');
            }

            // Use own model button (Configure AI Provider)
            if (useOwnModel) {
                console.log('=== Setting up useOwnModel button ===');
                useOwnModel.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log(' useOwnModel clicked - Opening settings');
                    try {
                        if (!vscode || typeof vscode.postMessage !== 'function') {
                            console.error('vscode.postMessage not available');
                            alert('Cannot open settings - VS Code API not available');
                            return;
                        }
                        vscode.postMessage({
                            command: 'openSettings'
                        });
                        console.log(' Settings command sent successfully');
                    } catch (error) {
                        console.error(' Error sending settings command:', error);
                        alert('Failed to open settings: ' + error);
                    }
                });
                console.log(' useOwnModel button handler attached');
            } else {
                console.error('=== ERROR: useOwnModel button not found! ===');
            }

            // Chat mode message input handlers
            if (sendButton) {
                console.log('=== Setting up sendButton ===');
                // Form handles submission, but add click handler as backup
                sendButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('=== sendButton clicked ===');
                    sendMessage();
                    return false;
                });
            } else {
                console.warn('=== WARNING: sendButton not found ===');
            }
            
            if (messageInput) {
                // Make sendMessage available globally for form onsubmit
                window.sendMessage = sendMessage;
                
                // Set up form submission handler - handles both Enter key and button click
                const chatForm = document.getElementById('chatForm');
                if (chatForm) {
                    chatForm.addEventListener('submit', function(e) {
                            e.preventDefault();
                            e.stopPropagation();
                        console.log(' Form submitted - chatForm');
                            sendMessage();
                        return false;
                    });
                }
                
                // Handle Enter key press - same function as Send button
                messageInput.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' || e.keyCode === 13) {
                    e.preventDefault();
                    e.stopPropagation();
                        e.stopImmediatePropagation();
                        console.log(' Enter pressed in messageInput - submitting (same as Send button)');
                        sendMessage();
                        return false;
                    }
                });
                
                // Also handle keypress as additional backup
                messageInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter' || e.keyCode === 13) {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log(' Enter keypress in messageInput - submitting');
                        sendMessage();
                        return false;
                    }
                });
                
                // Ensure Send button also calls the same function
                const sendButton = document.getElementById('sendButton');
                if (sendButton) {
                    sendButton.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                        console.log(' Send button clicked - chatForm');
                        sendMessage();
                        return false;
                    });
                }
            }

            // Helper function to handle quick action clicks
            function handleQuickActionClick(action, actionText) {
                console.log('=== QUICK ACTION CLICKED ===', actionText);
                
                // Special handling for "show results" - execute command directly
                if (actionText.toLowerCase().includes('show results') || actionText.toLowerCase().includes('view results')) {
                    console.log(' Executing showResults command');
                    try {
                        if (!vscode || typeof vscode.postMessage !== 'function') {
                            console.error('vscode.postMessage not available');
                        return;
                        }
                        vscode.postMessage({
                            command: 'showResults'
                        });
                        console.log(' showResults command sent');
                        return; // Don't send as chat message
                    } catch (error) {
                        console.error('Error executing showResults:', error);
                    }
                }
                
                        // Switch to chat mode if not already
                        if (!body.classList.contains('chat-mode')) {
                    console.log('Switching to chat mode from welcome screen');
                            body.classList.add('chat-mode');
                        }
                        
                        // Add message to UI immediately for feedback
                        if (messagesContainer) {
                    // Ensure thinking element exists
                    let thinkingEl = document.getElementById('thinking');
                    if (!thinkingEl) {
                        thinkingEl = document.createElement('div');
                        thinkingEl.className = 'thinking';
                        thinkingEl.id = 'thinking';
                        thinkingEl.innerHTML = '<div class="thinking-gear"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 15.5A3.5 3.5 0 0 1 8.5 12A3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5a3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97c0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.4-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1c0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z"/></svg></div><span class="thinking-text">Processing<span class="thinking-dots">...</span></span>';
                        messagesContainer.appendChild(thinkingEl);
                    }
                    
                            const messageDiv = document.createElement('div');
                            messageDiv.className = 'message user';
                            const avatar = document.createElement('div');
                            avatar.className = 'message-avatar';
                            avatar.textContent = 'You';
                            const contentDiv = document.createElement('div');
                            contentDiv.className = 'message-content';
                            contentDiv.textContent = actionText;
                            messageDiv.appendChild(avatar);
                            messageDiv.appendChild(contentDiv);
                    messagesContainer.insertBefore(messageDiv, thinkingEl);
                            messagesContainer.scrollTop = messagesContainer.scrollHeight;
                        }
                        
                // Send message to extension
                        console.log('Sending message to extension:', actionText);
                        try {
                    if (!vscode || typeof vscode.postMessage !== 'function') {
                        console.error('vscode.postMessage not available');
                        return;
                    }
                            vscode.postMessage({
                                command: 'sendMessage',
                                text: actionText
                            });
                    console.log(' Message sent successfully');
                        } catch (postError) {
                            console.error('Error calling vscode.postMessage:', postError);
                }
            }

            // Back button handler
            if (backButton) {
                backButton.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('=== backButton clicked ===');
                    switchToWelcomeMode();
                    // Notify extension to save current session
                    if (vscode && typeof vscode.postMessage === 'function') {
                        vscode.postMessage({
                            command: 'goHome'
                        });
                    }
                });
            }

            // Set up welcome screen quick actions
            if (welcomeQuickActions && welcomeQuickActions.length > 0) {
                console.log('=== SETUP: Found', welcomeQuickActions.length, 'welcome quick action buttons ===');
                welcomeQuickActions.forEach((action, index) => {
                    const actionText = action.getAttribute('data-action');
                    console.log('=== SETUP: Welcome quick action', index, ':', actionText, '===');
                    action.style.cursor = 'pointer';
                    
                    action.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('=== WELCOME QUICK ACTION CLICKED ===', actionText);
                        handleQuickActionClick(action, actionText);
                });
                });
            } else {
                console.warn('=== WARNING: No welcome quick action buttons found ===');
            }

            // Set up chat mode quick actions
            if (quickActions && quickActions.length > 0) {
            console.log('=== SETUP: Found', quickActions.length, 'chat mode quick action buttons ===');
            quickActions.forEach((action, index) => {
                const actionText = action.getAttribute('data-action');
                console.log('=== SETUP: Quick action', index, ':', actionText, '===');
                action.style.cursor = 'pointer';
                
                // Add visual feedback on click
                action.addEventListener('mousedown', function() {
                    action.style.opacity = '0.7';
                });
                action.addEventListener('mouseup', function() {
                    action.style.opacity = '1';
                });
                
                action.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('=== CHAT MODE QUICK ACTION CLICKED ===', actionText);
                    handleQuickActionClick(action, actionText);
                });
                });
            } else {
                console.warn('=== WARNING: No chat mode quick action buttons found ===');
            }
            
            // Log summary of all button setups
            console.log('=== BUTTON SETUP SUMMARY ===');
            console.log('Welcome quick actions:', welcomeQuickActions.length);
            console.log('Chat mode quick actions:', quickActions.length);
            console.log('Continue chat button:', !!continueChatBtn);
            console.log('Use own model button:', !!useOwnModel);
            console.log('Send button main:', !!sendButtonMain);
            console.log('Send button:', !!sendButton);
            console.log('Back button:', !!backButton);

            // Start rotating placeholder on load
            startRotatingPlaceholder();
            console.log('=== Rotating placeholder started ===');
            
            // GLOBAL Enter key handler as last resort - catches Enter anywhere in the document
            // but only acts if focus is on our textareas
            document.addEventListener('keydown', function(e) {
                const activeElement = document.activeElement;
                const isChatInput = activeElement && activeElement.id === 'chatInput';
                const isMessageInput = activeElement && activeElement.id === 'messageInput';
                
                console.log('GLOBAL keydown handler - activeElement:', activeElement ? activeElement.id : 'null', 'key:', e.key, 'keyCode:', e.keyCode);
                
                if ((isChatInput || isMessageInput) && (e.key === 'Enter' || e.keyCode === 13) && !e.shiftKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    console.log(' GLOBAL Enter handler caught - submitting');
                    if (isChatInput) {
                        sendWelcomeMessage();
                    } else if (isMessageInput) {
                        sendMessage();
                    }
                    return false;
                }
            }, true); // Capture phase to catch early
            
            console.log('=== GLOBAL handler attached ===');

            // Handle messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                console.log('=== Received message from extension:', message, '===');
                
                if (message.command === 'loadSession') {
                    // Restore session messages
                    if (message.messages && Array.isArray(message.messages)) {
                        console.log('Loading session with', message.messages.length, 'messages');
                        // Clear existing messages and recreate thinking element
                        if (messagesContainer) {
                            messagesContainer.innerHTML = '';
                            const thinkingEl = document.createElement('div');
                            thinkingEl.className = 'thinking';
                            thinkingEl.id = 'thinking';
                            thinkingEl.innerHTML = '<div class="thinking-gear"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 15.5A3.5 3.5 0 0 1 8.5 12A3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5a3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97c0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.4-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1c0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z"/></svg></div><span class="thinking-text">Processing<span class="thinking-dots">...</span></span>';
                            messagesContainer.appendChild(thinkingEl);
                        }
                        // Add all session messages
                        message.messages.forEach((msg) => {
                            addMessage(msg.role, msg.content, msg.timestamp);
                        });
                        // Switch to chat mode if there are messages
                        if (message.messages.length > 0) {
                            body.classList.add('chat-mode');
                        }
                    }
                } else if (message.command === 'addMessage') {
                    // Hide thinking when assistant message is added
                    if (message.role === 'assistant' && thinking) {
                        thinking.classList.remove('active');
                        setTimeout(function() {
                            if (thinking && !thinking.classList.contains('active')) {
                                thinking.style.display = 'none';
                            }
                        }, 200);
                    }
                    addMessage(message.role, message.content, message.timestamp);
                } else if (message.command === 'switchToWelcome') {
                    switchToWelcomeMode();
                } else if (message.command === 'messageCount') {
                    // Show/hide continue chat button based on message count
                    const continueChatBtn = document.getElementById('continueChat');
                    if (continueChatBtn) {
                        if (message.count > 0) {
                            continueChatBtn.style.display = 'flex';
                        } else {
                            continueChatBtn.style.display = 'none';
                        }
                    }
                } else if (message.command === 'showThinking') {
                    if (thinking) {
                        thinking.classList.add('active');
                        const textSpan = thinking.querySelector('.thinking-text');
                        if (textSpan) {
                            textSpan.innerHTML = 'Processing<span class="thinking-dots">...</span>';
                        } else {
                            thinking.innerHTML = '<div class="thinking-gear"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 15.5A3.5 3.5 0 0 1 8.5 12A3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5a3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97c0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.4-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1c0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z"/></svg></div><span class="thinking-text">Processing<span class="thinking-dots">...</span></span>';
                        }
                    }
                    if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
                } else if (message.command === 'hideThinking') {
                    if (thinking) {
                        thinking.classList.remove('active');
                        // Ensure it's completely hidden
                        setTimeout(function() {
                            if (thinking && !thinking.classList.contains('active')) {
                                thinking.style.display = 'none';
                            }
                        }, 200);
                    }
                } else if (message.command === 'thinkingStep') {
                    if (thinking) {
                        thinking.classList.add('active');
                        const textSpan = thinking.querySelector('.thinking-text');
                        const stepText = message.step || 'Processing';
                        if (textSpan) {
                            textSpan.innerHTML = stepText + '<span class="thinking-dots">...</span>';
                        } else {
                            thinking.innerHTML = '<div class="thinking-gear"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 15.5A3.5 3.5 0 0 1 8.5 12A3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5a3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97c0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.4-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1c0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z"/></svg></div><span class="thinking-text">' + stepText + '<span class="thinking-dots">...</span></span>';
                        }
                    }
                    if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
                } else if (message.command === 'clearThinking') {
                    if (thinking) {
                        thinking.classList.remove('active');
                        const textSpan = thinking.querySelector('.thinking-text');
                        if (textSpan) {
                            textSpan.textContent = '';
                        }
                        // Ensure it's completely hidden
                        setTimeout(function() {
                            if (thinking && !thinking.classList.contains('active')) {
                                thinking.style.display = 'none';
                            }
                        }, 200);
                    }
                } else if (message.command === 'clearMessages') {
                    if (messagesContainer) {
                        while (messagesContainer.firstChild) {
                            messagesContainer.removeChild(messagesContainer.firstChild);
                        }
                    }
                }
            });
            
            console.log('=== Chat Interface Initialization Complete ===');
        }
        
        // Run initialization when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initChatInterface);
        } else {
            // DOM is already ready
            initChatInterface();
        }
    </script>
</body>
</html>`;
  }
}

