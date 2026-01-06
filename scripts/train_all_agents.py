#!/usr/bin/env python3
"""
Automated script to train all specialized agents
Supports OpenAI and basic Hugging Face workflows
"""

import os
import sys
import subprocess
import json
import time
from pathlib import Path

def check_openai_setup():
    """Check if OpenAI CLI and API key are ready"""
    try:
        subprocess.run(["openai", "--version"], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("❌ OpenAI CLI not installed. Install with: pip install openai")
        return False
    
    if not os.environ.get("OPENAI_API_KEY"):
        print("❌ OPENAI_API_KEY not set. Export it with:")
        print("   export OPENAI_API_KEY='sk-your-key-here'")
        return False
    
    return True

def upload_file(filepath):
    """Upload file to OpenAI"""
    print(f"📤 Uploading {Path(filepath).name}...")
    result = subprocess.run(
        ["openai", "api", "files.create", "-f", filepath, "-p", "fine-tune"],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"❌ Upload failed: {result.stderr}")
        return None
    
    # Extract file ID
    for line in result.stdout.split('\n'):
        if 'id' in line.lower() and 'file-' in line:
            parts = line.split()
            for part in parts:
                if part.startswith('file-'):
                    file_id = part.strip('",}')
                    print(f"✅ Uploaded: {file_id}")
                    return file_id
    
    return None

def create_fine_tune(file_id, agent_name, base_model="gpt-3.5-turbo"):
    """Create fine-tuning job"""
    suffix = f"ciphermate-{agent_name}"
    print(f"🎯 Creating fine-tune job for {agent_name} agent...")
    
    result = subprocess.run(
        [
            "openai", "api", "fine_tunes.create",
            "-t", file_id,
            "-m", base_model,
            "--suffix", suffix
        ],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"❌ Fine-tune creation failed: {result.stderr}")
        return None
    
    # Extract fine-tune ID
    for line in result.stdout.split('\n'):
        if 'ft-' in line:
            parts = line.split()
            for part in parts:
                if part.startswith('ft-'):
                    ft_id = part.strip('",}')
                    print(f"✅ Fine-tune job created: {ft_id}")
                    return ft_id
    
    return None

def get_file_size_mb(filepath):
    """Get file size in MB"""
    return Path(filepath).stat().st_size / (1024 * 1024)

def main():
    print("🚀 Multi-Agent Training Automation")
    print("=" * 70)
    
    # Check setup
    if not check_openai_setup():
        sys.exit(1)
    
    # Find training datasets
    desktop_path = Path.home() / "Desktop"
    datasets_dir = desktop_path / "agent_training_datasets"
    
    if not datasets_dir.exists():
        print(f"\n❌ Agent training datasets not found at: {datasets_dir}")
        print("   Run split_agent_training_data.py first to create datasets")
        sys.exit(1)
    
    # Agent definitions (training order matters)
    agents = [
        {
            "name": "analyzer",
            "file": "analyzer_agent_training.jsonl",
            "priority": 1,
            "description": "Deep reasoning and logic flaw analysis"
        },
        {
            "name": "scanner",
            "file": "scanner_agent_training.jsonl",
            "priority": 2,
            "description": "Fast detection and categorization"
        },
        {
            "name": "fix",
            "file": "fix_agent_training.jsonl",
            "priority": 3,
            "description": "Secure code fix generation"
        },
        {
            "name": "explainer",
            "file": "explainer_agent_training.jsonl",
            "priority": 4,
            "description": "Exploit narrative explanation"
        },
        {
            "name": "orchestrator",
            "file": "orchestrator_agent_training.jsonl",
            "priority": 5,
            "description": "Multi-agent coordination"
        }
    ]
    
    # Check which files exist
    available_agents = []
    for agent in agents:
        filepath = datasets_dir / agent["file"]
        if filepath.exists():
            size_mb = get_file_size_mb(filepath)
            agent["filepath"] = str(filepath)
            agent["size_mb"] = size_mb
            available_agents.append(agent)
        else:
            print(f"⚠️  {agent['file']} not found, skipping {agent['name']} agent")
    
    if not available_agents:
        print("\n❌ No training datasets found!")
        sys.exit(1)
    
    # Show available agents
    print(f"\n📊 Found {len(available_agents)} agent dataset(s):")
    for agent in available_agents:
        print(f"  {agent['priority']}. {agent['name'].upper():12} - {agent['size_mb']:.1f} MB - {agent['description']}")
    
    # Select agents to train
    print("\n🎯 Select agents to train:")
    print("  a = All agents")
    print("  c = Core only (analyzer + scanner)")
    print("  1-5 = Specific agent number")
    print("  comma-separated = Multiple (e.g., 1,2,3)")
    
    selection = input("\nSelection (default: a): ").strip().lower() or "a"
    
    if selection == "a":
        agents_to_train = available_agents
    elif selection == "c":
        agents_to_train = [a for a in available_agents if a["priority"] <= 2]
    else:
        indices = [int(x.strip()) for x in selection.split(",") if x.strip().isdigit()]
        agents_to_train = [a for a in available_agents if a["priority"] in indices]
    
    if not agents_to_train:
        print("❌ No agents selected")
        sys.exit(0)
    
    # Confirm
    print(f"\n📋 Will train {len(agents_to_train)} agent(s):")
    for agent in agents_to_train:
        print(f"  - {agent['name'].upper()} ({agent['size_mb']:.1f} MB)")
    
    # Check file sizes
    for agent in agents_to_train:
        if agent["size_mb"] > 512:
            print(f"\n⚠️  Warning: {agent['name']} dataset is {agent['size_mb']:.1f} MB")
            print("   OpenAI limit is 512 MB per file")
            print("   Consider splitting the file or using a subset")
            proceed = input(f"   Continue anyway? (y/n): ").strip().lower()
            if proceed != 'y':
                agents_to_train.remove(agent)
    
    if not agents_to_train:
        print("❌ No agents to train after size checks")
        sys.exit(0)
    
    proceed = input(f"\n🚀 Start training? (y/n): ").strip().lower()
    if proceed != 'y':
        print("Cancelled")
        sys.exit(0)
    
    # Train each agent
    results = {}
    
    for agent in sorted(agents_to_train, key=lambda x: x["priority"]):
        print(f"\n{'='*70}")
        print(f"Training {agent['name'].upper()} Agent")
        print(f"{'='*70}")
        
        # Upload
        file_id = upload_file(agent["filepath"])
        if not file_id:
            print(f"❌ Failed to upload {agent['name']} dataset")
            continue
        
        # Create fine-tune
        ft_id = create_fine_tune(file_id, agent["name"])
        if not ft_id:
            print(f"❌ Failed to create fine-tune job for {agent['name']}")
            continue
        
        results[agent["name"]] = {
            "file_id": file_id,
            "fine_tune_id": ft_id,
            "status": "training"
        }
        
        print(f"\n✅ {agent['name'].upper()} Agent training started")
        print(f"   Fine-tune ID: {ft_id}")
        print(f"   Monitor: openai api fine_tunes.get -i {ft_id}")
        print(f"   Estimated time: 1-6 hours")
        
        # Small delay between jobs
        if agent != agents_to_train[-1]:
            time.sleep(2)
    
    # Save results
    results_file = desktop_path / "agent_training_jobs.json"
    with open(results_file, 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"\n{'='*70}")
    print(f"✨ Training jobs started for {len(results)} agent(s)")
    print(f"\n📝 Job details saved to: {results_file}")
    print(f"\n📊 Monitor all jobs:")
    for name, data in results.items():
        print(f"   {name.upper()}: openai api fine_tunes.get -i {data['fine_tune_id']}")
    
    print(f"\n⏳ Training typically takes 1-6 hours per agent")
    print(f"   Check OpenAI dashboard: https://platform.openai.com/finetune")
    
    # Option to monitor
    monitor = input("\n🔍 Monitor training progress? (y/n): ").strip().lower()
    if monitor == 'y':
        for name, data in results.items():
            print(f"\n📊 {name.upper()} Agent Status:")
            subprocess.run(["openai", "api", "fine_tunes.get", "-i", data["fine_tune_id"]])

if __name__ == "__main__":
    main()


