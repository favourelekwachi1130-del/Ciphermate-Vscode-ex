# CipherMate × blueberryAI / Continue Engine Implementation Roadmap

This document outlines implementable features extracted from [blueberryai-app](https://github.com/RhysSullivan/blueberryai-app) and its upstream [Continue](https://github.com/continuedev/continue), and provides step-by-step plans to integrate the **engine and core workers** into CipherMate—without the full blueberryai interface.

---

## 1. Architecture Overview

### blueberryai-app
- **What it is:** Fork of VS Code + Continue + PearAI; full standalone editor
- **AI engine source:** `extensions/blueberryai-submodule` (private repo: tryblueberry/blueberryai-submodule)
- **Why we can't use it directly:** It's a desktop app, not an extension; the submodule may be private

### Continue (continuedev/continue)
- **What it is:** Open-source VS Code extension; 31k+ stars, Apache 2.0
- **Structure:** Core engine (`core/`) + VS Code extension (`extensions/vscode/`)
- **Portable:** Designed to run inside VS Code; aligns with CipherMate's extension model

---

## 2. Continue Core Engine Structure (Reference)

| Module | Purpose | Portability to CipherMate |
|--------|---------|---------------------------|
| `core/autocomplete` | Inline code completion with context | **High** – improve CipherMate's inline suggestions |
| `core/context` | Multi-source context retrieval (@file, @codebase, LSP) | **High** – extend RAG/context |
| `core/indexing` | Codebase indexing for semantic search | **High** – enhance existing RAG |
| `core/llm` | LLM abstraction, streaming, multi-provider | **Medium** – CipherMate has MultiProviderAIService |
| `core/edit` | Code edit generation & application | **High** – align with FixService |
| `core/nextEdit` | "Next edit" prediction (experimental) | **Low** – optional, experimental |
| `core/diff` | Diff generation for edits | **Medium** – CipherMate has DiffGenerator |
| `core/promptFiles` | Prompt templates (autocomplete, chat) | **High** – reusable prompt patterns |
| `core/continueServer` | Optional separate server process | **Low** – skip for extension-only |

---

## 3. Implementable Features (Prioritized)

### Phase 1: Context & Autocomplete Engine (Weeks 1–2)

#### 1.1 Context Retrieval Layer
**Source:** Continue `core/context` + [Context Selection docs](https://docs.continue.dev/ide-extensions/autocomplete/context-selection)

**Current CipherMate:** `getCodeContext()` returns 5–11 lines around a line; RAG indexes repo.

**Add:**
1. **File prefix/suffix context** – Always include N lines before/after cursor (Continue default ~50 lines before, 20 after for autocomplete)
2. **LSP-based context** – Use `vscode.executeDefinitionProvider`, `executeReferenceProvider` to pull definitions/refs for symbols near cursor
3. **Imported file context** – Resolve imports and include referenced symbols (not whole files)
4. **Recent files context** – Include snippets from recently edited/opened files

**Steps:**
1. Create `src/engine/context-provider.ts`
2. Implement `ContextProvider.getContextForPosition(document, position): Promise<ContextItem[]>`
3. Add LSP integration via VS Code `languageFeatures` APIs
4. Wire into `CipherMateInlineSuggestionProvider` and fix-generation prompts

---

#### 1.2 Autocomplete Post-Processing
**Source:** [Continue autocomplete filtering](https://docs.continue.dev/ide-extensions/autocomplete/how-it-works)

**Current CipherMate:** Rule-based security suggestions only; no LLM-powered completion.

**Add:**
1. **Debouncing** – Wait ~300ms after last keystroke before requesting completion (CipherMate may already debounce; verify)
2. **Caching** – Cache completion by `(filePath, position, prefixHash)`; reuse on backspace
3. **Post-processing** – Discard responses with excessive repetition, fix indentation, stop at logical boundaries

**Steps:**
1. Add `CompletionCache` in `CipherMateInlineSuggestionProvider`
2. Add debounce (e.g. 300ms) before calling AI
3. Add `postProcessCompletion(text: string): string` – strip repetition, normalize indentation

---

#### 1.3 Root Path Context (AST-Based)
**Source:** [Continue root path context](https://blog.continue.dev/root-path-context-the-secret-ingredient-in-continues-autocomplete-prompt)

**Idea:** Use AST to find "path" from cursor to root (e.g. cursor inside `function foo` inside `class Bar`). Include parent/sibling definitions in context.

**Steps:**
1. Add optional Tree-sitter or simple regex-based "block detection" for common languages
2. Extract enclosing function/class/module
3. Include sibling functions/classes in context
4. Integrate into `ContextProvider`

---

### Phase 2: Inline Code Generation (Weeks 2–3)

#### 2.1 LLM-Powered Inline Completion (Security-Aware)
**Current CipherMate:** Inline suggestions are rule-based (SQL, XSS, secrets, weak crypto).

**Add:** Optional LLM-based completions that:
- Use Phase 1 context (file prefix/suffix, LSP, recent files)
- Are security-aware (prompt: "suggest secure code; avoid SQL injection, XSS, hardcoded secrets")
- Compete with or complement rule-based suggestions

**Steps:**
1. Add `ai.autocompleteEnabled` setting (default: true when AI configured)
2. In `provideInlineCompletionItems`, when AI enabled: gather context → build prompt → call `MultiProviderAIService` → return completion
3. Fall back to rule-based when AI fails or is disabled
4. Add prompt template in `promptFiles`-style module

---

#### 2.2 Completion Prompt Template
**Source:** Continue `core/promptFiles`

**Add:** Structured prompt for autocomplete:
```
<file_prefix>
{code before cursor}
</file_prefix>
<cursor_line>
{current line up to cursor}
</cursor_line>
<file_suffix>
{code after cursor}
</file_suffix>
<context>
{optional: LSP definitions, recent files}
</context>

Complete the line at <cursor_line>. Output only the completion, no explanation.
```

**Steps:**
1. Create `src/engine/prompts/autocomplete.ts`
2. Export `buildAutocompletePrompt(params)`
3. Use in Phase 2.1

---

### Phase 3: Chat UX & Context Providers (Weeks 3–4)

#### 3.1 @-Mention Context Providers
**Source:** Continue `@codebase`, `@file`, `@code` etc.

**Current CipherMate:** Chat has conversation context; scan results injected for security queries.

**Add:**
1. **@file** – User types `@filename` → include file contents in next message
2. **@codebase** – Semantic search over indexed code (CipherMate RAG already does this; expose via `@codebase` in chat)
3. **@scan** – Inject latest scan results (already partially done; formalize)

**Steps:**
1. Parse user message for `@file`, `@codebase`, `@scan` patterns
2. Resolve references (file picker for `@file`, RAG search for `@codebase`)
3. Prepend resolved context to prompt
4. Update chat UI to show "Added: file X, 3 codebase results"

---

#### 3.2 Streaming Chat Responses
**Current CipherMate:** Likely waits for full response.

**Add:** Stream tokens from AI and render incrementally in chat (better perceived latency).

**Steps:**
1. Use `MultiProviderAIService` streaming if supported
2. Update `ChatInterface` to append chunks as they arrive
3. Add "Stop" button during generation

---

### Phase 4: Edit Engine Alignment (Week 4–5)

#### 4.1 Edit Generation Pipeline
**Source:** Continue `core/edit`

**Current CipherMate:** `FixService` + `RuleBasedFixer` + AI for fixes.

**Align with Continue patterns:**
1. **Edit instructions** – Model returns structured edit (e.g. `{ oldText, newText }` or diff) instead of freeform
2. **Range validation** – Ensure edit applies to correct range; retry with more context if it fails
3. **Multi-file edits** – Support edits that touch multiple files (e.g. extract to new file + update imports)

**Steps:**
1. Extend `FixService.generateFix` to optionally request structured edit format
2. Add `ApplyEditApplicator` for multi-file `WorkspaceEdit`
3. When creating .env, use this pipeline

---

#### 4.2 Codebase Indexing Improvements
**Source:** Continue `core/indexing`

**Current CipherMate:** RAG indexes repo; `indexCodebase` in extension.

**Add:**
1. **Incremental indexing** – On file save, re-index only changed file
2. **Embedding model** – Use same embeddings as Continue (e.g. `nomic-embed-text`) for compatibility if needed
3. **Chunking strategy** – Overlap chunks, include surrounding context

**Steps:**
1. Add file watcher for `onDidSave` → `reindexFile(path)`
2. Review chunking in `indexCodebase`; add overlap
3. Store embeddings in workspace-scoped storage

---

## 4. Implementation Steps Summary

| Phase | Feature | Effort | Steps |
|-------|---------|--------|-------|
| 1.1 | Context Retrieval Layer | Medium | Create ContextProvider, LSP integration, wire to inline + fix |
| 1.2 | Autocomplete Post-Processing | Low | Cache, debounce, repetition filter |
| 1.3 | Root Path Context (AST) | Medium | Block detection, parent/sibling extraction |
| 2.1 | LLM Inline Completion | Medium | AI autocomplete path, security-aware prompt |
| 2.2 | Completion Prompt Template | Low | Create autocomplete prompt builder |
| 3.1 | @-Mention Context Providers | Medium | Parse @file, @codebase, @scan; resolve and inject |
| 3.2 | Streaming Chat | Low–Medium | Stream API + incremental render |
| 4.1 | Edit Generation Pipeline | Medium | Structured edits, multi-file WorkspaceEdit |
| 4.2 | Incremental Indexing | Low | onDidSave → reindexFile |

---

## 5. Files to Create/Modify

### New Files (Engine)
```
src/engine/
├── context-provider.ts      # Multi-source context (Phase 1.1)
├── completion-cache.ts      # Cache + debounce (Phase 1.2)
├── root-path-context.ts     # AST-based context (Phase 1.3)
├── prompts/
│   ├── autocomplete.ts      # Autocomplete prompt (Phase 2.2)
│   └── edit.ts             # Structured edit prompt (Phase 4.1)
└── index.ts                # Public API
```

### Files to Modify
- `src/extension.ts` – Wire `ContextProvider`, enhance `CipherMateInlineSuggestionProvider`
- `src/ai-agent/chat-interface.ts` – @-mentions, streaming
- `src/ai-agent/multi-provider-service.ts` – Streaming support if missing
- `src/fix-system/fix-service.ts` – Structured edit, multi-file
- RAG/indexing logic – Incremental reindex

---

## 6. Dependencies to Consider

From Continue's stack:
- **No direct npm dependency on Continue core** – we reimplement patterns, not import
- **LSP** – Use `vscode.languages.*` APIs (built-in)
- **Tree-sitter** (optional for Phase 1.3) – `tree-sitter` npm package if we want full AST

---

## 7. Quick Wins (Start Here)

1. **Completion caching** (Phase 1.2) – ~1 day; immediate UX improvement
2. **@file in chat** (Phase 3.1) – ~2 days; very visible feature
3. **Expand getCodeContext** – Already done for PHP; generalize to configurable line counts per language

---

## 8. References

- [Continue Autocomplete: How It Works](https://docs.continue.dev/ide-extensions/autocomplete/how-it-works)
- [Continue Context Selection](https://docs.continue.dev/ide-extensions/autocomplete/context-selection)
- [Continue Root Path Context](https://blog.continue.dev/root-path-context-the-secret-ingredient-in-continues-autocomplete-prompt)
- [Continue GitHub](https://github.com/continuedev/continue)
- [blueberryai-app GitHub](https://github.com/RhysSullivan/blueberryai-app)
