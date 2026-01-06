# Quick Start: Training Your Model in 3 Steps

## Step 1: Generate Training Data (5 minutes)

```bash
cd ciphermate/scripts
python3 generate_training_data.py
```

This creates:
- `training_data_small.jsonl` (100 examples) - for testing
- `training_data_medium.jsonl` (1,000 examples) - recommended start
- `training_data_large.jsonl` (10,000 examples) - production

## Step 2: Train with OpenAI (Easiest - Recommended)

### Option A: Automated Script

```bash
# Set your API key
export OPENAI_API_KEY="sk-your-key-here"

# Run training script
python3 train_openai.py
```

### Option B: Manual Commands

```bash
# Install OpenAI CLI
pip install openai

# Set API key
export OPENAI_API_KEY="sk-your-key-here"

# Upload training file
openai api files.create -f training_data_medium.jsonl -p fine-tune

# Create fine-tuning job (replace FILE_ID from upload)
openai api fine_tunes.create -t FILE_ID -m gpt-3.5-turbo --suffix ciphermate-security

# Monitor training (replace FINE_TUNE_ID)
openai api fine_tunes.get -i FINE_TUNE_ID
```

**Cost**: ~$4 for 1,000 examples  
**Time**: 1-4 hours

## Step 3: Use Your Trained Model

Once training completes, you'll get a model ID like:
`ft:gpt-3.5-turbo:your-org:ciphermate-security:abc123`

### Deploy as API

Create a simple API server (see `DEPLOYMENT_GUIDE.md`) or use:

```python
import openai

# Use your fine-tuned model
response = openai.ChatCompletion.create(
    model="ft:gpt-3.5-turbo:your-org:ciphermate-security:abc123",
    messages=[{"role": "user", "content": "Scan this code..."}]
)
```

### Configure CipherMate

1. Open VS Code Settings
2. Search "CipherMate"
3. Set `Use Cloud AI` = true
4. Enter your API endpoint
5. Enter API key
6. Done!

---

## Alternative: Train with Hugging Face (Free/Open Source)

```bash
# Install dependencies
pip install transformers datasets accelerate peft

# Run training
python train_huggingface.py
```

See `PRACTICAL_TRAINING_GUIDE.md` for full Hugging Face setup.

---

## What You Get

After training, your model will:
-     Understand security vulnerability patterns
-     Generate secure code fixes
-     Explain vulnerabilities clearly
-     Work with CipherMate's tool calling system

---

## Next Steps

1. **Start Small**: Use `training_data_small.jsonl` for testing
2. **Test Model**: Verify it works on sample code
3. **Scale Up**: Use larger dataset, retrain
4. **Deploy**: Set up API endpoint
5. **Integrate**: Configure CipherMate

**Total Time to First Model**: ~2-4 hours (mostly waiting for training)

**Recommended**: Start with OpenAI fine-tuning - it's the fastest path to a working model!


