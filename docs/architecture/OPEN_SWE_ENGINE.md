# Open SWE–Style Engine in CipherMate

CipherMate’s **code generation and fixing** behavior is aligned with [LangChain Open SWE](https://github.com/langchain-ai/open-swe): same agent loop, prompt shape, and tool semantics, but running in your **local workspace** instead of a cloud sandbox.

## What Was Ported from Open SWE

- **System prompt** — Working environment, file management, task execution (understand → implement → verify), tool usage, coding standards, core behavior. See `open_swe_engine/open_swe_engine/prompt.py`.
- **AGENTS.md** — Injected into the system prompt when present at workspace root (or passed in).
- **Tools** — `read_file`, `write_file`, `edit_file`, `run_cmd`, `list_dir`, `grep`. All paths are workspace-relative; execution is local.
- **Tool error handling** — Errors are returned as structured tool messages (like Open SWE’s `ToolErrorMiddleware`) so the model can self-correct.
- **Loop** — Each turn: LLM → optional tool calls → execute tools → append results → repeat until the model responds without tools or max steps.

## Layout

| Component        | Location |
|-----------------|----------|
| Python package  | `open_swe_engine/` |
| Prompt          | `open_swe_engine/open_swe_engine/prompt.py` |
| Tools           | `open_swe_engine/open_swe_engine/tools.py` |
| Agent loop      | `open_swe_engine/open_swe_engine/agent_loop.py` |
| CLI             | `python -m open_swe_engine.run` |
| Extension wiring| `src/engine/open-swe-runner.ts` |

## Enabling in CipherMate

1. Install the engine (from repo root):
   ```bash
   cd open_swe_engine && pip install -e .
   ```
2. Set **OpenRouter** (or OpenAI) API key in CipherMate settings or `OPENROUTER_API_KEY` / `OPENAI_API_KEY`.
3. In Settings → CipherMate, set **Use Open SWE engine** (`ciphermate.codeAgent.useOpenSWEEngine`) to `true`.

When enabled, code-fix and code-generation-style requests (e.g. “fix …”, “implement …”, “add tests for …”) are handled by this engine when a workspace is open. If the engine is unavailable (Python/module not found, missing key), the extension falls back to the default agentic flow.

## Running the Engine Standalone

```bash
cd open_swe_engine
export OPENROUTER_API_KEY=your_key
python -m open_swe_engine.run --workspace /path/to/repo --task "fix the login bug in src/auth.js"
```

Optional: `--agents-md`, `--base-url`, `--model`, `--max-steps`. See `open_swe_engine/README.md`.

## References

- [Open SWE (LangChain)](https://github.com/langchain-ai/open-swe) — architecture and patterns.
- [Open SWE announcement](https://blog.langchain.com/open-swe-an-open-source-framework-for-internal-coding-agents/) — design rationale.
