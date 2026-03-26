# CipherMate “Monster” Implementation Outline

**Goal:** Integrate concepts from a production-grade, open-source agent system (skills, instincts, memory optimization, continuous learning, security scanning, research-first development, agents, hooks, commands, rules, MCP) so CipherMate becomes a **complete, competitive AI security workspace** that can go toe-to-toe with any such system.

---

## 1. Mapping Hackathon Concepts to CipherMate

| Concept | Their system | CipherMate today | Plausible addition (to compete) |
|--------|--------------|------------------|----------------------------------|
| **Skills** | Reusable skill definitions (prompts, tools, flows) | Scripter Max phases, fix strategies, playbooks | **Skill registry**: versioned, composable skills (vuln-analysis, code-fix, audit, pentest) with inputs/outputs and optional tools; load from repo (e.g. `.ciphermate/skills/`) or built-in. |
| **Instincts** | Fast, automatic behaviors (e.g. “always cite sources”) | Pre-Implementation Validator, TaskGuard, verification payloads | **Instincts layer**: small, always-on rules that run before/after AI (e.g. “always attach AGENTS.md to fix”, “always run test suite when applying fix”, “never suggest eval for user input”). Configurable on/off. |
| **Memory optimization** | Compress/summarize context; prioritize what to keep | Workspace context loader (8KB AGENTS, related files), repo index | **Context budget + priority**: max token budget per request; fill with: vulnerability snippet → strategy → AGENTS.md → related files → repo index summary. Evict by priority when over budget. Optional: persist “project security twin” (summarized posture) across sessions. |
| **Continuous learning** | Improve from feedback (fix worked / didn’t) | Iterative fix loop, adversarial verification | **Learning signals**: store (anon) fix outcome (applied / reverted / tests failed); optional telemetry to tune strategy weights or prompt variants; “project fingerprint” of past fixes to bias similar files. |
| **Security scanning** | Built-in security checks | Code/dep/secret/DAST scanners, CVE/KEV | **Unified scan pipeline**: single “Scan workspace” that runs code + deps + secrets + optional DAST; one results surface; “Review diff” and “Find similar” (pattern fix) as first-class actions. |
| **Research-first development** | Deep lookup before acting | CVE/KEV client, sub-agent CVE research, deep reports | **Research gate**: for critical/high, optionally “research first” (CVE/KEV + taint) before generating fix; show “Based on CVE-… and project context” in fix provenance. |
| **Production-ready agents** | Stable, observable, recoverable agents | Scripter Pro/Max, fix pipeline, orchestrator | **Agent lifecycle**: explicit “plan → execute → verify → report”; retries and fallbacks; provenance and citations on every output; optional MCP tools for agents. |
| **Hooks** | Lifecycle hooks (before scan, after fix) | Extension commands, applyFix flow | **Hooks API**: before_scan, after_scan, before_fix_apply, after_fix_apply, on_findings_loaded; user or workspace can register commands/scripts; enable “run linter after fix”, “notify Slack on critical”. |
| **Commands** | CLI and IDE commands | VS Code commands (scan, fix, explain) | **Command surface**: ciphermate.scan, ciphermate.fixSimilar, ciphermate.reviewDiff, ciphermate.runPlaybook, ciphermate.audit; optional CLI (npx ciphermate scan) for CI. |
| **Rules** | User/org rules that constrain behavior | AGENTS.md, TaskGuard, strategy checklists | **Rules engine**: AGENTS.md + optional `.ciphermate/rules.md`; rules injected into prompts and into TaskGuard/instincts; “never suggest X”, “always prefer Y”. |
| **MCP** | Model Context Protocol tools | (Not yet) | **MCP server**: expose read_file, grep, run_tests, get_scan_results, apply_fix as MCP tools so any MCP client (Claude Code, etc.) can drive CipherMate; same path guard and safety as internal tools. |

---

## 2. Implementation Outline (Phased)

