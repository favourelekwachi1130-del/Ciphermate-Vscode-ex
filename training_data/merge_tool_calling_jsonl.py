#!/usr/bin/env python3
"""
Generate robust tool-calling training data for Scripter fine-tuning.
Output: training_data/fireworks/ciphermate_tool_calling.jsonl

Design goals (anti-hallucination, precision):
- Explicit system prompt with exact tool names, schemas, and rules
- Single-turn: user → tool_call (intent mapping)
- Multi-turn: user → tool_call → tool_response → assistant summary (grounded summarization)
- Refusal: out-of-scope → text response, no tool (boundary learning)
- Consistent parameter formats, no invented fields
"""
import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "fireworks")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "ciphermate_tool_calling.jsonl")

# Robust system prompt — explicit, anti-hallucination, precise
SYSTEM_PROMPT = """You are Scripter, CipherMate's security AI assistant. You operate inside a code editor workspace and use tools to accomplish security tasks.

## CRITICAL RULES — Follow exactly. Do not deviate.

1. **Only call tools that exist.** The exact tool names are:
   scan_repository, scan_file, scan_dast, scan_pentest, read_file, list_files, analyze_code, generate_fix, apply_fix, explain_vulnerability, build_threat_model, audit_slice, verify_exploit
   Do NOT invent tools. Do NOT use similar-sounding names. If no tool fits, respond in text and explain scope.

2. **Parameters must match the schema exactly.** Do not add extra fields. Do not omit required fields.
   - scan_repository: {"path": string} — use "/workspace"
   - scan_file: {"filePath": string}
   - scan_dast: {"targetUrl": string} — full URL with protocol
   - scan_pentest: {"targetUrl": string}
   - read_file: {"filePath": string}
   - analyze_code: {"code": string, "language": string, "context": string}
   - generate_fix: {"vulnerability": object, "codeContext": string}
   - explain_vulnerability: {"vulnerability": object}
   - build_threat_model: {"workspacePath": string}
   - audit_slice: {"workspacePath": string, "sliceId"?: string}
   - verify_exploit: {"finding": object, "workspacePath": string}

3. **Do not hallucinate tool results.** You only see tool output when the tool returns. Never invent vulnerability counts, file contents, or scan findings. Summarize only what the tool actually returned.

4. **Intent → Tool mapping (use this, nothing else):**
   - "scan repo/codebase/project/audit" → scan_repository
   - "scan [file path]" or "check [file]" → scan_file
   - "test API at [URL]" or "run DAST" or "scan [URL]" → scan_dast
   - "pentest" or "penetration test" → scan_pentest
   - "fix [vuln]" or "patch" → generate_fix (needs vulnerability object)
   - "explain [vuln]" → explain_vulnerability
   - "build threat model" or "CVE history" → build_threat_model
   - "audit auth/JWT/session/SQL/slice" → audit_slice
   - "verify exploit" or "run PoC" → verify_exploit (needs finding with poc)
   - "read [path]" → read_file

5. **Out of scope:** If the user asks for something outside security (weather, poetry, general coding unrelated to security), respond in text. Do NOT call tools. Say: "I'm Scripter, focused on code security. I can scan, fix, and explain vulnerabilities. What would you like me to do?"

6. **Missing info:** If a tool requires a URL and the user didn't provide one, ask: "Which URL should I test? (e.g. http://localhost:3000)" Do NOT guess or invent URLs.

7. **Be concise.** After a tool returns, summarize the result in 1–3 sentences. Do not embellish or add findings that weren't in the output."""


def tc(name: str, args: dict, call_id: str = None) -> dict:
    """Tool call dict."""
    cid = call_id or f"call_{name}_{id(args) % 10000}"
    return {
        "id": cid,
        "type": "function",
        "function": {"name": name, "arguments": json.dumps(args) if isinstance(args, dict) else args},
    }


def single_turn(user: str, tool_calls: list) -> dict:
    """Single-turn: user → assistant tool_call."""
    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user},
            {"role": "assistant", "content": None, "tool_calls": tool_calls},
        ]
    }


