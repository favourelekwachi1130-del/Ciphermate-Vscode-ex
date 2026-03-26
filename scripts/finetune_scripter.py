#!/usr/bin/env python3
"""
Fine-tune Scripter — CipherMate's own model

Creates a custom security-focused model for the CipherMate workspace.
Supports Colab+Unsloth (FREE), Together.ai (paid), and RunPod.

Usage:
  # FREE: Generate data + get Colab instructions
  python scripts/finetune_scripter.py --generate 500 --platform colab

  # Paid: Together.ai
  python scripts/finetune_scripter.py --platform together

  # RunPod (GPU pod)
  python scripts/finetune_scripter.py --platform runpod
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


SCRIPTER_SYSTEM_PROMPT = """You are Scripter, CipherMate's security AI — a mini model specialized in the CipherMate workspace.

You help with:
- Code security analysis and vulnerability detection
- Generating secure fixes (SQL injection, XSS, auth flaws, etc.)
- Explaining security issues clearly
- Repository scanning and security summaries

You are concise, technical, and actionable. You prioritize security over convenience."""


def find_training_data():
    """Find training data in common locations."""
    candidates = [
        Path.home() / "Desktop" / "expert_training_data_openai_10000.jsonl",
        Path.home() / "Desktop" / "expert_training_data_openai_1000.jsonl",
        Path.home() / "Desktop" / "expert_training_data_openai_100.jsonl",
        Path(__file__).parent.parent / "training_data" / "scripter_training.jsonl",
        Path(__file__).parent.parent / "training_data" / "expert_openai.jsonl",
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


def validate_training_file(path: Path) -> bool:
    """Validate JSONL format (messages with system/user/assistant)."""
    try:
        with open(path) as f:
            for i, line in enumerate(f):
                if i >= 5:
                    break
                obj = json.loads(line.strip())
                if "messages" not in obj:
                    return False
                roles = [m["role"] for m in obj["messages"]]
                if "system" not in roles and "user" not in roles:
                    return False
        return True
    except (json.JSONDecodeError, KeyError):
        return False


def finetune_together(training_file: Path, model: str, n_epochs: int, api_key: str) -> bool:
    """Fine-tune on Together.ai using their CLI."""
    try:
        result = subprocess.run(
            ["together", "files", "upload", str(training_file)],
            capture_output=True,
            text=True,
            env={**os.environ, "TOGETHER_API_KEY": api_key},
        )
        if result.returncode != 0:
            print(f"❌ Upload failed: {result.stderr}")
            return False

        # Parse file ID from JSON response
        file_id = None
        try:
            data = json.loads(result.stdout.strip())
            file_id = data.get("id")
        except json.JSONDecodeError:
            pass

        if not file_id:
            print("❌ Could not parse file ID from upload response")
            print(result.stdout)
            return False

        print(f"✅ Uploaded: {file_id}")

        cmd = [
            "together", "fine-tuning", "create",
            "-t", file_id,
            "-m", model,
            "--n-epochs", str(n_epochs),
        ]
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            env={**os.environ, "TOGETHER_API_KEY": api_key},
        )
        if result.returncode != 0:
            print(f"❌ Fine-tuning failed: {result.stderr}")
            return False

        print(result.stdout)
        print("\n✅ Fine-tuning job started. Check status at: https://api.together.xyz/v1/fine-tuning")
        return True

    except FileNotFoundError:
        print("❌ Together CLI not installed. Install with:")
        print("   pip install together")
        return False


def finetune_colab(training_file: Path) -> bool:
    """Print instructions for free fine-tuning on Colab + Unsloth."""
    print("\n" + "=" * 60)
    print("🆓 FREE: Fine-tune Scripter on Google Colab + Unsloth")
    print("=" * 60)
    print(f"\n📁 Your training data: {training_file}")
    print("\nNext steps:")
    print("  1. Create a Google account (free)")
    print("  2. Open: https://docs.unsloth.ai/get-started/fine-tuning-guide")
    print("  3. Or: https://github.com/unslothai/notebooks")
    print("  4. Pick a Llama 3.2 3B notebook → Open in Colab")
    print("  5. Runtime → Change runtime type → T4 GPU (free)")
    print("  6. Upload your training file to Colab (drag & drop or Files)")
    print("  7. In the notebook, set dataset path to your file")
    print("  8. Run all cells — training ~12–30 min")
    print("  9. Save to Hugging Face: model.push_to_hub('your-username/scripter')")
    print("\nHost for free: Hugging Face Inference API (~300 req/hr free)")
    print("   https://huggingface.co/docs/api-inference")
    print("=" * 60)
    return True


def finetune_runpod(training_file: Path, model: str, output_dir: Path) -> bool:
    """Generate RunPod/Axolotl config. User runs actual training on RunPod."""
    config_path = output_dir / "axolotl_config.yaml"
    config_path.parent.mkdir(parents=True, exist_ok=True)

    # Minimal Axolotl-style config for LoRA fine-tuning
    yaml_content = f"""# Scripter fine-tuning config for RunPod
