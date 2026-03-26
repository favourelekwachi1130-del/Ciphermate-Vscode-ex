# Tool Learning & Training Data Improvements

Ensures the model (Scripter or any provider) learns **when and how** to call each CipherMate tool. Step-by-step improvements for accurate tool invocation.

---

## 1. What We Added

### 1.1 Tool Registry (`src/ai-agent/tool-registry.ts`)

Each tool has training-oriented metadata:

| Field | Purpose |
|-------|---------|
| `whenToUse` | Conditions the model should learn |
| `userExamples` | Sample messages that trigger this tool |
| `prerequisites` | What must exist before calling |
| `typicalNextTools` | Tool chain (e.g. scan → fix) |
| `typicalPrevTools` | What usually runs before |
| `intent` | Maps to intent-recognizer |

**Use:** Training data generators, system prompt enrichment, intent→tool routing.

### 1.2 Tool-Calling Training Schema (`training_data/TOOL_CALLING_SCHEMA.md`)

- OpenAI chat format with `tool_calls`
- Intent → tool mapping table
- Quality rules for arguments

### 1.3 Tool-Calling Samples (`training_data/tool_calling_samples.jsonl`)

- 11 samples: scan_repository, scan_dast, scan_pentest, generate_fix, analyze_code, scan_file, explain_vulnerability
- User message → assistant with tool_calls (no content)
- Merge with `scripter_mini.jsonl` or `expert_training_data` for fine-tuning

---

## 2. Step-by-Step Improvements

### Step 1: Merge Tool-Calling Data into Fine-Tune Pipeline ✅

```bash
# In finetune_scripter.py or generate script
cat training_data/tool_calling_samples.jsonl training_data/scripter_mini.jsonl > training_data/combined.jsonl
```

### Step 2: Inject Tool Guidance into System Prompt

When building the system message for the model, prepend tool-selection hints from the registry:

```typescript
// In agentic-core or chat-interface
import { TOOL_REGISTRY } from './tool-registry';

const toolHints = Object.values(TOOL_REGISTRY)
  .slice(0, 5)  // Top 5 most-used
  .map(t => `- ${t.name}: ${t.whenToUse[0]}`)
  .join('\n');

systemPrompt += `\n\nTool selection:\n${toolHints}`;
```

### Step 3: Intent → Tool Routing (Pre-Tool-Call)

When intent is high-confidence, optionally **suggest** the tool to the model via few-shot or system hint:

```typescript
// intent-recognizer already outputs SCAN_REPOSITORY, FIX_VULNERABILITIES, etc.
// Map to tool and inject: "User likely wants scan_repository. Consider calling it first."
```

### Step 4: Add Missing Tools to Registry

| Tool | Status | Notes |
|------|--------|-------|
| `lookup_cve` | **Proposed** | CVE lookup exists as command; add as agent tool for "what is CVE-2024-1234" |
| `audit_slice` | **Proposed** | Slice-based audit (auth, session) from Devansh methodology |
| `build_threat_model` | **Proposed** | CVE history → threat model from DEVANSH_METHODOLOGY_ADDITIONS |

### Step 5: Generate More Tool-Calling Samples

Use the registry's `userExamples` to generate 50–100 samples per tool:

```python
# scripts/generate_tool_calling_training.py
for tool, entry in TOOL_REGISTRY.items():
    for example in entry.userExamples:
        # Generate JSONL line: user=example, assistant=tool_calls
```

---

## 3. Additional Ideas

### 3.1 Tool Result Summarization Training

Train the model to **summarize** tool results for the user:

- Input: `{"role":"tool","content":"<scan result JSON>"}`
- Output: `"Scan complete. Found 3 critical, 5 high. Top issue: SQL injection in auth.js:42."`

### 3.2 Multi-Turn Tool Chain Training

Full conversation: user "fix my vulnerabilities" → scan → generate_fix (x3) → apply_fix → "Fixed 3 critical issues."

### 3.3 Negative Examples

Train on **when NOT** to call a tool:

- "how does SQL injection work?" → no tool, explain in text
- "don't scan" → no tool

### 3.4 Parameter Inference Training

User: "scan localhost:8080" → model infers `targetUrl: "http://localhost:8080"` (add protocol).

### 3.5 Tool Error Recovery

When a tool fails (e.g. "workspace not open"), train the model to respond with guidance instead of repeating the call.

### 3.6 Slice-Specific Tool (Future)

When `audit_slice` exists:

- User: "audit my auth layer" → `audit_slice(slice: "auth")`
- User: "check JWT handling" → `audit_slice(slice: "auth", focus: "jwt")`

---

## 4. Integration Checklist

- [ ] Merge `tool_calling_samples.jsonl` into fine-tune data
- [ ] Add tool hints to system prompt (optional, for non-fine-tuned models)
- [ ] Wire intent → tool suggestion when confidence > 0.8
- [ ] Add `lookup_cve` tool to agentic-core + registry
- [ ] Generate 50+ samples per tool via script
- [ ] Add tool result summarization samples
- [ ] Add negative examples (when not to call)

---

## 5. References

- [tool-registry.ts](../../src/ai-agent/tool-registry.ts)
- [TOOL_CALLING_SCHEMA.md](../../training_data/TOOL_CALLING_SCHEMA.md)
- [tool_calling_samples.jsonl](../../training_data/tool_calling_samples.jsonl)
- [intent-recognizer.ts](../../src/ai-agent/intent-recognizer.ts)
