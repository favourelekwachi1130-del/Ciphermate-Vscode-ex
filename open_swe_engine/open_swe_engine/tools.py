"""
Open SWE–style tools: read_file, write_file, edit_file, run_cmd, list_dir, grep.

All paths are relative to workspace_root. Tool errors are caught by the caller
and returned as tool messages so the agent can self-correct (ToolErrorMiddleware pattern).
"""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path

from .schemas import ToolName


def _resolve(workspace_root: str, path: str) -> Path:
    """Resolve path to absolute; must be under workspace (security)."""
    p = Path(workspace_root) / path.lstrip("/").lstrip("\\")
    p = p.resolve()
    root = Path(workspace_root).resolve()
    try:
        p.relative_to(root)
    except ValueError:
        raise PermissionError(f"Path must be inside workspace: {path}")
    return p


def read_file(workspace_root: str, path: str, max_size: int = 2 * 1024 * 1024) -> str:
    """Read file contents. Path relative to workspace."""
    fp = _resolve(workspace_root, path)
    if not fp.is_file():
        raise FileNotFoundError(f"Not a file or not found: {path}")
    size = fp.stat().st_size
    if size > max_size:
        raise ValueError(f"File too large ({size} bytes). Max: {max_size}")
    return fp.read_text(encoding="utf-8", errors="replace")


def write_file(workspace_root: str, path: str, content: str) -> None:
    """Create or overwrite file. Path relative to workspace."""
    fp = _resolve(workspace_root, path)
    fp.parent.mkdir(parents=True, exist_ok=True)
    fp.write_text(content, encoding="utf-8")


def edit_file(
    workspace_root: str,
    path: str,
    old_string: str,
    new_string: str,
) -> str:
    """Replace first occurrence of old_string with new_string in file. Returns new content."""
    fp = _resolve(workspace_root, path)
    if not fp.is_file():
        raise FileNotFoundError(f"Not a file or not found: {path}")
    text = fp.read_text(encoding="utf-8", errors="replace")
    if old_string not in text:
        raise ValueError("old_string not found in file. Ensure exact match including newlines/whitespace.")
    new_text = text.replace(old_string, new_string, 1)
    fp.write_text(new_text, encoding="utf-8")
    return new_text


def run_cmd(
    workspace_root: str,
    command: str,
    timeout: int = 300,
) -> str:
    """Run shell command in workspace directory. Returns combined stdout and stderr."""
    result = subprocess.run(
        command,
        shell=True,
        cwd=workspace_root,
        capture_output=True,
        text=True,
        timeout=timeout,
        env={**os.environ},
    )
    out = (result.stdout or "") + (result.stderr or "")
    if result.returncode != 0:
        out += f"\n[exit code: {result.returncode}]"
    return out.strip() or "(no output)"


def list_dir(
    workspace_root: str,
    path: str = ".",
    recursive: bool = False,
    pattern: str | None = None,
) -> list[str]:
    """List directory contents. Returns list of relative paths (files only if pattern given)."""
    fp = _resolve(workspace_root, path)
    if not fp.is_dir():
        raise NotADirectoryError(f"Not a directory: {path}")
    if not recursive:
        names = [f.name for f in fp.iterdir()]
        if pattern:
            try:
                rex = re.compile(pattern.replace("*", ".*"))
                names = [n for n in names if rex.search(n)]
            except re.error:
                names = [n for n in names if pattern in n]
        return sorted(names)
    out = []
    for root, _, files in os.walk(fp):
        rel = os.path.relpath(root, workspace_root)
        if rel == ".":
            rel = ""
        for f in files:
            full = os.path.join(rel, f) if rel else f
            if pattern:
                try:
                    rex = re.compile(pattern.replace("*", ".*"))
                    if not rex.search(f):
                        continue
                except re.error:
                    if pattern not in f:
                        continue
            out.append(full)
    return sorted(out)


