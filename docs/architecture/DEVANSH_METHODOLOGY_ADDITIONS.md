# Devansh Methodology — Modules & Technologies to Add to CipherMate

Based on [Devansh's article](https://devansh.bearblog.dev/needle-in-the-haystack/) (your teaching assistant's work) and its methodology for finding 30+ CVEs. This document maps **specific modules, technologies, and workflows** from the article to concrete additions for CipherMate's core system.

---

## 1. Modules & Technologies Referenced in the Article

### 1.1 Explicitly Mentioned (Future Posts Teaser)

> "AI-powered differential and grammar-based fuzzing, automated harness generation, and related workflows."

| Technology | Article Role | CipherMate Status | Proposed Addition |
|------------|--------------|-------------------|-------------------|
| **AI-powered differential fuzzing** | Compare behavior before/after code changes to find regressions | Not present | `src/fuzzing/differential-fuzzer.ts` — run fuzzer on two code versions, diff crashes |
| **Grammar-based fuzzing** | Generate valid-but-malicious inputs from grammar (e.g. SQL, JWT, HTTP) | Not present | `src/fuzzing/grammar-fuzzer.ts` — grammar rules for SQL, JSON, JWT, HTTP; LLM-augmented mutations |
| **Automated harness generation** | Generate minimal repro for crash/vuln | Not present | `src/fuzzing/harness-generator.ts` — given vuln + code, emit test/curl that proves it |

### 1.2 CVE & Advisory Sources (Article Workflow)

| Source | Article Use | CipherMate Status | Gap |
|--------|--------------|-------------------|-----|
| **NVD** | CVE lookup | ✅ `cve-lookup-service.ts` | Used for enriching findings, not for project CVE history |
| **MITRE CVE** | CVE lookup | ✅ `cve-lookup-service.ts` | Same |
| **CISA KEV** | Actively exploited | ✅ `cve-kev-client.ts` | Used for vuln-type correlation; not for repo CVE history |
| **GHSA** | Project advisories | ❌ Not integrated | **Add:** Query GHSA by repo (e.g. `parse-community/parse-server`) for prior CVEs |
| **OSV.dev** | Package + ecosystem advisories | ❌ Not integrated | **Add:** OSV API for `package@version` and for ecosystem (e.g. Go, npm) advisories |
| **Project security advisories** | Prior CVEs for threat model | ❌ Not automated | **Add:** Scrape or API for GitHub Security tab, npm advisories |

### 1.3 Entry-Point & Trust-Boundary Discovery

Article: *"Identify entry points: HTTP routes, RPC handlers, message consumers, CLI entrypoints, scheduled jobs. Identify trust boundaries: browser to server, service to service, plugin to host."*

| Concept | CipherMate Status | Proposed Addition |
|---------|-------------------|-------------------|
| **HTTP routes** | DAST discovers URLs at runtime; no static extraction | `src/core/entry-point-discovery.ts` — AST/grep for Express, Fastify, Hono, Elysia, Django routes |
| **RPC handlers** | Not present | gRPC, tRPC, JSON-RPC handler discovery |
| **Message consumers** | Not present | Kafka, RabbitMQ, SQS consumer discovery |
| **CLI entrypoints** | Not present | `bin/`, `cli`, `main` discovery |
| **Scheduled jobs** | Not present | cron, node-schedule, celery beat patterns |
| **Trust boundaries** | Not modeled | Map: browser→API, API→DB, plugin→host from architecture |

---

## 2. Workflows to Implement

### 2.1 CVE History → Threat Model (Article Core)

**Article:** *"Look for previously disclosed CVEs in that project. Feed those CVE descriptions to the LLM and ask it to generate a threat model for plausible bug classes."*

**Current:** We have CVE lookup for enriching findings. We do NOT query CVEs for the **current project/repo** to build a threat model.

**Add: `src/core/threat-model-from-cve.ts`**

```typescript
// Pseudocode
async function buildThreatModelFromProjectCves(workspaceRoot: string): Promise<ThreatModel> {
  const pkg = await getPackageInfo(workspaceRoot);  // npm, pip, etc.
  const repo = await getGitRemote(workspaceRoot);    // e.g. parse-community/parse-server
  
  // 1. Query OSV for ecosystem advisories
  const osvAdvisories = await queryOSV(pkg.name, pkg.version);
  
  // 2. Query GHSA for repo (if GitHub)
  const ghsaAdvisories = repo ? await queryGHSA(repo) : [];
  
  // 3. Combine CVE descriptions
  const cveDescriptions = [...osvAdvisories, ...ghsaAdvisories]
    .map(a => a.summary || a.description)
    .filter(Boolean);
  
  // 4. LLM: generate threat model from descriptions
  const threatModel = await llmGenerateThreatModel(cveDescriptions);
  
  return threatModel;
}
```

**APIs to integrate:**
- **OSV.dev**: `POST https://api.osv.dev/v1/query` — query by package, version, ecosystem
- **GHSA**: `https://api.github.com/repos/{owner}/{repo}/advisories` (GraphQL) or scrape Security tab

---

### 2.2 Commit-Based Bypass Hunting

**Article:** *"Look for the commit that fixed these vulnerabilities and try to find bypasses for that."*

**Current:** No commit analysis for security fixes.

**Add: `src/core/commit-bypass-hunter.ts`**

```typescript
// Given CVE ID or advisory, find the fix commit
async function findFixCommit(repo: string, cveId: string): Promise<string | null> {
  // Search commit messages, PR descriptions for CVE-XXXX
  // Return commit SHA
}

// Given fix commit, ask LLM to find bypasses
async function huntBypasses(commitSha: string, diff: string): Promise<BypassCandidate[]> {
  const prompt = `This commit fixed a vulnerability. Analyze the patch. 
  What assumptions does the fix make? Can an attacker bypass it?
  ATTACKER MODEL: remote unauthenticated.`;
  // ...
}
```

