# Threat Modeling — Research Directions Beyond P1/P2/P3

Research-oriented improvements to make CipherMate's threat modeling more robust, precise, and aligned with academic and industry best practices.

---

## P1 Implemented (Done)

- [x] Persist threat model in agent state after `build_threat_model`
- [x] Pass threat model into `audit_slice` (from state or param)
- [x] Include attacker model + highRiskOps in audit prompt

## P2 Implemented (Done)

- [x] CVE-to-slice mapping: keyword-based mapping from CVE descriptions to slice IDs
- [x] `suggestedSlice` and `slicePriority` in build_threat_model result
- [x] Summary shows "Audit `jwt-algorithm` first" when CVEs match

## P3 Implemented (Done)

- [x] `threat-model.json` schema (see THREAT_MODEL_SCHEMA.md)
- [x] Load from `threat-model.json` or `.ciphermate/threat-model.json` when present
- [x] Merge file model with CVE-derived (file overrides)
- [x] **CipherMate: Save Threat Model to File** command
- [x] `audit_slice` falls back to file model when no in-memory model

## Additional Implemented (Session)

- [x] **#9 "What else?" escalation** — Say "what else?" after audit to find subtler issues
- [x] **#3 Crown jewels** — `crownJewels` in threat-model.json → injected into audit prompt
- [x] **#11 Architecture-inferred TM** — When no CVEs, infer from entry-point discovery
- [x] **#1 Staleness & drift** — Workspace fingerprint; warn when changed since threat model built
- [x] **npm audit** — Dependency scanner runs `npm audit` first for fresher npm data

---

## Deeper Research Directions

### 1. Threat Model Staleness & Drift

**Problem:** When the codebase changes (new commits, dependency updates), the CVE-derived threat model becomes stale. Audits may miss new entry points or over-focus on old risks.

**Research direction:**
- **Workspace fingerprint:** Hash `package.json` + `requirements.txt` + git HEAD. Rebuild threat model when fingerprint changes.
- **Staleness threshold:** If `threatModel.generatedAt` > 24h or N commits ago, prompt: "Threat model may be stale. Rebuild?"
- **Incremental updates:** When new CVE is disclosed for a dependency, merge into existing threat model without full rebuild.

**References:** Configuration drift (Nix, Ansible); semantic versioning for threat models.

---

### 2. CVE-to-Slice Mapping (Automated Slice Prioritization)

**Problem:** User runs `build_threat_model` then must manually choose which slice to audit. CVEs often map to specific bug classes.

**Research direction:**
- **Semantic mapping:** CVE descriptions → slice IDs. E.g. "JWT algorithm confusion" → `jwt-algorithm`; "SQL injection" → `sql-injection`.
- **Slice priority score:** `score(slice) = Σ relevance(cve, slice)` over prior CVEs.
- **Suggested next slice:** After `build_threat_model`, return `suggestedSlice: "jwt-algorithm"` with reasoning.

**References:** CVE-to-CWE mapping (MITRE); bug class taxonomies.

---

### 3. Crown-Jewel Identification

**Problem:** Threat models list entry points and high-risk ops but not *what we're protecting*. Audits are undirected.

**Research direction:**
- **User-specified crown jewels:** "Our crown jewels: payment API, user PII, admin keys."
- **Inferred from code:** Secrets, `process.env`, DB connection strings, payment-related routes.
- **Audit focus:** Weight findings by proximity to crown jewels. "Finding in `/api/payment` is critical; finding in `/health` is low."

**References:** Crown-jewel analysis (DoD); asset-centric threat modeling.

---

### 4. Threat Model Provenance & Explainability

**Problem:** User sees `highRiskOps: ["deserialization", "authz"]` but doesn't know *why*. Trust is low.

**Research direction:**
- **Provenance:** `highRiskOps: [{ op: "deserialization", source: "CVE-2024-1234", confidence: 0.9 }]`
- **CVE attribution:** "This high-risk op came from CVE-2024-1234 (Parse Server YAML deserialization)."
- **Confidence scoring:** Generic fallback = 0.3; 3+ CVEs mention it = 0.9.

**References:** Provenance (W3C PROV); explainable AI (XAI).

---

### 5. Differential Threat Modeling (PR/Commit Scope)

**Problem:** Full threat model is expensive. For a small PR, we only care about *new* threats.

**Research direction:**
- **Diff-aware threat model:** Given `git diff`, identify new entry points, new trust boundaries, new high-risk ops.
- **Scope to changed files:** "This PR adds `POST /api/webhook`. New threat: SSRF if webhook URL is user-controlled."
- **CI integration:** Run differential threat model on every PR; block if new critical entry point without review.

**References:** Differential testing; semantic diff.

---

### 6. CVE Fix Commit Analysis (Bypass Hunting)

