# Mastra Integration Plan for CipherMate

## Overview

Mastra is an AI framework that can significantly improve CipherMate's efficiency by:
- **Unified Model Routing**: Replace custom provider implementations with Mastra's 40+ provider support
- **Agent Framework**: Use Mastra's agent system instead of custom AgenticCore
- **Workflows**: Orchestrate complex scanning operations with Mastra workflows
- **Memory Management**: Better context and conversation history management
- **Tool System**: Standardized tool calling with better error handling
- **Observability**: Built-in monitoring and debugging

## Current Architecture Issues

1. **Multiple Provider Implementations**: Custom code for OpenAI, Anthropic, Gemini, Ollama
2. **Custom Agent System**: AgenticCore has manual tool calling and iteration logic
3. **Manual Workflow Orchestration**: Scanning operations are manually orchestrated
4. **Custom Memory Management**: Conversation history stored manually
5. **No Built-in Observability**: Difficult to debug and monitor AI operations

## Integration Benefits

### 1. Model Routing Efficiency
**Current**: Custom provider classes for each AI service
**With Mastra**: Single unified interface, automatic fallback, better error handling

```typescript
// Current: Multiple provider classes
// With Mastra: One unified model router
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';

const model = openai('gpt-4o'); // or anthropic('claude-sonnet-4')
```

### 2. Agent Framework
**Current**: Custom AgenticCore with manual tool calling
**With Mastra**: Built-in agent system with automatic tool selection

```typescript
// Current: Manual tool calling in AgenticCore
// With Mastra: Automatic tool selection
import { Agent } from '@mastra/core/agent';

export const securityAgent = new Agent({
  name: 'security-agent',
  instructions: 'You are CipherMate, a security analysis assistant...',
  model: openai('gpt-4o'),
  tools: { scanRepository, analyzeVulnerability, suggestFix },
});
```

### 3. Workflow Orchestration
**Current**: Manual step-by-step execution
**With Mastra**: Declarative workflow with automatic state management

```typescript
// Current: Manual orchestration
// With Mastra: Declarative workflows
import { createWorkflow, createStep } from '@mastra/core/workflows';

const scanStep = createStep({
  id: 'scan-repository',
  execute: async ({ inputData, mastra }) => {
    const scanner = mastra.getTool('repositoryScanner');
    return await scanner.execute({ path: inputData.workspacePath });
  }
});

const analyzeStep = createStep({
  id: 'analyze-vulnerabilities',
  execute: async ({ inputData, mastra }) => {
    const agent = mastra.getAgent('securityAgent');
    return await agent.generate(`Analyze these vulnerabilities: ${JSON.stringify(inputData.vulnerabilities)}`);
  }
});

export const securityScanWorkflow = createWorkflow({
  id: 'security-scan',
  inputSchema: z.object({ workspacePath: z.string() }),
  outputSchema: z.object({ report: z.string() }),
})
  .then(scanStep)
  .then(analyzeStep)
  .commit();
```

### 4. Memory Management
**Current**: Manual conversation history storage
**With Mastra**: Built-in memory with semantic recall and working memory

```typescript
// Current: Manual history management
// With Mastra: Built-in memory system
import { Memory } from '@mastra/memory';

const memory = new Memory({
  options: {
    lastMessages: 10,
    semanticRecall: true,
    workingMemory: {
      enabled: true,
      template: `# Security Scan History
## Recent Scans
- {{recentScans}}
## Common Vulnerabilities Found
- {{commonVulns}}
`
    }
  }
});

export const securityAgent = new Agent({
  name: 'security-agent',
  memory,
  // ...
});
```

### 5. Tool System
**Current**: Custom tool definitions and execution
**With Mastra**: Standardized tool system with better type safety

```typescript
// Current: Custom tool definitions
// With Mastra: Standardized tools
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const scanRepositoryTool = createTool({
  id: 'scan-repository',
  description: 'Scan a repository for security vulnerabilities',
  inputSchema: z.object({
    path: z.string(),
    scanners: z.array(z.string()).optional(),
  }),
  outputSchema: z.object({
    vulnerabilities: z.array(z.any()),
    summary: z.object({
      total: z.number(),
      critical: z.number(),
      high: z.number(),
    }),
  }),
  execute: async ({ inputData }) => {
    const scanner = new RepositoryScanner(inputData.path);
    const result = await scanner.scan();
    return {
      vulnerabilities: result.vulnerabilities,
      summary: result.aggregated,
    };
  },
});
```

## Implementation Plan

### Phase 1: Model Routing (Week 1)
**Goal**: Replace custom providers with Mastra model router

1. Install Mastra dependencies
   ```bash
   npm install @mastra/core @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google
   ```

2. Create Mastra instance
   ```typescript
   // src/mastra/index.ts
   import { Mastra } from '@mastra/core/mastra';
   
   export const mastra = new Mastra({
     logger: new PinoLogger({ name: 'CipherMate' }),
   });
   ```

3. Update provider configuration to use Mastra models
   ```typescript
   // Replace custom providers with Mastra models
   import { openai } from '@ai-sdk/openai';
   const model = openai('gpt-4o');
   ```

**Benefits**: 
- Unified API for all providers
- Automatic fallback handling
- Better error messages
- Easier to add new providers

### Phase 2: Agent Migration (Week 2)
**Goal**: Replace AgenticCore with Mastra Agent

