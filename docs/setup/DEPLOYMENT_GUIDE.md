# CipherMate Cloud AI Deployment Guide

## Overview

This guide explains how to deploy your trained agentic AI model for use with CipherMate at scale.

## Architecture

```
                                                                                                                                                                                 
  ‚                    Your Infrastructure                     ‚
                                                                                                                                                                                ¤
  ‚                                                            ‚
  ‚                                                                                                                          ‚
  ‚    ‚   API          ‚        ‚  Load          ‚                  ‚
  ‚    ‚   Gateway      ‚  „             –º  ‚  Balancer      ‚                  ‚
  ‚                         ¬                                                     ¬                                          ‚
  ‚           ‚                       ‚                           ‚
  ‚           ‚                      –¼                           ‚
  ‚           ‚                                                                                               ‚
  ‚           ‚            ‚  AI Service Pool      ‚                ‚
  ‚           ‚            ‚  (Multiple Instances)  ‚                ‚
  ‚           ‚            ‚  - Model Server 1     ‚                ‚
  ‚           ‚            ‚  - Model Server 2     ‚                ‚
  ‚           ‚            ‚  - Model Server N     ‚                ‚
  ‚           ‚                                                                                               ‚
  ‚           ‚                                                  ‚
  ‚                                                                                                                              ‚
  ‚                                                            ‚
                                                                                                                                                                                 
                             –²
                              ‚ HTTPS/REST API
                              ‚ (Authenticated)
                              ‚
                                                                                      ´                                                                                    
  ‚              CipherMate VS Code Extension                ‚
  ‚                                                           ‚
  ‚  Users  †  Chat Interface  †  CloudAIService  †  Your API      ‚
                                                                                                                                                                                 
```

## API Implementation

### Required Endpoint

```
POST /v1/chat/completions
```

### Request Format

```json
{
  "model": "ciphermate-security-agent",
  "messages": [
    {
      "role": "system",
      "content": "You are CipherMate security AI..."
    },
    {
      "role": "user",
      "content": "Scan this repository for vulnerabilities"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "scan_repository",
        "description": "Scan repository for vulnerabilities",
        "parameters": {
          "type": "object",
          "properties": {
            "path": {"type": "string"}
          }
        }
      }
    }
  ],
  "temperature": 0.7,
  "max_tokens": 2000
}
```

### Response Format

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1694268190,
  "model": "ciphermate-security-agent",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "I'll scan your repository for security vulnerabilities.",
        "tool_calls": [
          {
            "id": "call_abc123",
            "type": "function",
            "function": {
              "name": "scan_repository",
              "arguments": "{\"path\": \".\"}"
            }
          }
        ]
      },
      "finish_reason": "tool_calls"
    }
  ],
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 50,
    "total_tokens": 150
  }
}
```

## Deployment Options

### Option 1: Serverless (AWS Lambda, Google Cloud Functions)

**Pros**: Auto-scaling, pay-per-use, no infrastructure management  
**Cons**: Cold starts, execution time limits

**Example AWS Lambda Handler**:

```python
import json
import boto3

def lambda_handler(event, context):
    # Parse request
    body = json.loads(event['body'])
    model = body['model']
    messages = body['messages']
    tools = body.get('tools', [])
    
    # Call your trained model
    response = call_your_ai_model(
        messages=messages,
        tools=tools,
        temperature=body.get('temperature', 0.7),
        max_tokens=body.get('max_tokens', 2000)
    )
    
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json'
        },
        'body': json.dumps(response)
    }
```

### Option 2: Container Service (Docker + Kubernetes)

**Pros**: Full control, horizontal scaling, persistent connections  
**Cons**: Infrastructure management required

**Dockerfile**:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY model/ ./model/
COPY api_server.py .

EXPOSE 8000

CMD ["python", "api_server.py"]
```

**Kubernetes Deployment**:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ciphermate-ai
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ciphermate-ai
  template:
    metadata:
      labels:
        app: ciphermate-ai
    spec:
      containers:
      - name: ai-service
        image: your-registry/ciphermate-ai:latest
        ports:
        - containerPort: 8000
        env:
        - name: MODEL_PATH
          value: "/app/model"
        resources:
          requests:
            memory: "4Gi"
            cpu: "2"
          limits:
            memory: "8Gi"
            cpu: "4"