**Problem:** Devansh's article: "Look for the commit that fixed the vulnerability and try to find bypasses."

**Research direction:**
- **Fix commit discovery:** Given CVE ID, search commit messages / PR descriptions for "CVE-XXXX" or "fixes #issue".
- **Patch analysis:** Feed diff to LLM: "What assumptions does this fix make? Can an attacker bypass it?"
- **Bypass candidates:** Output: `{ assumption: "checks Content-Type", bypass: "double Content-Type header" }`.

**References:** Devansh methodology; patch analysis (e.g. VulnLoc).

---

### 7. Threat Model as Code (Version-Controlled)

**Problem:** Threat model lives in memory. Lost on restart. Not reviewable.

**Research direction:**
- **`threat-model.yaml` in repo:** User or tool writes threat model to file. Version controlled.
- **CI integration:** `ciphermate validate threat-model` — check consistency with code (e.g. entry points still exist).
- **Merge strategy:** `build_threat_model` outputs diff; user approves before merge.

**References:** Infrastructure as Code; Open Threat Model format.

---

### 8. Multi-Project / Monorepo Threat Models

**Problem:** Monorepo has `packages/auth`, `packages/api`, `packages/admin`. Each has different CVE history.

**Research direction:**
- **Per-package threat models:** `threatModel["packages/auth"]`, `threatModel["packages/api"]`.
- **Aggregation:** Union of entry points; intersection of trust boundaries.
- **Slice routing:** "Audit auth slice" → use `packages/auth` threat model.

**References:** Monorepo tooling (Nx, Turborepo).

---

### 9. Adversarial Refinement Loop ("What Else?")

**Problem:** Single-shot audit. Model gives obvious findings first; subtler issues require prompting.

**Research direction:**
- **Escalation prompt:** After first findings: "Those are the obvious ones. What subtler issues are easy to miss? Assume the developer introduced a bug."
- **Iterative deepening:** Up to N rounds; stop when no new findings.
- **Integrate into chat:** User says "what else?" → trigger escalation.

**References:** Devansh article; red-team escalation.

---

### 10. STRIDE / OWASP Alignment

**Problem:** Threat model is free-form. Compliance and reporting need standard taxonomies.

**Research direction:**
- **STRIDE mapping:** Map `highRiskOps` to Spoofing, Tampering, Repudiation, Info Disclosure, DoS, Elevation of Privilege.
- **OWASP Top 10:** Map findings to A01 (Broken Access Control), A03 (Injection), etc.
- **Compliance report:** "This audit covers STRIDE categories S, T, E; OWASP A01, A03, A07."

**References:** STRIDE (Microsoft); OWASP Top 10.

---

### 11. Architecture-Inferred Threat Model (No CVEs)

**Problem:** New project has no CVE history. Fallback is generic.

**Research direction:**
- **Static inference:** From `docker-compose`, K8s manifests, API routes → infer microservices, message queues, DB boundaries.
- **Framework defaults:** "Express + JWT" → default threat model: authz-boundary, jwt-algorithm.
- **Template library:** Pre-built threat models for "REST API", "GraphQL", "CLI tool".

**References:** Architecture recovery; pattern-based threat modeling.

---

### 12. Human-in-the-Loop Editing

**Problem:** LLM-generated threat model may be wrong or incomplete. User has domain knowledge.

**Research direction:**
- **Editable threat model UI:** Show threat model in chat or panel; user can add/remove entry points, high-risk ops, invariants.
- **Merge with CVE-derived:** User edits are preserved; CVE-derived fields are merged.
- **Invariants:** User adds "Only admins can call DELETE /users". Audit checks for violations.

**References:** Human-AI collaboration; interactive machine learning.

---

## Summary Table

| Direction | Effort | Impact | Novelty |
|-----------|--------|--------|---------|
| Staleness / drift | Low | Medium | Standard |
| CVE-to-slice mapping | Medium | High | Novel |
| Crown-jewel identification | Medium | High | Known |
| Provenance / explainability | Low | Medium | Novel for TM |
| Differential TM | Medium | High | Novel |
| Fix commit bypass hunting | High | High | Devansh |
| Threat model as code | Medium | Medium | Known |
| Monorepo / multi-package | High | Medium | Niche |
| "What else?" escalation | Low | Medium | Devansh |
| STRIDE/OWASP alignment | Low | Medium | Standard |
| Architecture-inferred TM | High | High | Novel |
| Human-in-the-loop editing | Medium | High | Known |

---

## Suggested Implementation Order

1. **CVE-to-slice mapping** — High impact, enables "audit the most relevant slice first"
2. **"What else?" escalation** — Low effort, aligns with Devansh
3. **Threat model as code** — Enables persistence and CI
4. **Crown-jewel identification** — Focuses audits
5. **Fix commit bypass hunting** — Differentiator, research-worthy
