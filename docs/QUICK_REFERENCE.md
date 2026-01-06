# CipherMate Quick Reference

## 🚀 Getting Started (30 seconds)

1. `Cmd+Shift+P` → Type `CipherMate` → Enter
2. Click **"Scan Repository"** button
3. View results in chat

---

## 💬 Common Commands

### Scanning
```
scan my repository          # Full security scan
scan dependencies          # Check dependencies only
find secrets               # Find hardcoded credentials
scan smart contracts       # Scan Solidity files
check for SQL injection    # Specific vulnerability check
```

### Questions
```
What is SQL injection?
How do I fix reentrancy?
Explain XSS attacks
What are the OWASP Top 10?
```

### Results
```
show results               # Open Results Panel
show critical issues       # Filter by severity
fix all vulnerabilities    # Get fix suggestions
```

---

## 🔘 Quick Action Buttons

| Button | Action |
|--------|--------|
| **Scan Repository** | Full security scan |
| **Find Secrets** | Hardcoded credentials |
| **Scan Contracts** | Smart contract analysis |
| **Check Dependencies** | Dependency vulnerabilities |
| **View Results** | Open Results Panel |

---

## 📊 What Gets Scanned

### 4 Scanners Run Automatically:

1. **Dependency Scanner**
   - `package.json`, `requirements.txt`, `Cargo.toml`, etc.
   - Checks for known CVEs

2. **Secrets Scanner**
   - API keys, passwords, tokens
   - AWS keys, GitHub tokens, etc.

3. **Smart Contract Scanner**
   - `.sol` files
   - Reentrancy, Access Control, etc.

4. **Code Pattern Scanner**
   - OWASP Top 10 patterns
   - SQL Injection, XSS, etc.

---

## 🎯 Typical Workflow

```
1. Open CipherMate
   ↓
2. Click "Scan Repository"
   ↓
3. Review results in chat
   ↓
4. Click "View Results" for details
   ↓
5. Ask: "How do I fix this?"
   ↓
6. Apply fixes
   ↓
7. Re-scan to verify
```

---

## ⚙️ Configuration

### AI Provider
- `Cmd+,` → Search "CipherMate"
- Choose: OpenAI, Anthropic, OpenRouter, Ollama
- Set API keys

### Scanners
- Enable/disable specific scanners
- Configure scan depth
- Set timeouts

---

## 💡 Pro Tips

1. **Use Natural Language** - Don't memorize commands
2. **Ask Follow-Ups** - "How do I fix this?"
3. **Use Quick Actions** - Faster than typing
4. **Check Results Panel** - Detailed view
5. **Configure AI** - Use your preferred model

---

## 🆘 Need Help?

- Type: `"help"` in chat
- Type: `"what can you do?"`
- Check: `docs/USER_INTERACTION_GUIDE.md`

---

**That's it! Start securing your code now!** 🔒