def grep(
    workspace_root: str,
    pattern: str,
    path: str = ".",
    recursive: bool = True,
    max_matches: int = 500,
) -> str:
    """Search for pattern in files. Returns lines with file:line:content."""
    fp = _resolve(workspace_root, path)
    try:
        rex = re.compile(pattern)
    except re.error:
        rex = re.compile(re.escape(pattern))
    lines_out = []
    count = 0
    if fp.is_file():
        for i, line in enumerate(fp.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if rex.search(line):
                lines_out.append(f"{path}:{i}:{line.strip()}")
                count += 1
                if count >= max_matches:
                    break
        return "\n".join(lines_out)
    for root, _, files in os.walk(fp):
        rel_root = os.path.relpath(root, workspace_root)
        for f in files:
            if count >= max_matches:
                return "\n".join(lines_out) + f"\n(... truncated at {max_matches} matches)"
            filepath = os.path.join(rel_root, f) if rel_root != "." else f
            fullpath = Path(workspace_root) / filepath
            try:
                text = fullpath.read_text(encoding="utf-8", errors="replace")
            except Exception:
                continue
            for i, line in enumerate(text.splitlines(), 1):
                if rex.search(line):
                    lines_out.append(f"{filepath}:{i}:{line.strip()}")
                    count += 1
                    if count >= max_matches:
                        break
    return "\n".join(lines_out) or "(no matches)"


def get_tool_definitions() -> list[dict]:
    """OpenAI-compatible tool definitions for function calling."""
    return [
        {
            "type": "function",
            "function": {
                "name": ToolName.READ_FILE,
                "description": "Read contents of a file. Path relative to workspace root.",
                "parameters": {
                    "type": "object",
                    "properties": {"path": {"type": "string", "description": "Relative path, e.g. src/app.js"}},
                    "required": ["path"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": ToolName.WRITE_FILE,
                "description": "Create or overwrite a file. Path relative to workspace root.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Relative path"},
                        "content": {"type": "string", "description": "Full file content"},
                    },
                    "required": ["path", "content"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": ToolName.EDIT_FILE,
                "description": "Replace one occurrence of old_string with new_string in a file. Use exact match.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Relative path to file"},
                        "old_string": {"type": "string", "description": "Exact text to replace (include newlines if needed)"},
                        "new_string": {"type": "string", "description": "Replacement text"},
                    },
                    "required": ["path", "old_string", "new_string"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": ToolName.RUN_CMD,
                "description": "Run a shell command in the workspace directory (e.g. tests, linters, grep, npm install).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": {"type": "string", "description": "Shell command to run"},
                        "timeout": {"type": "integer", "description": "Timeout in seconds (default 300)", "default": 300},
                    },
                    "required": ["command"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": ToolName.LIST_DIR,
                "description": "List directory contents. Path relative to workspace.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Directory path (default .)", "default": "."},
                        "recursive": {"type": "boolean", "description": "List recursively", "default": False},
                        "pattern": {"type": "string", "description": "Optional glob-like pattern to filter names"},
                    },
                    "required": [],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": ToolName.GREP,
                "description": "Search for a regex pattern in files under the workspace.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pattern": {"type": "string", "description": "Regex pattern to search"},
                        "path": {"type": "string", "description": "File or directory to search (default .)", "default": "."},
                        "recursive": {"type": "boolean", "description": "Search recursively", "default": True},
                    },
                    "required": ["pattern"],
                },
            },
        },
    ]


def execute_tool(
    workspace_root: str,
    name: str,
    arguments: dict,
) -> str:
    """Execute one tool by name. Returns result string or raises (caller should catch and format as error message)."""
    if name == ToolName.READ_FILE:
        return read_file(workspace_root, arguments["path"])
    if name == ToolName.WRITE_FILE:
        write_file(workspace_root, arguments["path"], arguments["content"])
        return f"Wrote {arguments['path']}"
    if name == ToolName.EDIT_FILE:
        edit_file(
            workspace_root,
            arguments["path"],
            arguments["old_string"],
            arguments["new_string"],
        )
        return f"Updated {arguments['path']}"
    if name == ToolName.RUN_CMD:
        return run_cmd(
            workspace_root,
            arguments["command"],
            timeout=arguments.get("timeout", 300),
        )
    if name == ToolName.LIST_DIR:
        return "\n".join(
            list_dir(
                workspace_root,
                path=arguments.get("path", "."),
                recursive=arguments.get("recursive", False),
                pattern=arguments.get("pattern"),
            )
        )
    if name == ToolName.GREP:
        return grep(
            workspace_root,
            arguments["pattern"],
            path=arguments.get("path", "."),
            recursive=arguments.get("recursive", True),
        )
    raise ValueError(f"Unknown tool: {name}")
