# Expert Training Data Schema - Final Form

## Core JSON Object Structure

Each training sample follows this exact schema:

```json
{
  "sample_id": "VULN-LOGIC-09342",
  "difficulty": "expert",
  "vulnerability_type": "logic",
  "vulnerability_subtype": "authorization_order_flaw",
  "language": ["python", "sql"],
  "domain": "fintech_api",
  "attack_surface": ["api", "backend"],
  "cwe": ["CWE-840"],
  "owasp_2021": ["A04: Insecure Design"],
  "mitre_attack": {
    "tactic": ["Privilege Escalation", "Impact"],
    "technique": ["T1068"],
    "subtechnique": null
  },
  "snippets": [
    {
      "snippet_id": "A",
      "file": "transfer.py",
      "role": "entrypoint",
      "code": "..."
    },
    {
      "snippet_id": "B",
      "file": "auth.py",
      "role": "validator",
      "code": "..."
    }
  ],
  "data_flow": ["A -> B -> A"],
  "vulnerability_description": "Authorization is checked after state mutation",
  "exploit_prerequisites": ["authenticated_user"],
  "attacker_goal": "transfer funds from another account",
  "unsafe_variant": {
    "explanation": "Authorization check occurs after balance update",
    "impact": "unauthorized fund transfer"
  },
  "safe_variant": {
    "explanation": "Authorization enforced before state change",
    "fix_code": "..."
  },
  "why_static_analysis_fails": [
    "Authorization function exists",
    "No missing checks at syntax level",
    "Requires temporal execution reasoning"
  ],
  "contrastive_pair_id": "PAIR-09342",
  "labels": {
    "ground_truth": "vulnerable",
    "false_negative_risk": "high"
  },
  "exploit_narrative": {
    "attacker_assumption": "user has basic account",
    "step_1": "Initiate transfer",
    "step_2": "Interrupt workflow",
    "step_3": "Replay request",
    "result": "balance updated without authorization"
  },
  "expert_characteristics": [
    "Requires runtime state",
    "Requires attacker timing",
    "Looks secure in isolation"
  ]
}
```

## Expert-Only Requirements

### 1. Must Contain Correct-Looking Security Code
-     Passes linters
-     Passes unit tests
-     Has security functions present
-     Fails only under adversarial reasoning

### 2. Snippet Roles (Required for Multi-Snippet)
Every vulnerability with multiple snippets MUST label:
- **entrypoint**: Where the vulnerability is triggered
- **validator**: Authorization/validation functions
- **mutator**: Code that changes state
- **sink**: Where data flows to

This teaches **flow awareness**, not pattern matching.

### 3. Expert Characteristics (Must Pick  ‰¥1)
Every expert sample must include at least one:
-     Requires runtime state
-     Requires attacker timing
-     Requires business context
-     Requires trust-boundary reasoning
-     Requires protocol understanding
-     Looks secure in isolation
-     Exploit spans multiple requests
-     Exploit spans multiple services

### 4. Contrastive Pairs (Required)
Every vulnerable example MUST have a safe twin:
-  ‰¥90% identical code
- Only ONE semantic difference
- Same formatting
- Same variable names
- Same comments

**Example Delta:**
```python
# Unsafe
update_balance()
check_authorization()

# Safe
check_authorization()
update_balance()
```

### 5. Exploit Narrative (Required)
Every expert vulnerability must include:
```json
"exploit_narrative": {
  "attacker_assumption": "user has basic account",
  "step_1": "Initiate transfer",
  "step_2": "Interrupt workflow",
  "step_3": "Replay request",
  "result": "balance updated without authorization"
}
```

This aligns the model with **ATT&CK thinking**, not defensive checklists.

## Zero-Trust Evaluation Harness

### Evaluation Principles

The model MUST:
-     Assume malicious intent
-     Explain how exploit works
-     State what assumption failed
-     Reject "looks safe" conclusions

### Failure Modes (Automatic Fail)

If the model ever says:
-     "This appears secure"
-     "No vulnerability detected"
-     "Depends on context"
-     "Looks safe"

 †  **automatic fail**

### Evaluation Prompt Template

```
"Assume a hostile attacker with patience, timing, and protocol knowledge.
Explain how this could fail."
```

## What We're Building

You are NOT building:
-     A scanner
-     A linter
-     A vulnerability list

You ARE building:
-     A paranoid reasoning engine
-     Trained to distrust:
  * Order
  * State
  * Intent
  * Context
  * Correctness itself

## Vulnerability Types Included

1. **authorization_order_flaw** - Check after mutation
2. **race_condition_authorization** - Concurrency flaws
3. **business_logic_bypass** - Domain logic exploitation
4. **state_mutation_before_validation** - State before check
5. **trust_boundary_confusion** - Multi-service flaws
6. **idempotency_violation** - Replay attacks
7. **time_of_check_time_of_use** - TOCTOU
8. **session_fixation_via_state** - Session manipulation
9. **insecure_deserialization_order** - Deserialization flaws
10. **crypto_timing_attack** - Side-channel attacks
11. **privilege_escalation_via_state** - Privilege manipulation

## Usage

```bash
cd ciphermate/scripts
python3 generate_expert_training_data.py
```

This generates:
- Expert format: Full schema with all metadata
- OpenAI format: Ready for fine-tuning

## Training Output

The generator creates:
- 10,000 samples (5,000 vulnerable + 5,000 safe pairs)
- All expert-level (pass linters, require reasoning)
- Contrastive pairs (minimal differences)
- ATT&CK-aligned exploit narratives
- Zero-trust evaluation prompts

---

**This is how you create something that cannot be bypassed.**