**Integration:** Git blame, `git log -S "CVE-"`, GitHub API for PR/commit search.

---

### 2.3 "What Else?" Escalation Loop

**Article:** *"After the LLM gives you its first round of findings, push back with 'those are the obvious ones. What are the subtler issues?'"*

**Current:** Single-shot prompts. No follow-up escalation.

**Add to agentic-core / chat flow:**

```typescript
// After first round of findings
const escalationPrompt = `Those are the obvious ones. What subtler issues are easy to miss?
Set aside everything related to [already-found bug class]. What other classes exist here?`;
// 2-3 rounds before signal degrades
```

**Add:** `ciphermate.ai.escalationRounds` (default: 2) — number of "what else?" follow-ups per slice.

---

### 2.4 Run Local Instance + Write Tests (Verification)

**Article:** *"Instruct Codex to run a local instance after building the source or write tests that prove the existence of vulnerabilities. Most of the time it works."*

**Current:** `fix-validator` re-scans; `workspace-test-runner` exists. No "run app + curl" or "write failing test" loop.

**Add: `src/verification/exploit-verifier.ts`**

```typescript
// When AI reports vuln with PoC
async function verifyExploit(vuln: Finding, poc: string): Promise<VerificationResult> {
  // 1. If poc is curl: run it against localhost (user must start app)
  // 2. If poc is test: add to test file, run npm test / pytest
  // 3. If exploit succeeds: boost confidence
  // 4. If fails: mark as unverified or ask for refined PoC
}
```

**Integration:** `workspace-test-runner` + optional `npm run dev` / `pytest` in background.

---

## 3. Slice-Specific Patterns (From Case Studies)

Devansh's case studies suggest **framework-specific slices** we can add as templates:

| Project | Slice | Pattern | CipherMate Addition |
|---------|-------|---------|---------------------|
| **Parse Server** | `readOnlyMasterKey` vs `master` | `isMaster` checked but `isReadOnly` not | Slice: "authz-boundary" — grep for handlers with `isMaster` but not `isReadOnly` |
| **HonoJS** | JWT/JWKS | Algorithm fallback, `alg` from token | Slice: "jwt-algorithm" — grep for `alg`, `header.alg`, HS256 fallback |
| **ElysiaJS** | Cookie signing | `decoded` init, secrets rotation | Slice: "cookie-signature" — grep for `decoded`, `verify`, rotation logic |
| **harden-runner** | Syscall coverage | UDP send* not hooked | Slice: "syscall-coverage" — compare syscall list to network egress |
| **BullFrog** | DNS parsing | First message only in TCP segment | Slice: "dns-parsing" — protocol parsing edge cases |
| **Better-Hub** | Markdown rendering | XSS in user content | Slice: "markdown-render" — sanitization before render |

**Add:** `src/core/slice-templates.ts` — predefined slice definitions with regex/AST patterns per framework.

---

## 4. API Integrations to Add

| API | Purpose | Endpoint |
|-----|---------|----------|
| **OSV.dev** | Package + ecosystem advisories | `POST https://api.osv.dev/v1/query` |
| **GHSA (GraphQL)** | Repo security advisories | `https://api.github.com/graphql` |
| **GitHub API** | Commit/PR search for CVE IDs | `GET /repos/{owner}/{repo}/commits` |
| **NPM Advisory** | `npm audit` data, GHSA for npm | `https://registry.npmjs.org/-/npm/v1/security/advisories` |

---

## 5. Implementation Roadmap

| Priority | Module | Effort | Impact | Status |
|----------|--------|--------|--------|--------|
| **P1** | `threat-model-from-cve.ts` — OSV + GHSA → threat model | Medium | High | ✅ Done |
| **P1** | `entry-point-discovery.ts` — HTTP routes, CLI, jobs | Medium | High | ✅ Done |
| **P1** | "What else?" escalation in prompts | Low | Medium | ✅ Done |
| **P2** | `commit-bypass-hunter.ts` — fix commit → bypass hunt | Medium | High | ✅ Done |
| **P2** | `exploit-verifier.ts` — run PoC / write test | Medium | High | ✅ Done |
| **P2** | `slice-templates.ts` — framework-specific slices | Low | Medium | ✅ Done |
| **P3** | `grammar-fuzzer.ts` — SQL, JWT, JSON grammars | High | High | ✅ Done |
| **P3** | `harness-generator.ts` — auto test from vuln | High | High | ✅ Done |
| **P3** | `differential-fuzzer.ts` — before/after diff | High | Medium | ✅ Done |

---

## 6. Tool Learning Integration

New tools (threat model, audit slice, CVE history) must be added to:

1. **Tool Registry** (`src/ai-agent/tool-registry.ts`) — `whenToUse`, `userExamples`, `prerequisites`
2. **Tool-Calling Training Data** (`training_data/tool_calling_samples.jsonl`) — user message → tool call samples
3. **Intent Recognizer** (`src/ai-agent/intent-recognizer.ts`) — new intents like `AUDIT_SLICE`, `BUILD_THREAT_MODEL`

This ensures the model learns to invoke each new capability when the user asks for it.

---

## 7. References

- [Needle in the haystack](https://devansh.bearblog.dev/needle-in-the-haystack/) — Devansh
- [OSV API](https://google.github.io/osv.dev/api/)
- [GitHub GraphQL (advisories)](https://docs.github.com/en/graphql/reference/objects#securityadvisory)
- [Context Rot](https://research.trychroma.com/context-rot)
- [Lost in the Middle](https://arxiv.org/abs/2307.03172)
