# Energy, Token Usage, and Server Scaling

**Goal:** As CipherMate deploys to more users and the security model becomes self-learning and more capable, align **token/energy usage** with **server utilization** so scale feels like mainstream products: fast, reliable, predictable cost, and improving quality over time without burning users’ balance on learning.

---

## 1. Where Token Usage Comes In

| Layer | What consumes tokens / energy | Who pays | How it shows up |
|-------|-------------------------------|----------|------------------|
| **User-facing inference** | Every AI call: chat, fix generation, deep analysis, explain. | User (via plan / token balance) | `usage.prompt_tokens` + `usage.completion_tokens` from provider; backend deducts from balance. |
| **Backend proxy** | Same call: backend receives request, calls provider, returns response. | CipherMate (provider cost) → recovered via plan pricing | Backend tracks cost per user for margin; user sees “tokens used” not raw $ cost. |
| **Self-learning pipeline** | Feedback (fix applied / reverted, tests passed), evals, optional fine-tuning or cache updates. | CipherMate (R&D) or allocated from a “learning” budget | Not deducted from user balance; runs on server-side batch jobs. |
| **Cache hits** | Repeated or similar prompts (e.g. same vuln type + language): serve from cache instead of live model. | Lower token cost for user and backend | Backend returns cached response; user’s balance either not charged or charged at cache rate. |

So **energy/token usage** enters in three ways:

1. **Metering (user)** — Each user-facing AI request consumes tokens; backend deducts from `available` and updates `used` so the product is sustainable and predictable for users.
2. **Cost (CipherMate)** — Backend pays providers; plan pricing and tier multipliers (1x/2x/Pro/Max) are set so token consumption maps to revenue.
3. **Self-learning** — Runs on **servers** as a separate pipeline (feedback ingestion, evals, model/cache updates). It makes the model “more powerful” without charging users for that training; only their normal usage is metered.

---

## 2. Self-Learning and Tokens

When the CipherMate security model becomes self-learning:

- **Inputs:** Fix outcomes (applied / reverted, tests passed/failed), severity, vuln type, strategy used. Optionally: user feedback, A/B comparison.
- **Where it runs:** Server-side only. Batch jobs or async workers that aggregate feedback, run evals, update caches or (later) fine-tune / distill models. No user device runs training.
- **Token impact:**  
  - **Evals / research:** Consume tokens on CipherMate’s account (not user balance).  
  - **Cache:** Learning “good” fix patterns lets the backend serve more from cache → **fewer** tokens per user request over time.  
  - **Better routing:** Smarter model selection (e.g. when to use Pro vs Max) reduces over-use of expensive models → **lower** effective token burn per task.

So self-learning can **reduce** per-user token usage and **improve** quality while the “learning” token cost stays on CipherMate’s side.

---

## 3. Utilizing Servers for a Pleasurable, Scalable Experience

To scale like mainstream (Cursor, Copilot, etc.) and keep the experience good:

| Lever | What servers do | Benefit |
|-------|------------------|--------|
| **Single API (api.ciphermate.ai)** | All AI traffic goes through CipherMate. Backend routes to provider, applies quota, rate limit, and plan. | One place to meter, cache, and improve; users don’t manage keys. |
| **Token balance and metering** | Backend deducts after each request (or reserves then settles). Extension can show “X tokens left” and call `GET /v1/tokens/balance`. | Predictable usage; no surprise “out of credits” mid-session. |
| **Response caching** | For repeated or near-duplicate requests (e.g. same vuln + file hash, or same “explain” query), return cached result. Cache key = hash(prompt + model + context signature). | Lower latency and fewer tokens; scales better. |
| **Heavy work on server** | Scripter Max (deep analysis, multi-phase) can run on CipherMate-hosted workers instead of only in the client. Client sends task, server runs pipeline, streams or returns result. | Consistent latency, no user machine load; easier to scale by adding workers. |
| **Model routing on server** | Backend chooses model by task + plan (e.g. “fix” → Pro, “explain” → 2x). Optionally use a small “router” model to decide. | Right model per task → better quality and token efficiency. |
| **Self-learning on server** | Feedback pipeline and evals run in background jobs; cache and routing rules updated periodically. | Model gets better without user-facing token cost or device load. |
| **Edge / region** | Optional: put API and cache at the edge so latency is low globally. | Pleasurable experience for all regions. |

So **servers** are used to: (1) centralize and meter tokens, (2) cache and route to cut cost and latency, (3) run heavy and self-learning workloads off the user’s device.

---

## 4. End-to-End Flow (Scale + Self-Learning)

```
User action (fix, explain, chat)
        │
        ▼
Extension → api.ciphermate.ai (Bearer cm-xxx)
        │
        ▼
Backend: validate token, check balance, rate limit
        │
        ├─ Cache hit? ──────────────────► return cached response (low/zero token deduct)
        │
        └─ Cache miss
                │
                ▼
        Route to provider (Anthropic/OpenAI/…), get response + usage
                │
                ▼
        Deduct tokens from user balance (prompt_tokens + completion_tokens × tier multiplier)
        Optionally: store (anonymized) request/response for cache + learning
                │
                ▼
        Return response to extension
                │
                ▼
        (Async) If fix applied: send feedback event to backend → self-learning pipeline
```

**Self-learning loop (server-only):**

- Ingest feedback (e.g. “fix applied”, “tests passed”, vuln type, strategy).
- Periodically: run evals (synthetic or sampled), update cache keys or routing rules, optionally retrain/distill.
- New model/cache/routing goes live; next user request benefits without extra charge for “training”.

---

## 5. What to Implement (Backend + Extension)

| Component | Responsibility |
|-----------|-----------------|
| **Backend: usage and balance** | On each `/v1/chat/completions`, get `usage` from provider; deduct from user’s token balance (or reserve then settle). Return `usage` in response so extension can show “N tokens used” if desired. Expose `GET /v1/tokens/balance` (already in spec). |
| **Backend: response cache** | Before calling provider, check cache (e.g. key = hash(model, messages, max_tokens)). On miss, call provider, store result with TTL; on hit, return cached and deduct little or no tokens. |
| **Backend: self-learning ingestion** | Endpoint or queue: accept feedback events (fix_id, outcome, vuln_type, strategy). Store for batch jobs; do not charge user. |
| **Extension: report usage in UI** | If backend returns `usage`, show “Used X tokens” per request or in status bar; refresh balance from `GET /v1/tokens/balance` after heavy operations. |
| **Extension: optional feedback** | When user applies a fix (or reverts), send a lightweight event to backend (fix_id, outcome) so the self-learning pipeline can aggregate. |

---

## 6. Summary

- **Energy/token usage** shows up as: (1) **user-facing inference** (metered, deducted from balance), (2) **backend cost** (provider bills CipherMate; covered by plan pricing), (3) **self-learning** (server-side only, not charged to user), (4) **cache** (reduces tokens and latency).
- **Servers** are used to: centralize API and metering, cache responses, run heavy Scripter Max / deep analysis, and run the self-learning pipeline. That keeps the client light and makes scaling about adding server capacity and cache.
- **Pleasurable at scale** comes from: visible token balance, fast responses (caching + routing), reliable backend (rate limit, retries), and a model that gets better over time without users “paying” for the learning. All of that is enabled by routing traffic and learning through **CipherMate’s servers** and a clear **token/energy** story.

Existing pieces: `CIPHERMATE_BACKEND_API_SPEC.md` (token balance, 402, model routing), `ScripterTokenManager`, `CiphermateApiProvider`. The next step is backend implementation of deduction + cache + feedback ingestion, and extension wiring to show usage and send feedback where appropriate.