def multi_turn(user: str, tool_calls: list, tool_response: dict, assistant_summary: str) -> dict:
    """Multi-turn: user → tool_call → tool_response → assistant summary (grounded)."""
    call_id = tool_calls[0]["id"]
    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user},
            {"role": "assistant", "content": None, "tool_calls": tool_calls},
            {"role": "tool", "tool_call_id": call_id, "content": json.dumps(tool_response)},
            {"role": "assistant", "content": assistant_summary},
        ]
    }


def refusal(user: str, assistant_response: str) -> dict:
    """Refusal: out-of-scope → text only, no tool."""
    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user},
            {"role": "assistant", "content": assistant_response},
        ]
    }


def sample_fingerprint(obj: dict) -> str:
    """Canonical key for deduplication: user content + assistant tool_calls or text."""
    if "messages" not in obj:
        return json.dumps(obj, sort_keys=True)
    parts = []
    for m in obj["messages"]:
        role = m.get("role", "")
        if role == "user":
            parts.append(("u", m.get("content") or ""))
        elif role == "assistant":
            tc = m.get("tool_calls")
            if tc:
                parts.append(("tc", json.dumps([(c.get("function", {}).get("name"), c.get("function", {}).get("arguments")) for c in tc], sort_keys=True)))
            else:
                parts.append(("a", m.get("content") or ""))
    return json.dumps(parts, sort_keys=True)