```

### Option 3: Managed AI Platform (OpenAI API-compatible)

**Pros**: Infrastructure handled, built-in scaling  
**Cons**: Vendor lock-in, less control

- Use services like Together.ai, Anyscale, or self-hosted vLLM
- They provide OpenAI-compatible API
- Just point CipherMate to your endpoint

## Authentication

### API Key Authentication

```python
from flask import Flask, request, jsonify
import os

app = Flask(__name__)
API_KEY = os.environ.get('CIPHERMATE_API_KEY')

@app.before_request
def check_auth():
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({'error': 'Unauthorized'}), 401
    
    token = auth_header.split(' ')[1]
    if token != API_KEY:
        return jsonify({'error': 'Invalid API key'}), 401
```

## Rate Limiting

```python
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["100 per hour", "10 per minute"]
)

@app.route('/v1/chat/completions', methods=['POST'])
@limiter.limit("5 per second")
def chat_completions():
    # Handle request
    pass
```

## Monitoring & Logging

### Key Metrics to Track

- Request latency (p50, p95, p99)
- Token usage
- Error rates
- Tool call frequency
- Model inference time
- Queue depth (if using queues)

### Example Monitoring Setup

```python
import time
import logging
from prometheus_client import Counter, Histogram

request_count = Counter('requests_total', 'Total requests')
request_latency = Histogram('request_latency_seconds', 'Request latency')

@app.route('/v1/chat/completions', methods=['POST'])
def chat_completions():
    start_time = time.time()
    request_count.inc()
    
    try:
        response = process_request(request.json)
        request_latency.observe(time.time() - start_time)
        return jsonify(response)
    except Exception as e:
        logging.error(f"Error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
```

## Scaling Strategy

### Vertical Scaling
- Increase instance size (more CPU/RAM)
- Use GPU instances for faster inference
- Optimize model (quantization, pruning)

### Horizontal Scaling
- Load balancer + multiple instances
- Auto-scaling based on queue depth
- Regional deployment for lower latency

### Caching
- Cache common requests
- Cache tool results
- Use Redis for shared cache

## Cost Optimization

1. **Model Optimization**
   - Quantize model (FP16, INT8)
   - Use smaller model for simple tasks
   - Batch requests when possible

2. **Caching**
   - Cache frequent analysis patterns
   - Cache vulnerability explanations

3. **Billing Model**
   - Per-request pricing
   - Token-based pricing
   - Subscription tiers

## Security Considerations

1. **API Security**
   - HTTPS only
   - API key authentication
   - Rate limiting
   - Input validation

2. **Data Privacy**
   - Don't log sensitive code
   - Encrypt data in transit
   - GDPR compliance
   - Data retention policies

3. **Infrastructure Security**
   - VPC isolation
   - Security groups
   - Regular security audits

## Testing Your Deployment

Use the test connection in CipherMate:

1. Open CipherMate settings
2. Configure cloud AI endpoint
3. Click "Test Connection"
4. Verify response

Or test manually:

```bash
curl -X POST https://api.ciphermate.ai/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "ciphermate-security-agent",
    "messages": [
      {"role": "user", "content": "Test connection"}
    ]
  }'
```

## Example FastAPI Implementation

```python
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from typing import List, Optional
import os

app = FastAPI()
API_KEY = os.environ.get('CIPHERMATE_API_KEY')

class Message(BaseModel):
    role: str
    content: str
    tool_calls: Optional[List] = None

class ChatRequest(BaseModel):
    model: str
    messages: List[Message]
    tools: Optional[List] = None
    temperature: float = 0.7
    max_tokens: int = 2000

@app.post("/v1/chat/completions")
async def chat_completions(
    request: ChatRequest,
    authorization: str = Header(None)
):
    # Verify API key
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    token = authorization.split(" ")[1]
    if token != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    # Call your trained model
    response = await call_your_model(request)
    
    return response

async def call_your_model(request: ChatRequest):
    # Your model inference logic here
    # This is where you'd call your trained model
    pass
```

## Next Steps

1. Train your model using the training framework
2. Deploy model as API service
3. Configure CipherMate extension with your API endpoint
4. Test with real users
5. Monitor and scale as needed

---

Your CipherMate extension is already configured to use cloud AI. Just:
1. Deploy your trained model
2. Set the API URL in settings
3. Start serving customers!


