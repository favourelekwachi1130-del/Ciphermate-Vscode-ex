# Quick Start: Multi-Agent Training

## 3-Step Process

### Step 1: Split Your Training Data (5 minutes)

```bash
cd ciphermate/scripts
python3 split_agent_training_data.py
```

**What happens:**
- Takes your 759k samples from Desktop
- Creates 5 specialized datasets in `~/Desktop/agent_training_datasets/`
- Ready for training

---

### Step 2: Train All Agents (Automated)

```bash
# Set your OpenAI API key
export OPENAI_API_KEY="sk-your-key-here"

# Run automated training
python3 train_all_agents.py
```

**Options:**
- `a` = Train all 5 agents
- `c` = Train core only (analyzer + scanner)
- `1,2,3` = Train specific agents

**What happens:**
- Uploads each dataset
- Creates fine-tuning jobs
- Saves job IDs for monitoring

**Time:** 5-10 minutes to start (training takes 1-6 hours per agent)
**Cost:** ~$380-1,520 total for all agents

---

### Step 3: Monitor Training & Get Model IDs

```bash
# Check status of all jobs
cat ~/Desktop/agent_training_jobs.json

# Monitor specific agent
openai api fine_tunes.get -i ft-xxx

# When complete, get model ID
# Model ID format: ft:gpt-3.5-turbo-0613:org:ciphermate-analyzer:abc123
```

---

## Training Priority Order

Train in this order for best results:

1. **Analyzer** (Most important - core reasoning)
2. **Scanner** (Needed for fast detection)
3. **Fix** (Generate secure code)
4. **Explainer** (ATT&CK narratives)
5. **Orchestrator** (Coordinates all - train last)

---

## Cost Breakdown

| Agent | Samples | Cost Estimate | Time |
|-------|---------|---------------|------|
| Analyzer | ~400k | $200-800 | 2-6 hrs |
| Scanner | ~150k | $75-300 | 1-3 hrs |
| Fix | ~150k | $75-300 | 1-3 hrs |
| Explainer | ~50k | $25-100 | 30min-2hrs |
| Orchestrator | ~10k | $5-20 | 15min-1hr |
| **TOTAL** | **~760k** | **$380-1,520** | **5-15 hrs** |

---

## After Training

1.     Save model IDs to `agent_models.txt`
2.     Test each agent individually
3.     Build multi-agent orchestrator service
4.     Deploy as API
5.     Configure CipherMate

See `MULTI_AGENT_ARCHITECTURE.md` for implementation details.

---

## Quick Commands

```bash
# Full pipeline
cd ciphermate/scripts
python3 split_agent_training_data.py    # Step 1
export OPENAI_API_KEY="sk-xxx"
python3 train_all_agents.py             # Step 2

# Monitor training
openai api fine_tunes.list

# Get model when complete
openai api fine_tunes.get -i ft-xxx
```

---

**Ready to start? Run Step 1 now!**     


