# Cloud AI Setup - Quick Start

## Overview

CipherMate now supports your custom trained AI model via cloud API. No local AI required!

## Configuration Steps

### 1. Configure Cloud AI in CipherMate

1. Open VS Code Settings (Cmd/Ctrl + ,)
2. Search for "CipherMate"
3. Set `Use Cloud AI` to `true`
4. Enter your API endpoint: `https://api.your-domain.com/v1/chat/completions`
5. Enter your API key (stored securely)
6. Set model name (optional, defaults to "ciphermate-security-agent")

### 2. Test Connection

1. Open CipherMate Chat
2. Type "test connection"
3. Should receive confirmation response

## What You Need to Deploy

### Minimum API Requirements

Your API must accept:

```
POST /v1/chat/completions

Headers:
- Authorization: Bearer YOUR_API_KEY
- Content-Type: application/json

Body:
{
  "model": "ciphermate-security-agent",
  "messages": [...],
  "tools": [...],
  "temperature": 0.7,
  "max_tokens": 2000
}

Response:
{
  "choices": [{
    "message": {
      "content": "...",
      "tool_calls": [...]
    }
  }],
  "usage": {...}
}
```

## Training Your Model

See `TRAINING_FRAMEWORK.md` for:
- Training data structure
- Example prompts
- Security analysis patterns
- Tool calling examples

## Deployment Options

See `DEPLOYMENT_GUIDE.md` for:
- Serverless deployment (AWS Lambda, Cloud Functions)
- Container deployment (Docker + Kubernetes)
- Managed platforms
- Scaling strategies

## Privacy & Security

- Code is sent over HTTPS only
- API key authentication required
- Rate limiting recommended
- Optional: On-premise deployment option

## Benefits

    **Scalable**: Serve unlimited customers  
    **No Local AI**: No need for users to run LM Studio/Ollama  
    **Your Model**: Train on your security expertise  
    **Privacy**: You control the infrastructure  
    **Cost Control**: Choose your deployment and pricing model

---

**Next Steps:**
1. Train your model using the training framework
2. Deploy as API service
3. Configure CipherMate with your endpoint
4. Start serving customers!


