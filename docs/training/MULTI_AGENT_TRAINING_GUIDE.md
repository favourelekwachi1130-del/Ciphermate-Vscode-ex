# Multi-Agent Training Guide

## Overview

Train 5 specialized agents that work together:
1. **Scanner Agent** - Fast detection
2. **Analyzer Agent** - Deep reasoning  
3. **Fix Agent** - Secure code generation
4. **Explainer Agent** - Exploit narratives
5. **Orchestrator Agent** - Coordination

## Step 1: Split Your Training Data

### Quick Start

```bash
cd ciphermate/scripts
python3 split_agent_training_data.py
```

**What it does:**
- Takes your 759k samples from Desktop
- Splits into 5 specialized datasets:
  - Scanner: ~150k samples (fast detection)
  - Analyzer: ~400k samples (your expert-level data)
  - Fix: ~150k samples (vulnerable  †  secure)
  - Explainer: ~50k samples (exploit narratives)
  - Orchestrator: ~10k samples (coordination examples)

**Output:** `~/Desktop/agent_training_datasets/` directory

---

## Step 2: Train Each Agent (Recommended Order)

### Training Order

Train in this order for best results:

1. **Analyzer Agent** (highest priority - core reasoning)
2. **Scanner Agent** (needed for initial detection)
3. **Fix Agent** (depends on Scanner/Analyzer findings)
4. **Explainer Agent** (enhances Analyzer output)
5. **Orchestrator Agent** (coordinates all agents - train last)

---

## Option A: OpenAI Fine-Tuning (Easiest)

### Prerequisites

```bash
# Install OpenAI CLI
pip install openai

# Set API key
export OPENAI_API_KEY="sk-your-key-here"
```

### Train Each Agent

#### 1. Analyzer Agent (Core - Start Here)

```bash
cd ~/Desktop/agent_training_datasets

# Check file size first (OpenAI limit: 512MB)
ls -lh analyzer_agent_training.jsonl

# If > 512MB, split it:
split -l 100000 analyzer_agent_training.jsonl analyzer_part_

# Upload and train
openai api files.create -f analyzer_agent_training.jsonl -p fine-tune

# Copy the file ID, then:
openai api fine_tunes.create \
  -t file-abc123 \
  -m gpt-3.5-turbo \
  --suffix ciphermate-analyzer

# Save the fine-tune job ID (ft-xxx)
# Monitor with: openai api fine_tunes.get -i ft-xxx
```

**Estimated Cost:** $200-800 (400k samples)
**Time:** 2-6 hours

#### 2. Scanner Agent

```bash
openai api files.create -f scanner_agent_training.jsonl -p fine-tune
openai api fine_tunes.create \
  -t file-xyz789 \
  -m gpt-3.5-turbo \
  --suffix ciphermate-scanner
```

**Estimated Cost:** $75-300 (150k samples)
**Time:** 1-3 hours

#### 3. Fix Agent

```bash
openai api files.create -f fix_agent_training.jsonl -p fine-tune
openai api fine_tunes.create \
  -t file-def456 \
  -m gpt-3.5-turbo \
  --suffix ciphermate-fix
```

**Estimated Cost:** $75-300 (150k samples)
**Time:** 1-3 hours

#### 4. Explainer Agent

```bash
openai api files.create -f explainer_agent_training.jsonl -p fine-tune
openai api fine_tunes.create \
  -t file-ghi789 \
  -m gpt-3.5-turbo \
  --suffix ciphermate-explainer
```

**Estimated Cost:** $25-100 (50k samples)
**Time:** 30min-2 hours

#### 5. Orchestrator Agent

```bash
openai api files.create -f orchestrator_agent_training.jsonl -p fine-tune
openai api fine_tunes.create \
  -t file-jkl012 \
  -m gpt-3.5-turbo \
  --suffix ciphermate-orchestrator
```

**Estimated Cost:** $5-20 (10k samples)
**Time:** 15min-1 hour

---

### Total Cost Estimate (OpenAI)

- **Analyzer**: $200-800
- **Scanner**: $75-300
- **Fix**: $75-300
- **Explainer**: $25-100
- **Orchestrator**: $5-20

**Total: $380-1,520** for all 5 agents

---

## Option B: Hugging Face (Open Source)

### Prerequisites

```bash
pip install transformers datasets accelerate
pip install peft bitsandbytes  # For LoRA fine-tuning
```

### Train with Hugging Face

```python
# train_agent_huggingface.py
from transformers import AutoTokenizer, AutoModelForCausalLM
from datasets import load_dataset
from transformers import TrainingArguments, Trainer

# For each agent, train separately:
agent_name = "analyzer"  # or scanner, fix, explainer, orchestrator
model_name = "mistralai/Mistral-7B-Instruct-v0.2"  # or llama-3, etc.

tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(model_name)

# Load your training data
dataset = load_dataset("json", data_files=f"{agent_name}_agent_training.jsonl")

# Configure training
training_args = TrainingArguments(
    output_dir=f"./models/{agent_name}_agent",
    num_train_epochs=3,
    per_device_train_batch_size=4,
    learning_rate=2e-5,
    save_steps=500,
    logging_steps=100,
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=dataset["train"],
)

trainer.train()
trainer.save_model()
```

