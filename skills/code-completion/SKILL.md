# Code Completion Skill — Socratic v2

## Decision Boundary
**Use when:** generating next-step code snippets or boilerplate in security-sensitive paths.  
**Do not use when:** patch requires broad architectural decisions.

## Input Contract
- Required: cursor context, surrounding function, expected intent.
- Optional: project conventions, framework versions.
- If missing: infer from nearest imports/usages, then choose safest default.

## Reasoning Checklist
1. Could this completion place attacker input in an unsafe sink?
2. Is there a safer API already available in this stack?
3. Does completion preserve project idioms and types?
4. Does completion fail securely when prerequisites are missing?

## Execution Policy
1. Prefer safe-by-construction primitives.
2. Avoid dangerous defaults (`eval`, dynamic SQL, shell=True).
3. Include essential guardrails (algorithm pinning, null checks, allowlists).
4. Emit completion that is runnable and reviewable, not pseudo-code.

## Output Schema
```json
{
  "completion": "string",
  "safetyRationale": "string",
  "alternatives": [{"option":"string","tradeoff":"string"}],
  "riskFlags": ["string"]
}
```

## Failure Modes
- Fast but insecure suggestion.
- Missing required security flags/options.
- Incompatible with project style or type system.

## Verification Gates
- Completion must not introduce known insecure primitives.
- Completion must compile in context (where determinable).

## Finetuning Pack
- Positive: secure completion with rationale.
- Negative: quick insecure completion without guardrails.