### Phase A — Foundation (already done or in progress)

- [x] Workspace context (AGENTS.md, related files, stack) in fix pipeline  
- [x] Iterative fix loop + optional test run  
- [x] CVE/KEV client + sub-agent tools (read_file, grep) in orchestrator  
- [x] Fix provenance + adversarial verification (Max)  
- [x] Pattern-fix service (`findSamePatternInWorkspace`)  
- [x] Diff review (`reviewDiffHunks`, `parseUnifiedDiffToHunks`)  
- [x] Inline hints provider (security hints in editor)  
- [x] Remediation playbooks (`getPlaybookForVulnType`)  
- [x] Repo index (`buildRepoIndex`, `formatRepoIndexForPrompt`)  

**Remaining wiring:** Register inline hints in `extension.ts`; add commands “Find similar”, “Review diff”, “Show playbook”; optionally use repo index in audit task in orchestrator.

---

### Phase B — Skills, Instincts, Rules (compete on “how” the AI behaves)

| # | Item | Description |
|---|------|-------------|
| B1 | **Skill registry** | Define skill schema (id, name, inputSchema, outputSchema, promptTemplate, optional tools). Built-in skills: vulnerability-analysis, code-fix-ultra, security-audit, pentest-strategy. Load from `.ciphermate/skills/*.json` or `.ciphermate/skills/*.md` and merge with built-in. Scripter and fix pipeline resolve “which skill” by task/vuln type. |
| B2 | **Instincts** | Config list: e.g. `attachAgentsMd`, `runTestsAfterFix`, `neverSuggestEval`. Each instinct is a small function or rule that runs in a defined phase (before_generate, after_verify, before_apply). Implement as a pipeline of “instinct handlers” that can inject prompt text, skip steps, or set flags. |
| B3 | **Rules engine** | Parse `.ciphermate/rules.md` (and AGENTS.md); extract “do / don’t” and “always / never” lines; pass as structured block into prompts and into TaskGuard. Optional: allow rules to reference CWE/OWASP so they apply only to certain finding types. |

---

### Phase C — Memory, Learning, Research Gate (compete on “smarter” context)

| # | Item | Description |
|---|------|-------------|
| C1 | **Context budget** | Before each AI call, compute “context budget” (e.g. 32K tokens minus model reserve). Fill in order: vuln snippet, strategy, AGENTS.md, related files, repo index (truncated). If over budget, drop lowest-priority block and retry. Ensures we never silently truncate the most important part. |
| C2 | **Project security twin** | Optional persisted summary: “last scan summary”, “files with past fixes”, “stack and entry points”. Update on scan/fix; use in fix and audit to bias “we already fixed SQLi in user.ts with pattern X”. Stored in workspace state or `.ciphermate/.twin.json` (gitignored). |
| C3 | **Learning signals** | On fix apply: record outcome (applied / reverted / tests failed) and optionally vuln type + strategy id. No PII. Use for: (1) dashboard “fix success rate by strategy”, (2) optional A/B prompt variants, (3) weighting strategies by project. |
| C4 | **Research gate** | For critical/high findings, optional “research first”: run CVE/KEV + taint (or full deep analysis) before generating fix; attach “Based on CVE-… and taint path” to fix provenance and explanation. Config: `fixes.researchFirstForCritical`. |

---

### Phase D — Hooks, Commands, MCP (compete on “integrations”)

| # | Item | Description |
|---|------|-------------|
| D1 | **Hooks API** | Define hook points: `before_scan`, `after_scan`, `before_fix_apply`, `after_fix_apply`, `on_findings_loaded`. In extension, call `vscode.commands.executeCommand('ciphermate.runHook', hookName, payload)`. User config lists commands to run per hook (e.g. `after_fix_apply: ["workbench.action.terminal.runLastCommand"]`). |
| D2 | **Commands** | Register: `ciphermate.findSimilar` (pattern-fix-service + show quick pick of files), `ciphermate.reviewDiff` (get diff from SCM or active editor, run diff-review, show findings), `ciphermate.showPlaybook` (playbook for selected vuln type), `ciphermate.audit` (run audit task with repo index). |
| D3 | **MCP server** | Implement CipherMate MCP server: tools `read_file`, `grep`, `get_scan_results`, `get_fix_suggestion`, `apply_fix` (with same path guard and safety as internal). Expose via stdio or SSE; allow Claude Code or other MCP clients to drive scans and fixes from the IDE or CLI. |