1. Convert AgenticCore to Mastra Agent
   ```typescript
   // src/mastra/agents/security-agent.ts
   import { Agent } from '@mastra/core/agent';
   import { scanRepositoryTool, analyzeVulnerabilityTool } from '../tools';
   
   export const securityAgent = new Agent({
     name: 'security-agent',
     instructions: SYSTEM_PROMPTS.base,
     model: ({ runtimeContext }) => {
       const provider = runtimeContext.get('provider') || 'openai';
       return getModelForProvider(provider);
     },
     tools: {
       scanRepository: scanRepositoryTool,
       analyzeVulnerability: analyzeVulnerabilityTool,
       suggestFix: suggestFixTool,
     },
   });
   ```

2. Update ChatInterface to use Mastra agent
   ```typescript
   // In chat-interface.ts
   const agent = mastra.getAgent('securityAgent');
   const response = await agent.generate(userMessage, {
     threadId: currentSession.id,
     resourceId: workspacePath,
   });
   ```

**Benefits**:
- Automatic tool selection
- Better error handling
- Built-in iteration limits
- Progress callbacks

### Phase 3: Workflow Integration (Week 3)
**Goal**: Convert scanning operations to Mastra workflows

1. Create security scan workflow
   ```typescript
   // src/mastra/workflows/security-scan.ts
   export const securityScanWorkflow = createWorkflow({
     id: 'security-scan',
     inputSchema: z.object({
       workspacePath: z.string(),
       scanners: z.array(z.string()).optional(),
     }),
     outputSchema: z.object({
       vulnerabilities: z.array(z.any()),
       report: z.string(),
     }),
   })
     .then(scanRepositoryStep)
     .then(enrichWithCVEStep)
     .then(analyzeVulnerabilitiesStep)
     .then(generateReportStep)
     .commit();
   ```

2. Use workflow in ChatInterface
   ```typescript
   const workflow = mastra.getWorkflow('securityScan');
   const run = await workflow.createRunAsync();
   const result = await run.start({
     inputData: { workspacePath, scanners: ['dependency', 'secrets'] }
   });
   ```

**Benefits**:
- Declarative workflow definition
- Automatic state management
- Suspend/resume capability
- Better error recovery
- Progress tracking

### Phase 4: Memory Integration (Week 4)
**Goal**: Use Mastra memory for conversation context

1. Configure memory for security agent
   ```typescript
   import { Memory } from '@mastra/memory';
   
   const memory = new Memory({
     options: {
       lastMessages: 20,
       semanticRecall: true,
       workingMemory: {
         enabled: true,
         template: `# CipherMate Context
 ## Current Workspace
 {{workspacePath}}
 
 ## Recent Scans
 {{recentScans}}
 
 ## Common Issues Found
 {{commonIssues}}
 `
       }
     }
   });
   ```

2. Update agent to use memory
   ```typescript
   export const securityAgent = new Agent({
     name: 'security-agent',
     memory,
     // ...
   });
   ```

**Benefits**:
- Better context retention
- Semantic search over history
- Working memory for important info
- Automatic memory management

### Phase 5: Observability (Week 5)
**Goal**: Add Mastra observability for monitoring

1. Configure observability
   ```typescript
   import { PinoLogger } from '@mastra/loggers';
   
   export const mastra = new Mastra({
     logger: new PinoLogger({
       name: 'CipherMate',
       level: 'debug',
     }),
     // Observability automatically enabled
   });
   ```

2. Use in production
   - Monitor agent performance
   - Track tool usage
   - Debug workflow issues
   - Analyze token usage

**Benefits**:
- Built-in logging
- Performance metrics
- Debugging tools
- Token usage tracking

## Migration Strategy

### Gradual Migration
1. **Keep existing code**: Don't remove current implementations immediately
2. **Parallel implementation**: Run Mastra alongside existing code
3. **Feature flags**: Use settings to switch between implementations
4. **A/B testing**: Compare performance and reliability
5. **Gradual rollout**: Migrate one feature at a time

### Compatibility Layer
Create adapters to bridge old and new systems:

```typescript
// src/mastra/adapters/legacy-adapter.ts
export class LegacyAdapter {
  static async migrateToMastra(oldRequest: AgentRequest): Promise<AgentResponse> {
    const agent = mastra.getAgent('securityAgent');
    const response = await agent.generate(oldRequest.message);
    return {
      action: AgentAction.UNKNOWN,
      message: response.text,
      confidence: 0.9,
    };
  }
}
```

## Expected Improvements

### Performance
- **30-50% faster** tool execution with optimized routing
- **Reduced latency** with better connection pooling
- **Faster fallback** with automatic provider switching

### Reliability
- **Better error handling** with standardized error types
- **Automatic retries** for transient failures
- **Graceful degradation** when providers fail

### Developer Experience
- **Less code to maintain** (estimated 40% reduction)
- **Better type safety** with Zod schemas
- **Easier testing** with Mastra's testing utilities
- **Better debugging** with observability tools

### User Experience
- **Faster responses** with optimized workflows
- **Better context** with improved memory
- **More reliable** with better error handling
- **Richer features** with workflow capabilities

## Next Steps

1. **Install Mastra**: `npm install @mastra/core @mastra/memory @mastra/loggers`
2. **Create Mastra instance**: Set up basic configuration
3. **Migrate one agent**: Start with CyberAgent (easiest)
4. **Create one workflow**: Convert repository scan to workflow
5. **Test thoroughly**: Compare with existing implementation
6. **Iterate**: Migrate more features based on results

## Resources

- [Mastra Documentation](https://mastra.ai/docs)
- [Mastra Examples](https://mastra.ai/examples)
- [Mastra Discord](https://discord.gg/BTYqqHKUrf)
- [Mastra Course](https://mastra.ai/course)

## Questions?

- Should we migrate all at once or gradually?
- Which feature should we migrate first?
- Do we need to maintain backward compatibility?
- How do we handle existing user data?
