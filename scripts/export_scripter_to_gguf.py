#!/usr/bin/env python3
"""
Export Scripter model to GGUF for LM Studio / Ollama

Loads your fine-tuned model (from Hugging Face or local) and saves it as GGUF.
Run after fine-tuning in Colab, or when you have a model on HF.

Usage:
  # From Hugging Face (after pushing from Colab)
  python scripts/export_scripter_to_gguf.py --model your-username/scripter

  # From local path (downloaded from Colab)
  python scripts/export_scripter_to_gguf.py --model ./scripter-adapter

  # Output to specific folder
  python scripts/export_scripter_to_gguf.py --model your-username/scripter --output ./scripter_gguf

  # Quantization: q4_k_m (default), q8_0, f16
  python scripts/export_scripter_to_gguf.py --model your-username/scripter --quant q8_0

Requires: pip install unsloth
"""

import argparse
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Export Scripter model to GGUF")
    parser.add_argument("--model", "-m", required=True,
                        help="Model path: Hugging Face repo (user/repo) or local path")
    parser.add_argument("--output", "-o", default="scripter_gguf",
                        help="Output directory for GGUF files (default: scripter_gguf)")
    parser.add_argument("--quant", "-q", default="q4_k_m",
                        choices=["q4_k_m", "q5_k_m", "q8_0", "f16", "f32"],
                        help="Quantization: q4_k_m (default), q8_0 (quality), f16 (full)")
    parser.add_argument("--push-hf", action="store_true",
                        help="Push GGUF to Hugging Face instead of saving locally")
    args = parser.parse_args()

    try:
        from unsloth import FastLanguageModel
    except ImportError:
        print("❌ Unsloth not installed. Run:")
        print("   pip install unsloth")
        sys.exit(1)

    print("🔷 Export Scripter to GGUF\n")
    print(f"   Model: {args.model}")
    print(f"   Quant: {args.quant}")
    print(f"   Output: {args.output}")
    print()

    # Load model
    print("📥 Loading model...")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=args.model,
        max_seq_length=8192,
        dtype=None,  # auto
        load_in_4bit=True,
    )

    # Export to GGUF
    print(f"📤 Exporting to GGUF ({args.quant})...")
    if args.push_hf:
        model.push_to_hub_gguf(args.output, tokenizer, quantization_method=args.quant)
        print(f"✅ Pushed to Hugging Face: {args.output}")
    else:
        model.save_pretrained_gguf(args.output, tokenizer, quantization_method=args.quant)
        out_path = Path(args.output)
        gguf_files = sorted(out_path.glob("*.gguf"))
        print(f"✅ Saved to {out_path.absolute()}")
        if gguf_files:
            gguf_path = gguf_files[0]
            print(f"   GGUF file: {gguf_path.name}")
            print("\nImport into LM Studio:")
            print(f"   lms import {gguf_path.absolute()}")
        print("\nOr copy the .gguf file to:")
        print("   ~/.lmstudio/models/ciphermate/scripter/")


if __name__ == "__main__":
    main()
