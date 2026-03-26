# Heavy context & fix pipeline (internal reference)

**For developers only.** CipherMate's implementation builds on ideas from earlier work; the product is CipherMate. User-facing docs and UX do not reference external product names.

**Goal:** Code fixing, deep thinking, and **heavy context awareness** — our pipeline and workspace context make fixes and reports project-aware and best-in-class.

---

## What Kode Has That We Don’t (Yet)

| Feature | Kode | Us | Action |
|--------|------|-----|--------|
| **AGENTS.md / project instructions** | Reads from repo root, 32 KiB cap, concatenates AGENTS.md / AGENTS.override.md | Not used in fix or analysis | **Load AGENTS.md** (and overrides) and inject into system/context for fixes and deep analysis |
| **File editing in loop** | Can read → edit → read again (multi-turn with file state) | Single-shot fix generation | **Iterative fix loop**: apply fix → verify (syntax/test) → if fail, feed error back and retry (Pro/Max) |
| **Command execution** | Runs shell commands (e.g. tests, linters) | No execution | **Optional test run**: run `npm test` / `pytest` / `php -l` in workspace and pass result to verifier |
| **Project structure analysis** | Understands project layout | Only single file + regex hints | **Workspace context loader**: related files (imports, same dir), package.json/requirements.txt, .env.example |
| **Web tools** | WebSearch, WebFetch | No live data | **Real CVE/KEV lookup** (backend or trusted API) for CVE sub-agent so reports cite real CVEs |
| **Subagent system** | Delegates to subagents | We have sub-agent orchestrator | Already strong; add **tool-augmented** sub-agents (e.g. CVE sub-agent gets real NVD/KEV data) |

---

## What DeerFlow Has That We Don’t (Yet)

| Feature | DeerFlow | Us | Action |
|--------|----------|-----|--------|
| **Sandbox verification** | Runs fix in isolated container, runs tests, confirms payloads blocked | No execution; AI-only verification | **Sandbox verification service** (optional): apply fix in temp dir → run tests → run attack payloads → report pass/fail |
| **LangGraph / stateful graph** | Multi-step graph with state, branching | Linear triage → sub-agents → synthesis (optional refinement) | **Conditional steps**: e.g. if CVE sub-agent finds no CVE, add “zero-day note” in synthesis; if taint is multi-file, add “cross-file impact” step |
| **Skill-driven tools** | Skills can define tool use (e.g. read_file, run_test) | Skills are prompt text only | **Structured tools for sub-agents**: e.g. `read_file(relPath)`, `grep(pattern)` so CVE/taint agents can pull more context |
| **Streaming from sub-agents** | UI can show sub-agent output as it arrives | We stream thinking/sub-agent names | Already good; can add **streaming content** from each sub-agent (e.g. show CVE table as it’s ready) |
| **Full-repo context** | Can ingest large codebase (e.g. for audit) | We send one file + snippet | **Repo summary / index**: for audits, send file list + per-file one-liner or embeddings; for single-vuln fix, send “related files” only |

---

## What We Already Do Better

- **Vulnerability-specific strategies** (SQLi, XSS, secrets, path traversal, etc.) with do/don’t, verification payloads, and checklist — neither Kode nor DeerFlow encode this per vuln type.
- **Single pipeline in-process** — no external Kode/DeerFlow process; works with CipherMate token only; Pro/Max differentiation (2 vs 4 sub-agents, refinement pass).
- **Research-grade reports** — 2-page (Pro) / 2–4 page (Max) with CVE cross-refs, taint path, compliance mapping, refinement pass for Max.
- **Ultra fix pipeline** — strategy + enricher + generate + verify with strategy payloads; Pro/Max get this by default.
- **Explain-in-context** — “Explain this vulnerability” for Pro/Max runs full deep analysis and returns the long report.

---

## Roadmap: Heavy Context & Beyond

### Phase 1 — Heavy Context (Highest Impact)

