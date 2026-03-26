# Unified Fix Pipeline — CipherMate

**Goal:** One security fix and analysis pipeline that picks the right engine and applies **shared context and rules** everywhere. Everything the user sees is **CipherMate** — best model and effort first, no external product names in the UX.

---

## 1. What Users See

- **Default:** CipherMate's native pipeline (multi-AI + ECC rules + workspace context). Best fix quality, no extra setup.
- **Scripter tiers:** 1x / 2x / Pro / Max — control AI power. Pro/Max get deep analysis and expert fixes.
- **Scripter Max mode:** Offline (built-in, recommended) | Local (Docker) | Hosted (CipherMate cloud).
- **Optional:** "Classic fix engine" in settings — advanced users only; CipherMate pipeline is recommended.

Internal implementation may use adapters or in-process engines; the product is always **CipherMate**.

---

## 2. How the Pipeline Is Wired (Internal)

| Component | Role | Where it runs |
|-----------|------|----------------|
| **Native pipeline** | Primary fix path: strategy, workspace context, ECC rules, validators. | `MultiAIFixPipeline` when `enableMultiAIPipeline` is true (default). Pro/Max → Ultra/Expert. |
| **Scripter Max** | Deep analysis + expert fix (multi-phase, sub-agents). | `ScripterRouter` → hosted engine or **in-process** (`scripter-max-inprocess`). Tasks: vulnerability-analysis, pentest-strategy, security-audit, code-fix-expert. |
| **Classic engine (optional)** | Alternative fix path when explicitly enabled in settings. | Adapter when `fixes.useKodeEngine` is true. Same ECC rules injected; falls back to native pipeline if unavailable. |
| **ECC** | Rules (NEVER/ALWAYS), verify command, findSimilar/reviewDiff/playbook/audit/runHook. | Injected into **every** fix prompt (native, classic, legacy). TaskGuard enforces never-suggest. |

**Flow (FixService.generateFix):**

1. **Classic engine path** (if explicitly enabled): adapter builds prompt with ECC rules → external binary → parse. Falls back to native if configured.
2. **Native path** (default): Pro/Max → `generateFixUltra` (workspace context + strategy + ECC) → else `generateFixExpert` (ECC) → else `generateFix` (ECC).
3. **Legacy single-call** (if native disabled): `aiService.callAI(prompt)` with ECC rules prepended.
4. **Fallbacks:** rule-based fixer → scanner fix.

---

## 3. Glue Principles

- **One set of rules everywhere:** ECC rules (and optional `.ciphermate/rules.md`) are injected into every fix prompt, regardless of path.
- **Best experience first:** Default config uses the native pipeline and built-in deep analysis; optional classic engine is for advanced use.
- **One validation story:** TaskGuard, strategy compliance, and verify command apply to all paths; provenance where the pipeline supports it (Ultra/Max).
- **CipherMate-only UX:** No external product names in settings, messages, or docs that users see. Implementation details stay in code and internal architecture docs.

---

## 4. Pipeline Diagram

```
User: "Fix this vulnerability" / "Explain" / "Deep analysis"
                    │
                    ▼
         ┌──────────────────────┐
         │  FixService / Router  │
         │  (tier, task, config) │
         └──────────┬───────────┘
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
┌─────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Classic     │ │ CipherMate      │ │ Scripter Max    │
│ (optional)  │ │ native pipeline │ │ (deep analysis  │
│             │ │ (default)       │ │  in-process or   │
│             │ │ Pro/Max → Ultra │ │  hosted)        │
└──────┬──────┘ └────────┬────────┘ └────────┬────────┘
       │                 │                   │
       │  ECC rules      │  ECC + workspace  │  Phases +
       │  in prompt      │  context +        │  sub-agents +
       │                 │  strategy         │  strategy
       ▼                 ▼                   ▼
┌─────────────────────────────────────────────────────┐
│  Shared: TaskGuard, strategy compliance, hooks,    │
│          verify, findSimilar / playbook / audit     │
└─────────────────────────────────────────────────────┘
```

---

## 5. Further Improvements

| # | Improvement | Why |
|---|-------------|-----|
| 1 | **Workspace context in classic path** | When classic engine is enabled, pass a short AGENTS.md + stack summary so fixes match project style. |
| 2 | **Unified “fix mode” preset** | Single dropdown: “CipherMate (recommended)”, “Always deep (Pro/Max)”, “Classic engine” so one choice drives tier + pipeline. |
| 3 | **Provenance on all paths** | Attach minimal provenance (source, rules) for UI and audit trail. |
| 4 | **Post-fix verify everywhere** | After apply, optionally run workspace tests for every path. |
| 5 | **Scripter Max + fix pipeline** | Expert fix on Pro/Max routes through Scripter Max with ECC + strategy in the task. |
| 6 | **Engine status in UI** | One line: e.g. “Fixes: CipherMate pipeline (Pro)” so users see the active path without internal names. |

---

## 6. Internal References (Developers Only)

- Classic engine adapter: `src/fix-system/kode-engine-adapter.ts`
- Scripter Max / in-process: `src/engine/scripter-router.ts`, `src/engine/scripter-max-inprocess.ts`
- ECC rules: `src/fix-system/ecc-rules-loader.ts`
- Historical context (ideas we built on): `docs/architecture/KODE_INTEGRATION_ARCHITECTURE.md`, `docs/architecture/BEYOND_KODE_DEERFLOW.md` — not for user-facing copy.
