#!/usr/bin/env python3
"""
Train CipherMate model using OpenAI Fine-Tuning API
"""

import os
import subprocess
import sys
import time

def check_openai_installed():
    """Check if OpenAI CLI is installed"""
    try:
        subprocess.run(["openai", "--version"], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False

def install_openai_cli():
    """Install OpenAI CLI"""
    print("Installing OpenAI CLI...")
    subprocess.run([sys.executable, "-m", "pip", "install", "openai"], check=True)
    print("✅ OpenAI CLI installed")

def check_api_key():
    """Check if API key is set"""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("❌ OPENAI_API_KEY environment variable not set")
        print("\nSet it with:")
        print("  export OPENAI_API_KEY='sk-your-key-here'")
        return False
    return True

def upload_training_file(filename):
    """Upload training file to OpenAI"""
    print(f"📤 Uploading {filename}...")
    result = subprocess.run(
        ["openai", "api", "files.create", "-f", filename, "-p", "fine-tune"],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"❌ Upload failed: {result.stderr}")
        return None
    
    # Extract file ID from output
    file_id = None
    for line in result.stdout.split('\n'):
        if 'id' in line.lower():
            # Parse file ID (format varies)
            parts = line.split()
            for i, part in enumerate(parts):
                if 'id' in part.lower() and i + 1 < len(parts):
                    file_id = parts[i + 1].strip('",')
                    break
    
    print(f"✅ File uploaded: {file_id}")
    return file_id

def create_fine_tune(file_id, model="gpt-3.5-turbo", suffix="ciphermate-security"):
    """Create fine-tuning job"""
    print(f"🎯 Creating fine-tuning job...")
    print(f"   Model: {model}")
    print(f"   Suffix: {suffix}")
    
    result = subprocess.run(
        [
            "openai", "api", "fine_tunes.create",
            "-t", file_id,
            "-m", model,
            "--suffix", suffix
        ],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"❌ Fine-tuning creation failed: {result.stderr}")
        return None
    
    # Extract fine-tune ID
    fine_tune_id = None
    for line in result.stdout.split('\n'):
        if 'id' in line.lower() or 'ft-' in line:
            parts = line.split()
            for part in parts:
                if part.startswith('ft-'):
                    fine_tune_id = part.strip('",')
                    break
    
    print(f"✅ Fine-tuning job created: {fine_tune_id}")
    return fine_tune_id

def monitor_fine_tune(fine_tune_id):
    """Monitor fine-tuning progress"""
    print(f"\n📊 Monitoring fine-tuning job: {fine_tune_id}")
    print("   (This may take 1-4 hours)")
    
    while True:
        result = subprocess.run(
            ["openai", "api", "fine_tunes.get", "-i", fine_tune_id],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"❌ Error checking status: {result.stderr}")
            break
        
        # Parse status
        status = "unknown"
        for line in result.stdout.split('\n'):
            if 'status' in line.lower():
                if 'succeeded' in line.lower():
                    status = "succeeded"
                elif 'failed' in line.lower():
                    status = "failed"
                elif 'running' in line.lower() or 'pending' in line.lower():
                    status = "running"
                break
        
        if status == "succeeded":
            print("✅ Fine-tuning completed successfully!")
            # Extract model name
            for line in result.stdout.split('\n'):
                if 'fine_tuned_model' in line.lower():
                    print(f"\n🎉 Your model is ready!")
                    print(f"   Model ID: {line.split()[-1] if line.split() else 'Check OpenAI dashboard'}")
            break
        elif status == "failed":
            print("❌ Fine-tuning failed. Check OpenAI dashboard for details.")
            break
        else:
            print(f"   Status: {status}... (checking again in 60 seconds)")
            time.sleep(60)

def main():
    print("🚀 CipherMate OpenAI Fine-Tuning Setup\n")
    
    # Check prerequisites
    if not check_openai_installed():
        install_openai_cli()
    
    if not check_api_key():
        sys.exit(1)
    
    # Get training file
    print("\n📁 Looking for training files on Desktop...")
    desktop_path = os.path.expanduser("~/Desktop")
    desktop_files = [f for f in os.listdir(desktop_path) if f.startswith("expert_training_data_openai_") and f.endswith(".jsonl")]
    
    if desktop_files:
        print(f"\nFound {len(desktop_files)} training file(s) on Desktop:")
        for i, f in enumerate(desktop_files, 1):
            file_path = os.path.join(desktop_path, f)
            size_mb = os.path.getsize(file_path) / (1024 * 1024)
            print(f"  {i}. {f} ({size_mb:.1f} MB)")
        
        if len(desktop_files) == 1:
            training_file = os.path.join(desktop_path, desktop_files[0])
            print(f"\n✅ Using: {training_file}")
        else:
            choice = input(f"\nSelect file (1-{len(desktop_files)}) or enter custom path: ").strip()
            if choice.isdigit() and 1 <= int(choice) <= len(desktop_files):
                training_file = os.path.join(desktop_path, desktop_files[int(choice) - 1])
            else:
                training_file = choice if choice else os.path.join(desktop_path, desktop_files[0])
    else:
        training_file = input("\nEnter training file path: ").strip()
        if not training_file:
            print("❌ No training file specified")
            sys.exit(1)
    
    if not os.path.exists(training_file):
        print(f"❌ File not found: {training_file}")
        sys.exit(1)
    
    # Check file size (OpenAI has limits)
    file_size_mb = os.path.getsize(training_file) / (1024 * 1024)
    print(f"\n📊 File size: {file_size_mb:.1f} MB")
    if file_size_mb > 512:
        print("⚠️  Warning: File is large. OpenAI fine-tuning supports up to 512 MB.")
        print("   Consider splitting into multiple files or using a different approach.")
        proceed = input("Continue anyway? (y/n): ").strip().lower()
        if proceed != 'y':
            sys.exit(0)
    
    # Upload file
    file_id = upload_training_file(training_file)
    if not file_id:
        sys.exit(1)
    
    # Create fine-tune
    model = input("\nBase model (default: gpt-3.5-turbo): ").strip() or "gpt-3.5-turbo"
    suffix = input("Model suffix (default: ciphermate-security): ").strip() or "ciphermate-security"
    
    fine_tune_id = create_fine_tune(file_id, model, suffix)
    if not fine_tune_id:
        sys.exit(1)
    
    # Monitor
    monitor = input("\nMonitor training progress? (y/n, default: y): ").strip().lower()
    if monitor != 'n':
        monitor_fine_tune(fine_tune_id)
    else:
        print(f"\n📝 Fine-tuning job ID: {fine_tune_id}")
        print("   Check status with: openai api fine_tunes.get -i", fine_tune_id)
    
    print("\n✨ Setup complete!")

if __name__ == "__main__":
    main()

