# CipherMate VS Code Extension - Workflow Guide

## Overview

The CipherMate VS Code extension uses the **EXACT same AI implementation** as the Cyber-Claude CLI tool, adapted for repository scanning with a frontend interface.

## How It Works

### 1. **AI Provider System** (TIT FOR TAT with CLI)

The extension uses the exact same providers as the CLI:
- **Claude (Anthropic)** - `cli-claude.ts`
- **OpenAI** - `cli-openai.ts`
- **Gemini (Google)** - `cli-gemini.ts`
- **Ollama (Local)** - `ollama-provider.ts` (uses `/api/chat` endpoint)

All providers use the exact same interface and logic as the CLI.

### 2. **Automatic Fallback**

✅ **YES - Automatic fallback is enabled by default!**

When a provider fails, the extension automatically tries other configured providers in this order:
1. Claude (Anthropic)
2. OpenAI
3. Gemini (Google)
4. Ollama (Local)

**How it works:**
- If your primary provider fails (e.g., Ollama model not found)
- Extension automatically tries the next provider in the chain
- If successful, it switches to that provider and shows a notification
- Conversation history is preserved across provider switches

**To disable fallback:**
Set `ciphermate.ai.enableAutoFallback` to `false` in settings.

### 3. **Settings Configuration**

#### Current Settings Structure:
```json
{
  "ciphermate.ai.provider": "ollama",
  "ciphermate.ai.ollama.apiUrl": "http://64.225.56.89:11434",
  "ciphermate.ai.ollama.model": "deepseek-coder:latest",
  "ciphermate.ai.anthropic.apiKey": "...",
  "ciphermate.ai.openai.apiKey": "...",
  "ciphermate.ai.gemini.apiKey": "...",
  "ciphermate.ai.enableAutoFallback": true
}
```

#### Interactive Settings UI

Access via: **Command Palette** → `CipherMate: Open Advanced Settings`

The settings UI shows:
- ✅ Provider status (configured/available)
- 🔄 Test connection buttons
- 📊 Provider latency
- ⚠️ Error messages and suggestions
- 🔄 Real-time status updates

### 4. **Workflow When You Run It**

#### Step 1: Configuration
1. Open VS Code Settings (Command Palette → `CipherMate: Open Advanced Settings`)
2. Select your AI provider:
   - **Ollama**: Set `apiUrl` and `model` (e.g., `deepseek-coder:latest`)
   - **Claude**: Set `apiKey` and `model`
   - **OpenAI**: Set `apiKey` and `model`
   - **Gemini**: Set `apiKey` and `model`

#### Step 2: Test Connection
- Click "Test Connection" button in settings
- Extension checks:
  - ✅ Provider is configured
  - ✅ API key is valid (for cloud providers)
  - ✅ Ollama server is reachable (for Ollama)
  - ✅ Model is available (for Ollama)

#### Step 3: Use the Extension
- **Repository Scanning**: Command Palette → `CipherMate: Scan Repository`
- **Chat Interface**: Command Palette → `CipherMate: Open Chat`
- **Security Analysis**: Automatically uses configured AI provider

#### Step 4: Automatic Fallback (if needed)
If primary provider fails:
1. Extension logs: `Primary provider failed, trying fallback providers...`
2. Tries next provider in chain
3. If successful: Shows notification and switches provider
4. If all fail: Shows error with helpful suggestions

### 5. **Error Handling**

The extension provides helpful error messages:

**Model Not Found (Ollama):**
```
Model 'deepseek-coder' not found on Ollama server.

To fix this:
1. Check available models: curl http://your-server:11434/api/tags
2. Pull the model: ollama pull deepseek-coder:latest
3. Verify the model name in settings matches exactly (including tag)
```

**Connection Failed:**
```
Failed to connect to Ollama at http://your-server:11434.
Make sure Ollama is running (ollama serve) and the model is pulled
```

**API Key Issues:**
- Shows which provider failed
- Suggests checking API key in settings
- Offers to switch to another provider

### 6. **Provider Status API**

The extension exposes provider status checking:

```typescript
import { checkAllProviders, testProvider } from './ai-agent/provider-status';

// Check all providers
const statuses = await checkAllProviders();
// Returns: [{ provider: 'Ollama', available: true, configured: true, latency: 45, ... }]

// Test specific provider
const result = await testProvider('ollama');
// Returns: { success: true, latency: 120 } or { success: false, error: '...' }
```

### 7. **Best Practices**

1. **Configure Multiple Providers**: Set up at least 2 providers for automatic fallback
2. **Test Connections**: Use the "Test Connection" button before scanning
3. **Monitor Logs**: Check Output → CipherMate for provider status
4. **Ollama Setup**: 
   - Ensure Ollama is running: `ollama serve`
   - Pull your model: `ollama pull deepseek-coder:latest`
   - Verify model name matches exactly in settings

### 8. **Troubleshooting**

**Issue: "Model not found"**
- Check model name in settings matches exactly (including tag)
- Run `ollama list` to see available models
- Pull the model: `ollama pull <model-name>`

**Issue: "Connection failed"**
- For Ollama: Check if `ollama serve` is running
- For cloud providers: Check API key is correct
- Check network connectivity

**Issue: "All providers failed"**
- Check at least one provider is configured
- Verify API keys are valid
- Check extension logs for detailed error messages

## Summary

✅ **Automatic fallback**: YES - enabled by default  
✅ **Interactive settings**: YES - with test buttons and status  
✅ **Exact CLI implementation**: YES - TIT FOR TAT  
✅ **Error handling**: YES - helpful messages and suggestions  
✅ **Provider status**: YES - real-time checking available  

The extension works seamlessly with automatic fallback, so if one provider fails, it automatically tries others without throwing errors (unless all providers fail).