# Docs: https://github.com/OpenAccess-AI-Collective/axolotl
# Run: axolotl launch {config_path.name}

base_model: {model}
model_type: LlamaForCausalLM

datasets:
  - path: {training_file.absolute()}
    type: alpaca
    dataset: messages  # JSONL with "messages" field

lora_r: 16
lora_alpha: 32
num_epochs: 3
micro_batch_size: 2
gradient_accumulation_steps: 8
learning_rate: 2e-5
output_dir: {output_dir / 'scripter-lora'}

# RunPod: Use A100 40GB or similar
"""

    with open(config_path, "w") as f:
        f.write(yaml_content)

    print(f"✅ RunPod config written: {config_path}")
    print("\nNext steps:")
    print("  1. Create a RunPod GPU pod (A100 or similar)")
    print("  2. Install Axolotl: pip install axolotl")
    print("  3. Upload training data and config to the pod")
    print("  4. Run: axolotl launch configs/axolotl_config.yaml")
    print("  5. Download the LoRA adapter when done")
    return True


def generate_mini_dataset(output_path: Path, count: int = 100):
    """Generate a small Scripter training dataset for quick testing."""
    samples = []
    vulns = [
        ("SQL injection", "userId", "const query = 'SELECT * FROM users WHERE id = ' + userId;", "Use parameterized queries: const query = 'SELECT * FROM users WHERE id = ?'; db.query(query, [userId]);"),
        ("XSS", "userComment", "element.innerHTML = userComment;", "Use textContent or sanitize: element.textContent = userComment;"),
        ("Hardcoded secret", "API_KEY", "const key = 'sk-12345';", "Use env: const key = process.env.API_KEY;"),
    ]
    for i in range(count):
        vtype, param, bad, fix = vulns[i % len(vulns)]
        samples.append({
            "messages": [
                {"role": "system", "content": SCRIPTER_SYSTEM_PROMPT},
                {"role": "user", "content": f"Fix this {vtype} vulnerability:\n\n```javascript\n{bad}\n```"},
                {"role": "assistant", "content": f"Secure fix:\n\n```javascript\n{fix}\n```\n\nExplanation: Avoid concatenating user input into queries/HTML. Use parameterized queries or sanitization."}
            ]
        })

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        for s in samples:
            f.write(json.dumps(s) + "\n")

    print(f"✅ Generated {count} samples: {output_path}")
    return output_path


def main():
    parser = argparse.ArgumentParser(description="Fine-tune Scripter — CipherMate's own model")
    parser.add_argument("--platform", choices=["colab", "together", "runpod"], default="colab",
                        help="Training platform (colab=free)")
    parser.add_argument("--data", type=Path, default=None,
                        help="Path to training JSONL (default: auto-detect)")
    parser.add_argument("--model", default="meta-llama/Meta-Llama-3.2-3B-Instruct-Turbo",
                        help="Base model (Together: meta-llama/..., Mistral, etc.)")
    parser.add_argument("--epochs", type=int, default=3, help="Training epochs")
    parser.add_argument("--generate", type=int, default=0,
                        help="Generate N samples if no training data (e.g. 100 for testing)")
    args = parser.parse_args()

    print("🔷 Scripter Fine-Tuning — CipherMate's Own Model\n")

    training_file = args.data or find_training_data()

    if not training_file and args.generate:
        training_file = Path(__file__).parent.parent / "training_data" / "scripter_mini.jsonl"
        generate_mini_dataset(training_file, args.generate)

    if not training_file or not training_file.exists():
        print("❌ No training data found.")
        print("\nGenerate it first:")
        print("  python scripts/generate_expert_training_data.py")
        print("  (creates expert_training_data_openai_*.jsonl on Desktop)")
        print("\nOr generate a small test set:")
        print("  python scripts/finetune_scripter.py --generate 100 --platform together")
        sys.exit(1)

    if not validate_training_file(training_file):
        print(f"❌ Invalid training format: {training_file}")
        print("   Each line must be JSON with 'messages' array (system/user/assistant)")
        sys.exit(1)

    print(f"📁 Training data: {training_file}")
    print(f"   Platform: {args.platform}")
    print(f"   Base model: {args.model}")
    print()

    if args.platform == "colab":
        success = finetune_colab(training_file)
    elif args.platform == "together":
        api_key = os.environ.get("TOGETHER_API_KEY")
        if not api_key:
            print("❌ TOGETHER_API_KEY not set.")
            print("   Get a key at https://api.together.xyz")
            print("   export TOGETHER_API_KEY=your-key")
            sys.exit(1)
        success = finetune_together(training_file, args.model, args.epochs, api_key)
    else:
        output_dir = Path(__file__).parent.parent / "training_data" / "runpod"
        success = finetune_runpod(training_file, args.model, output_dir)

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
