# Hosting and Fine-Tuning Scripter (Your Own Model)

Scripter is CipherMate's own model — a mini model fine-tuned for the CipherMate workspace. This guide covers fine-tuning and hosting, with Railway as your API gateway.

---

## Cost comparison

| Option | Fine-tuning | Hosting | Best for |
|--------|-------------|---------|----------|
| **Colab + Unsloth** | **Free** (T4 GPU) | Hugging Face free tier | Zero cost, prototyping |
| **RunPod** | ~$0.59/hr GPU | Serverless pay-per-use | More control |
| **Together.ai** | Paid (~$5+ per job) | Paid per token | Easiest, no GPU |

---

## Option A (FREE): Google Colab + Unsloth

**Zero cost.** Uses Colab's free T4 GPU and Unsloth (2–5x faster, 58–70% less memory).

### 1. Generate training data locally

```bash
python scripts/finetune_scripter.py --generate 500 --platform colab
# Or: python scripts/generate_expert_training_data.py
```

### 2. Fine-tune on Colab

1. Go to [Unsloth Colab notebooks](https://github.com/unslothai/notebooks) or [docs.unsloth.ai](https://docs.unsloth.ai/get-started/fine-tuning-guide)
2. Open a notebook for **Llama 3.2 3B** (or similar)
3. Runtime → Change runtime type → **T4 GPU** (free)
4. Upload your `scripter_mini.jsonl` or `expert_training_data_openai_*.jsonl` to Colab
5. In the notebook, point the dataset path to your file
6. Run all cells — training takes ~12–30 min for 3B on T4

### 3. Save your model

- **Hugging Face**: Push to HF Hub (free) — `model.push_to_hub("your-username/scripter")`
- **Download**: Download LoRA adapter to use locally with Ollama

### 4. Host for free

- **Hugging Face Inference API**: Free tier ~300 req/hr. Upload model, use `https://api-inference.huggingface.co/models/your-username/scripter`
- **Ollama (local)**: Convert to GGUF, run on your machine — no hosting cost

### 5. Export to GGUF and test in LM Studio

**Option A — In Colab (right after training):**
```python
model.save_pretrained_gguf("scripter_gguf", tokenizer, quantization_method="q4_k_m")
# Download the folder, or push: model.push_to_hub_gguf("your-username/scripter-gguf", tokenizer, quantization_method="q4_k_m")
```

**Option B — From Hugging Face or local path:**
```bash
pip install unsloth
python scripts/export_scripter_to_gguf.py --model your-username/scripter --output scripter_gguf
```

**Import into LM Studio:**
```bash
lms import /path/to/scripter_gguf/model-Q4_K_M.gguf
# Or from HF: lms get your-username/scripter-gguf@Q4_K_M
```

**Or manually:** Place `model-Q4_K_M.gguf` in `~/.lmstudio/models/ciphermate/scripter/`

Then: LM Studio → My Models → Load → Chat.

**Use with CipherMate:** LM Studio serves an OpenAI-compatible API at `http://localhost:1234/v1`. In VS Code settings:
```json
"ciphermate.scripterMax.apiUrl": "http://localhost:1234/v1"
```
Keep Scripter as your AI provider — it will call your local model.

---

## Fine-tune vs train from scratch

| Approach | What it is | When to use |
|----------|------------|-------------|
| **Fine-tune** | Adapt an existing model (Llama, Mistral) on your data | Most common — 500–10k samples, fast, cheap |
| **Train from scratch** | Build a new model from random weights | Rare — needs huge data, many GPUs, big budget |

For Scripter, **fine-tuning** is the right path.

---

## Option B: Together.ai (paid — fine-tune + host in one place)

Together.ai handles both fine-tuning and hosting. No GPU management.

### 1. Fine-tune Scripter

```bash
# Generate training data (or use existing from generate_expert_training_data.py)
python scripts/finetune_scripter.py --generate 100 --platform together  # quick test
# OR
python scripts/generate_expert_training_data.py  # full 10k expert dataset

# Fine-tune (uses Together CLI)
export TOGETHER_API_KEY=your-key
python scripts/finetune_scripter.py --platform together

# Or manually:
pip install together
together files upload training_data/scripter_mini.jsonl
together fine-tuning create -t <FILE-ID> -m meta-llama/Meta-Llama-3.2-3B-Instruct-Turbo
```

**Training data format** (`ciphermate-training.jsonl`):
```json
{"messages": [{"role": "user", "content": "Fix this SQL injection in login.php"}, {"role": "assistant", "content": "Use parameterized queries..."}]}
{"messages": [{"role": "user", "content": "Scan for XSS"}, {"role": "assistant", "content": "..."}]}
```

### 2. Deploy (automatic)

When fine-tuning completes, Together gives you a model ID like:
```
[email protected]/Meta-Llama-3.2-3B-2024-07-11-22-57-17
```

Use it immediately via their API — no extra hosting step. Serverless LoRA inference = pay per request.

### 3. Railway: api.ciphermate.ai proxy

Railway runs a thin proxy that:
- Receives requests from the extension
- Adds auth (anonymous free tier, cm-xxx)
- Forwards to Together.ai with your API key
- Returns response

```javascript
// Railway: forwards to Together.ai
const response = await fetch('https://api.together.xyz/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.TOGETHER_API_KEY}`,
  },
  body: JSON.stringify({
    model: 'your-org/Meta-Llama-3.2-3B-your-finetune-id',
    messages: req.body.messages,
    max_tokens: req.body.max_tokens ?? 8192,
  }),
});
```

---

## Option C: RunPod (more control, GPU fine-tuning + hosting)

### 1. Fine-tune on RunPod

- Create a GPU pod (A100 ~$0.59/hr)
- Use Axolotl or Hugging Face PEFT for LoRA/QLoRA
- Output: model weights or LoRA adapters

[RunPod fine-tuning guide](https://www.runpod.io/articles/guides/fine-tuning-llama-3-1-a-step-by-step-guide-for-efficient-model-customization)

### 2. Deploy model on RunPod Serverless

- Create a Serverless Endpoint
- Use vLLM or TGI Docker image
- Load your fine-tuned model
- Get API URL: `https://api.runpod.ai/v2/your-endpoint-id/runsync`

