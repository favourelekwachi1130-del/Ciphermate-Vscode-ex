import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getDesignTokensCSS } from '../core/design-tokens';
import { AIAgentCore, AgentRequest, AgentResponse } from './core';
import { AgenticCore } from './agentic-core';
import { getIntentRecognizer } from './intent-recognizer';
import { CyberAgentAdapter } from './cyber-agent-adapter';
import { getScanDataService, setLastScanResults, postResultsToWebviewExported, getLastScanResults } from '../extension';
import { resolveAtMentions, resolveImplicitFilePaths } from '../engine';
import type { AIChatOptions } from './providers/cli-base';
import type { Citation } from '../core/citation-service';
import { getCitationService } from '../core/citation-service';
import { wrapWebviewHtml } from '../security/webview-csp';

// Optional Mastra import - will fail gracefully if packages not installed
let MastraAdapter: any = null;
try {
  MastraAdapter = require('./mastra-adapter').MastraAdapter;
} catch (error) {
  // Mastra not available - will use AgenticCore instead
  console.log('Mastra adapter not available, will use AgenticCore');
}

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

/** True if there is no visible text (handles whitespace + invisible Unicode). */
function isAssistantContentEffectivelyEmpty(s: string | undefined | null): boolean {
  if (s == null) return true;
  const stripped = s
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
  return stripped.length === 0;
}

/**
 * True when the user wants actual code/file changes (not just an explanation).
 * Used to route @file + fix requests to AgenticCore (tools: edit_file, generate_fix, etc.)
 * instead of plain CyberAgent chat (which cannot modify the workspace).
 */
function messageRequestsFileRemediation(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return false;
  return (
    /\b(fix|fixed|fixing|remediat|patch|patches|recode|recoded|rewrite|rewriting|repair|repaired|harden|hardened|apply\s+fix|refactor)\b/i.test(t) ||
    /\b(update|change|edit)\s+(the\s+)?(file|code)\b/i.test(t) ||
    /\bfix\s+(the\s+)?(issues?|vulnerabilit|vulnerabilities|problems?|bugs?|code)\b/i.test(t) ||
    /\b(secure|sanitize)\s+(the\s+)?(code|file|endpoint|this)\b/i.test(t) ||
    /\bimplement\s+(the\s+)?fix/i.test(t)
  );
}

export class ChatInterface {
  private panel: vscode.WebviewPanel | null = null;
  private agent: AIAgentCore;
  private agenticCore: AgenticCore;
  private cyberAgent: CyberAgentAdapter;
  private mastraAdapter: any = null;
  private context: vscode.ExtensionContext;
  private messageHistory: Array<{role: 'user' | 'assistant', content: string, timestamp: Date}> = [];
  private useAgenticCore: boolean = true; // Use agentic core by default
  private useCyberAgent: boolean = true; // Use CyberAgent for conversational AI
  private useMastra: boolean = false; // Use Mastra for memory management (can be enabled via settings)
  private currentSession: ChatSession | null = null;
  private chatSessions: ChatSession[] = [];
  private thinkingSteps: string[] = [];
  private messageHandlerDisposable: vscode.Disposable | undefined;
  private lastProcessedMessage: { text: string; timestamp: number; attachCount: number } | null = null;
  /** Images chosen via VS Code file picker (avoids webview postMessage size limits). */
  private pendingHostImages: Array<{ mimeType: string; base64: string }> = [];
  private isProcessingMessage: boolean = false;
  private lastSentMessageForRestore: string | undefined;
  /** Aborts in-flight CyberAgent / provider HTTP when user hits Stop. */
  private chatAbortController: AbortController | null = null;

  constructor(context: vscode.ExtensionContext, agent: AIAgentCore) {
    this.context = context;
    this.agent = agent;
    this.agenticCore = new AgenticCore(context);
    this.cyberAgent = new CyberAgentAdapter(context, { mode: 'base' });
    
    // Check if Mastra should be enabled (via settings)
    const config = vscode.workspace.getConfiguration('ciphermate');
    this.useMastra = config.get<boolean>('useMastraMemory', false);
    
    if (this.useMastra) {
      if (!MastraAdapter) {
        console.warn('⚠️ Mastra packages not installed, disabling Mastra memory management');
        console.warn('⚠️ Falling back to AgenticCore (memory management still works, just manual)');
        this.useMastra = false;
        vscode.window.showWarningMessage(
          'Mastra packages not installed. Memory management will use manual cleanup. Run "npm install" to enable full Mastra support.',
          'Dismiss'
        );
      } else {
        try {
          this.mastraAdapter = new MastraAdapter(context);
          // Defer "enabled" log until first successful agent creation (avoids false positive if Node version incompatible)
          console.log('Mastra memory management configured (will verify on first use)');
        } catch (error: any) {
          console.warn('⚠️ Failed to initialize Mastra adapter:', error?.message || error);
          console.warn('⚠️ Falling back to AgenticCore (memory management still works, just manual)');
          this.useMastra = false;
          this.mastraAdapter = null;
          const isNodeVersion = error?.message?.includes('22.13') || error?.message?.includes('>=22');
          if (error?.message?.includes('darwin-arm64') || error?.message?.includes('Cannot find module') || isNodeVersion) {
            vscode.window.showWarningMessage(
              isNodeVersion
                ? 'Mastra requires Node.js 22.13+ but VS Code uses Node 20. Disabling useMastraMemory. Use AgenticCore for memory management.'
                : 'Mastra native dependencies not available. Memory management will use manual cleanup. Run "npm install" to enable full Mastra support.',
              'Dismiss'
            );
          }
        }
      }
    }
    
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

    // Set up the chat interface reference on agenticCore for message sending
    this.agenticCore.setChatInterface(this);
  }

  /**
   * Set the fix service reference for result listening
   * This forwards to the internal AgenticCore
   */
  public setFixService(fixService: any): void {
    if (this.agenticCore && typeof this.agenticCore.setFixService === 'function') {
      this.agenticCore.setFixService(fixService);
    }
  }

  /**
   * Get the internal AgenticCore instance
   */
  public getAgenticCore(): AgenticCore {
    return this.agenticCore;
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
      const { DiskStorageService } = require('../storage/disk-storage-service');
      const diskStorage = new DiskStorageService(this.context);
      
      // Try disk storage first, fallback to globalState for migration
      let saved: ChatSession[] = [];
      if (diskStorage.exists('ciphermate.chatSessions')) {
        saved = diskStorage.get('ciphermate.chatSessions', []) as ChatSession[];
      } else {
        // Migrate from globalState if exists
        saved = this.context.globalState.get<ChatSession[]>('ciphermate.chatSessions', []);
        if (saved.length > 0) {
          diskStorage.update('ciphermate.chatSessions', saved);
          // Clear from globalState after migration
          this.context.globalState.update('ciphermate.chatSessions', undefined);
        }
      }
      
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
      
      const { DiskStorageService } = require('../storage/disk-storage-service');
      const diskStorage = new DiskStorageService(this.context);
      diskStorage.update('ciphermate.chatSessions', this.chatSessions);
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
      this.messageHistory = session.messages.map((m) => ({
        ...m,
        timestamp: m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp as string)
      }));
      
