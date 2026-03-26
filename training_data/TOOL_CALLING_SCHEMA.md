# Tool-Calling Training Data Schema

Training data that teaches the model **when and how** to call each CipherMate tool.

## Purpose

- Fine-tuned models (Scripter) learn: user intent → tool selection → parameters
- Reduces hallucination of tool names and wrong tool choice
- Enables multi-step workflows (scan → fix → apply)

## Format: OpenAI Chat Completions with Tools

Each training sample is a conversation where the assistant responds with `tool_calls`:

```json
{
  "messages": [
    {"role": "system", "content": "You are Scripter. Use tools to accomplish tasks. ..."},
    {"role": "user", "content": "scan my repository"},
    {
      "role": "assistant",
      "content": null,
      "tool_calls": [
        {
          "id": "call_abc123",
          "type": "function",
          "function": {
            "name": "scan_repository",
            "arguments": "{\"path\": \"/workspace\"}"
          }
        }
      ]
    },
    {
      "role": "tool",
      "tool_call_id": "call_abc123",
      "content": "{\"success\": true, \"vulnerabilities\": [...]}"
    },
    {
      "role": "assistant",
      "content": "Scan complete. Found 3 vulnerabilities (1 critical, 2 high). ..."
    }
  ]
}
```

## Required Fields per Sample

| Field | Required | Description |
|-------|----------|-------------|
| `messages` | Yes | Array of message objects |
| `messages[].role` | Yes | `system` \| `user` \| `assistant` \| `tool` |
| `messages[].content` | Yes* | String or null (null when tool_calls present) |
| `messages[].tool_calls` | No | Array of tool call objects (assistant only) |
| `messages[].tool_call_id` | No | For tool role (links to tool_calls[].id) |
| `messages[].name` | No | For tool role: `scan_repository`, etc. |

*Assistant can have `content: null` when using `tool_calls`.

## Intent → Tool Mapping (for generators)

| User Intent | Primary Tool | Secondary Tools |
|-------------|--------------|-----------------|
| scan repo | scan_repository | list_files, read_file |
| scan file | scan_file, read_file | — |
| scan deps | scan_repository (scanners: dependency) | — |
| scan secrets | scan_repository (scanners: secrets) | — |
| DAST | scan_dast | — |
| pentest | scan_pentest | — |
| fix vulns | generate_fix, apply_fix | scan_repository (if no results) |
| explain | explain_vulnerability | — |
| show results | (no tool; use state) | — |

## Sample Categories

1. **Single-tool** — User message → one tool call
2. **Tool chain** — User message → multiple tools in sequence (scan → fix)
3. **Conditional** — "fix critical" → generate_fix with filter
4. **Clarification** — Ambiguous message → model asks or infers

## Quality Rules

- `arguments` must be valid JSON
- `path` for scan_repository: use `/workspace` or `process.cwd()` placeholder
- `targetUrl` for DAST: use placeholder like `http://localhost:3000`
- Include tool response (role: tool) when training multi-turn

## Robust Fine-Tuning (Anti-Hallucination)

For production fine-tuning, use `merge_tool_calling_jsonl.py` which generates:

1. **Explicit system prompt** — Exact tool names, parameter schemas, intent→tool mapping, and when NOT to call tools. See `FINETUNING_SYSTEM_PROMPT.md`.

2. **Single-turn** — User → tool_call. Teaches intent mapping and correct parameters.

3. **Multi-turn** — User → tool_call → tool_response → assistant summary. Teaches grounded summarization: only report what the tool returned, never invent findings.

4. **Refusal** — Out-of-scope (weather, poetry, etc.) → text response, no tool. Teaches boundary.

5. **Missing-info** — "test my API" without URL → ask for clarification, do not guess.

Output: `training_data/fireworks/ciphermate_tool_calling.jsonl`
