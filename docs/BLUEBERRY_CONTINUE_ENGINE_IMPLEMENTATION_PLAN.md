# BlueberryAI / Continue Engine → CipherMate Implementation Plan

## Executive Summary

[blueberryai-app](https://github.com/RhysSullivan/blueberryai-app) is a fork of VS Code + **Continue** + **PearAI**. The AI engine lives in **Continue** ([continuedev/continue](https://github.com/continuedev/continue))—an open-source VS Code extension. blueberryai-app embeds the Continue engine via submodule (`extensions/blueberryai-submodule` → tryblueberry; may be private).

**Goal:** Extract and reimplement the **core engine and workers** from Continue into CipherMate—not the full UI, but the logic that powers code generation, autocomplete, and context retrieval.

---

## Part 1: Engine Architecture Analysis

### Continue Core (`core/`) – Portable Engine Components

| Module | Purpose | CipherMate Equivalent | Portable? |
|--------|---------|------------------------|-----------|
| **autocomplete/** | LLM-based inline completions, timing (debounce/cache), prompt building | `CipherMateInlineSuggestionProvider` (currently regex/pattern-based) | ✅ Yes |
| **context/** | Context retrieval: file prefix/suffix, LSP definitions, imports, recent files, root-path AST | `getCodeContext`, RAG chunks | ✅ Yes |
| **indexing/** | Codebase embedding & semantic search (@codebase) | `indexRepository`, RAG engine | ✅ Yes |
| **llm/** | LLM client abstraction, streaming, model config | `MultiProviderAIService`, `callAIForExplanation` | ✅ Partial |
| **edit/** | Apply edits (insert, replace) | `FixApplicator`, `WorkspaceEdit` | ✅ Yes |
| **diff/** | Diff generation for preview | `DiffGenerator` | ✅ Yes |
| **promptFiles/** | Prompt templates (autocomplete, chat) | Ad-hoc prompts in `agentic-core`, `chat-interface` | ✅ Yes |
| **nextEdit/** | Proactive "next edit" suggestions | None | ✅ New feature |
| **tools/** | MCP tools, agent tools | None | ⚠️ Optional |
| **continueServer/** | Desktop app server (IPC) | N/A – extension runs in process | ❌ No |

### What We Need: Engine, Not Interface

- **Engine:** Autocomplete logic, context assembly, LLM calls, post-processing, caching.
- **Workers:** Context providers (file, LSP, imports, recent, embeddings).
- **Not needed:** Continue's chat UI, sidebar, or desktop app shell.

---

## Part 2: Implementable Features (Prioritized)

### Feature 1: LLM-Powered Inline Autocomplete (High Impact)

**Current state:** CipherMate's `InlineCompletionItemProvider` uses regex/pattern matching (SQL injection, XSS, etc.)—no LLM.

**Target state:** As-you-type code completions from the LLM, using file + context, with debouncing and caching.

**Steps:**

1. **Create `CodeCompletionEngine`** (`src/engine/code-completion-engine.ts`)
   - Input: document, position, cancellation token
   - Output: `InlineCompletionItem[]`
   - Use `MultiProviderAIService` for LLM calls

2. **Add debouncing & caching**
   - Debounce: 300–500ms after last keystroke
   - Cache: `Map<string, InlineCompletionItem[]>` keyed by `filePath:line:col` (or hash of prefix)
   - Reuse cache when cursor returns to same position (e.g. backspace)

3. **Wire into `CipherMateInlineSuggestionProvider`**
   - If security pattern matches → use existing regex-based suggestions
   - Else → call `CodeCompletionEngine.getCompletion()` for LLM-based suggestion
   - Optional: config toggle `ciphermate.inlineSuggestions.mode: 'security-only' | 'hybrid' | 'full-llm'`

4. **Prompt design**
   - System: "You are a security-aware coding assistant. Suggest the next few lines of code. Prefer secure patterns (parameterized queries, validated input, etc.)."
   - User: `[context]\n\n[cursor_position_marker]\n\nComplete the code. Output only the completion, no explanation.`

**Effort:** 2–3 days  
**Dependencies:** MultiProviderAIService, existing InlineCompletionItemProvider

---

### Feature 2: Context Retrieval Workers (High Impact)

**Current state:** `getCodeContext()` returns ~5–11 lines around cursor. No LSP, imports, or semantic retrieval.

**Target state:** Rich context assembly similar to Continue:
- File prefix (N lines before cursor)
- File suffix (N lines after cursor)
- LSP definitions (functions, types) for symbols near cursor
- Imported file snippets for symbols in scope
- Recent files (optionally)
- Root-path context (AST parent/sibling nodes)

**Steps:**

1. **Create `ContextProvider` interface**
   ```typescript
   interface ContextProvider {
     name: string;
     getContext(doc: TextDocument, position: Position): Promise<ContextSnippet[]>;
   }
   ```

2. **Implement providers**
   - `FilePrefixSuffixProvider` – wrap current `getCodeContext`
   - `LSPDefinitionsProvider` – use `vscode.commands.executeCommand('vscode.executeDefinitionProvider')` (or equivalent) for symbols at cursor
   - `ImportContextProvider` – resolve imports, read top of imported files
   - `RecentFilesProvider` – from `vscode.window.tabGroups` or recent editors
   - `EmbeddingContextProvider` – optional; use existing RAG/embedding index for semantic search

3. **Create `ContextAssembler`**
   - Takes list of providers, document, position
   - Runs providers (with timeout), merges snippets
   - Enforces token budget (e.g. 4K tokens total)
   - Returns single context string for prompt

4. **Wire into CodeCompletionEngine and Chat**
   - Code completion: use `ContextAssembler` instead of raw `getCodeContext`
   - Chat: pass same context for "explain this" / "fix this" flows

**Effort:** 2–4 days  
**Dependencies:** VS Code LSP APIs, optional tree-sitter if we add AST-based provider

---

### Feature 3: Post-Processing & Filtering (Medium Impact)

**Current state:** AI output used as-is.

**Target state:** Continue-style post-processing:
- Fix indentation to match document
- Discard low-quality outputs (excessive repetition)
- Stop at logical boundaries (e.g. next `}` or blank line)
- Remove special tokens (end-of-sequence, etc.)

**Steps:**

1. **Create `CompletionPostProcessor`** (`src/engine/completion-post-processor.ts`)
   - `fixIndentation(completion, document, position): string`
   - `detectRepetition(completion): boolean` – reject if >N repeated lines
   - `truncateAtBoundary(completion): string` – stop at `}`, `;`, blank line, etc.
   - `removeSpecialTokens(completion): string`

2. **Integrate into CodeCompletionEngine**
   - After LLM response, run through `CompletionPostProcessor` before returning

**Effort:** 1 day  
**Dependencies:** None

---

### Feature 4: Semantic Codebase Search (@codebase) (Medium Impact)

**Current state:** CipherMate has RAG indexing (`indexRepository`, chunks). Usage is scattered.

**Target state:** Dedicated codebase context provider that:
- Indexes workspace (background, incremental)
- On completion/chat request, retrieves top-K relevant chunks by embedding similarity
- Injects as `[Relevant files from codebase]` in prompt

**Steps:**

1. **Audit existing RAG**
   - Locate `indexRepository`, chunk structure, embedding calls
   - Ensure indexing runs on workspace open / file save

2. **Create `CodebaseContextProvider`**
   - `getRelevantChunks(query: string, topK: number): Promise<Chunk[]>`
   - Query = current file content + cursor line (or embedding of it)
   - Return chunks with file path, line range, content

3. **Add to ContextAssembler**
   - Include `CodebaseContextProvider` in provider list
   - Limit chunks to stay within token budget

**Effort:** 1–2 days  
**Dependencies:** Existing RAG/embedding pipeline

---

### Feature 5: Prompt Templates & Centralization (Low–Medium Impact)

**Current state:** Prompts are inline in `agentic-core`, `chat-interface`, `fix-service`, etc.

**Target state:** Centralized prompt templates (like Continue's `promptFiles/`):
- Autocomplete prompt
- Chat system prompt
- Fix-generation prompt
- Explain prompt

**Steps:**

1. **Create `src/prompts/` directory**
   - `autocomplete.ts`, `chat.ts`, `fix.ts`, `explain.ts`
   - Each exports `buildPrompt(context: PromptContext): string`

2. **Refactor call sites**
   - Replace inline template literals with `buildPrompt()` calls

3. **Add security-specific instructions**
   - All prompts include: "Prefer secure patterns: parameterized queries, input validation, no hardcoded secrets, etc."

**Effort:** 1 day  
**Dependencies:** None

---

### Feature 6: Next Edit (Proactive Suggestions) (Experimental)

**Current state:** None.

**Target state:** After user makes an edit, proactively suggest the "next likely edit" (e.g. add error handling, add tests). Optional, can be behind a feature flag.

**Steps:**

1. **Listen to editor changes** – `onDidChangeTextDocument`
2. **On idle (e.g. 2s after last edit), run prediction**
3. **Use same ContextAssembler + LLM**
4. **Prompt:** "Given the recent edit, what is the most likely next change the developer will make? Output only the code change, no explanation."
5. **Show as ghost text or quick suggestion**

**Effort:** 2–3 days  
**Dependencies:** CodeCompletionEngine, ContextAssembler

---

## Part 3: Implementation Order

| Phase | Feature | Effort | Blocks |
|-------|---------|--------|--------|
| 1 | Context Retrieval Workers (Feature 2) | 2–4 days | 2, 4, 6 |
| 2 | Prompt Templates (Feature 5) | 1 day | 1, 3 |
| 3 | LLM Inline Autocomplete (Feature 1) | 2–3 days | 4 |
| 4 | Post-Processing (Feature 3) | 1 day | - |
| 5 | Semantic Codebase Search (Feature 4) | 1–2 days | - |
| 6 | Next Edit (Feature 6) | 2–3 days | - |

**Recommended order:** 2 (prompts) → 1 (context) → 3 (LLM autocomplete) → 4 (post-process) → 5 (codebase search) → 6 (next edit).

---

## Part 4: File Structure (Proposed)

```
src/
  engine/
    code-completion-engine.ts    # LLM-based autocomplete
    context-assembler.ts        # Orchestrates context providers
    context-providers/
      file-prefix-suffix.ts
      lsp-definitions.ts
      import-context.ts
      codebase-search.ts
    completion-post-processor.ts
  prompts/
    autocomplete.ts
    chat.ts
    fix.ts
    explain.ts
```

---

## Part 5: BlueberryAI Submodule Note

blueberryai-app uses `extensions/blueberryai-submodule` (tryblueberry/blueberryai-submodule). If that repo is private or diverged, **use Continue directly** as the reference:

- **Continue repo:** https://github.com/continuedev/continue
- **Core package:** `core/` (published as npm package `@continue-dev/core` or similar—check their package.json)
- **Extension:** `extensions/vscode/` – VS Code extension that consumes core

Options:
1. **Use `@continue-dev/core` as npm dependency** – if published, minimal porting.
2. **Copy and adapt** – clone Continue, copy `core/autocomplete`, `core/context`, `core/llm` into CipherMate's `src/engine/`, adapt to our APIs.
3. **Reimplement from docs** – use [Continue autocomplete docs](https://docs.continue.dev/ide-extensions/autocomplete/how-it-works) and reimplement logic.

---

## Part 6: Quick Wins (Can Do Now)

1. **Debouncing** – Add 300ms debounce to existing `InlineCompletionItemProvider` to reduce calls.
2. **Caching** – Cache inline suggestions by `filePath:line`; reuse on backspace.
3. **Expand getCodeContext** – Increase lines (e.g. 20 before, 20 after) for PHP/config files; already partially done. Apply same to all languages when building context for LLM.

---

## Part 7: Continue Module → CipherMate Mapping (Reference)

From Continue's `core/autocomplete/` and `core/context/`, these are the **exact components** to mirror:

| Continue Module | File(s) | CipherMate Implementation |
|-----------------|---------|---------------------------|
| **CompletionProvider** | `CompletionProvider.ts` | `CodeCompletionEngine.provideCompletion()` – debounce, prefilter, context, LLM call, cache, postprocess |
| **AutocompleteDebouncer** | `util/AutocompleteDebouncer.ts` | Add 300–500ms debounce before LLM call |
| **AutocompleteLruCache** | `util/AutocompleteLruCache.ts` | `Map` keyed by `prunedPrefix` (or hash); reuse on cache hit |
| **ContextRetrievalService** | `context/ContextRetrievalService.ts` | Our `ContextAssembler` + providers |
| **getAllSnippetsWithoutRace** | `snippets/index.ts` | Aggregates: file prefix/suffix, LSP definitions, imports, codebase chunks |
| **renderPromptWithTokenLimit** | `templating/index.ts` | Prompt builder with token budget; injects prefix/suffix/context |
| **CompletionStreamer** | `generation/CompletionStreamer.ts` | Stream LLM completion; can use `MultiProviderAIService` non-streaming first |
| **postprocessCompletion** | `postprocessing/index.ts` | Indentation, repetition removal, truncate at boundary |
| **shouldPrefilter** | `prefiltering/index.ts` | Skip completion in comments, strings, etc. |
| **shouldCompleteMultiline** | `classification/shouldCompleteMultiline.ts` | Decide single-line vs multiline completion |
| **BracketMatchingService** | `filtering/BracketMatchingService.ts` | Optional: ensure brackets are balanced in completion |
| **BaseContextProvider** | `context/index.ts` | Our `ContextProvider` interface |
| **CurrentFileContextProvider** | `providers/CurrentFileContextProvider.ts` | Our `FilePrefixSuffixProvider` |
| **CodebaseContextProvider** | `providers/CodebaseContextProvider.ts` | Our `CodebaseContextProvider` (RAG) |
| **CodeContextProvider** | `providers/CodeContextProvider.ts` | @Code: specific code selection – optional |
| **FileContextProvider** | `providers/FileContextProvider.ts` | @File: arbitrary file content – optional |

Continue also uses:
- `HelperVars` – wraps document prefix/suffix, filepath, options
- `GetLspDefinitionsFunction` – injected LSP definition lookup
- `isSecurityConcern` – skips sensitive paths (we can invert: prioritize security context)

---

## References

- [Continue Autocomplete: How It Works](https://docs.continue.dev/ide-extensions/autocomplete/how-it-works)
- [Continue Context Selection](https://docs.continue.dev/ide-extensions/autocomplete/context-selection)
- [Continue Context Providers](https://docs.continue.dev/customize/custom-providers)
- [Continue GitHub](https://github.com/continuedev/continue)
- [BlueberryAI GitHub](https://github.com/RhysSullivan/blueberryai-app)
