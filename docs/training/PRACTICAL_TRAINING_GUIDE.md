# Practical Training Guide - Getting Started

## Quick Start: Choose Your Path

### Option 1: Fine-Tune Existing Model (Recommended - Fastest)
**Best for**: Getting started quickly, leveraging existing AI capabilities  
**Time**: 1-2 weeks  
**Cost**: $100-500 for initial training

### Option 2: Train from Scratch
**Best for**: Maximum control, specialized architecture  
**Time**: 2-3 months  
**Cost**: $5,000-50,000+

**Recommendation**: Start with Option 1, then consider Option 2 if needed.

---

## Option 1: Fine-Tuning Existing Models

### Step 1: Choose Your Base Model

#### Option A: OpenAI Fine-Tuning (Easiest)
- **Model**: GPT-3.5-turbo or GPT-4
- **Cost**: ~$0.008 per 1K tokens for training
- **API**: Use OpenAI's fine-tuning API
- **Best for**: Quick start, excellent results

#### Option B: Anthropic Claude Fine-Tuning
- **Model**: Claude 3 (when available)
- **Cost**: Similar to OpenAI
- **Best for**: High-quality responses

#### Option C: Open Source Models (Free/Cheap)
- **Models**: Llama 3, Mistral, CodeLlama
- **Platforms**: Hugging Face, Together.ai, Replicate
- **Cost**: $0-100 for training
- **Best for**: Privacy, cost control

### Step 2: Prepare Your Training Data

#### Create Training Dataset

Create a file `training_data.jsonl` (JSON Lines format):

```jsonl
{"messages": [{"role": "system", "content": "You are CipherMate, a security analysis AI..."}, {"role": "user", "content": "Scan this code for vulnerabilities:\n\nconst query = 'SELECT * FROM users WHERE id = ' + userId;"}, {"role": "assistant", "content": "I found a SQL injection vulnerability. The user input is directly concatenated into the SQL query without sanitization.\n\nVulnerability:\n- Type: SQL_INJECTION\n- Severity: CRITICAL\n- Code: const query = 'SELECT * FROM users WHERE id = ' + userId;\n- Fix: Use parameterized queries: const query = 'SELECT * FROM users WHERE id = ?'; db.query(query, [userId]);"}]}
{"messages": [{"role": "system", "content": "You are CipherMate..."}, {"role": "user", "content": "Analyze this authentication code:\n\nif (password === 'admin123') {\n  login();\n}"}, {"role": "assistant", "content": "Found hardcoded password vulnerability.\n\n- Type: HARDCODED_PASSWORD\n- Severity: CRITICAL\n- Fix: Use password hashing: if (bcrypt.compareSync(password, storedHash)) {\n  login();\n}"}]}
```

#### Data Collection Script

Create `collect_training_data.py`:

```python
import json
import os
from pathlib import Path

def create_training_example(vulnerable_code, language, fix, explanation):
    """Create a training example in OpenAI format"""
    return {
        "messages": [
            {
                "role": "system",
                "content": "You are CipherMate, an expert security analysis AI specialized in finding and fixing vulnerabilities in code. Be precise, technical, and security-focused."
            },
            {
                "role": "user",
                "content": f"Analyze this {language} code for security vulnerabilities:\n\n```{language}\n{vulnerable_code}\n```"
            },
            {
                "role": "assistant",
                "content": f"{explanation}\n\nSecure Fix:\n```{language}\n{fix}\n```"
            }
        ]
    }

# Example vulnerabilities to train on
training_examples = [
    {
        "code": "const query = 'SELECT * FROM users WHERE id = ' + userId;",
        "language": "javascript",
        "fix": "const query = 'SELECT * FROM users WHERE id = ?';\ndb.query(query, [userId]);",
        "explanation": "SQL Injection vulnerability: User input directly concatenated into query. Use parameterized queries."
    },
    {
        "code": "document.getElementById('output').innerHTML = userInput;",
        "language": "javascript",
        "fix": "document.getElementById('output').textContent = userInput;",
        "explanation": "XSS vulnerability: innerHTML allows script injection. Use textContent or sanitize with DOMPurify."
    },
    # Add more examples...
]

# Generate training file
with open('training_data.jsonl', 'w') as f:
    for example in training_examples:
        training_example = create_training_example(
            example['code'],
            example['language'],
            example['fix'],
            example['explanation']
        )
        f.write(json.dumps(training_example) + '\n')

print(f"Created {len(training_examples)} training examples")
```

### Step 3: Train with OpenAI (Easiest Method)

#### Install OpenAI CLI

```bash
pip install openai
```

#### Upload Training Data

```bash
# Set your API key
export OPENAI_API_KEY="sk-your-key-here"

# Upload training file
openai api fine_tunes.create \
  -t training_data.jsonl \
  -m gpt-3.5-turbo \
  --suffix "ciphermate-security"
```

#### Monitor Training