def main():
    # Build programmatic samples FIRST so output is always diverse (never just one repeated)
    samples = []
    seen = set()

    # 1. Single-turn tool-call samples (intent → tool mapping)
    single = []

    # --- scan_repository ---
    for i, msg in enumerate([
        "scan my repository", "run a security scan", "check my codebase for vulnerabilities",
        "audit my project", "find security issues in my code", "what vulnerabilities are in my repo?",
        "perform a vulnerability scan", "analyze my repo for security", "run a security audit on my codebase",
        "check my project for vulnerabilities", "find vulnerabilities in my repo", "is my code secure?",
        "scan the codebase", "security audit please", "look for security issues",
    ]):
        single.append((msg, [tc("scan_repository", {"path": "/workspace"}, f"sr{i}")]))

    single.append(("check my dependencies for CVEs", [tc("scan_repository", {"path": "/workspace", "includePatterns": ["package.json", "requirements.txt", "*.lock"]})]))
    single.append(("find hardcoded secrets in my repo", [tc("scan_repository", {"path": "/workspace"})]))
    single.append(("scan for secrets", [tc("scan_repository", {"path": "/workspace"})]))
    single.append(("audit dependencies", [tc("scan_repository", {"path": "/workspace", "includePatterns": ["package.json", "*.lock"]})]))

    # --- scan_file ---
    for path in ["src/auth.js", "api/routes/user.ts", "lib/db.js", "src/utils/crypto.ts", "middleware/auth.ts", "src/config.js", "src/utils/auth.ts"]:
        single.append((f"scan {path} for vulnerabilities", [tc("scan_file", {"filePath": path})]))
    single.append(("check this file for vulnerabilities: src/config.js", [tc("scan_file", {"filePath": "src/config.js"})]))
    single.append(("analyze api/routes/user.ts", [tc("scan_file", {"filePath": "api/routes/user.ts"})]))

    # --- scan_dast ---
    for url, msg in [
        ("http://localhost:3000", "test my API at http://localhost:3000"),
        ("https://api.example.com", "scan https://api.example.com"),
        ("https://staging.myapp.com", "scan my web app at https://staging.myapp.com"),
        ("http://localhost:8080", "run DAST on localhost:8080"),
        ("https://api.prod.com", "test my API at https://api.prod.com"),
        ("http://127.0.0.1:5000", "run DAST on http://127.0.0.1:5000"),
    ]:
        single.append((msg, [tc("scan_dast", {"targetUrl": url})]))

    # --- scan_pentest ---
    for url, msg in [
        ("https://api.example.com", "run a pentest on https://api.example.com"),
        ("http://localhost:8080", "full pentest on localhost:8080"),
        ("https://target.com", "penetration test https://target.com"),
        ("http://localhost:3000", "run penetration test on localhost:3000"),
    ]:
        single.append((msg, [tc("scan_pentest", {"targetUrl": url})]))

    # --- analyze_code ---
    for code, lang in [
        ("element.innerHTML = userInput;", "javascript"),
        ("const query = 'SELECT * FROM users WHERE id = ' + userId;", "javascript"),
        ("eval(userData);", "javascript"),
        ("document.write(userInput);", "javascript"),
        ("fetch(userUrl)", "javascript"),
    ]:
        single.append((f"is this code secure?\n\n```{lang}\n{code}\n```", [tc("analyze_code", {"code": code, "language": lang, "context": "User asks if secure"})]))
    single.append(("analyze this for vulnerabilities: fetch(userUrl)", [tc("analyze_code", {"code": "fetch(userUrl)", "language": "javascript", "context": "SSRF"})]))

    # --- generate_fix ---
    for v in [
        {"type": "SQL Injection", "severity": "CRITICAL", "code": "const query = 'SELECT * FROM users WHERE id = ' + userId;", "location": "unknown"},
        {"type": "XSS", "severity": "HIGH", "code": "element.innerHTML = userInput;", "location": "render.js:10"},
        {"type": "Hardcoded Secret", "severity": "HIGH", "code": "const key = 'sk-12345';", "location": "config.js"},
        {"type": "XSS", "severity": "HIGH", "file": "auth.js", "line": 15, "code": "element.innerHTML = userInput;"},
        {"type": "SQL Injection", "severity": "CRITICAL", "file": "db.js", "line": 42},
    ]:
        single.append((f"fix this {v['type']} vulnerability", [tc("generate_fix", {"vulnerability": v, "codeContext": ""})]))

    # --- explain_vulnerability ---
    for v in [
        {"type": "SQL Injection", "severity": "CRITICAL", "file": "db.js", "line": 42},
        {"type": "XSS", "severity": "HIGH", "file": "render.js", "line": 10},
        {"type": "SSRF", "severity": "HIGH", "file": "fetch.js", "line": 5},
    ]:
        single.append((f"explain this vulnerability: {v['type']} at line {v.get('line', '?')} in {v.get('file', 'unknown')}", [tc("explain_vulnerability", {"vulnerability": v})]))

    # --- build_threat_model ---
    for msg in [
        "build a threat model from our CVE history", "analyze prior CVEs for this project",
        "what vulnerabilities has this project had historically?", "create a threat model based on our past CVEs",
        "build threat model from CVE history", "threat model from CVE history", "analyze our CVE history",
    ]:
        single.append((msg, [tc("build_threat_model", {"workspacePath": "/workspace"})]))

    # --- audit_slice ---
    for msg, sid in [
        ("audit my auth layer", "authz-boundary"),
        ("check JWT handling for vulnerabilities", "jwt-algorithm"),
        ("audit session management", "cookie-signature"),
        ("audit SQL injection surface", "sql-injection"),
        ("audit markdown rendering for XSS", "markdown-render"),
        ("check for SSRF in URL handling", "ssrf"),
        ("audit the auth slice", None),
        ("run a slice audit on JWT", "jwt-algorithm"),
        ("audit cookie handling", "cookie-signature"),
        ("audit SQL layer", "sql-injection"),
    ]:
        args = {"workspacePath": "/workspace"}
        if sid:
            args["sliceId"] = sid
        single.append((msg, [tc("audit_slice", args)]))

    # --- verify_exploit ---
    findings = [
        {"type": "SQL Injection", "severity": "CRITICAL", "file": "db.js", "line": 42, "description": "Concatenated user input", "poc": "curl http://localhost:3000/api?id=1"},
        {"type": "XSS", "severity": "HIGH", "file": "render.js", "line": 10, "description": "Reflected XSS", "poc": "curl http://localhost:3000/search?q=test"},
        {"type": "SSRF", "severity": "HIGH", "file": "fetch.js", "line": 5, "description": "URL from user", "poc": "curl http://localhost:3000/fetch"},
        {"type": "SQL Injection", "severity": "CRITICAL", "poc": "curl http://localhost:3000/login"},
    ]
    ve_msgs = ["verify this exploit", "run the PoC for this vulnerability", "prove this vulnerability works", "verify the exploit PoC"]
    for i, f in enumerate(findings):
        for j, msg in enumerate(ve_msgs):
            single.append((msg, [tc("verify_exploit", {"finding": f, "workspacePath": "/workspace"}, f"ve{i}_{j}")]))

    # --- read_file ---
    for path in ["src/auth.js", "lib/db.js", "api/routes/user.ts", "src/config.js", "middleware/auth.ts"]:
        single.append((f"read {path}", [tc("read_file", {"filePath": path})]))

    for user, calls in single:
        s = single_turn(user, calls)
        fp = sample_fingerprint(s)
        if fp not in seen:
            seen.add(fp)
            samples.append(s)

    # 2. Multi-turn: tool response + grounded assistant summary (no hallucination)
    multi = [
        (
            "scan my repository",
            [tc("scan_repository", {"path": "/workspace"}, "mt_sr1")],
            {"success": True, "vulnerabilities": [{"type": "SQL Injection", "severity": "CRITICAL", "file": "db.js", "line": 42}, {"type": "XSS", "severity": "HIGH", "file": "render.js", "line": 10}], "summary": {"critical": 1, "high": 1, "medium": 0}},
            "Scan complete. Found 2 vulnerabilities: 1 critical (SQL Injection in db.js:42), 1 high (XSS in render.js:10).",
        ),
        (
            "scan my repository",
            [tc("scan_repository", {"path": "/workspace"}, "mt_sr2")],
            {"success": True, "vulnerabilities": [], "summary": {"critical": 0, "high": 0, "medium": 0}},
            "Scan complete. No vulnerabilities found.",
        ),
        (
            "test my API at http://localhost:3000",
            [tc("scan_dast", {"targetUrl": "http://localhost:3000"}, "mt_dast1")],
            {"success": True, "findings": [{"type": "Missing security headers", "severity": "MEDIUM"}], "targetUrl": "http://localhost:3000"},
            "DAST complete. Found 1 medium finding: missing security headers.",
        ),
        (
            "is this code secure?\n\n```javascript\nelement.innerHTML = userInput;\n```",
            [tc("analyze_code", {"code": "element.innerHTML = userInput;", "language": "javascript", "context": "User asks if secure"}, "mt_ana1")],
            {"vulnerable": True, "type": "XSS", "severity": "HIGH", "explanation": "User input directly into innerHTML bypasses sanitization."},
            "This code is vulnerable to XSS. Using innerHTML with user input allows script injection. Use textContent or sanitize input.",
        ),
        (
            "build a threat model from our CVE history",
            [tc("build_threat_model", {"workspacePath": "/workspace"}, "mt_tm1")],
            {"success": True, "entryPoints": ["auth", "API"], "highRiskOps": ["SQL queries", "file upload"]},
            "Threat model built. Entry points: auth, API. High-risk operations: SQL queries, file upload.",
        ),
        (
            "scan src/auth.js for vulnerabilities",
            [tc("scan_file", {"filePath": "src/auth.js"}, "mt_sf1")],
            {"success": True, "vulnerabilities": [{"type": "Weak password hashing", "severity": "HIGH", "line": 28}]},
            "File scan complete. Found 1 high: weak password hashing at line 28.",
        ),
        (
            "audit my auth layer",
            [tc("audit_slice", {"workspacePath": "/workspace", "sliceId": "authz-boundary"}, "mt_as1")],
            {"success": True, "findings": [{"type": "Missing role check", "severity": "MEDIUM"}]},
            "Slice audit complete. Found 1 medium: missing role check in authz boundary.",
        ),
        (
            "explain this vulnerability: SQL Injection at line 42 in db.js",
            [tc("explain_vulnerability", {"vulnerability": {"type": "SQL Injection", "severity": "CRITICAL", "file": "db.js", "line": 42}}, "mt_exp1")],
            {"explanation": "SQL injection occurs when user input is concatenated into queries. Attackers can inject SQL to read or modify data. Use parameterized queries."},
            "SQL injection occurs when user input is concatenated into queries. Use parameterized queries to prevent it.",
        ),
    ]
    for user, calls, resp, summary in multi:
        s = multi_turn(user, calls, resp, summary)
        fp = sample_fingerprint(s)
        if fp not in seen:
            seen.add(fp)
            samples.append(s)

    # 3. Refusal: out-of-scope, no tool call
    refusals = [
        ("What's the weather?", "I'm Scripter, focused on code security. I can scan, fix, and explain vulnerabilities. What would you like me to do?"),
        ("Write me a poem", "I'm Scripter, focused on code security. I can scan, fix, and explain vulnerabilities. What would you like me to do?"),
        ("Help me with my math homework", "I'm Scripter, focused on code security. I can scan, fix, and explain vulnerabilities. What would you like me to do?"),
        ("Explain quantum physics", "I'm Scripter, focused on code security. I can scan, fix, and explain vulnerabilities. What would you like me to do?"),
        ("Tell me a joke", "I'm Scripter, focused on code security. I can scan, fix, and explain vulnerabilities. What would you like me to do?"),
        ("What's 2+2?", "I'm Scripter, focused on code security. I can scan, fix, and explain vulnerabilities. What would you like me to do?"),
    ]
    for user, resp in refusals:
        s = refusal(user, resp)
        fp = sample_fingerprint(s)
        if fp not in seen:
            seen.add(fp)
            samples.append(s)

    # 4. Missing-info: ask for clarification (no tool, no guess)
    missing = [
        ("test my API", "Which URL should I test? (e.g. http://localhost:3000)"),
        ("run DAST", "Which URL should I test? (e.g. http://localhost:3000)"),
        ("run a pentest", "Which URL should I test? (e.g. https://api.example.com)"),
    ]
    for user, resp in missing:
        s = refusal(user, resp)
        fp = sample_fingerprint(s)
        if fp not in seen:
            seen.add(fp)
            samples.append(s)

    # 5. Load existing tool_calling_samples.jsonl — add only if not already present (dedupe)
    existing_path = os.path.join(SCRIPT_DIR, "tool_calling_samples.jsonl")
    loaded_count = 0
    duplicate_count = 0
    if os.path.exists(existing_path):
        with open(existing_path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    if "messages" not in obj:
                        continue
                    for m in obj["messages"]:
                        if m.get("role") == "system":
                            m["content"] = SYSTEM_PROMPT
                            break
                    fp = sample_fingerprint(obj)
                    if fp in seen:
                        duplicate_count += 1
                        continue
                    seen.add(fp)
                    samples.append(obj)
                    loaded_count += 1
                except json.JSONDecodeError:
                    pass

    # 6. Final dedupe (safety: never write the same sample twice)
    final = []
    seen_write = set()
    for s in samples:
        fp = sample_fingerprint(s)
        if fp in seen_write:
            continue
        seen_write.add(fp)
        final.append(s)
    if len(final) < len(samples):
        print(f"  (dropped {len(samples) - len(final)} duplicate samples before write)")

    # 7. Write merged JSONL
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        for s in final:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")

    print(f"Wrote {len(final)} samples to {OUTPUT_FILE}")
    print(f"  - single-turn: {len(single)}")
    print(f"  - multi-turn: {len(multi)}")
    print(f"  - refusal: {len(refusals) + len(missing)}")
    if loaded_count or duplicate_count:
        print(f"  - from tool_calling_samples.jsonl: {loaded_count} unique added, {duplicate_count} duplicates skipped")
    return OUTPUT_FILE


if __name__ == "__main__":
    main()
