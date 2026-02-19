# CipherMate Core Architecture

## Principle: CipherMate Owns All Logic, Mastra Only Orchestrates

**If Mastra disappears tomorrow, CipherMate must still work.**

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    Mastra (Orchestration)                   │
│  - Agent coordination                                        │
│  - Workflow orchestration                                   │
│  - Model routing                                            │
│  - Memory management                                         │
│  - Tool calling (calls CipherMate Core)                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Calls
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              CipherMate Core Services Layer                 │
│  (ALL deterministic logic lives here)                      │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ File Operations Service                             │  │
│  │ - Read/write files                                  │  │
│  │ - File system operations                            │  │
│  │ - Path validation                                   │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Code Diffing & Patching Service                     │  │
│  │ - Unified diff generation                           │  │
│  │ - Code patching                                     │  │
│  │ - Context-aware diffs                               │  │
│  │ - Line-by-line comparison                           │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Hashing Service                                     │  │
│  │ - SHA-256                                           │  │
│  │ - bcrypt                                            │  │
│  │ - argon2                                            │  │
│  │ - PBKDF2                                            │  │
│  │ - Hash verification                                 │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Secret Detection Service                            │  │
│  │ - Regex pattern matching                            │  │
│  │ - Entropy analysis                                  │  │
│  │ - Context-aware detection                           │  │
│  │ - False positive reduction                         │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Policy Enforcement Service                          │  │
│  │ - Security policy validation                        │  │
│  │ - Rule evaluation                                   │  │
│  │ - Compliance checking                               │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Security Decision Service                           │  │
│  │ - Vulnerability prioritization                      │  │
│  │ - Risk assessment                                  │  │
│  │ - Severity calculation                             │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Code Generation Service                             │  │
│  │ - Secure code templates                            │  │
│  │ - Pattern-based generation                         │  │
│  │ - Code transformation                              │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Code Adjustment Service                             │  │
│  │ - Enterprise-grade security fixes                   │  │
│  │ - Code refactoring                                 │  │
│  │ - Security hardening                               │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Integrity Validation Service                        │  │
│  │ - File integrity checks                            │  │
│  │ - Checksum verification                            │  │
│  │ - Code signature validation                        │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Scanning Services (Existing)                        │  │
│  │ - RepositoryScanner                                 │  │
│  │ - SecretsScanner                                   │  │
│  │ - DependencyScanner                                │  │
│  │ - CodePatternScanner                               │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Fix Services (Existing)                            │  │
│  │ - FixService                                       │  │
│  │ - FixApplicator                                    │  │
│  │ - RuleBasedFixer                                   │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## What CipherMate Owns (Deterministic Logic)

### ✅ File Operations
- Reading/writing files
- File system navigation
- Path resolution and validation
- File metadata operations
- Directory traversal

### ✅ Code Diffing & Patching
- Unified diff generation
- Context-aware diffs
- Code patching algorithms
- Line-by-line comparison
- Hunk calculation

### ✅ Hashing
- SHA-256, SHA-512
- bcrypt (password hashing)
- argon2 (modern password hashing)
- PBKDF2
- Hash verification
- Salt generation

### ✅ Secret Detection
- Regex pattern matching
- Entropy analysis
- Context-aware detection
- False positive reduction
- Pattern library management

### ✅ Policy Enforcement
- Security policy validation
- Rule evaluation engine
- Compliance checking
- Policy violation detection

### ✅ Security Decisions
- Vulnerability prioritization
- Risk assessment algorithms
- Severity calculation
- Threat modeling
- Impact analysis

### ✅ Code Generation
- Secure code templates
- Pattern-based generation
- Code transformation
- Template substitution

### ✅ Code Adjustment (Enterprise-Grade Security)
- Security fix generation
- Code refactoring
- Security hardening
- Best practice enforcement

### ✅ Integrity Validation
- File integrity checks
- Checksum verification
- Code signature validation
- Tamper detection

---

## What Mastra Does (Orchestration Only)

### ✅ Agent Coordination
- Routes user requests to appropriate CipherMate services
- Manages conversation flow
- Handles multi-step operations

### ✅ Workflow Orchestration
- Sequences CipherMate service calls
- Manages workflow state
- Handles errors and retries

### ✅ Model Routing
- Selects appropriate AI model
- Handles provider switching
- Manages API calls

### ✅ Memory Management
- Stores conversation history
- Manages context
- Semantic recall

