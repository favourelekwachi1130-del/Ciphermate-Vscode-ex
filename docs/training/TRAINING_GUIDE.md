# Model Training Guide - Step by Step

## Overview

This guide walks you through actually training your CipherMate security AI model. We'll use open-source tools and your own data.

## Option 1: Fine-tune an Existing Model (Recommended to Start)

### Step 1: Choose a Base Model

**Best Options:**

1. **Llama 3 8B** (Recommended)
   - Open source, Apache 2.0 license
   - Good balance of capability and size
   - Download: https://huggingface.co/meta-llama/Meta-Llama-3-8B-Instruct

2. **Mistral 7B**
   - Strong code understanding
   - Download: https://huggingface.co/mistralai/Mistral-7B-Instruct-v0.2

3. **CodeLlama 7B**
   - Specifically trained on code
   - Download: https://huggingface.co/codellama/CodeLlama-7b-Instruct-hf

### Step 2: Set Up Training Environment

#### Using Google Colab (Free - Good for Testing)

```python
# Install dependencies
!pip install transformers datasets peft accelerate bitsandbytes
!pip install trl torch torchvision torchaudio

# Mount Google Drive for data storage
from google.colab import drive
drive.mount('/content/drive')
```

#### Using Local Machine with GPU

```bash
# Create conda environment
conda create -n ciphermate-training python=3.10
conda activate ciphermate-training

# Install PyTorch (check your CUDA version)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# Install training libraries
pip install transformers datasets peft accelerate bitsandbytes trl
```

#### Using Cloud Instance (AWS, GCP, Azure)

- AWS: g4dn.xlarge or p3.2xlarge instances
- Google Cloud: n1-standard-4 with GPU (T4 or V100)
- Azure: NC-series with GPU

### Step 3: Prepare Training Data

Create a script to convert your training examples to the format needed:

```python
# prepare_training_data.py
import json
from datasets import Dataset

def convert_to_training_format(examples):
    """Convert CipherMate examples to training format"""
    formatted = []
    
    for example in examples:
        # Load your training data
        with open(f'training_data/{example}.json', 'r') as f:
            data = json.load(f)
        
        # Format as instruction-following
        instruction = data['instruction']
        input_text = json.dumps(data.get('input', {}))
        output_text = json.dumps(data['output'])
        
        # Create prompt template
        prompt = f"""<|begin_of_text|><|start_header_id|>system<|end_header_id|>

You are CipherMate, an expert security analysis AI. Analyze code for vulnerabilities and generate secure fixes.

<|eot_id|><|start_header_id|>user<|end_header_id|>

{instruction}

Input:
{input_text}

<|eot_id|><|start_header_id|>assistant<|end_header_id|>

{output_text}<|eot_id|>"""
        
        formatted.append({
            "text": prompt
        })
    
    return formatted

# Load your examples
examples = ["example1", "example2", ...]  # Your training file names
formatted_data = convert_to_training_format(examples)

# Create dataset
dataset = Dataset.from_list(formatted_data)
dataset.save_to_disk("ciphermate_training_dataset")
```

### Step 4: Fine-tune with LoRA (Recommended)

LoRA (Low-Rank Adaptation) is efficient and requires less GPU memory:

