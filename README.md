# CipherMate

Enterprise-grade security analysis extension for VS Code

CipherMate combines static analysis tools with AI-powered vulnerability detection and dynamic penetration testing to help developers write more secure code.

---

## GET STARTED IN 3 STEPS

### Step 1: Open CipherMate
1. Look for the CipherMate icon in the left sidebar (Activity Bar)
2. Click the icon - Welcome screen will open automatically
3. OR Press `Cmd+Shift+P` (Mac) / `Ctrl+Shift+P` (Windows) and type `CipherMate`

### Step 2: Configure Your AI (Required First Step)
1. On the welcome screen, click **"Step 1: Configure API Key"**
2. Choose your AI provider:
   - Local Models: Ollama or LM Studio (free, runs on your machine)
   - Cloud APIs: OpenAI, Anthropic, OpenRouter (requires API key)
3. Enter your API key or local endpoint URL
4. Click **"Save"**

**Don't have an API key?** See [Ollama Setup Guide](docs/setup/OLLAMA_QUICK_START.md) for free self-hosted option.

### Step 3: Start Using CipherMate
1. Click **"Step 2: Start Chatting"** on welcome screen
2. Type your request, for example:
   - `"scan my code"`
   - `"find vulnerabilities"`
   - `"explain security issues"`
3. Press Enter or click Send
4. CipherMate will analyze your code and provide results

---

## QUICK GUIDE

### Where to Find Everything

**Activity Bar (Left Sidebar)**:
- Click **CipherMate icon** - See Welcome section with quick actions
- Click **"Get Started"** - Opens welcome screen
- Click **"Configure Settings"** - Opens settings panel

**Command Palette** (`Cmd+Shift+P` / `Ctrl+Shift+P`):
- Type `CipherMate` - Open welcome screen
- Type `CipherMate: Advanced Settings` - Configure API keys
- Type `CipherMate: Show Results Panel` - View scan results
- Type `CipherMate: Red Team Operations Center` - Open pentest interface

**Welcome Screen** (Opens automatically):
- **Configure API Key** - Set up your AI provider (required first)
- **Start Chatting** - Begin using CipherMate
- **Quick Input** - Type directly to start

---

## RED TEAM AND PENTEST

### Run a Pentest
1. Open **Red Team Operations Center** (`Cmd+Shift+P` - `CipherMate: Red Team Operations Center`)
2. Enter target URL (e.g. `https://api.example.com` or `http://localhost:3000`)
3. Click **Start Pentest**
4. View findings in the Live Activity Feed (terminal-style, black and green)
5. Use **View Results** or **War Room Live** for full dashboard

**Pentest features**:
- WAF/Cloudflare evasion: rotating User-Agents, browser headers, 403 retries
- Unrestricted mode: high concurrency (80), 1000 endpoints, 12 retries, no artificial time limits
- Optional Nuclei integration when installed in PATH
- AI-powered attack Q&A: ask questions about findings when the scan completes

### Export Findings
- Export to local file (JSON or ZIP) with full vulnerability data
- Available from pentest results panel and Red Team quick access

---

## COMMON TASKS

### Scan Your Code
1. Open CipherMate (click icon or `Cmd+Shift+P` - `CipherMate`)
2. Type: `"scan my code"` or `"find vulnerabilities"`
3. Press Enter
4. View results in the Results Panel

### Configure Settings
1. Click **"Configure API Key"** on welcome screen
2. OR: `Cmd+Shift+P` - `CipherMate: Advanced Settings`
3. Choose provider and enter API key
4. Click **Save**

### View Results
1. After scanning, click **"Show Results"** on welcome screen
2. OR: `Cmd+Shift+P` - `CipherMate: Show Results Panel`
3. Pentest results open in a dedicated Pentest Results panel
4. See all vulnerabilities with severity levels
5. Click **"Fix"** or **"Explain"** for each issue

### @-mention a file in chat (exact path + full file context)
CipherMate reads the file from your **opened workspace** and injects its contents into the prompt so answers target that file.

1. **Shorthand (recommended):** type `@` + path from the workspace root, after a space or at the start of the message:
   - `@src/server.js` — review or fix this file
   - `@packages/api/src/index.ts` — monorepo subfolder
   - `@/Users/you/project/src/server.js` — absolute path (must be inside the workspace)
2. **Explicit:** `@file src/server.js` or `@file "/path with spaces/file.js"`
3. You can also **paste a full path** without `@`; if it’s under the workspace, the same file context is added.
4. **Tip:** Open the folder that contains the project as the workspace root so `@src/...` matches your tree.

---

## SETUP OPTIONS

### Option 1: Self-Hosted (Free) - Recommended for Privacy
**Use Ollama with DeepSeek Coder**:
- See: [Ollama Quick Start Guide](docs/setup/OLLAMA_QUICK_START.md)
- Set up on VPS or local machine
- No API costs, complete privacy

### Option 2: Cloud APIs (Paid)
**Choose from**:
- OpenAI (GPT-4, GPT-5)
- Anthropic (Claude Sonnet 4.5)
- OpenRouter (450+ models)
- Google Gemini

