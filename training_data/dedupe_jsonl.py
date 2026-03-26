#!/usr/bin/env python3
"""
Deduplicate a JSONL file (messages format).
Use when a dataset has the same example repeated many times.

Usage:
  python training_data/dedupe_jsonl.py path/to/file.jsonl
  python training_data/dedupe_jsonl.py path/to/file.jsonl -o path/to/deduped.jsonl
"""
import json
import os
import sys
import argparse

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def sample_fingerprint(obj: dict) -> str:
    """Canonical key: user content + assistant tool_calls or text."""
    if "messages" not in obj:
        return json.dumps(obj, sort_keys=True)
    parts = []
    for m in obj.get("messages", []):
        role = m.get("role", "")
        if role == "user":
            parts.append(("u", m.get("content") or ""))
        elif role == "assistant":
            tc = m.get("tool_calls")
            if tc:
                parts.append(("tc", json.dumps(
                    [(c.get("function", {}).get("name"), c.get("function", {}).get("arguments")) for c in tc],
                    sort_keys=True,
                )))
            else:
                parts.append(("a", m.get("content") or ""))
    return json.dumps(parts, sort_keys=True)


def main():
    parser = argparse.ArgumentParser(description="Deduplicate JSONL (messages format)")
    parser.add_argument("input", help="Input JSONL file")
    parser.add_argument("-o", "--output", default=None, help="Output file (default: overwrite input)")
    args = parser.parse_args()

    inp = os.path.abspath(args.input)
    if not os.path.isfile(inp):
        print(f"Error: not a file: {inp}", file=sys.stderr)
        sys.exit(1)
    out = os.path.abspath(args.output) if args.output else inp

    seen = set()
    unique = []
    total = 0
    for line in open(inp):
        line = line.strip()
        if not line:
            continue
        total += 1
        try:
            obj = json.loads(line)
            fp = sample_fingerprint(obj)
            if fp in seen:
                continue
            seen.add(fp)
            unique.append(obj)
        except json.JSONDecodeError:
            pass

    with open(out, "w") as f:
        for obj in unique:
            f.write(json.dumps(obj, ensure_ascii=False) + "\n")

    print(f"Read {total} lines -> {len(unique)} unique (removed {total - len(unique)} duplicates)")
    print(f"Wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
