# CipherMate User Interaction Guide

## 🎯 Overview

CipherMate provides **multiple ways** to interact with the security scanning system. Choose the method that works best for you!

---

## 🚀 Quick Start

### Step 1: Open CipherMate
- Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
- Type: `CipherMate`
- Press Enter

### Step 2: Start Scanning
- Type: `"scan my repository"`
- Or click: **"Scan Repository"** button
- Wait for results

---

## 💬 Method 1: Chat Interface (Primary Method)

### Opening Chat
1. **Command Palette**: `Cmd+Shift+P` → `CipherMate`
2. **Activity Bar**: Click CipherMate icon (if visible)
3. **Keyboard Shortcut**: Configure in VS Code settings

### Welcome Screen
When you first open CipherMate, you'll see:
- **Logo** - CipherMate branding
- **Welcome Message** - "Welcome to CipherMate"
- **Chat Input** - Large input box with rotating placeholders
- **Quick Action Buttons** - 5 buttons for common tasks
- **Settings Card** - "Configure AI Provider"

### Chat Input Features

**Rotating Placeholders**:
- Automatically cycles through suggestions:
  - "Ask anything..."
  - "Scan my code for vulnerabilities"
  - "Find security issues in this file"
  - "Explain this security concern"
  - "How do I fix this vulnerability?"
  - "Review my authentication code"
  - "Check for SQL injection risks"
  - "Analyze my API security"

**Send Message**:
- Type your question/command
- Press `Enter` (or `Shift+Enter` for new line)
- Click the **Send** button (rocket icon)

---

## 🔘 Method 2: Quick Action Buttons

### Available Buttons

1. **"Scan Repository"**
   - Runs comprehensive security scan
   - Scans: Dependencies, Secrets, Smart Contracts, Code Patterns
   - Equivalent to: `"scan my repository"`

2. **"Find Secrets"**
   - Scans for hardcoded credentials
   - Finds: API keys, passwords, tokens, etc.
   - Equivalent to: `"find hardcoded secrets"`

3. **"Scan Contracts"**
   - Scans Solidity smart contracts
   - Detects: Reentrancy, Access Control, etc.
   - Equivalent to: `"scan smart contracts"`

4. **"Check Dependencies"**
   - Scans dependency files
   - Checks: package.json, requirements.txt, etc.
   - Equivalent to: `"check dependencies"`

5. **"View Results"**
   - Opens Results Panel
   - Shows all scan findings
   - Equivalent to: `"show results"`

### How to Use
- Simply **click** any button
- Message appears in chat automatically
- AI processes the request
- Results appear in chat and Results Panel

---

## 📝 Method 3: Natural Language Commands

### Scanning Commands

**Repository Scanning**:
```
"scan my repository"
"scan my codebase"
"analyze my code"
"check my code for vulnerabilities"
"run a security scan"
```

**Specific Scans**:
```
"scan dependencies"
"check dependencies"
"find vulnerable packages"

"find secrets"
"scan for hardcoded secrets"
"find API keys"

"scan smart contracts"
"analyze my Solidity code"
"check my smart contracts"

"scan for SQL injection"
"check for XSS vulnerabilities"
"find security patterns"
```

### Conversational Queries

**Educational**:
```
"What is SQL injection?"
"How does reentrancy work?"
"Explain XSS attacks"
"What are the OWASP Top 10?"
```

**Analysis**:
```
"Analyze this code for security issues"
"Review my authentication logic"
"Check my API security"
"Evaluate my smart contract"
```

**Fixes**:
```
"How do I fix this vulnerability?"
"Show me how to prevent SQL injection"
"What's the best way to store API keys?"
"Fix all vulnerabilities"
```

### Context-Aware Mode Switching

CipherMate automatically switches modes based on your question:

**Smart Contract Mode**:
- Keywords: "smart contract", "solidity", ".sol", "web3", "blockchain"
- Example: `"analyze my smart contract"` → Switches to `smartcontract` mode

**Web Security Mode**:
- Keywords: "web", "http", "api", "endpoint", "owasp", "xss", "sql injection"
- Example: `"check my API for vulnerabilities"` → Switches to `webpentest` mode

**General Mode** (Default):
- All other queries use `base` mode
- Example: `"what is encryption?"` → Uses `base` mode

---

## 🎨 Method 4: Results Panel

### Opening Results Panel
1. **Command**: `Cmd+Shift+P` → `CipherMate: Show Results`
2. **Chat**: Type `"show results"`
3. **Button**: Click **"View Results"** button

### Results Panel Features

**Filters**:
- Filter by severity: Critical, High, Medium, Low, Info
- Filter by scanner: Dependency, Secrets, Smart Contract, Code Pattern
- Filter by file type

**Vulnerability Cards**:
- **Title**: Vulnerability name
- **Severity**: Color-coded badge
- **File**: File path with line number
- **Description**: What was found
- **Fix**: How to fix it
- **References**: CWE, CVE, SWC, OWASP links

**Actions**:
- Click vulnerability → Jump to file
- View code preview
- Copy fix suggestion
- Dismiss false positives

---

## ⚙️ Method 5: Settings & Configuration

### Opening Settings
1. **Command**: `Cmd+Shift+P` → `CipherMate: Advanced Settings`
2. **Chat**: Click **"Configure AI Provider"** card
3. **VS Code Settings**: `Cmd+,` → Search "CipherMate"

### Configuration Options

