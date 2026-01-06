# Next Steps: Training & Deployment Guide

##     You've Generated Training Data

Found: `expert_training_data_openai_759000.jsonl` on your Desktop

## Step-by-Step: From Training Data to Production

### Step 1: Train Your Model (Choose One)

#### Option A: OpenAI Fine-Tuning (Easiest, Recommended)

```bash
# 1. Install OpenAI CLI
pip install openai

# 2. Set your API key
export OPENAI_API_KEY="sk-your-key-here"

# 3. Navigate to scripts directory
cd ciphermate/scripts

# 4. Run training script
python3 train_openai.py
# When prompted, enter: ~/Desktop/expert_training_data_openai_759000.jsonl
```

**What happens:**
- Uploads your training file to OpenAI
- Creates fine-tuning job (takes 1-4 hours)
- Returns model ID (e.g., `ft:gpt-3.5-turbo-0613:your-org:ciphermate:abc123`)

**Cost estimate for 759k samples:**
- ~$500-2000 depending on model and token count
- Check OpenAI pricing: httphos://openai.com/pricing

#### Option B: Hugging Face / Open Source

```bash
# For Llama, Mistral, or other open models
# See: PRACTICAL_TRAINING_GUIDE.md for detailed instructions
```

#### Option C: Custom Training Infrastructure

If you have your own GPU cluster or want maximum control:
- See `DEPLOYMENT_GUIDE.md` for infrastructure setup
- Use frameworks like PyTorch, TensorFlow, or JAX

---

### Step 2: Deploy Your Trained Model as API

Once training completes, you need to deploy it as an API service.

#### Option A: OpenAI Hosted (Easiest)

If you used OpenAI fine-tuning:
-     Model is already deployed
-     Just use the model ID in API calls
-     No infrastructure needed

**API Endpoint**: `https://api.openai.com/v1/chat/completions`
**Model**: Your fine-tuned model ID (e.g., `ft:gpt-3.5-turbo-0613:your-org:ciphermate:abc123`)

#### Option B: Self-Hosted API (More Control)

Deploy your own API service:

**Quick Start with Docker:**

```bash
# 1. Create API service (see DEPLOYMENT_GUIDE.md for full implementation)
# 2. Deploy to:
#    - AWS Lambda (serverless)
#    - Google Cloud Run (serverless)
#    - Kubernetes (scalable)
#    - Your own servers
```

**Required API Format:**

```
POST /v1/chat/completions
Headers:
  Authorization: Bearer YOUR_API_KEY
  Content-Type: application/json

Body:
{
  "model": "ciphermate-security-agent",
  "messages": [...],
  "tools": [...],
  "temperature": 0.7,
  "max_tokens": 2000
}
```

See `DEPLOYMENT_GUIDE.md` for complete API implementation examples.

---

### Step 3: Configure CipherMate to Use Your Model

#### If Using OpenAI Fine-Tuning:

1. Open VS Code Settings (Cmd/Ctrl + ,)
2. Search for "CipherMate"
3. Configure:
   - `Use Cloud AI`: `true`
   - `Cloud AI API URL`: `https://api.openai.com/v1/chat/completions`
   - `Cloud AI API Key`: Your OpenAI API key
   - `Cloud AI Model`: Your fine-tuned model ID (e.g., `ft:gpt-3.5-turbo-0613:...`)

#### If Using Self-Hosted API:

1. Open VS Code Settings
2. Configure:
   - `Use Cloud AI`: `true`
   - `Cloud AI API URL`: `https://your-api-domain.com/v1/chat/completions`
   - `Cloud AI API Key`: Your API key
   - `Cloud AI Model`: `ciphermate-security-agent` (or your model name)

#### Test Connection:

1. Open CipherMate Chat (Cmd/Ctrl + Shift + P  †  "CipherMate: Open AI Chat")
2. Type: "test connection"
3. Should receive response from your trained model

---

### Step 4: Start Using Your Trained AI

Your AI is now ready! Users can:

1. **Open CipherMate Chat** in VS Code
2. **Type natural language requests**:
   - "Scan this repository for vulnerabilities"
   - "Analyze this code for security issues"
   - "Fix the authorization flaw in auth.py"
   - "Explain how this race condition works"

3. **AI will**:
   - Understand the request
   - Use tools to scan/analyze code
   - Provide expert-level security analysis
   - Generate secure fixes
   - Explain vulnerabilities from attacker perspective

---

## Quick Reference

### Training Files Location
- **Expert format**: `~/Desktop/expert_training_data_759000.jsonl`
- **OpenAI format**: `~/Desktop/expert_training_data_openai_759000.jsonl`  †  **Use this for training**

### Training Scripts
- **OpenAI**: `ciphermate/scripts/train_openai.py`
- **Hugging Face**: See `PRACTICAL_TRAINING_GUIDE.md`

### Documentation
- **Training Guide**: `PRACTICAL_TRAINING_GUIDE.md`
- **Deployment Guide**: `DEPLOYMENT_GUIDE.md`
- **Cloud AI Setup**: `CLOUD_AI_SETUP.md`

### Configuration
- VS Code Settings  †  Search "CipherMate"  †  Configure Cloud AI settings

---

## Cost Estimates

### Training Costs (One-Time)
- **OpenAI Fine-Tuning**: $500-2000 for 759k samples
- **Hugging Face**: $0-100 (if using free tier)
- **Self-Hosted**: $0 (but need GPU infrastructure)

### Deployment Costs (Ongoing)
- **OpenAI API**: ~$0.002-0.01 per request (depends on tokens)
- **Self-Hosted**: $50-500/month (depends on traffic and infrastructure)

---

## Troubleshooting

### Training Issues
- **File too large**: Split into multiple files (OpenAI has limits)
- **API errors**: Check API key and quota
- **Training fails**: Check data format (must be valid JSONL)

### Deployment Issues
- **API not responding**: Check endpoint URL and authentication
- **Model not found**: Verify model ID/name is correct
- **Rate limits**: Implement rate limiting on your API

### CipherMate Connection Issues
- **Can't connect**: Check API URL and key in settings
- **Wrong responses**: Verify model is using correct training data
- **Timeout errors**: Check API response times

---

## Next Actions

1. **Train your model** (Step 1 above)
2. **Deploy as API** (Step 2)
3. **Configure CipherMate** (Step 3)
4. **Test and iterate** (Step 4)

**Estimated Time**: 2-4 hours for training + deployment setup

**You're ready to go!**     