```bash
# Check status
openai api fine_tunes.get -i ft-abc123

# List all fine-tunes
openai api fine_tunes.list
```

#### Use Your Trained Model

```python
import openai

response = openai.ChatCompletion.create(
    model="ft:gpt-3.5-turbo:your-org:ciphermate-security:abc123",
    messages=[
        {"role": "user", "content": "Scan this code: const query = 'SELECT * FROM users WHERE id = ' + userId;"}
    ]
)
```

### Step 4: Train with Open Source Models (Hugging Face)

#### Install Dependencies

```bash
pip install transformers datasets accelerate peft bitsandbytes
```

#### Training Script

Create `train_model.py`:

```python
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
    Trainer,
    DataCollatorForLanguageModeling
)
from datasets import load_dataset
from peft import LoraConfig, get_peft_model, TaskType

# Load base model (Llama 3, Mistral, etc.)
model_name = "meta-llama/Meta-Llama-3-8B"  # or "mistralai/Mistral-7B-v0.1"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(model_name)

# Configure LoRA for efficient fine-tuning
lora_config = LoraConfig(
    task_type=TaskType.CAUSAL_LM,
    r=16,
    lora_alpha=32,
    lora_dropout=0.05,
    target_modules=["q_proj", "v_proj"]
)

model = get_peft_model(model, lora_config)

# Load your training data
dataset = load_dataset("json", data_files="training_data.jsonl")

# Training arguments
training_args = TrainingArguments(
    output_dir="./ciphermate-model",
    num_train_epochs=3,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,
    warmup_steps=100,
    logging_steps=10,
    save_steps=500,
    learning_rate=2e-4,
    fp16=True,
)

# Create trainer
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=dataset["train"],
    data_collator=DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False)
)

# Train
trainer.train()

# Save model
model.save_pretrained("./ciphermate-model")
tokenizer.save_pretrained("./ciphermate-model")
```

#### Run Training

```bash
# For GPU training (recommended)
python train_model.py

# For CPU (slow, not recommended)
CUDA_VISIBLE_DEVICES="" python train_model.py
```

### Step 5: Deploy Your Trained Model

#### Option A: Deploy to Hugging Face

```python
from transformers import AutoModelForCausalLM, AutoTokenizer

model = AutoModelForCausalLM.from_pretrained("./ciphermate-model")
tokenizer = AutoTokenizer.from_pretrained("./ciphermate-model")

# Push to Hugging Face
model.push_to_hub("your-username/ciphermate-security-ai")
tokenizer.push_to_hub("your-username/ciphermate-security-ai")
```

#### Option B: Deploy as API (FastAPI)

Create `api_server.py`:

```python
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

app = FastAPI()

# Load your trained model
model = AutoModelForCausalLM.from_pretrained("./ciphermate-model")
tokenizer = AutoTokenizer.from_pretrained("./ciphermate-model")
model.eval()

class ChatRequest(BaseModel):
    model: str
    messages: list
    temperature: float = 0.7
    max_tokens: int = 2000

@app.post("/v1/chat/completions")
async def chat_completions(request: ChatRequest, authorization: str = Header(None)):
    # Verify API key
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    
    # Format messages
    prompt = format_messages(request.messages)
    
    # Generate response
    inputs = tokenizer(prompt, return_tensors="pt")
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_length=inputs.input_ids.shape[1] + request.max_tokens,
            temperature=request.temperature,
            do_sample=True
        )
    
    response_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
    
    return {
        "choices": [{
            "message": {
                "role": "assistant",
                "content": response_text
            }
        }]
    }

def format_messages(messages):
    """Format messages for model input"""
    formatted = ""
    for msg in messages:
        formatted += f"{msg['role']}: {msg['content']}\n"
    return formatted

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

---

## Option 2: Use Training Platforms (No Code Required)

### Platform 1: OpenAI Fine-Tuning Dashboard

1. Go to https://platform.openai.com/finetune
2. Upload your `training_data.jsonl`
3. Click "Create Fine-Tune"
4. Wait for training (usually 1-4 hours)
5. Get your model ID
6. Use in API calls

### Platform 2: Hugging Face AutoTrain

1. Go to https://huggingface.co/autotrain
2. Upload your dataset
3. Select base model
4. Configure training parameters
5. Start training (runs in cloud)
6. Download or deploy trained model

### Platform 3: Together.ai Fine-Tuning

1. Sign up at https://together.ai
2. Upload training data
3. Select model (Llama, Mistral, etc.)
4. Start fine-tuning
5. Deploy as API endpoint
6. Use in CipherMate

### Platform 4: Replicate Training

1. Go to https://replicate.com
2. Use their training API
3. Upload your data
4. Train model
5. Deploy as API

---

## Data Collection Strategies

### Strategy 1: Synthetic Data Generation

Create `generate_training_data.py`:

```python
import json
import random

