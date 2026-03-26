# GraphRAG + Mastra Integration

Use [Microsoft GraphRAG](https://github.com/microsoft/graphrag) with CipherMate’s existing Mastra stack so the security agent can reason over a **knowledge graph** of the codebase and findings (in addition to conversation memory and tools).

---

## Roles

| Component | Role |
|-----------|------|
| **Mastra** | Agent orchestration, conversation memory (LibSQL), semantic recall over chat, tools. |
| **GraphRAG** | Build and query a **knowledge graph** over repo + scan results; return summaries and entity context for the LLM. |
| **Integration** | GraphRAG runs as a separate process/API; Mastra gets a **tool** that calls GraphRAG and injects graph-backed context into the agent. |

GraphRAG does not replace Mastra. Mastra remains the single agent layer; GraphRAG is a **retrieval/knowledge** backend that Mastra calls via a tool.

---

## Architecture

```
User message
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  Mastra Security Agent                                  │
│  - instructions + model (OpenRouter / OpenAI / Ollama)  │
│  - Memory (LibSQL, semantic recall over messages)       │
│  - Tools: scan_repository, detect_secrets, …            │
│           + graphrag_query  ← NEW                       │
└─────────────────────────────────────────────────────────┘
    │
    │  When agent needs repo-wide / “where else” / summary
    ▼
┌─────────────────────────────────────────────────────────┐
│  graphrag_query tool                                    │
│  - Input: natural language question (+ optional scope)  │
│  - Calls: GraphRAG query API or CLI (Python)             │
│  - Output: summarized context + key entities            │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  GraphRAG (Python)                                      │
│  - Index: run once per workspace (or after scan)        │
│  - Query: returns global/local answer + citations       │
│  - Runs as: subprocess, or local HTTP service            │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Options

### Option 1: GraphRAG as CLI (simplest)

- **Index**: CipherMate runs `graphrag index` (or a small wrapper script) when the user runs “Index workspace for GraphRAG” or after the first scan. Output: graph DB under `.graphrag/` or workspace storage.
- **Query**: Mastra tool shells out to `graphrag query "question"` (or `python -m graphrag query …`) and returns stdout (summary + context).
- **Pros**: No extra server; uses official GraphRAG CLI.  
- **Cons**: Subprocess per query; need Python + GraphRAG in PATH or in a venv the extension can invoke.

### Option 2: GraphRAG as local service

- **Index**: Same as above, or a separate small FastAPI/Flask app that runs `graphrag index` and serves query endpoints.
- **Query**: Mastra tool calls `http://localhost:PORT/query` with `{"question": "..."}`.
- **Pros**: Reuse index across many queries; can cache.  
- **Cons**: User (or CipherMate) must start and stop the service.

### Option 3: GraphRAG bundled in extension (zero user setup) — **default**

- No Python or external install. The extension builds a knowledge graph from workspace code using the **configured AI provider** (OpenRouter, Scripter, Ollama, etc.), stores it in `.graphrag/graph.json`, and the Mastra tool queries it in-process.

**Implemented (Option 3):** Bundled engine in `src/engine/graphrag-bundled.ts`. Index command uses it when `ciphermate.graphrag.useBundled` is true (default). Set to false for **Option 1** (CLI). Add a Mastra tool `graphrag-query` that runs the GraphRAG CLI and parses the result; optionally a command “CipherMate: Index workspace for GraphRAG” that runs the index step.

The **graphrag-query** tool loads `.graphrag/graph.json` when useBundled is true; otherwise it calls the CLI or apiUrl.

---

## Mastra tool: `graphrag-query`

- **When the agent should use it:** For questions like “What are the main security risks in this repo?”, “Where else do we use this pattern?”, “Summarize critical findings,” “Which modules touch authentication?”
- **Input:** `question` (string), optional `scope` (e.g. `global` vs `local`).
- **Output:** `{ summary, entities, citations }` or a single markdown string to inject into the prompt.
- **Implementation:** Call GraphRAG CLI or local API; on failure (no index, GraphRAG not installed), return a clear message so the agent can fall back to scan tools and conversation.

---

## Indexing strategy

- **What to index:**  
  - Code: key files (e.g. entrypoints, auth, APIs) and/or scan output (findings, file paths, CWE/CVE).  
  - Keep the corpus small at first (e.g. findings + file list + short snippets) to control cost and time.
- **When to index:**  
  - On demand: “Index for GraphRAG.”  
  - Optional: after first full scan (e.g. “Index findings + affected files”).
- **Where:**  
  - Workspace-level directory (e.g. `.graphrag/` or in CipherMate global storage per workspace) so the graph is per-repo.

---

## Config and feature flag

- `ciphermate.graphrag.enabled` (default `false`): enable the **graphrag-query** Mastra tool.  
- `ciphermate.graphrag.useBundled` (default `true`): Option 3 — in-extension graph (no Python). Set false for CLI/API.  
- `ciphermate.graphrag.indexOnScan` (default `false`): whether to run index after scan.  
- `ciphermate.graphrag.cliPath` (optional): path to `graphrag` CLI or Python module.  
- When disabled, the Mastra tool is not registered or returns “GraphRAG is disabled” so the agent uses existing tools only.

---

## Summary

- **Yes, you can implement GraphRAG with Mastra.**  
- Mastra stays the single agent; GraphRAG is a **retrieval backend** exposed as a **Mastra tool** (`graphrag-query`).  
- The agent uses existing provisions (skills, memory, OpenRouter) and **additionally** gets graph-backed context when it calls the new tool.  
- Indexing runs separately (CLI or script); the extension only runs “index” and “query” against that index.

Next step: add the `graphrag-query` Mastra tool (with a stub that checks config and calls CLI or API when enabled) and document the exact CLI/API contract in this repo.
