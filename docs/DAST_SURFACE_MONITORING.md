# DAST / Surface Monitoring v2

CipherMate's AI-powered **Dynamic Application Security Testing** tests your **running** web apps and APIs through simulated attacks. Replaces StackHawk and Intruder. Includes **Brutal Mode** (Inferno)—a demonic-grade scan that leaves nothing standing.

**→ For full pentest (200+ agents, Cobalt/XBOW replacement):** Use **CipherMate: Run Pentest** or see [PENTEST_PRODUCT.md](./PENTEST_PRODUCT.md)

---

## Features

### Attack Coverage
- **SQL Injection** – Error-based, union-based, time-based
- **XSS** – Reflected, DOM, encoding bypasses
- **SSRF** – Cloud metadata (AWS, GCP), internal network
- **Path Traversal** – Unix/Windows, encoding variants
- **Command Injection** – Shell metacharacters, chaining
- **XXE** – File disclosure, SSRF via XML
- **JWT/OAuth** – Algorithm confusion (alg:none), weak signing
- **GraphQL** – Introspection, injection, batching
- **IDOR** – Path parameter manipulation, horizontal access
- **Mass Assignment** – Role override, privilege escalation
- **Prototype Pollution** – `__proto__`, constructor abuse
- **SSTI** – Template injection (Jinja2, Twig, etc.)
- **CRLF Injection** – Header injection
- **HTTP Smuggling** – TE/CL desync
- **Security Headers** – HSTS, CSP, X-Frame-Options, etc.

### Performance & Reliability
- **Parallel execution** – Configurable concurrency (default 5)
- **Adaptive throttling** – Backs off on 429/503
- **Request timeout** – Configurable per-request
- **Deduplication** – Prevents duplicate findings
- **Resilience** – Retries (3x), circuit breaker on repeated 429/503

### Discovery
- **OpenAPI/Swagger** – Full spec parsing
- **Route inference** – From Express, FastAPI, Spring, etc.
- **Workspace URL scan** – .env, config, code
- **GraphQL detection** – Common paths (/graphql, /api/graphql)

### Reporting
- **SARIF 2.1.0** – GitHub Security, DefectDojo, etc.
- **Curl replay** – One command per finding
- **Executive summary** – Stakeholder-ready
- **Results Panel** – Integrated with CipherMate

---

## Usage

### Command Palette
**CipherMate: DAST / Surface Monitoring** → Enter URL

### Chat
- *"Run DAST on https://localhost:3000"*
- *"Surface monitoring for https://api.myapp.com"*
- *"Test my API"* (provide URL when prompted)

### CI/CD
```bash
# From extension (when workspace has target URL in config)
# Or use the CI integration module
```

---

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `dast.enabled` | `true` | Enable DAST |
| `dast.maxEndpoints` | `30` | Max endpoints per scan |
| `dast.enableAIAnalysis` | `true` | AI response analysis |
| `dast.concurrency` | `5` | Parallel requests |
| `dast.adaptiveThrottling` | `true` | Back off on rate limits |
| `dast.enableGraphQL` | `true` | GraphQL scans |
| `dast.enableJwtOAuth` | `true` | JWT/OAuth tests |
| `dast.enableIdor` | `true` | IDOR / access control tests |
| `dast.brutalMode` | `false` | **INFERNO**: Timing blind SQLi, header injection, NoSQL, log/JNDI, WAF-bypass payloads |
| `dast.enableContextAware` | `true` | 10x: AI fingerprints target, strategist picks attacks, adaptive payloads |
| `dast.enableDeepDive` | `true` | Spawn specialized AI agents for promising (anomalous) findings |
| `dast.ai.strategistProvider` | `openrouter` | AI for strategy (1 call). OpenRouter recommended for quality |
| `dast.ai.agentSwarmProvider` | `ollama` | AI for deep-dive agents (volume). Ollama recommended for cost |
| `dast.resilienceRetries` | `3` | HTTP retries for transient failures |
| `dast.resilienceCircuitThreshold` | `5` | Consecutive 429/503 before circuit breaker pauses |

---

## Agent Orchestrator (Bot System)

DAST runs as an **AI-powered bot system**:

