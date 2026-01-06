import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as fs from 'fs';

/**
 * AI Agent Core - The heart of CipherMate
 * 
 * This agent interprets natural language commands and orchestrates all security operations.
 * No buttons, no complexity - just tell it what you need.
 */

export interface AgentRequest {
  message: string;
  context?: {
    workspacePath?: string;
    currentFile?: string;
    previousResults?: any[];
  };
}

export interface AgentResponse {
  action: AgentAction;
  message: string;
  data?: any;
  confidence: number;
}

export enum AgentAction {
  SCAN_REPOSITORY = 'scan_repository',
  SCAN_FILE = 'scan_file',
  FIX_VULNERABILITY = 'fix_vulnerability',
  EXPLAIN_ISSUE = 'explain_issue',
  ANALYZE_CODE = 'analyze_code',
  SHOW_RESULTS = 'show_results',
  CLEAR_DATA = 'clear_data',
  SETUP_TEAM = 'setup_team',
  SHOW_DASHBOARD = 'show_dashboard',
  UNKNOWN = 'unknown'
}

export class AIAgentCore {
  private context: vscode.ExtensionContext;
  private conversationHistory: Array<{role: 'user' | 'assistant', content: string}> = [];
  private lmStudioUrl: string;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.lmStudioUrl = vscode.workspace.getConfiguration('ciphermate').get('lmStudioUrl', 'http://localhost:1234/v1/chat/completions');
  }

  /**
   * Main entry point - process user request in natural language
   */
  async processRequest(request: AgentRequest): Promise<AgentResponse> {
    // Add user message to conversation
    this.conversationHistory.push({ role: 'user', content: request.message });

    // First, try to understand intent using pattern matching for speed
    const intent = this.understandIntent(request.message);
    
    if (intent.confidence > 0.8) {
      // High confidence - execute directly
      return await this.executeAction(intent.action, request);
    }

    // Lower confidence - use AI to clarify and understand
    const aiIntent = await this.askAIForIntent(request.message, request.context);
    
    if (aiIntent.confidence > intent.confidence) {
      return await this.executeAction(aiIntent.action, request);
    }

    return intent;
  }

  /**
   * Fast pattern-based intent recognition
   */
  private understandIntent(message: string): AgentResponse {
    const lowerMessage = message.toLowerCase().trim();

    // Scan operations
    if (this.matchesPattern(lowerMessage, ['scan', 'check', 'analyze', 'audit', 'security', 'vulnerability', 'find issues'])) {
      if (this.matchesPattern(lowerMessage, ['file', 'current', 'this file'])) {
        return {
          action: AgentAction.SCAN_FILE,
          message: 'Scanning current file for security issues',
          confidence: 0.9
        };
      }
      return {
        action: AgentAction.SCAN_REPOSITORY,
        message: 'Initiating repository security scan',
        confidence: 0.9
      };
    }

    // Fix operations
    if (this.matchesPattern(lowerMessage, ['fix', 'repair', 'resolve', 'correct', 'patch', 'remediate'])) {
      return {
        action: AgentAction.FIX_VULNERABILITY,
        message: 'Preparing security fix',
        confidence: 0.85
      };
    }

    // Explain operations
    if (this.matchesPattern(lowerMessage, ['explain', 'what is', 'why', 'how', 'tell me about', 'describe'])) {
      return {
        action: AgentAction.EXPLAIN_ISSUE,
        message: 'Analyzing issue for detailed explanation',
        confidence: 0.85
      };
    }

    // Show results
    if (this.matchesPattern(lowerMessage, ['show', 'display', 'view', 'results', 'findings', 'issues', 'dashboard'])) {
      return {
        action: AgentAction.SHOW_RESULTS,
        message: 'Displaying security analysis results',
        confidence: 0.9
      };
    }

    // Clear operations
    if (this.matchesPattern(lowerMessage, ['clear', 'reset', 'delete', 'remove', 'clean'])) {
      return {
        action: AgentAction.CLEAR_DATA,
        message: 'Clearing stored data',
        confidence: 0.8
      };
    }

    // Team operations
    if (this.matchesPattern(lowerMessage, ['team', 'collaboration', 'setup team', 'team dashboard'])) {
      return {
        action: AgentAction.SETUP_TEAM,
        message: 'Configuring team collaboration',
        confidence: 0.8
      };
    }

    // Unknown - will use AI to clarify
    return {
      action: AgentAction.UNKNOWN,
      message: 'Processing your request...',
      confidence: 0.3
    };
  }

  /**
   * Use AI to understand complex or ambiguous requests
   */
  private async askAIForIntent(message: string, context?: any): Promise<AgentResponse> {
    const systemPrompt = `You are CipherMate, a security analysis AI agent. Your job is to understand what the developer needs and respond with the appropriate action.

Available actions:
- scan_repository: Scan the entire codebase for security vulnerabilities
- scan_file: Scan a specific file for security issues
- fix_vulnerability: Generate and apply security fixes
- explain_issue: Provide detailed explanation of a security issue
- analyze_code: Deep code analysis for security patterns
- show_results: Display scan results and findings
- clear_data: Clear stored scan data
- setup_team: Configure team collaboration features
- show_dashboard: Show security dashboard

Respond with ONLY a JSON object in this exact format:
{
  "action": "action_name",
  "message": "Brief description of what you'll do",
  "confidence": 0.0-1.0
}

Be direct and helpful. The developer needs security help, not complexity.`;

    const userPrompt = `Developer request: "${message}"

${context ? `Context: ${JSON.stringify(context)}` : ''}

What should I do?`;

    try {
      const response = await this.callLMStudio([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);

      // Try to parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          action: parsed.action as AgentAction || AgentAction.UNKNOWN,
          message: parsed.message || 'Processing request',
          confidence: parsed.confidence || 0.5
        };
      }

      // Fallback: analyze response text
      return this.understandIntent(response);
    } catch (error) {
      console.error('AI intent recognition failed:', error);
      return {
        action: AgentAction.UNKNOWN,
        message: 'Unable to process request. Please try rephrasing.',
        confidence: 0.1
      };
    }
  }

  /**
   * Execute the determined action
   */
  private async executeAction(action: AgentAction, request: AgentRequest): Promise<AgentResponse> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspacePath = workspaceFolders?.[0]?.uri.fsPath;

    switch (action) {
      case AgentAction.SCAN_REPOSITORY:
        return await this.scanRepository(workspacePath, request);

      case AgentAction.SCAN_FILE:
        return await this.scanFile(request.context?.currentFile, request);

      case AgentAction.FIX_VULNERABILITY:
        return await this.fixVulnerability(request);

      case AgentAction.EXPLAIN_ISSUE:
        return await this.explainIssue(request);

      case AgentAction.ANALYZE_CODE:
        return await this.analyzeCode(request);

      case AgentAction.SHOW_RESULTS:
        return await this.showResults(request);

      case AgentAction.CLEAR_DATA:
        return await this.clearData();

      case AgentAction.SETUP_TEAM:
        return await this.setupTeam(request);

      case AgentAction.SHOW_DASHBOARD:
        return await this.showDashboard(request);

      default:
        return {
          action: AgentAction.UNKNOWN,
          message: 'I didn\'t understand that. Try: "scan my code", "fix vulnerabilities", "explain this issue", or "show results"',
          confidence: 0.0
        };
    }
  }

  private async scanRepository(workspacePath: string | undefined, request: AgentRequest): Promise<AgentResponse> {
    if (!workspacePath) {
      return {
        action: AgentAction.SCAN_REPOSITORY,
        message: 'No workspace open. Please open a folder first.',
        confidence: 1.0
      };
    }

    // Trigger the actual scan (will be handled by main extension)
    vscode.commands.executeCommand('ciphermate.intelligentScan');
    
    return {
      action: AgentAction.SCAN_REPOSITORY,
      message: 'Repository scan initiated. Analyzing codebase for security vulnerabilities...',
      confidence: 1.0
    };
  }

  private async scanFile(filePath: string | undefined, request: AgentRequest): Promise<AgentResponse> {
    if (!filePath) {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        return {
          action: AgentAction.SCAN_FILE,
          message: 'No file open. Please open a file to scan.',
          confidence: 1.0
        };
      }
      filePath = activeEditor.document.uri.fsPath;
    }

    // Trigger file scan
    vscode.commands.executeCommand('ciphermate.scan');
    
    return {
      action: AgentAction.SCAN_FILE,
      message: `Scanning ${path.basename(filePath)} for security issues...`,
      confidence: 1.0
    };
  }

  private async fixVulnerability(request: AgentRequest): Promise<AgentResponse> {
    // Use AI to generate fix
    vscode.commands.executeCommand('ciphermate.generateFix');
    
    return {
      action: AgentAction.FIX_VULNERABILITY,
      message: 'Analyzing vulnerabilities and generating security fixes...',
      confidence: 0.9
    };
  }

  private async explainIssue(request: AgentRequest): Promise<AgentResponse> {
    return {
      action: AgentAction.EXPLAIN_ISSUE,
      message: 'Analyzing security issue and preparing detailed explanation...',
      confidence: 0.9
    };
  }

  private async analyzeCode(request: AgentRequest): Promise<AgentResponse> {
    return {
      action: AgentAction.ANALYZE_CODE,
      message: 'Performing deep security analysis...',
      confidence: 0.9
    };
  }

  private async showResults(request: AgentRequest): Promise<AgentResponse> {
    vscode.commands.executeCommand('ciphermate.showResults');
    
    return {
      action: AgentAction.SHOW_RESULTS,
      message: 'Displaying security analysis results',
      confidence: 1.0
    };
  }

  private async clearData(): Promise<AgentResponse> {
    vscode.commands.executeCommand('ciphermate.clearData');
    
    return {
      action: AgentAction.CLEAR_DATA,
      message: 'Cleared stored scan data',
      confidence: 1.0
    };
  }

  private async setupTeam(request: AgentRequest): Promise<AgentResponse> {
    vscode.commands.executeCommand('ciphermate.setupTeam');
    
    return {
      action: AgentAction.SETUP_TEAM,
      message: 'Opening team collaboration setup',
      confidence: 1.0
    };
  }

  private async showDashboard(request: AgentRequest): Promise<AgentResponse> {
    vscode.commands.executeCommand('ciphermate.home');
    
    return {
      action: AgentAction.SHOW_DASHBOARD,
      message: 'Displaying security dashboard',
      confidence: 1.0
    };
  }

  /**
   * Pattern matching helper
   */
  private matchesPattern(text: string, patterns: string[]): boolean {
    return patterns.some(pattern => text.includes(pattern));
  }

  /**
   * Call LM Studio API
   */
  private async callLMStudio(messages: Array<{role: string, content: string}>): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.lmStudioUrl);
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      };

      const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.choices?.[0]?.message?.content || parsed.content || '');
          } catch (e) {
            reject(new Error('Invalid response from AI'));
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify({
        model: 'local-model',
        messages: messages,
        temperature: 0.7,
        max_tokens: 500
      }));
      req.end();
    });
  }

  /**
   * Get conversation history for context
   */
  getConversationHistory(): Array<{role: 'user' | 'assistant', content: string}> {
    return this.conversationHistory;
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }
}


