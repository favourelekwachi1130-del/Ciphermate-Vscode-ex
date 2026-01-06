# Multi-Provider AI Guide - 450+ Models Support

## Overview

CipherMate now supports **450+ AI models** through a unified multi-provider system:

-     **Claude Sonnet 4.5** (via Anthropic or OpenRouter)
-     **Gemini 2.5 Pro** (via Google or OpenRouter)
-     **GPT-5** (via OpenAI or OpenRouter)
-     **450+ more models** (via OpenRouter)

## Quick Start

### Option 1: OpenRouter (Recommended - 450+ Models)

**Best for**: Access to the latest models from all providers in one place

1. Get API key from [OpenRouter.ai](https://openrouter.ai)
2. Open VS Code Settings
3. Search "CipherMate"
4. Set `AI Provider` to `openrouter`
5. Enter your OpenRouter API key in `AI > OpenRouter > API Key`
6. Choose your model in `AI > OpenRouter > Model` (e.g., `openai/gpt-5`, `anthropic/claude-sonnet-4-20250514`)

**Popular Models on OpenRouter:**
- `openai/gpt-5` - Latest GPT
- `anthropic/claude-sonnet-4-20250514` - Claude Sonnet 4.5
- `google/gemini-2.0-flash-exp` - Gemini 2.5 Pro
- `meta-llama/llama-3.1-405b-instruct` - Llama 3.1
- `mistralai/mistral-large` - Mistral Large
- [View all 450+ models](https://openrouter.ai/models)

---

### Option 2: Direct Provider Access

#### OpenAI (GPT-5, GPT-4, etc.)

1. Get API key from [OpenAI Platform](https://platform.openai.com)
2. Set `AI Provider` to `openai`
3. Enter API key in `AI > OpenAI > API Key`
4. Choose model: `gpt-5`, `gpt-4`, `gpt-3.5-turbo`, etc.

#### Anthropic (Claude Sonnet 4.5, Claude 3.5, etc.)

1. Get API key from [Anthropic Console](https://console.anthropic.com)
2. Set `AI Provider` to `anthropic`
3. Enter API key in `AI > Anthropic > API Key`
4. Choose model: `claude-sonnet-4-20250514`, `claude-3-5-sonnet-20241022`, etc.

#### Google Gemini (Gemini 2.5 Pro, etc.)

1. Get API key from [Google AI Studio](https://aistudio.google.com)
2. Set `AI Provider` to `gemini`
3. Enter API key in `AI > Gemini > API Key`
4. Choose model: `gemini-2.0-flash-exp`, `gemini-1.5-pro`, etc.

---

## Configuration

### VS Code Settings UI

1. Open Settings (Cmd/Ctrl + ,)
2. Search "CipherMate"
3. Configure under `CipherMate > AI`

### settings.json

```json
{
  "ciphermate.ai.useMultiProvider": true,
  "ciphermate.ai.provider": "openrouter",
  
  "ciphermate.ai.openrouter": {
    "apiKey": "sk-or-v1-your-key",
    "model": "openai/gpt-5",
    "timeout": 30000
  },
  
  // Optional: Set fallback providers
  "ciphermate.ai.fallbackProviders": ["openai", "anthropic"]
}
```

---

## Provider Comparison

| Provider | Models | Best For | Cost |
|----------|--------|----------|------|
| **OpenRouter** | 450+ | Latest models from all providers, easy switching | Pay-per-use |
| **OpenAI** | 10+ | GPT-5, GPT-4, reliable performance | Pay-per-use |
| **Anthropic** | 7+ | Claude Sonnet 4.5, strong reasoning | Pay-per-use |
| **Gemini** | 6+ | Gemini 2.5 Pro, fast responses | Pay-per-use |

---

## Fallback Providers

Configure automatic failover if primary provider fails:

```json
{
  "ciphermate.ai.provider": "openrouter",
  "ciphermate.ai.fallbackProviders": ["openai", "anthropic"]
}
```

If OpenRouter fails, it will automatically try OpenAI, then Anthropic.

---

## Model Recommendations

### Security Analysis (Recommended)

**Best Overall:**
- `anthropic/claude-sonnet-4-20250514` (via OpenRouter or Anthropic)
- `openai/gpt-5` (via OpenRouter or OpenAI)
- `google/gemini-2.0-flash-exp` (via OpenRouter or Gemini)

**Cost-Effective:**
- `openai/gpt-4-turbo` (via OpenRouter or OpenAI)
- `google/gemini-1.5-flash` (via OpenRouter or Gemini)
- `anthropic/claude-3-haiku` (via OpenRouter or Anthropic)

**Fastest:**
- `google/gemini-2.0-flash-exp`
- `openai/gpt-4o-mini`
- `anthropic/claude-3-haiku`

---

## Advanced: Custom Provider

For custom APIs (must be OpenAI-compatible):

```json
{
  "ciphermate.ai.provider": "custom",
  "ciphermate.ai.custom": {
    "apiUrl": "https://your-api.com/v1/chat/completions",
    "apiKey": "your-key",
    "model": "your-model",
    "timeout": 30000
  }
}
```

---

## Testing Your Configuration

1. Open CipherMate Chat
2. Type: "Test connection"
3. Should receive confirmation response
4. Check latency in response (lower is better)

Or use Command Palette:
- `CipherMate: Test AI Connection`

---

## Cost Optimization

1. **Use caching** - See `COST_MANAGEMENT.md`
2. **Choose appropriate model** - Use smaller models for simple tasks
3. **Monitor usage** - Check provider dashboards regularly
4. **Use fallbacks** - Automatic failover prevents wasted retries

---

## Troubleshooting

### "API Error 401"
- Check API key is correct
- Verify key has proper permissions

### "API Error 429"
- Rate limit exceeded
- Wait or upgrade plan
- Use fallback providers

### "Model not found"
- Check model name spelling
- Verify model is available on your plan
- Try a different model

### "Request timeout"
- Increase timeout in settings
- Check network connection
- Try a faster model (e.g., flash variants)

---

## Supported Models Reference

### OpenRouter (450+ Models)
See: https://openrouter.ai/models

### OpenAI Models
- `gpt-5` (latest)
- `gpt-4-turbo`
- `gpt-4`
- `gpt-3.5-turbo`
- `gpt-4o`
- `gpt-4o-mini`

### Anthropic Models
- `claude-sonnet-4-20250514` (Claude Sonnet 4.5)
- `claude-3-5-sonnet-20241022`
- `claude-3-5-sonnet-20240620`
- `claude-3-opus-20240229`
- `claude-3-sonnet-20240229`
- `claude-3-haiku-20240307`

### Google Gemini Models
- `gemini-2.0-flash-exp` (Gemini 2.5 Pro)
- `gemini-1.5-pro`
- `gemini-1.5-flash`
- `gemini-pro`
- `gemini-pro-vision`

---

## Migration from Legacy Cloud AI

If you're using the old `cloudAI` configuration:

1. Your existing config will continue to work
2. For best results, migrate to multi-provider:
   - Set `ciphermate.ai.useMultiProvider` to `true`
   - Choose your provider and configure
   - Old `cloudAI` settings will be ignored when multi-provider is enabled

---

## Next Steps

1. **Choose a provider** (OpenRouter recommended for 450+ models)
2. **Get API key** from provider website
3. **Configure in VS Code Settings**
4. **Test connection**
5. **Start using CipherMate!**

**You now have access to 450+ AI models for security analysis!**     


