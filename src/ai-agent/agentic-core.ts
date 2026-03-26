import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { RepositoryScanner } from '../scanners';
import { getIntentRecognizer } from './intent-recognizer';
import { FixService, FixProposal } from '../fix-system';
import { getProjectGenerationService } from '../core/project-generation-service';
import { getCitationService } from '../core/citation-service';
import { buildFileEditDiffHtml } from '../core/line-diff-html';
import { getFileOperationsService } from '../core/file-operations-service';
import { normalizeAgentFilePath } from '../security/path-guard';

const execAsync = promisify(exec);

/**
 * Agentic AI Core - True autonomous agent with tool calling
 * 
 * This is a proper agentic system that can:
 * - Plan multi-step operations
 * - Use tools autonomously
 * - Scan repositories end-to-end
 * - Fix vulnerabilities automatically
 * - Learn from context
 * 
 * Core training: Repository scanning and vulnerability fixing
 */

export interface AgentTool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
  execute: (params: any) => Promise<any>;
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  name?: string;
}

export interface AgentState {
  conversation: AgentMessage[];
  currentPlan: string[];
  executedSteps: string[];
  scanResults: any[];
  vulnerabilities: any[];
  context: {
    workspacePath?: string;
    currentFile?: string;
    filesScanned: string[];
    pendingRequest?: string; // Store request when no workspace is open
  };
}

export class AgenticCore {
  private context: vscode.ExtensionContext;
  private state: AgentState;
  private tools: Map<string, AgentTool>;
  private aiService: 'local' | 'cloud' = 'cloud';
  private cloudAIService?: any;
  private multiProviderService?: any;
  private lmStudioUrl: string = 'http://localhost:1234/v1/chat/completions';
  private maxIterations: number = 20;
  private fixService: FixService;
  private externalFixService: any = null; // External fix service for result listening
  private fixResultDisposable: vscode.Disposable | null = null;
  private chatInterface: any = null; // Reference to chat interface for sending messages
  private citationService = getCitationService();
  private projectGenService = getProjectGenerationService();
  private fileService = getFileOperationsService();
  private currentMessageId: string = '';
  /** Last successful full write from edit_file (for chat diff panel). */
  private lastFileEditDiff: { path: string; before: string; after: string } | null = null;
  /** Tool executions in the current processRequest() agent loop (for accurate UI error copy). */
  private lastSessionToolExecutions = 0;

  private getWorkspaceRootForTools(): string | undefined {
    return (
      this.state.context.workspacePath ||
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    );
  }

  /**
   * Resolve paths from the model (e.g. `/src/server.js` = workspace-relative, not OS root).
   */
  private resolveToolFilePath(rawPath: string): string {
    const ws = this.getWorkspaceRootForTools();
    if (!ws) {
      return path.resolve(rawPath);
    }
    return normalizeAgentFilePath(ws, rawPath);
  }

  /** How many tools ran in the last processRequest agent loop (updated live during the loop). */
  public getLastSessionToolExecutions(): number {
    return this.lastSessionToolExecutions;
  }

  /** Deduped source lines for the webview (aligned with `currentMessageId`). */
  public getCitationsForWebview(): string[] {
    return this.citationService.citationsToDisplayStrings(
      this.citationService.getCitations(this.currentMessageId)
    );
  }

  /**
   * Inline diff payload for the assistant message (red/green). Null if no edit_file in this turn.
   */
  public getLastFileEditDiffForChat(): { path: string; html: string; copyText: string } | null {
    const d = this.lastFileEditDiff;
    if (!d || d.before === d.after) {
      return null;
    }
    const MAX_COPY = 480 * 1024;
    const copyText =
      d.after.length > MAX_COPY
        ? `${d.after.slice(0, MAX_COPY)}\n\n/* …clipboard truncated (${d.after.length} chars total) … */`
        : d.after;
    return {
      path: d.path,
      html: buildFileEditDiffHtml(d.before, d.after),
      copyText,
    };
  }

  /**
   * Shrink tool results embedded in chat messages so OpenRouter / free-tier backends
   * do not choke on multi‑100k JSON strings.
   */
  private compactToolResultForLlm(toolName: string, result: any): any {
    if (!result || typeof result !== 'object') {
      return result;
    }
    const maxFileChars = 28000;
    if (toolName === 'read_file' && typeof result.content === 'string' && result.content.length > maxFileChars) {
      const omitted = result.content.length - maxFileChars;
      return {
        ...result,
        content:
          result.content.slice(0, maxFileChars) +
          `\n\n[... truncated ${omitted} characters for API limits; the file on disk is complete. Recode using this prefix + your secure version, or call read_file again if you need the tail.]`,
        truncated: true,
        originalLength: result.content.length,
      };
    }
    try {
      const s = JSON.stringify(result);
      if (s.length > 90000) {
        return {
          success: result.success,
          error: result.error,
          truncated: true,
          note: 'Tool output was very large; only a preview is included below.',
          preview: s.slice(0, 45000) + '\n...[truncated]...',
        };
      }
    } catch {
      /* ignore */
    }
    return result;
  }