1. **One strong AI call (strategist)** – OpenRouter/Claude plans attacks for this specific target
2. **Many parallel HTTP requests** – Rule-based payload execution (high concurrency)
3. **Promising findings** – Responses that look anomalous (errors, status changes, partial matches) but don't confirm vulns
4. **5–10 specialized deep-dive agents** – Spawned for promising findings, each hyper-focused:
   - **SQLi Specialist** – MySQL/Postgres-specific payloads
   - **NoSQL Specialist** – `$gt`, `$ne`, operator injection
   - **Auth Breaker** – Session fixation, weak tokens
   - **SSTI Specialist** – Jinja2, Handlebars, etc.
   - **XSS Hunter** – Encoding bypass, DOM contexts
   - **SSRF Specialist** – Cloud metadata, internal networks
   - **Injection Generalist** – Fallback for other categories

5. **Aggregated results** – Rule-based + AI-confirmed findings

**Dual AI**: Use OpenRouter for the strategist (quality) and **Ollama** for the agent swarm (volume, no per-token cost). Dedicate a separate system (e.g. Ollama on a GPU machine) for deep-dive agents.

---

## DAST War Room (Live Visual)

**Command: CipherMate: Open DAST War Room (Live View)**

A **tech hacky** localhost dashboard that shows every nook and cranny the AI dissects:

- **Live stream** – Open before/during a scan to watch in real time
- **Multi-panel layout**:
  - **Strategy & Context** – Strategist decisions, target fingerprint
  - **Attack Feed** – Every payload sent → response received
  - **Findings & Deep-Dive** – Vulns confirmed, promising findings, deep-dive agent activity
- **Timeline (screen-record style)** – Scrub through past scans like a recording
- **Session persistence** – Select any past session to replay

Opens at `http://localhost:38521` (or next available port). Keep it open in a browser tab while running DAST to see every action the AI takes.

**Screen-record videos**: Click **Record Video** to capture the War Room viewport using your browser's screen capture. Choose the War Room tab when prompted. Saves as `.webm` when you stop.

---

## Brutal API Discovery

**Command: CipherMate: Discover APIs from Website (Brutal)**

Aggressively discovers ALL APIs used by a target website:

1. Choose mode: **Standard** (~25 probes) or **Wicked** (100+ probes)
2. Enter target URL (e.g. `https://example.com`)
3. Discovery runs: fetches main page, parses HTML, fetches and scans JS files, probes paths, checks robots.txt/sitemaps
4. List of discovered APIs — select which to DAST test (multi-select) or **Test ALL**
5. Confirm and run DAST on selected APIs

**Wicked mode** probes framework escapes and dev endpoints:
- Spring Boot: `/actuator`, `/actuator/env`, `/actuator/heapdump`, etc.
- Django/Flask: `/admin`, `/__debug__`, `/debug`
- Laravel: `/telescope`, `/horizon`, `/_ignition`
- Rails: `/rails/info`, `/sidekiq`
- Node: `/debug`, `/profiler`, `/pprof`
- Cloud: `/metadata`, `/.well-known/*`
- Auth: `/oauth`, `/oidc`, `/token`, `/introspect`
- Admin: `/manage`, `/console`, `/backoffice`, `/wp-admin`
- Staging: `/staging`, `/dev`, `/test`, `/preview`

---

## Brutal Mode (Inferno)

**Command: CipherMate: DAST Brutal Mode (Inferno)**

- Timing-based blind SQL injection (SLEEP/WAITFOR)
- Header injection (X-Forwarded-For, X-Original-URL, etc.)
- NoSQL operator injection
- Log/JNDI injection (Log4j-style)
- Extended SQLi/XSS payloads (WAF bypass, polyglot)
- Zero request delay, 10 concurrent
- Authorization warning before run

**Only use on systems you own or have written authorization to test.**

---

## Plugin System

Register custom attack modules:

```typescript
import { registerPlugin } from './dast/plugin-registry';

registerPlugin({
  id: 'my-org-checks',
  name: 'Organization Custom Checks',
  description: 'Org-specific payloads',
  categories: ['sql-injection'],
  run: async (endpoint, baseUrl, auth, ctx) => {
    const results = [];
    // Custom attack logic
    return results;
  },
});
```

---

## Route Inference

Finds endpoints from code patterns:
- `app.get('/user/:id')` – Express
- `@Get('/api/users')` – NestJS, Spring
- `route('/', ...)` – Flask, etc.

---

## Export

- **SARIF** – `result.sarif` in scan output
- **Curl** – `vulnerability.curlReplay` per finding
- **Executive Summary** – `result.executiveSummary`