**AI Provider**:
- OpenAI
- Anthropic (Claude)
- Google Gemini
- OpenRouter (450+ models)
- Ollama (local models)

**Scanner Options**:
- Enable/disable specific scanners
- Configure scan depth
- Set timeout values

**UI Preferences**:
- Theme customization
- Notification settings
- Auto-scan on save

---

## 🔄 Typical User Workflows

### Workflow 1: First-Time User

1. **Open CipherMate** → `Cmd+Shift+P` → `CipherMate`
2. **See Welcome Screen** → Read instructions
3. **Click "Scan Repository"** → Runs full scan
4. **View Results** → See vulnerabilities found
5. **Ask Questions** → "How do I fix this?"
6. **Apply Fixes** → Follow AI recommendations

### Workflow 2: Regular Developer

1. **Open CipherMate** → Already familiar
2. **Type**: `"scan my code"`
3. **Review Results** → Check critical issues
4. **Fix Issues** → Use AI suggestions
5. **Re-scan** → Verify fixes worked

### Workflow 3: Smart Contract Developer

1. **Open CipherMate**
2. **Type**: `"scan my smart contracts"`
3. **AI Switches Mode** → Smart contract mode activated
4. **Review Findings** → Check SWC-107, SWC-105, etc.
5. **Ask Questions** → "How do I prevent reentrancy?"
6. **Get Code Examples** → AI provides Solidity fixes

### Workflow 4: Security Researcher

1. **Open CipherMate**
2. **Type**: `"find all secrets"`
3. **Review Secrets** → Check for exposed credentials
4. **Type**: `"check dependencies"`
5. **Review CVEs** → Check for known vulnerabilities
6. **Type**: `"scan for OWASP Top 10"`
7. **Review Patterns** → Check code security patterns

---

## 💡 Interaction Examples

### Example 1: Quick Scan
```
User: [Clicks "Scan Repository" button]
CipherMate: "Scanning repository... Found 12 vulnerabilities (3 critical, 5 high)"
```

### Example 2: Conversational
```
User: "What is SQL injection?"
CipherMate: "SQL injection is a code injection technique... [detailed explanation]"
```

### Example 3: Context-Aware
```
User: "Analyze my smart contract"
CipherMate: [Switches to smartcontract mode]
"Scanning Solidity files... Found reentrancy vulnerability in Withdraw.sol:42"
```

### Example 4: Multi-Step
```
User: "scan my repository"
CipherMate: "Found 8 vulnerabilities..."

User: "show me the critical ones"
CipherMate: "Critical vulnerabilities: [list]"

User: "how do I fix the SQL injection?"
CipherMate: "To fix SQL injection in api.js:23, use parameterized queries..."
```

---

## 🎯 Best Practices

### 1. Start with a Scan
- Always run a full scan first: `"scan my repository"`
- Get overview of all issues
- Prioritize by severity

### 2. Use Natural Language
- Don't worry about exact commands
- CipherMate understands context
- Ask questions naturally

### 3. Ask Follow-Up Questions
- After scanning, ask: "How do I fix this?"
- Get detailed explanations
- Request code examples

### 4. Use Quick Actions
- For common tasks, use buttons
- Faster than typing
- One-click access

### 5. Review Results Panel
- Check Results Panel for details
- Filter by severity
- Jump to code locations

---

## ⌨️ Keyboard Shortcuts

### Default Shortcuts
- `Cmd+Shift+P` → Command Palette
- `Enter` → Send message
- `Shift+Enter` → New line in input
- `Esc` → Close chat (if configured)

### Customizable Shortcuts
Configure in VS Code:
- `File` → `Preferences` → `Keyboard Shortcuts`
- Search "CipherMate"
- Assign custom shortcuts

---

## 📱 Mobile/Tablet Support

### VS Code for Web
- Works in browser-based VS Code
- Same interface as desktop
- Touch-friendly buttons

### Limitations
- Some features may be limited
- File system access depends on platform
- Best experience on desktop

---

## 🆘 Getting Help

### In Chat
- Type: `"help"`
- Type: `"what can you do?"`
- Type: `"show commands"`

### Documentation
- Check `docs/` folder
- README.md for overview
- Feature guides for details

### Support
- Check VS Code Output panel
- Look for error messages
- Review console logs

---

## 🎓 Learning Path

### Beginner
1. Start with **Quick Action Buttons**
2. Run **"Scan Repository"**
3. Read results
4. Ask: **"How do I fix this?"**

### Intermediate
1. Use **Natural Language** commands
2. Try **Conversational** queries
3. Explore **Results Panel**
4. Configure **Settings**

### Advanced
1. Use **Mode Switching**
2. Customize **AI Provider**
3. Configure **Scanner Options**
4. Integrate with **CI/CD**

---

## ✅ Summary

**Primary Interaction Methods**:
1. 💬 **Chat Interface** - Natural language commands
2. 🔘 **Quick Action Buttons** - One-click actions
3. 📊 **Results Panel** - Detailed findings
4. ⚙️ **Settings** - Configuration
5. ⌨️ **Keyboard Shortcuts** - Fast access

**Key Features**:
- ✅ Natural language understanding
- ✅ Context-aware mode switching
- ✅ Multiple interaction methods
- ✅ Conversational AI
- ✅ Comprehensive scanning

**Start Now**:
1. Press `Cmd+Shift+P`
2. Type `CipherMate`
3. Click **"Scan Repository"**
4. Start securing your code! 🚀

---

**CipherMate makes security scanning as easy as having a conversation!** 💬🔒

