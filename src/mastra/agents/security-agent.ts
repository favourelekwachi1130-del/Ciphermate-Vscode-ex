/**
 * Security Agent with Mastra Memory Management
 * 
 * Replaces AgenticCore with Mastra's built-in memory management
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { createRequire } from 'module';

// Optional Mastra components - loaded lazily from extension's node_modules
let Agent: any = null;
let Memory: any = null;
let TokenLimiter: any = null;
let ToolCallFilter: any = null;
let openai: any = null;
let createOpenAI: any = null;
let ollama: any = null;
let createOllama: any = null;
let LibSQLStore: any = null;
let LibSQLVector: any = null;
let fastembed: any = null;
let _mastraLoadError: string | null = null;

/**
 * Load Mastra packages from extension's node_modules (ensures correct resolution in VS Code extension host)
 */
function loadMastraPackages(extensionPath: string): boolean {
  if (Agent && Memory) return true; // Already loaded
  if (_mastraLoadError) return false;

  try {
    const req = createRequire(path.join(extensionPath, 'package.json'));
    const mastraCore = req('@mastra/core/agent');
    Agent = mastraCore.Agent;
    const mastraMemory = req('@mastra/memory');
    Memory = mastraMemory.Memory;
    const processors = req('@mastra/memory/processors');
    TokenLimiter = processors.TokenLimiter;
    ToolCallFilter = processors.ToolCallFilter;
    const aiSdk = req('@ai-sdk/openai');
    openai = aiSdk.openai;
    createOpenAI = aiSdk.createOpenAI;
    try {
      const ollamaProvider = req('ollama-ai-provider-v2');
      ollama = ollamaProvider.ollama;
      createOllama = ollamaProvider.createOllama;
    } catch {
      ollama = null;
      createOllama = null;
    }
    try {
      const libsql = req('@mastra/libsql');
      LibSQLStore = libsql.LibSQLStore;
      LibSQLVector = libsql.LibSQLVector;
    } catch {
      LibSQLStore = null;
      LibSQLVector = null;
    }
    try {
      fastembed = req('@mastra/fastembed').fastembed;
    } catch {
      fastembed = null;
    }
    return true;
  } catch (error: any) {
    _mastraLoadError = error?.message || String(error);
    console.warn('Mastra packages not available:', _mastraLoadError);
    if (error?.message?.includes('22.13') || error?.message?.includes('>=22')) {
      console.warn('💡 Mastra 1.x requires Node.js 22.13+. VS Code uses Node 20. Consider disabling useMastraMemory or upgrading your Node/VS Code.');
    }
    return false;
  }
}

// Optional tool imports - will be null if Mastra not available
let scanRepositoryTool: any = null;
let detectSecretsTool: any = null;
let evaluatePolicyTool: any = null;
let adjustCodeTool: any = null;
let generateDiffTool: any = null;
let hashDataTool: any = null;

try {
  const tools = require('../tools');
  scanRepositoryTool = tools.scanRepositoryTool;
  detectSecretsTool = tools.detectSecretsTool;
  evaluatePolicyTool = tools.evaluatePolicyTool;
  adjustCodeTool = tools.adjustCodeTool;
  generateDiffTool = tools.generateDiffTool;
  hashDataTool = tools.hashDataTool;
} catch (error) {
  console.warn('Mastra tools not available:', error);
}

// System prompts from cyber-agent-prompts
const SYSTEM_PROMPTS = {
  base: `You are CipherMate, an AI-powered security assistant for VS Code.

Your role:
- Help developers find and fix security vulnerabilities
- Explain security issues in simple terms
- Suggest secure code fixes
- Answer security-related questions

Key principles:
- Be helpful, clear, and educational
- Focus on practical, actionable advice
- Explain the "why" behind security issues
- Suggest fixes that are secure AND maintainable

When scanning repositories:
- Use the scan_repository tool to find vulnerabilities
- Explain findings clearly
- Prioritize critical and high-severity issues
- Suggest fixes using the adjust_code tool

Remember: Security is about making code safer, not perfect. Help developers improve incrementally.`,
};

/**
 * Create security agent with memory management
 */