```python
# train_model.py
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
    Trainer,
    DataCollatorForLanguageModeling
)
from peft import LoraConfig, get_peft_model, TaskType
from datasets import load_from_disk
import torch

# Load model and tokenizer
model_name = "meta-llama/Meta-Llama-3-8B-Instruct"  # or your chosen model
tokenizer = AutoTokenizer.from_pretrained(model_name)
tokenizer.pad_token = tokenizer.eos_token

model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype=torch.float16,
    device_map="auto",
    load_in_8bit=True  # Use 8-bit quantization to save memory
)

# Configure LoRA
lora_config = LoraConfig(
    task_type=TaskType.CAUSAL_LM,
    r=16,  # Rank
    lora_alpha=32,
    lora_dropout=0.1,
    target_modules=["q_proj", "v_proj", "k_proj", "o_proj"]  # Llama attention modules
)

model = get_peft_model(model, lora_config)
model.print_trainable_parameters()  # Should show ~1% of parameters trainable

# Load dataset
dataset = load_from_disk("ciphermate_training_dataset")

# Tokenize
def tokenize_function(examples):
    return tokenizer(
        examples["text"],
        truncation=True,
        max_length=2048,
        padding="max_length"
    )

tokenized_dataset = dataset.map(tokenize_function, batched=True)

# Split into train/val
train_test = tokenized_dataset.train_test_split(test_size=0.1)
train_dataset = train_test["train"]
val_dataset = train_test["test"]

# Training arguments
training_args = TrainingArguments(
    output_dir="./ciphermate-ai-finetuned",
    num_train_epochs=3,
    per_device_train_batch_size=2,  # Adjust based on GPU memory
    per_device_eval_batch_size=2,
    gradient_accumulation_steps=4,
    warmup_steps=100,
    learning_rate=2e-4,
    fp16=True,
    logging_steps=10,
    eval_strategy="steps",
    eval_steps=100,
    save_strategy="steps",
    save_steps=200,
    load_best_model_at_end=True,
    report_to="tensorboard"
)

# Data collator
data_collator = DataCollatorForLanguageModeling(
    tokenizer=tokenizer,
    mlm=False
)

# Trainer
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=val_dataset,
    data_collator=data_collator,
)

# Train!
trainer.train()

# Save model
trainer.save_model("./ciphermate-ai-final")
tokenizer.save_pretrained("./ciphermate-ai-final")
```

### Step 5: Test Your Model

```python
# test_model.py
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
import torch

# Load base model
base_model = "meta-llama/Meta-Llama-3-8B-Instruct"
model = AutoModelForCausalLM.from_pretrained(
    base_model,
    torch_dtype=torch.float16,
    device_map="auto"
)

# Load LoRA weights
model = PeftModel.from_pretrained(model, "./ciphermate-ai-final")
model = model.merge_and_unload()  # Merge LoRA weights

tokenizer = AutoTokenizer.from_pretrained("./ciphermate-ai-final")

# Test prompt
prompt = """<|begin_of_text|><|start_header_id|>system<|end_header_id|>

You are CipherMate security AI.

<|eot_id|><|start_header_id|>user<|end_header_id|>

Analyze this code for security vulnerabilities:

Code:
const query = 'SELECT * FROM users WHERE id = ' + userId;

<|eot_id|><|start_header_id|>assistant<|end_header_id|>

"""

inputs = tokenizer(prompt, return_tensors="pt").to("cuda")
outputs = model.generate(
    **inputs,
    max_new_tokens=500,
    temperature=0.7,
    do_sample=True
)

response = tokenizer.decode(outputs[0], skip_special_tokens=False)
print(response)
```

## Option 2: Full Fine-tuning (More Resources Needed)

If you have more GPU memory and want better results:

```python
# Full fine-tuning (no LoRA)
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype=torch.float16,
    device_map="auto"
)

# Training with larger batch size
training_args = TrainingArguments(
    output_dir="./ciphermate-ai-full",
    num_train_epochs=3,
    per_device_train_batch_size=8,
    per_device_eval_batch_size=8,
    gradient_accumulation_steps=2,
    learning_rate=1e-5,  # Lower learning rate for full fine-tuning
    fp16=True,
    # ... rest of args
)
```

## Option 3: Training from Scratch (Advanced)

Only if you want complete control and have massive resources:

```python
# This requires:
# 1. Starting from a smaller model architecture
# 2. Pre-training on code data first
# 3. Then fine-tuning on security data
# 4. Requires significant compute (100+ GPUs recommended)

# See training script examples in:
# - https://github.com/huggingface/transformers/tree/main/examples/pytorch/language-modeling
# - https://github.com/facebookresearch/llama
```