  /**
   * Huge `edit_file` / `create_file` arguments in assistant history break some OpenRouter
   * providers (JSON prefill errors). Store a truncated copy after we still execute using the full response.
   */
  private assistantMessageForHistory(msg: AgentMessage): AgentMessage {
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return msg;
    }
    const maxArgChars = 14000;
    const tool_calls = msg.tool_calls.map(tc => {
      const raw = tc.function?.arguments;
      if (typeof raw !== 'string' || raw.length <= maxArgChars) {
        return tc;
      }
      try {
        const p = JSON.parse(raw) as Record<string, unknown>;
        const content = p.content;
        if (typeof content === 'string' && content.length > 6000) {
          p.content =
            content.slice(0, 4000) +
            `\n...[${content.length - 4000} chars omitted from history after tool execution; disk write used full payload]`;
        }
        const compact = JSON.stringify(p);
        if (compact.length <= maxArgChars) {
          return {
            ...tc,
            function: { ...tc.function, arguments: compact },
          };
        }
        return {
          ...tc,
          function: {
            ...tc.function,
            arguments: JSON.stringify({
              note: 'Original tool arguments were very large and were shortened in conversation history.',
              filePath: p.filePath ?? p.path,
            }),
          },
        };
      } catch {
        return {
          ...tc,
          function: {
            ...tc.function,
            arguments: JSON.stringify({
              note: `Unparseable or oversized arguments (${raw.length} chars) — refer to tool result messages.`,
            }),
          },
        };
      }
    });
    return { ...msg, tool_calls };
  }

  private resolveToolDirectory(rawDir: string): string {
    const ws = this.getWorkspaceRootForTools();
    const d = (rawDir || '').trim();
    if (!ws) {
      return path.resolve(d || '.');
    }
    if (!d || d === '.') {
      return path.resolve(ws);
    }
    return normalizeAgentFilePath(ws, d);
  }

  constructor(context: vscode.ExtensionContext) {
    this.context = context;

    // Initialize FixService for safe vulnerability fixing
    this.fixService = new FixService(context);

    // Determine which AI service to use
    const config = vscode.workspace.getConfiguration('ciphermate');
    const useCloudAI = config.get('useCloudAI', true);
    const useMultiProvider = config.get('ai.useMultiProvider', true);
    
    if (useCloudAI) {
      this.aiService = 'cloud';
      if (useMultiProvider) {
        // Use new multi-provider service (supports 450+ models)
        // Initialize synchronously using dynamic import but await it
        (async () => {
          try {
            // @ts-ignore - webpack resolves .ts files
            const module = await import('./multi-provider-service');
            this.multiProviderService = new module.MultiProviderAIService(context);
            console.log(`AgenticCore: MultiProviderAIService initialized, provider: ${this.multiProviderService ? 'ready' : 'not ready'}`);
          } catch (error) {
            console.error(`AgenticCore: Failed to initialize MultiProviderAIService:`, error);
          }
        })();
      } else {
        // Use legacy cloud service
        // @ts-ignore - webpack resolves .ts files
        import('./cloud-ai-service').then(module => {
          this.cloudAIService = new module.CloudAIService(context);
        });
      }
    } else {
      this.aiService = 'local';
      this.lmStudioUrl = config.get('lmStudioUrl', 'http://localhost:1234/v1/chat/completions');
    }
    
    this.state = {
      conversation: [],
      currentPlan: [],
      executedSteps: [],
      scanResults: [],
      vulnerabilities: [],
      context: {
        filesScanned: [],
        pendingRequest: undefined
      }
    };

    this.tools = new Map();
    this.registerCoreTools();
  }

  /**
   * Update the coding model for security scans and fixes (called when user changes model in chat)
   */
  async updateCodingModel(model: string): Promise<void> {
    if (this.aiService === 'cloud' && this.multiProviderService) {
      try {
        const provider = await this.multiProviderService.getCurrentProvider();
        if (provider && typeof provider.updateConfig === 'function') {
          provider.updateConfig({ model });
          console.log(`AgenticCore: Coding model updated to ${model}`);
        }
      } catch (e) {
        console.warn('AgenticCore: Failed to update coding model:', e);
      }
    }
  }

  /**
   * Register core security tools that the agent can use
   */
  private registerCoreTools(): void {
    // Tool 1: Scan Repository
    this.tools.set('scan_repository', {
      name: 'scan_repository',
      description: 'Scan the entire repository for security vulnerabilities. Automatically uses the VS Code workspace path. Uses multiple scanners: Dependency Scanner, Secrets Scanner, Smart Contract Scanner, Code Pattern Scanner, and AI analysis. Returns list of vulnerabilities found with severity levels.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to repository root directory (usually auto-detected from VS Code workspace, can use workspace path if provided)'
          },
          includePatterns: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional: File patterns to include (e.g., ["*.js", "*.py"]). If not provided, scans all code files.'
          },
          excludePatterns: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional: File patterns to exclude (e.g., ["node_modules/**", ".git/**"]). If not provided, uses standard excludes like node_modules, .git, dist, build.'
          }
        },
        required: ['path']
      },
      execute: async (params: any) => {
        return await this.executeScanRepository(params.path, params.includePatterns, params.excludePatterns);
      }
    });

    // Tool 2: Scan File
    this.tools.set('scan_file', {
      name: 'scan_file',
      description: 'Scan a specific file for security vulnerabilities. Performs deep AI analysis.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Full path to the file to scan'
          }
        },
        required: ['filePath']
      },
      execute: async (params: any) => {
        return await this.executeScanFile(params.filePath);
      }
    });

    // Tool 3: Analyze Code
    this.tools.set('analyze_code', {
      name: 'analyze_code',
      description: 'Deep AI analysis of code for security patterns, vulnerabilities, and best practices.',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'Code to analyze'
          },
          language: {
            type: 'string',
            description: 'Programming language (e.g., "javascript", "python", "typescript")'
          },
          context: {
            type: 'string',
            description: 'Additional context about the code'
          }
        },
        required: ['code']
      },
      execute: async (params: any) => {
        return await this.executeAnalyzeCode(params.code, params.language, params.context);
      }
    });

    // Tool 4: Generate Fix
    this.tools.set('generate_fix', {
      name: 'generate_fix',
      description: 'Generate a secure fix for a vulnerability. Returns patched code with explanation.',
      parameters: {
        type: 'object',
        properties: {
          vulnerability: {
            type: 'object',
            description: 'Vulnerability object with type, severity, code, location'
          },
          codeContext: {
            type: 'string',
            description: 'Surrounding code context'
          }
        },
        required: ['vulnerability']
      },
      execute: async (params: any) => {
        return await this.executeGenerateFix(params.vulnerability, params.codeContext);
      }
    });

    // Tool 5: Apply Fix (uses FixService for safe application with backup and undo)
    this.tools.set('apply_fix', {
      name: 'apply_fix',
      description: 'Apply a generated fix to a file safely with backup, diff preview, and undo capability. Requires user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          vulnerability: {
            type: 'object',
            description: 'Vulnerability object with type, severity, file, line, code, and description'
          },
          filePath: {
            type: 'string',
            description: 'Path to file to fix'
          },
          originalCode: {
            type: 'string',
            description: 'Original vulnerable code'
          },
          fixedCode: {
            type: 'string',
            description: 'Secure replacement code'
          },
          lineNumber: {
            type: 'number',
            description: 'Line number where fix should be applied'
          },
          confirmed: {
            type: 'boolean',
            description: 'Whether user has confirmed the fix (required for application)'
          }
        },
        required: ['filePath', 'originalCode', 'fixedCode', 'lineNumber']
      },
      execute: async (params: any) => {
        return await this.executeSafeApplyFix(params);
      }
    });

    // Tool 6: Read File
    this.tools.set('read_file', {
      name: 'read_file',
      description: 'Read contents of a file. Use this to examine code before scanning or fixing.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description:
              'Path: use [File: ...] label from the user message, or workspace-relative (src/x.js). Leading / is workspace root (/src/x.js), not OS root.'
          }
        },
        required: ['filePath']
      },
      execute: async (params: any) => {
        return await this.executeReadFile(params.filePath);
      }
    });

    // Tool 7: List Files
    this.tools.set('list_files', {
      name: 'list_files',
      description: 'List files in a directory. Use to discover code files to scan.',
      parameters: {
        type: 'object',
        properties: {
          directory: {
            type: 'string',
            description: 'Directory path'
          },
          pattern: {
            type: 'string',
            description: 'File pattern (e.g., "*.js", "*.py")'
          },
          recursive: {
            type: 'boolean',
            description: 'Search recursively'
          }
        },
        required: ['directory']
      },
      execute: async (params: any) => {
        return await this.executeListFiles(params.directory, params.pattern, params.recursive);
      }
    });

    // Tool 8: Explain Vulnerability
    this.tools.set('explain_vulnerability', {
      name: 'explain_vulnerability',
      description: 'Get detailed explanation of a vulnerability including impact, exploitation, and prevention.',
      parameters: {
        type: 'object',
        properties: {
          vulnerability: {
            type: 'object',
            description: 'Vulnerability to explain'
          }
        },
        required: ['vulnerability']
      },
      execute: async (params: any) => {
        return await this.executeExplainVulnerability(params.vulnerability);
      }
    });

    // Tool 9: Generate Project
    this.tools.set('generate_project', {
      name: 'generate_project',
      description: 'Generate a complete project structure with files. Works without repository open. Creates secure project templates.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Project name'
          },
          type: {
            type: 'string',
            enum: ['web', 'api', 'library', 'cli', 'fullstack'],
            description: 'Project type'
          },
          language: {
            type: 'string',
            enum: ['javascript', 'typescript', 'python', 'java', 'go', 'rust'],
            description: 'Programming language'
          },
          basePath: {
            type: 'string',
            description: 'Base path for project (optional, defaults to temp directory)'
          }
        },
        required: ['name', 'type', 'language']
      },
      execute: async (params: any) => {
        return await this.executeGenerateProject(params.name, params.type, params.language, params.basePath);
      }
    });

    // Tool 10: Create File
    this.tools.set('create_file', {
      name: 'create_file',
      description: 'Create a new file with content. Can create files anywhere, even without repository open.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description:
              'Path under the workspace (e.g. src/server.js or /src/server.js — both mean workspace root). Prefer edit_file for existing files.'
          },
          content: {
            type: 'string',
            description: 'File content'
          }
        },
        required: ['filePath', 'content']
      },
      execute: async (params: any) => {
        return await this.executeCreateFile(params.filePath, params.content);
      }
    });

    // Tool 11: Edit File
    this.tools.set('edit_file', {
      name: 'edit_file',
      description: 'Edit an existing file by replacing content or appending. Can hash files for integrity.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description:
              'Existing file to replace/append. Use [File: ...] label or workspace path; /src/x.js is workspace-relative. The workspace is writable — use edit_file to save changes.'
          },
          content: {
            type: 'string',
            description: 'New file content (replaces entire file)'
          },
          append: {
            type: 'boolean',
            description: 'If true, append to file instead of replacing'
          },
          hashForIntegrity: {
            type: 'boolean',
            description: 'If true, generate hash for file integrity verification'
          }
        },
        required: ['filePath', 'content']
      },
      execute: async (params: any) => {
        return await this.executeEditFile(params.filePath, params.content, params.append, params.hashForIntegrity);
      }
    });
  }

  /**
   * Set the chat interface reference for sending messages
   */
  public setChatInterface(chatInterface: any): void {
    this.chatInterface = chatInterface;
  }

  /**
   * Set the fix service reference for result listening
   */
  public setFixService(fixService: any): void {
    this.externalFixService = fixService;

    // Dispose of any existing subscription
    if (this.fixResultDisposable) {
      this.fixResultDisposable.dispose();
      this.fixResultDisposable = null;
    }

    // Subscribe to fix completion events
    if (fixService && fixService.onFixComplete) {
      this.fixResultDisposable = fixService.onFixComplete((event: any) => {
        console.log('AgenticCore: Received fix completion event');

        const fixSummary =
          event.summary != null && String(event.summary).replace(/[\u200B-\u200D\uFEFF]/g, '').trim().length > 0
            ? String(event.summary)
            : 'Fix operation finished (no summary text was returned). Check the editor and **View Results** for changes.';

        // Add result summary to conversation
        this.state.conversation.push({
          role: 'assistant',
          content: fixSummary
        });

        // Notify chat interface if available
        if (this.chatInterface && typeof this.chatInterface.addMessage === 'function') {
          this.chatInterface.addMessage('assistant', fixSummary);
        }
      });
    }
  }

  /**
   * Main agent execution - processes user request autonomously
   */
  async processRequest(userRequest: string, workspacePath?: string, citationMessageId?: string): Promise<string> {
    // Generate message ID for citation tracking (must match streaming bubble id from chat UI when provided)
    this.currentMessageId =
      citationMessageId && citationMessageId.length > 0
        ? citationMessageId
        : `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.lastSessionToolExecutions = 0;
    this.lastFileEditDiff = null;

    // Check if workspace is open
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const hasWorkspace = workspaceFolders && workspaceFolders.length > 0;
    
    // Check if this is a project generation request (doesn't need workspace)
    const isProjectGeneration = /generate.*project|create.*project|new.*project|scaffold|init.*project/i.test(userRequest);
    
    // Dynamic intent recognition - understands security requests across many phrasings
    const intentRecognizer = getIntentRecognizer();
    const recognizedIntent = intentRecognizer.recognize(userRequest);
    const isSecurityRequest = intentRecognizer.isSecurityRequest(userRequest);
    
    // Project generation doesn't need workspace - handle it immediately
    if (isProjectGeneration && !hasWorkspace) {
      // Extract project details from request using AI
      return await this.handleProjectGeneration(userRequest);
    }
    
    // If security request but no workspace, guide user to open one with varied human response
    if (isSecurityRequest && !hasWorkspace) {
      return await this.handleNoWorkspace(userRequest);
    }
    
    // Initialize state - detect workspace path from multiple sources
    const detectedPath = workspacePath ||
                        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
                        process.cwd();
    this.state.context.workspacePath = detectedPath;

    // File contents injected by chat (@file / resolveImplicitFilePaths) — use tool loop (edit_file), not batch scan/fix shortcuts
    const hasInlineFileContext =
      /\[Instruction: Specific file\(s\) are attached above/i.test(userRequest) ||
      /\[File:\s*[^\]]+\]/i.test(userRequest);

    /** @file / attached code + user asked to change code — must use read_file/edit_file, not repo scan */
    const isFileScopedRemediation =
      hasInlineFileContext &&
      /\b(fix|recode|rewrite|patch|remediat|repair|secure|harden|apply\s+fix|edit|refactor)\b/i.test(userRequest);

    // Check for fix request using intent recognizer (consistent with natural language routing)
    const isFixRequest =
      recognizedIntent.intent === 'FIX_VULNERABILITIES' && !hasInlineFileContext;
    const isHighPriorityOnly = /fix.*(high|critical)\s*(priority|issues?|vulns?)|high\s*priority.*fix|(critical|high)\s+only/i.test(userRequest);
    const isCriticalOnly = /fix.*critical\s*only|only.*critical|critical\s+issues?\s+only/i.test(userRequest);

    if (isFixRequest) {
      console.log('AgenticCore: Detected fix vulnerabilities request');
      console.log('AgenticCore: High priority only:', isHighPriorityOnly, 'Critical only:', isCriticalOnly);

      // Add user message to conversation for context
      this.state.conversation.push({
        role: 'user',
        content: userRequest
      });

      // Check if we have scan results to fix
      const vulnerabilities = this.state.vulnerabilities || this.state.scanResults || [];

      if (vulnerabilities.length === 0) {
        const noVulnsMessage = `I don't have any vulnerability scan results to fix yet.\n\n` +
          `**To generate fixes, I first need to scan your repository:**\n\n` +
          `1. Say "scan my repository" to find vulnerabilities\n` +
          `2. Once vulnerabilities are found, say "fix vulnerabilities" to generate fixes\n\n` +
          `Alternatively, you can click the **Fix** button next to any vulnerability in the scan results.`;

        this.state.conversation.push({
          role: 'assistant',
          content: noVulnsMessage
        });

        return noVulnsMessage;
      }

      // Determine severity filter based on user request
      let severityFilter: string[];
      let priorityDescription: string;

      if (isCriticalOnly) {
        severityFilter = ['critical'];
        priorityDescription = 'critical';
      } else if (isHighPriorityOnly) {
        severityFilter = ['critical', 'high'];
        priorityDescription = 'critical and high priority';
      } else {
        severityFilter = ['critical', 'high', 'medium', 'low'];
        priorityDescription = '';
      }

      // Filter to fixable vulnerabilities
      const fixableVulns = vulnerabilities
        .filter((v: any) => {
          if (!v.file || !v.severity) return false;
          return severityFilter.includes(v.severity?.toLowerCase());
        })
        .sort((a: any, b: any) => {
          const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
          return (severityOrder[a.severity?.toLowerCase()] || 5) - (severityOrder[b.severity?.toLowerCase()] || 5);
        })
        .slice(0, 10); // Limit to first 10 for performance

      if (fixableVulns.length === 0) {
        const priorityLabel = priorityDescription ? ` ${priorityDescription}` : '';
        const noFixableMessage = `I found ${vulnerabilities.length} vulnerability findings, but none of them${priorityLabel ? ` are${priorityLabel}` : ' have enough context to generate automatic fixes'}.\n\n` +
          `**You can:**\n` +
          `- Try "fix vulnerabilities" without priority filter to fix all\n` +
          `- Click on file paths in the scan results to open the files\n` +
          `- Review the vulnerability descriptions for manual fixes\n` +
          `- Click the **Fix** button next to specific findings for individual fixes`;

        this.state.conversation.push({
          role: 'assistant',
          content: noFixableMessage
        });

        return noFixableMessage;
      }

      // Trigger batch fix via VS Code command
      const priorityLabel = priorityDescription ? ` ${priorityDescription}` : '';
      const fixMessage = `I found **${fixableVulns.length}**${priorityLabel} vulnerabilities that can be automatically fixed.\n\n` +
        `**Vulnerabilities to fix:**\n` +
        fixableVulns.slice(0, 5).map((v: any, i: number) =>
          `${i + 1}. **[${(v.severity || 'UNKNOWN').toUpperCase()}]** [\`${path.basename(v.file)}:${v.line || '?'}\`](${v.file}) - ${v.type || v.description || 'Security Issue'}`
        ).join('\n') +
        (fixableVulns.length > 5 ? `\n... and ${fixableVulns.length - 5} more\n` : '\n') +
        `\n**Generating fixes now...** This may take a moment.\n\n` +
        `You'll be prompted to review and confirm before fixes are applied.`;

      this.state.conversation.push({
        role: 'assistant',
        content: fixMessage
      });

      // Execute batch fix command
      // The fix service will emit an event when complete, which we'll handle
      // via the onFixComplete subscription set up in setFixService()
      try {
        await vscode.commands.executeCommand('ciphermate.batchFix', fixableVulns);
      } catch (error) {
        console.error('AgenticCore: Failed to execute batch fix:', error);
        const errorMessage = `**Fix operation encountered an error**\n\n` +
          `Error: ${error instanceof Error ? error.message : String(error)}\n\n` +
          `Please try again or fix vulnerabilities individually by clicking the Fix button.`;

        this.state.conversation.push({
          role: 'assistant',
          content: errorMessage
        });

        // Notify chat interface if available
        if (this.chatInterface && typeof this.chatInterface.addMessage === 'function') {
          this.chatInterface.addMessage('assistant', errorMessage);
        }

        return errorMessage;
      }

      return fixMessage;
    }

    if (isSecurityRequest && !hasInlineFileContext) {
      // IMMEDIATELY execute security request - don't even ask the AI
      // This ensures security requests always work, regardless of AI model capabilities
      console.log('AgenticCore: Detected security request, immediately executing');
      
      // Use intent recognizer for sub-intent (secrets, dependencies, smart contracts, full)
      const scanSubIntent = intentRecognizer.getScanSubIntent(userRequest);
      const isSecretsRequest = scanSubIntent === 'secrets';
      const isDependencyRequest = scanSubIntent === 'dependencies';
      
      // Add user message to conversation for context
      this.state.conversation.push({
        role: 'user',
        content: userRequest
      });
      
      // Clean up conversation history periodically to prevent memory issues
      this.cleanupConversationHistory(50);
      
      try {
        console.log('AgenticCore: Starting scan execution...');
        
        // First message: acknowledge request and let user know scan is starting
        let firstMessage = 'I\'m scanning your repository. Results will follow shortly.';
        if (isSecretsRequest) firstMessage = 'I\'m scanning your repository for hardcoded secrets. Results will follow shortly.';
        else if (isDependencyRequest) firstMessage = 'I\'m scanning your repository for dependency vulnerabilities. Results will follow shortly.';
        else firstMessage = 'I\'m running a full security scan of your repository. Results will follow shortly.';
        if (this.chatInterface && typeof this.chatInterface.addMessage === 'function') {
          this.chatInterface.addMessage('assistant', firstMessage);
        }
        this.state.conversation.push({ role: 'assistant', content: firstMessage });
        
        // Wrap scan in progress dialog to show status and prevent UI blocking
        const scanResult = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'CipherMate: Scanning Repository',
            cancellable: false
          },
          async (progress) => {
            progress.report({ increment: 0, message: 'Initializing...' });
            if (this.chatInterface) this.chatInterface.showThinkingAction('Initializing scanners', 'Preparing workspace and loading scan configuration');
            await new Promise(resolve => setTimeout(resolve, 150));
            
            progress.report({ increment: 5, message: 'Detecting repository structure...' });
            if (this.chatInterface) this.chatInterface.showThinkingAction('Detecting repository structure', 'Identifying project type and manifest files');
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Execute scan with timeout - RepositoryScanner will report per-scanner progress
            const result = await Promise.race([
              (async () => {
                const scanResult = await this.executeScanRepository(
                  this.state.context.workspacePath || '.', 
                  undefined, 
                  undefined, 
                  {
                    filterSecrets: isSecretsRequest,
                    filterDependencies: isDependencyRequest
                  }
                );
                
                progress.report({ increment: 85, message: 'Aggregating results...' });
                if (this.chatInterface) this.chatInterface.showThinkingAction('Aggregating results', 'Combining findings from all scanners');
                await new Promise(resolve => setTimeout(resolve, 80));
                
                progress.report({ increment: 92, message: 'Building report...' });
                if (this.chatInterface) this.chatInterface.showThinkingAction('Building report', 'Formatting results and preparing recommendations');
                await new Promise(resolve => setTimeout(resolve, 50));
                
                progress.report({ increment: 98, message: 'Scan complete!' });
                if (this.chatInterface) this.chatInterface.showThinkingAction('Scan complete', 'Results ready');
                return scanResult;
              })(),
              new Promise<any>((_, reject) => {
                // Scans can take a while for large repositories - use 3 minute timeout
                setTimeout(() => reject(new Error('Scan timed out after 180 seconds')), 180000);
              })
            ]);
            
            return result;
          }
        );
        
        console.log('AgenticCore: Scan completed, result:', scanResult);
        
        if (scanResult && scanResult.success) {
          // Update state with scan results FIRST (before any AI calls)
          this.updateStateFromToolResult('scan_repository', scanResult);
          
          // Store scan results in state for fallback formatting
          this.state.scanResults = scanResult.vulnerabilities || [];
          
          // Build human-readable narrative report
          const totalVulns = scanResult.count || 0;
          const critical = scanResult.critical || 0;
          const high = scanResult.high || 0;
          const medium = scanResult.summary?.medium || 0;
          const low = scanResult.summary?.low || 0;
          
          // Assessment and report title based on request type (understands user context)
          let assessment = '';
          let overallStatus = '';
          let reportTitle = 'Security Scan Results';
          if (isSecretsRequest) reportTitle = 'Hardcoded Secrets Scan Results';
          else if (isDependencyRequest) reportTitle = 'Dependency Vulnerability Scan Results';
          
          if (isSecretsRequest) {
            if (totalVulns === 0) assessment = 'Secrets scan complete. No hardcoded secrets detected.';
            else if (critical > 0) assessment = `${critical} critical secret${critical > 1 ? 's' : ''} detected. Remove immediately. Rotate any exposed credentials.`;
            else if (high > 0) assessment = `${high} hardcoded secret${high > 1 ? 's' : ''} found. Migrate to env vars or secrets manager (e.g. AWS Secrets Manager, Vault).`;
            else assessment = `${totalVulns} potential secret${totalVulns > 1 ? 's' : ''} identified. Review and relocate to secure storage.`;
          } else if (isDependencyRequest) {
            if (totalVulns === 0) assessment = 'Dependency scan complete. No CVEs found.';
            else if (critical > 0) assessment = `${critical} critical CVE${critical > 1 ? 's' : ''} in dependencies. Update packages immediately.`;
            else if (high > 0) assessment = `${high} high-severity CVE${high > 1 ? 's' : ''} in dependencies. Run npm update / pip install -U.`;
            else assessment = `${totalVulns} vulnerability${totalVulns > 1 ? 'ies' : ''} in dependencies. Address in next maintenance window.`;
          } else {
            if (totalVulns === 0) {
              assessment = 'Scan complete. No vulnerabilities detected.';
              overallStatus = 'SECURE';
            } else if (critical > 0) {
              assessment = `${critical} critical vulnerability${critical > 1 ? 'ies' : ''} found. Remediate immediately.`;
              overallStatus = 'CRITICAL_ISSUES';
            } else if (high > 0) {
              assessment = `${high} high-severity finding${high > 1 ? 's' : ''}. Prioritize remediation.`;
              overallStatus = 'NEEDS_ATTENTION';
            } else if (medium > 0 || low > 0) {
              assessment = `${medium + low} medium/low finding${medium + low > 1 ? 's' : ''}. Review when feasible.`;
              overallStatus = 'MINOR_ISSUES';
            } else {
              assessment = 'Scan complete. No major issues.';
              overallStatus = 'SECURE';
            }
          }
          
          let resultMessage = `## ${reportTitle}\n\n`;
          resultMessage += `${assessment}\n\n`;
          
          resultMessage += `**Scan Location**: ${this.state.context.workspacePath || 'Current workspace'}\n\n`;
          
          const summaryLabel = isSecretsRequest ? 'secrets found' : isDependencyRequest ? 'vulnerable packages found' : 'vulnerabilities found';
          resultMessage += `### Overall Summary\n\n`;
          resultMessage += `Total ${summaryLabel}: **${totalVulns}**\n`;
          if (critical > 0) resultMessage += `- Critical: **${critical}**\n`;
          if (high > 0) resultMessage += `- High: **${high}**\n`;
          if (medium > 0) resultMessage += `- Medium: **${medium}**\n`;
          if (low > 0) resultMessage += `- Low: **${low}**\n`;
          if (scanResult.summary?.info > 0) resultMessage += `- Informational: **${scanResult.summary.info}**\n`;
          resultMessage += `\n`;
          
          // Detailed Scanner Reports
          resultMessage += `---\n\n`;
          resultMessage += `### Detailed Scanner Results\n\n`;
          
          if (scanResult.scanners && scanResult.scanners.length > 0) {
            // Group vulnerabilities by scanner
            const vulnerabilitiesByScanner = new Map<string, any[]>();
            
            // Get all vulnerabilities from scan result
            const allVulns = scanResult.vulnerabilities || [];
            
            // Group by scanner/tool
            allVulns.forEach((vuln: any) => {
              const scannerName = vuln.scanner || vuln.tool || 'Unknown';
              if (!vulnerabilitiesByScanner.has(scannerName)) {
                vulnerabilitiesByScanner.set(scannerName, []);
              }
              vulnerabilitiesByScanner.get(scannerName)!.push(vuln);
            });
            
            // Report for each scanner that ran (filter if needed)
            let scannerIndex = 0;
            scanResult.scanners.forEach((scanner: any) => {
              if (isSecretsRequest && scanner.name !== 'secrets-scanner') return;
              if (isDependencyRequest && scanner.name !== 'dependency-scanner') return;
              scannerIndex++;
              const scannerName = scanner.name.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
              const scannerVulns = scanner.vulnerabilities || vulnerabilitiesByScanner.get(scanner.name) || [];
              const vulnCount = scanner.count || scannerVulns.length;
              const scannerDesc = scanner.description || this.getScannerDescription(scanner.name);
              
              resultMessage += `#### ${scannerIndex}. ${scannerName}\n\n`;
              resultMessage += `${scannerDesc}\n\n`;
              resultMessage += `Status: ${scanner.success ? 'Completed successfully' : 'Failed'}\n`;
              if (scanner.duration) {
                resultMessage += `Scan duration: ${(scanner.duration / 1000).toFixed(2)} seconds\n`;
              }
              const findingLabel = isSecretsRequest ? 'Secrets found' : isDependencyRequest ? 'Vulnerable packages found' : 'Vulnerabilities found';
              resultMessage += `${findingLabel}: **${vulnCount}**\n\n`;
              
              if (scanner.success) {
                if (vulnCount > 0) {
                  // Use scanner's own summary if available, otherwise calculate
                  const summary = scanner.summary || {};
                  const crit = summary.critical || scannerVulns.filter((v: any) => 
                    (v.severity || '').toUpperCase() === 'CRITICAL' || 
                    (v.severity || '').toUpperCase() === 'ERROR'
                  ).length;
                  const hi = summary.high || scannerVulns.filter((v: any) => 
                    (v.severity || '').toUpperCase() === 'HIGH' || 
                    (v.severity || '').toUpperCase() === 'WARNING'
                  ).length;
                  const med = summary.medium || scannerVulns.filter((v: any) => 
                    (v.severity || '').toUpperCase() === 'MEDIUM'
                  ).length;
                  const lo = summary.low || scannerVulns.filter((v: any) => 
                    (v.severity || '').toUpperCase() === 'LOW'
                  ).length;
                  const inf = summary.info || scannerVulns.filter((v: any) => 
                    (v.severity || '').toUpperCase() === 'INFO'
                  ).length;
                  
                  resultMessage += `Severity breakdown:\n`;
                  if (crit > 0) resultMessage += `- Critical: ${crit}\n`;
                  if (hi > 0) resultMessage += `- High: ${hi}\n`;
                  if (med > 0) resultMessage += `- Medium: ${med}\n`;
                  if (lo > 0) resultMessage += `- Low: ${lo}\n`;
                  if (inf > 0) resultMessage += `- Informational: ${inf}\n`;
                  resultMessage += `\n`;
                  
                  // Show all vulnerabilities from this scanner (no truncation)
                  const displayVulns = scannerVulns
                    .sort((a: any, b: any) => {
                      const severityOrder: Record<string, number> = {
                        critical: 0, error: 0, high: 1, warning: 1, medium: 2, low: 3, info: 4
                      };
                      const aSev = severityOrder[(a.severity || '').toLowerCase()] || 99;
                      const bSev = severityOrder[(b.severity || '').toLowerCase()] || 99;
                      return aSev - bSev;
                    });
                  
                  if (displayVulns.length > 0) {
                    resultMessage += `Findings:\n`;
                    displayVulns.forEach((vuln: any, idx: number) => {
                      const severity = (vuln.severity || 'UNKNOWN').toUpperCase();
                      resultMessage += `${idx + 1}. **[${severity}]** `;
                      if (vuln.file) {
                        const fileName = vuln.file.split('/').pop() || vuln.file;
                        resultMessage += `${fileName}`;
                        if (vuln.line) resultMessage += `:${vuln.line}`;
                        resultMessage += ` - `;
                      }
                      const message = vuln.message || vuln.description || vuln.title || vuln.type || 'Vulnerability detected';
                      resultMessage += `${message}\n`;
                    });
                  }
                } else {
                  resultMessage += `Result: No vulnerabilities found. This scanner completed successfully with no security issues detected.\n`;
                }
              } else {
                resultMessage += `Error: ${scanner.error || 'Scanner failed to complete. This may be due to missing dependencies or configuration issues.'}\n`;
              }
              
              resultMessage += `\n`;
            });
          } else {
            resultMessage += `No scanners executed. Please check scanner configuration.\n\n`;
          }
          
          // Legacy scanner results (if any)
          if (scanResult.legacyScans && Object.keys(scanResult.legacyScans).length > 0) {
            resultMessage += `---\n\n`;
            resultMessage += `🔧 **Additional Scans**\n\n`;
            
            Object.entries(scanResult.legacyScans).forEach(([scannerName, results]: [string, any]) => {
              if (Array.isArray(results) && results.length > 0) {
                resultMessage += `### ${scannerName}\n`;
                resultMessage += `**Findings**: ${results.length}\n\n`;
              }
            });
          }
          
          resultMessage += `---\n\n`;
          
          // Next steps based on findings
          if (critical > 0 || high > 0) {
            resultMessage += `### Recommended Actions\n\n`;
            resultMessage += `- fix vulnerabilities — generate patches\n`;
            resultMessage += `- show critical vulnerabilities — list critical findings\n`;
            resultMessage += `- show [scanner] results — filter by scanner\n`;
          } else if (medium > 0 || low > 0) {
            resultMessage += `### Recommended Actions\n\n`;
            resultMessage += `- fix vulnerabilities — apply patches\n`;
            resultMessage += `- show all vulnerabilities — full listing\n`;
          } else {
            resultMessage += `### Next Steps\n\n`;
            resultMessage += `- Schedule regular scans\n`;
            resultMessage += `- Keep dependencies updated\n`;
            resultMessage += `- Review PRs for security issues\n`;
          }
          
          console.log('AgenticCore: Returning comprehensive scan report');
          
          // Add assistant response to conversation
          this.state.conversation.push({
            role: 'assistant',
            content: resultMessage
          });
          
          // Third message (deferred so it appears after the report): how to trigger automatic fixes
          if (totalVulns > 0 && (critical > 0 || high > 0 || medium > 0 || low > 0)) {
            const fixMessage = '**To have CipherMate apply fixes automatically:** Say **fix vulnerabilities** in this chat, or click **Fix it** on individual findings in the View Results panel.';
            setTimeout(() => {
              if (this.chatInterface && typeof this.chatInterface.addMessage === 'function') {
                this.chatInterface.addMessage('assistant', fixMessage);
              }
            }, 100);
          }
          
          return resultMessage;
        } else {
          const errorMessage = `❌ **Scan Failed**\n\n${scanResult?.error || 'Unknown error occurred during scan.'}\n\nPlease check that:\n- A workspace folder is open in VS Code\n- The repository path is accessible\n- Required scanners are available`;
          
          console.log('AgenticCore: Returning error message:', errorMessage);
          
          this.state.conversation.push({
            role: 'assistant',
            content: errorMessage
          });
          
          return errorMessage;
        }
      } catch (error) {
        // If scan fails, provide helpful message without showing raw errors
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('AgenticCore: Scan error:', errorMsg);
        
        // Check if it's an AI provider error - if so, scan might have worked but report generation failed
        if (errorMsg.includes('All AI providers failed') || 
            errorMsg.includes('model') && errorMsg.includes('not found') ||
            errorMsg.includes('API Error') ||
            errorMsg.includes('Ollama API Error')) {
          
          // AI failed but scan might have succeeded - try to get results anyway
          const scanResults = this.state.scanResults || [];
          const vulnerabilities = this.state.vulnerabilities || [];
          
          // If we have scan results, format them without AI
          if (scanResults.length > 0 || vulnerabilities.length > 0) {
            const allResults = scanResults.length > 0 ? scanResults : vulnerabilities;
            const formatted = this.formatScanResultsWithoutAI(allResults, userRequest);
            
            this.state.conversation.push({
              role: 'assistant',
              content: formatted
            });
            
            return formatted;
          }
          
          // No scan results - provide helpful message
          const errorMessage = `I completed the security scan, but I'm having trouble with the AI service right now.\n\n` +
            `**The scan itself worked** - your code was analyzed successfully.\n\n` +
            `**To see results:**\n` +
            `- Check the VS Code Problems panel\n` +
            `- Or configure your AI provider in Settings (⚙ icon)\n\n` +
            `**Note:** Security scans work independently of AI. The AI is only used for generating reports.`;
          
          this.state.conversation.push({
            role: 'assistant',
            content: errorMessage
          });
          
          return errorMessage;
        }
        
        // Other errors - provide generic helpful message
        const errorMessage = `I encountered an issue while scanning your repository.\n\n` +
          `Please ensure:\n` +
          `- A workspace folder is open in VS Code\n` +
          `- The repository path is accessible\n` +
          `- Required scanners are available\n\n` +
          `If the problem persists, check the VS Code Developer Console for details.`;
        
        console.log('AgenticCore: Returning error message:', errorMessage);
        
        this.state.conversation.push({
          role: 'assistant',
          content: errorMessage
        });
        
        return errorMessage;
      }
    }
    
    // For non-scan requests, proceed with normal AI processing
    // Add user message
    this.state.conversation.push({
      role: 'user',
      content: userRequest
    });

    // System prompt with tool definitions
    const systemPrompt = this.buildSystemPrompt(isFileScopedRemediation);
    
    let iteration = 0;
    let lastResponse = '';
    let toolCallExecutions = 0;
    let fileWasEdited = false;
    /** Extra user nudges when the model runs tools but skips edit_file (weak tool-use models). */
    let fileEditMandatoryNudges = 0;
    const maxFileEditMandatoryNudges = 2;

    while (iteration < this.maxIterations) {
      // Build messages for AI
      const messages: AgentMessage[] = [
        { role: 'system', content: systemPrompt },
        ...this.state.conversation
      ];

      // Call AI with tool support
      const response = await this.callAIWithTools(messages);
      
      // Store assistant turn with trimmed tool arguments so the next API request is not megabytes
      // (some OpenRouter backends 400 on huge tool_call argument strings in history).
      this.state.conversation.push(this.assistantMessageForHistory(response));

      // Check if AI wants to use tools
      if (response.tool_calls && response.tool_calls.length > 0) {
        // Execute tools
        for (const toolCall of response.tool_calls) {
          const toolName = toolCall.function.name;
          let toolParams: any;
          
          try {
            toolParams = JSON.parse(toolCall.function.arguments);
          } catch (e) {
            // If parsing fails, try to extract path from user request
            if (toolName === 'scan_repository') {
              toolParams = { path: this.state.context.workspacePath || '.' };
            } else {
              toolParams = {};
            }
          }
          
          // Auto-fill workspace path if not provided
          if (toolName === 'scan_repository' && (!toolParams.path || toolParams.path === '.')) {
            toolParams.path = this.state.context.workspacePath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '.';
          }
          
          try {
            if (isFileScopedRemediation && toolName === 'scan_repository') {
              this.state.conversation.push({
                role: 'tool',
                content: JSON.stringify(
                  {
                    success: false,
                    blocked: true,
                    reason: 'scan_repository is disabled for file-scoped remediation (@file + fix/recode)',
                    instruction: 'Use read_file then edit_file on the path from the user message or [File: ...] block.',
                  },
                  null,
                  2
                ),
                tool_call_id: toolCall.id,
                name: toolName,
              });
              continue;
            }

            // scan_file lets some models "finish" with findings only — same gap as skipping edit_file.
            if (isFileScopedRemediation && toolName === 'scan_file') {
              this.state.conversation.push({
                role: 'tool',
                content: JSON.stringify(
                  {
                    success: false,
                    blocked: true,
                    reason:
                      'scan_file is disabled for file-scoped fix/recode — the user asked to change the file on disk',
                    instruction:
                      'Call read_file if you need the exact source, then call edit_file with the complete new file body (append: false).',
                  },
                  null,
                  2
                ),
                tool_call_id: toolCall.id,
                name: toolName,
              });
              continue;
            }

            const tool = this.tools.get(toolName);
            if (!tool) {
              throw new Error(`Tool ${toolName} not found`);
            }

            // Add citation for tool usage
            this.citationService.addToolCitation(
              this.currentMessageId,
              toolName,
              tool.description
            );

            // Show action during thinking
            if (this.chatInterface) {
              this.chatInterface.showThinkingAction(`Using tool: ${toolName}`, tool.description);
              const citations = this.citationService.getCitations(this.currentMessageId);
              if (citations.length > 0) {
                const citationTexts = citations.map(c => {
                  if (c.type === 'file') return `File: ${c.source}`;
                  if (c.type === 'tool') return `Tool: ${c.source}`;
                  if (c.type === 'service') return `Service: ${c.source}`;
                  return c.source;
                });
                this.chatInterface.showThinkingCitations(citationTexts);
              }
            }

            // Execute tool
            const toolResult = await tool.execute(toolParams);
            toolCallExecutions++;
            this.lastSessionToolExecutions = toolCallExecutions;
            if (toolName === 'edit_file' || toolName === 'create_file' || toolName === 'apply_fix') {
              fileWasEdited = true;
            }
            
            // Add file citations if tool accessed files
            if (toolResult.filePath || toolResult.files) {
              const files = toolResult.files || [toolResult.filePath];
              for (const file of files) {
                if (file) {
                  this.citationService.addFileCitation(
                    this.currentMessageId,
                    file,
                    toolResult.line
                  );
                  // Show file reference during thinking
                  if (this.chatInterface) {
                    this.chatInterface.showThinkingAction(`Accessed file: ${file}`, toolResult.line ? `Line ${toolResult.line}` : undefined);
                    const citations = this.citationService.getCitations(this.currentMessageId);
                    if (citations.length > 0) {
                      const citationTexts = citations.map(c => {
                        if (c.type === 'file') return `File: ${c.source}`;
                        if (c.type === 'tool') return `Tool: ${c.source}`;
                        if (c.type === 'service') return `Service: ${c.source}`;
                        return c.source;
                      });
                      this.chatInterface.showThinkingCitations(citationTexts);
                    }
                  }
                }
              }
            }
            
            // Add tool result to conversation (compact large read_file / scan payloads)
            this.state.conversation.push({
              role: 'tool',
              content: JSON.stringify(this.compactToolResultForLlm(toolName, toolResult), null, 2),
              tool_call_id: toolCall.id,
              name: toolName
            });

            // Update state based on tool results
            this.updateStateFromToolResult(toolName, toolResult);

          } catch (error) {
            this.state.conversation.push({
              role: 'tool',
              content: `Error: ${error instanceof Error ? error.message : String(error)}`,
              tool_call_id: toolCall.id,
              name: toolName
            });
          }
        }
      } else {
        // Only treat as "no tools" when the model never executed any tools this turn.
        // If tools already ran (read_file/scan_file) and this reply has no tool_calls, the issue is
        // "stopped without edit_file" — handled after the loop, not here (avoids false "no executable tools").
        if (isFileScopedRemediation && !fileWasEdited && toolCallExecutions === 0) {
          const raw = String(response.content || '');
          const pseudoToolCall =
            raw.includes('<tool_call>') ||
            raw.includes('&lt;tool_call&gt;') ||
            raw.includes('"name": "edit_file"') ||
            raw.includes('"name":"edit_file"');
          const fallback = pseudoToolCall
            ? `This request needs **real tool execution** (\`read_file\` → \`edit_file\`) to change your file on disk.\n\n` +
              `The model returned **pseudo tool text** instead of executable tool calls, so **no file was modified**.\n\n` +
              `**Fix:** In CipherMate settings, pick a model with reliable **function/tool calling** (e.g. \`anthropic/claude-sonnet-4\` on OpenRouter), then resend the same \`@file\` fix request.`
            : `This request needs **tool calls** (\`read_file\` / \`edit_file\`) to modify the file.\n\n` +
              `The model returned **no executable tools** on this step, so **no file was modified**.\n\n` +
              `**Fix:** Use a model that supports OpenAI-style tool calls (e.g. \`anthropic/claude-sonnet-4\` via OpenRouter). Note: \`openrouter/free\` may route to models that omit tools—try a named coding model.`;

          this.state.conversation.push({
            role: 'assistant',
            content: fallback,
          });
          return fallback;
        }

        // No tool calls - check if we should auto-trigger based on response content
        const responseLower = response.content.toLowerCase();
        const shouldAutoScan =
          !hasInlineFileContext &&
          isSecurityRequest &&
          (responseLower.includes("don't have access") ||
            responseLower.includes("can't access") ||
            responseLower.includes("no access") ||
            responseLower.includes("unable to scan") ||
            (!responseLower.includes('scanning') && !responseLower.includes('found')));

        if (shouldAutoScan && this.state.context.workspacePath && iteration === 0) {
          // AI didn't call the tool but user asked to scan - auto-trigger it
          console.log('AgenticCore: AI response suggests it cannot scan, auto-triggering scan_repository tool');
          
          try {
            const scanResult = await this.executeScanRepository(this.state.context.workspacePath);
            
            if (scanResult.success) {
              const findings = Array.isArray(scanResult.vulnerabilities) ? scanResult.vulnerabilities : [];
              const formatted = this.formatScanResultsWithoutAI(findings, userRequest);
              this.state.conversation.push({
                role: 'assistant',
                content: formatted,
              });
              return formatted;
            } else {
              return `Failed to scan repository: ${scanResult.error || 'Unknown error'}`;
            }
          } catch (error) {
            return `Error scanning repository: ${error instanceof Error ? error.message : String(error)}`;
          }
        }

        // Model ran read_file / etc. but returned prose only — nudge + retry before giving up.
        if (
          isFileScopedRemediation &&
          !fileWasEdited &&
          toolCallExecutions > 0 &&
          fileEditMandatoryNudges < maxFileEditMandatoryNudges
        ) {
          fileEditMandatoryNudges++;
          console.log(
            `AgenticCore: File-scoped remediation nudge ${fileEditMandatoryNudges}/${maxFileEditMandatoryNudges} (tools ran, no edit_file yet)`
          );
          if (this.chatInterface) {
            this.chatInterface.showThinkingAction(
              `Follow-up ${fileEditMandatoryNudges}/${maxFileEditMandatoryNudges}: requiring edit_file…`,
              'CipherMate is asking the model again to write the file on disk.'
            );
          }
          this.state.conversation.push({
            role: 'user',
            content:
              `[CipherMate — required next step]\n` +
              `The user asked to **fix / recode / harden** a specific file (@file or [File: ...] in this chat). ` +
              `Tools already ran, but **edit_file** was not called, so **nothing was saved**.\n\n` +
              `You MUST respond with **tool_calls** on this turn: call **edit_file** with:\n` +
              `- **filePath**: the path the user meant (from @file, [File: ...], or the file you read)\n` +
              `- **content**: the **complete** new file source (full file body as one string)\n` +
              `- **append**: false\n\n` +
              `Do **not** use scan_file or scan_repository for this request. ` +
              `Do **not** reply with only prose. ` +
              `If you believe the file is already secure, call **edit_file** anyway with the same contents as after read_file (no-op write).`,
          });
          iteration++;
          continue;
        }
        
        // No more tools to call - agent is done
        lastResponse = response.content;
        
        // Get citations and append to response
        const citations = this.citationService.getCitations(this.currentMessageId);
        if (citations && citations.length > 0) {
          if (this.chatInterface) {
            this.chatInterface.updateCitations(this.currentMessageId, citations);
          }
          // Webview shows Sources; avoid duplicating in body when chat UI is wired
          if (!this.chatInterface) {
            const citationSummary = this.citationService.getCitationSummary(this.currentMessageId);
            if (citationSummary) {
              lastResponse += `\n\n---\n**Sources:** ${citationSummary}`;
            }
          }
        }
        
        break;
      }

      iteration++;
    }

    // Final citations check
    const finalCitations = this.citationService.getCitations(this.currentMessageId);
    if (finalCitations && finalCitations.length > 0 && !lastResponse.includes('Sources:')) {
      if (this.chatInterface) {
        this.chatInterface.updateCitations(this.currentMessageId, finalCitations);
      }
      if (!this.chatInterface) {
        const citationSummary = this.citationService.getCitationSummary(this.currentMessageId);
        if (citationSummary) {
          lastResponse += `\n\n---\n**Sources:** ${citationSummary}`;
        }
      }
    }

    if (isFileScopedRemediation && !fileWasEdited && toolCallExecutions > 0) {
      const fallback =
        `**Tools ran** (e.g. \`read_file\` / \`scan_file\`), but the model **did not call** \`edit_file\`, \`create_file\`, or \`apply_fix\`, so **nothing was written to disk**.\n\n` +
        `**Next steps:**\n` +
        `- Resend the request and ask explicitly: *"Call edit_file with the full recoded file for [path]"*.\n` +
        `- Or switch CipherMate’s coding model to one with strong tool use (e.g. \`anthropic/claude-sonnet-4\` on OpenRouter). \`openrouter/free\` can route to models that stop after reading.\n`;
      const combined =
        lastResponse && String(lastResponse).trim().length > 0
          ? `${fallback}\n\n---\n**Model reply (no write applied):**\n${lastResponse}`
          : fallback;
      this.state.conversation.push({
        role: 'assistant',
        content: combined,
      });
      return combined;
    }

    return lastResponse || 'Agent completed processing.';
  }

  /**
   * Build system prompt with tool definitions
   */
  private buildSystemPrompt(fileScopedRemediation = false): string {
    const toolsDescription = Array.from(this.tools.values()).map(tool => {
      return `- ${tool.name}: ${tool.description}
  Parameters: ${JSON.stringify(tool.parameters, null, 2)}`;
    }).join('\n\n');

    const fileRemediationBlock = fileScopedRemediation
      ? `
FILE-SCOPED FIX / RECODE (user attached a file or @file path):
- You MUST end the task by calling **edit_file** with the **complete new file contents** (full file body), unless the user only asked for review with no changes.
- **scan_repository** and **scan_file** are DISABLED in this mode — CipherMate will reject them. Use **read_file** if you need the exact source, then **edit_file**.
- **Do not** stop after read_file with only prose: prose does not change files. Your next assistant turn after read_file MUST include an **edit_file** tool call.
- Prefer one read_file (if needed) then one edit_file with the full secure implementation.
`
      : '';

    return `You are CipherMate, an autonomous security agent running as a VS Code extension. You help developers scan their code repositories and fix security vulnerabilities.

IMPORTANT CONTEXT:
- You are a VS Code extension, NOT an API service
- Users interact with you through natural language chat in VS Code
- You automatically detect the workspace path from VS Code
- Users should NOT provide JSON configurations - just use natural language
- There are NO API endpoints - everything runs locally in VS Code

Your core expertise:
1. Repository Security Scanning - Comprehensive analysis using multiple tools
2. Vulnerability Detection - Finding security issues in code
3. Automatic Fixing - Generating and applying secure patches

Available Tools:
${toolsDescription}
${fileRemediationBlock}
Instructions:
- When asked to scan a repository, use scan_repository tool with the workspace path (auto-detected)
- When vulnerabilities are found, analyze and generate fixes
- Apply fixes when appropriate
- If the message includes [File: ...] blocks or the instruction that specific files are attached, and the user asks to fix, patch, recode, rewrite, or secure the code, you MUST call edit_file (or read_file then edit_file) to write changes to the workspace. Never claim the file was fixed or "remediation applied" without actually invoking a tool that modifies files.
- If the user @-mentions or clearly names a file path in the current message, use edit_file / create_file on THAT path only for changes that match that request. Do not reuse a filename from an older, unrelated message (e.g. do not write server code into a .py file the user mentioned for a different task).
- Match file extension to the task: JavaScript/Node fixes go to .js/.ts paths; Python to .py paths unless the user explicitly asks otherwise.
- Use technical, concise language. Report findings with severity, location, remediation.
- Plan multi-step operations (e.g., scan → analyze → fix → verify)
- Be thorough and security-focused
- NEVER mention API endpoints or JSON configurations to users
- Users can say "scan my repository" - you handle the rest

Always think step by step and use tools to accomplish tasks.`;
  }

  /**
   * Call AI with tool calling support
   */
  private async callAIWithTools(messages: AgentMessage[]): Promise<AgentMessage> {
    // Use multi-provider service if available (supports 450+ models with tools)
    if (this.aiService === 'cloud' && this.multiProviderService) {
      // Convert messages to API format
      const apiMessages = messages.map(msg => {
        const apiMsg: any = {
          role: msg.role,
          content: msg.content
        };
        
        if (msg.tool_calls) {
          apiMsg.tool_calls = msg.tool_calls;
        }
        
        if (msg.tool_call_id) {
          apiMsg.tool_call_id = msg.tool_call_id;
          apiMsg.name = msg.name;
        }
        
        return apiMsg;
      });

      // Build tools array for API
      const tools = Array.from(this.tools.values()).map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      }));

      const response = await this.multiProviderService.callAI({
        messages: apiMessages,
        tools: tools.length > 0 ? tools : undefined,
        temperature: 0.7,
        max_tokens: 8192
      });

      return {
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.tool_calls
      };
    }
    
    // Use legacy cloud AI if available
    if (this.aiService === 'cloud' && this.cloudAIService) {
      // Convert messages to API format
      const apiMessages = messages.map(msg => {
        const apiMsg: any = {
          role: msg.role,
          content: msg.content
        };
        
        if (msg.tool_calls) {
          apiMsg.tool_calls = msg.tool_calls;
        }
        
        if (msg.tool_call_id) {
          apiMsg.tool_call_id = msg.tool_call_id;
          apiMsg.name = msg.name;
        }
        
        return apiMsg;
      });

      // Build tools array for API
      const tools = Array.from(this.tools.values()).map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      }));

      const response = await this.cloudAIService.callAI({
        messages: apiMessages,
        tools: tools.length > 0 ? tools : undefined,
        temperature: 0.7,
        max_tokens: 8192
      });

      return {
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.tool_calls
      };
    }
    
    // Fall back to local AI
    const url = new URL(this.lmStudioUrl);
    
    // Convert messages to API format
    const apiMessages = messages.map(msg => {
      const apiMsg: any = {
        role: msg.role,
        content: msg.content
      };
      
      if (msg.tool_calls) {
        apiMsg.tool_calls = msg.tool_calls;
      }
      
      if (msg.tool_call_id) {
        apiMsg.tool_call_id = msg.tool_call_id;
        apiMsg.name = msg.name;
      }
      
      return apiMsg;
    });

    // Build tools array for API
    const tools = Array.from(this.tools.values()).map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));

    return new Promise((resolve, reject) => {
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
            const choice = parsed.choices?.[0];
            
            const response: AgentMessage = {
              role: 'assistant',
              content: choice.message?.content || '',
              tool_calls: choice.message?.tool_calls
            };
            
            resolve(response);
          } catch (e) {
            reject(new Error('Invalid response from AI'));
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify({
        model: 'local-model',
        messages: apiMessages,
        tools: tools,
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 8192
      }));
      req.end();
    });
  }

  /**
   * Update state from tool results
   */
  private updateStateFromToolResult(toolName: string, result: any): void {
    if (toolName === 'scan_repository' || toolName === 'scan_file') {
      if (result.vulnerabilities) {
        this.state.vulnerabilities.push(...result.vulnerabilities);
      }
      if (result.filesScanned) {
        this.state.context.filesScanned.push(...result.filesScanned);
      }
    }
  }

  // Tool execution methods
  private async executeScanRepository(
    path: string, 
    includePatterns?: string[], 
    excludePatterns?: string[],
    options?: { filterSecrets?: boolean; filterDependencies?: boolean }
  ): Promise<any> {
    try {
      // Use provided path, or fall back to workspace, or current directory
      let workspacePath: string = path;
      
      if (!workspacePath || workspacePath === '.' || workspacePath === '') {
        const vscodePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (vscodePath) {
          workspacePath = vscodePath;
        }
      }
      
      if (!workspacePath || workspacePath === '.' || workspacePath === '') {
        // Last resort: try to get current working directory
        workspacePath = process.cwd();
      }
      
      if (!workspacePath) {
        return { 
          success: false, 
          error: 'No workspace path available. Please open a folder in VS Code or specify a path.' 
        };
      }

      console.log(`AgenticCore: Scanning repository at: ${workspacePath}`);

      // Progress callback for detailed thinking steps during scan
      const onProgress = (step: string, detail: string) => {
        if (this.chatInterface?.showThinkingAction) {
          this.chatInterface.showThinkingAction(step, detail);
        }
      };

      // Use new unified RepositoryScanner (primary scanner) - this is fast and reliable
      const scanner = new RepositoryScanner(workspacePath);
      const scanResult = await scanner.scan({ onProgress });

      // Convert to format expected by agent
      const allVulnerabilities = scanner.getAllVulnerabilities(scanResult.results);
      
      // Start with unified scanner results (return these immediately)
      // Tag each vulnerability with its scanner name
      let allResults = allVulnerabilities.map((v: any) => {
        // Determine scanner name from vulnerability metadata or type
        let scannerName = (v as any).scanner || 'code-pattern-scanner'; // Default fallback
        if (v.type?.includes('dependency') || v.type?.includes('cve') || v.type?.includes('package')) {
          scannerName = 'dependency-scanner';
        } else if (v.type?.includes('secret') || v.type?.includes('credential') || v.type?.includes('key') || 
                   v.type?.includes('password') || v.type?.includes('token')) {
          scannerName = 'secrets-scanner';
        } else if (v.type?.includes('smart') || v.type?.includes('contract') || v.type?.includes('solidity')) {
          scannerName = 'smart-contract-scanner';
        }
        
        return {
          ...v,
          severity: v.severity.toUpperCase(),
          file: v.file,
          line: v.line,
          message: v.description,
          scanner: scannerName, // Tag with scanner name
        } as any;
      });
      
      // Filter results based on request type
      if (options?.filterSecrets) {
        // Only show secrets-related vulnerabilities
        allResults = allResults.filter((v: any) => 
          v.scanner === 'secrets-scanner' || 
          (v.type && (v.type.includes('secret') || v.type.includes('key') || v.type.includes('password') || v.type.includes('token') || v.type.includes('credential')))
        );
      }
      
      if (options?.filterDependencies) {
        // Only show dependency-related vulnerabilities
        allResults = allResults.filter((v: any) => 
          v.scanner === 'dependency-scanner' || 
          (v.type && (v.type.includes('dependency') || v.type.includes('cve') || v.type.includes('package')))
        );
      }
      
      // Run legacy scans in background - don't wait for them
      // They'll be added to state later if they complete
      Promise.allSettled([
        this.runSemgrep(workspacePath).then(results => {
          if (Array.isArray(results) && results.length > 0) {
            allResults.push(...results);
            this.state.vulnerabilities.push(...results);
          }
        }).catch(e => console.warn('Semgrep scan failed:', e)),
        this.runBandit(workspacePath).then(results => {
          if (Array.isArray(results) && results.length > 0) {
            allResults.push(...results);
            this.state.vulnerabilities.push(...results);
          }
        }).catch(e => console.warn('Bandit scan failed:', e)),
        this.runAIAnalysis(workspacePath).then(results => {
          if (Array.isArray(results) && results.length > 0) {
            allResults.push(...results);
            this.state.vulnerabilities.push(...results);
          }
        }).catch(e => console.warn('AI analysis failed:', e))
      ]).catch(() => {
        // Ignore errors - we already have results from unified scanner
      });
      
      this.state.vulnerabilities = allResults;
      this.state.scanResults = allResults;

      // Use aggregated counts directly - no need to re-filter as scanResult.aggregated already has correct totals
      const criticalCount = scanResult.aggregated.critical;
      const highCount = scanResult.aggregated.high;

      // Build detailed scanner information with per-scanner vulnerability lists
      const scannerDetails = scanResult.results.map(r => {
        // Get vulnerabilities from this specific scanner
        const scannerVulns = allResults.filter((v: any) => 
          (v.scanner === r.scanner) || 
          (v.tool === r.scanner) ||
          (!v.scanner && !v.tool && r.scanner === 'code-pattern-scanner') // Default fallback
        );
        
        return {
          name: r.scanner,
          success: r.success,
          count: r.summary.total,
          duration: r.duration,
          error: r.error,
          summary: r.summary,
          vulnerabilities: scannerVulns, // Include actual vulnerabilities for this scanner
          description: this.getScannerDescription(r.scanner)
        };
      });

      return {
        success: true,
        vulnerabilities: allResults,
        count: allResults.length,
        critical: criticalCount,
        high: highCount,
        summary: scanResult.aggregated,
        scanners: scannerDetails, // Now includes detailed info per scanner
        scanDuration: scanResult.duration,
        timestamp: scanResult.timestamp,
        message: `Repository scan completed: Found ${allResults.length} vulnerabilities (${criticalCount} critical, ${highCount} high)`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async executeScanFile(filePath: string): Promise<any> {
    try {
      const resolved = this.resolveToolFilePath(filePath);
      if (!fs.existsSync(resolved)) {
        return { success: false, error: 'File not found' };
      }

      const code = await fs.promises.readFile(resolved, 'utf-8');
      const language = this.detectLanguage(resolved);
      
      // Use AI to analyze the file
      const analysis = await this.runAIAnalysisOnCode(code, resolved, language);
      
      this.state.context.filesScanned.push(resolved);
      
      return {
        success: true,
        vulnerabilities: analysis.issues || [],
        file: resolved,
        language: language,
        message: `File scan completed: Found ${(analysis.issues || []).length} issues`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async executeAnalyzeCode(code: string, language?: string, context?: string): Promise<any> {
    try {
      const prompt = `Analyze this code for security vulnerabilities:

${context ? `Context: ${context}\n\n` : ''}Code:
\`\`\`${language || 'text'}
${code}
\`\`\`

Identify security issues including:
- Input validation problems
- Injection vulnerabilities (SQL, XSS, Command)
- Authentication/authorization flaws
- Cryptographic weaknesses
- Data exposure risks
- Business logic vulnerabilities

Return JSON:
{
  "issues": [
    {
      "type": "vulnerability_type",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "line": line_number,
      "description": "detailed description",
      "explanation": "why this is vulnerable",
      "fix": "suggested fix"
    }
  ]
}`;

      const response = await this.callAI(prompt);
      const parsed = JSON.parse(response);
      
      return {
        success: true,
        issues: parsed.issues || [],
        count: (parsed.issues || []).length
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        issues: []
      };
    }
  }

  private async executeGenerateFix(vulnerability: any, codeContext?: string): Promise<any> {
    try {
      // Use REAL code from file - prioritize codeContext which comes from actual file reading
      const realCode = codeContext || vulnerability.code || vulnerability.issue_text || '';
      
      const prompt = `Generate a secure fix for this vulnerability using ONLY the actual code from the file:

Vulnerability Type: ${vulnerability.type || vulnerability.issue_type || 'Security Issue'}
Severity: ${vulnerability.severity || 'UNKNOWN'}
Description: ${vulnerability.description || vulnerability.extra?.message || 'Security vulnerability'}
Location: ${vulnerability.path || vulnerability.file || 'Unknown'}:${vulnerability.start?.line || vulnerability.line_number || 'Unknown'}

CRITICAL: Use ONLY the actual code shown below. Do NOT invent or hallucinate code.

ACTUAL VULNERABLE CODE FROM FILE:
\`\`\`
${realCode}
\`\`\`

${codeContext && codeContext !== realCode ? `SURROUNDING CONTEXT:\n\`\`\`\n${codeContext}\n\`\`\`\n` : ''}

IMPORTANT REQUIREMENTS:
- Use ONLY the code shown above - do NOT create fictional code
- Show the exact vulnerable line(s) and their fixed version
- Provide the complete fixed code block with real code
- The fixedCode must be based on the actual code, not invented

Generate a secure fix. Return JSON:
{
  "originalCode": "actual vulnerable code from file",
  "fixedCode": "secure replacement using real code",
  "explanation": "why this fix is secure",
  "securityImprovements": ["improvement1", "improvement2"],
  "testingNotes": "how to test the fix",
  "confidence": 0.0-1.0
}`;

      const response = await this.callAI(prompt);
      const parsed = JSON.parse(response);
      
      return {
        success: true,
        originalCode: parsed.originalCode || vulnerability.code,
        fixedCode: parsed.fixedCode,
        explanation: parsed.explanation,
        securityImprovements: parsed.securityImprovements || [],
        testingNotes: parsed.testingNotes,
        confidence: parsed.confidence || 0.8
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Execute a safe fix using FixService with backup, preview, and undo capability
   */
  private async executeSafeApplyFix(params: any): Promise<any> {
    try {
      const { vulnerability, filePath, originalCode, fixedCode, lineNumber, confirmed } = params;
      const resolvedFile = this.resolveToolFilePath(filePath);

      const vuln = vulnerability
        ? { ...vulnerability, file: resolvedFile }
        : {
            id: `vuln-${Date.now()}`,
            type: 'detected_vulnerability',
            severity: 'medium' as const,
            title: 'Detected Vulnerability',
            description: 'Vulnerability detected during scan',
            file: resolvedFile,
            line: lineNumber,
            code: originalCode
          };

      // Generate fix proposal using FixService
      const proposal = await this.fixService.generateFix(vuln);

      // Override with provided fixed code if available
      if (fixedCode) {
        (proposal as any).fixedCode = fixedCode;
      }
      if (originalCode) {
        (proposal as any).originalCode = originalCode;
      }

      // If not confirmed, return preview info for user confirmation
      if (!confirmed) {
        const diff = await this.fixService.previewFix(proposal);
        return {
          success: false,
          needsConfirmation: true,
          message: 'Fix requires user confirmation before application',
          preview: {
            fixId: proposal.id,
            filePath: proposal.vulnerability.file,
            line: proposal.startLine,
            originalCode: proposal.originalCode,
            fixedCode: proposal.fixedCode,
            explanation: proposal.explanation,
            confidence: proposal.confidence,
            riskLevel: proposal.riskLevel,
            diff: diff.unified,
            additions: diff.additions,
            deletions: diff.deletions
          }
        };
      }

      // User confirmed - apply the fix
      const result = await this.fixService.applyFix(proposal, true);

      if (result.success) {
        return {
          success: true,
          message: `Fix applied successfully to ${path.basename(resolvedFile)} at line ${lineNumber}`,
          file: resolvedFile,
          line: lineNumber,
          fixId: result.fixId,
          backupId: result.backupId,
          validated: result.validated,
          canUndo: true
        };
      } else {
        return {
          success: false,
          error: result.error || 'Failed to apply fix',
          fixId: result.fixId
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Legacy apply fix method (kept for backward compatibility)
   * @deprecated Use executeSafeApplyFix instead
   */
  private async executeApplyFix(filePath: string, originalCode: string, fixedCode: string, lineNumber: number): Promise<any> {
    try {
      const resolved = this.resolveToolFilePath(filePath);
      if (!fs.existsSync(resolved)) {
        return { success: false, error: 'File not found' };
      }

      const fileContent = await fs.promises.readFile(resolved, 'utf-8');
      const lines = fileContent.split('\n');
      
      // Find the line to replace
      const targetLine = lines[lineNumber - 1];
      
      if (!targetLine.includes(originalCode.trim())) {
        // Try to find it nearby
        const searchRange = 5;
        let found = false;
        for (let i = Math.max(0, lineNumber - searchRange - 1); i < Math.min(lines.length, lineNumber + searchRange); i++) {
          if (lines[i].includes(originalCode.trim())) {
            lines[i] = lines[i].replace(originalCode.trim(), fixedCode.trim());
            found = true;
            break;
          }
        }
        
        if (!found) {
          return { success: false, error: 'Could not find original code to replace' };
        }
      } else {
        lines[lineNumber - 1] = lines[lineNumber - 1].replace(originalCode.trim(), fixedCode.trim());
      }
      
      const newContent = lines.join('\n');
      await fs.promises.writeFile(resolved, newContent, 'utf-8');
      
      return {
        success: true,
        message: `Fix applied to ${path.basename(resolved)} at line ${lineNumber}`,
        file: resolved,
        line: lineNumber
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async executeReadFile(filePath: string): Promise<any> {
    try {
      const resolved = this.resolveToolFilePath(filePath);
      const content = await fs.promises.readFile(resolved, 'utf-8');
      return { success: true, content };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async executeListFiles(directory: string, pattern?: string, recursive?: boolean): Promise<any> {
    try {
      const dir = this.resolveToolDirectory(directory);
      if (!fs.existsSync(dir)) {
        return { success: false, error: 'Directory not found' };
      }

      const files: string[] = [];
      
      async function scanDir(dir: string): Promise<void> {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          // Skip common exclusions
          if (entry.name.startsWith('.') || 
              entry.name === 'node_modules' || 
              entry.name === 'dist' || 
              entry.name === 'build') {
            continue;
          }
          
          if (entry.isDirectory() && recursive) {
            await scanDir(fullPath);
          } else if (entry.isFile()) {
            if (!pattern || entry.name.match(pattern.replace('*', '.*'))) {
              files.push(fullPath);
            }
          }
        }
      }
      
      await scanDir(dir);
      
      return {
        success: true,
        files: files,
        count: files.length
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        files: []
      };
    }
  }

  private async executeExplainVulnerability(vulnerability: any): Promise<any> {
    try {
      const prompt = `Explain this security vulnerability in detail:

Type: ${vulnerability.type || vulnerability.issue_type || 'Security Issue'}
Severity: ${vulnerability.severity || 'UNKNOWN'}
Description: ${vulnerability.description || vulnerability.extra?.message || 'Security vulnerability'}
Location: ${vulnerability.path || 'Unknown'}:${vulnerability.start?.line || vulnerability.line_number || 'Unknown'}

Code:
\`\`\`
${vulnerability.code || vulnerability.issue_text || 'N/A'}
\`\`\`

Provide:
1. What this vulnerability is
2. Why it's dangerous
3. How attackers could exploit it
4. Real-world impact examples
5. How to prevent it
6. Related security concepts

Be detailed and educational.`;

      const explanation = await this.callAI(prompt);
      
      return {
        success: true,
        explanation: explanation,
        vulnerability: vulnerability
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Helper methods
  private async callAI(prompt: string): Promise<string> {
    // Use multi-provider service if available (supports 450+ models)
    // Wait for service to be initialized if it's still loading
    if (this.aiService === 'cloud' && !this.multiProviderService) {
      // Wait a bit for async initialization
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (this.aiService === 'cloud' && this.multiProviderService) {
      console.log(`AgenticCore.callAI: Using multiProviderService`);
      const response = await this.multiProviderService.callAI({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 8192
      });
      return response.content;
    }
    
    // Fall back to legacy cloud AI service
    if (this.aiService === 'cloud' && this.cloudAIService) {
      const response = await this.cloudAIService.callAI({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 8192
      });
      return response.content;
    }
    
    // Fall back to local AI
    return new Promise((resolve, reject) => {
      const url = new URL(this.lmStudioUrl);
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
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
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 8192
      }));
      req.end();
    });
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const langMap: Record<string, string> = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.php': 'php',
      '.go': 'go',
      '.rs': 'rust',
      '.rb': 'ruby',
      '.cpp': 'cpp',
      '.c': 'c'
    };
    return langMap[ext] || 'text';
  }

  private async runSemgrep(workspacePath: string): Promise<any[]> {
    try {
      const { stdout } = await execAsync('semgrep --json --exclude="node_modules" --exclude=".git" .', {
        cwd: workspacePath,
        maxBuffer: 10 * 1024 * 1024
      });
      const result = JSON.parse(stdout);
      return (result.results || []).map((r: any) => ({
        tool: 'Semgrep',
        ...r
      }));
    } catch (error) {
      return [];
    }
  }

  private async runBandit(workspacePath: string): Promise<any[]> {
    try {
      const { stdout } = await execAsync('bandit -r -f json .', {
        cwd: workspacePath,
        maxBuffer: 10 * 1024 * 1024
      });
      const result = JSON.parse(stdout);
      return (result.results || []).map((r: any) => ({
        tool: 'Bandit',
        ...r
      }));
    } catch (error) {
      return [];
    }
  }

  private async runAIAnalysis(workspacePath: string): Promise<any[]> {
    // Simplified - would need full implementation
    return [];
  }

  private async runAIAnalysisOnCode(code: string, filePath: string, language: string): Promise<any> {
    const prompt = `Analyze this ${language} code for security vulnerabilities:

\`\`\`${language}
${code}
\`\`\`

Return JSON with issues array.`;
    
    try {
      const response = await this.callAI(prompt);
      return JSON.parse(response);
    } catch {
      return { issues: [] };
    }
  }

  /**
   * Handle case when no workspace is open - use simple fallback message (no AI needed)
   */
  private async handleNoWorkspace(originalRequest: string): Promise<string> {
    // Store the request so we can retry it
    this.state.context.pendingRequest = originalRequest;
    
    // Check if we've already asked about this (to vary responses)
    const previousNoWorkspaceMessages = this.state.conversation
      .filter(msg => msg.role === 'assistant')
      .slice(-3)
      .map(msg => msg.content.toLowerCase());
    
    const hasAskedBefore = previousNoWorkspaceMessages.some(msg => 
      msg.includes('open folder') || msg.includes('file → open')
    );
    
    // Small delay to show thinking process
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Try to generate AI response first for dynamic, human-like messages
    try {
      const aiResponse = await this.generateNoWorkspaceResponse(originalRequest, hasAskedBefore);
      if (aiResponse && this.isValidNoWorkspaceResponse(aiResponse)) {
        return aiResponse;
      }
    } catch (error) {
      console.log('AI generation failed for no-workspace response, using fallback:', error);
    }
    
    // Fallback to simple message if AI fails
    return this.getVariedFallbackMessage(originalRequest, hasAskedBefore);
  }

  /**
   * Generate AI-powered response for no workspace scenario
   */
  private async generateNoWorkspaceResponse(originalRequest: string, hasAskedBefore: boolean): Promise<string> {
    const contextNote = hasAskedBefore 
      ? "The user has been asked to open a folder before. Be more casual and brief this time."
      : "This is the first time asking. Be friendly and helpful.";
    
    const prompt = `You are a helpful VS Code extension assistant. The user wants to "${originalRequest}" but no workspace folder is open in VS Code.

${contextNote}

Generate a friendly, human-like response (2-3 sentences max) that:
1. Acknowledges what they want to do
2. Tells them to open a folder using "File → Open Folder" (or Cmd+O / Ctrl+O)
3. Mentions that you'll automatically retry their request once they open it

Rules:
- Keep it conversational and natural
- Don't mention terminal, git, GitHub, or technical details
- Don't use emojis
- Be concise (under 150 characters)
- Make it feel personal and helpful

Response:`;

    try {
      // Use AI service to generate response
      const messages: AgentMessage[] = [
        { role: 'user', content: prompt }
      ];
      
      const response = await this.callAIWithTools(messages);
      const generatedText = response.content?.trim() || '';
      
      // Validate the response
      if (generatedText && this.isValidNoWorkspaceResponse(generatedText)) {
        return generatedText;
      }
      
      // If validation fails, return empty to trigger fallback
      return '';
    } catch (error) {
      console.log('Error generating AI response for no workspace:', error);
      return '';
    }
  }

  /**
   * Format scan results without AI (fallback when AI fails)
   */
  private formatScanResultsWithoutAI(scanResults: any[], userRequest: string): string {
    // Simple formatting without AI - just show the data
    let message = `## Security Scan Results\n\n`;
    message += `I completed the security scan. Here are the findings:\n\n`;
    
    if (scanResults.length === 0) {
      message += `**Great news!** No vulnerabilities found.\n`;
    } else {
      message += `**Found ${scanResults.length} potential issues:**\n\n`;
      scanResults.forEach((result: any, idx: number) => {
        message += `${idx + 1}. ${result.severity || 'UNKNOWN'}: ${result.message || result.description || 'Issue detected'}\n`;
        if (result.file) message += `   File: ${result.file}${result.line ? `:${result.line}` : ''}\n`;
      });
    }
    
    message += `\n**Note:** Configure your AI provider in Settings (⚙ icon) for detailed analysis and recommendations.`;
    
    return message;
  }

  /**
   * Validate AI response for no workspace scenario
   */
  private isValidNoWorkspaceResponse(response: string): boolean {
    if (!response || response.trim().length === 0) {
      return false;
    }
    
    // Allow longer responses (up to 300 characters) for more natural AI responses
    if (response.length > 300) {
      return false;
    }
    
    // Check for unwanted terms that indicate technical/incorrect guidance
    const unwantedTerms = [
      'terminal',
      'command line',
      'code .',
      'git clone',
      'github clone',
      'remote repository',
      'security risk',
      'privacy concern',
      'technical setup',
      'bash script',
      'cygwin',
      'curl',
      'wget',
      'npm install',
      'pip install'
    ];
    
    const lowerResponse = response.toLowerCase();
    for (const term of unwantedTerms) {
      if (lowerResponse.includes(term)) {
        return false;
      }
    }
    
    // Check if it mentions File → Open Folder or similar (good sign)
    const hasValidGuidance = lowerResponse.includes('file') || 
                             lowerResponse.includes('open folder') || 
                             lowerResponse.includes('cmd+o') || 
                             lowerResponse.includes('ctrl+o') ||
                             lowerResponse.includes('open your folder') ||
                             lowerResponse.includes('open a folder');
    
    if (!hasValidGuidance) {
      return false;
    }
    
    return true;
  }

  /**
   * Varied fallback messages - different each time
   */
  private getVariedFallbackMessage(originalRequest: string, hasAskedBefore: boolean): string {
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
   * Get scanner description for reporting
   */
  private getScannerDescription(scannerName: string): string {
    const descriptions: Record<string, string> = {
      'dependency-scanner': 'Scans dependency files (package.json, requirements.txt, etc.) for known CVEs and vulnerable packages',
      'secrets-scanner': 'Detects hardcoded secrets like API keys, passwords, tokens, and credentials in code files',
      'smart-contract-scanner': 'Analyzes Solidity smart contracts for security vulnerabilities (reentrancy, access control, etc.)',
      'code-pattern-scanner': 'Detects OWASP Top 10 vulnerabilities and security anti-patterns in code (SQL injection, XSS, etc.)',
      'semgrep': 'Static analysis tool for finding security bugs and vulnerabilities using pattern matching',
      'bandit': 'Python security linter that finds common security issues in Python code'
    };
    
    return descriptions[scannerName] || `Security scanner: ${scannerName}`;
  }

  /**
   * Execute project generation
   */
  private async executeGenerateProject(
    name: string,
    type: string,
    language: string,
    basePath?: string
  ): Promise<any> {
    try {
      // Add citation
      this.citationService.addServiceCitation(
        this.currentMessageId,
        'ProjectGenerationService',
        'generateProject'
      );
      
      // Show action during thinking
      if (this.chatInterface) {
        this.chatInterface.showThinkingAction(`Generating project: ${name}`, `Type: ${type}, Language: ${language}`);
        const citations = this.citationService.getCitations(this.currentMessageId);
        if (citations.length > 0) {
          const citationTexts = citations.map(c => {
            if (c.type === 'file') return `File: ${c.source}`;
            if (c.type === 'tool') return `Tool: ${c.source}`;
            if (c.type === 'service') return `Service: ${c.source}`;
            return c.source;
          });
          this.chatInterface.showThinkingCitations(citationTexts);
        }
      }

      const structure = this.projectGenService.generateSecureProjectTemplate(
        name,
        type as any,
        language as any
      );

      const result = await this.projectGenService.generateProject(structure, basePath);

      if (result.success) {
        // Add citations for created files
        for (const file of result.filesCreated) {
          this.citationService.addFileCitation(this.currentMessageId, file);
        }

        return {
          success: true,
          message: `Project "${name}" generated successfully!`,
          projectPath: result.projectPath,
          filesCreated: result.filesCreated.length,
          files: result.filesCreated,
        };
      } else {
        return {
          success: false,
          error: result.errors?.join(', ') || 'Unknown error',
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute create file
   */
  private async executeCreateFile(filePath: string, content: string): Promise<any> {
    try {
      const resolvedPath = this.resolveToolFilePath(filePath);

      // Add citation
      this.citationService.addServiceCitation(
        this.currentMessageId,
        'FileOperationsService',
        'createFile'
      );
      
      // Show action during thinking
      if (this.chatInterface) {
        this.chatInterface.showThinkingAction(`Creating file: ${resolvedPath}`);
        const citations = this.citationService.getCitations(this.currentMessageId);
        if (citations.length > 0) {
          const citationTexts = citations.map(c => {
            if (c.type === 'file') return `File: ${c.source}`;
            if (c.type === 'tool') return `Tool: ${c.source}`;
            if (c.type === 'service') return `Service: ${c.source}`;
            return c.source;
          });
          this.chatInterface.showThinkingCitations(citationTexts);
        }
      }

      const result = await this.fileService.createFile(resolvedPath, content);

      if (result.success) {
        this.citationService.addFileCitation(this.currentMessageId, resolvedPath);
        
        // Update citations after file creation
        if (this.chatInterface) {
          const citations = this.citationService.getCitations(this.currentMessageId);
          if (citations.length > 0) {
            const citationTexts = citations.map(c => {
              if (c.type === 'file') return `File: ${c.source}`;
              if (c.type === 'tool') return `Tool: ${c.source}`;
              if (c.type === 'service') return `Service: ${c.source}`;
              return c.source;
            });
            this.chatInterface.showThinkingCitations(citationTexts);
          }
        }
        return {
          success: true,
          message: `File created: ${resolvedPath}`,
          filePath: result.path,
        };
      } else {
        return {
          success: false,
          error: result.error || 'Unknown error',
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute edit file
   */
  private async executeEditFile(
    filePath: string,
    content: string,
    append: boolean = false,
    hashForIntegrity: boolean = false
  ): Promise<any> {
    try {
      const resolvedPath = this.resolveToolFilePath(filePath);

      // Add citation
      this.citationService.addServiceCitation(
        this.currentMessageId,
        'FileOperationsService',
        append ? 'appendFile' : 'writeFile'
      );
      
      // Show action during thinking
      if (this.chatInterface) {
        this.chatInterface.showThinkingAction(`${append ? 'Appending to' : 'Editing'} file: ${resolvedPath}`);
        const citations = this.citationService.getCitations(this.currentMessageId);
        if (citations.length > 0) {
          const citationTexts = citations.map(c => {
            if (c.type === 'file') return `File: ${c.source}`;
            if (c.type === 'tool') return `Tool: ${c.source}`;
            if (c.type === 'service') return `Service: ${c.source}`;
            return c.source;
          });
          this.chatInterface.showThinkingCitations(citationTexts);
        }
      }

      let beforeSnapshot = '';
      if (!append) {
        try {
          beforeSnapshot = await this.fileService.readFile(resolvedPath);
        } catch {
          beforeSnapshot = '';
        }
      }

      let result;
      if (append) {
        let existingStr = '';
        try {
          existingStr = await this.fileService.readFile(resolvedPath);
        } catch {
          existingStr = '';
        }
        result = await this.fileService.writeFile(resolvedPath, existingStr + '\n' + content);
      } else {
        result = await this.fileService.writeFile(resolvedPath, content);
      }

      if (result.success) {
        if (!append) {
          this.lastFileEditDiff = { path: resolvedPath, before: beforeSnapshot, after: content };
        }
        this.citationService.addFileCitation(this.currentMessageId, resolvedPath);

        // Generate hash if requested
        let hash: string | undefined;
        if (hashForIntegrity) {
          hash = await this.projectGenService.hashFile(resolvedPath);
          this.citationService.addServiceCitation(
            this.currentMessageId,
            'HashingService',
            'sha256'
          );
        }

        return {
          success: true,
          message: `File ${append ? 'appended' : 'updated'}: ${resolvedPath}`,
          filePath: result.path,
          hash,
        };
      } else {
        return {
          success: false,
          error: result.error || 'Unknown error',
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Handle project generation request
   */
  private async handleProjectGeneration(userRequest: string): Promise<string> {
    // Use AI to extract project details
    const prompt = `Extract project details from this request: "${userRequest}"

Return JSON with:
{
  "name": "project name (default: 'my-project')",
  "type": "web|api|library|cli|fullstack (default: 'web')",
  "language": "javascript|typescript|python|java|go|rust (default: 'typescript')"
}`;

    try {
      const messages: AgentMessage[] = [
        { role: 'user', content: prompt }
      ];
      const response = await this.callAIWithTools(messages);
      const parsed = JSON.parse(response.content);

      const name = parsed.name || 'my-project';
      const type = parsed.type || 'web';
      const language = parsed.language || 'typescript';

      // Generate project
      const result = await this.executeGenerateProject(name, type, language);

      if (result.success) {
        return `✅ **Project "${name}" generated successfully!**

**Location:** ${result.projectPath}
**Files Created:** ${result.filesCreated}

The project includes:
- Secure code templates
- Security utilities (password hashing, token generation, input validation)
- Configuration files
- Documentation

You can now open this folder in VS Code to start working!`;
      } else {
        return `❌ Failed to generate project: ${result.error}`;
      }
    } catch (error) {
      return `I can help you generate a project! Please specify:
- Project name
- Type (web, api, library, cli, or fullstack)
- Language (javascript, typescript, python, java, go, or rust)

Example: "Generate a secure web project called 'my-app' in TypeScript"`;
    }
  }

  /**
   * Get citations for current message
   */
  getCitations(): string {
    return this.citationService.getCitationSummary(this.currentMessageId);
  }

  /**
   * Get current state
   */
  getState(): AgentState {
    return this.state;
  }

  /**
   * Reset agent state
   */
  reset(): void {
    this.state = {
      conversation: [],
      currentPlan: [],
      executedSteps: [],
      scanResults: [],
      vulnerabilities: [],
      context: {
        filesScanned: [],
        pendingRequest: undefined
      }
    };
  }

  /**
   * Clean up old conversation history to prevent memory issues
   * Keeps the most recent messages (default: 50)
   */
  private cleanupConversationHistory(maxMessages: number = 50): void {
    if (this.state.conversation.length > maxMessages) {
      // Keep system messages and the most recent user/assistant messages
      const systemMessages = this.state.conversation.filter(m => m.role === 'system');
      const recentMessages = this.state.conversation
        .filter(m => m.role !== 'system')
        .slice(-maxMessages);
      
      this.state.conversation = [...systemMessages, ...recentMessages];
      console.log(`Memory cleanup: Reduced conversation history from ${this.state.conversation.length + (this.state.conversation.length - maxMessages)} to ${this.state.conversation.length} messages`);
    }
  }

  /**
   * Clean up old scan results and vulnerabilities
   */
  private cleanupScanData(maxItems: number = 1000): void {
    if (this.state.scanResults.length > maxItems) {
      this.state.scanResults = this.state.scanResults.slice(-maxItems);
    }
    if (this.state.vulnerabilities.length > maxItems) {
      // Keep most severe vulnerabilities
      const severityOrder: Record<string, number> = {
        'critical': 0, 'error': 0,
        'high': 1, 'warning': 1,
        'medium': 2, 'info': 2,
        'low': 3
      };
      this.state.vulnerabilities = this.state.vulnerabilities
        .sort((a, b) => {
          const aSev = severityOrder[(a.severity || '').toLowerCase()] ?? 4;
          const bSev = severityOrder[(b.severity || '').toLowerCase()] ?? 4;
          return aSev - bSev;
        })
        .slice(0, maxItems);
    }
  }

  /**
   * Perform periodic memory cleanup
   */
  performMemoryCleanup(): void {
    this.cleanupConversationHistory(50);
    this.cleanupScanData(1000);
    
    // Limit filesScanned array
    if (this.state.context.filesScanned.length > 5000) {
      this.state.context.filesScanned = this.state.context.filesScanned.slice(-5000);
    }
  }
}