**Setup**:
1. Get API key from provider
2. Open Settings (`Cmd+Shift+P` - `CipherMate: Advanced Settings`)
3. Select provider
4. Enter API key
5. Save

### Option 3: Local Models
**LM Studio or Ollama**:
- Download and install locally
- Start server on port 1234 (LM Studio) or 11434 (Ollama)
- Configure in Settings - Providers - Local AI

---

## TROUBLESHOOTING

**"I don't see the CipherMate icon"**
- Check Extensions view (`Cmd+Shift+X`)
- Make sure CipherMate is installed and enabled
- Reload VS Code window

**"Welcome screen doesn't open"**
- Click CipherMate icon in activity bar
- OR: `Cmd+Shift+P` - `CipherMate`
- Check Output panel for errors: `View - Output - CipherMate`

**"AI not responding"**
- Check Settings - Configure API Key
- Verify API key is correct
- Test connection in Settings panel
- For local models, ensure server is running

---

## FEATURES

### Intelligent Security Scanning
- Multi-tool Integration: Semgrep, Bandit, retire.js, and AI analysis
- Dependency scanning: package.json, requirements.txt, Cargo.toml, go.mod, and more
- Hardcoded secrets detection: AWS keys, API tokens, OAuth, database credentials
- Smart contract scanning (Solidity)
- Real-time detection: scans on save with configurable intervals
- Cross-language support: JavaScript, TypeScript, Python, PHP, Java, C/C++, Go, Rust, Ruby, Shell
- Intelligent caching, incremental scanning, background processing

### Dynamic Testing and Pentest
- Red Team Operations Center: unified pentest interface
- DAST: SQL injection, XSS, SSRF, path traversal, command injection, and more
- WAF/Cloudflare evasion: rotating User-Agents, browser-like headers, 403 retries
- Unrestricted mode: high concurrency, extended retries, no time limits
- Optional Nuclei integration when in PATH
- War Room: live dashboard of pentest activity
- AI pentest Q&A: ask questions about findings in natural language

### AI-Powered Analysis
- Multi-provider support: OpenRouter, OpenAI, Anthropic, Gemini, Ollama
- Intelligent fixes: AI-generated code fixes and explanations
- Memory system: encrypted storage for developer profiles
- Context-aware filtering and exploitability scoring

### Team Collaboration
- Team Dashboard: track progress and vulnerabilities
- Automated reporting to team leads
- Policy management

### Security and Privacy
- Encrypted storage: AES-256-CBC for sensitive data
- Local export: JSON or ZIP for pentest findings (no external upload)
- Configurable: full control over AI providers and data

---

## COMMANDS

| Command | Description |
|---------|-------------|
| `CipherMate: Scan Code` | Quick security scan |
| `CipherMate: Intelligent Repository Scan` | Comprehensive AI-powered scan |
| `CipherMate: Red Team Operations Center` | Open pentest interface |
| `CipherMate: Run Pentest` | Launch pentest on target URL |
| `CipherMate: Show Results Panel` | Open results viewer |
| `CipherMate: View Pentest Improvements` | Open pentest results |
| `CipherMate: Extract & Upload Pentest Findings` | Export findings locally |
| `CipherMate: Advanced Settings` | Configure API keys and options |
| `CipherMate: Scan with Semgrep` | Semgrep-only scan |
| `CipherMate: Scan with Bandit` | Python security scan |
| `CipherMate: Incremental Scan` | Scan changed files only |

---

## CONFIGURATION

### DAST / Pentest Settings
- **dast.wafEvasion**: Rotate User-Agents and retry 403 with evasion headers (default: true)
- **dast.unrestrictedMode**: High concurrency, 1000 endpoints, 12 retries (default: true)
- **dast.enableExternalTools**: Run Nuclei when in PATH (default: true)

### General Settings
- Enable Semgrep, Bandit: toggle static analysis
- Scan on Save: automatic scans
- Team reporting threshold and frequency

---

## DEVELOPMENT

### Build
```bash
npm install
npm run compile
```

### Test
```bash
npm test
npm run watch-tests
npm run lint
```

### Architecture
- Scanner Engine: orchestrates dependency, secrets, code-pattern, smart-contract scanners
- Agent Orchestrator: DAST and pentest pipeline with AI strategist
- Red Team Operations Center: webview-based pentest UI
- War Room Server: live event stream for pentest visualization

---

## DOCUMENTATION

All guides in [`docs/`](docs/):

- [Getting Started](docs/setup/START_HERE.md)
- [Ollama Setup (Self-Hosted AI)](docs/setup/OLLAMA_QUICK_START.md)
- [Multi-Provider Guide](docs/setup/MULTI_PROVIDER_GUIDE.md)

---

## LICENSE

MIT License - see LICENSE file.

---

## ACKNOWLEDGMENTS

- Semgrep: static analysis
- Bandit: Python security linter
- Nuclei: optional vulnerability scanning (ProjectDiscovery)
- VS Code: extension platform