## Quick Start: Using Hugging Face Transformers

### Minimal Training Script

```python
# minimal_train.py
from transformers import AutoTokenizer, AutoModelForCausalLM, Trainer, TrainingArguments
from datasets import Dataset
import json

# 1. Load base model
model_name = "mistralai/Mistral-7B-Instruct-v0.2"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(model_name)

# 2. Prepare data
training_data = []
# Add your training examples here
# Format: {"text": "your formatted prompt and response"}

dataset = Dataset.from_list(training_data)

# 3. Tokenize
def tokenize(examples):
    return tokenizer(examples["text"], truncation=True, max_length=2048)

tokenized = dataset.map(tokenize, batched=True)

# 4. Train
training_args = TrainingArguments(
    output_dir="./results",
    num_train_epochs=3,
    per_device_train_batch_size=4,
    save_steps=100,
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized,
)

trainer.train()
trainer.save_model("./ciphermate-model")
```

## Data Collection Strategy

### Start Small, Iterate

1. **Phase 1: 100 Examples**
   - 50 vulnerability detection examples
   - 50 fix generation examples
   - Test training pipeline

2. **Phase 2: 1,000 Examples**
   - Expand to cover common vulnerabilities
   - Add multiple languages
   - Evaluate performance

3. **Phase 3: 10,000+ Examples**
   - Comprehensive coverage
   - Edge cases
   - Framework-specific patterns

### Where to Get Training Data

1. **Public Datasets**
   - GitHub security advisories
   - OWASP examples
   - CVE descriptions with code examples

2. **Your Own Code**
   - Analyze real codebases
   - Create vulnerability examples
   - Generate fixes

3. **Synthetic Generation**
   - Use GPT-4/Claude to generate training examples
   - Validate and refine manually

## Recommended Training Setup

### For Testing (Free)
- **Platform**: Google Colab Pro ($10/month)
- **GPU**: T4 (16GB)
- **Model**: Llama 3 8B with LoRA
- **Data**: Start with 100-500 examples
- **Time**: 1-2 hours training

### For Production
- **Platform**: AWS/GCP (p3.2xlarge or better)
- **GPU**: V100 or A100 (32GB+)
- **Model**: Llama 3 8B or 70B
- **Data**: 10,000+ examples
- **Time**: 4-8 hours training

## Deployment After Training

Once trained, convert to serving format:

```python
# convert_for_serving.py
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

# Load your trained model
model = AutoModelForCausalLM.from_pretrained("./ciphermate-ai-final")
tokenizer = AutoTokenizer.from_pretrained("./ciphermate-ai-final")

# Convert to ONNX or use vLLM for serving
# Option 1: Use vLLM (recommended for serving)
# pip install vllm
# Then serve with: python -m vllm.entrypoints.openai.api_server --model ./ciphermate-ai-final

# Option 2: Use text-generation-inference
# docker run --gpus all -p 8080:80 -v ./ciphermate-ai-final:/model \
#   ghcr.io/huggingface/text-generation-inference:latest \
#   --model-id /model
```

## Next Steps

1. **Start Small**: Get 100 training examples
2. **Test Pipeline**: Run training on Colab
3. **Evaluate**: Test on held-out examples
4. **Iterate**: Add more data, refine
5. **Scale**: Move to cloud GPU for full training
6. **Deploy**: Serve with vLLM or similar

## Resources

- **Hugging Face Course**: https://huggingface.co/learn/nlp-course
- **LoRA Paper**: https://arxiv.org/abs/2106.09685
- **Transformers Docs**: https://huggingface.co/docs/transformers
- **Example Notebooks**: https://github.com/huggingface/notebooks

---

**Pro Tip**: Start with LoRA fine-tuning on 100 examples to validate your pipeline, then scale up!