1. **Workspace context loader**
   - **Input:** vulnerability (file, line), workspace root.
   - **Output:**
     - Full content of the vulnerable file (or large window, e.g. 200 lines around vuln).
     - **Related files:** files that import or are imported by the vulnerable file (from import/require statements); same directory up to N files; optional: callers (e.g. from simple grep for function name).
     - **Project hints:** `package.json` or `requirements.txt` or `composer.json` (first 2KB); `.env.example` if present; `AGENTS.md` / `AGENTS.override.md` (capped, e.g. 8KB) from repo root.
   - **Use:** Feed to enricher and to ultra fix pipeline so the model sees “full file + related files + project rules + stack.”

2. **AGENTS.md in prompts**
   - In fix generation (ultra/expert) and in deep analysis synthesis, prepend: “Project instructions (AGENTS.md): …” so fixes and reports align with project conventions and security rules.

3. **Enricher uses workspace context**
   - `enrichFixContext` takes optional `workspaceContext: { relatedFiles, agentsMd, packageJsonSnippet }` and merges into summary and (optionally) into a second “context block” in the ultra prompt (e.g. “Related file: foo.ts — …”).

### Phase 2 — Verification & Iteration

4. **Optional test run**
   - After generating a fix, optionally run `npm test` / `pytest` / `php -l` (detect from workspace) in the workspace (or in a copy). Pass “Test output: …” to the verifier or to a second fix attempt if tests failed.

5. **Iterative fix loop (Pro/Max)**
   - If verification fails (syntax error or “fix does not block payload”), retry once: new prompt = “Previous fix failed: … Error: … Please produce a corrected fix.” Then verify again.

6. **Strategy compliance check**
   - After fix is generated, run lightweight rule checks from `vulnerability-fix-strategies` (e.g. for SQLi: “fixedCode must contain parameter binding; must not contain string concat into SQL”). If check fails, either reject and retry or append “Strategy violation: …” to the verifier prompt.

### Phase 3 — Real Data & Tools

7. **Real CVE/KEV data**
   - Backend or trusted server that, given vuln type + stack, calls NVD/CISA KEV (or cached DB) and returns a short list of CVEs. CVE sub-agent receives this as “Known CVEs for this context: …” so the report cites real CVEs instead of hallucinated ones.

8. **Sub-agent tools (optional)**
   - Allow sub-agents to “call” tools: `read_file(relPath)`, `grep(pattern, path)`. Orchestrator runs the tool (with path guard) and appends result to that sub-agent’s context. Enables “read all files that call this function” for taint or “grep for similar patterns” for context mapper.

### Phase 4 — Sandbox & Scale

9. **Sandbox verification (optional, high effort)**
   - For Max or “verified fix” mode: apply fix in a temp copy of the repo (or container), run tests, run a small script that sends strategy payloads (e.g. SQLi payloads) and checks response. Report “Verified in sandbox” or “Sandbox: tests failed / payload not blocked.”

10. **Audit / full-repo mode**
    - For “full security audit” task: build a repo index (file list + language + one-line summary or embedding). Send to audit sub-agents in chunks (e.g. by directory or by risk bucket). Synthesis combines all. Enables “whole repo” awareness without sending entire codebase in one prompt.

---

## Implementation Order (Recommended)

| # | Feature | Effort | Impact | Notes |
|---|--------|--------|--------|-------|
| 1 | Workspace context loader (related files + AGENTS.md + package.json) | Medium | Very high | Single new module; enricher and ultra pipeline consume it. |
| 2 | AGENTS.md in fix and deep-analysis prompts | Low | High | One-line load + inject in prompts. |
| 3 | Full file or large window in getCodeContext | Low | High | Increase context lines or send full file for ultra path. |
| 4 | Iterative fix loop (one retry on verify failure) | Medium | High | Only for Pro/Max; improves fix success rate. |
| 5 | Strategy compliance check (rule-based) | Low | Medium | Use existing strategy checklist; run after generate. |
| 6 | Optional test run and pass to verifier | Medium | Medium | Detect test command; run in workspace; append output to verifier. |
| 7 | Real CVE/KEV API (backend) | Medium | High | Backend or serverless; CVE sub-agent gets real data. |
| 8 | Sub-agent tools (read_file, grep) | High | Medium | Path guard; only for Pro/Max if we add it. |

---

## Summary

