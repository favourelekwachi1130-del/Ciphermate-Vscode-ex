# Correct Usage of `scan_repository` in CipherMate

## ⚠️ Important: CipherMate is a VS Code Extension, NOT an API Service

**CipherMate does NOT have API endpoints** like `http://ciphermateapi/v1alpha1/tools/analyze`. 

If an AI told you to use API endpoints, that was incorrect. CipherMate is a **VS Code extension** that runs locally in your editor.

---

## ✅ Correct Ways to Use `scan_repository`

### Method 1: Chat Interface (Easiest)

1. **Open CipherMate Chat**:
   - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Type: `CipherMate`
   - Press Enter

2. **Type a natural language command**:
   ```
   scan my repository
   ```
   or
   ```
   scan my codebase
   ```
   or
   ```
   analyze my code for vulnerabilities
   ```

3. **The AI agent will automatically**:
   - Detect your intent to scan
   - Call the `scan_repository` tool internally
   - Use your workspace path automatically
   - Return results in the chat

**No JSON configuration needed!** Just use natural language.

---

### Method 2: Quick Action Button

1. Open CipherMate chat panel
2. Click the **"Scan Repository"** button
3. That's it! The scan runs automatically

---

### Method 3: Command Palette

1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. Type: `CipherMate: Intelligent Scan`
3. Press Enter
4. Scan runs automatically

---

## 🔍 How It Actually Works

When you say "scan my repository", here's what happens internally:

```typescript
// 1. User types: "scan my repository"
// 2. Chat interface detects scan intent
// 3. AgenticCore.processRequest() is called
// 4. AI agent decides to use scan_repository tool
// 5. Tool executes with workspace path automatically:

{
  path: "/path/to/your/workspace",  // Auto-detected from VS Code
  includePatterns: undefined,      // Optional - defaults to all files
  excludePatterns: undefined        // Optional - defaults to standard excludes
}
```

**You don't need to provide JSON!** The extension handles everything automatically.

---

## 📋 What Gets Scanned

The `scan_repository` tool automatically:

1. **Scans your entire workspace** (the folder you have open in VS Code)
2. **Uses intelligent defaults**:
   - Includes: All code files (`.js`, `.ts`, `.py`, `.sol`, etc.)
   - Excludes: `node_modules`, `.git`, `dist`, `build`, etc.
3. **Runs multiple scanners**:
   - Dependency Scanner (checks `package.json`, `requirements.txt`, etc.)
   - Secrets Scanner (finds hardcoded API keys, passwords)
   - Smart Contract Scanner (for `.sol` files)
   - Code Pattern Scanner (SQL injection, XSS, etc.)
   - AI Analysis (deep code analysis)

---

## 🎯 Advanced Usage (Optional)

If you want to customize what gets scanned, you can be more specific:

```
scan my repository but exclude node_modules and dist folders
```

or

```
scan only Python files in my repository
```

or

```
scan my repository and focus on smart contracts
```

The AI agent will understand and adjust the scan parameters accordingly.

---

## 📊 Understanding Results

After scanning, you'll see:

1. **Summary in chat**: 
   ```
   Repository scan completed: Found 12 vulnerabilities (3 critical, 5 high)
   ```

2. **Detailed results**:
   - List of all vulnerabilities
   - File paths and line numbers
   - Severity levels
   - Descriptions

3. **Next steps**:
   ```
   [Found 12 vulnerabilities. Use "fix vulnerabilities" to generate fixes.]
   ```

---

## 🛠️ Fixing Vulnerabilities

After scanning, you can:

1. **Ask for fixes**:
   ```
   fix all critical vulnerabilities
   ```
   or
   ```
   show me how to fix the SQL injection in user.js
   ```

2. **Apply fixes automatically**:
   ```
   apply fixes to all vulnerabilities
   ```

---

## ❌ What NOT to Do

**Don't try to use API endpoints** - they don't exist:
- ❌ `http://ciphermateapi/v1alpha1/tools/analyze`
- ❌ `http://ciphermateapi/v1alpha1/tools/generate-code`
- ❌ `http://ciphermateapi/v1alpha1/tools/apply-fix`

**Don't manually construct JSON** - just use natural language:
- ❌ `{"path": "/home/user/.git", "includePatterns": [".*"]}`
- ✅ `"scan my repository"`

---

## 💡 Example Conversation

```
You: scan my repository

CipherMate: Scanning repository...
         Running Dependency Scanner...
         Running Secrets Scanner...
         Running Code Pattern Scanner...
         Running AI Analysis...
         
         Repository scan completed: Found 8 vulnerabilities (2 critical, 4 high, 2 medium)
         
         Critical Issues:
         1. SQL Injection in src/api/users.js:45
         2. Hardcoded API Key in config/secrets.js:12
         
         [Found 8 vulnerabilities. Use "fix vulnerabilities" to generate fixes.]

You: fix the SQL injection

CipherMate: Analyzing SQL injection vulnerability...
         Generating secure fix...
         
         Original code:
         const query = `SELECT * FROM users WHERE id = ${userId}`;
         
         Fixed code:
         const query = 'SELECT * FROM users WHERE id = ?';
         db.query(query, [userId], ...);
         
         Would you like me to apply this fix?
```

---

## 🔗 Related Documentation

- [User Interaction Guide](./USER_INTERACTION_GUIDE.md)
- [Repository Scanning Guide](./REPOSITORY_SCANNING_GUIDE.md)
- [Scanner Architecture](./SCANNER_ARCHITECTURE.md)

---

## 🆘 Still Having Issues?

If you're still seeing incorrect API endpoint instructions:

1. **Make sure you're using the VS Code extension**, not trying to call an API
2. **Check that CipherMate is installed** in VS Code
3. **Open a workspace folder** in VS Code (File → Open Folder)
4. **Use natural language** - just type what you want in plain English

The extension handles all the technical details automatically!

