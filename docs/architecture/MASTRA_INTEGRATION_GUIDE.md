# Mastra Integration Guide

## Principle

**Mastra ONLY orchestrates. CipherMate Core owns ALL logic.**

---

## Integration Pattern

### ✅ Correct Pattern (Mastra calls CipherMate)

```typescript
// Mastra Tool - Orchestration Only
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getSecretDetectionService } from '../../core';

export const detectSecretsTool = createTool({
  id: 'detect-secrets',
  description: 'Detect secrets in code using CipherMate',
  inputSchema: z.object({
    code: z.string(),
    filePath: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    // Mastra ONLY calls CipherMate service
    const service = getSecretDetectionService();
    return service.detectSecrets(inputData.code, inputData.filePath);
  },
});
```

### ❌ Wrong Pattern (Logic in Mastra)

```typescript
// DON'T DO THIS - Logic should be in CipherMate Core
export const detectSecretsTool = createTool({
  execute: async ({ inputData }) => {
    // ❌ Logic mixed with orchestration
    const regex = /api[_-]?key\s*[:=]\s*['"]([^'"]+)['"]/i;
    const matches = inputData.code.match(regex);
    return matches;
  },
});
```

---

## Tool Examples

### 1. Secret Detection Tool

```typescript
// src/mastra/tools/detect-secrets.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getSecretDetectionService } from '../../core';

export const detectSecretsTool = createTool({
  id: 'detect-secrets',
  description: 'Detect hardcoded secrets, API keys, and credentials in code',
  inputSchema: z.object({
    code: z.string(),
    filePath: z.string().optional(),
  }),
  outputSchema: z.object({
    secrets: z.array(z.any()),
    total: z.number(),
    bySeverity: z.object({
      critical: z.number(),
      high: z.number(),
      medium: z.number(),
      low: z.number(),
    }),
  }),
  execute: async ({ inputData }) => {
    const service = getSecretDetectionService();
    return service.detectSecrets(inputData.code, inputData.filePath);
  },
});
```

### 2. File Operations Tool

```typescript
// src/mastra/tools/file-operations.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getFileOperationsService } from '../../core';

export const readFileTool = createTool({
  id: 'read-file',
  description: 'Read file contents',
  inputSchema: z.object({
    filePath: z.string(),
  }),
  execute: async ({ inputData }) => {
    const service = getFileOperationsService();
    return await service.readFile(inputData.filePath);
  },
});

export const writeFileTool = createTool({
  id: 'write-file',
  description: 'Write file contents',
  inputSchema: z.object({
    filePath: z.string(),
    content: z.string(),
  }),
  execute: async ({ inputData }) => {
    const service = getFileOperationsService();
    return await service.writeFile(inputData.filePath, inputData.content);
  },
});
```

### 3. Code Diffing Tool

```typescript
// src/mastra/tools/code-diffing.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getCodeDiffingService } from '../../core';

export const generateDiffTool = createTool({
  id: 'generate-diff',
  description: 'Generate unified diff between two code versions',
  inputSchema: z.object({
    original: z.string(),
    modified: z.string(),
    filePath: z.string(),
  }),
  execute: async ({ inputData }) => {
    const service = getCodeDiffingService();
    return service.generateDiff(
      inputData.original,
      inputData.modified,
      inputData.filePath
    );
  },
});
```

### 4. Policy Enforcement Tool

```typescript
// src/mastra/tools/policy-enforcement.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getPolicyEnforcementService } from '../../core';

export const evaluatePolicyTool = createTool({
  id: 'evaluate-policy',
  description: 'Evaluate code against security policies',
  inputSchema: z.object({
    code: z.string(),
    filePath: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    const service = getPolicyEnforcementService();
    return service.evaluateCode(inputData.code, inputData.filePath);
  },
});
```

### 5. Code Adjustment Tool

```typescript
// src/mastra/tools/code-adjustment.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getCodeAdjustmentService } from '../../core';

export const adjustCodeTool = createTool({
  id: 'adjust-code',
  description: 'Adjust code for enterprise-grade security',
  inputSchema: z.object({
    code: z.string(),
    language: z.string().default('javascript'),
  }),
  execute: async ({ inputData }) => {
    const service = getCodeAdjustmentService();
    return service.adjustCode(inputData.code, inputData.language);
  },
});
```

### 6. Hashing Tool

```typescript
// src/mastra/tools/hashing.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getHashingService } from '../../core';

export const hashDataTool = createTool({
  id: 'hash-data',
  description: 'Generate hash for data',
  inputSchema: z.object({
    data: z.string(),
    algorithm: z.enum(['sha256', 'sha512']).default('sha256'),
  }),
  execute: async ({ inputData }) => {
    const service = getHashingService();
    if (inputData.algorithm === 'sha256') {
      return { hash: service.sha256(inputData.data) };
    } else {
      return { hash: service.sha512(inputData.data) };
    }
  },
});
```

