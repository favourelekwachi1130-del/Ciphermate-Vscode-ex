#!/usr/bin/env python3
"""
Generate tool-calling training data from the tool registry.

Creates JSONL samples: user message -> assistant with tool_calls.
Use for fine-tuning Scripter to learn when to invoke each tool.

Usage:
  python scripts/generate_tool_calling_training.py
  python scripts/generate_tool_calling_training.py --count 50
  python scripts/generate_tool_calling_training.py --output training_data/tool_calls_expanded.jsonl
"""

import argparse
import json
import sys
from pathlib import Path

# Tool registry (mirrors src/ai-agent/tool-registry.ts)
TOOL_REGISTRY = {
    "scan_repository": {
        "name": "scan_repository",
        "description": "Scan the entire repository for security vulnerabilities.",
        "whenToUse": ["User asks to scan, audit, check, or analyze the repo"],
        "userExamples": [
            "scan my repository",
            "run a security scan",
            "check my codebase for vulnerabilities",
            "audit my project",
            "find security issues in my code",
            "what vulnerabilities are in my repo?",
        ],
        "defaultArgs": {"path": "/workspace"},
    },
    "scan_file": {
        "name": "scan_file",
        "userExamples": [
            "scan src/auth.js",
            "check this file for vulnerabilities",
            "analyze api/routes/user.ts",
        ],
        "defaultArgs": {"filePath": "src/auth.js"},
    },
    "scan_dast": {
        "name": "scan_dast",
        "userExamples": [
            "test my API at http://localhost:3000",
            "scan https://api.example.com",
            "run DAST on my web app",
        ],
        "defaultArgs": {"targetUrl": "http://localhost:3000"},
    },
    "scan_pentest": {
        "name": "scan_pentest",
        "userExamples": [
            "run a pentest",
            "penetration test my API",
            "full pentest on localhost:8080",
        ],
        "defaultArgs": {"targetUrl": "http://localhost:8080"},
    },
    "analyze_code": {
        "name": "analyze_code",
        "userExamples": [
            "is this code secure? [code]",
            "analyze this for vulnerabilities [code]",
        ],
        "defaultArgs": {"code": "userInput", "language": "javascript"},
    },
    "generate_fix": {
        "name": "generate_fix",
        "userExamples": [
            "fix this SQL injection",
            "fix all critical vulnerabilities",
            "patch the XSS in auth.js",
        ],
        "defaultArgs": {"vulnerability": {"type": "SQL Injection", "severity": "CRITICAL"}},
    },
    "explain_vulnerability": {
        "name": "explain_vulnerability",
        "userExamples": [
            "explain this vulnerability",
            "what is SQL injection?",
            "why is this dangerous?",
        ],
        "defaultArgs": {"vulnerability": {"type": "SQL Injection"}},
    },
}

SYSTEM_PROMPT = """You are Scripter, CipherMate's security AI. Use tools to accomplish tasks. When the user asks to scan, use scan_repository. When they ask to fix, use generate_fix. For DAST/pentest, use scan_dast or scan_pentest with the URL. Always use the workspace path for scans."""


def generate_sample(tool_name: str, user_message: str, args: dict) -> dict:
    """Generate one training sample."""
    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": f"call_{tool_name}_{hash(user_message) % 10000}",
                        "type": "function",
                        "function": {
                            "name": tool_name,
                            "arguments": json.dumps(args),
                        },
                    }
                ],
            },
        ]
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=0, help="Samples per tool (0 = all examples)")
    parser.add_argument("--output", type=str, default="training_data/tool_calling_expanded.jsonl")
    args = parser.parse_args()

    count = args.count
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    samples = []
    for tool_name, entry in TOOL_REGISTRY.items():
        examples = entry["userExamples"]
        default_args = entry.get("defaultArgs", {})
        to_take = count if count > 0 else len(examples)
        for i, user_msg in enumerate(examples[:to_take]):
            sample = generate_sample(tool_name, user_msg, default_args)
            samples.append(sample)

    with open(out_path, "w") as f:
        for s in samples:
            f.write(json.dumps(s) + "\n")

    print(f"Generated {len(samples)} samples -> {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