vulnerability_patterns = {
    "SQL_INJECTION": {
        "vulnerable": [
            "const query = 'SELECT * FROM users WHERE id = ' + userId;",
            "const sql = `SELECT * FROM products WHERE name='${productName}'`;",
            "query = f\"SELECT * FROM users WHERE email='{email}'\""
        ],
        "secure": [
            "const query = 'SELECT * FROM users WHERE id = ?';\ndb.query(query, [userId]);",
            "const sql = 'SELECT * FROM products WHERE name=?';\ndb.query(sql, [productName]);",
            "query = 'SELECT * FROM users WHERE email=?'\ncursor.execute(query, (email,))"
        ]
    },
    "XSS": {
        "vulnerable": [
            "document.getElementById('output').innerHTML = userInput;",
            "element.innerHTML = comment;",
            "response.write(userData);"
        ],
        "secure": [
            "document.getElementById('output').textContent = userInput;",
            "element.textContent = comment;",
            "response.write(escapeHtml(userData));"
        ]
    }
    # Add more patterns...
}

def generate_training_examples(count=1000):
    examples = []
    for _ in range(count):
        vuln_type = random.choice(list(vulnerability_patterns.keys()))
        pattern = vulnerability_patterns[vuln_type]
        
        vulnerable = random.choice(pattern["vulnerable"])
        secure = random.choice(pattern["secure"])
        
        example = {
            "messages": [
                {"role": "system", "content": "You are CipherMate security AI."},
                {"role": "user", "content": f"Analyze this code:\n\n{vulnerable}"},
                {"role": "assistant", "content": f"Found {vuln_type} vulnerability. Secure fix:\n\n{secure}"}
            ]
        }
        examples.append(example)
    
    return examples

# Generate 10,000 examples
examples = generate_training_examples(10000)

with open('synthetic_training_data.jsonl', 'w') as f:
    for ex in examples:
        f.write(json.dumps(ex) + '\n')
```

### Strategy 2: Real-World Code Collection

```python
import os
import json
from pathlib import Path

def scan_github_repos_for_vulnerabilities():
    """Scan real GitHub repositories for known vulnerabilities"""
    # Use tools like Semgrep, CodeQL to find vulnerabilities
    # Then create training examples from real code
    pass

def create_examples_from_semgrep_results(semgrep_output):
    """Convert Semgrep results to training examples"""
    results = json.loads(semgrep_output)
    examples = []
    
    for result in results.get('results', []):
        example = {
            "messages": [
                {"role": "system", "content": "You are CipherMate security AI."},
                {"role": "user", "content": f"Analyze: {result['extra']['lines']}"},
                {"role": "assistant", "content": f"Found {result['check_id']}: {result['message']}"}
            ]
        }
        examples.append(example)
    
    return examples
```

### Strategy 3: Use Existing Security Datasets

- **OWASP Top 10 Examples**: Real vulnerability patterns
- **CVE Database**: Known vulnerabilities with code examples
- **Security Benchmarks**: NIST, SANS examples
- **GitHub Security Advisories**: Real-world examples

---

## Recommended Training Pipeline

### Phase 1: Start Small (Week 1)
- Collect 100-500 examples
- Fine-tune GPT-3.5-turbo
- Test on sample code
- **Goal**: Proof of concept

### Phase 2: Expand Dataset (Week 2-3)
- Collect 1,000-5,000 examples
- Include multiple vulnerability types
- Add language diversity
- **Goal**: Better coverage

### Phase 3: Production Training (Week 4+)
- 10,000+ examples
- Include edge cases
- Add tool calling examples
- **Goal**: Production-ready model

---

## Cost Estimates

### OpenAI Fine-Tuning
- Training: ~$0.008 per 1K tokens
- 10K examples (~500K tokens): ~$4
- Inference: Same as base model pricing

### Open Source (Self-Hosted)
- Training: Free (your hardware) or $50-200 (cloud GPU)
- Inference: $0.001-0.01 per request (cloud) or free (self-hosted)

### Managed Platforms
- Together.ai: ~$0.20 per 1M tokens
- Replicate: Pay per training run + inference

---

## Quick Start Checklist

- [ ] Choose base model (GPT-3.5-turbo recommended for start)
- [ ] Collect/create 100+ training examples
- [ ] Format as JSONL (OpenAI format)
- [ ] Upload to OpenAI or training platform
- [ ] Start fine-tuning
- [ ] Test trained model
- [ ] Deploy as API
- [ ] Configure CipherMate with API endpoint
- [ ] Test end-to-end
- [ ] Scale up dataset and retrain

---

## Next Steps

1. **Start Small**: Create 100 examples, fine-tune GPT-3.5-turbo
2. **Test**: Verify model works on sample code
3. **Iterate**: Add more examples, retrain
4. **Deploy**: Set up API endpoint
5. **Scale**: Expand dataset, improve model

**Recommended First Step**: Use OpenAI fine-tuning with 100-500 examples to get started quickly!


