"""
CLI entry point for the Open SWE–style agent (CipherMate).

Usage:
  python -m open_swe_engine.run --workspace /path/to/repo --task "fix the login bug in src/auth.js"
  OPENROUTER_API_KEY=... python -m open_swe_engine.run --workspace . --task "add unit tests for UserService"

Environment:
  OPENROUTER_API_KEY or OPENAI_API_KEY — used for LLM (OpenRouter if base_url set).
"""

from __future__ import annotations

import argparse
import os
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Open SWE–style code agent in workspace")
    parser.add_argument("--workspace", required=True, help="Workspace root path")
    parser.add_argument("--task", required=True, help="Task description (e.g. fix bug in X, add tests for Y)")
    parser.add_argument("--agents-md", default="", help="AGENTS.md content (or path to file to read)")
    parser.add_argument("--api-key", default="", help="API key (default: OPENROUTER_API_KEY or OPENAI_API_KEY)")
    parser.add_argument("--base-url", default="https://openrouter.ai/api/v1", help="API base URL (OpenRouter by default)")
    parser.add_argument("--model", default="openai/gpt-4o", help="Model name (OpenRouter slug or OpenAI model)")
    parser.add_argument("--max-steps", type=int, default=50, help="Max agent steps")
    args = parser.parse_args()

    workspace = os.path.abspath(args.workspace)
    if not os.path.isdir(workspace):
        print(f"Error: workspace is not a directory: {workspace}", file=sys.stderr)
        return 1

    agents_md = args.agents_md
    if agents_md and os.path.isfile(agents_md):
        with open(agents_md, encoding="utf-8") as f:
            agents_md = f.read()
    elif not agents_md and os.path.isfile(os.path.join(workspace, "AGENTS.md")):
        with open(os.path.join(workspace, "AGENTS.md"), encoding="utf-8") as f:
            agents_md = f.read()

    api_key = args.api_key or os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Error: set OPENROUTER_API_KEY or OPENAI_API_KEY or pass --api-key", file=sys.stderr)
        return 1

    from .agent_loop import run_agent_loop

    try:
        result = run_agent_loop(
            workspace_root=workspace,
            task=args.task,
            agents_md=agents_md,
            api_key=api_key,
            base_url=args.base_url or None,
            model=args.model,
            max_steps=args.max_steps,
        )
        print(result)
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
