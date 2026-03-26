"""
Open SWE–style agent core for CipherMate.

Mirrors the architecture of https://github.com/langchain-ai/open-swe:
- System prompt: working env, file management, task execution, tool usage, coding standards.
- AGENTS.md (or equivalent) injected into system prompt.
- Curated tools: read_file, write_file, edit_file, run_cmd, list_dir, grep.
- Tool error handling: errors returned as tool messages so the agent can self-correct.
- Loop: understand → implement → verify (no PR step; CipherMate applies fixes in-workspace).
"""

from .prompt import construct_system_prompt
from .tools import get_tool_definitions, execute_tool
from .agent_loop import run_agent_loop
from .schemas import ToolName

__all__ = [
    "construct_system_prompt",
    "get_tool_definitions",
    "execute_tool",
    "run_agent_loop",
    "ToolName",
]
