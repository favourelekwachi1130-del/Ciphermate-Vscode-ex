# Quick Start - Repository Scanning

## Overview

CipherMate now provides **comprehensive repository security scanning** with multiple specialized scanners working together.

---

## 🚀 Quick Start

### 1. Open Your Repository
Open any repository in VS Code.

### 2. Start Scanning
**Option A: Via Chat**
- Open CipherMate chat (`Cmd+Shift+P` → `CipherMate`)
- Type: `"scan my repository"`
- Press Enter

**Option B: Via Command**
- `Cmd+Shift+P` → `CipherMate: Intelligent Scan`
- Or click "Scan Repository" button

### 3. View Results
- Results appear in Results Panel
- Inline diagnostics show in editor
- Filter by severity (Critical, High, Medium, Low)

---

## 🔍 What Gets Scanned

### ✅ Dependency Vulnerabilities
- **npm/Node.js**: `package.json`
- **Python**: `requirements.txt`, `Pipfile`
- **Rust**: `Cargo.toml`
- **Go**: `go.mod`
- **Java**: `pom.xml`
- **Ruby**: `Gemfile`
- **PHP**: `composer.json`

**Example Findings**:
- `lodash@4.17.15` has CVE-2021-23337
- `express@4.16.0` has known vulnerability

### ✅ Hardcoded Secrets
- AWS Access Keys
- GitHub Tokens
- API Keys
- Database Credentials
- Private Keys
- Passwords
- OAuth Tokens

**Example Findings**:
- AWS key found in `config.js` line 42
- GitHub token in `.env` file

---

## 📊 Understanding Results

### Severity Levels
- **🔴 Critical**: Immediate action required (secrets, critical CVEs)
- **🟠 High**: Should fix soon (high CVEs, exposed credentials)
- **🟡 Medium**: Fix when possible (medium CVEs)
- **🟢 Low**: Consider fixing (low CVEs, info)
- **ℹ️ Info**: Informational (best practices)

### Result Format
Each vulnerability shows:
- **Type**: dependency-vulnerability, hardcoded-secret, etc.
- **Severity**: Critical, High, Medium, Low, Info
- **File**: Path to file
- **Line**: Line number (if applicable)
- **Description**: What was found
- **Fix**: How to fix it (if available)

---

## 🛠️ Common Tasks

### Scan Only Dependencies
```typescript
// In chat: "scan my dependencies"
// Or use RepositoryScanner directly:
const scanner = new RepositoryScanner(workspacePath);
const result = await scanner.scan({
  scanners: ['dependency-scanner']
});
```

### Find Secrets Only
```typescript
// In chat: "find hardcoded secrets"
// Or:
const result = await scanner.scan({
  scanners: ['secrets-scanner']
});
```

### Full Comprehensive Scan
```typescript
// Default behavior - runs all scanners
const result = await scanner.scan();
```

---

## 🔧 Configuration

### Enable/Disable Scanners
```json
// .vscode/settings.json
{
  "ciphermate.scanners.dependency.enabled": true,
  "ciphermate.scanners.secrets.enabled": true
}
```

### Scanner Options
```json
{
  "ciphermate.scanners.dependency.enrichCVE": true,
  "ciphermate.scanners.secrets.strictMode": false
}
```

---

## 📝 Examples

### Example 1: Finding Vulnerable Dependencies
```
User: "scan my dependencies"

CipherMate:
[SCANNING] Checking package.json...
[FOUND] 3 vulnerabilities:
  - lodash@4.17.15: CVE-2021-23337 (High)
  - express@4.16.0: Known vulnerability (Medium)
  - axios@0.19.0: CVE-2020-28168 (Critical)

[FIX] Update to:
  - lodash@4.17.21
  - express@4.18.0
  - axios@1.0.0
```

### Example 2: Finding Secrets
```
User: "find secrets in my code"

CipherMate:
[SCANNING] Checking all code files...
[FOUND] 2 secrets:
  - AWS Access Key in config.js:42 (Critical)
  - GitHub Token in .env:15 (Critical)

[FIX] Move to environment variables:
  - Use process.env.AWS_ACCESS_KEY_ID
  - Use process.env.GITHUB_TOKEN
```

---

## 🎯 Best Practices

1. **Run scans regularly**: Before commits, before deployments
2. **Fix critical first**: Address critical vulnerabilities immediately
3. **Review secrets**: Never commit secrets, use environment variables
4. **Update dependencies**: Keep dependencies up to date
5. **Use CI/CD**: Integrate scans into your pipeline

---

## 🚨 Common Issues

### "No vulnerabilities found"
- ✅ Good! Your code is secure
- Or: Scanners may not support your dependency format yet

### "Scanner failed"
- Check if required tools are installed (e.g., retire.js for npm)
- Check VS Code Output panel for details
- Other scanners will continue running

### "Too many false positives"
- Adjust scanner sensitivity in settings
- Report patterns that need improvement

---

## 📚 Learn More

- [Scanner Architecture](SCANNER_ARCHITECTURE.md)
- [Feature Porting Roadmap](FEATURE_PORTING_ROADMAP.md)
- [Repository Scanning Guide](REPOSITORY_SCANNING_GUIDE.md)

---

**Ready to scan?** Open CipherMate and type `"scan my repository"`!

