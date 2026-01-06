# START HERE - How to Use CipherMate

## Step-by-Step Guide

### Step 1: Find CipherMate

**Look at the LEFT SIDEBAR of VS Code**

You should see icons on the left side. Find the **CipherMate icon** (looks like a shield or security symbol).

**If you don't see it:**
- Press `Cmd+Shift+X` (Mac) or `Ctrl+Shift+X` (Windows) to open Extensions
- Search for "CipherMate"
- Make sure it's installed and enabled

---

### Step 2: Click the CipherMate Icon

**Click the CipherMate icon** in the left sidebar.

**What happens:**
- A welcome screen will open automatically
- You'll see the CipherMate logo
- Two option cards will appear

---

### Step 3: Configure Your AI (Required First!)

**On the welcome screen, you'll see two cards:**

**Card 1: "Step 1: Configure API Key"** ← CLICK THIS FIRST

This opens the settings panel where you can:
- Choose your AI provider (OpenAI, Anthropic, Ollama, etc.)
- Enter your API key
- Configure local models

**Don't have an API key?**
- Option A: Use free self-hosted Ollama (see [Ollama Setup](docs/setup/OLLAMA_QUICK_START.md))
- Option B: Get API key from OpenAI, Anthropic, or OpenRouter

**After configuring:**
- Click "Save" button (bottom right)
- Settings are saved

---

### Step 4: Start Using CipherMate

**On the welcome screen, click:**

**Card 2: "Step 2: Start Chatting"**

**OR** type directly in the input field at the bottom.

**Try these commands:**
- `"scan my code"`
- `"find vulnerabilities"`
- `"explain security issues"`
- `"help me secure this code"`

Press Enter or click Send.

---

### Step 5: View Results

After scanning, you'll see results in the chat.

**To see detailed results:**
- Click "Show Results" button
- OR: Press `Cmd+Shift+P` → Type `CipherMate: Show Results Panel`

---

## Visual Guide

```
VS Code Window
├── Left Sidebar (Activity Bar)
│   └── [CipherMate Icon] ← CLICK HERE
│
├── Main Editor Area
│   └── Welcome Screen Opens Here
│       ├── Logo
│       ├── Quick Start Guide
│       ├── [Configure API Key] ← Step 1
│       └── [Start Chatting] ← Step 2
│
└── Command Palette (Cmd+Shift+P)
    └── Type "CipherMate" to open
```

---

## Quick Reference

### How to Open CipherMate
1. **Click icon** in left sidebar
2. **OR** `Cmd+Shift+P` → Type `CipherMate` → Enter

### How to Configure
1. Click "Configure API Key" on welcome screen
2. **OR** `Cmd+Shift+P` → `CipherMate: Advanced Settings`
3. Choose provider, enter API key, Save

### How to Scan Code
1. Open CipherMate
2. Click "Start Chatting"
3. Type: `"scan my code"`
4. Press Enter

### How to View Results
1. After scan completes
2. `Cmd+Shift+P` → `CipherMate: Show Results Panel`
3. See all vulnerabilities

---

## Common Questions

**Q: I don't see the CipherMate icon**
A: Check Extensions view (`Cmd+Shift+X`). Make sure CipherMate is installed.

**Q: Welcome screen doesn't open**
A: Click the CipherMate icon in left sidebar, or press `Cmd+Shift+P` and type `CipherMate`

**Q: How do I set up my AI?**
A: Click "Configure API Key" on welcome screen, or see [Ollama Setup Guide](docs/setup/OLLAMA_QUICK_START.md) for free option

**Q: What can I ask CipherMate?**
A: Try:
- "scan my code"
- "find vulnerabilities"
- "explain this security issue"
- "fix this vulnerability"
- "show me security best practices"

**Q: Where are my scan results?**
A: Press `Cmd+Shift+P` → `CipherMate: Show Results Panel`

---

## Need More Help?

- [Ollama Setup (Free Self-Hosted)](docs/setup/OLLAMA_QUICK_START.md)
- [Settings Guide](docs/setup/MULTI_PROVIDER_GUIDE.md)
- [How to Test](./HOW_TO_TEST.md)

---

**That's it! Click the CipherMate icon and get started!**
