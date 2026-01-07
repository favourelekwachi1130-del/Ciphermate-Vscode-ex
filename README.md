# CipherMate

Enterprise-grade security analysis extension for VS Code

CipherMate is a comprehensive security extension that combines static analysis tools with AI-powered vulnerability detection to help developers write more secure code.

---

##  GET STARTED IN 3 STEPS

### Step 1: Open CipherMate
1. **Look for the CipherMate icon** in the left sidebar (Activity Bar)
2. **Click the icon** - Welcome screen will open automatically
3. **OR** Press `Cmd+Shift+P` (Mac) / `Ctrl+Shift+P` (Windows) and type `CipherMate`

### Step 2: Configure Your AI (Required First Step)
1. On the welcome screen, click **"Step 1: Configure API Key"**
2. Choose your AI provider:
   - **Local Models**: Ollama or LM Studio (free, runs on your machine)
   - **Cloud APIs**: OpenAI, Anthropic, OpenRouter (requires API key)
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

## 📖 QUICK GUIDE

### Where to Find Everything

**Activity Bar (Left Sidebar)**:
- Click **CipherMate icon** → See Welcome section with quick actions
- Click **"Get Started"** → Opens welcome screen
- Click **"Configure Settings"** → Opens settings panel

**Command Palette** (`Cmd+Shift+P` / `Ctrl+Shift+P`):
- Type `CipherMate` → Open welcome screen
- Type `CipherMate: Advanced Settings` → Configure API keys
- Type `CipherMate: Show Results Panel` → View scan results
- Type `CipherMate: Scan Code` → Run security scan

**Welcome Screen** (Opens automatically):
- **Configure API Key** → Set up your AI provider (required first)
- **Start Chatting** → Begin using CipherMate
- **Quick Input** → Type directly to start

---

## COMMON TASKS

### Scan Your Code
1. Open CipherMate (click icon or `Cmd+Shift+P` → `CipherMate`)
2. Type: `"scan my code"` or `"find vulnerabilities"`
3. Press Enter
4. View results in the Results Panel

### Configure Settings
1. Click **"Configure API Key"** on welcome screen
2. OR: `Cmd+Shift+P` → `CipherMate: Advanced Settings`
3. Choose provider and enter API key
4. Click **Save**

### View Results
1. After scanning, click **"Show Results"** on welcome screen
2. OR: `Cmd+Shift+P` → `CipherMate: Show Results Panel`
3. See all vulnerabilities with severity levels
4. Click **"Fix"** or **"Explain"** for each issue

### Get Help
- Welcome screen shows Quick Start Guide
- Activity bar has clickable quick actions
- All commands available via Command Palette

---

## ⚙️ SETUP OPTIONS

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
2. Open Settings (`Cmd+Shift+P` → `CipherMate: Advanced Settings`)
3. Select provider
4. Enter API key
5. Save

### Option 3: Local Models
**LM Studio or Ollama**:
- Download and install locally
- Start server on port 1234 (LM Studio) or 11434 (Ollama)
- Configure in Settings → Providers → Local AI

---

##  TROUBLESHOOTING

### "I don't see the CipherMate icon"
- Check Extensions view (`Cmd+Shift+X`)
- Make sure CipherMate is installed and enabled
- Reload VS Code window

### "Welcome screen doesn't open"
- Click CipherMate icon in activity bar
- OR: `Cmd+Shift+P` → `CipherMate`
- Check Output panel for errors: `View → Output → CipherMate`

### "AI not responding"
- Check Settings → Configure API Key
- Verify API key is correct
- Test connection in Settings panel
- For local models, ensure server is running

### "How do I scan my code?"
1. Open CipherMate welcome screen
2. Click "Start Chatting"
3. Type: `"scan my code"`
4. Press Enter
5. View results in Results Panel

---

##  LEARN MORE

**Documentation**: All guides in [`docs/`](docs/) folder