---

### Phase E — Unified Scan + UX (compete on “one place for security”)

| # | Item | Description |
|---|------|-------------|
| E1 | **Unified scan** | Single entry point “Scan workspace”: run code pattern + dependency + secrets (and optionally DAST) in one go; aggregate results; single results panel with filters (by scanner, severity, file). |
| E2 | **Find similar + Review diff in UI** | In results panel: per finding, button “Find similar” (pattern-fix-service → list of files; user can open or batch-fix). Global “Review diff” (e.g. current branch vs main) → diff-review → show “Risk in diff” section. |
| E3 | **Playbook in explain flow** | When user clicks “Explain” or “Tell me more”, append the remediation playbook (if any) for that vuln type so the report includes “Steps to fix across the repo.” |

---

## 3. Plausible Additions to the CipherMate AI System (Summary)

- **Skills:** Versioned, composable security skills (analysis, fix, audit) loadable from repo + built-in; Scripter and fix pipeline use the same registry.  
- **Instincts:** Always-on, configurable micro-rules (attach AGENTS.md, run tests, never suggest eval) that run in fixed phases.  
- **Memory:** Context budget + priority so the right context is never dropped; optional “project security twin” for cross-session bias.  
- **Learning:** Anonymous fix-outcome signals to improve strategy selection and prompts over time.  
- **Research gate:** For critical/high, optional “research first” (CVE/KEV + taint) before fix.  
- **Rules:** `.ciphermate/rules.md` + AGENTS.md parsed and injected into prompts and TaskGuard.  
- **Hooks:** Lifecycle hooks (before/after scan, before/after fix) so users can plug in linters, notifications, custom checks.  
- **Commands:** Find similar, Review diff, Show playbook, Audit, plus optional CLI for CI.  
- **MCP:** CipherMate as MCP server so any MCP client can run scans and fixes with the same safety as the extension.  

Together, these make CipherMate a **single, research-first, learning-aware security agent** with skills, instincts, memory, hooks, and MCP—able to compete with a full “monster” stack while staying focused on security in the dev workspace.

---

## 4. File / Module Summary (Current + Proposed)

| Module | Purpose |
|--------|---------|
| `fix-system/pattern-fix-service.ts` | Find same vuln pattern across workspace (Phase 3). |
| `fix-system/diff-review.ts` | Review diff hunks for security patterns (Phase 3). |
| `fix-system/remediation-playbooks.ts` | Guided multi-step playbooks per vuln type (Phase 4). |
| `security/inline-hints-provider.ts` | In-editor security hints (Phase 4). |
| `engine/repo-index.ts` | Repo file list + language (+ optional summary) for audit (Phase 4). |
| **Proposed** `engine/skill-registry.ts` | Load and resolve skills (built-in + `.ciphermate/skills`). |
| **Proposed** `engine/instincts.ts` | Instinct handlers and config; run in pipeline phases. |
| **Proposed** `engine/context-budget.ts` | Token budget + priority for context assembly. |
| **Proposed** `engine/project-twin.ts` | Persist and update project security summary. |
| **Proposed** `extension/hooks.ts` | Hook points and config; dispatch to user commands. |
| **Proposed** `mcp/server.ts` | MCP server exposing read_file, grep, scan, fix (path-guard safe). |

This outline is ready for review and can be broken into tickets (e.g. “B1 Skill registry”, “D1 Hooks API”) for implementation order.
