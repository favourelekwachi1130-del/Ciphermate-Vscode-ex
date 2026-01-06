#!/usr/bin/env python3
"""
Split training data into specialized agent datasets

Creates training data optimized for:
- Scanner Agent: Fast detection, high recall
- Analyzer Agent: Deep reasoning, logic flaws
- Fix Agent: Vulnerable → Secure transformations
- Explainer Agent: Exploit narratives, ATT&CK
- Orchestrator Agent: Multi-agent coordination
"""

import json
import random
from pathlib import Path
from typing import List, Dict
from collections import defaultdict

def load_training_data(filename: str) -> List[Dict]:
    """Load training data from JSONL file"""
    samples = []
    with open(filename, 'r') as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    samples.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    return samples

def create_scanner_dataset(samples: List[Dict], count: int = 150000) -> List[Dict]:
    """Create dataset for Scanner Agent - fast detection and categorization"""
    scanner_samples = []
    
    for sample in samples[:count]:
        # Extract detection-focused content
        messages = sample.get("messages", [])
        if not messages or len(messages) < 2:
            continue
        
        user_msg = messages[1].get("content", "")
        assistant_msg = messages[2].get("content", "") if len(messages) > 2 else ""
        
        # Simplify to quick detection format
        scanner_response = assistant_msg.split("\n")[0] if assistant_msg else "Vulnerability detected"
        
        scanner_sample = {
            "messages": [
                messages[0],  # System prompt (keep)
                {
                    "role": "user",
                    "content": f"Quick scan: Identify vulnerability type and severity.\n\n{user_msg.split('Code:')[0] if 'Code:' in user_msg else user_msg}"
                },
                {
                    "role": "assistant",
                    "content": scanner_response
                }
            ]
        }
        scanner_samples.append(scanner_sample)
    
    return scanner_samples

def create_analyzer_dataset(samples: List[Dict], count: int = 400000) -> List[Dict]:
    """Create dataset for Analyzer Agent - deep reasoning and logic flaws"""
    # Analyzer gets the full expert-level dataset
    analyzer_samples = []
    
    # Prioritize samples with deep reasoning requirements
    prioritized = []
    other = []
    
    for sample in samples:
        messages = sample.get("messages", [])
        if len(messages) < 3:
            continue
        
        assistant_msg = messages[2].get("content", "")
        
        # Prioritize samples with reasoning keywords
        if any(keyword in assistant_msg.lower() for keyword in [
            "order of operations", "race condition", "state mutation",
            "timing attack", "business logic", "trust boundary",
            "exploit narrative", "requires reasoning"
        ]):
            prioritized.append(sample)
        else:
            other.append(sample)
    
    # Take prioritized first, then fill with others
    analyzer_samples = prioritized + other
    return analyzer_samples[:count]

def create_fix_dataset(samples: List[Dict], count: int = 150000) -> List[Dict]:
    """Create dataset for Fix Agent - vulnerable → secure transformations"""
    fix_samples = []
    
    for sample in samples:
        messages = sample.get("messages", [])
        if len(messages) < 3:
            continue
        
        assistant_msg = messages[2].get("content", "")
        
        # Extract fix-related content
        if "Secure Fix:" in assistant_msg or "fix" in assistant_msg.lower():
            # Create fix-focused sample
            fix_sample = {
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a security fix generation AI. Generate secure code fixes for vulnerabilities."
                    },
                    {
                        "role": "user",
                        "content": f"Generate a secure fix for this vulnerability:\n\n{messages[1].get('content', '')}"
                    },
                    {
                        "role": "assistant",
                        "content": assistant_msg.split("Secure Fix:")[-1] if "Secure Fix:" in assistant_msg else assistant_msg
                    }
                ]
            }
            fix_samples.append(fix_sample)
        
        if len(fix_samples) >= count:
            break
    
    return fix_samples

def create_explainer_dataset(samples: List[Dict], count: int = 50000) -> List[Dict]:
    """Create dataset for Explainer Agent - exploit narratives and ATT&CK"""
    explainer_samples = []
    
    for sample in samples:
        messages = sample.get("messages", [])
        if len(messages) < 3:
            continue
        
        assistant_msg = messages[2].get("content", "")
        
        # Extract exploit narrative
        if "Exploit Narrative" in assistant_msg or "ATT&CK" in assistant_msg:
            explainer_sample = {
                "messages": [
                    {
                        "role": "system",
                        "content": "You are an exploit explanation AI. Explain vulnerabilities from attacker perspective using MITRE ATT&CK framework."
                    },
                    {
                        "role": "user",
                        "content": f"Explain how this vulnerability can be exploited:\n\n{messages[1].get('content', '')}"
                    },
                    {
                        "role": "assistant",
                        "content": assistant_msg.split("Exploit Narrative")[-1] if "Exploit Narrative" in assistant_msg else assistant_msg
                    }
                ]
            }
            explainer_samples.append(explainer_sample)
        
        if len(explainer_samples) >= count:
            break
    
    return explainer_samples