**Quick Links**:
- [Getting Started Guide](docs/setup/START_HERE.md)
- [Ollama Setup (Free Self-Hosted)](docs/setup/OLLAMA_QUICK_START.md)
- [Settings Guide](docs/setup/MULTI_PROVIDER_GUIDE.md)
- [How to Test](docs/HOW_TO_TEST.md)

---

##  FOR DEVELOPERS

### Installation for Development

## Features

### Intelligent Security Scanning
- **Multi-tool Integration**: Combines Semgrep, Bandit, and AI analysis
- **Real-time Detection**: Scans code on save with configurable intervals
- **Smart Prioritization**: Automatically prioritizes vulnerabilities by severity
- **Cross-language Support**: JavaScript, TypeScript, Python, PHP, Java, C/C++, Go, Rust, Ruby, Shell
- **Background Processing**: Non-blocking scans with progress indicators
- **Intelligent Caching**: 24-hour cache system for faster repeated scans
- **Incremental Scanning**: Only scans changed files for maximum efficiency

### AI-Powered Analysis
- **LM Studio Integration**: Uses local AI models for advanced pattern detection
- **Personalized Learning**: Tracks your security learning progress and adapts suggestions
- **Intelligent Fixes**: AI-generated code fixes and detailed explanations
- **Memory System**: Remembers your common mistakes and provides targeted guidance

### Team Collaboration
- **Team Dashboard**: Track team member security progress and vulnerabilities
- **Automated Reporting**: Real-time vulnerability reports to team leads
- **Progress Tracking**: Monitor individual and team security learning
- **Policy Management**: Enforce security policies across the team

### Security & Privacy
- **Encrypted Storage**: All data encrypted with AES-256-CBC
- **Local Processing**: AI analysis runs locally via LM Studio
- **Secure Memory**: Developer profiles and team data encrypted at rest
- **Privacy First**: No data sent to external services

### User Interface
- **Interactive Results Panel**: Beautiful, VSCode-themed interface
- **Real-time Notifications**: Contextual alerts with severity indicators
- **Settings Management**: Easy configuration through webview interface
- **Export Capabilities**: Export scan results in multiple formats

## Installation

### For End Users

**Install from VSIX file:**
```bash
code --install-extension ciphermate-1.0.2.vsix
```

**Or from VS Code:**
1. Open Extensions view (`Cmd+Shift+X`)
2. Click "..." menu → "Install from VSIX..."
3. Select `ciphermate-1.0.2.vsix`

### For Developers

See [Development Setup](docs/setup/START_HERE.md) for development instructions.

---

## Prerequisites (Optional)

**For AI Features:**
- AI Provider API key (OpenAI, Anthropic, etc.) OR
- Local AI server (Ollama, LM Studio)

**For Static Analysis (Optional):**
- Python 3.7+ (for Semgrep/Bandit)
- `pip install semgrep` (for Semgrep)
- `pip install bandit` (for Python security scanning)

**Note:** CipherMate works without these, but AI features require an AI provider configured.

## Commands

| Command | Description |
|---------|-------------|
| `CipherMate: Scan Code` | Quick security scan |
| `CipherMate: Intelligent Repository Scan` | Comprehensive AI-powered scan |
| `CipherMate: Scan with Semgrep` | Semgrep-only scan with AI enhancement |
| `CipherMate: Scan with Bandit` | Python security scan |
| `CipherMate: Show Results Panel` | Open interactive results viewer |
| `CipherMate: Settings` | Open settings interface |
| `CipherMate: Show Developer Profile` | View your security learning progress |
| `CipherMate: Setup Team Collaboration` | Configure team features |
| `CipherMate: Team Dashboard` | View team security dashboard |
| `CipherMate: View Team Reports` | Check team vulnerability reports |
| `CipherMate: Clear Encrypted Data` | Clear stored scan results |
| `CipherMate: Test Encrypted Storage` | Test encryption functionality |
| `CipherMate: Incremental Scan` | Scan only changed files since last scan |
| `CipherMate: Clear Scan Cache` | Clear the scan results cache |
| `CipherMate: Show Cache Status` | View cache statistics and recent entries |
| `CipherMate: Background Scan Status` | Check status of background scans |

