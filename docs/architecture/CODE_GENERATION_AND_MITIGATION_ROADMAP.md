# Code Generation and Vulnerability Mitigation — Roadmap

The core code generation and vulnerability mitigation system needs ongoing work. This document captures the current state and planned improvements.

---

## Current State

### Fix Pipeline
1. **Rule-based fixer** — Pattern-matched fixes for common vuln types (SQLi, XSS, etc.)
2. **Dependency fixer** — Version bumps for SCA findings
3. **Kode engine** (optional) — External fix engine
4. **Multi-AI pipeline** — generateFix → generateFixExpert → generateFixUltra (Pro/Max)
5. **Fix validator** — Syntax, security instincts, pre-apply checks
6. **Fix applicator** — Backup, diff preview, apply, undo

### Skills (Socratic Style)
- **code-fix-expert** — Primary fix skill; verification-first, root-cause reasoning
- **code-editing** — Minimal-change editing, data/code separation
- **code-completion** — Safe-by-construction completions
- **debugging** — Systematic root-cause debugging for vulns
- **file-creation** — Secure file creation (config, source, tests)

### Auto-Fix
- **fixes.autoFixAfterScan** — When enabled, triggers batch fix after scan completes
- User still confirms before application (safety)

---

## Planned Improvements

### 1. Code Generation Quality
- [ ] **Structured output** — JSON schema for fix proposals (reasoning, originalCode, fixedCode, verificationPayloads)
- [ ] **Multi-file coordination** — Fixes that span multiple files (e.g. add middleware + update route)
- [ ] **Project pattern learning** — Infer project conventions from codebase for consistent fixes
- [ ] **Regression test generation** — Auto-generate tests that verify the fix blocks the attack

### 2. Mitigation Pipeline
- [ ] **Fix confidence thresholds** — Auto-apply only when confidence > X; otherwise require review
- [ ] **Fix provenance** — Audit trail: which skill/strategy produced the fix
- [ ] **Adversarial verification** — "Suggest one bypass" then re-verify (Max tier)
- [ ] **Workspace test integration** — Run npm test / pytest before apply; block if tests break

### 3. Skill Integration
- [ ] **Intent threading** — Pass recognized intent (FIX_VULNERABILITIES) into Scripter Max for skill composition
- [ ] **Socratic style** — All skills use reflective, dialectic phrasing (see docs/SOCRATIC_SKILL_STYLE.md)
- [ ] **Finetuning alignment** — Skills written for model assimilation and chain-of-thought

### 4. Automatic Fixing
- [ ] **Auto-apply with confidence** — When confidence > 0.95 and user has enabled, apply without prompt
- [ ] **Batch fix prioritization** — Critical first, then high; parallel generation where safe
- [ ] **Fix rollback** — One-click undo for batch fixes

---

## References
- `docs/SOCRATIC_SKILL_STYLE.md` — Skill writing style
- `docs/architecture/SKILL_COMPOSITION_OPTION_C.md` — Skill composition layer
- `src/fix-system/` — Fix pipeline implementation