      if (this.panel) {
        const messages = session.messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : (msg as any).timestamp,
          messageId: (msg as any).messageId,
          reference: (msg as any).reference,
          citations: (msg as any).citations || []
        }));
        this.panel.webview.postMessage({
          command: 'loadSession',
          session: session,
          messages
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
        // Panel already exists - just reveal it, preserving conversation state
        // Don't regenerate HTML as that destroys DOM and loses messages
        this.panel.reveal();
        return;
      }

      // Create new panel only if one doesn't exist
      this.panel = vscode.window.createWebviewPanel(
        'ciphermateChat',
        'CipherMate',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true, // Preserve webview state when switching tabs
          localResourceRoots: [this.context.extensionUri]
        }
      );

      this.panel.webview.html = this.getChatHtml();
      this.setupMessageHandlers();

      this.panel.onDidDispose(() => {
        // Clean up message handler disposable
        if (this.messageHandlerDisposable) {
          this.messageHandlerDisposable.dispose();
          this.messageHandlerDisposable = undefined;
        }
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
   * Uses loadSession to clear existing messages first and re-add - prevents duplicates
   */
  private restoreMessages(): void {
    if (!this.panel) {
      return;
    }

    // Wait for webview to be ready before sending messages
    setTimeout(() => {
      if (this.messageHistory.length > 0) {
        // Use loadSession to clear + re-add (prevents duplicates from retainContextWhenHidden)
        console.log(`Restoring ${this.messageHistory.length} messages to webview`);
        const messages = this.messageHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : (msg as any).timestamp,
          messageId: (msg as any).messageId,
          reference: (msg as any).reference,
          citations: (msg as any).citations || []
        }));
        this.panel?.webview.postMessage({
          command: 'loadSession',
          messages
        });
      } else {
        // No existing messages, send initial greeting
        this.addMessage('assistant', 'CipherMate ready. How can I help secure your code?');
      }
    }, 100); // Small delay to ensure webview is ready
  }

  /**
   * Process user message
   * @param message - The user's message text
   * @param replyContext - Optional context when replying to a message (replied content + surrounding messages)
   */
  async processUserMessage(
    message: string,
    replyContext?: { repliedToContent: string; repliedToRole: string; contextMessages: Array<{ role: string; content: string }> },
    chatOpts?: AIChatOptions,
    /** If set (e.g. image-only placeholder), used for @-mentions and AI; `message` is what appears in the user bubble. */
    contentForAi?: string
  ): Promise<void> {
    if (!this.panel) {
      this.show();
    }

    const abortSignal = chatOpts?.signal;
    const isAborted = (): boolean => !!abortSignal?.aborted;
    if (isAborted()) {
      return;
    }

    const aiBase = contentForAi ?? message;

    // If reply context provided, build context-enriched message for AI analysis
    let messageToProcess = aiBase;
    if (replyContext && replyContext.repliedToContent) {
      const ctxParts: string[] = [
        '[Reply context - analyzing the following for your response]:',
        `Replying to (${replyContext.repliedToRole}): "${replyContext.repliedToContent}"`
      ];
      if (replyContext.contextMessages && replyContext.contextMessages.length > 0) {
        ctxParts.push('Prior conversation context:');
        replyContext.contextMessages.forEach((m, i) => {
          ctxParts.push(`  ${i + 1}. ${m.role}: ${m.content.substring(0, 300)}${m.content.length > 300 ? '...' : ''}`);
        });
      }
      ctxParts.push('');
      ctxParts.push('[User reply]:');
      messageToProcess = ctxParts.join('\n') + aiBase;
    }

    // Resolve @file mentions and obvious file paths (e.g. server.js) — inject file contents for the LLM
    const atMentions = await resolveAtMentions(messageToProcess);
    messageToProcess = atMentions.enriched;
    let hasFileContext = atMentions.addedContext.length > 0;
    if (!hasFileContext) {
      const implicit = await resolveImplicitFilePaths(message);
      if (implicit.contextBlock) {
        hasFileContext = true;
        messageToProcess = implicit.contextBlock + messageToProcess;
      }
    }

    // Add user message to chat - include reply context summary when replying (same as shown in context panel)
    let messageToDisplay = message;
    if (replyContext && replyContext.repliedToContent) {
      const replyLabel = replyContext.repliedToRole === 'assistant' ? 'CipherMate' : 'You';
      let summary = `Replying to ${replyLabel} (message above)`;
      if (replyContext.contextMessages && replyContext.contextMessages.length > 0) {
        summary += ` - ${replyContext.contextMessages.length} prior message(s) for context`;
      }
      messageToDisplay = `${summary}\n\n${message}`;
    }
    this.addMessage('user', messageToDisplay);

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

    // Check for "what can you do" / "what else can you do" type questions
    const capabilitiesQuestionPatterns = [
      /what.*can.*you.*do|what.*else.*can.*you.*do|what.*are.*your.*capabilities|what.*do.*you.*do|tell.*me.*about.*yourself|what.*are.*you/i
    ];
    const isCapabilitiesQuestion = capabilitiesQuestionPatterns.some((pattern: RegExp) => pattern.test(message));
    
    // For capabilities questions, let CyberAgent handle it with the updated system prompt
    // The system prompt now includes comprehensive CipherMate capabilities
    // This ensures the AI responds accurately in context

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

    // Intent keywords (optional): only used when ciphermate.chat.autoAgenticScanOnKeywords is true
    const intentRecognizer = getIntentRecognizer();
    const isSecurityRequest = intentRecognizer.isSecurityRequest(message);

    try {
      // Get current context
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const workspacePath = workspaceFolders?.[0]?.uri.fsPath;
      const hasWorkspace = workspaceFolders && workspaceFolders.length > 0;
      const ciphermateConfig = vscode.workspace.getConfiguration('ciphermate');
      const autoAgenticScanOnKeywords = ciphermateConfig.get<boolean>(
        'chat.autoAgenticScanOnKeywords',
        false
      );

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

      // AgenticCore when: (a) keyword security scan path, or (b) @file + user asked to fix/edit code (tools: edit_file, etc.)
      const agenticForKeywords =
        autoAgenticScanOnKeywords && isSecurityRequest && this.useAgenticCore && !hasFileContext;
      const agenticForFileRemediation =
        hasFileContext && messageRequestsFileRemediation(message) && this.useAgenticCore && !!hasWorkspace;

      if (agenticForKeywords || agenticForFileRemediation) {
        // Thinking row already shown at message start; keep steps specific to agentic work
        this.showThinkingStep('Analyzing your request…');
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

          if (agenticForFileRemediation && !agenticForKeywords) {
            this.showThinkingStep('Using CipherMate tools to read and edit files…');
          } else {
            this.showThinkingStep('Running comprehensive security scan...');
          }
        }

        const assistantStreamId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        try {
          // Mastra 0.24.x has AI SDK v4/v5 model classification conflicts with Ollama.
          // When Ollama is the provider, use AgenticCore directly to avoid "streamLegacy" / "generateLegacy" ping-pong errors.
          const workspaceFolders = vscode.workspace.workspaceFolders;
          const configForProvider = workspacePath && workspaceFolders?.length
            ? vscode.workspace.getConfiguration('ciphermate', vscode.Uri.file(workspacePath))
            : vscode.workspace.getConfiguration('ciphermate');
          const aiProvider = configForProvider.get<string>('ai.provider', 'openrouter');
          const aiModel = configForProvider.get<string>('ai.model', '') || '';
          // Skip Mastra for Ollama (connection/model issues) or models known to cause AI SDK v4/v5 conflicts
          const skipMastraForOllama = aiProvider === 'ollama';
          const skipMastraForV4Conflict = /openai\.responses|gpt-4o|gpt-4\.1/i.test(aiModel);
          
          // File remediation requires AgenticCore tool loop (edit_file). Mastra path may not wire the same tools.
          const useMastraHere =
            this.useMastra &&
            this.mastraAdapter &&
            !skipMastraForOllama &&
            !skipMastraForV4Conflict &&
            !agenticForFileRemediation;

          // Use Mastra adapter if enabled (and not skipped), otherwise fall back to AgenticCore
          if (useMastraHere) {
            try {
              // Use Mastra with built-in memory management
              responseText = await this.mastraAdapter.processRequest(messageToProcess, workspacePath);
              if (isAborted()) {
                this.hideThinking();
                this.clearThinking();
                return;
              }
              const citations = this.mastraAdapter.getCitations();
              const citationArray =
                citations && typeof citations === 'string'
                  ? citations.split(' | ').filter((c) => c.trim())
                  : [];
              await this.streamAssistantToWebview(responseText, citationArray, abortSignal, {
                messageId: assistantStreamId,
              });
            } catch (mastraError: any) {
              const errMsg = mastraError?.message || String(mastraError);
              console.warn('Mastra adapter failed, falling back to AgenticCore:', errMsg);
              // Disable Mastra to avoid retrying on every message if it's a persistent issue (Node version, missing deps)
              if (errMsg.includes('packages not') || errMsg.includes('22.13') || errMsg.includes('>=22') || errMsg.includes('failed to load')) {
                this.useMastra = false;
                console.warn('Mastra disabled for this session. Use AgenticCore for memory management.');
              }
              // Fallback to AgenticCore
              responseText = await this.agenticCore.processRequest(
                messageToProcess,
                workspacePath,
                assistantStreamId
              );
              if (isAborted()) {
                this.hideThinking();
                this.clearThinking();
                return;
              }
              const citationArray = this.agenticCore.getCitationsForWebview();
              const fileDiff = this.agenticCore.getLastFileEditDiffForChat();
              await this.streamAssistantToWebview(responseText, citationArray, abortSignal, {
                messageId: assistantStreamId,
                fileDiff: fileDiff ?? undefined,
              });
            }
          } else {
            // Use agentic core - true autonomous agent with tool calling
            responseText = await this.agenticCore.processRequest(
              messageToProcess,
              workspacePath,
              assistantStreamId
            );
            if (isAborted()) {
              this.hideThinking();
              this.clearThinking();
              return;
            }
            const citationArray = this.agenticCore.getCitationsForWebview();
            const fileDiff = this.agenticCore.getLastFileEditDiffForChat();
            await this.streamAssistantToWebview(responseText, citationArray, abortSignal, {
              messageId: assistantStreamId,
              fileDiff: fileDiff ?? undefined,
            });
          }
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
              errorMessage.includes('Channel closed') ||
              errorMessage.includes('fetch failed') ||
              errorMessage.includes('ECONNREFUSED') ||
              errorMessage.includes('Failed to connect to Ollama') ||
              errorMessage.includes('streamLegacy') ||
              errorMessage.includes('generateLegacy');
          
          if (isAIProviderError) {
            if (agenticForFileRemediation) {
              const toolsRan = this.agenticCore.getLastSessionToolExecutions() > 0;
              const errShort =
                errorMessage.length > 220 ? errorMessage.substring(0, 220) + '…' : errorMessage;
              const openRouterHint =
                /openrouter|400|Provider returned error|StepFun|input_invalid/i.test(errorMessage)
                  ? `\n\n**OpenRouter tip:** \`openrouter/free\` can route through backends that reject large tool payloads (HTTP 400). Prefer a **fixed model id** (e.g. \`anthropic/claude-sonnet-4\`) in CipherMate coding model settings. CipherMate also avoids routing through StepFun when possible.`
                  : '';
              if (toolsRan) {
                responseText =
                  `File remediation started and **CipherMate tools ran** (e.g. \`read_file\` / \`scan_file\`), but the **AI provider failed on a later step** — often while sending the next request with tool history, or when the model returns a very large \`edit_file\` payload.\n\n` +
                  `**What failed:** \`${errShort}\`\n\n` +
                  `**Why the file may be unchanged:** The model must finish the loop with a successful \`edit_file\` (or similar) call; an API error mid-loop stops there.${openRouterHint}\n\n` +
                  `**What to try:**\n` +
                  `1. Retry the same \`@file\` request (payloads are now compacted for the next request).\n` +
                  `2. Settings (⚙) → set coding model to a stable OpenRouter id (not only \`openrouter/free\`).\n` +
                  `3. Confirm \`ciphermate\` API key and \`ai.model\` are set.\n`;
              } else {
                responseText =
                  `I understood this as a direct file remediation request, but the **configured AI provider failed before any tools finished** in this turn.\n\n` +
                  `**What failed:** \`${errShort}\`\n\n` +
                  `**Why no file was edited:** CipherMate writes files only after the model returns executable tool calls and the provider accepts the request.${openRouterHint}\n\n` +
                  `**Fix the provider and retry:**\n` +
                  `1. Open Settings (⚙)\n` +
                  `2. Verify \`ciphermate.ai.provider\`, API key, and **coding model**\n` +
                  `3. Resend your \`@file\` fix / recode request\n`;
              }
            } else if (!hasWorkspace) {
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
                  `- Check the View Results panel for details\n\n` +
                  `**Steps to run a new scan:**\n` +
                  `1. Press **Ctrl+Shift+P** (Mac: **Cmd+Shift+P**) to open the Command Palette\n` +
                  `2. Type **CipherMate: Intelligent Scan** or **CipherMate: Scan** and press Enter\n` +
                  `3. Or say **"scan my repository"** in this chat\n` +
                  `4. Or open View Results and click **Run Scan**\n\n` +
                  `**Note:** Security scans work independently of AI. The AI is only used for generating detailed reports.`;
              } else {
                // For workspace requests, provide helpful guidance with concrete steps
                responseText = `I'm ready to help, but I'm having trouble connecting to the AI service. Here's how to run a new scan anyway:\n\n` +
                  `**Steps to run a new scan:**\n` +
                  `1. Press **Ctrl+Shift+P** (Mac: **Cmd+Shift+P**) to open the Command Palette\n` +
                  `2. Type **CipherMate: Intelligent Scan** or **CipherMate: Scan** and press Enter\n` +
                  `3. Or say **"scan my repository"** in this chat\n` +
                  `4. Results will appear in the View Results panel\n\n` +
                  `**To fix the AI connection:**\n` +
                  `- Open Settings (⚙ icon) and set **ciphermate.ai.provider** to **openrouter** (free tier)\n` +
                  `- Add your OpenRouter API key in Settings\n` +
                  `- The security scanners work without AI; AI is only used for detailed reports.`;
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
          if (!isAborted()) {
            await this.streamAssistantToWebview(
              responseText,
              this.agenticCore.getCitationsForWebview(),
              abortSignal,
              {
                messageId: assistantStreamId,
                fileDiff: this.agenticCore.getLastFileEditDiffForChat() ?? undefined,
              }
            );
          }
        }
        
        if (isAborted()) {
          this.hideThinking();
          this.clearThinking();
          return;
        }

        // Clear thinking and show final result
        await new Promise(resolve => setTimeout(resolve, 200));
        this.clearThinking();
        this.hideThinking();
        
        // Get state for additional context
        const state = this.agenticCore.getState();
        
        // Extract vulnerabilities from state - check both vulnerabilities array and scanResults
        // state.vulnerabilities is populated by updateStateFromToolResult
        // state.scanResults is set directly from scanResult.vulnerabilities
        let vulnerabilitiesToSave: any[] = [];
        
        // Check if vulnerabilities are directly in state.vulnerabilities (preferred)
        if (state.vulnerabilities && state.vulnerabilities.length > 0) {
          vulnerabilitiesToSave = state.vulnerabilities;
        } 
        // Fallback to scanResults (set at line 563 in agentic-core.ts)
        else if (state.scanResults && Array.isArray(state.scanResults) && state.scanResults.length > 0) {
          vulnerabilitiesToSave = state.scanResults;
        }
        
        // Save scan results to database and update dashboard if we have vulnerabilities
        if (vulnerabilitiesToSave.length > 0) {
          try {
            const scanDataService = getScanDataService();
            const workspaceFolders = vscode.workspace.workspaceFolders;
            const workspacePath = workspaceFolders?.[0]?.uri.fsPath || '';
            
            // Convert to format expected by View Results panel (path, start.line, extra.message)
            const vulnerabilities = vulnerabilitiesToSave.map((v: any) => {
              const path = v.path || v.file || v.location?.file || '';
              const line = v.line || v.start?.line || v.location?.line || 0;
              const msg = v.message || v.description || v.title || 'Security Issue';
              return {
                ...v,
                tool: v.tool || v.scanner || 'AgenticCore',
                path,
                start: { line },
                extra: { message: msg },
                line,
                severity: (v.severity || 'medium').toUpperCase(),
                title: v.title || msg,
                description: v.description || msg,
                type: v.type || v.check_id || v.rule || 'Unknown'
              };
            });
            
            // Always update View Results panel - critical for pipeline
            setLastScanResults(vulnerabilities);
            // Open dashboard first so postResultsToWebview has a panel to send to
            await vscode.commands.executeCommand('ciphermate.showResults');
            await postResultsToWebviewExported();
            console.log('AgenticCore: Results sent to View Results panel', { count: vulnerabilities.length });
            
            if (scanDataService && workspacePath) {
              await scanDataService.saveScan({
                scanType: 'AgenticCore Scan',
                workspacePath,
                vulnerabilities: vulnerabilities,
                duration: (state as any).scanDuration || 0,
                timestamp: new Date(),
                metadata: { 
                  scanner: 'agentic-core',
                  scanResult: state.scanResults ? JSON.stringify(state.scanResults) : undefined
                }
              });
              console.log('AgenticCore: Scan results saved to database');
            }
          } catch (error) {
            console.error('AgenticCore: Failed to save scan results', error);
          }
        }
        // Security path: message already added in try block above - do NOT fall through to common add (would duplicate)
        return;
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

        // For regular human communication: inject scan + conversation context so the AI has continuity
        // (e.g. "is my security report bad?" after a scan - AI needs to know about the scan results)
        const conversationContext = this.getConversationContextForAI();
        const needsWorkspaceContext = /code|file|project|repository|workspace/i.test(messageToProcess);
        let contextMessage = messageToProcess;
        if (hasFileContext) {
          contextMessage =
            '[Instruction: Specific file(s) are attached above. Review and fix those files only. Do not run or assume a full-repository scan unless the user clearly asks to scan the whole repo.]\n\n' +
            contextMessage;
        }
        if (conversationContext) {
          contextMessage = conversationContext + contextMessage;
        }
        if (workspacePath && needsWorkspaceContext) {
          contextMessage += `\n\n[Context: Working in repository at ${workspacePath}]`;
        }

        // Show thinking for conversational requests (explicit copy so users never see a "dead" UI)
        this.showThinkingStep(
          hasFileContext
            ? 'Reading @-mentioned files and contacting the AI…'
            : 'Thinking…'
        );

        // Get timeout from config - use longer timeout for Ollama (5 minutes default)
        const config = vscode.workspace.getConfiguration('ciphermate');
        const provider = config.get<string>('ai.provider') || 'openrouter';
        // Ollama needs longer timeout (5 min), cloud providers use 2 min
        const timeoutMs = provider === 'ollama' ? 300000 : 120000;

        try {
          responseText = await Promise.race([
            this.cyberAgent.chat(contextMessage, chatOpts),
            new Promise<string>((_, reject) => {
              setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs / 1000} seconds`)), timeoutMs);
            })
          ]);

          if (isAborted()) {
            this.hideThinking();
            this.clearThinking();
            return;
          }

          // Success - log and clear thinking
          console.log('ChatInterface: CyberAgent response received successfully, length:', responseText?.length);
          console.log('ChatInterface: Response preview:', responseText?.substring(0, 100));
          // Do not clearThinking() here — it hid the thinking row before the webview drew the reply (blank gap).
          // addMessage → addMessageWithReference will hideThinking + clearThinking when the bubble is posted.

          await this.streamAssistantToWebview(responseText, undefined, abortSignal);
          return;
        } catch (chatError) {
          if (isAborted() || (chatError instanceof Error && chatError.name === 'AbortError')) {
            this.hideThinking();
            this.clearThinking();
            return;
          }
          const chatErrorMessage = chatError instanceof Error ? chatError.message : String(chatError);
          console.log('CyberAgent chat failed:', chatErrorMessage);
          // Do not clearThinking() here — same blank-gap issue; hideThinking runs before the fallback bubble below.

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
            // Generic error - include actual error for debugging, suggest fixes
            const sanitizedError = chatErrorMessage.length > 300 ? chatErrorMessage.substring(0, 300) + '...' : chatErrorMessage;
            responseText = `I encountered an issue while processing your request.\n\n` +
              `**Error details:** \`${sanitizedError}\`\n\n` +
              `**Common fixes:**\n` +
              `- **OpenRouter users:** Try \`openrouter/free\` in Settings → AI Providers (free, auto-selects models)\n` +
              `- **401/Invalid key:** Re-enter your API key in Settings\n` +
              `- **402/Credits:** Your API credits may be exhausted; add credits or switch to a free model\n` +
              `- **Network:** Check if you can reach https://openrouter.ai in a browser\n\n` +
              `**What works without AI:** "scan my repository", "find hardcoded secrets", "check dependencies"`;
          }
        }
      }

      this.hideThinking();

      if (responseText && !isAborted()) {
        console.log('ChatInterface: Streaming assistant message, responseText length:', responseText?.length);
        // CyberAgent path: do not reuse agentic citation state from a prior turn
        await this.streamAssistantToWebview(responseText, [], abortSignal);
        console.log('ChatInterface: Assistant stream finished');
      }

      } catch (error) {
        this.hideThinking();
        this.clearThinking();
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Always provide helpful message - never show raw errors
        console.log('Error caught in chat interface:', errorMessage);
        
        // Determine if this was a security request or regular conversation
        const wasSecurityRequest = getIntentRecognizer().isSecurityRequest(message);
        
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
            helpfulMessage += `**Steps to run a new scan:**\n`;
            helpfulMessage += `1. Press **Ctrl+Shift+P** (Mac: **Cmd+Shift+P**) and run **CipherMate: Intelligent Scan**\n`;
            helpfulMessage += `2. Or say **"scan my repository"** in this chat\n`;
            helpfulMessage += `3. Or open View Results and click **Run Scan**\n\n`;
            helpfulMessage += `Security scans work independently of AI - they'll produce results even without AI configured.`;
          } else {
            helpfulMessage += `**Note:** Security scans (like "scan my repository") work independently of AI and don't require configuration.`;
          }
          
          await this.streamAssistantToWebview(helpfulMessage, undefined, abortSignal);
        } else {
          // Other errors - include actual error for debugging, add OpenRouter-specific tips
          const sanitizedError = errorMessage.length > 250 ? errorMessage.substring(0, 250) + '...' : errorMessage;
          const openRouterTips = `**Common fixes:**\n` +
            `- **OpenRouter:** Use \`openrouter/free\` in Settings → AI Providers → OpenRouter Model (free tier)\n` +
            `- **401:** Re-enter your API key in Settings\n` +
            `- **402:** API credits exhausted; switch to a free model or add credits\n` +
            `- **Network:** Verify you can reach https://openrouter.ai in a browser\n\n`;
          if (wasSecurityRequest) {
            await this.streamAssistantToWebview(
              `I encountered an issue while processing your security request.\n\n` +
                `**Error:** \`${sanitizedError}\`\n\n` +
                `**Try asking:**\n` +
                `- "scan my repository" (works without AI)\n` +
                `- "find hardcoded secrets"\n` +
                `- "check dependencies"\n\n` +
                openRouterTips +
                `Or configure your AI provider in Settings (⚙ icon) for detailed AI-powered analysis.`,
              undefined,
              abortSignal
            );
          } else {
            await this.streamAssistantToWebview(
              `I encountered an issue while processing your request.\n\n` +
                `**Error:** \`${sanitizedError}\`\n\n` +
                `**What I can help with:**\n` +
                `- General questions and conversation (when AI is configured)\n` +
                `- Security scans: "scan my repository" (works without AI)\n` +
                `- Finding secrets: "find hardcoded secrets"\n` +
                `- Checking dependencies: "check dependencies"\n` +
                `- Smart contract analysis: "scan smart contracts"\n\n` +
                openRouterTips +
                `Configure your AI provider in Settings (⚙ icon). ` +
                `Security features work independently and don't require AI configuration.`,
              undefined,
              abortSignal
            );
          }
        }
      }
  }

  /**
   * Build conversation context for AI - scan results + recent messages.
   * Injects into the prompt so the AI has continuity (e.g. "is my security report bad?" after a scan).
   */
  private getConversationContextForAI(): string {
    const parts: string[] = [];
    const state = this.agenticCore.getState();
    const vulns = state.vulnerabilities || state.scanResults || [];

    // Scan context: if we have recent scan results, summarize for the AI
    if (vulns.length > 0) {
      const bySev: Record<string, number> = {};
      const types = new Set<string>();
      for (const v of vulns) {
        const s = (v.severity || 'medium').toLowerCase();
        bySev[s] = (bySev[s] || 0) + 1;
        const t = v.type || v.title || v.message || 'issue';
        types.add(typeof t === 'string' ? t : 'issue');
      }
      const sevLine = Object.entries(bySev)
        .map(([s, n]) => `${s}: ${n}`)
        .join(', ');
      const typeSample = Array.from(types).slice(0, 6).join(', ');
      parts.push(
        `[Recent scan context: User ran a security scan. Found ${vulns.length} vulnerabilities (${sevLine}). ` +
        `Finding types include: ${typeSample}. Use this when they ask about the report, results, or whether things look bad.]`
      );
    }

    // Recent conversation: last few messages so the AI knows what was just discussed
    const recent = this.messageHistory.slice(-6);
    if (recent.length > 0) {
      const lines = recent.map(m => {
        const role = m.role === 'user' ? 'User' : 'CipherMate';
        const content = m.content.length > 400 ? m.content.substring(0, 400) + '...' : m.content;
        return `  ${role}: ${content.replace(/\n/g, ' ')}`;
      });
      parts.push('[Recent conversation for context:\n' + lines.join('\n') + ']');
    }

    if (parts.length === 0) return '';
    return parts.join('\n\n') + '\n\n';
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

  /**
   * Add a message to the chat interface
   * Made public to allow external components (like AgenticCore) to send messages
   */
  public addMessage(role: 'user' | 'assistant', content: string): void {
    this.addMessageWithReference(role, content);
  }

  /**
   * Add a message with reference data (for reply/reference functionality)
   */
  public addMessageWithReference(
    role: 'user' | 'assistant',
    content: string,
    reference?: {
      messageId: string;
      filePath?: string;
      line?: number;
      type?: 'analysis' | 'adjustment';
      data?: any;
    },
    citations?: string[]
  ): void {
    console.log('ChatInterface: addMessageWithReference() called', { role, contentLength: content?.length, hasReference: !!reference, citationsCount: citations?.length });

    const messageId = reference?.messageId || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Avoid blank assistant bubbles when the model returns empty / invisible content (users see an "empty box").
    let safeContent = content ?? '';
    if (role === 'assistant' && isAssistantContentEffectivelyEmpty(safeContent)) {
      safeContent =
        "I didn't get any text back from the AI (empty response). Try again, pick another model in **Settings → CipherMate → AI**, or check your provider/API key. " +
        'If you asked about a specific file, use **@path** (e.g. `@backend/server.js`) so the right file is in context.';
    }

    const message = {
      role,
      content: safeContent,
      timestamp: new Date(),
      messageId,
      reference,
      citations: citations || []
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

    console.log('ChatInterface: Sending addMessage to webview, panel exists?', !!this.panel);
    if (this.panel) {
      console.log('ChatInterface: Posting addMessage command to webview');
      this.panel.webview.postMessage({
        command: 'addMessage',
        role,
        content: safeContent,
        timestamp: new Date().toISOString(),
        messageId,
        reference,
        citations: citations || []
      });
    } else {
      console.error('ChatInterface: Cannot add message - panel is null');
    }
  }

  /**
   * Record assistant output when the webview already rendered via stream events.
   */
  private appendAssistantToHistory(
    messageId: string,
    content: string,
    reference?: {
      messageId: string;
      filePath?: string;
      line?: number;
      type?: 'analysis' | 'adjustment';
      data?: any;
    },
    citations?: string[]
  ): void {
    let safeContent = content ?? '';
    if (isAssistantContentEffectivelyEmpty(safeContent)) {
      safeContent =
        "I didn't get any text back from the AI (empty response). Try again, pick another model in **Settings → CipherMate → AI**, or check your provider/API key. " +
        'If you asked about a specific file, use **@path** (e.g. `@backend/server.js`) so the right file is in context.';
    }
    const message = {
      role: 'assistant' as const,
      content: safeContent,
      timestamp: new Date(),
      messageId,
      reference,
      citations: citations || [],
    };
    this.messageHistory.push(message);
    if (!this.currentSession) {
      this.createNewSession();
    }
    if (this.currentSession) {
      this.currentSession.messages.push(message);
      this.currentSession.updatedAt = new Date();
      this.saveChatSessions();
    }
    this.hideThinking();
    this.clearThinking();
  }

  /** Remove duplicate Sources footer when the webview already shows the citations block. */
  private stripInlineSourcesFooter(text: string): string {
    return text.replace(/\n\n---\s*\n\*\*Sources:\*\*[\s\S]*$/m, '').trimEnd();
  }

  /** Simulated streaming in the webview (full text from provider; chunked for readable UX). */
  private async streamAssistantToWebview(
    fullText: string | undefined,
    citations: string[] | undefined,
    abortSignal: AbortSignal | undefined,
    opts?: {
      messageId?: string;
      fileDiff?: { path: string; html: string; copyText: string } | null;
    }
  ): Promise<void> {
    let text = fullText ?? '';
    text = this.stripInlineSourcesFooter(text);
    if (isAssistantContentEffectivelyEmpty(text)) {
      text =
        "I didn't get any text back from the AI (empty response). Try again, pick another model in **Settings → CipherMate → AI**, or check your provider/API key. " +
        'If you asked about a specific file, use **@path** (e.g. `@backend/server.js`) so the right file is in context.';
    }
    const messageId =
      opts?.messageId ?? `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fileDiff = opts?.fileDiff ?? null;
    if (!this.panel) {
      this.addMessageWithReference('assistant', text, undefined, citations);
      return;
    }
    this.panel.webview.postMessage({
      command: 'assistantStreamStart',
      messageId,
      timestamp: new Date().toISOString(),
    });
    const CHUNK = 4;
    const DELAY_MS = 12;
    for (let i = 0; i < text.length; i += CHUNK) {
      if (abortSignal?.aborted) {
        const partial = text.slice(0, i);
        this.panel.webview.postMessage({
          command: 'assistantStreamEnd',
          messageId,
          content: partial,
          citations: citations || [],
          aborted: true,
          fileDiff: fileDiff || undefined,
        });
        this.appendAssistantToHistory(messageId, partial, undefined, citations);
        return;
      }
      this.panel.webview.postMessage({
        command: 'assistantStreamDelta',
        messageId,
        chunk: text.slice(i, i + CHUNK),
      });
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
    this.panel.webview.postMessage({
      command: 'assistantStreamEnd',
      messageId,
      content: text,
      citations: citations || [],
      fileDiff: fileDiff || undefined,
    });
    this.appendAssistantToHistory(messageId, text, undefined, citations);
  }

  /**
   * Update citations for a message (for dynamic citation display)
   */
  public updateCitations(messageId: string, citations: string[] | Citation[]): void {
    if (!this.panel) {
      return;
    }
    const rows =
      Array.isArray(citations) &&
      citations.length > 0 &&
      typeof (citations as Citation[])[0] === 'object' &&
      (citations as Citation[])[0] !== null &&
      'type' in (citations as Citation[])[0] &&
      'source' in (citations as Citation[])[0]
        ? getCitationService().citationsToDisplayStrings(citations as Citation[])
        : (citations as string[]);
    this.panel.webview.postMessage({
      command: 'updateCitations',
      messageId,
      citations: rows,
    });
  }

  /**
   * Show citations during thinking process (appears dynamically)
   */
  public showThinkingCitations(citations: string[]): void {
    if (this.panel && citations.length > 0) {
      this.panel.webview.postMessage({
        command: 'showThinkingCitations',
        citations
      });
    }
  }

  /**
   * Show action taken during thinking process (appears dynamically)
   */
  public showThinkingAction(action: string, details?: string): void {
    if (this.panel) {
      this.panel.webview.postMessage({
        command: 'showThinkingAction',
        action,
        details
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

  private showThinking(initialStep?: string): void {
    console.log('ChatInterface: showThinking() called, panel exists?', !!this.panel);
    if (this.panel) {
      console.log('ChatInterface: Sending showThinking to webview');
      this.panel.webview.postMessage({
        command: 'showThinking',
        step:
          initialStep ||
          'Preparing your request (workspace, AI provider, and tools)…',
      });
    } else {
      console.error('ChatInterface: Cannot show thinking - panel is null');
    }
  }

  private hideThinking(): void {
    console.log('ChatInterface: hideThinking() called, panel exists?', !!this.panel);
    if (this.panel) {
      console.log('ChatInterface: Sending hideThinking to webview');
      this.panel.webview.postMessage({ command: 'hideThinking' });
    } else {
      console.error('ChatInterface: Cannot hide thinking - panel is null');
    }
  }

  private setupMessageHandlers(): void {
    if (!this.panel) {
      console.error('ChatInterface: No panel available for message handlers');
      return;
    }

    // Dispose existing handler to prevent duplicate message processing
    if (this.messageHandlerDisposable) {
      console.log('ChatInterface: Disposing existing message handler');
      this.messageHandlerDisposable.dispose();
      this.messageHandlerDisposable = undefined;
    }

    console.log('ChatInterface: Setting up message handlers');
    this.messageHandlerDisposable = this.panel.webview.onDidReceiveMessage(async (message) => {
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
        } else if (message.command === 'diagnostic') {
          // Handle diagnostic data from webview - write to file for debugging
          const diagnosticData = message.data;
          console.log('=== WEBVIEW DIAGNOSTIC RECEIVED ===');
          console.log(JSON.stringify(diagnosticData, null, 2));

          // Write to a file for external access
          try {
            const fs = require('fs');
            const os = require('os');
            const path = require('path');
            const diagnosticPath = path.join(os.tmpdir(), 'ciphermate-diagnostic.json');
            fs.writeFileSync(diagnosticPath, JSON.stringify(diagnosticData, null, 2));
            console.log('DIAGNOSTIC written to:', diagnosticPath);
          } catch (writeError) {
            console.error('Failed to write diagnostic file:', writeError);
          }
          return;
        } else if (message.command === 'pickChatImages') {
          void this.pickChatImagesFromHost();
          return;
        } else if (message.command === 'sendMessage') {
          const attachments = Array.isArray((message as { attachments?: Array<{ mimeType: string; base64: string }> }).attachments)
            ? (message as { attachments: Array<{ mimeType: string; base64: string }> }).attachments
            : undefined;
          const rawText = (message.text as string | undefined)?.trim() || '';
          const fromWeb =
            attachments
              ?.filter((a) => a?.base64 && a?.mimeType)
              .map((a) => ({
                mimeType: a.mimeType,
                base64: String(a.base64).replace(/^data:image\/\w+;base64,/, '')
              })) || [];
          const attachCount = fromWeb.length + this.pendingHostImages.length;
          const hasAttachments = attachCount > 0;
          const messageText =
            rawText ||
            (hasAttachments ? '(The user attached one or more images. Describe and analyze them. Answer any question using the image content.)' : '');
          const replyContext = message.replyContext as { repliedToContent: string; repliedToRole: string; contextMessages: Array<{ role: string; content: string }> } | undefined;
          console.log('ChatInterface: sendMessage', {
            textLen: messageText.length,
            replyContext: !!replyContext,
            webImages: fromWeb.length,
            hostImages: this.pendingHostImages.length
          });

          if (!messageText && !hasAttachments) {
            return;
          }

          // Prevent duplicate message processing
          const now = Date.now();
          if (this.isProcessingMessage) {
            console.log('ChatInterface: Already processing a message, ignoring duplicate');
            return;
          }
          if (this.lastProcessedMessage &&
              this.lastProcessedMessage.text === messageText &&
              this.lastProcessedMessage.attachCount === attachCount &&
              now - this.lastProcessedMessage.timestamp < 5000) {
            console.log('ChatInterface: Duplicate message detected within 5s, ignoring');
            return;
          }

          // If we have message history but no current session, create one to continue
          if (this.messageHistory.length > 0 && !this.currentSession) {
            console.log('[EXT] Creating session from existing history before new message');
            this.createNewSession();
            // createNewSession() always sets currentSession, use non-null assertion
            this.currentSession!.messages = [...this.messageHistory];
          }

          this.chatAbortController?.abort();
          this.chatAbortController = new AbortController();
          const fromHost = [...this.pendingHostImages];
          this.pendingHostImages = [];
          this.panel?.webview.postMessage({ command: 'attachmentBadge', count: 0 });
          const mergedImages = [...fromWeb, ...fromHost];
          const chatOpts: AIChatOptions = {
            signal: this.chatAbortController.signal,
            userImages: mergedImages.length > 0 ? mergedImages : undefined
          };
          if (mergedImages.length > 0) {
            console.log('ChatInterface: multimodal request', mergedImages.length, 'image(s) → LLM');
          }

          // Mark as processing and save last message (for stop/restore)
          this.isProcessingMessage = true;
          this.lastProcessedMessage = { text: rawText || messageText, timestamp: now, attachCount };
          this.lastSentMessageForRestore = rawText || messageText;

          const displayUser = rawText || (hasAttachments ? '📎 Image attachment' : messageText);
          try {
            await this.processUserMessage(displayUser, replyContext, chatOpts, messageText);
          } finally {
            this.isProcessingMessage = false;
            this.lastSentMessageForRestore = undefined;
          }
        } else if (message.command === 'stopMessage') {
          // Abort in-flight provider HTTP and end generation
          this.chatAbortController?.abort();
          if (!this.isProcessingMessage) {
            this.hideThinking();
            this.clearThinking();
            return;
          }
          this.isProcessingMessage = false;
          const restore = this.lastSentMessageForRestore;
          this.lastSentMessageForRestore = undefined;
          if (restore !== undefined) {
            if (this.messageHistory.length > 0 && this.messageHistory[this.messageHistory.length - 1].role === 'user') {
              this.messageHistory.pop();
              if (this.currentSession) {
                this.currentSession.messages = [...this.messageHistory];
                this.saveChatSessions();
              }
            }
            this.panel?.webview.postMessage({
              command: 'restoreMessageToInput',
              message: restore
            });
          }
          this.hideThinking();
          this.clearThinking();
        } else if (message.command === 'clearChat') {
          this.messageHistory = [];
          this.pendingHostImages = [];
          this.agent.clearHistory();
          this.agenticCore.getState().conversation = [];
          this.cyberAgent.clearHistory();
          this.panel?.webview.postMessage({ command: 'clearMessages' });
          this.panel?.webview.postMessage({ command: 'attachmentBadge', count: 0 });
          this.addMessage('assistant', 'Chat cleared. How can I help secure your code?');
        } else if (message.command === 'codingModelChanged') {
          const config = vscode.workspace.getConfiguration('ciphermate');
          await config.update('ai.codingModel', message.model, vscode.ConfigurationTarget.Global);
          // Update AgenticCore's provider model for subsequent coding requests
          this.agenticCore.updateCodingModel?.(message.model);
          vscode.window.showInformationMessage(`Coding model set to ${message.model}`);
        } else if (message.command === 'openSettings') {
          vscode.commands.executeCommand('ciphermate.advancedSettings');
        } else if (message.command === 'showResults') {
          vscode.commands.executeCommand('ciphermate.showResults');
        } else if (message.command === 'goHome') {
          // CRITICAL: Reset processing flag when going home to prevent lockout
          this.isProcessingMessage = false;
          console.log('[EXT] goHome - reset isProcessingMessage to false');

          // Save current session before going home
          console.log('[EXT] goHome - saving session, messages:', this.messageHistory.length);
          if (this.currentSession && this.messageHistory.length > 0) {
            this.currentSession.messages = [...this.messageHistory];
            this.currentSession.updatedAt = new Date();
            this.saveChatSessions();
          } else if (this.messageHistory.length > 0 && !this.currentSession) {
            // Create session from orphan messages
            console.log('[EXT] Creating session from orphan messages');
            this.createNewSession();
            // createNewSession() always sets currentSession, use non-null assertion
            this.currentSession!.messages = [...this.messageHistory];
            this.saveChatSessions();
          }
          // Switch to welcome mode
          this.panel?.webview.postMessage({ command: 'switchToWelcome' });
        } else if (message.command === 'restoreChat') {
          // Restore to most recent session when user clicks "Continue Chat"
          // Prioritize sessions with fixes/scan results (most recently updated)
          const sessions = this.getChatSessions();
          if (sessions.length > 0) {
            const mostRecent = sessions[0];
            this.currentSession = mostRecent;
            this.messageHistory = mostRecent.messages.map((m) => ({
              ...m,
              timestamp: m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp as string)
            }));
            this.loadSession(mostRecent.id);
          } else if (this.messageHistory.length > 0) {
            if (!this.currentSession) {
              this.createNewSession();
            }
            if (this.currentSession) {
              this.currentSession.messages = [...this.messageHistory];
              this.currentSession.updatedAt = new Date();
              this.saveChatSessions();
            }
            this.restoreMessages();
          }
        } else if (message.command === 'getMessageCount') {
          // Send message count to show/hide continue chat button
          this.panel?.webview.postMessage({
            command: 'messageCount',
            count: this.messageHistory.length
          });
        } else if (message.command === 'prepareContinueChat') {
          // Ensure we have a valid session with messages to continue
          console.log('[EXT] prepareContinueChat - messageHistory.length:', this.messageHistory.length, 'currentSession:', !!this.currentSession);
          if (this.messageHistory.length > 0 && !this.currentSession) {
            this.createNewSession();
            // createNewSession() always sets currentSession, use non-null assertion
            this.currentSession!.messages = [...this.messageHistory];
          }
          console.log('[EXT] Prepared session for continuation');
        } else if (message.command === 'openFile') {
          // Open file at specific line from scan results
          const filePath = message.filePath;
          const lineNumber = message.lineNumber || 1;
          console.log('ChatInterface: Opening file:', filePath, 'at line:', lineNumber);

          try {
            const uri = vscode.Uri.file(filePath);
            vscode.workspace.openTextDocument(uri).then(
              (document) => {
                const position = new vscode.Position(lineNumber - 1, 0);
                vscode.window.showTextDocument(document, {
                  selection: new vscode.Range(position, position),
                  viewColumn: vscode.ViewColumn.One,
                  preview: true
                }).then(
                  (editor) => {
                    // Scroll to center the line
                    editor.revealRange(
                      new vscode.Range(lineNumber - 1, 0, lineNumber - 1, 0),
                      vscode.TextEditorRevealType.InCenter
                    );
                  },
                  (showError) => {
                    vscode.window.showErrorMessage(`Failed to display file: ${showError.message}`);
                  }
                );
              },
              (openError) => {
                vscode.window.showErrorMessage(`Could not open file "${filePath}": ${openError.message}`);
              }
            );
          } catch (error: any) {
            vscode.window.showErrorMessage(`Error opening file: ${error.message}`);
          }
        } else if (message.command === 'generateFix') {
          // Generate fix for a vulnerability
          const vulnerability = message.vulnerability;
          if (vulnerability) {
            vscode.commands.executeCommand('ciphermate.generateFix', vulnerability);
          }
        } else if (message.command === 'previewFix') {
          // Show diff preview for a fix
          const fixId = message.fixId;
          if (fixId) {
            vscode.commands.executeCommand('ciphermate.previewFix', fixId);
          }
        } else if (message.command === 'applyFix') {
          // Apply a fix with user confirmation
          const fixId = message.fixId;
          const confirmed = message.confirmed || false;
          if (fixId) {
            vscode.commands.executeCommand('ciphermate.applySelectedFix', fixId, confirmed);
          }
        } else if (message.command === 'undoFix') {
          // Undo last fix
          vscode.commands.executeCommand('ciphermate.undoLastFix');
        } else if (message.command === 'batchFix') {
          // Apply batch fixes
          const vulnerabilityIds = message.vulnerabilityIds;
          if (vulnerabilityIds && vulnerabilityIds.length > 0) {
            vscode.commands.executeCommand('ciphermate.batchFix', vulnerabilityIds);
          }
        } else if (message.command === 'showFixHistory') {
          // Show fix history
          vscode.commands.executeCommand('ciphermate.showFixHistory');
        } else {
          console.warn('ChatInterface: Unknown command:', message.command);
        }
      } catch (error) {
        console.error('ChatInterface: Error handling message:', error);
        vscode.window.showErrorMessage(`Error processing message: ${error}`);
      }
    });
  }

  /**
   * Native file picker + read in extension host (avoids webview postMessage size / clone limits).
   */
  private async pickChatImagesFromHost(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: true,
      openLabel: 'Attach',
      filters: { Images: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
      title: 'Attach images for CipherMate'
    });
    if (!uris?.length) {
      return;
    }
    const maxBytes = 5 * 1024 * 1024;
    const maxFiles = 6;
    const next: Array<{ mimeType: string; base64: string }> = [...this.pendingHostImages];
    for (const uri of uris.slice(0, maxFiles)) {
      try {
        const buf = await vscode.workspace.fs.readFile(uri);
        if (buf.length > maxBytes) {
          void vscode.window.showWarningMessage(`Skipped (max 5 MB per file): ${uri.fsPath}`);
          continue;
        }
        const lower = uri.fsPath.toLowerCase();
        const mime = lower.endsWith('.png')
          ? 'image/png'
          : lower.endsWith('.gif')
            ? 'image/gif'
            : lower.endsWith('.webp')
              ? 'image/webp'
              : 'image/jpeg';
        next.push({ mimeType: mime, base64: Buffer.from(buf).toString('base64') });
      } catch (e) {
        console.error('CipherMate: failed to read image', uri.fsPath, e);
      }
    }
    this.pendingHostImages = next;
    this.panel?.webview.postMessage({ command: 'attachmentBadge', count: this.pendingHostImages.length });
  }

  private getChatHtml(): string {
    const config = vscode.workspace.getConfiguration('ciphermate');
    const currentCodingModel = config.get<string>('ai.codingModel', 'anthropic/claude-sonnet-4');
    const codingModels = [
      { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' },
      { id: 'openrouter/free', label: 'OpenRouter Free (free tier)' },
      { id: 'deepseek/deepseek-chat-v3', label: 'DeepSeek V3 (budget)' },
      { id: 'openai/gpt-4o', label: 'GPT-4o (balanced)' },
      { id: 'openai/gpt-4-turbo', label: 'GPT-4 Turbo' },
      { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
      { id: 'meta-llama/llama-3.1-70b-instruct', label: 'Llama 3.1 70B' },
    ];
    const codingModelOptions = codingModels.map(m =>
      `<option value="${m.id}" ${m.id === currentCodingModel ? 'selected' : ''}>${m.label}</option>`
    ).join('');
    // CipherMate logo: only use files that exist under images/ (icon.svg is the bundled mark)
    const imagesFsPath = path.join(this.context.extensionUri.fsPath, 'images');
    const logoFileNames = ['icon.svg', 'icon.png', 'cm 3.png', 'ciphermate-logo.png'] as const;
    let ciphermateLogoFile: string | undefined;
    for (const name of logoFileNames) {
      if (fs.existsSync(path.join(imagesFsPath, name))) {
        ciphermateLogoFile = name;
        break;
      }
    }
    const logoUri =
      ciphermateLogoFile && this.panel
        ? this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'images', ciphermateLogoFile)
          )
        : '';
    const assistantAvatarJson = JSON.stringify(logoUri ? logoUri.toString() : '');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CipherMate</title>
    <style>
        ${getDesignTokensCSS()}
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
            background: var(--cm-accent);
            color: var(--cm-accent-text);
            border: 1px solid var(--cm-accent-dim);
            cursor: pointer;
            font-weight: 500;
            font-size: 15px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
            flex-shrink: 0;
            border-radius: 0 !important;
            -webkit-border-radius: 0 !important;
            -moz-border-radius: 0 !important;
            min-height: 36px;
            box-shadow: 0 1px 3px var(--cm-accent-glow);
        }
        
        .send-button-main span {
            font-weight: 500;
        }

        .send-button-main:hover {
            background: var(--cm-accent-dim);
            border-color: var(--cm-accent-dim);
            box-shadow: 0 2px 8px var(--cm-accent-glow);
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
            color: var(--cm-accent);
            font-size: 16px;
            font-weight: 600;
            transition: color 0.2s ease, transform 0.2s ease;
        }

        .use-own-model:hover .use-own-model-arrow {
            color: var(--cm-accent-dim);
            transform: translateX(2px);
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
            gap: 20px;
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
            position: relative;
            padding: 4px 0;
        }

        /* Tool-like styling - more compact, professional (no !important on bg/border so assistant brown can apply) */
        .message-content {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px !important;
            padding: 10px 14px !important;
            font-family: var(--vscode-editor-font-family) !important;
            font-size: var(--vscode-editor-font-size) !important;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .message.user .message-content {
            background: var(--vscode-button-background) !important;
            color: var(--vscode-button-foreground) !important;
            border-color: var(--vscode-button-border) !important;
        }

        /* Citations — wrap/scroll so long paths are never clipped */
        .message-citations {
            margin-top: 6px;
            padding: 8px 10px;
            background: var(--vscode-textBlockQuote-background);
            border-left: 2px solid var(--vscode-textLink-foreground);
            border-radius: 4px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            font-family: var(--vscode-editor-font-family);
            opacity: 1;
            max-height: min(38vh, 320px);
            overflow-x: auto;
            overflow-y: auto;
            overflow-wrap: anywhere;
            word-break: break-word;
            box-sizing: border-box;
        }

        .message-citations.show {
            margin-top: 8px;
        }

        .message-citations strong {
            color: var(--vscode-textLink-foreground);
            margin-right: 6px;
            display: block;
            margin-bottom: 4px;
        }

        .cm-sources-list {
            margin: 4px 0 0 0;
            padding-left: 18px;
            list-style-type: disc;
        }

        .cm-sources-list li {
            margin: 4px 0;
            line-height: 1.45;
        }

        /* Reply / ref rail — outside the bubble (row: avatar | bubble | rail; user uses row-reverse → rail left of bubble) */
        .message-actions {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
            width: 32px;
            padding-top: 10px;
            box-sizing: border-box;
            opacity: 0.45;
            transition: opacity 0.2s ease;
        }

        .message:hover .message-actions {
            opacity: 1;
        }

        .message-action-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: var(--vscode-editor-background) !important;
            color: var(--vscode-icon-foreground) !important;
            border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)) !important;
            border-radius: 6px !important;
            padding: 0 !important;
            min-width: 30px;
            min-height: 30px;
            font-size: 12px !important;
            cursor: pointer;
            transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }

        .message-action-btn:hover {
            background: var(--vscode-toolbar-hoverBackground) !important;
            border-color: var(--vscode-focusBorder) !important;
            color: var(--vscode-textLink-foreground) !important;
        }

        .message-action-btn:focus-visible {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: 2px;
        }

        .message-action-btn.reply-btn svg {
            display: block;
        }

        .message-action-btn.ref-btn {
            background: transparent !important;
            border-color: transparent !important;
            min-width: 28px;
            min-height: 28px;
        }

        .message-action-btn.ref-btn:hover {
            background: var(--vscode-toolbar-hoverBackground) !important;
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

        /* Brand copper/brown tile — matches send → */
        .message.assistant .message-avatar {
            background: var(--cm-accent);
            border: 1px solid var(--cm-accent-dim);
            color: var(--cm-accent-text);
            padding: 5px;
            overflow: hidden;
            box-sizing: border-box;
            box-shadow: 0 1px 3px var(--cm-accent-glow);
        }

        /* Light mark on brown tile */
        .message.assistant .message-avatar .cm-assistant-avatar-img {
            width: 22px;
            height: 22px;
            border-radius: 0;
            object-fit: contain;
            display: block;
            background: transparent;
            filter: brightness(0) invert(1);
            opacity: 0.95;
        }

        .message-content {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-panel-border);
            padding: 14px 18px;
            line-height: 1.6;
            word-wrap: break-word;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
        }

        .message.user .message-content {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .message.assistant .message-content {
            background: color-mix(in srgb, var(--cm-accent) 16%, var(--vscode-input-background)) !important;
            border-color: color-mix(in srgb, var(--cm-accent) 45%, var(--vscode-panel-border)) !important;
            border-left: 4px solid var(--cm-accent) !important;
            box-shadow: 0 1px 4px var(--cm-accent-glow) !important;
        }

        @supports not (background: color-mix(in srgb, red, blue)) {
            .message.assistant .message-content {
                background: var(--vscode-input-background) !important;
                box-shadow: inset 4px 0 0 0 var(--cm-accent), 0 1px 4px var(--cm-accent-glow) !important;
            }
        }

        /* Markdown code block — scrollable body + toolbar (copy) */
        .code-block-wrap {
            margin: 10px 0;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            overflow: hidden;
            background: var(--vscode-editor-background);
        }
        .code-block-toolbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
            padding: 4px 8px;
            background: var(--vscode-sideBarSectionHeader-background, var(--vscode-sideBar-background));
            border-bottom: 1px solid var(--vscode-panel-border);
            font-family: var(--vscode-font-family);
            font-size: calc(var(--vscode-font-size) * 0.92);
            color: var(--vscode-descriptionForeground);
        }
        .code-block-lang {
            text-transform: lowercase;
            opacity: 0.9;
        }
        .cm-code-copy-btn {
            background: var(--vscode-button-secondaryBackground) !important;
            color: var(--vscode-button-secondaryForeground) !important;
            border: 1px solid var(--vscode-button-border) !important;
            border-radius: 3px;
            padding: 2px 10px;
            font-size: 11px;
            cursor: pointer;
        }
        .cm-code-copy-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground) !important;
        }
        .code-block-wrap .code-block {
            margin: 0;
            max-height: min(55vh, 420px);
            overflow: auto;
            border: none;
            border-radius: 0;
            padding: 12px;
        }

        /* File edit diff (Cursor-style) — only toolbar opens file; body is selectable */
        .cm-diff-panel {
            cursor: default;
            margin-top: 10px;
        }
        .cm-diff-panel .code-block-toolbar.cm-diff-open-target {
            cursor: pointer;
        }
        .cm-diff-panel .code-block-toolbar.cm-diff-open-target:focus-visible {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: -1px;
        }
        .cm-diff-panel .cm-code-copy-btn {
            cursor: pointer;
        }
        .cm-diff-view {
            margin: 0 !important;
            padding: 8px 10px !important;
            font-family: var(--vscode-editor-font-family, monospace) !important;
            font-size: calc(var(--vscode-editor-font-size, 12px) * 0.95) !important;
            line-height: 1.45 !important;
            white-space: pre-wrap;
            word-break: break-word;
            cursor: text;
            user-select: text;
            -webkit-user-select: text;
        }
        #cmDiffCtxMenu {
            position: fixed;
            z-index: 100000;
            min-width: 220px;
            background: var(--vscode-menu-background);
            color: var(--vscode-menu-foreground);
            border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border));
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
            padding: 4px 0;
            font-family: var(--vscode-font-family);
            font-size: 13px;
        }
        #cmDiffCtxMenu .cm-ctx-item {
            padding: 6px 14px;
            cursor: pointer;
            white-space: nowrap;
        }
        #cmDiffCtxMenu .cm-ctx-item:hover {
            background: var(--vscode-menu-selectionBackground, var(--vscode-list-activeSelectionBackground));
            color: var(--vscode-menu-selectionForeground, var(--vscode-list-activeSelectionForeground));
        }
        .cm-diff-line {
            display: block;
            padding: 1px 4px;
            margin: 0;
        }
        .cm-diff-line code {
            background: transparent !important;
            padding: 0 !important;
            color: inherit !important;
            font-family: inherit !important;
            white-space: pre-wrap;
            word-break: break-word;
        }
        .cm-diff-prefix {
            display: inline-block;
            width: 1em;
            opacity: 0.75;
            user-select: none;
            margin-right: 6px;
        }
        .cm-diff-del {
            background: color-mix(in srgb, var(--vscode-charts-red, #f14c4c) 22%, transparent);
        }
        .cm-diff-add {
            background: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground, #73c991) 24%, transparent);
        }
        .cm-diff-same {
            background: transparent;
            opacity: 0.92;
        }

        .code-block {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 12px;
            margin: 8px 0;
            overflow-x: auto;
            font-family: var(--vscode-editor-font-family, 'Consolas', 'Monaco', 'Courier New', monospace);
            font-size: var(--vscode-editor-font-size, 12px);
            line-height: 1.5;
        }

        .code-block code {
            background: transparent;
            padding: 0;
            color: var(--vscode-editor-foreground);
        }

        .inline-code {
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family, 'Consolas', 'Monaco', 'Courier New', monospace);
            font-size: 0.9em;
        }

        .message-content strong {
            font-weight: 600;
            color: var(--vscode-textLink-foreground);
        }

        .message-content em {
            font-style: italic;
        }

        .message-content ul,
        .message-content ol {
            margin: 12px 0;
            padding-left: 24px;
        }

        .message-content ul {
            list-style-type: disc;
        }

        .message-content ol {
            list-style-type: decimal;
        }

        .message-content li {
            margin: 6px 0;
            line-height: 1.6;
        }

        .message-content li ul,
        .message-content li ol {
            margin: 6px 0;
        }

        .message-content p {
            margin: 10px 0;
        }

        .message-content a {
            color: var(--vscode-textLink-foreground);
            text-decoration: underline;
        }

        .message-content a:hover {
            color: var(--vscode-textLink-activeForeground);
        }

        /* Severity badges */
        .severity-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            margin-right: 6px;
        }
        .severity-badge.critical { background: #dc3545; color: white; }
        .severity-badge.high { background: #fd7e14; color: white; }
        .severity-badge.medium { background: #ffc107; color: black; }
        .severity-badge.low { background: #28a745; color: white; }
        .severity-badge.info { background: #17a2b8; color: white; }

        /* Fix buttons for vulnerabilities */
        .fix-vuln-btn {
            display: inline-block;
            padding: 2px 8px;
            margin-left: 8px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
            text-decoration: none;
            vertical-align: middle;
        }
        .fix-vuln-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .fix-vuln-btn:active {
            transform: translateY(1px);
        }
        .fix-vuln-btn.generating {
            opacity: 0.7;
            cursor: wait;
        }

        /* Vulnerability finding row */
        .vuln-finding {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 4px;
            margin: 4px 0;
            padding: 4px 0;
        }
        .vuln-finding .vuln-location {
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
        }
        .vuln-finding .vuln-description {
            flex: 1;
            min-width: 200px;
        }

        /* Clickable file paths */
        .file-path-link {
            font-family: var(--vscode-editor-font-family);
            background: var(--vscode-editor-background);
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 0.85em;
            color: var(--vscode-textLink-foreground);
            cursor: pointer;
            text-decoration: underline;
            text-decoration-style: dotted;
            transition: all 0.15s ease;
            display: inline-block;
        }

        .file-path-link:hover {
            background: var(--vscode-editor-selectionBackground);
            text-decoration-style: solid;
            opacity: 1;
        }

        .file-path-link:active {
            opacity: 0.8;
        }

        /* Section dividers */
        .section-divider {
            border: none;
            border-top: 1px solid var(--vscode-panel-border);
            margin: 16px 0;
        }

        /* Stat numbers */
        .stat-critical { color: #dc3545; font-weight: 600; }
        .stat-high { color: #fd7e14; font-weight: 600; }
        .stat-medium { color: #ffc107; font-weight: 600; }

        /* Finding lists */
        .finding-list {
            list-style: none;
            padding-left: 0;
            margin: 8px 0;
        }
        .finding-list li {
            padding: 8px 12px;
            background: var(--vscode-editor-background);
            border-left: 3px solid var(--vscode-panel-border);
            margin: 4px 0;
            border-radius: 0 4px 4px 0;
        }

        /* Headers with better spacing */
        .message-content h2, .message-content h3, .message-content h4, .message-content h5 {
            margin-top: 20px;
            margin-bottom: 10px;
            color: var(--vscode-foreground);
        }
        .message-content h2 { font-size: 1.3em; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 4px; }
        .message-content h3 { font-size: 1.15em; }
        .message-content h4 { font-size: 1.05em; }
        .message-content h5 { font-size: 1em; color: var(--vscode-descriptionForeground); }

        .thinking {
            display: none;
            flex-direction: column;
            padding: 16px 20px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-panel-border);
            border-left: 3px solid var(--vscode-textLink-foreground);
            margin: 8px 0;
            gap: 8px;
            font-family: 'Courier New', 'Monaco', 'Menlo', monospace;
            font-size: 13px;
            color: var(--vscode-foreground);
            opacity: 0;
            transition: opacity 0.2s ease;
        }

        .thinking.active {
            display: flex !important;
            opacity: 1 !important;
            visibility: visible !important;
        }

        .thinking-header {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .thinking-citations {
            display: none;
            margin-top: 4px;
            padding: 8px 12px;
            background: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-textLink-foreground);
            border-radius: 4px;
            max-height: min(28vh, 200px);
            overflow: auto;
            overflow-wrap: anywhere;
            word-break: break-word;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            transition: opacity 0.3s;
        }

        .thinking-citations.show {
            display: block;
            opacity: 1;
        }

        .thinking-actions {
            display: flex;
            flex-direction: column;
            gap: 4px;
            margin-top: 4px;
        }

        .thinking-action {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            padding: 6px 10px;
            background: var(--vscode-textBlockQuote-background);
            border-radius: 4px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-4px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .thinking-action-icon {
            font-size: 12px;
            flex-shrink: 0;
        }

        .thinking-action-text {
            flex: 1;
        }

        .thinking-action-details {
            font-size: 10px;
            opacity: 0.7;
            margin-left: 20px;
            margin-top: 2px;
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
            min-height: 1.4em;
            line-height: 1.4;
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

        /* Pending context chips (from diff right-click) — above the chat bar */
        .cm-context-strip-outer {
            margin-bottom: 10px;
        }
        .cm-context-strip-toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            margin-bottom: 6px;
            padding: 0 2px;
        }
        .cm-context-strip-label {
            font-size: 11px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }
        .cm-context-strip-clear {
            font-size: 11px;
            padding: 3px 10px;
            cursor: pointer;
            border-radius: 4px;
            border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .cm-context-strip-clear:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .cm-context-chips {
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-height: min(42vh, 280px);
            overflow-y: auto;
        }
        .cm-ctx-chip {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            background: color-mix(in srgb, var(--vscode-input-background) 92%, var(--cm-accent) 8%);
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.12);
        }
        .cm-ctx-chip-banner {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 10px;
            background: var(--vscode-sideBarSectionHeader-background, var(--vscode-sideBar-background));
            border-bottom: 1px solid var(--vscode-panel-border);
            font-size: 11px;
        }
        .cm-ctx-chip-badge {
            text-transform: uppercase;
            letter-spacing: 0.06em;
            font-size: 9px;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 999px;
            background: color-mix(in srgb, var(--cm-accent) 35%, transparent);
            color: var(--cm-accent-text, var(--vscode-badge-foreground));
            border: 1px solid color-mix(in srgb, var(--cm-accent) 50%, var(--vscode-panel-border));
        }
        .cm-ctx-chip-file {
            font-weight: 600;
            color: var(--vscode-foreground);
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .cm-ctx-chip-legend {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            cursor: help;
            flex-shrink: 0;
        }
        .cm-ctx-chip-remove {
            background: transparent;
            border: none;
            color: var(--vscode-descriptionForeground);
            cursor: pointer;
            font-size: 18px;
            line-height: 1;
            padding: 0 4px;
            border-radius: 4px;
        }
        .cm-ctx-chip-remove:hover {
            color: var(--vscode-errorForeground);
            background: color-mix(in srgb, var(--vscode-errorForeground) 12%, transparent);
        }
        .cm-ctx-chip-body {
            max-height: 160px;
            overflow: auto;
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 11px;
            line-height: 1.4;
            padding: 4px 0;
        }
        .cm-ctx-diff-row {
            display: grid;
            grid-template-columns: 2.2em 2.2em 1fr;
            gap: 6px;
            align-items: start;
            padding: 2px 8px;
            border-left: 3px solid transparent;
        }
        .cm-ctx-diff-row.cm-ctx-kind-del {
            border-left-color: color-mix(in srgb, var(--vscode-charts-red, #f14c4c) 70%, transparent);
            background: color-mix(in srgb, var(--vscode-charts-red, #f14c4c) 10%, transparent);
        }
        .cm-ctx-diff-row.cm-ctx-kind-add {
            border-left-color: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground, #73c991) 75%, transparent);
            background: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground, #73c991) 12%, transparent);
        }
        .cm-ctx-diff-row.cm-ctx-kind-same {
            border-left-color: transparent;
            opacity: 0.88;
        }
        .cm-ctx-diff-row.cm-ctx-kind-note {
            grid-column: 1 / -1;
            border-left-color: var(--vscode-panel-border);
            background: color-mix(in srgb, var(--vscode-descriptionForeground) 8%, transparent);
            font-style: italic;
            color: var(--vscode-descriptionForeground);
            font-size: 10px;
            padding: 6px 8px;
        }
        .cm-ctx-ln {
            text-align: right;
            user-select: none;
            font-variant-numeric: tabular-nums;
            flex-shrink: 0;
        }
        .cm-ctx-ln-old {
            color: color-mix(in srgb, var(--vscode-charts-red, #f14c4c) 85%, var(--vscode-descriptionForeground));
            font-weight: 600;
        }
        .cm-ctx-ln-new {
            color: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground, #73c991) 85%, var(--vscode-descriptionForeground));
            font-weight: 600;
        }
        .cm-ctx-ln-mute {
            color: var(--vscode-descriptionForeground);
            opacity: 0.45;
            font-weight: 400;
        }
        .cm-ctx-code {
            white-space: pre-wrap;
            word-break: break-word;
            user-select: text;
            color: var(--vscode-editor-foreground);
        }

        #attachImageBtn {
            width: 40px;
            height: 40px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }

        #attachImageBtn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        #sendButton {
            width: 40px;
            height: 40px;
            background: var(--cm-accent);
            color: var(--cm-accent-text);
            border: 1px solid var(--cm-accent-dim);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
            border-radius: 0 !important;
            -webkit-border-radius: 0 !important;
            -moz-border-radius: 0 !important;
            font-size: 18px;
            box-shadow: 0 1px 3px var(--cm-accent-glow);
        }

        #sendButton:hover {
            background: var(--cm-accent-dim);
            border-color: var(--cm-accent-dim);
            box-shadow: 0 2px 8px var(--cm-accent-glow);
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
    <script>
        // DIAGNOSTIC: Immediate DOM check before any other scripts
        (function() {
            const runDiagnostic = function() {
                const diagnostic = {
                    timestamp: new Date().toISOString(),
                    location: 'body-onload',
                    readyState: document.readyState,
                    bodyExists: !!document.body,
                    bodyChildCount: document.body ? document.body.children.length : 0,
                    bodyInnerHTMLLength: document.body ? document.body.innerHTML.length : 0,
                    elements: {
                        messages: !!document.getElementById('messages'),
                        thinking: !!document.getElementById('thinking'),
                        welcomeScreen: !!document.querySelector('.welcome-screen'),
                        header: !!document.querySelector('.header'),
                        inputArea: !!document.querySelector('.input-area'),
                        chatInput: !!document.getElementById('chatInput'),
                        messageInput: !!document.getElementById('messageInput')
                    },
                    bodyClasses: document.body ? document.body.className : '',
                    firstChildTag: document.body && document.body.firstElementChild ?
                        document.body.firstElementChild.tagName : 'none',
                    allChildTags: document.body ?
                        Array.from(document.body.children).map(c => c.tagName + (c.id ? '#' + c.id : '') + (c.className ? '.' + c.className.split(' ')[0] : '')).join(', ') : 'none'
                };

                console.log('=== CIPHERMATE WEBVIEW DIAGNOSTIC ===');
                console.log(JSON.stringify(diagnostic, null, 2));

                // Send to extension host
                try {
                    const vscode = acquireVsCodeApi();
                    vscode.postMessage({
                        command: 'diagnostic',
                        data: diagnostic
                    });
                } catch (e) {
                    console.error('Failed to send diagnostic:', e);
                }
            };

            // Run diagnostic after DOM is fully loaded
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', runDiagnostic);
            } else {
                runDiagnostic();
            }

            // Also run after a short delay to catch any async issues
            setTimeout(runDiagnostic, 500);
        })();
    </script>
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
                <div class="quick-action" data-action="fix vulnerabilities">Fix Vulnerabilities</div>
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
            <div class="thinking-header">
                <div class="thinking-gear">
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12A3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5a3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97c0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.4-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1c0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z"/>
                    </svg>
                </div>
                <span class="thinking-text">Processing<span class="thinking-dots">...</span></span>
            </div>
            <div class="thinking-citations" id="thinkingCitations"></div>
            <div class="thinking-actions" id="thinkingActions"></div>
        </div>
    </div>

    <div class="input-area">
        <div id="replyContextPanel" style="display: none; margin-bottom: 8px; padding: 10px 12px; background: var(--vscode-textBlockQuote-background); border-left: 4px solid var(--vscode-textLink-foreground); border-radius: 4px; font-size: 12px; color: var(--vscode-descriptionForeground);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <strong>Replying with context</strong>
                <button id="cancelReplyBtn" type="button" style="background: transparent; border: none; cursor: pointer; color: var(--vscode-foreground); font-size: 11px;">Cancel</button>
            </div>
            <div id="replyContextSummary" style="max-height: 60px; overflow-y: auto;"></div>
        </div>
        <div id="attachPreview" style="display: none; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; font-size: 11px; color: var(--vscode-descriptionForeground);"></div>
        <div id="cmContextStripOuter" class="cm-context-strip-outer" style="display: none;" aria-label="Context attached to next message">
            <div class="cm-context-strip-toolbar">
                <span class="cm-context-strip-label">Attached context</span>
                <button type="button" id="cmClearAllContextBtn" class="cm-context-strip-clear" title="Remove all diff context from the next message">Clear all</button>
            </div>
            <div id="cmContextChips" class="cm-context-chips"></div>
        </div>
        <form id="chatForm">
        <div class="input-container">
            <input type="file" id="imageAttachInput" accept="image/*" multiple style="display:none" tabindex="-1" aria-hidden="true" />
            <button type="button" id="attachImageBtn" title="Attach images (VS Code file picker). Shift+click: attach from browser." aria-label="Attach images">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            </button>
            <div class="input-wrapper">
                    <input 
                        type="text"
                    id="messageInput" 
                    placeholder="Type your request... "
                        autocomplete="off"
                    />
            </div>
                <button id="stopButton" type="button" aria-label="Stop and return message to input" title="Stop reply process and return message to input for editing" style="display: none; padding: 8px 12px; background: var(--vscode-button-secondaryBackground); border: 1px solid var(--vscode-button-border); border-radius: 4px; cursor: pointer; font-size: 12px; align-items: center; color: var(--vscode-button-foreground);">
                <span style="font-size: 14px;">⏹ Stop</span>
            </button>
                <button id="sendButton" type="submit" aria-label="Send message">
                <span style="font-size: 18px;">→</span>
            </button>
        </div>
        </form>
        <div class="coding-model-selector" style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 12px; color: var(--vscode-descriptionForeground);">
            <label for="codingModelSelect">Coding model:</label>
            <select id="codingModelSelect" style="flex: 1; max-width: 280px; padding: 6px 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); font-size: 12px;">
                ${codingModelOptions}
            </select>
        </div>
        <div class="quick-actions">
            <div class="quick-action" data-action="scan my repository">Scan Repository</div>
            <div class="quick-action" data-action="find hardcoded secrets">Find Secrets</div>
            <div class="quick-action" data-action="scan smart contracts">Scan Contracts</div>
            <div class="quick-action" data-action="check dependencies">Check Dependencies</div>
            <div class="quick-action" data-action="fix vulnerabilities">Fix Vulnerabilities</div>
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
            const quickActions = document.querySelectorAll('.input-area .quick-actions .quick-action');
            const welcomeQuickActions = document.querySelectorAll('.welcome-quick-actions .quick-action');
            const chatInput = document.getElementById('chatInput');
            const sendButtonMain = document.getElementById('sendButtonMain');
            const rotatingPlaceholder = document.getElementById('rotatingPlaceholder');
            const useOwnModel = document.getElementById('useOwnModel');
            const continueChatBtn = document.getElementById('continueChat');
            const backButton = document.getElementById('backButton');
            const codingModelSelect = document.getElementById('codingModelSelect');
            const body = document.body;
            
            if (codingModelSelect) {
                codingModelSelect.addEventListener('change', function() {
                    if (vscode && typeof vscode.postMessage === 'function') {
                        vscode.postMessage({ command: 'codingModelChanged', model: codingModelSelect.value });
                    }
                });
            }
            
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

            if (!window.__cmCodeCopyBound) {
                window.__cmCodeCopyBound = true;
                document.body.addEventListener('click', function(e) {
                    var t = e.target;
                    if (!t || !t.classList || !t.classList.contains('cm-code-copy-btn')) return;
                    e.preventDefault();
                    e.stopPropagation();
                    var wrap = t.closest && t.closest('.code-block-wrap');
                    if (!wrap) return;
                    if (wrap.classList.contains('cm-diff-panel') && wrap.__cmCopyNewFile) {
                        var dtxt = wrap.__cmCopyNewFile;
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                            navigator.clipboard.writeText(dtxt).then(function() {
                                var o = t.textContent;
                                t.textContent = 'Copied';
                                setTimeout(function() { t.textContent = o || 'Copy'; }, 1600);
                            });
                        }
                        return;
                    }
                    var codeEl = wrap.querySelector('pre.code-block code');
                    if (!codeEl) return;
                    var txt = codeEl.textContent || '';
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(txt).then(function() {
                            var o = t.textContent;
                            t.textContent = 'Copied';
                            setTimeout(function() { t.textContent = o || 'Copy'; }, 1600);
                        });
                    }
                });
            }

            // Add click handler for file path links and fix buttons (event delegation)
            if (messagesContainer) {
                messagesContainer.addEventListener('click', function(e) {
                    var target = e.target;

                    // Handle file path link clicks
                    if (target.classList.contains('file-path-link')) {
                        e.preventDefault();
                        e.stopPropagation();
                        var filePath = target.getAttribute('data-file-path');
                        var lineNumber = parseInt(target.getAttribute('data-line-number')) || 1;
                        console.log('File path clicked:', filePath, 'Line:', lineNumber);
                        if (vscode && typeof vscode.postMessage === 'function') {
                            vscode.postMessage({
                                command: 'openFile',
                                filePath: filePath,
                                lineNumber: lineNumber
                            });
                        }
                        return;
                    }

                    /* Diff panel: only the toolbar row opens the file (not the scrollable body, not Copy). */
                    var diffToolbar = target.closest && target.closest('.cm-diff-panel .cm-diff-open-target');
                    if (diffToolbar) {
                        if (target.closest && target.closest('.cm-code-copy-btn')) return;
                        e.preventDefault();
                        e.stopPropagation();
                        var diffPanel = diffToolbar.closest('.cm-diff-panel');
                        var fp = diffPanel && diffPanel.getAttribute('data-file-path');
                        if (fp && vscode && typeof vscode.postMessage === 'function') {
                            vscode.postMessage({
                                command: 'openFile',
                                filePath: fp,
                                lineNumber: 1
                            });
                        }
                        return;
                    }

                    // Handle fix button clicks
                    if (target.classList.contains('fix-vuln-btn')) {
                        e.preventDefault();
                        e.stopPropagation();

                        // Prevent double-clicks
                        if (target.classList.contains('generating')) {
                            console.log('Fix already generating, ignoring click');
                            return;
                        }

                        var vulnDataStr = target.getAttribute('data-vulnerability');
                        if (!vulnDataStr) {
                            console.error('No vulnerability data found on fix button');
                            return;
                        }

                        try {
                            var vulnerability = JSON.parse(vulnDataStr.replace(/&quot;/g, '"'));
                            console.log('Fix button clicked for vulnerability:', vulnerability);

                            // Update button state
                            target.classList.add('generating');
                            target.textContent = 'Fixing...';

                            if (vscode && typeof vscode.postMessage === 'function') {
                                vscode.postMessage({
                                    command: 'generateFix',
                                    vulnerability: vulnerability
                                });
                            }

                            // Reset button after a delay (the actual fix will take time)
                            setTimeout(function() {
                                target.classList.remove('generating');
                                target.textContent = 'Fix';
                            }, 3000);
                        } catch (parseError) {
                            console.error('Failed to parse vulnerability data:', parseError);
                        }
                        return;
                    }
                });

                messagesContainer.addEventListener('keydown', function(e) {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    var tb = e.target && e.target.closest && e.target.closest('.cm-diff-open-target');
                    if (!tb || !tb.closest('.cm-diff-panel')) return;
                    if (e.target.closest && e.target.closest('.cm-code-copy-btn')) return;
                    e.preventDefault();
                    var panel = tb.closest('.cm-diff-panel');
                    var fp = panel && panel.getAttribute('data-file-path');
                    if (fp && vscode && typeof vscode.postMessage === 'function') {
                        vscode.postMessage({
                            command: 'openFile',
                            filePath: fp,
                            lineNumber: 1
                        });
                    }
                });

                function cmDiffCtxRemoveListeners() {
                    document.removeEventListener('click', cmDiffCtxOutside, true);
                    document.removeEventListener('contextmenu', cmDiffCtxOutside, true);
                    document.removeEventListener('keydown', cmDiffCtxEsc, true);
                }
                function cmDiffCtxOutside(ev) {
                    var m = document.getElementById('cmDiffCtxMenu');
                    if (m && ev.target && m.contains(ev.target)) return;
                    cmHideDiffContextMenu();
                }
                function cmDiffCtxEsc(ev) {
                    if (ev.key === 'Escape') cmHideDiffContextMenu();
                }
                function cmHideDiffContextMenu() {
                    cmDiffCtxRemoveListeners();
                    var m = document.getElementById('cmDiffCtxMenu');
                    if (m) m.remove();
                }

                function cmShowDiffContextMenu(clientX, clientY, preEl) {
                    cmHideDiffContextMenu();
                    var menu = document.createElement('div');
                    menu.id = 'cmDiffCtxMenu';
                    var item = document.createElement('div');
                    item.className = 'cm-ctx-item';
                    item.textContent = 'Add to CipherMate context';
                    item.setAttribute('role', 'menuitem');
                    var base =
                        (preEl.getAttribute('data-cm-diff-file-label') || 'file').replace(/]/g, '');
                    item.addEventListener('mousedown', function(ev) {
                        ev.preventDefault();
                        ev.stopPropagation();
                    });
                    item.addEventListener('click', function(ev) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        var selTxt = '';
                        try {
                            selTxt = window.getSelection().toString();
                        } catch (err2) {}
                        var hasSelection = !!(selTxt && selTxt.trim());
                        cmAppendDiffContextChip(preEl, base, hasSelection);
                        cmHideDiffContextMenu();
                    });
                    menu.appendChild(item);
                    document.body.appendChild(menu);
                    var nx = clientX;
                    var ny = clientY;
                    requestAnimationFrame(function() {
                        var rect = menu.getBoundingClientRect();
                        if (nx + rect.width > window.innerWidth - 6) {
                            nx = Math.max(6, window.innerWidth - rect.width - 6);
                        }
                        if (ny + rect.height > window.innerHeight - 6) {
                            ny = Math.max(6, window.innerHeight - rect.height - 6);
                        }
                        menu.style.left = nx + 'px';
                        menu.style.top = ny + 'px';
                    });
                    setTimeout(function() {
                        document.addEventListener('click', cmDiffCtxOutside, true);
                        document.addEventListener('contextmenu', cmDiffCtxOutside, true);
                        document.addEventListener('keydown', cmDiffCtxEsc, true);
                    }, 0);
                }
                messagesContainer.addEventListener('contextmenu', function(e) {
                    var pre = e.target.closest && e.target.closest('.cm-diff-view');
                    if (!pre || !pre.closest('.cm-diff-panel')) return;
                    e.preventDefault();
                    e.stopPropagation();
                    cmShowDiffContextMenu(e.clientX, e.clientY, pre);
                });
            }

            // GLOBAL EVENT DELEGATION for quick actions, back button, and other buttons
            // This ensures clicks work even when DOM elements are cloned/replaced
            console.log('[DELEGATE] Setting up global event delegation...');
            document.addEventListener('click', function(e) {
                // Block clicks during mode transitions to prevent race conditions
                if (isModeSwitching) {
                    console.log('[DELEGATE] Click ignored - mode switch in progress');
                    return;
                }

                var target = e.target;

                // Handle quick action clicks (both welcome screen and chat mode)
                if (target.classList && target.classList.contains('quick-action')) {
                    e.preventDefault();
                    e.stopPropagation();
                    var actionText = target.getAttribute('data-action');
                    console.log('[DELEGATE] Quick action clicked via delegation:', actionText);
                    handleQuickActionClick(target, actionText);
                    return;
                }

                // Handle back button clicks (check both element and its parent for SVG icons)
                if (target.id === 'backButton' || (target.closest && target.closest('#backButton'))) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[DELEGATE] Back button clicked via delegation');
                    switchToWelcomeMode();
                    if (vscode && typeof vscode.postMessage === 'function') {
                        vscode.postMessage({
                            command: 'goHome'
                        });
                    }
                    return;
                }

                // Handle "Configure AI Provider" button clicks
                if (target.id === 'useOwnModel' || (target.closest && target.closest('#useOwnModel'))) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[DELEGATE] Configure AI Provider clicked via delegation');
                    if (vscode && typeof vscode.postMessage === 'function') {
                        vscode.postMessage({
                            command: 'openSettings'
                        });
                    }
                    return;
                }

                // Handle "Continue Chat" button clicks
                if (target.id === 'continueChat' || (target.closest && target.closest('#continueChat'))) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[DELEGATE] Continue Chat clicked via delegation');

                    // First tell extension to prepare the session for continuation
                    if (vscode && typeof vscode.postMessage === 'function') {
                        vscode.postMessage({ command: 'prepareContinueChat' });
                    }

                    // Then switch to chat mode (which will trigger restoreChat)
                    switchToChatMode();
                    return;
                }
            }, true); // Capture phase to catch events early
            console.log('[DELEGATE] Global event delegation set up');

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

            // Mode switching guard to prevent rapid/duplicate mode switches
            let isModeSwitching = false;

            function switchToWelcomeMode() {
            console.log('[MODE] ========================================');
            console.log('[MODE] switchToWelcomeMode() CALLED');
            console.log('[MODE] isModeSwitching:', isModeSwitching);
            console.log('[MODE] ========================================');

            // CRITICAL: ALWAYS remove chat-mode class first, before any guards
            // This ensures the UI is in correct state even if function returns early
            const body = document.body;
            if (body.classList.contains('chat-mode')) {
                body.classList.remove('chat-mode');
                console.log('[MODE] FORCED removal of chat-mode class');
            }

            // CRITICAL: Reset submission flag to allow new submissions after returning to welcome
            isSubmittingWelcome = false;
            console.log('[MODE] Reset isSubmittingWelcome to false');

            // Guard against rapid mode switching for the rest of the UI setup
            if (isModeSwitching) {
                console.log('[MODE] Mode switch already in progress, skipping UI setup but class is removed');
                return;
            }
            isModeSwitching = true;
            console.log('[MODE] isModeSwitching set to true');

            console.log('[MODE] Switching to welcome mode...');

            // Get all elements fresh (body already declared above)
            console.log('[MODE] Got body element:', !!body);
            const welcomeScreen = document.querySelector('.welcome-screen');
            const header = document.querySelector('.header');
            const messagesContainer = document.getElementById('messages');
            const inputArea = document.querySelector('.input-area');
            const chatInput = document.getElementById('chatInput');

            // chat-mode class already removed at top of function

            // CRITICAL: Clear ALL inline styles that were set during chat mode transition
            // This fixes the blank screen issue where z-index: -1 persists
            if (welcomeScreen) {
                console.log('[MODE] Clearing inline styles from welcome screen...');
                welcomeScreen.style.removeProperty('z-index');
                welcomeScreen.style.removeProperty('visibility');
                welcomeScreen.style.removeProperty('opacity');
                welcomeScreen.style.display = 'flex';
                console.log('[MODE] Welcome screen shown with cleared inline styles');
            } else {
                console.error('[MODE] Welcome screen not found!');
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
            console.log('[MODE] Calling updateContinueChatButton()...');
            updateContinueChatButton();
            console.log('[MODE] updateContinueChatButton() returned');

            // Reattach event listeners for welcome screen buttons
            console.log('[MODE] Calling setupWelcomeScreenButtons()...');
            setupWelcomeScreenButtons();
            console.log('[MODE] setupWelcomeScreenButtons() returned');

            console.log('[MODE] Welcome mode activated');

            // Reset mode switching guard after transition completes
            console.log('[MODE] Setting timeout to reset isModeSwitching in 300ms');
            setTimeout(function() {
                isModeSwitching = false;
                console.log('[MODE] isModeSwitching reset to false');
            }, 300);
            console.log('[MODE] switchToWelcomeMode() complete');
        }
        
        function setupWelcomeScreenButtons() {
            console.log('[SETUP] ========================================');
            console.log('[SETUP] setupWelcomeScreenButtons() CALLED');
            console.log('[SETUP] Event delegation handles button clicks - only setting up form handlers');
            console.log('[SETUP] ========================================');

            // Get references to form elements only - buttons are handled by event delegation
            const welcomeQuickActions = document.querySelectorAll('.welcome-quick-actions .quick-action');
            const chatInput = document.getElementById('chatInput');
            const sendButtonMain = document.getElementById('sendButtonMain');
            const welcomeForm = document.getElementById('welcomeForm');

            // Just set cursor style for quick actions (no event handlers - delegation handles clicks)
            if (welcomeQuickActions && welcomeQuickActions.length > 0) {
                console.log('[SETUP] Found', welcomeQuickActions.length, 'welcome quick action buttons - setting cursor style only');
                welcomeQuickActions.forEach(function(action) {
                    action.style.cursor = 'pointer';
                });
            }

            // Set up welcome form submission - forms still need direct handlers
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

                    console.log('[SETUP] Welcome form handlers attached');
                } else {
                    console.log('[SETUP] Welcome form handlers already attached, skipping');
                }
            }

            // Update continue chat button visibility
            console.log('[SETUP] Calling updateContinueChatButton()...');
            updateContinueChatButton();
        }

        function setupChatModeListeners() {
            console.log('Setting up chat mode listeners...');

            // Get FRESH references to chat mode elements
            var chatModeQuickActions = document.querySelectorAll('.input-area .quick-actions .quick-action');
            var sendButton = document.getElementById('sendButton');
            var messageInput = document.getElementById('messageInput');
            var chatForm = document.getElementById('chatForm');

            // Quick action clicks are handled by global event delegation
            // Just set cursor style here
            if (chatModeQuickActions && chatModeQuickActions.length > 0) {
                chatModeQuickActions.forEach(function(action) {
                    action.style.cursor = 'pointer';
                });
            }

            // Setup send button
            if (sendButton && !sendButton.hasAttribute('data-chat-handlers')) {
                sendButton.setAttribute('data-chat-handlers', 'true');
                sendButton.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    sendMessage();
                });
            }

            // Setup message input Enter key
            if (messageInput && !messageInput.hasAttribute('data-chat-handlers')) {
                messageInput.setAttribute('data-chat-handlers', 'true');
                messageInput.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' || e.keyCode === 13) {
                        e.preventDefault();
                        sendMessage();
                    }
                });
            }

            // Setup chat form submit
            if (chatForm && !chatForm.hasAttribute('data-chat-handlers')) {
                chatForm.setAttribute('data-chat-handlers', 'true');
                chatForm.addEventListener('submit', function(e) {
                    e.preventDefault();
                    sendMessage();
                });
            }

            var attachBtn = document.getElementById('attachImageBtn');
            var attachInput = document.getElementById('imageAttachInput');
            if (attachBtn && !attachBtn.hasAttribute('data-chat-handlers')) {
                attachBtn.setAttribute('data-chat-handlers', 'true');
                attachBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    if (e.shiftKey && attachInput) {
                        attachInput.click();
                        return;
                    }
                    if (vscode && typeof vscode.postMessage === 'function') {
                        vscode.postMessage({ command: 'pickChatImages' });
                    } else if (attachInput) {
                        // Fallback (e.g. stripped webview): browser file picker
                        attachInput.click();
                    }
                });
            }
            if (attachInput && !attachInput.hasAttribute('data-chat-handlers')) {
                attachInput.setAttribute('data-chat-handlers', 'true');
                attachInput.addEventListener('change', function() {
                    if (!attachInput.files || !attachInput.files.length) return;
                    var files = Array.prototype.slice.call(attachInput.files);
                    attachInput.value = '';
                    files.forEach(function(file) {
                        if (!file.type || file.type.indexOf('image/') !== 0) return;
                        var reader = new FileReader();
                        reader.onload = function(ev) {
                            var dataUrl = ev.target.result;
                            var img = new Image();
                            img.onload = function() {
                                var maxDim = 1536;
                                var w = img.width, h = img.height;
                                var scale = Math.min(1, maxDim / Math.max(w, h));
                                var nw = Math.max(1, Math.round(w * scale));
                                var nh = Math.max(1, Math.round(h * scale));
                                var canvas = document.createElement('canvas');
                                canvas.width = nw;
                                canvas.height = nh;
                                var ctx = canvas.getContext('2d');
                                ctx.drawImage(img, 0, 0, nw, nh);
                                var jpegUrl = canvas.toDataURL('image/jpeg', 0.85);
                                var comma = jpegUrl.indexOf(',');
                                var b64 = comma >= 0 ? jpegUrl.slice(comma + 1) : '';
                                if (!b64) return;
                                pendingImageAttachments.push({ mimeType: 'image/jpeg', base64: b64 });
                                cmUpdateAttachPreview();
                            };
                            img.src = dataUrl;
                        };
                        reader.readAsDataURL(file);
                    });
                });
            }

            // Back button is handled by global event delegation

            console.log('Chat mode listeners setup complete');
        }

        function switchToChatMode(text) {
            if (!text) text = undefined;
            body.classList.add('chat-mode');

            // CRITICAL: Show chat UI elements that were hidden by switchToWelcomeMode
            const welcomeScreen = document.querySelector('.welcome-screen');
            const header = document.querySelector('.header');
            const messagesContainer = document.getElementById('messages');
            const inputArea = document.querySelector('.input-area');

            // Hide welcome screen
            if (welcomeScreen) {
                welcomeScreen.style.setProperty('display', 'none', 'important');
            }

            // Show header
            if (header) {
                header.style.setProperty('display', 'block', 'important');
            }

            // Show messages container with proper flex layout
            if (messagesContainer) {
                messagesContainer.style.setProperty('display', 'flex', 'important');
                messagesContainer.style.setProperty('flex-direction', 'column', 'important');
                messagesContainer.style.setProperty('flex', '1 1 auto', 'important');
                messagesContainer.style.setProperty('overflow-y', 'auto', 'important');
                messagesContainer.style.setProperty('visibility', 'visible', 'important');
            }

            // Show input area
            if (inputArea) {
                inputArea.style.setProperty('display', 'block', 'important');
            }

            // Reset body styles for chat mode
            body.style.justifyContent = 'flex-start';
            body.style.alignItems = 'stretch';
            body.style.padding = '0';

            // CRITICAL: Re-attach chat mode event listeners
            setupChatModeListeners();

            // Re-query messageInput for fresh reference
            var freshMessageInput = document.getElementById('messageInput');
            if (freshMessageInput) {
                if (text) {
                    freshMessageInput.value = text;
                }
                freshMessageInput.focus();
                if (text) {
                    // Small delay to ensure input is ready
                    setTimeout(function() {
                        sendMessage();
                    }, 50);
                }
            }

            // ONLY restore chat when NOT sending a new message
            // This fixes the race condition that caused double messages:
            // Previously restoreChat was sent immediately while sendMessage ran after 50ms,
            // causing the new message to appear twice (once from sendMessage, once from restoreChat)
            if (!text && vscode && typeof vscode.postMessage === 'function') {
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
            
            // STEP 3: Hide welcome screen - display:none is sufficient
            // DO NOT set z-index, visibility, or opacity - they persist and cause blank screen on back navigation
            if (welcomeScreen) {
                welcomeScreen.style.setProperty('display', 'none', 'important');
                console.log('[MODE] Welcome screen hidden');
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

            // STEP 10: Ensure thinking element is properly set up after chat mode transition
            setTimeout(function() {
                const thinkingEl = document.getElementById('thinking');
                const messagesContainer = document.getElementById('messages');
                console.log('sendWelcomeMessage: Verifying thinking element after transition, exists?', !!thinkingEl);
                if (!thinkingEl && messagesContainer) {
                    console.log('sendWelcomeMessage: Thinking element missing, creating dynamically');
                    const newThinking = document.createElement('div');
                    newThinking.id = 'thinking';
                    newThinking.className = 'thinking';
                    newThinking.style.display = 'none';
                    newThinking.innerHTML = '<div class="thinking-gear"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 15.5A3.5 3.5 0 0 1 8.5 12A3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5a3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97c0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.4-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1c0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z"/></svg></div><span class="thinking-text">Processing<span class="thinking-dots">...</span></span>';
                    messagesContainer.appendChild(newThinking);
                } else if (thinkingEl) {
                    // Ensure it's reset to hidden state
                    thinkingEl.style.display = 'none';
                    thinkingEl.classList.remove('active');
                }
            }, 150);
        }

            // Simple markdown parser - converts markdown to HTML
            function parseMarkdown(text) {
                if (!text) return '';

                // Escape HTML to prevent XSS
                var html = text
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');

                // Use String.fromCharCode(96) for backtick to avoid template literal issues
                var backtick = String.fromCharCode(96);
                var tripleBacktick = backtick + backtick + backtick;

                // Code blocks (triple backticks)
                var codeBlockRegex = new RegExp(tripleBacktick + '(\\\\w*)\\n([\\\\s\\\\S]*?)' + tripleBacktick, 'g');
                html = html.replace(codeBlockRegex, function(match, lang, code) {
                    var body = code ? code.trim() : '';
                    var lg = (lang || 'plaintext').replace(/[^a-zA-Z0-9+-]/g, '') || 'code';
                    return '<div class="code-block-wrap">' +
                        '<div class="code-block-toolbar">' +
                        '<span class="code-block-lang">' + lg + '</span>' +
                        '<button type="button" class="cm-code-copy-btn" title="Copy code">Copy</button>' +
                        '</div>' +
                        '<pre class="code-block"><code class="language-' + lg + '">' + body + '</code></pre>' +
                        '</div>';
                });

                // Inline code (single backticks)
                var inlineCodeRegex = new RegExp(backtick + '([^' + backtick + ']+)' + backtick, 'g');
                html = html.replace(inlineCodeRegex, '<code class="inline-code">$1</code>');

                // Bold (**text**)
                html = html.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');

                // Italic (*text*)
                html = html.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');

                // Headers (## text) - process longer patterns first
                html = html.replace(/^#### (.+)$/gm, '<h5>$1</h5>');
                html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
                html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
                html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

                // Bullet lists - wrap consecutive items in <ul>
                html = html.replace(/((?:^- .+$\\n?)+)/gm, function(match) {
                    var items = match.trim().split('\\n')
                        .map(function(item) { return item.replace(/^- (.+)$/, '<li>$1</li>'); })
                        .join('');
                    return '<ul>' + items + '</ul>';
                });

                // Numbered lists - wrap consecutive items in <ol>
                html = html.replace(/((?:^\\d+\\. .+$\\n?)+)/gm, function(match) {
                    var items = match.trim().split('\\n')
                        .map(function(item) { return item.replace(/^\\d+\\. (.+)$/, '<li>$1</li>'); })
                        .join('');
                    return '<ol>' + items + '</ol>';
                });

                // Links [text](url)
                html = html.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2">$1</a>');

                // Horizontal rules (---) - before line breaks
                html = html.replace(/^---$/gm, '<hr class="section-divider">');

                // Vulnerability findings with Fix buttons
                // Pattern: "1. **[SEVERITY]** file.js:123 - Description"
                // First, detect and enhance numbered vulnerability findings with fix buttons
                html = html.replace(/(\\d+)\\.\\s*\\*\\*\\[(CRITICAL|HIGH|MEDIUM|LOW|INFO)\\]\\*\\*\\s*([^:]+):(\\d+)\\s*-\\s*([^\\n<]+)/gi, function(match, num, severity, filePath, lineNum, description) {
                    var severityLower = severity.toLowerCase();
                    var escapedPath = filePath.replace(/"/g, '&quot;').trim();
                    var escapedDesc = description.replace(/"/g, '&quot;').trim();
                    var vulnData = JSON.stringify({
                        type: escapedDesc,
                        severity: severityLower,
                        file: escapedPath,
                        line: parseInt(lineNum, 10),
                        description: escapedDesc,
                        title: escapedDesc
                    }).replace(/"/g, '&quot;');

                    return '<div class="vuln-finding">' +
                        '<span>' + num + '. </span>' +
                        '<span class="severity-badge ' + severityLower + '">' + severity.toUpperCase() + '</span>' +
                        '<a class="file-path-link vuln-location" href="#" data-file-path="' + escapedPath +
                        '" data-line-number="' + lineNum + '" title="Click to open at line ' + lineNum + '">' +
                        filePath.trim() + ':' + lineNum + '</a>' +
                        '<span class="vuln-description"> - ' + description.trim() + '</span>' +
                        '<button class="fix-vuln-btn" data-vulnerability="' + vulnData + '" title="Generate and apply a fix for this vulnerability">Fix</button>' +
                        '</div>';
                });

                // Severity badges with colors (for non-finding uses)
                html = html.replace(/\\[CRITICAL\\]/g, '<span class="severity-badge critical">CRITICAL</span>');
                html = html.replace(/\\[HIGH\\]/g, '<span class="severity-badge high">HIGH</span>');
                html = html.replace(/\\[MEDIUM\\]/g, '<span class="severity-badge medium">MEDIUM</span>');
                html = html.replace(/\\[LOW\\]/g, '<span class="severity-badge low">LOW</span>');
                html = html.replace(/\\[INFO\\]/g, '<span class="severity-badge info">INFO</span>');

                // Stats with colored numbers (Critical: 2696)
                html = html.replace(/Critical:\\s*(\\d+)/gi, 'Critical: <span class="stat-critical">$1</span>');
                html = html.replace(/High:\\s*(\\d+)/gi, 'High: <span class="stat-high">$1</span>');
                html = html.replace(/Medium:\\s*(\\d+)/gi, 'Medium: <span class="stat-medium">$1</span>');

                // File paths with line numbers (Windows style c:\path:123) - clickable
                html = html.replace(/([A-Za-z]:\\\\[^\\s:]+):(\\d+)/g, function(match, filePath, lineNum) {
                    var escapedPath = filePath.replace(/"/g, '&quot;');
                    return '<a class="file-path-link" href="#" data-file-path="' + escapedPath +
                           '" data-line-number="' + lineNum + '" title="Click to open at line ' + lineNum + '">' +
                           match + '</a>';
                });

                // File paths with line numbers (Unix/Mac absolute paths /path/to/file.ts:123) - clickable
                // Match paths starting with / that have a file extension and line number
                html = html.replace(/(\\/(?:[^\\s:&<>]+\\/)*[^\\s:&<>]+\\.[a-zA-Z0-9]+):(\\d+)(?![^<]*<\\/a>)/g, function(match, filePath, lineNum) {
                    var escapedPath = filePath.replace(/"/g, '&quot;');
                    return '<a class="file-path-link" href="#" data-file-path="' + escapedPath +
                           '" data-line-number="' + lineNum + '" title="Click to open at line ' + lineNum + '">' +
                           match + '</a>';
                });

                // File paths with line numbers (relative paths like src/file.ts:123 or ./src/file.ts:123) - clickable
                // Match paths that look like relative file paths with extensions and line numbers
                // Negative lookbehind equivalent: ensure not already wrapped in an <a> tag
                html = html.replace(/(?<!["\\/])(\\.?\\.?\\/)?([a-zA-Z0-9_][a-zA-Z0-9_.-]*(?:\\/[a-zA-Z0-9_][a-zA-Z0-9_.-]*)+\\.[a-zA-Z0-9]+):(\\d+)(?![^<]*<\\/a>)/g, function(match, prefix, filePath, lineNum) {
                    var fullPath = (prefix || '') + filePath;
                    var escapedPath = fullPath.replace(/"/g, '&quot;');
                    return '<a class="file-path-link" href="#" data-file-path="' + escapedPath +
                           '" data-line-number="' + lineNum + '" title="Click to open at line ' + lineNum + '">' +
                           match + '</a>';
                });

                // Line breaks
                html = html.replace(/\\n\\n/g, '</p><p>');
                html = html.replace(/\\n/g, '<br>');

                return html;
            }

            var CM_ASSISTANT_AVATAR = ${assistantAvatarJson};
            var CM_SCROLL_NEAR_BOTTOM = 100;
            function cmShouldPinMessagesScroll() {
                var c = document.getElementById('messages');
                if (!c) return true;
                var dist = c.scrollHeight - c.scrollTop - c.clientHeight;
                return dist <= CM_SCROLL_NEAR_BOTTOM;
            }
            function cmScrollMessagesIfPinned() {
                var c = document.getElementById('messages');
                if (!c) return;
                if (cmShouldPinMessagesScroll()) c.scrollTop = c.scrollHeight;
            }

            var cmStreamState = null;

            function cmEscapeHtml(s) {
                return String(s)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;');
            }

            function cmFormatOneCitation(trimmed) {
                var pathLineMatch = trimmed.match(/^(.+\\.[a-zA-Z0-9]+):(\\d+)$/);
                if (pathLineMatch) {
                    var path = pathLineMatch[1];
                    var line = pathLineMatch[2];
                    return '<a class="file-path-link" href="#" data-file-path="' +
                        path.replace(/"/g, '&quot;') +
                        '" data-line-number="' +
                        line +
                        '" title="Open at line ' +
                        line +
                        '">' +
                        cmEscapeHtml(trimmed) +
                        '</a>';
                }
                return cmEscapeHtml(trimmed);
            }

            function cmRenderCitationsInto(citDiv, citations) {
                if (!citDiv || !citations || citations.length === 0) return;
                var lis = citations.map(function(c) {
                    return '<li>' + cmFormatOneCitation((c || '').trim()) + '</li>';
                });
                citDiv.innerHTML =
                    '<strong>📚 Sources</strong><ul class="cm-sources-list">' + lis.join('') + '</ul>';
                citDiv.style.display = 'block';
                citDiv.style.opacity = '1';
            }

            function cmAppendFileDiffPanel(contentWrapper, fileDiff) {
                if (!contentWrapper || !fileDiff || !fileDiff.path || !fileDiff.html) return;
                var wrap = document.createElement('div');
                wrap.className = 'code-block-wrap cm-diff-panel';
                wrap.setAttribute('data-file-path', fileDiff.path);
                wrap.__cmCopyNewFile = fileDiff.copyText || '';
                var base =
                    (fileDiff.path || '').split(/[/\\\\]/).pop() || fileDiff.path;
                var tb = document.createElement('div');
                tb.className = 'code-block-toolbar cm-diff-open-target';
                tb.setAttribute('tabindex', '0');
                tb.setAttribute('role', 'button');
                tb.setAttribute(
                    'title',
                    'Click to open this file in the editor (diff body: select text or right-click for context)'
                );
                var lab = document.createElement('span');
                lab.className = 'code-block-lang';
                lab.textContent = 'diff — ' + base;
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'cm-code-copy-btn';
                btn.textContent = 'Copy new file';
                btn.setAttribute('title', 'Copy full new file to clipboard');
                tb.appendChild(lab);
                tb.appendChild(btn);
                var pre = document.createElement('pre');
                pre.className = 'code-block cm-diff-view';
                pre.setAttribute('data-cm-diff-file-label', base);
                pre.innerHTML = fileDiff.html;
                wrap.appendChild(tb);
                wrap.appendChild(pre);
                contentWrapper.appendChild(wrap);
            }

            function cmHideThinkingRow() {
                var thinkingEl = document.getElementById('thinking');
                if (thinkingEl) {
                    thinkingEl.classList.remove('active');
                    setTimeout(function() {
                        var el = document.getElementById('thinking');
                        if (el && !el.classList.contains('active')) el.style.display = 'none';
                    }, 200);
                }
                var stopBtn = document.getElementById('stopButton');
                if (stopBtn) stopBtn.style.display = 'none';
            }

            function beginAssistantStream(messageId, timestamp) {
                cmHideThinkingRow();
                var container = document.getElementById('messages');
                if (!container) return;
                var state = {
                    messageId: messageId,
                    buffer: '',
                    messageDiv: null,
                    contentDiv: null,
                    citationsDiv: null
                };
                try {
                    var messageDiv = document.createElement('div');
                    messageDiv.className = 'message assistant';
                    messageDiv.setAttribute('data-message-id', messageId || 'msg-' + Date.now());
                    messageDiv.setAttribute('data-role', 'assistant');
                    messageDiv.setAttribute('data-raw-content', '');
                    messageDiv.style.cssText = 'display: flex; gap: 12px; max-width: 85%; margin: 8px 0; position: relative;';

                    var avatar = document.createElement('div');
                    avatar.className = 'message-avatar';
                    if (CM_ASSISTANT_AVATAR) {
                        avatar.innerHTML = '';
                        var avImg = document.createElement('img');
                        avImg.className = 'cm-assistant-avatar-img';
                        avImg.src = CM_ASSISTANT_AVATAR;
                        avImg.alt = 'CipherMate';
                        avImg.width = 22;
                        avImg.height = 22;
                        avatar.appendChild(avImg);
                        avatar.style.cssText = 'width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 5px; box-sizing: border-box;';
                    } else {
                        avatar.textContent = 'CM';
                        avatar.style.cssText = 'width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-weight: 500; font-size: 13px; flex-shrink: 0; border: 1px solid var(--vscode-panel-border); background: var(--vscode-button-background); color: var(--vscode-button-foreground);';
                    }

                    var contentWrapper = document.createElement('div');
                    contentWrapper.style.cssText = 'flex: 1; position: relative; display: flex; flex-direction: column; gap: 4px;';

                    var contentRow = document.createElement('div');
                    contentRow.style.cssText = 'display: flex; align-items: flex-start; gap: 8px;';

                    var contentDiv = document.createElement('div');
                    contentDiv.className = 'message-content';
                    contentDiv.innerHTML = '';
                    contentDiv.style.cssText = 'padding: 12px 16px; line-height: 1.5; word-wrap: break-word; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-editor-foreground); border-radius: 8px;';
                    contentDiv.style.flex = '1';

                    var citationsDiv = document.createElement('div');
                    citationsDiv.className = 'message-citations';
                    citationsDiv.setAttribute('data-message-id', messageId);
                    citationsDiv.style.cssText = 'display: none; margin-top: 8px; padding: 8px 12px; background: var(--vscode-textBlockQuote-background); border-left: 3px solid var(--vscode-textLink-foreground); border-radius: 4px; font-size: 11px; color: var(--vscode-descriptionForeground); transition: opacity 0.3s;';

                    var actionsDiv = document.createElement('div');
                    actionsDiv.className = 'message-actions';

                    var replyBtn = document.createElement('button');
                    replyBtn.type = 'button';
                    replyBtn.className = 'message-action-btn reply-btn';
                    replyBtn.setAttribute('aria-label', 'Reply to this message');
                    replyBtn.title = 'Reply (includes context from this message)';
                    replyBtn.innerHTML =
                        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                        '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="m15 7-4 4 4 4"/></svg>';
                    var mid = messageId;
                    replyBtn.onclick = function(e) {
                        e.stopPropagation();
                        var raw = (messageDiv.getAttribute('data-raw-content') || '').replace(/&quot;/g, '"');
                        handleReply(mid, raw, 'assistant', messageDiv);
                    };
                    actionsDiv.appendChild(replyBtn);

                    contentRow.appendChild(contentDiv);
                    contentWrapper.appendChild(contentRow);
                    contentWrapper.appendChild(citationsDiv);
                    messageDiv.appendChild(avatar);
                    messageDiv.appendChild(contentWrapper);
                    messageDiv.appendChild(actionsDiv);

                    var thinkingEl = document.getElementById('thinking');
                    if (thinkingEl && thinkingEl.parentNode === container) {
                        container.insertBefore(messageDiv, thinkingEl);
                    } else {
                        container.appendChild(messageDiv);
                    }

                    state.messageDiv = messageDiv;
                    state.contentDiv = contentDiv;
                    state.citationsDiv = citationsDiv;
                    cmStreamState = state;
                } catch (err) {
                    console.error('beginAssistantStream:', err);
                }
            }

            function appendAssistantStreamDelta(messageId, chunk) {
                if (!cmStreamState || cmStreamState.messageId !== messageId || !cmStreamState.contentDiv) return;
                cmStreamState.buffer += chunk || '';
                cmStreamState.contentDiv.innerHTML = parseMarkdown(cmStreamState.buffer);
                cmScrollMessagesIfPinned();
            }

            function endAssistantStream(messageId, finalContent, citations, fileDiff) {
                if (!cmStreamState || cmStreamState.messageId !== messageId) {
                    var fallbackText = (finalContent != null && finalContent !== '') ? finalContent : '';
                    if (fallbackText) {
                        addMessage('assistant', fallbackText, new Date().toISOString(), messageId, undefined, citations || [], fileDiff);
                    }
                    return;
                }
                var contentDiv = cmStreamState.contentDiv;
                var messageDiv = cmStreamState.messageDiv;
                var citationsDiv = cmStreamState.citationsDiv;
                var text = (finalContent != null && finalContent !== '') ? finalContent : cmStreamState.buffer;
                contentDiv.innerHTML = parseMarkdown(text || '');
                var _zws2 = String.fromCharCode(0x200b, 0x200c, 0x200d, 0xfeff);
                var visibleText = (contentDiv.textContent || '').replace(new RegExp('[' + _zws2 + ']', 'g'), '').trim();
                if (!visibleText) {
                    var emptyFallback2 = '*No reply text was returned.*\\n\\n' +
                        'Try another model in **Settings → CipherMate → AI**, check your API key, or use **@file path** so the correct file is in context.';
                    contentDiv.innerHTML = parseMarkdown(emptyFallback2);
                    text = emptyFallback2;
                }
                if (messageDiv) messageDiv.setAttribute('data-raw-content', (text || '').replace(/"/g, '&quot;'));
                if (citationsDiv && citations && citations.length > 0) {
                    cmRenderCitationsInto(citationsDiv, citations);
                }
                var cw = messageDiv && messageDiv.children[1];
                if (cw && fileDiff && fileDiff.path) {
                    cmAppendFileDiffPanel(cw, fileDiff);
                }
                cmStreamState = null;
                cmScrollMessagesIfPinned();
            }

            function addMessage(role, content, timestamp, messageId, reference, citations, fileDiff) {
            console.log('addMessage called:', role, content ? content.substring(0, 50) : '', 'messageId:', messageId);
            const container = document.getElementById('messages');
            if (!container) {
                console.error(' addMessage: messages container not found!');
                return;
            }
            
            try {
            const messageDiv = document.createElement('div');
                messageDiv.className = 'message ' + role;
                messageDiv.setAttribute('data-message-id', messageId || 'msg-' + Date.now());
                messageDiv.setAttribute('data-role', role);
                messageDiv.setAttribute('data-raw-content', (content || '').replace(/"/g, '&quot;'));
                messageDiv.style.cssText = 'display: flex; gap: 12px; max-width: 85%; margin: 8px 0; position: relative;';
            
            const avatar = document.createElement('div');
            avatar.className = 'message-avatar';
            if (role === 'assistant' && CM_ASSISTANT_AVATAR) {
                avatar.innerHTML = '';
                var avImg = document.createElement('img');
                avImg.className = 'cm-assistant-avatar-img';
                avImg.src = CM_ASSISTANT_AVATAR;
                avImg.alt = 'CipherMate';
                avImg.width = 22;
                avImg.height = 22;
                avatar.appendChild(avImg);
                avatar.style.cssText = 'width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 5px; box-sizing: border-box;';
            } else {
                avatar.textContent = role === 'user' ? 'You' : 'CM';
                avatar.style.cssText = 'width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-weight: 500; font-size: 13px; flex-shrink: 0; border: 1px solid var(--vscode-panel-border); background: var(--vscode-button-background); color: var(--vscode-button-foreground);';
            }
            
            const contentWrapper = document.createElement('div');
            contentWrapper.style.cssText = 'flex: 1; position: relative; display: flex; flex-direction: column; gap: 4px;';
            
            const contentRow = document.createElement('div');
            contentRow.style.cssText = 'display: flex; align-items: flex-start; gap: 8px;';
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            // Use markdown parsing for assistant responses, plain text for user messages
            if (role === 'assistant') {
                contentDiv.innerHTML = parseMarkdown(content || '');
                var _zws = String.fromCharCode(0x200b, 0x200c, 0x200d, 0xfeff);
                var visibleText = (contentDiv.textContent || '').replace(new RegExp('[' + _zws + ']', 'g'), '').trim();
                if (!visibleText) {
                    var emptyFallback = '*No reply text was returned.*\\n\\n' +
                        'Try another model in **Settings → CipherMate → AI**, check your API key, or use **@file path** so the correct file is in context.';
                    contentDiv.innerHTML = parseMarkdown(emptyFallback);
                }
            } else {
                contentDiv.textContent = content;
            }
                if (role === 'assistant') {
                    contentDiv.style.cssText = 'padding: 12px 16px; line-height: 1.5; word-wrap: break-word; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-editor-foreground); border-radius: 8px;';
                } else {
                    contentDiv.style.cssText = 'background: var(--vscode-input-background); border: 1px solid var(--vscode-panel-border); padding: 12px 16px; line-height: 1.5; word-wrap: break-word; color: var(--vscode-editor-foreground); border-radius: 8px;';
                }

                if (role === 'user') {
                    contentDiv.style.cssText += 'background: var(--vscode-button-background); color: var(--vscode-button-foreground);';
                }
            contentDiv.style.flex = '1';
            
            const citationsDiv = document.createElement('div');
            citationsDiv.className = 'message-citations';
            citationsDiv.setAttribute('data-message-id', messageId);
            citationsDiv.style.cssText = 'display: none; margin-top: 8px; padding: 8px 12px; background: var(--vscode-textBlockQuote-background); border-left: 3px solid var(--vscode-textLink-foreground); border-radius: 4px; font-size: 11px; color: var(--vscode-descriptionForeground); transition: opacity 0.3s;';
            
            if (citations && citations.length > 0) {
                cmRenderCitationsInto(citationsDiv, citations);
            }
            
            // Reply / reference — narrow rail outside the bubble (flex order + row-reverse for user)
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'message-actions';
            
            const replyBtn = document.createElement('button');
            replyBtn.type = 'button';
            replyBtn.className = 'message-action-btn reply-btn';
            replyBtn.setAttribute('aria-label', 'Reply to this message');
            replyBtn.title = 'Reply (includes context from this message)';
            replyBtn.innerHTML =
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="m15 7-4 4 4 4"/></svg>';
            replyBtn.onclick = function(e) {
                e.stopPropagation();
                handleReply(messageId, content, role, messageDiv);
            };
            
            const refBtn = document.createElement('button');
            refBtn.type = 'button';
            refBtn.className = 'message-action-btn ref-btn';
            refBtn.setAttribute('aria-label', 'Open referenced file');
            refBtn.title = 'Open referenced file';
            refBtn.innerHTML =
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="m15 3 6 0 0 6"/><path d="M10 14 21 3"/></svg>';
            refBtn.onclick = function(e) {
                e.stopPropagation();
                handleReference(messageId, reference);
            };
            
            if (reference && reference.filePath) {
                actionsDiv.appendChild(refBtn);
            }
            actionsDiv.appendChild(replyBtn);
            
            contentRow.appendChild(contentDiv);
            contentWrapper.appendChild(contentRow);
            contentWrapper.appendChild(citationsDiv);
            if (role === 'assistant' && fileDiff && fileDiff.path) {
                cmAppendFileDiffPanel(contentWrapper, fileDiff);
            }
            
            messageDiv.appendChild(avatar);
            messageDiv.appendChild(contentWrapper);
            messageDiv.appendChild(actionsDiv);
            
                // Insert before thinking element if it exists, otherwise append
                const thinkingEl = document.getElementById('thinking');
                if (thinkingEl && thinkingEl.parentNode === container) {
                    container.insertBefore(messageDiv, thinkingEl);
                } else {
                    container.appendChild(messageDiv);
                }
                
                cmScrollMessagesIfPinned();
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
        
        // Pending reply context (set when user clicks Reply, cleared on send or cancel)
        var pendingReplyContext = null;
        var pendingImageAttachments = [];
        /** Images chosen via extension host file picker (not in webview memory until send). */
        var hostAttachCount = 0;
        function cmUpdateAttachPreview() {
            var el = document.getElementById('attachPreview');
            if (!el) return;
            var nWeb = pendingImageAttachments.length;
            var nHost = hostAttachCount;
            if (!nWeb && !nHost) {
                el.style.display = 'none';
                el.innerHTML = '';
                return;
            }
            el.style.display = 'flex';
            var chips = [];
            if (nWeb) {
                chips.push('<span style="padding:2px 6px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);">' +
                    nWeb + ' image' + (nWeb > 1 ? 's' : '') + ' (browser)</span>');
            }
            if (nHost) {
                chips.push('<span style="padding:2px 6px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);">' +
                    nHost + ' image' + (nHost > 1 ? 's' : '') + ' (workspace)</span>');
            }
            el.innerHTML = '<span>Attached:</span> ' + chips.join(' ');
        }
        function cmClearAttachPreview() {
            pendingImageAttachments = [];
            cmUpdateAttachPreview();
        }
        
        // Handle reply to message - with context analysis
        function handleReply(messageId, content, role, messageDiv) {
            const messageInput = document.getElementById('messageInput');
            const replyContextPanel = document.getElementById('replyContextPanel');
            const replyContextSummary = document.getElementById('replyContextSummary');
            if (!messageInput) return;
            
            // Collect surrounding context (up to 3 previous messages)
            var contextMessages = [];
            var sibling = messageDiv.previousElementSibling;
            var count = 0;
            while (sibling && count < 3) {
                if (sibling.classList && sibling.classList.contains('message') && sibling.id !== 'thinking') {
                    var prevRole = sibling.getAttribute('data-role') || (sibling.classList.contains('user') ? 'user' : 'assistant');
                    var prevContent = sibling.getAttribute('data-raw-content') || '';
                    if (prevContent) prevContent = prevContent.replace(/&quot;/g, '"');
                    contextMessages.unshift({ role: prevRole, content: prevContent.substring(0, 500) });
                    count++;
                }
                sibling = sibling.previousElementSibling;
            }
            
            var repliedToContent = (content || '').substring(0, 600);
            pendingReplyContext = {
                repliedToMessageId: messageId,
                repliedToContent: repliedToContent,
                repliedToRole: role,
                contextMessages: contextMessages
            };
            
            // Show context panel - reference only, no full quote (avoids flooding chat)
            if (replyContextPanel && replyContextSummary) {
                var summary = 'Replying to ' + (role === 'assistant' ? 'CipherMate' : 'You') + ' (message above)';
                if (contextMessages.length > 0) {
                    summary += ' - ' + contextMessages.length + ' prior message(s) for context';
                }
                replyContextSummary.textContent = summary;
                replyContextPanel.style.display = 'block';
            }
            
            // Leave input empty - user types their own message (context is sent to AI behind the scenes)
            messageInput.value = '';
            messageInput.placeholder = 'Type your reply...';
            messageInput.focus();
        }
        
        function clearReplyContext() {
            pendingReplyContext = null;
            var panel = document.getElementById('replyContextPanel');
            if (panel) panel.style.display = 'none';
            var input = document.getElementById('messageInput');
            if (input) input.placeholder = 'Type your request... ';
        }

        /** Context chips above composer (diff excerpt); must be in scope for sendMessage. */
        var CM_CTX_MAX_DIFF_LINES = 80;
        var CM_CTX_MAX_SNIPPET_LINES = 120;
        function cmTruncatePlainLines(text, maxLines) {
            if (!text) {
                return { text: '', omitted: 0 };
            }
            var lines = text.split('\\n');
            if (lines.length <= maxLines) {
                return { text: text, omitted: 0 };
            }
            return {
                text: lines.slice(0, maxLines).join('\\n'),
                omitted: lines.length - maxLines
            };
        }
        function cmTruncateDiffRows(rows, maxLines) {
            if (!rows || rows.length <= maxLines) {
                return { rows: rows, omitted: 0 };
            }
            return { rows: rows.slice(0, maxLines), omitted: rows.length - maxLines };
        }
        function cmRefreshContextChipsVisibility() {
            var outer = document.getElementById('cmContextStripOuter');
            var strip = document.getElementById('cmContextChips');
            if (!strip) {
                return;
            }
            var has = strip.children && strip.children.length;
            if (outer) {
                outer.style.display = has ? 'block' : 'none';
            } else {
                strip.style.display = has ? 'flex' : 'none';
            }
        }
        function cmClearAllContextChips() {
            var strip = document.getElementById('cmContextChips');
            if (!strip) return;
            while (strip.firstChild) {
                strip.removeChild(strip.firstChild);
            }
            cmRefreshContextChipsVisibility();
        }
        function cmParseDiffPreToRows(preEl) {
            var rows = [];
            var oldN = 1;
            var newN = 1;
            var nodes = preEl.querySelectorAll('.cm-diff-line');
            for (var i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                var code = node.querySelector('code');
                var txt = (code ? code.textContent : node.textContent || '').replace(/^\\s+$/m, '');
                if (node.classList.contains('cm-diff-del')) {
                    rows.push({ kind: 'del', oldN: oldN, newN: null, text: txt });
                    oldN++;
                } else if (node.classList.contains('cm-diff-add')) {
                    rows.push({ kind: 'add', oldN: null, newN: newN, text: txt });
                    newN++;
                } else {
                    rows.push({ kind: 'same', oldN: oldN, newN: newN, text: txt });
                    oldN++;
                    newN++;
                }
            }
            return rows;
        }
        function cmBuildAiPayloadFromRows(fileLabel, rows) {
            var lines = [];
            lines.push(
                '(Attached diff from ' +
                    fileLabel +
                    ': red = removed lines, green = added lines.)'
            );
            for (var r = 0; r < rows.length; r++) {
                var row = rows[r];
                if (row.kind === 'del') {
                    lines.push('REMOVED L' + row.oldN + ': ' + row.text);
                } else if (row.kind === 'add') {
                    lines.push('ADDED L' + row.newN + ': ' + row.text);
                } else if (row.kind === 'same') {
                    lines.push(
                        'CONTEXT L' + row.oldN + '→' + row.newN + ': ' + row.text
                    );
                }
            }
            return lines.join('\\n');
        }
        function cmAppendDiffContextChip(preEl, fileLabel, selectionOnly) {
            var strip = document.getElementById('cmContextChips');
            if (!strip) return;
            var aiPayload;
            var rows = [];
            var rowsForUi = [];
            if (selectionOnly) {
                var sel = '';
                try {
                    sel = window.getSelection().toString();
                } catch (e0) {}
                var rawBody = (sel && sel.trim()) ? sel.trim() : (preEl.textContent || '').trim();
                var sn = cmTruncatePlainLines(rawBody, CM_CTX_MAX_SNIPPET_LINES);
                var body = sn.text;
                rows = [{ kind: 'snippet', text: body }];
                rowsForUi = rows.slice();
                aiPayload =
                    '(Attached selection from diff — ' +
                    fileLabel +
                    '.)\\n' +
                    body;
                if (sn.omitted > 0) {
                    aiPayload +=
                        '\\n\\n(Note: ' +
                        sn.omitted +
                        ' more line(s) omitted; cap is ' +
                        CM_CTX_MAX_SNIPPET_LINES +
                        ' lines per chip.)';
                    rowsForUi.push({
                        kind: 'note',
                        text:
                            '… and ' +
                            sn.omitted +
                            ' more line(s) not shown (max ' +
                            CM_CTX_MAX_SNIPPET_LINES +
                            ' per chip)'
                    });
                }
            } else {
                rows = cmParseDiffPreToRows(preEl);
                if (!rows.length) {
                    var fallback = (preEl.textContent || '').trim();
                    var fb = cmTruncatePlainLines(fallback, CM_CTX_MAX_SNIPPET_LINES);
                    rows = [{ kind: 'snippet', text: fb.text }];
                    rowsForUi = rows.slice();
                    aiPayload =
                        '(Attached diff text — ' + fileLabel + '.)\\n' + fb.text;
                    if (fb.omitted > 0) {
                        aiPayload +=
                            '\\n\\n(Note: ' +
                            fb.omitted +
                            ' more line(s) omitted; cap is ' +
                            CM_CTX_MAX_SNIPPET_LINES +
                            ' lines per chip.)';
                        rowsForUi.push({
                            kind: 'note',
                            text:
                                '… and ' +
                                fb.omitted +
                                ' more line(s) not shown (max ' +
                                CM_CTX_MAX_SNIPPET_LINES +
                                ' per chip)'
                        });
                    }
                } else {
                    var tr = cmTruncateDiffRows(rows, CM_CTX_MAX_DIFF_LINES);
                    var payloadRows = tr.rows;
                    aiPayload = cmBuildAiPayloadFromRows(fileLabel, payloadRows);
                    if (tr.omitted > 0) {
                        aiPayload +=
                            '\\n\\n(Note: ' +
                            tr.omitted +
                            ' more diff line(s) omitted; cap is ' +
                            CM_CTX_MAX_DIFF_LINES +
                            ' lines per chip.)';
                    }
                    rowsForUi = payloadRows.slice();
                    if (tr.omitted > 0) {
                        rowsForUi.push({
                            kind: 'note',
                            text:
                                '… and ' +
                                tr.omitted +
                                ' more line(s) not shown (max ' +
                                CM_CTX_MAX_DIFF_LINES +
                                ' per chip)'
                        });
                    }
                }
            }

            var chip = document.createElement('div');
            chip.className = 'cm-ctx-chip';
            chip.__cmAiPayload = aiPayload;

            var banner = document.createElement('div');
            banner.className = 'cm-ctx-chip-banner';
            var badge = document.createElement('span');
            badge.className = 'cm-ctx-chip-badge';
            badge.textContent = 'Context';
            var fn = document.createElement('span');
            fn.className = 'cm-ctx-chip-file';
            fn.textContent = fileLabel;
            var leg = document.createElement('span');
            leg.className = 'cm-ctx-chip-legend';
            leg.textContent = 'ⓘ';
            leg.setAttribute(
                'title',
                'Red # = removed line (old file). Green # = added line (new file). Pair = unchanged context.'
            );
            var rm = document.createElement('button');
            rm.type = 'button';
            rm.className = 'cm-ctx-chip-remove';
            rm.setAttribute('aria-label', 'Remove context');
            rm.textContent = '×';
            rm.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                if (chip.parentNode) {
                    chip.parentNode.removeChild(chip);
                }
                cmRefreshContextChipsVisibility();
            });
            banner.appendChild(badge);
            banner.appendChild(fn);
            banner.appendChild(leg);
            banner.appendChild(rm);

            var bodyEl = document.createElement('div');
            bodyEl.className = 'cm-ctx-chip-body';
            for (var j = 0; j < rowsForUi.length; j++) {
                var row = rowsForUi[j];
                var dr = document.createElement('div');
                if (row.kind === 'note') {
                    dr.className = 'cm-ctx-diff-row cm-ctx-kind-note';
                    dr.textContent = row.text;
                    bodyEl.appendChild(dr);
                    continue;
                }
                var o = document.createElement('span');
                var n = document.createElement('span');
                var c = document.createElement('span');
                c.className = 'cm-ctx-code';
                c.textContent = row.text;
                if (row.kind === 'snippet') {
                    dr.className = 'cm-ctx-diff-row cm-ctx-kind-same';
                    o.className = 'cm-ctx-ln cm-ctx-ln-mute';
                    o.textContent = '·';
                    n.className = 'cm-ctx-ln cm-ctx-ln-mute';
                    n.textContent = '·';
                    dr.title = 'Selected excerpt';
                } else if (row.kind === 'del') {
                    dr.className = 'cm-ctx-diff-row cm-ctx-kind-del';
                    o.className = 'cm-ctx-ln cm-ctx-ln-old';
                    o.textContent = String(row.oldN);
                    n.className = 'cm-ctx-ln cm-ctx-ln-mute';
                    n.textContent = '—';
                    o.setAttribute('title', 'Removed — old line ' + row.oldN);
                    n.setAttribute('title', 'Not present in new file');
                } else if (row.kind === 'add') {
                    dr.className = 'cm-ctx-diff-row cm-ctx-kind-add';
                    o.className = 'cm-ctx-ln cm-ctx-ln-mute';
                    o.textContent = '—';
                    n.className = 'cm-ctx-ln cm-ctx-ln-new';
                    n.textContent = String(row.newN);
                    o.setAttribute('title', 'Not in old file');
                    n.setAttribute('title', 'Added — new line ' + row.newN);
                } else {
                    dr.className = 'cm-ctx-diff-row cm-ctx-kind-same';
                    o.className = 'cm-ctx-ln cm-ctx-ln-mute';
                    n.className = 'cm-ctx-ln cm-ctx-ln-mute';
                    o.textContent = String(row.oldN);
                    n.textContent = String(row.newN);
                    o.setAttribute('title', 'Unchanged — old line ' + row.oldN);
                    n.setAttribute('title', 'Unchanged — new line ' + row.newN);
                }
                dr.appendChild(o);
                dr.appendChild(n);
                dr.appendChild(c);
                bodyEl.appendChild(dr);
            }
            chip.appendChild(banner);
            chip.appendChild(bodyEl);
            strip.appendChild(chip);
            cmRefreshContextChipsVisibility();
            var input = document.getElementById('messageInput');
            if (input) input.focus();
        }
        function cmCollectPendingContextForSend() {
            var strip = document.getElementById('cmContextChips');
            if (!strip || !strip.children || !strip.children.length) {
                return '';
            }
            var chips = strip.querySelectorAll('.cm-ctx-chip');
            var parts = [];
            for (var i = 0; i < chips.length; i++) {
                if (chips[i].__cmAiPayload) {
                    parts.push(chips[i].__cmAiPayload);
                }
            }
            return parts.join('\\n\\n');
        }
        
        // Handle reference to message
        function handleReference(messageId, reference) {
            if (reference && reference.filePath) {
                // Open file at referenced line
                vscode.postMessage({
                    command: 'openFile',
                    filePath: reference.filePath,
                    lineNumber: reference.line || 1
                });
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
            var hasAtt = pendingImageAttachments && pendingImageAttachments.length > 0;
            var ctxBlock = cmCollectPendingContextForSend();
            console.log('sendMessage: Input value:', text, 'web attachments:', hasAtt ? pendingImageAttachments.length : 0);
            // Empty text is OK: extension may have host-picked images only, or context chips only

            if (!text && !hasAtt && !ctxBlock) {
                console.log('sendMessage: Nothing to send');
                isSubmittingChat = false;
                return;
            }

            console.log('sendMessage: Processing message:', text || '(no text; host may have images)');

            // Store text before clearing; prepend hidden-for-user context for the model
            var messageText = text;
            if (ctxBlock) {
                messageText = messageText
                    ? ctxBlock + '\\n\\n' + messageText
                    : ctxBlock;
            }

            // Clear input immediately to prevent double submission
            messageInputEl.value = '';

            var msgContainer = document.getElementById('messages');
            if (msgContainer) {
                msgContainer.scrollTop = msgContainer.scrollHeight;
            }
            
            // Send to extension (with reply context if replying)
            console.log('sendMessage: Sending message to extension:', messageText);
            try {
                if (!vscode || typeof vscode.postMessage !== 'function') {
                    console.error('sendMessage: vscode.postMessage not available');
                    return;
                }
                var attCopy = hasAtt ? pendingImageAttachments.slice() : undefined;
                cmClearAttachPreview();
                cmClearAllContextChips();
                var payload = { command: 'sendMessage', text: messageText };
                if (attCopy && attCopy.length) {
                    payload.attachments = attCopy;
                }
                if (pendingReplyContext) {
                    payload.replyContext = pendingReplyContext;
                    clearReplyContext();
                }
                vscode.postMessage(payload);
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
            if (continueChatBtn && !continueChatBtn.hasAttribute('data-initial-handler')) {
                continueChatBtn.setAttribute('data-initial-handler', 'true');
                console.log('=== Setting up continueChat button (initial) ===');
                continueChatBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('=== continueChat clicked (initial handler) ===');
                    switchToChatMode();
                });
            } else if (!continueChatBtn) {
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

            // Cancel reply button
            var cancelReplyBtn = document.getElementById('cancelReplyBtn');
            if (cancelReplyBtn) {
                cancelReplyBtn.addEventListener('click', function() {
                    clearReplyContext();
                });
            }

            var cmClearAllCtxBtn = document.getElementById('cmClearAllContextBtn');
            if (cmClearAllCtxBtn && !cmClearAllCtxBtn.hasAttribute('data-cm-bound')) {
                cmClearAllCtxBtn.setAttribute('data-cm-bound', 'true');
                cmClearAllCtxBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    cmClearAllContextChips();
                });
            }
            
            // Stop button - stops processing and returns message to input for editing
            var stopBtn = document.getElementById('stopButton');
            if (stopBtn) {
                stopBtn.addEventListener('click', function() {
                    if (vscode && typeof vscode.postMessage === 'function') {
                        vscode.postMessage({ command: 'stopMessage' });
                    }
                });
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
                console.log('[HANDLE] ========================================');
                console.log('[HANDLE] handleQuickActionClick() CALLED');
                console.log('[HANDLE] actionText:', actionText);
                console.log('[HANDLE] action element:', action);
                console.log('[HANDLE] body.classList.contains("chat-mode"):', body.classList.contains('chat-mode'));

                // Check BOTH the class AND the welcome screen visibility for accurate mode detection
                const welcomeScreen = document.querySelector('.welcome-screen');
                const isWelcomeVisible = welcomeScreen && getComputedStyle(welcomeScreen).display !== 'none';
                console.log('[HANDLE] welcomeScreen visible:', isWelcomeVisible);

                // If welcome screen is visible, we're in welcome mode regardless of class
                const actuallyInChatMode = body.classList.contains('chat-mode') && !isWelcomeVisible;
                console.log('[HANDLE] actuallyInChatMode:', actuallyInChatMode);
                console.log('[HANDLE] ========================================');

                // Special handling for "show results" - execute command directly
                if (actionText.toLowerCase().includes('show results') || actionText.toLowerCase().includes('view results')) {
                    console.log('[HANDLE] Detected showResults action');
                    try {
                        if (!vscode || typeof vscode.postMessage !== 'function') {
                            console.error('vscode.postMessage not available');
                            return;
                        }
                        vscode.postMessage({ command: 'showResults' });
                        console.log('[HANDLE] showResults command sent');
                        return; // Don't send as chat message
                    } catch (error) {
                        console.error('Error executing showResults:', error);
                    }
                }

                // Special handling for "settings" / "configure" - open settings directly
                if (actionText.toLowerCase() === 'settings' || actionText.toLowerCase().includes('configure settings') || actionText.toLowerCase().includes('configure ai')) {
                    console.log('[HANDLE] Detected openSettings action');
                    try {
                        if (!vscode || typeof vscode.postMessage !== 'function') {
                            console.error('vscode.postMessage not available');
                            return;
                        }
                        vscode.postMessage({ command: 'openSettings' });
                        console.log('[HANDLE] openSettings command sent');
                        return; // Don't send as chat message
                    } catch (error) {
                        console.error('Error executing openSettings:', error);
                    }
                }

                // Switch to chat mode if not already (use accurate mode detection)
                console.log('[HANDLE] Checking if need to switch to chat mode...');
                if (!actuallyInChatMode) {
                    console.log('[HANDLE] Not in chat mode (or welcome visible), calling switchToChatMode()...');
                    // Force remove chat-mode class first if it's stale
                    if (body.classList.contains('chat-mode')) {
                        console.log('[HANDLE] Removing stale chat-mode class');
                        body.classList.remove('chat-mode');
                    }
                    // Call switchToChatMode which properly sets up UI and sends the message
                    switchToChatMode(actionText);
                    console.log('[HANDLE] switchToChatMode() called with:', actionText);
                    console.log('[HANDLE] handleQuickActionClick() complete - message sent via switchToChatMode');
                    return; // switchToChatMode handles sending the message
                } else {
                    console.log('[HANDLE] Already in chat mode, sending message directly');
                }

                // Only reach here if already in chat mode - send message directly
                console.log('[HANDLE] Preparing to send message to extension:', actionText);
                try {
                    if (!vscode || typeof vscode.postMessage !== 'function') {
                        console.error('[HANDLE] ERROR: vscode.postMessage not available');
                        return;
                    }
                    console.log('[HANDLE] vscode.postMessage is available, sending...');
                    vscode.postMessage({
                        command: 'sendMessage',
                        text: actionText
                    });
                    console.log('[HANDLE] Message sent successfully to extension');
                } catch (postError) {
                    console.error('[HANDLE] Error calling vscode.postMessage:', postError);
                }
                console.log('[HANDLE] handleQuickActionClick() complete');
            }

            // NOTE: Back button clicks are handled by global event delegation
            console.log('[INIT] Back button will be handled by event delegation');

            // NOTE: All button clicks are now handled by global event delegation
            // We only need to set cursor styles here

            // Set cursor style for chat mode quick actions
            if (quickActions && quickActions.length > 0) {
                console.log('[INIT] Setting cursor style for', quickActions.length, 'chat mode quick action buttons');
                quickActions.forEach((action) => {
                    action.style.cursor = 'pointer';
                });
            }

            // Set cursor style for welcome screen quick actions
            if (welcomeQuickActions && welcomeQuickActions.length > 0) {
                console.log('[INIT] Setting cursor style for', welcomeQuickActions.length, 'welcome quick action buttons');
                welcomeQuickActions.forEach((action) => {
                    action.style.cursor = 'pointer';
                });
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
                            addMessage(msg.role, msg.content, msg.timestamp, msg.messageId, msg.reference, msg.citations);
                        });
                        // Switch to chat mode if there are messages
                        if (message.messages.length > 0) {
                            body.classList.add('chat-mode');
                            setupChatModeListeners();
                        }
                    }
                } else if (message.command === 'updateCitations') {
                    var mid = message.messageId || '';
                    var mc = document.getElementById('messages');
                    if (mc && mid) {
                        var row = mc.querySelector('.message[data-message-id="' + mid.replace(/"/g, '') + '"]');
                        if (row) {
                            var cit = row.querySelector('.message-citations');
                            if (cit && message.citations && message.citations.length > 0) {
                                cmRenderCitationsInto(cit, message.citations);
                            }
                        }
                    }
                } else if (message.command === 'assistantStreamStart') {
                    beginAssistantStream(message.messageId, message.timestamp);
                } else if (message.command === 'assistantStreamDelta') {
                    appendAssistantStreamDelta(message.messageId, message.chunk);
                } else if (message.command === 'assistantStreamEnd') {
                    endAssistantStream(
                        message.messageId,
                        message.content,
                        message.citations,
                        message.fileDiff
                    );
                } else if (message.command === 'addMessage') {
                    console.log('addMessage command received:', message.role, message.content ? message.content.substring(0, 50) + '...' : '(empty)');

                    // Visual debug indicator - briefly flash the body to confirm message receipt
                    document.body.style.transition = 'none';
                    document.body.style.outline = '3px solid lime';
                    setTimeout(function() {
                        document.body.style.outline = 'none';
                    }, 300);

                    // Re-query the thinking element
                    const thinkingEl = document.getElementById('thinking');
                    // Hide thinking when assistant message is added
                    if (message.role === 'assistant' && thinkingEl) {
                        console.log('addMessage: Hiding thinking indicator for assistant message');
                        thinkingEl.classList.remove('active');
                        setTimeout(function() {
                            const el = document.getElementById('thinking');
                            if (el && !el.classList.contains('active')) {
                                el.style.display = 'none';
                            }
                        }, 200);
                    }
                    // Get fresh reference to messages container
                    const container = document.getElementById('messages');
                    if (!container) {
                        console.error('addMessage: messages container not found!');
                    }
                    addMessage(
                        message.role,
                        message.content,
                        message.timestamp,
                        message.messageId,
                        message.reference,
                        message.citations,
                        message.fileDiff
                    );
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
                } else if (message.command === 'attachmentBadge') {
                    hostAttachCount = typeof message.count === 'number' && message.count > 0 ? message.count : 0;
                    cmUpdateAttachPreview();
                } else if (message.command === 'showThinking') {
                    // Visual debug indicator - blue border flash for thinking
                    document.body.style.transition = 'none';
                    document.body.style.outline = '3px solid cyan';
                    setTimeout(function() {
                        document.body.style.outline = 'none';
                    }, 300);

                    var stepText =
                        message.step ||
                        'Preparing your request (workspace, AI provider, and tools)…';
                    var stepSafe = cmEscapeHtml(stepText);
                    var thinkingInner =
                        '<div class="thinking-gear"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 15.5A3.5 3.5 0 0 1 8.5 12A3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5a3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97c0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.4-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1c0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z"/></svg></div><span class="thinking-text">' +
                        stepSafe +
                        '<span class="thinking-dots">...</span></span>';

                    // Re-query the thinking element (don't rely on cached variable)
                    const thinkingEl = document.getElementById('thinking');
                    console.log('showThinking: thinking element exists?', !!thinkingEl);

                    if (thinkingEl) {
                        // Force visibility
                        thinkingEl.style.display = 'flex';
                        thinkingEl.classList.add('active');
                        const textSpan = thinkingEl.querySelector('.thinking-text');
                        if (textSpan) {
                            textSpan.innerHTML =
                                stepSafe + '<span class="thinking-dots">...</span>';
                        } else {
                            thinkingEl.innerHTML = thinkingInner;
                        }
                    } else {
                        console.error('showThinking: thinking element not found, creating dynamically');
                        // Create thinking element if it doesn't exist
                        const container = document.getElementById('messages');
                        if (container) {
                            const newThinking = document.createElement('div');
                            newThinking.id = 'thinking';
                            newThinking.className = 'thinking active';
                            newThinking.style.display = 'flex';
                            newThinking.innerHTML = thinkingInner;
                            container.appendChild(newThinking);
                        }
                    }
                    const container = document.getElementById('messages');
                    if (container) cmScrollMessagesIfPinned();
                    var stopBtn = document.getElementById('stopButton');
                    if (stopBtn) stopBtn.style.display = 'inline-flex';
                } else if (message.command === 'hideThinking') {
                    // Re-query the thinking element
                    const thinkingEl = document.getElementById('thinking');
                    console.log('hideThinking: thinking element exists?', !!thinkingEl);
                    if (thinkingEl) {
                        thinkingEl.classList.remove('active');
                        // Ensure it's completely hidden
                        setTimeout(function() {
                            const el = document.getElementById('thinking');
                            if (el && !el.classList.contains('active')) {
                                el.style.display = 'none';
                            }
                        }, 200);
                    }
                    var stopBtn = document.getElementById('stopButton');
                    if (stopBtn) stopBtn.style.display = 'none';
                } else if (message.command === 'restoreMessageToInput') {
                    var input = document.getElementById('messageInput');
                    if (input && message.message) {
                        input.value = message.message;
                        input.placeholder = 'Type your request... ';
                        input.focus();
                    }
                    var stopBtn = document.getElementById('stopButton');
                    if (stopBtn) stopBtn.style.display = 'none';
                    var thinkingEl = document.getElementById('thinking');
                    if (thinkingEl) {
                        thinkingEl.classList.remove('active');
                        thinkingEl.style.display = 'none';
                    }
                    var container = document.getElementById('messages');
                    if (container) {
                        var msgs = container.querySelectorAll('.message.user');
                        if (msgs.length > 0) {
                            var lastUser = msgs[msgs.length - 1];
                            lastUser.remove();
                        }
                    }
                } else if (message.command === 'thinkingStep') {
                    // Re-query the thinking element
                    const thinkingEl = document.getElementById('thinking');
                    console.log('thinkingStep: thinking element exists?', !!thinkingEl, 'step:', message.step);
                    if (thinkingEl) {
                        thinkingEl.style.display = 'flex';
                        thinkingEl.classList.add('active');
                        const textSpan = thinkingEl.querySelector('.thinking-text');
                        const stepRaw = message.step || 'Working on your request…';
                        const stepSafe = cmEscapeHtml(stepRaw);
                        if (textSpan) {
                            textSpan.innerHTML = stepSafe + '<span class="thinking-dots">...</span>';
                        } else {
                            thinkingEl.innerHTML = '<div class="thinking-gear"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 15.5A3.5 3.5 0 0 1 8.5 12A3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5a3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97c0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.4-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1c0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z"/></svg></div><span class="thinking-text">' + stepSafe + '<span class="thinking-dots">...</span></span>';
                        }
                    }
                    var stopBtn = document.getElementById('stopButton');
                    if (stopBtn) stopBtn.style.display = 'inline-flex';
                    const container = document.getElementById('messages');
                    if (container) cmScrollMessagesIfPinned();
                } else if (message.command === 'showThinkingCitations') {
                    // Show citations during thinking
                    const thinkingEl = document.getElementById('thinking');
                    let citationsEl = document.getElementById('thinkingCitations');
                    
                    // Create citations container if it doesn't exist
                    if (thinkingEl && !citationsEl) {
                        citationsEl = document.createElement('div');
                        citationsEl.className = 'thinking-citations';
                        citationsEl.id = 'thinkingCitations';
                        // Insert after thinking-header
                        const header = thinkingEl.querySelector('.thinking-header');
                        if (header && header.nextSibling) {
                            thinkingEl.insertBefore(citationsEl, header.nextSibling);
                        } else {
                            thinkingEl.appendChild(citationsEl);
                        }
                    }
                    
                    if (thinkingEl && citationsEl && message.citations && message.citations.length > 0) {
                        citationsEl.innerHTML = '<strong>References:</strong> ' + message.citations.join(' | ');
                        citationsEl.classList.add('show');
                        thinkingEl.style.display = 'flex';
                        thinkingEl.classList.add('active');
                        const container = document.getElementById('messages');
                        if (container) cmScrollMessagesIfPinned();
                    }
                } else if (message.command === 'showThinkingAction') {
                    // Show action during thinking
                    const thinkingEl = document.getElementById('thinking');
                    let actionsEl = document.getElementById('thinkingActions');
                    
                    // Create actions container if it doesn't exist
                    if (thinkingEl && !actionsEl) {
                        actionsEl = document.createElement('div');
                        actionsEl.className = 'thinking-actions';
                        actionsEl.id = 'thinkingActions';
                        thinkingEl.appendChild(actionsEl);
                    }
                    
                    if (thinkingEl && actionsEl) {
                        const actionDiv = document.createElement('div');
                        actionDiv.className = 'thinking-action';
                        const actionSpan = document.createElement('span');
                        actionSpan.className = 'thinking-action-text';
                        actionSpan.textContent = message.action || '';
                        actionDiv.appendChild(actionSpan);
                        if (message.details) {
                            const detailsDiv = document.createElement('div');
                            detailsDiv.className = 'thinking-action-details';
                            detailsDiv.textContent = message.details;
                            actionDiv.appendChild(detailsDiv);
                        }
                        actionsEl.appendChild(actionDiv);
                        thinkingEl.style.display = 'flex';
                        thinkingEl.classList.add('active');
                        const textSpan = thinkingEl.querySelector('.thinking-text');
                        if (textSpan && message.action) {
                            textSpan.innerHTML = '';
                            textSpan.appendChild(document.createTextNode(message.action));
                            const dots = document.createElement('span');
                            dots.className = 'thinking-dots';
                            dots.textContent = '...';
                            textSpan.appendChild(dots);
                        }
                        const container = document.getElementById('messages');
                        if (container) cmScrollMessagesIfPinned();
                    }
                } else if (message.command === 'clearThinking') {
                    // Reset sub-panels only. Do NOT hide the thinking row here — that caused a blank gap
                    // (thinking disappeared before the assistant bubble rendered). hideThinking hides it.
                    const thinkingEl = document.getElementById('thinking');
                    console.log('clearThinking: thinking element exists?', !!thinkingEl);
                    if (thinkingEl) {
                        const citationsEl = document.getElementById('thinkingCitations');
                        const actionsEl = document.getElementById('thinkingActions');
                        if (citationsEl) {
                            citationsEl.innerHTML = '';
                            citationsEl.classList.remove('show');
                        }
                        if (actionsEl) {
                            actionsEl.innerHTML = '';
                        }
                        const textSpan = thinkingEl.querySelector('.thinking-text');
                        if (textSpan) {
                            textSpan.innerHTML =
                                'Ready for next step<span class="thinking-dots">...</span>';
                        }
                    }
                } else if (message.command === 'clearMessages') {
                    if (messagesContainer) {
                        while (messagesContainer.firstChild) {
                            messagesContainer.removeChild(messagesContainer.firstChild);
                        }
                    }
                    hostAttachCount = 0;
                    pendingImageAttachments = [];
                    cmUpdateAttachPreview();
                    cmClearAllContextChips();
                }
            });
            
            // Wire send/attach/form once on load (not only after switchToChatMode), so Attach works
            // when entering chat via welcome send or session restore.
            setupChatModeListeners();
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
    return wrapWebviewHtml(this.panel!.webview, html);
  }
}

