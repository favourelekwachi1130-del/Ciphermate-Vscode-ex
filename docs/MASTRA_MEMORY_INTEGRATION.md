# Mastra Memory Management Integration

## Why Mastra Can Help

Mastra provides **built-in memory management** that can significantly improve CipherMate's memory handling:

### ✅ Current Issues Mastra Solves

1. **Conversation History Management**
   - ✅ Automatic `lastMessages` limiting (configurable)
   - ✅ Token-based trimming with `TokenLimiter` processor
   - ✅ Better than manual cleanup

2. **Memory Processors**
   - ✅ `TokenLimiter` - Prevents context window overflow
   - ✅ `ToolCallFilter` - Removes verbose tool calls from memory
   - ✅ Custom processors for specific cleanup needs

3. **Storage Optimization**
   - ✅ Disk-based storage adapters (LibSQL, PostgreSQL, MongoDB)
   - ✅ Automatic persistence without manual management
   - ✅ Better than storing in `globalState`

4. **Working Memory**
   - ✅ Structured memory with templates/schemas
   - ✅ Automatic updates by agent
   - ✅ Resource-scoped or thread-scoped

## Integration Plan

### Phase 1: Install Mastra Memory Dependencies

```bash
npm install @mastra/core @mastra/memory @mastra/libsql
```

### Phase 2: Create Mastra Instance with Memory

```typescript
// src/mastra/index.ts
import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { TokenLimiter, ToolCallFilter } from '@mastra/memory/processors';

export const mastra = new Mastra({
  storage: new LibSQLStore({
    url: 'file:./ciphermate-memory.db', // Disk storage, not memory
  }),
  logger: new PinoLogger({ name: 'CipherMate' }),
});
```

### Phase 3: Create Agent with Memory Management

```typescript
// src/mastra/agents/security-agent.ts
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { TokenLimiter, ToolCallFilter } from '@mastra/memory/processors';
import { openai } from '@ai-sdk/openai';

export const securityAgent = new Agent({
  name: 'security-agent',
  instructions: SYSTEM_PROMPTS.base,
  model: openai('gpt-4o'),
  memory: new Memory({
    storage: new LibSQLStore({
      url: 'file:./ciphermate-memory.db',
    }),
    options: {
      // Limit conversation history to 20 messages
      lastMessages: 20,
      
      // Enable semantic recall with limits
      semanticRecall: {
        topK: 5, // Only retrieve 5 most relevant messages
        messageRange: 2, // Include 2 messages before/after
      },
      
      // Working memory for user preferences
      workingMemory: {
        enabled: true,
        scope: 'resource', // Persist across all conversations
        template: `# User Profile
- **Name**:
- **Preferences**:
- **Current Project**:
`,
      },
    },
    processors: [
      // Remove verbose tool calls to save tokens
      new ToolCallFilter({ exclude: ['scanRepository'] }),
      
      // Limit total tokens to prevent context overflow
      new TokenLimiter(127000), // ~127k tokens max
    ],
  }),
});
```

### Phase 4: Replace AgenticCore with Mastra Agent

```typescript
// src/ai-agent/chat-interface.ts
import { securityAgent } from '../mastra/agents/security-agent';

export class ChatInterface {
  async processMessage(message: string, workspacePath?: string): Promise<string> {
    // Use Mastra agent instead of AgenticCore
    const response = await securityAgent.generate(message, {
      memory: {
        thread: this.currentSession?.id || `thread-${Date.now()}`,
        resource: workspacePath || 'default',
      },
    });
    
    return response.text;
  }
}
```

## Benefits

### 1. Automatic Memory Cleanup

**Before (Manual)**:
```typescript
// Manual cleanup in AgenticCore
cleanupConversationHistory(50);
cleanupScanData(1000);
```

**After (Mastra)**:
```typescript
// Automatic with processors
processors: [
  new TokenLimiter(127000), // Auto-trims when limit exceeded
  new ToolCallFilter(), // Removes verbose tool calls
]
```

### 2. Better Storage

**Before**:
```typescript
// Stored in globalState (memory)
context.globalState.update('conversation', messages);
```

**After**:
```typescript
// Stored on disk (LibSQL)
storage: new LibSQLStore({
  url: 'file:./ciphermate-memory.db',
})
```

### 3. Token Management

**Before**:
```typescript
// No token tracking - could exceed context window
this.state.conversation.push(message);
```

**After**:
```typescript
// Automatic token counting and trimming
processors: [
  new TokenLimiter(127000), // Prevents overflow
]
```

### 4. Semantic Recall

**Before**:
```typescript
// Only recent messages available
const recentMessages = conversation.slice(-50);
```

**After**:
```typescript
// Relevant messages from any conversation
semanticRecall: {
  topK: 5, // Finds most relevant messages
  messageRange: 2,
}
```

## Migration Steps

### Step 1: Install Dependencies

```bash
npm install @mastra/core @mastra/memory @mastra/libsql
```

### Step 2: Create Mastra Instance

Create `src/mastra/index.ts` with storage configuration.

### Step 3: Create Security Agent

Create `src/mastra/agents/security-agent.ts` with memory configuration.

### Step 4: Update ChatInterface

Replace `AgenticCore` calls with `securityAgent.generate()`.

### Step 5: Test Memory Management

Verify that:
- ✅ Conversation history is limited to 20 messages
- ✅ Tokens are automatically trimmed
- ✅ Memory is stored on disk, not in memory
- ✅ Old conversations are cleaned up automatically

## Configuration Options

### Memory Limits

```typescript
memory: new Memory({
  options: {
    lastMessages: 20, // Keep last 20 messages
    semanticRecall: {
      topK: 5, // Retrieve 5 relevant messages
    },
  },
  processors: [
    new TokenLimiter(127000), // Max 127k tokens
  ],
})
```

### Storage Options

```typescript
// Option 1: File-based (LibSQL)
storage: new LibSQLStore({
  url: 'file:./ciphermate-memory.db',
})

// Option 2: PostgreSQL (for production)
storage: new PgStore({
  connectionString: process.env.DATABASE_URL,
})

// Option 3: MongoDB
storage: new MongoStore({
  connectionString: process.env.MONGODB_URL,
})
```

## Comparison: Before vs After

| Feature | Before (Manual) | After (Mastra) |
|---------|----------------|----------------|
| Conversation History | Manual cleanup (50 msgs) | Automatic (20 msgs + token limit) |
| Token Management | None | Automatic with TokenLimiter |
| Storage | globalState (memory) | Disk (LibSQL/PostgreSQL) |
| Memory Cleanup | Manual functions | Automatic processors |
| Semantic Recall | None | Built-in with vector search |
| Working Memory | Custom implementation | Built-in templates/schemas |

## Next Steps

1. ✅ Install Mastra dependencies
2. ✅ Create Mastra instance with storage
3. ✅ Create security agent with memory
4. ✅ Migrate ChatInterface to use Mastra agent
5. ✅ Test memory management
6. ✅ Remove old manual cleanup code

## Resources

- [Mastra Memory Docs](https://mastra.ai/docs/memory/overview)
- [Memory Processors](https://mastra.ai/docs/memory/memory-processors)
- [Storage Adapters](https://mastra.ai/docs/memory/storage/memory-with-libsql)
