# Debugging Skill — Socratic v2

## Decision Boundary
**Use when:** behavior is unclear and root cause must be established before fixing.  
**Do not use when:** issue already has confirmed root cause and tested patch.

## Input Contract
- Required: failing behavior or payload, target file/function, expected behavior.
- Optional: logs, stack traces, recent commits.

## Reasoning Checklist
1. Can the vulnerability be reliably reproduced?
2. Where is attacker-controlled data introduced?
3. Which transformation invalidates safety assumptions?
4. Is this a local bug or systemic pattern?

## Execution Policy
1. Reproduce with minimal payload.
2. Trace source → sanitization → sink.
3. Classify root cause category (boundary, encoding, authz, unsafe API, race).
4. Enumerate sibling locations using same anti-pattern.
5. Propose fix hypothesis + verification plan.

## Output Schema
```json
{
  "reproSteps": ["string"],
  "rootCauseCategory": "string",
  "taintPath": ["source","transform","sink"],
  "scope": [{"file":"string","reason":"string"}],
  "fixHypothesis": "string"
}
```

## Failure Modes
- Non-reproducible diagnosis.
- Confusing symptom with root cause.
- Ignoring sibling vulnerable patterns.

## Verification Gates
- Reproduction must be shown before and after fix.
- Fix hypothesis must explain exploit prevention mechanism.

## Finetuning Pack
- Positive: reproducible root-cause trace.
- Negative: speculative fix without repro evidence.
