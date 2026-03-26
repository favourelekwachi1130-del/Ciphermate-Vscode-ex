# Scripter Training Data

Training data for fine-tuning Scripter — CipherMate's own security model.

## Quick start (FREE)

### 1. Generate training data

```bash
# Small test set (500 samples)
python scripts/finetune_scripter.py --generate 500 --platform colab

# Or full expert dataset (10,000 samples)
python scripts/generate_expert_training_data.py
```

Output: `training_data/scripter_mini.jsonl` or `~/Desktop/expert_training_data_openai_*.jsonl`

### 2. Fine-tune for FREE on Colab + Unsloth

```bash
python scripts/finetune_scripter.py --platform colab
```

Follow the printed instructions: open an Unsloth notebook on Colab, upload your data, run. Uses free T4 GPU.

### 3. Export to GGUF and test in LM Studio

**In Colab:** `model.save_pretrained_gguf("scripter_gguf", tokenizer, quantization_method="q4_k_m")`

**Or from HF/local:** `python scripts/export_scripter_to_gguf.py --model your-username/scripter`

Import: `lms import /path/to/model.gguf` — then load and chat in LM Studio.

Point CipherMate at it: `ciphermate.scripterMax.apiUrl` = `http://localhost:1234/v1`

### 4. Host for free

Push to Hugging Face → use their free Inference API (~300 req/hr).

---

## Paid options

**Together.ai** (simplest, no GPU):
```bash
export TOGETHER_API_KEY=your-key
python scripts/finetune_scripter.py --platform together
```

**RunPod** (GPU control):
```bash
python scripts/finetune_scripter.py --platform runpod
```

## Data format

Each line must be JSON with a `messages` array:

```json
{
  "messages": [
    {"role": "system", "content": "You are Scripter..."},
    {"role": "user", "content": "Fix this SQL injection..."},
    {"role": "assistant", "content": "Use parameterized queries..."}
  ]
}
```

### Tool-calling format

For teaching the model when to call tools, use `tool_calls` in the assistant message:

```json
{
  "messages": [
    {"role": "system", "content": "You are Scripter. Use tools..."},
    {"role": "user", "content": "scan my repository"},
    {"role": "assistant", "content": null, "tool_calls": [{"id": "call_1", "type": "function", "function": {"name": "scan_repository", "arguments": "{\"path\": \"/workspace\"}"}}]}
  ]
}
```

See `TOOL_CALLING_SCHEMA.md` and `tool_calling_samples.jsonl`. **To generate tool-calling data (varied, no duplicates):**

```bash
python training_data/merge_tool_calling_jsonl.py
```

Output: `training_data/fireworks/ciphermate_tool_calling.jsonl` (100+ unique samples). If you already have a JSONL with the same line repeated, fix it with:

```bash
python training_data/dedupe_jsonl.py path/to/your_file.jsonl -o path/to/deduped.jsonl
```

Merge with scripter_mini for full training:

```bash
cat training_data/fireworks/ciphermate_tool_calling.jsonl training_data/scripter_mini.jsonl > combined_training.jsonl
```

## Optional: RunPod

For GPU-backed fine-tuning with more control:

```bash
python scripts/finetune_scripter.py --platform runpod
```

This generates an Axolotl config. Run the actual training on a RunPod GPU pod.
