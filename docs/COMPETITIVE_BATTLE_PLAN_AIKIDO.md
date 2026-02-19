# CipherMate vs Aikido: Competitive Battle Plan

**Positioning:** CipherMate enhances **traditional tools developers already trust** (Semgrep, Bandit, retire.js) with AI—vs Aikido's proprietary AI-built-from-scratch approach. Developers know Semgrep rules, Bandit checks, and CVE databases. We add intelligence on top; they replace the stack.

---

## Competitor Summary: Aikido

| Area | Aikido | CipherMate Today |
|------|--------|-------------------|
| **Scanner Source** | Proprietary SAST | Semgrep + Bandit + OSS scanners |
| **AI Role** | Core engine | Enhancement layer |
| **Auth** | Account required | Optional (OpenRouter free, Ollama local) |
| **Fix Flow** | One-click PR | FixService + diff preview |
| **Triage** | AutoTriage + Reachability | Severity filter only |
| **Real-time** | Scan on save/open | scanOnSave ✅ |
| **MCP** | AI coding assistant integration | Not yet |
| **IaC** | Terraform, CloudFormation | Not yet |
| **Containers** | Image scanning + AutoFix | Not yet |
| **EPSS** | CVE prioritization | CVE lookup ✅, no EPSS |
| **SBOM** | CycloneDX, SPDX | Not yet |
| **Pre-commit** | Secrets hook | Not yet |

---

## Gap Analysis: Features to Implement

### Tier 1: Must-Have to Compete (3–6 weeks)

#### 1. **AI AutoFix Polished Experience** 
*Goal: Match Aikido’s one-click fix.*

| Task | Owner | Est. | Notes |
|------|-------|------|-------|
| Inline “Fix” on each finding (Problems panel + CodeLens) | Backend | 3d | One-click trigger from diagnostic |
| Confidence score per AI fix (Low/Medium/High) | AI | 2d | Add to FixProposal, show in UI |
| “Preview before apply” – diff modal before write | UX | 2d | Improve current diff flow |
| Batch fix: “Fix all X similar issues” | Backend | 3d | Group by rule/type, single flow |
| Fallback to rule-based when AI unavailable | Backend | 1d | Already partly in rule-based-fixer |

**Current:** FixService exists; needs tighter IDE integration and UX.

---

#### 2. **AutoTriage / Noise Reduction**
*Goal: Prioritize reachable, impactful issues.*

| Task | Owner | Est. | Notes |
|------|-------|------|-------|
| **Reachability lite:** Mark findings in unused/dead code | AI/Backend | 5d | Heuristic: function never called, test-only imports |
| **Context downgrade:** Downgrade in test/mock/demo files | Backend | 2d | Path patterns: `*.test.*`, `__mocks__`, `*.spec.*` |
| **Dependency reachability:** DevDep vs Prod | Backend | 3d | Use package.json `devDependencies` for npm |
| **EPSS integration:** Fetch EPSS for CVEs, filter low-risk | Backend | 2d | NVD/Kenneth API, threshold in settings |
| **Auto-ignore UI:** “This is a false positive” → learn pattern | Backend | 2d | Store in workspace, apply to future scans |
| **Prioritization view:** “Fix these 5 first” | Frontend | 2d | AI or rule-based ranking |

**Deliverable:** Triage service that filters/downgrades findings before display.

---

#### 3. **Real-Time Inline Experience**
*Goal: Match “scan on save/open, inline in editor.”*

| Task | Owner | Est. | Notes |
|------|-------|------|-------|
| Ensure scanOnSave triggers full pipeline for saved file | Backend | 1d | Verify current wiring |
| Inline “Fix” CodeLens on each diagnostic | Backend | 2d | Trigger FixService from line |
| Quick-fix from Problems panel (Cmd+. on diagnostic) | Backend | 1d | Register `vscode.CodeActionProvider` |
| Throttle: max 1 scan per N sec on rapid save | Backend | 1d | Debounce |
| Scan on file open (first time) | Backend | 1d | `onDidOpenTextDocument` |

**Current:** scanOnSave exists; needs CodeLens + CodeActions wired.

---

### Tier 2: Differentiate (4–8 weeks)

#### 4. **Semgrep/Bandit Integration**
*Goal: Turn “trusted tools + AI” into a selling point.*

| Task | Owner | Est. | Notes |
|------|-------|------|-------|
| Show scanner source: “Semgrep rule X”, “Bandit check Y” | Frontend | 1d | Add to diagnostic/finding |
| AI explanation: “Why this Semgrep rule matters” | AI | 2d | Per rule, cache response |
| Custom Semgrep rule path in settings | Backend | 2d | `semgrep --config=/path` |
| Custom Bandit config path | Backend | 1d | `-c config.yaml` |
| “Community rule” badge vs custom | UX | 0.5d | Indicate source of rule |
| Export: “Run this Semgrep command locally” | Frontend | 1d | Copy-paste for CI |

**Message:** “Same Semgrep/Bandit you use in CI, smarter in the IDE.”

---

#### 5. **MCP Integration**
*Goal: Work inside Cursor/Copilot/other AI coding tools.*

| Task | Owner | Est. | Notes |
|------|-------|------|-------|
| MCP server: `scan_file`, `get_findings`, `apply_fix` | Backend | 5d | MCP protocol |
| Tool: “Check for security issues before suggesting code” | AI | 2d | Pre-commit style check |
| Docs: “Use CipherMate with Cursor” | Docs | 1d | Setup guide |

**Message:** “Security checks inside your AI coding assistant.”

---

#### 6. **IaC Scanning**
*Goal: Cover Terraform, CloudFormation, etc.*

