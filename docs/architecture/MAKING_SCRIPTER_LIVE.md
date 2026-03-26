# Making Scripter Live and Callable

How to deploy `api.ciphermate.ai` so the extension can reach Scripter with no user API keys.

---

## Options (fastest → full control)

| Option | Effort | Cost | Best for |
|--------|--------|------|----------|
| **A. OpenRouter proxy** | 1–2 days | Pay OpenRouter per token | Fastest to ship |
| **B. Anthropic direct** | 2–3 days | Pay Anthropic per token | More control, no OpenRouter |
| **C. Serverless (Vercel/Railway)** | 1 day | Free tier → usage-based | Low ops, auto-scale |

---

## Option A: OpenRouter Proxy (fastest)

CipherMate backend is a thin proxy. It receives requests, forwards to OpenRouter with your master key, handles anonymous quota.

### 1. Get OpenRouter API key

1. Sign up at [openrouter.ai](https://openrouter.ai)
2. Create an API key
3. Store as `OPENROUTER_API_KEY` (env)

### 2. Minimal Express server

```javascript
// server.js
const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

const MODEL_MAP = {
  'scripter-1x': 'openrouter/auto',
  'scripter-2x': 'anthropic/claude-3.5-haiku',
  'scripter-pro': 'anthropic/claude-sonnet-4',
  'scripter-max': 'anthropic/claude-opus-4',
};

app.post('/v1/chat/completions', async (req, res) => {
  const auth = req.headers.authorization;
  const isAnonymous = req.headers['x-ciphermate-anonymous'] === '1' || !auth;

  // TODO: If anonymous, check free quota (Redis/DB), deduct, return 402 if exhausted
  // For MVP: allow anonymous, add quota later

  const model = MODEL_MAP[req.body.model] || req.body.model || 'anthropic/claude-3.5-haiku';
  const apiKey = process.env.OPENROUTER_API_KEY;

  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://ciphermate.ai',
    },
    body: JSON.stringify({
      model,
      messages: req.body.messages,
      tools: req.body.tools,
      temperature: req.body.temperature ?? 0.7,
      max_tokens: req.body.max_tokens ?? 8192,
    }),
  });

  const data = await resp.json();
  res.status(resp.status).json(data);
});

app.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: [
      { id: 'scripter-1x', object: 'model', owned_by: 'ciphermate' },
      { id: 'scripter-2x', object: 'model', owned_by: 'ciphermate' },
      { id: 'scripter-pro', object: 'model', owned_by: 'ciphermate' },
      { id: 'scripter-max', object: 'model', owned_by: 'ciphermate' },
    ],
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CipherMate API on :${PORT}`));
```

### 3. Run locally

```bash
mkdir ciphermate-api && cd ciphermate-api
npm init -y
npm install express node-fetch
OPENROUTER_API_KEY=sk-or-xxx node server.js
```

### 4. Point extension at it

In VS Code settings or `.vscode/settings.json`:

```json
{
  "ciphermate.scripterMax.apiUrl": "http://localhost:3000/v1"
}
```

Or use ngrok for a public URL:

```bash
ngrok http 3000
# Use https://xxxx.ngrok.io/v1 as apiUrl
```

---

## Option B: Anthropic Direct

Same idea, but call Anthropic SDK instead of OpenRouter. More control, no OpenRouter dependency.

```javascript
const Anthropic = require('@anthropic-ai/sdk');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// In /v1/chat/completions handler:
const modelMap = {
  'scripter-1x': 'claude-3-5-haiku-20241022',
  'scripter-2x': 'claude-3-5-haiku-20241022',
  'scripter-pro': 'claude-sonnet-4-20250514',
  'scripter-max': 'claude-opus-4-20250514',
};
const msg = await anthropic.messages.create({
  model: modelMap[req.body.model] || 'claude-3-5-haiku-20241022',
  max_tokens: req.body.max_tokens ?? 8192,
  messages: req.body.messages.map(m => ({ role: m.role, content: m.content })),
});
// Convert Anthropic response to OpenAI format
```

---

## Option C: Deploy to production

### Railway / Render / Fly.io

1. Push the server to a Git repo
2. Connect repo to Railway (or Render, Fly.io)
3. Set `OPENROUTER_API_KEY` in env
4. Deploy → get URL like `https://ciphermate-api.up.railway.app`

### Vercel (serverless)

Use Vercel serverless functions. Create `api/chat/completions.js`:

```javascript
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  // Same proxy logic, call OpenRouter
}
```

### DNS: api.ciphermate.ai

1. Add CNAME: `api` → `ciphermate-api.up.railway.app` (or your deploy URL)
2. Or use a load balancer / API gateway in front

---

## Extension config

The extension uses `ciphermate.scripterMax.apiUrl`. Default is `https://api.ciphermate.ai/v1`.

| Scenario | apiUrl |
|---------|--------|
| Production | `https://api.ciphermate.ai/v1` |
| Local dev | `http://localhost:3000/v1` |
| ngrok | `https://xxxx.ngrok-free.app/v1` |

---

## Checklist to go live

- [ ] Deploy backend (Railway/Render/Vercel)
- [ ] Set `OPENROUTER_API_KEY` or `ANTHROPIC_API_KEY`
- [ ] Point `api.ciphermate.ai` to your deploy URL (DNS CNAME)
- [ ] (Optional) Add free-tier quota: Redis key per IP/session, deduct tokens, 402 when exhausted
- [ ] (Later) Add cm-xxx token validation for paid users
- [ ] Test from extension: Scripter provider, no API key

---

## Free tier (anonymous) quota

For MVP you can allow anonymous without quota. To add limits later:

1. **Per-IP**: Use `X-Forwarded-For` or `req.ip`, store in Redis: `free:ip:1.2.3.4` → `{ used: 5000, limit: 10000 }`
2. **Per-device**: Extension could send `X-Device-Id` (generated once, stored locally)
3. **On 402**: Return `{ error: { message: "Free tier exhausted. Sign up at ciphermate.ai for more." } }`
