# Expert Training Data Generator - Usage Guide

## Quick Start

```bash
cd ciphermate/scripts
python3 generate_expert_training_data.py
```

Enter `10000` when prompted to generate the full dataset.

## What It Generates

### Expert Format (`expert_training_data_10000.jsonl`)
Full schema with all metadata:
- Sample IDs and contrastive pair IDs
- Multi-snippet code with roles (entrypoint, validator, mutator, sink)
- Data flow tracking
- Exploit narratives (ATT&CK-aligned)
- Why static analysis fails
- Expert characteristics
- CWE, OWASP, MITRE ATT&CK mappings

### OpenAI Format (`expert_training_data_openai_10000.jsonl`)
Ready for fine-tuning:
- System prompt with zero-trust evaluation
- User prompts with code context
- Assistant responses with vulnerability analysis

## Key Features

### 1. Contrastive Pairs
Every vulnerable sample has a safe twin:
-  ��90% identical code
- Only ONE semantic difference
- Same formatting and variable names
- Teaches model to focus on critical differences

### 2. Expert Characteristics
Each sample includes why it's expert-level:
- Requires runtime state
- Requires attacker timing
- Requires business context
- Looks secure in isolation
- etc.

### 3. Zero-Trust Evaluation
Training prompts enforce:
- Assume malicious intent
- Explain HOW exploits work
- Reject "looks safe" conclusions
- Think like attacker, not defender

### 4. Multi-Snippet Code
Code spans multiple files with:
- Entrypoint (where vulnerability triggers)
- Validator (authorization/validation)
- Mutator (state changes)
- Sink (data flow destination)

## Training Your Model

### Option 1: OpenAI Fine-Tuning (Recommended)

```bash
export OPENAI_API_KEY="sk-your-key"
python3 train_openai.py
# Select: expert_training_data_openai_10000.jsonl
```

### Option 2: Hugging Face

```bash
# Convert to Hugging Face format
python3 convert_to_hf.py expert_training_data_10000.jsonl

# Train
python3 train_huggingface.py
```

## Expected Results

After training, your model will:
-     Detect logic flaws that static analysis misses
-     Understand order-of-operations vulnerabilities
-     Recognize race conditions and timing attacks
-     Explain exploits from attacker perspective
-     Generate secure fixes with proper ordering
-     Never say "looks safe" - always assume malicious intent

## Dataset Composition

- **11 vulnerability types** covering:
  - Authorization order flaws
  - Race conditions
  - Business logic bypasses
  - State mutation issues
  - Trust boundary confusion
  - Idempotency violations
  - TOCTOU vulnerabilities
  - Session fixation
  - Privilege escalation
  - And more...

- **Multiple domains**: fintech, ecommerce, banking, healthcare, etc.
- **Multiple languages**: Python, JavaScript, Java, Go, etc.
- **ATT&CK-aligned**: Exploit narratives follow MITRE framework

## Quality Assurance

All samples:
-     Pass linters (no syntax errors)
-     Pass unit tests (logic appears correct)
-     Have security functions present
-     Fail only under adversarial reasoning

This forces the model to **reason**, not pattern-match.

---

**This is how you build a paranoid reasoning engine that cannot be bypassed.**