| Task | Owner | Est. | Notes |
|------|-------|------|-------|
| Checkov or tfsec integration (binary/CLI) | Backend | 3d | Install, run, parse JSON |
| Terraform `.tf` scanner | Backend | 2d | Via Checkov or custom rules |
| CloudFormation / SAM support | Backend | 2d | Same toolchain |
| AI fix for IaC (e.g. add encryption) | AI | 3d | Per resource type |
| Severity mapping: Critical/High for misconfigs | Backend | 1d | Map to our severity |

---

#### 7. **Secrets Pre-Commit Hook**
*Goal: Block secrets before commit.*

| Task | Owner | Est. | Notes |
|------|-------|------|-------|
| `ciphermate install-hook` (or similar) | Backend | 2d | Writes git pre-commit hook |
| Hook runs secrets scanner on staged files | Backend | 1d | Reuse SecretsScanner |
| Clear error if secrets found | Backend | 0.5d | Exit 1, list files |
| `ciphermate skip-hook` env var for overrides | Backend | 0.5d | Emergency bypass |
| Settings: Enable/disable in extension | UX | 1d | Toggle in settings |

---

### Tier 3: Stretch (2–4 months)

#### 8. **SBOM Export**
| Task | Est. | Notes |
|------|------|-------|
| CycloneDX from dependency scan | 3d | Use existing dep scanner |
| SPDX format | 2d | Alternative format |
| Export from Results panel | 1d | Button + file save |

---

#### 9. **Safe Chain / Supply Chain**
| Task | Est. | Notes |
|------|------|-------|
| npm audit integration | 1d | Already similar |
| Check for known-malicious packages | 3d | OSV or similar |
| “New package” warning (published &lt; 24h) | 2d | npm registry API |

---

#### 10. **PR / GitHub Integration**
| Task | Est. | Notes |
|------|------|-------|
| Inline comments on PR (GitHub API) | 5d | Requires auth |
| PR gate: block merge on Critical | 3d | Branch protection rules |

---

## Implementation Roadmap

```
Phase 1: Foundation (Weeks 1–3)
├── 1.1 Inline Fix CodeLens + CodeActions
├── 1.2 AI fix confidence scores
├── 1.3 Triage v1: test file / path downgrade
└── 1.4 EPSS for CVE filtering

Phase 2: Triage & Trust (Weeks 4–6)
├── 2.1 Reachability lite (dead code, unused)
├── 2.2 DevDep vs Prod for dependencies
├── 2.3 Auto-ignore / false positive feedback
└── 2.4 “Fix these 5 first” prioritization

Phase 3: Differentiation (Weeks 7–10)
├── 3.1 Semgrep/Bandit attribution in UI
├── 3.2 AI “why this rule matters” per finding
├── 3.3 MCP server (scan, fix tools)
└── 3.4 Secrets pre-commit hook

Phase 4: Expansion (Weeks 11+)
├── 4.1 IaC scanner (Checkov/tfsec)
├── 4.2 SBOM export
├── 4.3 Safe Chain / supply chain checks
└── 4.4 PR integration (if resources allow)
```

---

## Technical Architecture Additions

### New Modules

```
src/
├── triage/
│   ├── triage-service.ts      # Main orchestrator
│   ├── reachability-lite.ts   # Dead code, test file detection
│   ├── epss-client.ts         # EPSS API for CVEs
│   └── false-positive-store.ts # Workspace-level ignore patterns
├── mcp/
│   ├── server.ts              # MCP server
│   └── tools/
│       ├── scan-file.ts
│       ├── get-findings.ts
│       └── apply-fix.ts
├── hooks/
│   └── pre-commit.ts          # Git hook installer + runner
└── iac/
    ├── checkov-scanner.ts     # Or tfsec
    └── terraform-parser.ts
```

### Config Additions (package.json)

```json
{
  "ciphermate.triage.enabled": true,
  "ciphermate.triage.downgradeTestFiles": true,
  "ciphermate.triage.epssThreshold": 0.01,
  "ciphermate.triage.devDepSeverity": "low",
  "ciphermate.semgrep.configPath": "",
  "ciphermate.bandit.configPath": "",
  "ciphermate.hooks.preCommitSecrets": false,
  "ciphermate.mcp.enabled": false
}
```

---

## Messaging: How We Win

| Aikido Says | We Say |
|-------------|--------|
| “AI-powered SAST” | “Semgrep + Bandit you trust, enhanced with AI” |
| “Proprietary rules” | “Same rules in CI and IDE” |
| “Account required” | “Works with OpenRouter free tier or local Ollama” |
| “Cloud-based” | “Runs in your environment, your keys” |
| “One platform” | “Integrates with your existing toolchain” |

**Tagline:** *“The security tools developers trust. Now 10x smarter.”*

---

## Success Metrics

| Metric | Baseline | Target (3 mo) |
|--------|----------|----------------|
| Time to first fix | ~2 min | &lt; 30 sec |
| False positive rate (user perception) | Unknown | -50% via triage |
| One-click fix success rate | ~70%? | 90%+ |
| Scan-on-save latency | Variable | &lt; 3 sec |
| MCP integrations | 0 | 1 (Cursor guide) |

---

## Next Steps (This Week)

1. **Create `src/triage/triage-service.ts`** – stub with test-file downgrade.
2. **Add CodeActionProvider** – “Fix with CipherMate” on diagnostics.
3. **Wire CodeLens** – “Fix” button on each finding line.
4. **EPSS client** – fetch EPSS for CVEs, add threshold setting.
5. **Competitive doc** – add to README: “Why CipherMate vs Aikido.”
