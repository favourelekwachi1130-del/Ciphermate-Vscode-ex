# CipherMate Backend API Specification

This is what needs to be built at `api.ciphermate.ai` so users never need their own API keys.
The extension calls this endpoint. Scripter is CipherMate's primary model — always used by default.

---

## Architecture

```
Scripter (default): Extension always calls api.ciphermate.ai
        │
        ├─ With cm-xxx token (from ciphermate.ai signup/plan): premium, higher limits
        │   Authorization: Bearer cm-xxx
        │
        └─ Without token (anonymous): free tier
            X-CipherMate-Anonymous: 1
            Backend allocates minimum free tokens per session/device
        ↓
CipherMate backend:
  - Anonymous: allocate free tokens, rate limit per IP/session
  - With cm-xxx: validate token, check plan / usage quota
  - Routes to Anthropic / OpenAI / Google / etc. using CipherMate's keys
  - Returns OpenAI-compatible response
        ↓
Extension gets the response — user never sees provider keys

Other providers (openrouter, anthropic, etc.): only when user explicitly selects them.
Requires user's own API key for that provider.
```

---

## Required Endpoints

### POST /v1/chat/completions
OpenAI-compatible chat completions. Routes based on `model` field.

**Request:**
```json
{
  "model": "scripter-2x",
  "messages": [{"role": "user", "content": "..."}],
  "max_tokens": 8192,
  "temperature": 0.7
}
```

**Model routing:**
| model | routes to |
|-------|-----------|
| `scripter-1x` | claude-3-5-haiku-20241022 via Anthropic |
| `scripter-2x` | claude-3-5-haiku-20241022 via Anthropic |
| `scripter-pro` | claude-sonnet-4-20250514 via Anthropic |
| `scripter-max` | claude-opus-4-20250514 via Anthropic |
| `claude-3-5-haiku-20241022` | Anthropic direct |
| `claude-sonnet-4-20250514` | Anthropic direct |
| `gpt-4o` | OpenAI direct |
| `gpt-4o-mini` | OpenAI direct |
| `gemini-2.0-flash` | Google direct |
| `gemini-2.5-pro` | Google direct |
| `meta-llama-3.1-70b-instruct` | OpenRouter |

**Response:** Standard OpenAI chat completion format.

**Anonymous / free tier:**
- When request has `X-CipherMate-Anonymous: 1` (no Authorization header): treat as anonymous.
- Allocate a minimum free token budget per session/device (e.g. per IP or per device fingerprint).
- Deduct from free budget; when exhausted return `402` with message to sign up at ciphermate.ai.
- User signups get a fresh free token allocation; cm-xxx token unlocks premium limits.

**Error codes:**
- `401` — token invalid or expired (only when token was provided)
- `402` — no credits remaining (free tier exhausted or paid balance empty)
- `403` — model requires higher plan
- `429` — rate limited
- `500` — provider error (auto-retry in extension)

### GET /v1/models
Returns list of available models for the user's plan.

**Response:**
```json
{
  "object": "list",
  "data": [
    {"id": "scripter-2x", "object": "model", "created": 1700000000, "owned_by": "ciphermate"},
    {"id": "claude-3-5-haiku-20241022", "object": "model", ...},
    ...
  ]
}
```

### GET /v1/tokens/balance
Returns user's token balance and plan.

**Response:**
```json
{
  "available": 50000,
  "used": 1200,
  "plan": "pro",
  "reset_at": "2026-04-01T00:00:00Z"
}
```

### POST /auth/exchange/{provider}
OAuth token exchange proxy. Client secret lives here, NOT in the extension.

**Request:**
```json
{"code": "github_oauth_code", "redirect_uri": "vscode://..."}
```

**Response:**
```json
{"access_token": "...", "user": {"name": "...", "email": "..."}}
```

### POST /auth/activate
Called when user completes purchase. Issues a cm-xxx token.

**Response:**
```json
{
  "token": "cm-abc123...",
  "plan": "pro",
  "expires_at": "2027-01-01T00:00:00Z"
}
```

Triggers the VS Code deep link:
```
vscode://ciphermate.ciphermate/activate?token=cm-abc123&plan=pro
```

---

## Token Format

```
cm-<plan_id>-<user_id_hash>-<random_secret>
```

Example: `cm-pro-a3f9b2-xK9mN2pLqR8sT4vW`