**Cost:** $0-100 (if using free GPU or cloud GPU credits)
**Time:** 4-12 hours per agent (depends on GPU)

---

## Option C: Automated Training Script

I'll create a script that automates training all agents:

```bash
python3 train_all_agents.py --platform openai --api-key sk-xxx
```

---

## Step 3: Save Your Model IDs

After training, save your model IDs:

```bash
# Create models.txt
cat > ~/Desktop/agent_models.txt << EOF
Analyzer Agent: ft:gpt-3.5-turbo-0613:org:ciphermate-analyzer:abc123
Scanner Agent: ft:gpt-3.5-turbo-0613:org:ciphermate-scanner:xyz789
Fix Agent: ft:gpt-3.5-turbo-0613:org:ciphermate-fix:def456
Explainer Agent: ft:gpt-3.5-turbo-0613:org:ciphermate-explainer:ghi789
Orchestrator Agent: ft:gpt-3.5-turbo-0613:org:ciphermate-orchestrator:jkl012
EOF
```

---

## Step 4: Test Individual Agents

Before deploying as multi-agent system, test each agent:

```python
# test_agent.py
import openai

analyzer_model = "ft:gpt-3.5-turbo-0613:org:ciphermate-analyzer:abc123"

response = openai.ChatCompletion.create(
    model=analyzer_model,
    messages=[
        {"role": "system", "content": "You are CipherMate Analyzer Agent..."},
        {"role": "user", "content": "Analyze this code for logic flaws..."}
    ]
)

print(response.choices[0].message.content)
```

---

## Step 5: Build Multi-Agent System

Once all agents are trained, implement the communication layer and orchestrator.

See `MULTI_AGENT_ARCHITECTURE.md` for implementation details.

---

## Quick Start Commands

### Full Training Pipeline (OpenAI)

```bash
# 1. Split data
cd ciphermate/scripts
python3 split_agent_training_data.py

# 2. Train Analyzer (most important)
cd ~/Desktop/agent_training_datasets
export OPENAI_API_KEY="sk-your-key"

# Upload
FILE_ID=$(openai api files.create -f analyzer_agent_training.jsonl -p fine-tune | grep -o 'file-[a-zA-Z0-9]*' | head -1)

# Train
FT_ID=$(openai api fine_tunes.create -t $FILE_ID -m gpt-3.5-turbo --suffix ciphermate-analyzer | grep -o 'ft-[a-zA-Z0-9]*' | head -1)

echo "Analyzer Agent Training ID: $FT_ID"
echo "Monitor: openai api fine_tunes.get -i $FT_ID"

# Repeat for other agents...
```

---

## Training Tips

### 1. Start Small
- Train Analyzer Agent first
- Test it thoroughly
- Then train other agents

### 2. Monitor Costs
- OpenAI shows usage in dashboard
- Stop if costs exceed budget
- Consider Hugging Face for cost control

### 3. File Size Limits
- OpenAI: 512MB per file max
- Split large files: `split -l 100000 file.jsonl part_`

### 4. Training Time
- OpenAI: 1-6 hours per agent
- Hugging Face: 4-12 hours per agent (on GPU)

### 5. Quality Over Quantity
- Start with 50k-100k samples per agent
- Test and iterate
- Add more data if needed

---

## Next Steps After Training

1.     Train all 5 agents
2.     Test each agent individually
3.     Build orchestrator service
4.     Implement agent communication layer
5.     Deploy as API
6.     Configure CipherMate to use multi-agent API

---

## Cost Optimization

### Option 1: Train Critical Agents First
- Start with Analyzer (core reasoning)
- Add Scanner for speed
- Add others as needed

### Option 2: Use Smaller Models
- GPT-3.5-turbo instead of GPT-4
- Mistral-7B instead of larger models
- ~10x cost savings

### Option 3: Train in Phases
- Phase 1: Analyzer + Scanner (minimal viable)
- Phase 2: Add Fix + Explainer
- Phase 3: Add Orchestrator

### Option 4: Hugging Face Free Tier
- Use free GPU credits
- Train on local GPU if available
- Cost: $0 (time investment only)

---

## Troubleshooting

### File Too Large
```bash
# Split large files
split -l 100000 large_file.jsonl split_file_

# Train each part, then combine models or use ensemble
```

### Training Fails
- Check data format (valid JSONL)
- Verify API key and quota
- Try smaller dataset first

### Out of Memory (Hugging Face)
- Reduce batch size
- Use gradient accumulation
- Use LoRA/QLoRA for efficient fine-tuning

---

## Recommended Training Plan

### Week 1: Core Agents
- Day 1-2: Train Analyzer Agent
- Day 3: Test Analyzer
- Day 4-5: Train Scanner Agent
- Day 6-7: Test Scanner + Analyzer together

### Week 2: Enhancement Agents
- Day 1-2: Train Fix Agent
- Day 3-4: Train Explainer Agent
- Day 5-6: Test all 4 agents
- Day 7: Integration testing

### Week 3: Orchestration
- Day 1-2: Train Orchestrator Agent
- Day 3-4: Build multi-agent system
- Day 5-7: End-to-end testing and deployment

---

**You're ready to start training!**     

Begin with Step 1 (split data), then train Analyzer Agent first.