def create_orchestrator_dataset(samples: List[Dict], count: int = 10000) -> List[Dict]:
    """Create dataset for Orchestrator Agent - multi-agent coordination"""
    orchestrator_samples = []
    
    # Create synthetic multi-agent conversation examples
    for i in range(count):
        # Create example of orchestrator coordinating agents
        orchestrator_sample = {
            "messages": [
                {
                    "role": "system",
                    "content": "You are an orchestrator AI that coordinates specialized security agents. Route requests and synthesize responses."
                },
                {
                    "role": "user",
                    "content": "Scan this repository for vulnerabilities and provide fixes"
                },
                {
                    "role": "assistant",
                    "content": """I'll coordinate the security analysis workflow:

1. [Scanner Agent] Performing initial scan...
   - Found 3 potential vulnerabilities

2. [Analyzer Agent] Deep analysis of findings...
   - Confirmed 2 critical vulnerabilities
   - 1 false positive

3. [Fix Agent] Generating secure fixes...
   - Fix 1: Authorization order correction
   - Fix 2: Race condition mitigation

4. [Explainer Agent] Exploit analysis...
   - Exploit path documented

**Summary**: 2 critical vulnerabilities found and fixed. See details above."""
                }
            ]
        }
        orchestrator_samples.append(orchestrator_sample)
    
    return orchestrator_samples

def save_dataset(samples: List[Dict], filename: str):
    """Save dataset to JSONL file"""
    with open(filename, 'w') as f:
        for sample in samples:
            f.write(json.dumps(sample) + '\n')
    print(f"✅ Saved {len(samples)} samples to {filename}")

def main():
    print("🔷 Multi-Agent Training Data Splitter")
    print("=" * 70)
    
    # Get input file
    desktop_path = Path.home() / "Desktop"
    desktop_files = list(desktop_path.glob("expert_training_data_openai_*.jsonl"))
    
    if not desktop_files:
        input_file = input("Enter training file path: ").strip()
    else:
        print(f"\nFound {len(desktop_files)} training file(s) on Desktop:")
        for i, f in enumerate(desktop_files, 1):
            print(f"  {i}. {f.name}")
        choice = input(f"\nSelect file (1-{len(desktop_files)}) or enter custom path: ").strip()
        if choice.isdigit() and 1 <= int(choice) <= len(desktop_files):
            input_file = str(desktop_files[int(choice) - 1])
        else:
            input_file = choice if choice else str(desktop_files[0])
    
    if not Path(input_file).exists():
        print(f"❌ File not found: {input_file}")
        return
    
    print(f"\n📂 Loading training data from: {input_file}")
    samples = load_training_data(input_file)
    print(f"✅ Loaded {len(samples):,} samples")
    
    # Get output directory
    output_dir = desktop_path / "agent_training_datasets"
    output_dir.mkdir(exist_ok=True)
    
    print(f"\n🎯 Creating specialized agent datasets...")
    print(f"   Output directory: {output_dir}\n")
    
    # Shuffle for randomness
    random.shuffle(samples)
    
    # Create datasets
    print("1. Creating Scanner Agent dataset (fast detection)...")
    scanner_data = create_scanner_dataset(samples, count=min(150000, len(samples) // 5))
    save_dataset(scanner_data, str(output_dir / "scanner_agent_training.jsonl"))
    
    print("\n2. Creating Analyzer Agent dataset (deep reasoning)...")
    analyzer_data = create_analyzer_dataset(samples, count=min(400000, len(samples) // 2))
    save_dataset(analyzer_data, str(output_dir / "analyzer_agent_training.jsonl"))
    
    print("\n3. Creating Fix Agent dataset (code fixes)...")
    fix_data = create_fix_dataset(samples, count=min(150000, len(samples) // 5))
    save_dataset(fix_data, str(output_dir / "fix_agent_training.jsonl"))
    
    print("\n4. Creating Explainer Agent dataset (exploit narratives)...")
    explainer_data = create_explainer_dataset(samples, count=min(50000, len(samples) // 15))
    save_dataset(explainer_data, str(output_dir / "explainer_agent_training.jsonl"))
    
    print("\n5. Creating Orchestrator Agent dataset (coordination)...")
    orchestrator_data = create_orchestrator_dataset(samples, count=10000)
    save_dataset(orchestrator_data, str(output_dir / "orchestrator_agent_training.jsonl"))
    
    print(f"\n✨ Dataset splitting complete!")
    print(f"\n📊 Summary:")
    print(f"  Scanner Agent:     {len(scanner_data):,} samples")
    print(f"  Analyzer Agent:    {len(analyzer_data):,} samples")
    print(f"  Fix Agent:         {len(fix_data):,} samples")
    print(f"  Explainer Agent:   {len(explainer_data):,} samples")
    print(f"  Orchestrator Agent: {len(orchestrator_data):,} samples")
    print(f"  Total:             {len(scanner_data) + len(analyzer_data) + len(fix_data) + len(explainer_data) + len(orchestrator_data):,} samples")
    
    print(f"\n📁 Files saved to: {output_dir}")
    print(f"\n🎯 Next steps:")
    print(f"  1. Train each agent model separately")
    print(f"  2. Implement agent communication layer")
    print(f"  3. Build orchestrator to coordinate")
    print(f"  4. Deploy as multi-agent API")

if __name__ == "__main__":
    main()


