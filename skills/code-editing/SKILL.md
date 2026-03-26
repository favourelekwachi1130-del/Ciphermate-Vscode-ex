# Code Editing Skill — Socratic v2

## Decision Boundary
**Use when:** patching vulnerable code in existing files.  
**Do not use when:** issue is primarily architecture, policy, or dependency-only.

## Input Contract
- Required: vulnerable file, sink location, exploit class, expected behavior.
- Optional: stack/framework, coding conventions, related files.
- If missing: read full file + nearest callers before patching.

## Reasoning Checklist
1. What root cause allowed data to become code/trust?
2. What minimal edit blocks the exploit class?
3. What sibling code paths reuse the same pattern?
4. What behavior must remain unchanged for valid inputs?

## Execution Policy
1. Read full target file (not snippet only).
2. Identify source → sink path and trust boundary.
3. Patch with approved pattern (parameterization, encoding, allowlist, safe API).
4. Keep diff minimal and style-consistent.
5. Add/adjust tests where exploit class is verified.

## Output Schema
```json
{
  "summary": "string",
  "rootCause": "string",
  "changes": [{"file":"string","before":"string","after":"string","reason":"string"}],
  "verification": {"syntax":"pass|fail","tests":"pass|fail|not-run","payloadChecks":["string"]},
  "confidence": 0.0,
  "residualRisk": "string"
}
```

## Failure Modes
- Symptom patch only; root cause remains.
- Large refactor hides security-relevant edits.
- No sibling pattern search.

## Verification Gates
- Syntax must pass.
- Payload used for exploit must now fail safely.
- Valid use case must still succeed.

## Finetuning Pack
- Positive: minimal, verified edit with clear root cause.
- Negative: broad refactor without exploit verification.
