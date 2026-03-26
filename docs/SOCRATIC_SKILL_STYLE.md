# Socratic Skill Style Guide

Skills written in Socratic style promote deep understanding, aid finetuning, and improve agent assimilation. The model learns *why* and *how to reason*, not just *what to do*.

---

## Principles

### 1. Questions Over Commands
Instead of imperative "Do X", use reflective prompts:

| Imperative (avoid) | Socratic (prefer) |
|--------------------|-------------------|
| "Use parameterized queries" | "What happens when user input reaches the database unescaped? The expert asks: how does the database distinguish data from code?" |
| "Never use eval()" | "Consider: what does eval() assume about its input? What must be true for it to be safe? The security analyst knows that assumption is never valid for user input." |
| "Apply the fix" | "Before applying: what would an attacker gain if this fix were wrong? What evidence confirms the fix blocks the vulnerability?" |

### 2. Dialectic Reasoning
Present opposing considerations, then synthesis:

```
On one hand, the developer may wish to log the full request for debugging.
On the other, logs may contain secrets, PII, or tokens that persist in storage.
The expert therefore asks: what is the minimum needed to diagnose without exposing sensitive data?
```

### 3. Expert Framing
Use "The expert understands...", "The security analyst knows...", "One must consider...":

- "The expert understands that a fix is only as good as its verification."
- "The security analyst knows that similar patterns elsewhere in the codebase often indicate systemic risk."
- "One must consider: does this change introduce new failure modes?"

### 4. Root-Cause Before Action
Prompt reasoning about cause before prescribing action:

```
Before writing a single line, ask: what is the root cause of this vulnerability?
Is it missing validation? Trusting user input as code? Leaking data in errors?
The fix that addresses the root cause will prevent recurrence; the fix that patches the symptom may leave related paths vulnerable.
```

### 5. Implications and Consequences
Encourage thinking through implications:

```
If we move the secret to an environment variable, what must be true?
The deployment process must inject it. The .env file must not be committed.
The expert therefore checks: does .gitignore exclude .env? Is there an .env.example that documents the variable without revealing the value?
```

---

## Structure for Vulnerability-Fixing Skills

1. **Opening reflection** — Why does this skill matter? What does the expert understand?
2. **Guiding questions** — What must one ask before acting?
3. **Dialectic sections** — On one hand / On the other / Therefore
4. **Patterns with reasoning** — Show the pattern and *why* it works
5. **Verification reflection** — How does one know the fix is correct?
6. **Closing synthesis** — What has the expert learned? What remains to consider?

---

## Example Transformation

**Before (imperative):**
```
Phase 1: Read the file
1. Read the complete file
2. Identify language and framework
3. Check existing security utilities
```

**After (Socratic):**
```
Before generating any fix, the expert pauses to understand.

What does the file reveal? The language and framework constrain which patterns are available. The existing security utilities—validators, sanitizers, middleware—answer: what has this project already decided about security? To introduce a new pattern that conflicts with the codebase is to create inconsistency; to ignore an existing pattern is to duplicate logic and risk divergence.

The expert therefore asks: what would a developer familiar with this codebase do? The fix should feel native, not foreign.
```

---

## Finetuning and Assimilation

Socratic phrasing:
- **Encourages chain-of-thought** — The model reasons stepwise
- **Reduces brittle imitation** — Understanding generalizes; commands do not
- **Improves tool use** — "Why call this tool?" is answered before "Call this tool"
- **Supports verification** — "How do I know I'm done?" is built into the skill

Use this style for all CipherMate skills.

---

## SKILL v2 Standard

All production skills should follow `skills/SKILL_TEMPLATE_V2.md` with these mandatory sections:

1. Expert Framing  
2. Decision Boundary  
3. Input Contract  
4. Reasoning Checklist  
5. Execution Policy  
6. Output Schema  
7. Failure Modes  
8. Verification Gates  
9. Quality Rubric  
10. Finetuning Pack