- **Kode** brings AGENTS.md, file editing in a loop, and command execution; we add **workspace context (related files + AGENTS.md + stack)** and **optional iterative fix + test run** to match and exceed it in context and reliability.
- **DeerFlow** brings sandbox verification and tool-augmented agents; we add **strategy-driven verification**, **real CVE data**, and optional **sandbox** and **sub-agent tools** so deep analysis and code fixing are both more grounded and more capable.
- **Heavy context awareness** is the biggest lever: **workspace context loader + AGENTS.md + full file / related files** makes our fixes and reports project-aware and convention-aligned so that, together or alone, Kode and DeerFlow can’t measure up on code fixing, deep thinking, and context awareness.

---

## How This Improves What's on the Ground

| Addition | What the dev actually gets |
|----------|----------------------------|
| **AGENTS.md in fix prompt** | Fixes follow *this* repo's style and conventions (naming, patterns, "we use X not Y"). Fewer "correct but wrong for this project" patches; less back-and-forth. |
| **Related files (imports + same dir)** | Model sees how similar code is written nearby. It can reuse existing helpers (e.g. `utils/sanitize`) and match error-handling/validation patterns instead of inventing new ones. |
| **Stack snippet (package.json / requirements / composer)** | Framework-aware fixes: right API for parameterized queries (e.g. `?` vs `%s`), framework-native solutions (CSRF middleware, env config), and correct dependency usage. |
| **Full primary file** | Better control-flow and "where does validation already exist?" so the fix is placed correctly and doesn't duplicate logic. |
| **Pro/Max Explain to deep report** | One click on a finding yields a real report (CVE refs, taint path, attack scenario, remediation, verification) instead of a one-liner; less ad-hoc research, better prioritization. |
| **Apply fix flow** | Generate, confirm, syntax/pre-apply validation, then apply in editor. Fix lands in the workspace with guardrails. |

Net effect: **fixes that fit the codebase and stack**, **explanations that are actionable**, and **one-click apply** with validation.

---

## Additions That Exponentially Improve It as a Dev Workspace Tool

Beyond "security scanner," these turn CipherMate into a **workspace tool** that multiplies developer effectiveness:

| Lever | What it does | Why it's exponential |
|-------|----------------|------------------------|
| **Iterative fix loop** | On verification failure, retry once with "Previous fix failed: ..." so the model self-corrects. | Fewer "fix didn't work" moments; higher trust in "Apply fix." |
| **Optional test run** | After generating a fix, run `npm test` / `pytest` / `php -l` and pass result to verifier or a retry. | Fixes that don't break tests; fits into existing CI/dev flow. |
| **Fix application in-editor** | Already have apply; add **diff preview** before apply and **undo** (backup) so devs can safely try. | Lower friction; more "Apply" usage and adoption. |
| **Project-wide pattern fix** | "We fixed SQLi in `user.ts`; here are 3 other files with the same pattern." List or batch-fix. | One finding becomes a pattern fix across the repo. |
| **Real CVE/KEV data** | CVE sub-agent gets NVD/CISA KEV (or backend) so reports cite real CVEs and priority. | Prioritization becomes data-driven; reports are citation-ready. |
| **Sub-agent tools** | `read_file(relPath)`, `grep(pattern)` with path guard so taint/context agents pull more context on demand. | Deeper analysis and fixes without pre-loading the whole repo. |
| **PR / diff integration** | "Review this PR for new vulnerabilities" or "these lines introduced risk." | Fits into code-review workflow; security at merge time. |
| **Inline, non-blocking hints** | While coding: subtle cues ("unvalidated input; consider parameterized query") without blocking. | Pair-programmer feel; security guidance in the flow. |
| **Remediation playbooks** | For recurring vuln types: "Step 1: add helper in X; Step 2: replace in Y, Z." Guided multi-file fix. | Repeatable, consistent fixes across the codebase. |
| **Repo index for audits** | File list plus per-file summary or embeddings for "full security audit" task. | Whole-repo awareness without sending the entire codebase in one shot. |

**Suggested order for max impact:** (1) Iterative fix loop + optional test run, (2) Real CVE/KEV + sub-agent tools, (3) Pattern fix + PR/diff integration, (4) Inline hints + playbooks + repo index.
