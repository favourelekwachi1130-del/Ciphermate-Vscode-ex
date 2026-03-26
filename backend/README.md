# CipherMate API — Make Scripter Live

Minimal proxy so the extension can call Scripter with no user API keys.

## Quick start

```bash
cd backend
npm install
OPENROUTER_API_KEY=sk-or-your-key npm start
```

## Point the extension at it

In VS Code: **Settings** → search `ciphermate.scripterMax.apiUrl` → set to:

```
http://localhost:3000/v1
```

Or in `settings.json`:

```json
{
  "ciphermate.scripterMax.apiUrl": "http://localhost:3000/v1"
}
```

## Get an OpenRouter key

1. Go to [openrouter.ai](https://openrouter.ai)
2. Sign up and create an API key
3. Use it as `OPENROUTER_API_KEY`

## Deploy to production

- **Railway**: Connect this folder, set `OPENROUTER_API_KEY`, deploy
- **Render**: Same
- **Vercel**: Use serverless functions (see `docs/architecture/MAKING_SCRIPTER_LIVE.md`)

Then point `api.ciphermate.ai` (DNS CNAME) to your deploy URL.
