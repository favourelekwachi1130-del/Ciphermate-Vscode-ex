---
name: "<skill-id>"
version: "2.0"
style: "socratic-research"
domain: "<security|fixing|analysis|workflow>"
primary_tools: ["<tool1>", "<tool2>"]
tags: ["<tag1>", "<tag2>"]
---

# <Skill Title> — Socratic v2

## 1) Expert Framing
The expert understands the governing principle of this task and the common ways teams fail at it.
Begin by asking what assumption is being made, and whether that assumption is valid under adversarial input.

## 2) Decision Boundary
**Use when**
- <condition 1>
- <condition 2>

**Do not use when**
- <near-miss 1>
- <near-miss 2>

## 3) Input Contract
**Required inputs**
- `<field>`: <description>
- `<field>`: <description>

**Optional inputs**
- `<field>`: <description>

**If missing inputs**
- Ask for `<missing-field>` or run `<safe fallback>`.

## 4) Reasoning Checklist (must answer before acting)
1. What is the root cause?
2. What trust boundary is crossed?
3. What attacker-controlled inputs reach the sink?
4. What minimal change eliminates the class of exploit?
5. What related code paths may share the same weakness?

## 5) Execution Policy
1. Gather full context (read complete file and nearby call sites).
2. Classify vulnerability precisely (subtype, exploitability).
3. Choose mitigation strategy from approved patterns.
4. Generate patch with minimal diff and project-style consistency.
5. Verify with syntax + tests + exploit payload checks.
6. Report residual risk and confidence.

## 6) Output Schema
```json
{
  "summary": "string",
  "rootCause": "string",
  "strategy": "string",
  "changes": [
    {
      "file": "string",
      "reason": "string",
      "before": "string",
      "after": "string"
    }
  ],
  "verification": {
    "syntax": "pass|fail|not-run",
    "tests": "pass|fail|not-run",
    "payloadChecks": ["string"],
    "regressionRisk": "low|medium|high"
  },
  "confidence": 0.0,
  "residualRisk": "string"
}
```

## 7) Failure Modes
- Patch only symptom, not root cause.
- Introduce breaking API/type changes without migration notes.
- Claim fix without exploit verification.
- Omit similar vulnerable siblings.

## 8) Verification Gates (hard stop)
- Must pass syntax checks.
- Must not reduce existing test pass rate.
- Must show payloads now blocked.
- Must include rollback/undo guidance for multi-file edits.

## 9) Quality Rubric (1–5)
- **Correctness**: Root cause resolved.
- **Security**: Exploit class blocked, not just one payload.
- **Minimality**: Smallest safe diff.
- **Explainability**: Why this fix works is explicit.
- **Reproducibility**: Another engineer can re-run verification.

## 10) Finetuning Pack
**positive_examples**
- Good trace with proper tool order and verified patch.

**negative_examples**
- Overconfident fix with missing verification; corrected variant included.

**edge_cases**
- Ambiguous sink, no repro payload, partial code context.
