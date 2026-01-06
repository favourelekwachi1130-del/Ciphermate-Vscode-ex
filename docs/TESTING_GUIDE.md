# Testing Guide - CipherMate Extension

## ✅ Frontend Button Testing

### Quick Action Buttons (5 buttons)

The chat interface has **5 functional quick action buttons**:

1. **"Scan Repository"** → `data-action="scan my repository"`
2. **"Find Secrets"** → `data-action="find hardcoded secrets"`
3. **"Scan Contracts"** → `data-action="scan smart contracts"`
4. **"Check Dependencies"** → `data-action="check dependencies"`
5. **"View Results"** → `data-action="show results"`

### How to Test

1. **Open Extension Development Host**:
   - Press `F5` in VS Code
   - Wait for new window: "[Extension Development Host]"

2. **Open CipherMate Chat**:
   - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Type: `CipherMate` and press Enter

3. **Test Each Button**:
   - Click each quick action button
   - Verify message appears in chat
   - Check that AI responds appropriately

### Expected Behavior

- ✅ Button click sends message via `vscode.postMessage`
- ✅ Message appears in chat UI immediately
- ✅ AI processes the request
- ✅ Response appears in chat

### Button Implementation

Buttons are implemented in `chat-interface.ts`:
- Lines 1043-1048: Button HTML with `data-action` attributes
- Lines 1390-1483: Event listeners that send messages
- Uses `vscode.postMessage({ command: 'sendMessage', text: actionText })`

---

## 🔍 Scanner Testing

### 1. Dependency Scanner

**Test Command**: `"scan my repository"` or `"check dependencies"`

**What it scans**:
- `package.json` (npm)
- `requirements.txt` (Python)
- `Cargo.toml` (Rust)
- `go.mod` (Go)
- `pom.xml` (Java)
- `Gemfile` (Ruby)
- `composer.json` (PHP)

**Expected Output**:
```
Found X vulnerabilities:
- lodash@4.17.15: CVE-2021-23337 (High)
- express@4.16.0: Known vulnerability (Medium)
```

### 2. Secrets Scanner

**Test Command**: `"find hardcoded secrets"`

**What it detects**:
- AWS Keys
- GitHub Tokens
- API Keys
- Passwords
- Database Credentials
- Private Keys
- OAuth Tokens

**Expected Output**:
```
Found X secrets:
- AWS Access Key in config.js:42 (Critical)
- GitHub Token in .env:15 (Critical)
```

### 3. Smart Contract Scanner

**Test Command**: `"scan smart contracts"`

**What it scans**:
- All `.sol` files in workspace
- Detects 6 vulnerability types:
  - Reentrancy (SWC-107)
  - Access Control (SWC-105)
  - Unchecked Calls (SWC-104)
  - Timestamp Dependence (SWC-116)
  - Weak Randomness (SWC-120)
  - Integer Overflow (SWC-101)

**Expected Output**:
```
Found X vulnerabilities:
- Reentrancy vulnerability in MyContract.withdraw (Critical)
- Missing access control in MyContract.destroy (High)
```

---

## 🧪 Full Test Workflow

### Test 1: Basic Scan
```
1. Open CipherMate chat
2. Type: "scan my repository"
3. Wait for scan to complete
4. Verify results appear in chat
```

### Test 2: Quick Actions
```
1. Open CipherMate chat
2. Click "Scan Repository" button
3. Verify message sent and AI responds
4. Click "Find Secrets" button
5. Verify secrets scan runs
```

### Test 3: Smart Contracts
```
1. Open workspace with .sol files
2. Type: "scan smart contracts"
3. Verify vulnerabilities detected
4. Check inline diagnostics appear
```

### Test 4: Multiple Scans
```
1. Type: "scan my repository"
2. Wait for completion
3. Type: "find secrets"
4. Verify both scans work independently
```

---

## 🐛 Troubleshooting

### Buttons Don't Work

**Check**:
1. Open Developer Tools: `Help → Toggle Developer Tools`
2. Check Console for errors
3. Verify `vscode.postMessage` is called
4. Check `setupMessageHandlers` in extension host

**Fix**:
- Ensure `acquireVsCodeApi()` is called only once
- Check button `data-action` attributes match
- Verify event listeners are attached

### Scans Don't Run

**Check**:
1. Check Output panel: `View → Output → CipherMate`
2. Verify workspace path is set
3. Check scanner availability

**Fix**:
- Ensure workspace folder is open
- Check file permissions
- Verify scanners are initialized

### No Results Appear

**Check**:
1. Verify scan completed successfully
2. Check Results Panel: `CipherMate: Show Results`
3. Check chat for error messages

**Fix**:
- Check AI provider is configured
- Verify Ollama/OpenRouter is running
- Check network connectivity

---

## 📊 Expected Performance

- **Dependency Scanner**: 2-5 seconds
- **Secrets Scanner**: 5-10 seconds (depends on codebase size)
- **Smart Contract Scanner**: 3-8 seconds per file
- **Total Repository Scan**: Usually < 20 seconds

---

## ✅ Checklist

- [ ] Quick action buttons work
- [ ] Dependency scanner finds vulnerabilities
- [ ] Secrets scanner finds hardcoded credentials
- [ ] Smart contract scanner detects issues
- [ ] Results appear in chat
- [ ] Results appear in Results Panel
- [ ] Inline diagnostics show in editor
- [ ] AI responds conversationally
- [ ] Error handling works gracefully

---

**Ready to test!** Open CipherMate and try the buttons! 🚀

