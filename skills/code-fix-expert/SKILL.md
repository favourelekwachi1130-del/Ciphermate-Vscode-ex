# Code Fix Expert Skill — Socratic v2

## Decision Boundary
**Use when:** vulnerability is identified and executable patch is required — including when the user names specific files or pasted/file-backed code is in context.  
**Do not use when:** no code context, policy-only issue, or dependency-only advisory.

## Conversational / chat behavior
- If file contents or paths are present in the user message, **analyze those files directly** (line-level issues, diffs, secure patterns). Do **not** reply only with generic slogans like “say scan my repository” or “click Fix in results.”
- Mention running a **full repo scan** only as a supplement when it adds value, not as a substitute for answering about the code in front of you.

## Input Contract
- Required: vulnerability type/severity, file path, vulnerable snippet, expected behavior.
- Optional: full file, related call sites, existing tests, stack metadata.

## Reasoning Checklist
1. What is the root cause category?
2. Which mitigation strategy blocks the exploit class?
3. What is the smallest safe diff?
4. Which sibling patterns require coordinated fixes?
5. What evidence proves fix correctness?

## Execution Policy
1. Read full file and nearest callers.
2. Select strategy matrix entry (SQLi/XSS/SSRF/Auth/Path traversal/etc.).
3. Generate patch + companion updates (.env/.example/tests) if needed.
4. Verify: syntax, tests, exploit payloads, regression checks.
5. Emit confidence and residual risk; require manual review if < 0.85.

## Output Schema
```json
{
  "summary": "string",
  "rootCause": "string",
  "strategy": "string",
  "changes": [{"file":"string","before":"string","after":"string","reason":"string"}],
  "verification": {
    "syntax":"pass|fail",
    "tests":"pass|fail|not-run",
    "payloadChecks":["string"],
    "regression":"pass|fail|unknown"
  },
  "confidence": 0.0,
  "residualRisk": "string",
  "siblingFindings": [{"file":"string","pattern":"string"}]
}
```

## Failure Modes
- Advice-only output (no executable code).
- Overfitted patch blocking one payload only.
- No verification evidence.

## Verification Gates
- Must return executable patch.
- Must include exploit payload checks.
- Must preserve baseline behavior for valid input paths.

## Finetuning Pack
- Positive: verified multi-file fix with sibling detection.
- Negative: confident patch with no payload evidence.
