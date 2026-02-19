# Pillars 1 & 2: One-Click AutoFix Implementation

## Summary

Both pillars are now wired up to compete with Aikido:

1. **One-Click SCA AutoFix** – Dependency vulnerability fixes
2. **AI Autofix SAST** – Static code analysis fixes (already existed, enhanced)

---

## Pillar 1: One-Click SCA AutoFix (Dependency Scanning)

### What Was Added

| Component | Description |
|-----------|-------------|
| **DependencyFixer** | `src/fix-system/dependency-fixer.ts` – Generates fixes for vulnerable npm/Python dependencies |
| **FixService integration** | Routes `dependency-vulnerability` to DependencyFixer before AI |
| **Dependency scanner** | Stores `fixedVersion` in metadata from retire.js `below` field |
| **enableRetire** | New config `scanners.enableRetire` (default: true) – enables npm CVE scanning |

### How It Works

1. **Scan** – Run "scan my repository" or "check dependencies"
2. **Findings** – Dependency scanner (retire.js) reports vulnerable packages with `metadata.fixedVersion`
3. **Fix** – Click "Fix" on a dependency finding → DependencyFixer updates `package.json` (or `requirements.txt`)
4. **Apply** – FixApplicator replaces the version line in the file

### Supported

- **package.json** – npm dependencies (dependencies + devDependencies)
- **requirements.txt** – Python packages (when parser supports it)

### After Fix

- For npm: run `npm install` to install the upgraded version
- For Python: run `pip install -r requirements.txt`

---

## Pillar 2: AI Autofix SAST (Static Code Analysis)

### What Already Existed

| Component | Description |
|-----------|-------------|
| **FixService** | AI + rule-based fix generation |
| **RuleBasedFixer** | SQL injection, XSS, command injection, hardcoded secrets, path traversal, MD5, etc. |
| **FixApplicator** | Applies edits via WorkspaceEdit |
| **generateFix command** | `ciphermate.generateFix` (vulnerability) |

### Flow

1. **Scan** – Semgrep, Bandit, CodePatternScanner, SecretsScanner find issues
2. **Fix** – Click "Fix" in chat/Results → `generateFix(vulnerability)` → preview → Apply
3. **Apply** – FixService generates proposal (AI or rule-based) → user confirms → FixApplicator applies

### Trigger Points

- **Chat** – "fix vulnerabilities" or Fix button next to findings
- **Command** – `CipherMate: Generate Fix` (pass vulnerability from context)
- **Fix button** – In scan result message for each finding

---

## Testing Both Pillars

### SCA (Dependencies)

1. Create a `package.json` with a known vulnerable package, e.g.:
   ```json
   { "dependencies": { "lodash": "4.17.1" } }
   ```
2. Enable `scanners.enableRetire` (default: true)
3. Run "scan my repository" or "check dependencies"
4. Click "Fix" on the lodash finding
5. Confirm – `package.json` should update to `"lodash": "^4.17.21"` (or patched version)
6. Run `npm install`

### SAST (Code)

1. Use a repo with vulnerable code (e.g. vulnerable-code-snippets)
2. Run "scan my repository"
3. Click "Fix" next to a SQL injection, XSS, or hardcoded secret finding
4. Preview → Apply
5. Code should be updated (parameterized query, textContent, env var, etc.)

---

## Config Reference

```json
{
  "ciphermate.scanners.enableDependency": true,
  "ciphermate.scanners.enableRetire": true
}
```

- `enableRetire: true` – Required for npm CVE scanning and SCA one-click fix
- Retire.js runs via `npx retire` (ensure Node/npm available)

---

## Next Steps (From Battle Plan)

- CodeActionProvider: "Fix with CipherMate" in Problems panel (Cmd+.)
- CodeLens: Inline "Fix" on each finding line
- Batch fix: "Fix all similar" for grouped issues
- One-click mode: Skip preview for high-confidence fixes (config)
