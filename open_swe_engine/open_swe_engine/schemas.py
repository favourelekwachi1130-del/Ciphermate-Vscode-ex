"""Tool names and OpenAI-compatible tool schemas."""

from enum import StrEnum


class ToolName(StrEnum):
    READ_FILE = "read_file"
    WRITE_FILE = "write_file"
    EDIT_FILE = "edit_file"
    RUN_CMD = "run_cmd"
    LIST_DIR = "list_dir"
    GREP = "grep"