- Validates quickly (signature check)
- Encodes plan tier for fast routing decisions
- Can be revoked by the backend

---

## Implementation Stack (recommended)

```
Node.js + Express OR FastAPI (Python)
  ├── JWT validation middleware (validates cm- tokens)
  ├── Rate limiting per user (Redis)
  ├── Model router (maps model IDs to provider calls)
  ├── Provider SDKs: Anthropic, OpenAI, Google, OpenRouter
  ├── Billing integration (Stripe)
  └── Usage tracking (PostgreSQL)
```

Or use **OpenRouter's Organizations** feature — provision sub-keys per user through OpenRouter's API.
This eliminates needing to manage multiple provider SDKs. One OpenRouter master account → per-user sub-keys.

---

## OpenRouter Organization Approach (fastest to ship)

OpenRouter supports creating API keys for sub-accounts:

```bash
POST https://openrouter.ai/api/v1/keys
Authorization: Bearer YOUR_MASTER_OR_KEY
Body: {"name": "user-cm-xxx", "limit": 10}  # $10 limit
```

Returns an `sk-or-v1-xxx` key. BUT — this key format is not supported by Kode 2.x --print mode.

**For Kode to work with this approach:**
Option A: Use CipherMate's endpoint as a passthrough proxy (add /v1 prefix) — but still needs `api.ciphermate.ai` to exist
Option B: Provision Anthropic sub-keys when user subscribes (Anthropic Workspaces API)

**For Kode (recommended):**
Use Anthropic Workspaces to issue `sk-ant-...` sub-keys per user.
Kode uses `provider: "anthropic"` which calls `api.anthropic.com` directly — this WORKS.
CipherMate pre-purchases Anthropic credits in bulk and issues temporary workspace keys.

---

## Kode Integration with CipherMate Backend

When CipherMate backend provisions a user, it can issue TWO credentials:

1. **`cm-xxx`** token → CipherMate API (`api.ciphermate.ai/v1`) → for the extension's AI calls
2. **`sk-ant-xxx`** Anthropic sub-key → stored in `~/.kode.json` as `provider: "anthropic"` → Kode works natively

The `syncKeyToKode()` function should be updated to use the Anthropic key when available:

```typescript
// When cm- token received, extension calls backend to get Anthropic sub-key for Kode:
POST api.ciphermate.ai/provision/kode-key
Authorization: Bearer cm-xxx
Response: { "anthropic_key": "sk-ant-...", "expires_at": "..." }
```

Then store in Kode config:
```json
{
  "provider": "anthropic",
  "modelName": "claude-3-5-haiku-20241022",
  "apiKey": "sk-ant-..."
}
```

Kode calls `api.anthropic.com` directly with CipherMate's provisioned key. No hardcoded `api.openai.com` issue.

---

## What the extension already implements

- `CiphermateApiProvider` — calls `api.ciphermate.ai/v1/chat/completions` with `cm-` token
- `MultiProviderAIService` — uses CipherMate API first when `cm-` token present
- `ScripterEngine.storeCiphermateToken()` — stores `cm-` token, syncs to Kode
- Model picker in chat — shows all CipherMate-available models (Scripter, Claude, GPT, Gemini)
- URI handler — receives `cm-xxx&plan=pro` after purchase, activates automatically
- All these work TODAY once `api.ciphermate.ai` is running

---

## What YOU (backend) need to build

1. `api.ciphermate.ai/v1/chat/completions` — OpenAI-compatible, routes by model
2. `api.ciphermate.ai/v1/models` — model list for user's plan  
3. `api.ciphermate.ai/v1/tokens/balance` — usage/credits
4. `api.ciphermate.ai/auth/exchange/{provider}` — OAuth proxy
5. `api.ciphermate.ai/auth/activate` — issues cm- token after payment
6. `api.ciphermate.ai/provision/kode-key` — issues Anthropic sub-key for Kode (optional but recommended)
7. Stripe webhook → activates user → redirects to VS Code deep link

**Estimated build time:** 2–3 days for a functional v1 using OpenRouter Organizations + a lightweight Express proxy.

---

## Scaling and self-learning

For token metering, caching, and a self-learning security model at scale, see **`ENERGY_TOKEN_AND_SERVER_SCALING.md`**. It covers: where token/energy usage comes in, how to use servers for caching and heavy workloads, and how the self-learning pipeline runs on CipherMate’s side without charging users for training.