export function createSecurityAgent(context: vscode.ExtensionContext): any {
  // Load Mastra from extension's node_modules (ensures correct resolution)
  if (!loadMastraPackages(context.extensionPath)) {
    const msg = _mastraLoadError
      ? `Mastra packages failed to load: ${_mastraLoadError}. Mastra 1.x requires Node.js 22.13+; VS Code uses Node 20. Set ciphermate.useMastraMemory to false to use standard memory.`
      : 'Mastra packages not installed. Run: npm install @mastra/core @mastra/memory @ai-sdk/openai';
    throw new Error(msg);
  }
  if (!Agent || !Memory || !TokenLimiter || !ToolCallFilter || !openai) {
    throw new Error('Mastra packages not installed. Run: npm install @mastra/core @mastra/memory @ai-sdk/openai');
  }

  // Get AI provider from settings (keys match package.json: ciphermate.ai.*)
  const config = vscode.workspace.getConfiguration('ciphermate');
  const aiProvider = config.get<string>('ai.provider', 'openrouter');
  const openaiSection = config.get<{ model?: string }>('ai.openai', {});
  const modelName = openaiSection?.model || config.get<string>('ai.openai.model', 'gpt-4o');
  const ollamaSection = config.get<{ apiUrl?: string; model?: string }>('ai.ollama', {});
  const ollamaUrl = ollamaSection?.apiUrl || config.get<string>('ai.ollama.apiUrl', 'http://localhost:11434');
  const ollamaModel = ollamaSection?.model || config.get<string>('ai.ollama.model', 'deepseek-coder:1.3b');

  // Select model based on provider
  // Ollama: use ollama-ai-provider-v2 (native API) for proper AI SDK compatibility
  let model;
  if (aiProvider === 'ollama') {
    if (!ollama && !createOllama) {
      throw new Error('ollama-ai-provider-v2 not installed. Run: npm install ollama-ai-provider-v2');
    }
    const baseUrl = ollamaUrl.replace(/\/$/, '').replace(/\/v1\/?$/, '').replace(/\/api\/?$/, '') + '/api';
    const ollamaInstance = createOllama ? createOllama({ baseURL: baseUrl }) : ollama;
    model = ollamaInstance(ollamaModel);
    console.log('Mastra: Using Ollama model', ollamaModel, 'at', baseUrl);
  } else if (aiProvider === 'openai' && openai) {
    model = openai(modelName);
  } else if (openai) {
    model = openai('gpt-4o');
  } else {
    throw new Error('No AI provider available. Configure ai.provider (ollama, openai) and API settings.');
  }

  // Configure memory storage - use LibSQL if available, otherwise in-memory
  // Semantic recall: enabled when vector store + embedder available (LibSQLVector + FastEmbed)
  const hasSemanticRecall = LibSQLStore && LibSQLVector && fastembed;
  const memoryConfig: any = {
    options: {
      // Limit conversation history to 20 messages
      lastMessages: 20,
      
      // Semantic recall: RAG-based retrieval of past messages (when vector + embedder configured)
      semanticRecall: hasSemanticRecall ? {
        topK: 5,
        messageRange: 2,
        scope: 'resource',
      } : false,
      
      // Working memory for user preferences
      workingMemory: {
        enabled: true,
        scope: 'resource', // Persist across all conversations
        template: `# User Profile
- **Name**:
- **Preferences**:
- **Current Project**:
- **Security Focus Areas**:
`,
      },
    },
    processors: [
      // Remove verbose tool calls to save tokens (except scan results)
      new ToolCallFilter({ 
        exclude: ['scan-repository'] // Keep scan results, filter others
      }),
      
      // Limit total tokens to prevent context overflow (~127k tokens max)
      new TokenLimiter(127000),
    ],
  };

  // Try to use LibSQL storage if available
  if (LibSQLStore) {
    try {
      const storagePath = path.join(
        context.globalStorageUri.fsPath,
        'ciphermate-memory.db'
      );
      const connectionUrl = `file:${storagePath}`;
      memoryConfig.storage = new LibSQLStore({ url: connectionUrl });
      console.log('✅ Mastra: Using LibSQL disk storage for memory');

      // Vector store + embedder for semantic recall
      if (LibSQLVector && fastembed) {
        try {
          memoryConfig.vector = new LibSQLVector({ connectionUrl });
          memoryConfig.embedder = fastembed;
          console.log('✅ Mastra: Semantic recall enabled (LibSQLVector + FastEmbed)');
        } catch (err: any) {
          console.warn('⚠️ Mastra: Semantic recall unavailable:', err?.message || err);
        }
      } else {
        if (!LibSQLVector) console.warn('⚠️ Mastra: LibSQLVector not available');
        if (!fastembed) console.warn('⚠️ Mastra: FastEmbed not available (install @mastra/fastembed for semantic recall)');
      }
    } catch (error: any) {
      console.warn('⚠️ Mastra: Failed to initialize LibSQL storage:', error?.message || error);
      console.warn('⚠️ Mastra: Using in-memory storage (memory will not persist between sessions)');
    }
  } else {
    console.warn('⚠️ Mastra: LibSQL not available (native module issue)');
    console.warn('⚠️ Mastra: Using in-memory storage (memory will not persist between sessions)');
    console.warn('💡 Tip: Run "npm install" to install native dependencies');
  }

  return new Agent({
    name: 'security-agent',
    instructions: SYSTEM_PROMPTS.base,
    model: model,
    memory: new Memory(memoryConfig),
    tools: {
      ...(scanRepositoryTool && { 'scan-repository': scanRepositoryTool }),
      ...(detectSecretsTool && { 'detect-secrets': detectSecretsTool }),
      ...(evaluatePolicyTool && { 'evaluate-policy': evaluatePolicyTool }),
      ...(adjustCodeTool && { 'adjust-code': adjustCodeTool }),
      ...(generateDiffTool && { 'generate-diff': generateDiffTool }),
      ...(hashDataTool && { 'hash-data': hashDataTool }),
    },
  });
}
