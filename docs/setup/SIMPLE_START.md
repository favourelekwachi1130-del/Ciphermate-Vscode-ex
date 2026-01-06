# Simple Start: Just Do These 3 Things

## What You Have
-     759,000 training samples on your Desktop
-     Scripts ready to use

## What You Need to Do

### Option 1: Train ONE AI (Simple - Recommended First)

**Best for**: Getting started quickly, testing your data

#### Step 1: Train with OpenAI
```bash
cd ciphermate/scripts
export OPENAI_API_KEY="sk-your-key-here"
python3 train_openai.py
```
- When asked, select your Desktop file: `expert_training_data_openai_759000.jsonl`
- Wait 2-6 hours
- Get your model ID
- Done!    

**Cost**: ~$500-2000
**Time**: 2-6 hours

---

### Option 2: Train 5 Specialized AIs (Advanced - Do This Later)

**Best for**: Maximum quality, specialized agents

#### Step 1: Split data
```bash
cd ciphermate/scripts
python3 split_agent_training_data.py
```

#### Step 2: Train all
```bash
export OPENAI_API_KEY="sk-your-key-here"
python3 train_all_agents.py
```
- Choose `c` (core only) for faster start
- Wait 3-6 hours
- Get 5 model IDs
- Done!    

**Cost**: ~$400-1500
**Time**: 3-6 hours

---

## My Recommendation: Start with Option 1

1. **Test your data works** with one AI first
2. **See results quickly**
3. **Then** upgrade to multi-agent if needed

---

## After Training (Both Options)

1. Get your model ID(s)
2. Deploy as API (or use OpenAI's hosted model)
3. Configure CipherMate to use it
4. Start using it!

---

## That's It!

Don't worry about all the other files. Just:
1. Pick Option 1 or 2 above
2. Run the commands
3. Wait for training
4. Use your trained AI

Everything else is just documentation if you want to understand more later.


