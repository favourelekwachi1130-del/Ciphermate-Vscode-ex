# Agentic AI Architecture - CipherMate

## Current Implementation

### What Exists Now

1. **AIAgentCore** (`src/ai-agent/core.ts`)
   - Simple command router
   - Pattern matching for intent recognition
   - Triggers existing commands
   - **Limitation**: Doesn't actually DO the work, just routes commands

2. **AgenticCore** (`src/ai-agent/agentic-core.ts`) - **NEW**
   - True autonomous agent with tool calling
   - Can plan multi-step operations
   - Executes tools autonomously
   - **Core training**: Repository scanning and vulnerability fixing

## AgenticCore - The Real Agent

### Features

1. **Tool Calling**
   - Agent can call tools autonomously
   - Tools are registered and available to AI
   - AI decides which tools to use and when

2. **Available Tools**
   - `scan_repository` - Full repository security scan
   - `scan_file` - Scan individual files
   - `analyze_code` - Deep AI code analysis
   - `generate_fix` - Generate secure patches
   - `apply_fix` - Apply fixes to files
   - `read_file` - Read file contents
   - `list_files` - Discover code files
   - `explain_vulnerability` - Detailed explanations

3. **Autonomous Operation**
   - Agent plans multi-step operations
   - Executes tools in sequence
   - Maintains state across operations
   - Can handle complex requests like "scan and fix all vulnerabilities"

### How It Works

```
User: "scan my repository and fix all critical vulnerabilities"

Agent thinks:
1. I need to scan the repository  †  use scan_repository tool
2. Analyze results  †  check vulnerabilities
3. For each critical vulnerability  †  generate_fix
4. Apply fixes  †  apply_fix
5. Verify  †  scan again

Agent executes:
- Calls scan_repository  †  gets vulnerabilities
- For each critical issue:
  - Calls generate_fix  †  gets secure code
  - Calls apply_fix  †  modifies file
- Reports completion
```

### Example Workflow

**User Request**: "Scan my codebase and fix SQL injection vulnerabilities"

**Agent Execution**:
1. `scan_repository`  †  Finds 5 SQL injection vulnerabilities
2. For each vulnerability:
   - `read_file`  †  Gets vulnerable code
   - `generate_fix`  †  Creates secure parameterized query
   - `apply_fix`  †  Replaces vulnerable code
3. `scan_repository`  †  Verifies fixes
4. Reports: "Fixed 5 SQL injection vulnerabilities"

## Do You Need a Mainstream Agent Framework?

### Current Approach: Custom Agentic System

**Pros**:
-     Lightweight - no external dependencies
-     Tailored for security operations
-     Direct integration with existing code
-     Full control over behavior
-     Works with LM Studio, Ollama, OpenAI

**Cons**:
-        Need to maintain tool implementations
-        Limited to security domain (but that's the point!)

### Alternative: LangChain / AutoGPT

**Pros**:
-     Battle-tested framework
-     Many pre-built tools
-     Active community
-     Advanced features (memory, planning, etc.)

**Cons**:
-     Heavy dependency
-     May be overkill for VS Code extension
-     Less control over behavior
-     Additional complexity

## Recommendation

**Use the Custom AgenticCore** because:

1. **Domain-Specific**: Built specifically for security scanning and fixing
2. **Lightweight**: No heavy dependencies
3. **Integrated**: Works directly with your existing functions
4. **Sufficient**: Has all tools needed for core operations
5. **Extensible**: Easy to add new tools

### When to Consider LangChain

Consider LangChain if you need:
- Advanced memory/retrieval systems
- Integration with many external APIs
- Complex multi-agent coordination
- General-purpose agent capabilities

For CipherMate's core mission (scanning and fixing), the custom agentic system is perfect.

## Current Status

    **AgenticCore** is implemented with:
- Tool calling infrastructure
- 8 core security tools
- Autonomous execution loop
- State management

   „ **Next Steps**:
1. Connect tools to actual scanning functions (in progress)
2. Test end-to-end workflows
3. Add more specialized tools as needed
4. Optimize for common use cases

## Usage

The chat interface automatically uses AgenticCore for complex requests. Users can:

- "scan my repository"  †  Agent uses scan_repository tool
- "fix all vulnerabilities"  †  Agent plans and executes fix workflow
- "explain this SQL injection"  †  Agent uses explain_vulnerability tool
- "analyze this file"  †  Agent uses scan_file and analyze_code tools

The agent handles everything autonomously - no need for multiple commands or button clicks.


