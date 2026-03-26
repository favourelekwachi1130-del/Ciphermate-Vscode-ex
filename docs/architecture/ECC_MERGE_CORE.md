# ECC Core Merge — 10x Code Fix Power

**Goal:** Extract the core of [Everything Claude Code (ECC)](https://github.com/affaan-m/everything-claude-code) and merge it into CipherMate so that **security-focused code fixes** are 10x more powerful than generic assistants (Codex, Copilot, plain Claude Code). We keep ECC’s best ideas and apply them **security-first** inside the find → explain → fix → verify pipeline.

**Works with CipherMate Scripter (no big-boy API keys):** All ECC merge features use the same AI path as the rest of the extension. With an active plan and CipherMate token (`cm-xxx`), the fix pipeline uses **CiphermateApiProvider** (api.ciphermate.ai); no OpenAI/Anthropic/OpenRouter keys are required. Rules injection, verify, findSimilar, reviewDiff, showPlaybook, audit, and runHook work with Scripter 2x/Pro/Max out of the box.

---

## 1. What We Pull From ECC

| ECC concept | What it does there | How we use it in CipherMate |
|-------------|--------------------|-----------------------------|
| **Rules** | rules/common/security.md + language rules; NEVER/ALWAYS, mandatory checks | **ECC rules loader**: `.ciphermate/rules.md` + bundled ECC security core injected into **every fix prompt**. TaskGuard uses same NEVER rules (eval, disable security). |
| **Security-review skill** | Checklist: secrets, SQLi, XSS, auth, CSRF, rate limit, logging | Condensed into **ECC_SECURITY_CORE** in `ecc-rules-loader.ts`; injected so every fix follows “NEVER hardcode secrets”, “ALWAYS parameterize SQL”, etc. |
| **Verification loop** | Checkpoint, verify, pass@k; run tests after changes | **ciphermate.verify** runs workspace tests (npm test / pytest / composer test) and shows result. Optional: run after fix apply (already in pipeline). |
| **Model routing** | Sonnet for 90%, Opus for complex/security-critical | Config-driven: use stronger model for critical/high or multi-file (future: `fixes.modelTier` or per-request override). |
| **Subagent / phases** | Research → Plan → Implement → Review → Verify | We already have: Impact → Generate → Pre-validate → Apply → File/Data → Final validate. ECC rules tighten each phase. |
| **Hooks** | PreToolUse, PostToolUse, SessionStart, Stop | We have **before_scan, after_scan, before_fix_apply, after_fix_apply, on_findings_loaded** + **ciphermate.runHook**. Same extensibility. |
| **Commands** | /plan, /code-review, /build-fix, /security-scan | We have **findSimilar, reviewDiff, showPlaybook, audit, verify, runHook**. Security-first surface. |
| **Memory / context** | Session persistence, strategic compact, token budget | **Context budget** (future): max tokens per fix request; fill by priority (vuln snippet → strategy → AGENTS.md → related files); drop lowest when over. |
| **Instincts** | Always-on rules (attach AGENTS.md, run tests, never eval) | TaskGuard **neverSuggest** + config **instincts.neverSuggestEval**; ECC rules loader adds project never-suggest from `.ciphermate/rules.md`. |

---

## 2. Implemented (Merged)

- **ECC rules loader** (`src/fix-system/ecc-rules-loader.ts`)
  - Loads `.ciphermate/rules.md` (project rules).
  - Bundled **ECC security core** (NEVER hardcode secrets, NEVER concat SQL, ALWAYS parameterize, etc.).
  - Returns `promptBlock` (injected into fix prompt) and `neverSuggest` (for TaskGuard).
- **Fix pipeline injection**
  - `MultiAIFixPipeline.generateFix()` prepends ECC rules block to the user prompt so every fix follows ECC + project rules.
- **Verify command**
  - **ciphermate.verify**: runs workspace tests (detect from package.json / pytest / composer), shows result in output channel. ECC-style “verify after change.”
- **Commands already present**
  - findSimilar, reviewDiff, showPlaybook, audit, runHook (see COMPETE_ECC_AI_SECURITY_NICHE.md).

---

## 3. Next (To Reach 10x)

| Item | Description |
|------|-------------|
| **Model routing** | Config or auto: use “fix model” tier (e.g. sonnet vs opus) by severity/criticality or file count. Requires provider to accept per-request model or separate “fix” model config. |
| **Context budget** | Before each AI fix call: max tokens, fill order vuln → strategy → AGENTS.md → related files → repo index; truncate from lowest priority. Prevents silent truncation of critical context. |
| **Instincts pipeline** | Formalize: attach AGENTS.md always, run tests after apply, never eval. Already partially in TaskGuard and config; add explicit “instinct” phase in fix pipeline that injects prompt snippets. |
| **Skill registry** | Load `.ciphermate/skills/*.md` and merge with built-in (vulnerability-analysis, code-fix-ultra, security-audit). Resolve “which skill” by task/vuln type; same mental model as ECC. |
| **Checkpoint** | Save “verification state” (last test result, last fix id) so user can “verify again” or “revert and retry” with one action. |
| **Project security twin** | Optional persisted summary (last scan, files with past fixes) to bias fixes: “we already fixed SQLi in user.ts with pattern X.” |

---

## 4. Why This Beats Codex / Generic Assistants

- **Codex / Copilot**: General code completion; no mandatory security rules, no fix verification, no CVE/KEV, no audit trail.
- **ECC**: General harness; security is one skill + AgentShield (config only). No app vuln scanning, no automated fix generation, no verification payloads.
- **CipherMate after ECC merge**:
  - **Every fix** gets ECC-style NEVER/ALWAYS + project rules in the prompt.
  - **TaskGuard** rejects eval, disable security, and strategy violations.
  - **Verify** command and optional post-apply test run ensure fixes don’t break tests.
  - **Find similar, review diff, playbook, audit** give a security-first command set.
  - **Hooks** let teams plug linters and notifications into the pipeline.

So we take ECC’s **structure** (rules, verification, hooks, commands) and apply it to **application security fixes** with research-grade context and provenance — making CipherMate 10x more powerful for code fixes in the security niche than Codex or raw ECC.

---

## 5. Unified fix pipeline

The same ECC rules and shared behavior are applied across **all** fix paths (CipherMate native, optional classic engine, legacy single-call) so the product behaves as one pipeline. See **`UNIFIED_PIPELINE_GLUE.md`** for the diagram, routing, and further improvements.

## 6. References (ECC + Glue)

- [Everything Claude Code (ECC)](https://github.com/affaan-m/everything-claude-code)
- [ECC security-review skill](https://github.com/affaan-m/everything-claude-code/blob/main/skills/security-review/SKILL.md)
- [ECC rules/common/security.md](https://github.com/affaan-m/everything-claude-code/blob/main/rules/common/security.md)
- [The Longform Guide (token optimization, verification, subagents)](https://github.com/affaan-m/everything-claude-code/blob/main/the-longform-guide.md)
- CipherMate: `COMPETE_ECC_AI_SECURITY_NICHE.md`, `CIPHERMATE_MONSTER_IMPLEMENTATION_OUTLINE.md`, `UNIFIED_PIPELINE_GLUE.md`
