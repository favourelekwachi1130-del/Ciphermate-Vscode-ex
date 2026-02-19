# Mastra Quick Start for CipherMate

## Step 1: Install Dependencies

```bash
npm install @mastra/core @mastra/memory @mastra/loggers @ai-sdk/openai @ai-sdk/anthropic zod
```

## Step 2: Create Mastra Instance

```typescript
// src/mastra/index.ts
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { securityAgent } from './agents/security-agent';
import { securityScanWorkflow } from './workflows/security-scan';

export const mastra = new Mastra({
  agents: { securityAgent },
  workflows: { securityScanWorkflow },
  logger: new PinoLogger({
    name: 'CipherMate',
    level: 'debug',
  }),
});
```

## Step 3: Create Security Agent

```typescript
// src/mastra/agents/security-agent.ts
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { Memory } from '@mastra/memory';
import { scanRepositoryTool, analyzeVulnerabilityTool } from '../tools';

const memory = new Memory({
  options: {
    lastMessages: 20,
    semanticRecall: true,
  },
});

export const securityAgent = new Agent({
  name: 'security-agent',
  instructions: `You are CipherMate, an AI-powered security assistant...`,
  model: openai('gpt-4o'),
  memory,
  tools: {
    scanRepository: scanRepositoryTool,
    analyzeVulnerability: analyzeVulnerabilityTool,
  },
});
```

## Step 4: Create Tools

```typescript
// src/mastra/tools/scan-repository.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { RepositoryScanner } from '../../scanners';

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
    const result = await scanner.scan({
      scanners: inputData.scanners,
    });
    return {
      vulnerabilities: result.vulnerabilities,
      summary: result.aggregated,
    };
  },
});
```

## Step 5: Use in Chat Interface

```typescript
// In chat-interface.ts
import { mastra } from '../mastra';

// Replace CyberAgent call with Mastra agent
const agent = mastra.getAgent('securityAgent');
const response = await agent.generate(userMessage, {
  threadId: currentSession.id,
  resourceId: workspacePath,
});

this.addMessage('assistant', response.text);
```

## Benefits You'll See Immediately

1. **Simpler Code**: Less boilerplate, more declarative
2. **Better Errors**: Standardized error handling
3. **Automatic Fallback**: Built-in provider switching
4. **Memory Management**: Automatic conversation history
5. **Observability**: Built-in logging and monitoring

## Next Steps

See `docs/MASTRA_INTEGRATION_PLAN.md` for full migration strategy.
