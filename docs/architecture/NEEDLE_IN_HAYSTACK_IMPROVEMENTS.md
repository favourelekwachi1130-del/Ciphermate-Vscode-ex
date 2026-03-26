# Needle-in-the-Haystack: Improvements for CipherMate Core

Based on [Devansh's article](https://devansh.bearblog.dev/needle-in-the-haystack/) on LLMs for vulnerability research — which documents finding 30+ CVEs across Parse Server, HonoJS, ElysiaJS, harden-runner, BullFrog, Better-Hub using minimal scaffolding — this document maps his methodology to CipherMate and proposes concrete improvements.

---

## Executive Summary

The article's core thesis: **broad prompts + over-scaffolding = context rot and missed vulnerabilities**. The fix: **minimal threat-model scaffolding + thin slices + adversarial prompts + verification**.

| Article Finding | CipherMate Gap | Proposed Change |
|-----------------|----------------|-----------------|
| "Find all vulnerabilities" fails | `scan_repository` is broad, no threat model | Add threat-model-first, slice-based audit |
| Over-scaffolding causes context rot | SKILLs (security-audit, pentest-strategy, vuln-analysis) are 20+ page checklists | Slim to 1-page threat model + invariants; move checklists to reference |
| Auditor framing produces noise | "You are a security analyst. Determine if REAL or FALSE POSITIVE" | Prime as adversary; assert bugs exist; ask for exploit |
| No explicit attacker model | Prompts never constrain attacker capabilities | Add attacker model to every audit prompt |
| Token budget misallocated | Unknown; likely heavy on scaffolding | Target: <10% scaffolding, 60–80% slice audits, 20–30% verification |

---

## 1. Threat Model as First-Class Citizen

**Article:** "Threat modeling is the ultimate compression algorithm for your security audit." Build system context first, create an editable threat model, extend it as you progress.

**Current state:** No threat model in CipherMate. Scans run without trust boundaries, entry points, or attacker assumptions.

**Proposed:**

### 1.1 Threat Model Service

Add `src/core/threat-model-service.ts`:

```typescript
export interface ThreatModel {
  /** One-sentence focus per slice */
  sliceFocus: string;  // e.g. "Authorization boundary: readOnlyMasterKey vs master"
  /** Entry points */
  entryPoints: string[];  // HTTP routes, RPC handlers, CLI, scheduled jobs
  /** Trust boundaries */
  trustBoundaries: string[];  // browser→server, service→service, plugin→host
  /** High-risk operations */
  highRiskOps: string[];  // deserialization, templating, authz checks, parsing
  /** Attacker model */
  attackerModel: 'remote-unauthenticated' | 'remote-authenticated-low' | 'cross-tenant' | 'local-code-exec';
  /** Optional: CVE history for this project (from GHSA, NVD) */
  priorCves?: string[];
}
```

### 1.2 Threat Model Sources

- **CVE history**: Query GHSA/OSV for the repo; feed CVE descriptions to LLM → generate threat model.
- **User-provided**: Allow user to paste or edit a short threat model before audit.
- **Slice templates**: Predefined slices (auth, session, parsing, file-upload, deserialization, plugin-boundary) with one-sentence invariants.

### 1.3 Integration

- New command: `CipherMate: Audit Slice` — prompts for slice (auth, session, etc.) and optional threat model.
- Pass threat model into all AI prompts; keep it under ~500 tokens.

---

## 2. Slice-Based Audits (Thin Slices)

**Article:** "Split the audit into thin slices that match real attack surfaces." Pick auth, session management, request parsing, file uploads, deserialization, sandbox boundary, plugin boundary. Ask the model to map entry points → sinks.

**Current state:** `scan_repository` runs all scanners in parallel across the whole codebase. No slice concept.

**Proposed:**

### 2.1 Slice Definitions

| Slice | Entry Points | Trust Boundary | Invariant |
|-------|--------------|----------------|-----------|
| auth | Login, token validation, session creation | Browser → server | Only admins can call X; JWT issuer must be Y |
| session | Session storage, cookie handling, CSRF | Browser → server | Session invalidated on logout; no fixation |
| parsing | Request body, query params, headers | Untrusted input → app | All untrusted input validated before use |
| file-upload | Upload handlers, temp files | User → filesystem | Paths validated; no execution of uploads |
| deserialization | JSON/YAML/XML parsers | Untrusted → object graph | No arbitrary class loading |
| plugin-boundary | Plugin loaders, sandbox | Plugin → host | Plugin cannot access host secrets |

### 2.2 Slice-Aware Scan

- Add `scanSlice(slice: SliceType, threatModel?: ThreatModel)` to agentic-core.
- For each slice: restrict file discovery to relevant paths (e.g. auth slice → `**/auth/**`, `**/login*`, `**/session*`).
- Pass only slice-relevant code + threat model to AI; avoid dumping entire repo.

### 2.3 Context Window Management

**Article:** "Models exhibit primacy/recency behavior" — relevant content at start or end performs better.

- Place **threat model + invariant** at the **start** of every prompt.
- Place **code under audit** immediately after.
- Place **verification instructions** at the **end**.
- Avoid sandwiching the "needle" in the middle of long checklists.

---

## 3. Adversarial Prompting (Prompt Injection Techniques)

**Article:** Certain prompting patterns "consistently outperform." Key techniques:

| Technique | Current CipherMate | Proposed |
|-----------|--------------------|----------|
| **Assert vulnerability exists** | "Determine if REAL or FALSE POSITIVE" | "This function has at least 2–3 security issues. Find them." |
| **Ask for exploit, not assessment** | "Is this input validation sufficient?" | "Write a proof-of-concept request that bypasses this validation." |
| **Prime as adversary** | "You are a security analyst" | "You are a red team operator paid to break this. Find real, exploitable bugs." |
| **Invert the question** | "Is this code secure?" | "How would you break this?" |
| **Assume developer mistake** | — | "Assume the developer introduced a bug. What is it?" |
| **Constrain attacker model** | — | "You are a remote unauthenticated attacker. HTTP only. No DB access." |
| **Escalate with "what else?"** | — | After first findings: "Those are obvious. What subtler issues are easy to miss?" |

### 3.1 Concrete Prompt Changes

**File:** `src/core/ai-security-analyzer.ts`

**Current (lines 106–115, 291–296):**
```
You are a security analyst. For each code snippet below, determine if it's a REAL vulnerability or FALSE POSITIVE.
Consider: Is user input involved? Is it in production code? Could it be exploited?
```

**Proposed:**
```
You are a red team operator paid to break this application. Your job is to find real, exploitable bugs.

ATTACKER MODEL: [remote-unauthenticated | remote-authenticated-low | ...]. You can only [HTTP requests | ...]. No filesystem, DB, or internal service access.

INVARIANT UNDER TEST: [e.g. "Only admins can call this endpoint" or "User input must be validated before DB query"]

For each snippet: Assume the developer made at least one mistake. Your task is to find it. If you find a potential issue, write a proof-of-concept request or payload that demonstrates the bypass. Do not say "this looks generally secure."
```

**File:** `src/dast/ai-attack-strategist.ts`

- Add optional `attackerModel` to the prompt.
- Add: "You are a red team operator. Find exploitable bugs, not theoretical concerns."

**File:** `src/ai-agent/cyber-agent-prompts.ts`

- `redteam` prompt: Strengthen with "Find real, exploitable bugs. Ask for PoC, not assessment."
- Add `audit` mode with adversarial framing and slice + threat model.

---

## 4. Slim Down SKILLs (Minimal Scaffolding)

**Article:** "Good scaffolding is a one-page threat model, a short list of crown-jewel functionalities, and a small set of invariants. Bad scaffolding is a 20-page Agent.md with every policy and style guide."

**Current state:**
- `skills/security-audit/SKILL.md`: ~250 lines, 5 phases, OWASP ASVS, CWE, STRIDE, compliance.
- `skills/pentest-strategy/SKILL.md`: ~210 lines, 4 phases, MITRE ATT&CK, detailed payload lists.
- `skills/vulnerability-analysis/SKILL.md`: ~180 lines, 6 phases, CVE research, taint, PoC.

**Proposed:**

### 4.1 Slim Core

- **security-audit**: Reduce to ~50 lines. Keep: threat model template, slice list, 3–5 invariants per slice. Move OWASP ASVS, STRIDE, compliance to `docs/reference/security-audit-checklist.md`.
- **pentest-strategy**: Reduce to ~40 lines. Keep: attacker model options, slice mapping to ATT&CK. Move payload lists to reference.
- **vulnerability-analysis**: Reduce to ~40 lines. Keep: taint flow (source→sink), PoC requirement. Move CVE research steps to reference.

### 4.2 Reference Docs

- Create `docs/reference/` for detailed checklists.
- Skills reference them: "See docs/reference/security-audit-checklist.md for full ASVS mapping."
- Load reference only when user explicitly asks for compliance mapping.

---

## 5. Verification Loop (20–30% Token Budget)

**Article:** "Do not rely on 'the model says it's vulnerable.' Use task verifiers: unit tests, integration tests, sanitizer builds, crash reproduction harnesses."

**Current state:**
- `fix-validator.ts` re-scans after fix.
- `vulnerability-analysis` skill mentions PoC builder and sandbox.
- No systematic "run this test" integration for AI findings.

**Proposed:**

### 5.1 PoC Verification

- When AI reports a vulnerability, prompt: "Write a minimal test or curl command that proves this."
- If workspace has tests: "Add a failing test that demonstrates the vulnerability."
- Run the test; if it fails (or curl returns exploitable response), boost confidence.

### 5.2 Invariant Checks

- For invariants like "auth must gate this endpoint": add grep/AST check: "Is there an auth middleware on this route?"
- Automated invariant checks as part of verification loop.

### 5.3 Token Budget Guidance

- Document in agentic-core: aim for <10% tokens on scaffolding, 60–80% on slice audit, 20–30% on verification.
- Consider separate "verification" phase that re-prompts with "Run this test. Does it confirm the vulnerability?"

---

## 6. Implementation Priority

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | Adversarial prompt changes in ai-security-analyzer.ts | Low | High |
| P0 | Add attacker model to DAST/attack-strategist prompts | Low | High |
| P1 | Threat model service + slice-based audit command | Medium | High |
| P1 | Slim security-audit, pentest-strategy, vulnerability-analysis SKILLs | Medium | Medium |
| P2 | Slice-aware file discovery (auth, session, etc.) | Medium | High |
| P2 | PoC verification loop (run test / curl) | Medium | High |
| P3 | CVE-history → threat model generation | High | Medium |
| P3 | Token budget monitoring | Low | Low |

---

## 7. OpenRouter While Fine-Tuning

When using OpenRouter (e.g. while Scripter is being fine-tuned), CipherMate automatically applies adversarial prompts to all security tasks:

- **SAST validation** (`ai-security-analyzer.ts`): Red-team system + user prompt with "assume developer made mistakes"
- **DAST strategy** (`ai-attack-strategist.ts`): Red-team system + user prompt for attack planning
- **Red team chat mode** (`cyber-agent-prompts.ts`): Adversarial framing for vulnerability hunting

Toggle with `ciphermate.ai.useAdversarialSecurityPrompts` (default: true). Set to `false` for traditional auditor-style prompts.

---

## 8. P1 Implementation (Done)

Threat model is now persisted in agent state and passed into `audit_slice`:
- `build_threat_model` stores result in `state.threatModel`
- `audit_slice` receives threat model (from param or state) and injects attacker model + highRiskOps into the audit prompt

See [THREAT_MODEL_RESEARCH_DIRECTIONS.md](./THREAT_MODEL_RESEARCH_DIRECTIONS.md) for deeper research directions (CVE-to-slice mapping, crown jewels, fix-commit bypass hunting, etc.).

---

## 9. References

- [Needle in the haystack: LLMs for vulnerability research](https://devansh.bearblog.dev/needle-in-the-haystack/) — Devansh
- [DEVANSH_METHODOLOGY_ADDITIONS.md](./DEVANSH_METHODOLOGY_ADDITIONS.md) — Modules, technologies, and workflows to add (OSV, GHSA, fuzzing, harness generation, entry-point discovery)
- [Chroma Research: Context Rot](https://www.trychroma.com/blog/context-rot) — long-context degradation
- [Lost in the Middle](https://arxiv.org/abs/2307.03172) — primacy/recency in long contexts
- [Anthropic + Mozilla Firefox](https://www.anthropic.com/news/partnering-with-mozilla) — minimal scaffolding, focused slices