## Configuration

### Settings Options
- **Enable Semgrep**: Toggle Semgrep static analysis
- **Enable Bandit**: Toggle Python security scanning
- **Scan on Save**: Automatically scan when files are saved
- **Scan Interval**: Number of saves before full scan (default: 1)

### Team Settings
- **Reporting Threshold**: Minimum severity to report (Critical/High/Medium/Low/All)
- **Report Frequency**: How often to send reports (Real-time/Daily/Weekly/Monthly)
- **Team Members**: Manage team member access and roles

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run watch-tests

# Run linting
npm run lint
```

## Architecture

### Core Components
- **Scanner Engine**: Orchestrates multiple security tools
- **AI Integration**: LM Studio client for intelligent analysis
- **Memory System**: Encrypted storage for developer profiles
- **Team Management**: Collaboration and reporting features
- **UI Components**: Modern webview-based interfaces

### Data Flow
1. **File Change Detection**  �  Trigger scan
2. **Multi-tool Scanning**  �  Semgrep, Bandit, AI analysis
3. **Result Processing**  �  Prioritization and deduplication
4. **AI Enhancement**  �  Personalized explanations and fixes
5. **Team Reporting**  �  Automated vulnerability notifications
6. **Encrypted Storage**  �  Secure result persistence

## Security Features

### Encryption
- **AES-256-CBC**: All sensitive data encrypted
- **Unique Keys**: Per-installation encryption keys
- **Secure Storage**: VS Code global state with encryption

### Privacy
- **Local Processing**: No external API calls for analysis
- **Encrypted Memory**: Developer profiles and team data protected
- **Configurable**: Full control over data sharing

## Roadmap

### Completed
- [x] Basic insecure code detection
- [x] AI integration (LM Studio)
- [x] Full codebase scanning with Semgrep
- [x] Dashboard UI panel
- [x] Encrypted memory system
- [x] Team collaboration features
- [x] Comprehensive error handling
- [x] Unit testing framework
- [x] Background processing system
- [x] Intelligent caching system
- [x] Progress indicators and UX improvements
- [x] Incremental scanning capabilities

### In Progress
- [ ] Results export functionality
- [ ] Performance optimization
- [ ] VS Code Marketplace publication

### Planned
- [ ] Custom security rules engine
- [ ] Integration with CI/CD pipelines
- [ ] Advanced reporting and analytics
- [ ] Offline mode improvements
- [ ] Additional AI model support

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Documentation

     **All documentation has been organized into the [`docs/`](./docs/) folder:**

- **[Setup Guides](./docs/setup/)** - Quick start guides, deployment, and configuration
- **[Training Guides](./docs/training/)** - AI model training and development guides
- **[Architecture](./docs/architecture/)** - System design and architecture documentation
- **[Cost & Strategy](./docs/cost-strategy/)** - Cost management and strategic planning
- **[Integration](./docs/integration/)** - Integration guides and feature documentation

**Quick Links:**
-      [Getting Started](./docs/setup/START_HERE.md)
-      [Ollama Setup (Self-Hosted AI)](./docs/setup/OLLAMA_QUICK_START.md)
-        [Cloud AI Setup](./docs/setup/CLOUD_AI_SETUP.md)
-      [Training Guide](./docs/training/TRAINING_GUIDE.md)

## Support

- **Issues**: Report bugs and request features on GitHub
- **Documentation**: See [docs/](./docs/) folder for comprehensive guides
- **Community**: Join discussions in GitHub Discussions

## Acknowledgments

- **Semgrep**: Static analysis engine
- **Bandit**: Python security linter
- **LM Studio**: Local AI model hosting
- **VS Code**: Extension platform
