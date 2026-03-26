"""
Open SWE–style agent loop: LLM → tool calls → execute (with error handling) → repeat.

Uses OpenAI-compatible API (OpenRouter, OpenAI, etc.). Tool errors are returned
as tool messages so the agent can self-correct (ToolErrorMiddleware pattern from Open SWE).
"""

from __future__ import annotations

import json
import logging
from typing import Any

from .prompt import construct_system_prompt
from .tools import execute_tool, get_tool_definitions

logger = logging.getLogger(__name__)

DEFAULT_MAX_STEPS = 50


def _tool_error_message(exc: Exception, tool_name: str) -> dict[str, str]:
    """Format tool error like Open SWE ToolErrorMiddleware."""
    return {
        "error": str(exc),
        "error_type": type(exc).__name__,
        "status": "error",
        "name": tool_name,
    }


def run_agent_loop(
    *,
    workspace_root: str,
    task: str,
    agents_md: str = "",
    api_key: str,
    base_url: str | None = None,
    model: str = "openai/gpt-4o",
    max_steps: int = DEFAULT_MAX_STEPS,
) -> str:
    """
    Run the agent until done or max_steps. Returns the final assistant message content.

    - base_url: e.g. "https://openrouter.ai/api/v1" for OpenRouter; None for OpenAI.
    - model: e.g. "openai/gpt-4o" (OpenRouter) or "gpt-4o" (OpenAI).
    """
    try:
        from openai import OpenAI
    except ImportError:
        raise ImportError("Install openai: pip install openai") from None

    client = OpenAI(api_key=api_key, base_url=base_url) if base_url else OpenAI(api_key=api_key)
    system_prompt = construct_system_prompt(workspace_root, agents_md=agents_md)
    tools = get_tool_definitions()
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": task},
    ]

    for step in range(max_steps):
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            tools=tools,
            tool_choice="auto",
        )
        choice = response.choices[0]
        if not choice.message:
            continue
        msg = choice.message
        if msg.content:
            messages.append({"role": "assistant", "content": msg.content or ""})
        tool_calls = getattr(msg, "tool_calls", None) or []
        if not tool_calls:
            # No tool calls: we're done (assistant gave final answer)
            return (msg.content or "").strip()

        # Append assistant message with tool_calls for API
        messages.append({
            "role": "assistant",
            "content": msg.content or "",
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in tool_calls
            ],
        })

        for tc in tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError as e:
                result = json.dumps(_tool_error_message(e, name))
            else:
                try:
                    result = execute_tool(workspace_root, name, args)
                except Exception as e:
                    logger.exception("Tool %s failed", name)
                    result = json.dumps(_tool_error_message(e, name))

            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result if isinstance(result, str) else json.dumps(result),
            })

    # Max steps reached; return last assistant content if any
    for m in reversed(messages):
        if m.get("role") == "assistant" and m.get("content"):
            return (m["content"] or "").strip()
    return "(Max steps reached without final answer.)"