### 7. Integrity Validation Tool

```typescript
// src/mastra/tools/integrity-validation.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getIntegrityValidationService } from '../../core';

export const verifyIntegrityTool = createTool({
  id: 'verify-integrity',
  description: 'Verify file integrity using checksum',
  inputSchema: z.object({
    filePath: z.string(),
    expectedChecksum: z.string(),
    algorithm: z.enum(['sha256', 'sha512']).default('sha256'),
  }),
  execute: async ({ inputData }) => {
    const service = getIntegrityValidationService();
    return await service.verifyFileIntegrity(
      inputData.filePath,
      inputData.expectedChecksum,
      inputData.algorithm
    );
  },
});
```

---

## Agent Integration

### Security Agent with CipherMate Tools

```typescript
// src/mastra/agents/security-agent.ts
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import {
  detectSecretsTool,
  evaluatePolicyTool,
  adjustCodeTool,
  generateDiffTool,
} from '../tools';

export const securityAgent = new Agent({
  name: 'security-agent',
  instructions: `You are CipherMate, a security assistant.
Use the available tools to:
- Detect secrets in code
- Evaluate code against security policies
- Adjust code for security
- Generate diffs for code changes

All security logic is handled by CipherMate Core services.`,
  model: openai('gpt-4o'),
  tools: {
    detectSecrets: detectSecretsTool,
    evaluatePolicy: evaluatePolicyTool,
    adjustCode: adjustCodeTool,
    generateDiff: generateDiffTool,
  },
});
```

---

## Workflow Integration

### Security Scan Workflow

```typescript
// src/mastra/workflows/security-scan.ts
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { getSecretDetectionService } from '../../core';
import { getPolicyEnforcementService } from '../../core';
import { getFileOperationsService } from '../../core';

const scanFileStep = createStep({
  id: 'scan-file',
  execute: async ({ inputData, mastra }) => {
    const fileService = getFileOperationsService();
    const secretService = getSecretDetectionService();
    const policyService = getPolicyEnforcementService();

    // Read file
    const content = await fileService.readFile(inputData.filePath);

    // Detect secrets
    const secrets = secretService.detectSecrets(content, inputData.filePath);

    // Evaluate policies
    const policyResult = policyService.evaluateCode(content, inputData.filePath);

    return {
      filePath: inputData.filePath,
      secrets,
      policyViolations: policyResult.violations,
    };
  },
});

export const securityScanWorkflow = createWorkflow({
  id: 'security-scan',
  inputSchema: z.object({
    filePaths: z.array(z.string()),
  }),
  outputSchema: z.object({
    results: z.array(z.any()),
  }),
})
  .then(scanFileStep)
  .commit();
```

---

## Rules

### ✅ DO

1. **Call CipherMate Core services** from Mastra tools
2. **Keep orchestration logic** in Mastra (workflow, agent coordination)
3. **Keep all deterministic logic** in CipherMate Core
4. **Test core services independently** (without Mastra)
5. **Use singleton pattern** for core services

### ❌ DON'T

1. **Don't put logic in Mastra tools** - use CipherMate Core
2. **Don't depend on Mastra** in core services
3. **Don't mix orchestration with logic** - keep them separate
4. **Don't hardcode patterns** in Mastra - use CipherMate Core patterns
5. **Don't duplicate logic** - if it's deterministic, it belongs in Core

---

## Testing

### Test Core Services Without Mastra

```typescript
// tests/core/secret-detection.test.ts
import { getSecretDetectionService } from '../../src/core';

describe('SecretDetectionService', () => {
  it('should detect secrets without Mastra', () => {
    const service = getSecretDetectionService();
    const code = 'const apiKey = "sk_live_1234567890abcdef";';
    
    const result = service.detectSecrets(code);
    
    expect(result.secrets.length).toBeGreaterThan(0);
    expect(result.secrets[0].patternName).toBe('Generic API Key');
  });
});
```

### Test Mastra Tools Call Core Services

```typescript
// tests/mastra/tools/detect-secrets.test.ts
import { detectSecretsTool } from '../../../src/mastra/tools/detect-secrets';
import { getSecretDetectionService } from '../../../src/core';

describe('detectSecretsTool', () => {
  it('should call CipherMate Core service', async () => {
    const coreService = getSecretDetectionService();
    const spy = jest.spyOn(coreService, 'detectSecrets');

    await detectSecretsTool.execute({
      inputData: {
        code: 'const apiKey = "test";',
      },
    });

    expect(spy).toHaveBeenCalled();
  });
});
```

---

## Summary

- **Mastra** = Orchestration, AI model routing, workflow management
- **CipherMate Core** = All deterministic, testable, independent logic
- **Integration** = Mastra tools call CipherMate Core services
- **Independence** = Core services work without Mastra