### 3. Railway: api.ciphermate.ai proxy

Same idea — Railway forwards to RunPod endpoint with your RunPod API key.

---

## Railway setup (api.ciphermate.ai)

Railway hosts your **gateway**, not the model.

### 1. Create project

```bash
# In your backend/ folder (or new api-gateway folder)
railway init
railway up
```

### 2. Environment variables

| Variable | Purpose |
|----------|---------|
| `TOGETHER_API_KEY` | If using Together.ai |
| `RUNPOD_API_KEY` | If using RunPod |
| `SCRIPTER_MODEL_URL` | Full URL to your model (Together or RunPod) |

### 3. Proxy code (minimal)

```javascript
// Receives from extension, forwards to your model
app.post('/v1/chat/completions', async (req, res) => {
  const isAnonymous = req.headers['x-ciphermate-anonymous'] === '1';
  // TODO: check free quota for anonymous, return 402 if exhausted

  const modelUrl = process.env.SCRIPTER_MODEL_URL; // Together or RunPod
  const apiKey = process.env.TOGETHER_API_KEY || process.env.RUNPOD_API_KEY;

  const resp = await fetch(modelUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.SCRIPTER_MODEL_ID,
      messages: req.body.messages,
      max_tokens: req.body.max_tokens ?? 8192,
    }),
  });

  const data = await resp.json();
  res.status(resp.status).json(data);
});
```

### 4. Custom domain

In Railway: Settings → Domains → add `api.ciphermate.ai` (CNAME to your Railway URL).

---

## Summary

| Step | Where | What |
|------|-------|------|
| **Fine-tune (free)** | Colab + Unsloth | Train Scripter on T4 GPU, zero cost |
| **Fine-tune (paid)** | Together.ai or RunPod | Managed or more control |
| **Host (free)** | Hugging Face Inference API | ~300 req/hr free tier |
| **Host (local)** | Ollama | Run on your machine |
| **Gateway** | Railway | api.ciphermate.ai — auth, quota, forwards to model |

---

## Cost ballpark

| Service | Fine-tuning | Inference |
|---------|-------------|-----------|
| **Colab + Unsloth** | **Free** | — |
| **Hugging Face** | — | **Free** (~300 req/hr) |
| **Together.ai** | ~$5–50 for LoRA | Pay per token |
| **RunPod** | ~$0.59/hr A100 | Serverless: pay per second |
| **Railway** | — | ~$5–20/mo for gateway |
