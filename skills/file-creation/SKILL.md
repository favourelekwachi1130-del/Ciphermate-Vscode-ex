# File Creation Skill — Socratic v2

## Decision Boundary
**Use when:** creating new source/config/test files for mitigation workflow.  
**Do not use when:** only patching existing lines.

## Input Contract
- Required: file purpose, destination path, expected consumers.
- Optional: framework conventions, env/deploy constraints.

## Reasoning Checklist
1. What security assumptions does this file introduce?
2. Could this file expose secrets/PII if committed or served?
3. What safe defaults should be enforced at creation time?
4. What companion files must be updated (`.env.example`, `.gitignore`, docs/tests)?

## Execution Policy
1. Create minimal, purpose-specific file.
2. Apply secure defaults (no hardcoded secrets, strict input handling).
3. Add explicit contract notes where needed.
4. Create/adjust security regression tests for new behavior.

## Output Schema
```json
{
  "createdFiles": [{"path":"string","purpose":"string"}],
  "securityDefaults": ["string"],
  "companionUpdates": ["string"],
  "verificationPlan": ["string"]
}
```

## Failure Modes
- Creating config files with insecure defaults.
- Missing companion updates.
- Introducing untested new attack surface.

## Verification Gates
- No secret literals in created files.
- Required companion files updated.
- Behavior covered by at least one targeted test.

## Finetuning Pack
- Positive: secure file + companion updates + tests.
- Negative: file created without threat-surface analysis.