### ✅ Tool Calling
- Exposes CipherMate services as tools
- Validates tool inputs
- Formats tool outputs

---

## Integration Pattern

### Mastra Tool → CipherMate Service

```typescript
// Mastra tool (orchestration only)
export const scanRepositoryTool = createTool({
  id: 'scan-repository',
  description: 'Scan repository for vulnerabilities',
  inputSchema: z.object({
    path: z.string(),
  }),
  execute: async ({ inputData }) => {
    // Mastra ONLY calls CipherMate service
    const scanner = new RepositoryScanner(inputData.path);
    const result = await scanner.scan(); // CipherMate owns this logic
    return result;
  },
});
```

### CipherMate Service (owns logic)

```typescript
// CipherMate Core Service (deterministic logic)
export class RepositoryScanner {
  async scan(): Promise<ScanResult> {
    // All scanning logic here
    // No Mastra dependencies
    // Works independently
  }
}
```

---

## Independence Guarantee

**Test**: Remove Mastra entirely. CipherMate should still:
- ✅ Modify code
- ✅ Create files
- ✅ Hash secrets
- ✅ Detect exposed credentials
- ✅ Validate integrity
- ✅ Enforce policies
- ✅ Make security decisions
- ✅ Generate code
- ✅ Adjust code for security

---

## Additional Deterministic Logic to Add

### 1. **AST Analysis Service**
- Parse code into AST
- Analyze code structure
- Detect patterns in AST
- Transform AST nodes

### 2. **Dependency Graph Service**
- Build dependency graphs
- Detect circular dependencies
- Analyze dependency chains
- Vulnerability propagation

### 3. **Code Metrics Service**
- Cyclomatic complexity
- Code coverage analysis
- Security metrics
- Quality scores

### 4. **Pattern Matching Service**
- Advanced regex engine
- AST pattern matching
- Semantic pattern detection
- Multi-file pattern analysis

### 5. **Validation Service**
- Input validation
- Output validation
- Schema validation
- Type checking

### 6. **Encryption Service**
- AES encryption/decryption
- Key management
- Secure key storage
- Encryption at rest

### 7. **Audit Trail Service**
- Operation logging
- Change tracking
- Audit event generation
- Compliance reporting

### 8. **Configuration Service**
- Config parsing
- Config validation
- Config merging
- Environment variable handling

### 9. **Template Service**
- Code template engine
- Template rendering
- Variable substitution
- Template validation

### 10. **Rule Engine Service**
- Rule evaluation
- Rule chaining
- Conflict resolution
- Rule optimization

---

## Migration Checklist

- [x] Create `src/core/` directory structure
- [x] Move all deterministic logic to core services
- [x] Remove Mastra dependencies from core services
- [x] Create service interfaces (`src/core/service-interfaces.ts`)
- [x] Update Mastra tools to call core services
- [x] Add tests that run without Mastra
- [x] Document all core services (`docs/architecture/CORE_SERVICES_SUMMARY.md`)
- [x] Create service registry (`src/core/service-registry.ts`)
- [ ] Add dependency injection for services (optional - singleton pattern currently used)
- [x] Verify independence (remove Mastra, test core) - Services work independently

---

## Example: Refactored Architecture

### Before (Bad - Logic in Mastra)
```typescript
// Mastra tool doing logic
export const scanTool = createTool({
  execute: async ({ inputData }) => {
    // Logic mixed with orchestration
    const files = fs.readdirSync(inputData.path);
    const secrets = files.map(f => {
      const content = fs.readFileSync(f);
      return content.match(/api[_-]?key\s*[:=]\s*['"]([^'"]+)['"]/i);
    });
    return secrets;
  },
});
```

### After (Good - Logic in CipherMate)
```typescript
// Mastra tool (orchestration only)
export const scanTool = createTool({
  execute: async ({ inputData }) => {
    // Call CipherMate service
    const scanner = new SecretsScanner(inputData.path);
    return await scanner.scan(); // All logic in CipherMate
  },
});

// CipherMate Core Service (owns logic)
export class SecretsScanner {
  async scan(): Promise<ScanResult> {
    // All detection logic here
    // No Mastra dependencies
  }
}
```

---

## Summary

**CipherMate Core** = All deterministic, testable, independent logic
**Mastra** = Orchestration, AI model routing, workflow management

**Rule**: If it's deterministic, it belongs in CipherMate Core. If it's orchestration, it can be in Mastra.
