# SAST, SCA & Eagle Eye Implementation

## Overview

CipherMate uses **our own tools** – no paid dependencies. AI + patterns throughout:

| Category | Tools | Status |
|----------|-------|--------|
| **SAST** | CipherMate SAST, Semgrep, Bandit | ✅ CipherMate AI SAST (ours); Semgrep/Bandit optional |
| **SCA** | retire.js, Snyk | ✅ retire.js active; Snyk opt-in |
| **Eagle Eye** | AI-powered save scanner | ✅ Active – AI + patterns, not Semgrep |

---

## 1. SCA – One-Click Autofix (Snyk, GitHub Advanced Security)

### Snyk
- **Enable:** `ciphermate.scanners.enableSnyk: true`
- **Requires:** `npm install -g snyk` then `snyk auth`
- **Scans:** `package.json`, dependency vulnerabilities, CVEs
- **Location:** `src/scanners/snyk-scanner.ts`

### CodeQL (GitHub Advanced Security)
- **Enable:** `ciphermate.scanners.enableCodeQL: true`
- **Requires:** CodeQL CLI from [github/codeql-action/releases](https://github.com/github/codeql-action/releases)
- **Scans:** JavaScript, Python (and more via CodeQL)
- **Note:** First run builds a CodeQL DB; later runs reuse it
- **Location:** `src/scanners/codeql-scanner.ts`

### Existing: retire.js
- Uses retire.js for npm dependencies
- **Setting:** `scanners.enableRetire` (default: true)

---

## 2. SAST – CipherMate AI SAST (Our Own, No Paid Tools)

### CipherMate SAST
- **Status:** ✅ Active (default)
- **Setting:** `scanners.enableCipherMateSAST: true`
- **How it works:** Pattern matching + AI analysis via your configured provider (Ollama, OpenRouter, etc.)
- **Location:** `src/scanners/ciphermate-sast-scanner.ts`
- **Engine:** `src/core/ai-security-analyzer.ts`

### Semgrep
- **Status:** ✅ Optional (CLI)
- **Setting:** `enableSemgrep: true` (default)
- Runs on full repo scan

### Bandit
- **Status:** ✅ Optional (Python)
- **Setting:** `enableBandit: true` (default)

---

## 3. Eagle Eye – AI-Powered Silent Scans on Save

- **Setting:** `ciphermate.eagleEye.enabled: true` (default)
- **Behavior:** On save, runs **AI analysis + pattern matching** on the saved file (no Semgrep)
- **Output:** Findings appear in the Results panel with tool badge `"Eagle Eye"`
- **Location:** `src/core/eagle-eye-service.ts`
- **Engine:** Same `ai-security-analyzer` as CipherMate SAST

---

## 4. AI Synthesis (Optional)

`src/core/ai-result-synthesis.ts` can merge results from multiple scanners, deduplicate, and filter false positives. It’s ready for wiring to your AI provider.

---

## Configuration Summary

```json
{
  "ciphermate.scanners.enableCipherMateSAST": true,
  "ciphermate.scanners.enableSnyk": false,
  "ciphermate.scanners.enableCodeQL": false,
  "ciphermate.eagleEye.enabled": true
}
```

---

## Enabling Snyk

1. `npm install -g snyk`
2. `snyk auth` (browser auth)
3. Set `ciphermate.scanners.enableSnyk: true`

## Enabling CodeQL

1. Download [CodeQL bundle](https://github.com/github/codeql-action/releases)
2. Add `codeql` to PATH
3. Set `ciphermate.scanners.enableCodeQL: true`
