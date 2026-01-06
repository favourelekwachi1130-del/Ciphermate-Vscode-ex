# START HERE - Super Simple Guide

##      Your Goal
Train an AI that finds security vulnerabilities

##     What You Already Have
- 759,000 training samples ready to go
- Scripts set up and working

---

##      Choose ONE Path (Pick the Easy One First)

### Path 1: Single AI (EASIEST - Start Here)  ­ 

```bash
# 1. Go to scripts folder
cd ciphermate/scripts

# 2. Set your OpenAI API key
export OPENAI_API_KEY="sk-your-key-here"

# 3. Train (it finds your file automatically)
python3 train_openai.py
```

**That's it!** Wait 2-6 hours, get your model ID, you're done.

---

### Path 2: 5 Specialized AIs (Do This Later If You Want)

```bash
# 1. Split data into 5 parts
cd ciphermate/scripts
python3 split_agent_training_data.py

# 2. Train all agents
export OPENAI_API_KEY="sk-your-key-here"
python3 train_all_agents.py
```

**Then** wait, get 5 model IDs, build the multi-agent system.

---

##      My Advice

**Just do Path 1 first.**

- It's simpler
- Tests if your data works
- Get results in hours
- Upgrade to Path 2 later if you want

---

##     Questions?

**Q: Which path should I choose?**
A: Path 1 (single AI). Always start simple.

**Q: What about all those other files?**
A: They're just documentation. Ignore them for now.

**Q: How long does training take?**
A: 2-6 hours for one AI, 3-6 hours for 5 AIs.

**Q: How much does it cost?**
A: $500-2000 for one AI, $400-1500 for 5 AIs.

**Q: What do I do after training?**
A: Get your model ID, use it in CipherMate, done!

---

##    ¬ Ready? Just Run This:

```bash
cd ciphermate/scripts
export OPENAI_API_KEY="sk-your-key-here"
python3 train_openai.py
```

**That's literally it.** Everything else is automatic.


