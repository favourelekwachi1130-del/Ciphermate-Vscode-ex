# CipherMate SAST Improvements

## Implemented

### Phase 1: Two-Stage Flow
- **Pattern scan → AI validation**: Patterns find candidates; AI validates each (real vs false positive)
- **Fewer false positives**: AI rejects obvious false positives before surfacing to user

### Phase 1: Confidence Scoring
- **0–100% per finding**: Pattern-only ≈50%, AI-validated ≈88%
- **Config**: `ciphermate.scanners.cipherMateSASTMinConfidence` (default 40)
- **UI**: Confidence badge shown next to tool badge in Results panel

### Phase 1: Context Windows
- **~20 lines to AI**: Only sends the snippet around each candidate (configurable `contextLines`)
- **Lower tokens**: Much cheaper and faster than full-file analysis

### Phase 2: AST-Based Rules
- **Structural patterns** for JS/TS: `eval()`, `exec`/`execSync`, `innerHTML`, `dangerouslySetInnerHTML`
- **Uses Babel**: @babel/parser + @babel/traverse
- **Fewer regex false positives**: AST understands structure, not just text

## Configuration

```json
{
  "ciphermate.scanners.enableCipherMateSAST": true,
  "ciphermate.scanners.cipherMateSASTMinConfidence": 40,
  "ciphermate.scanners.cipherMateSASTMaxFiles": 50
}
```

## Flow

1. **Pattern scan** – Regex rules find candidates
2. **AST rules** – Babel parses JS/TS, structural rules find more
3. **Merge** – Dedupe by line, keep highest severity
4. **AI validation** – One prompt per file with all candidates + context windows
5. **Filter** – Drop AI-confirmed false positives, keep validated + unvalidated (lower confidence)
6. **Min confidence** – Hide findings below threshold

## Eagle Eye (Save Scanner)

- Uses **patterns only** (no AI validation) for speed
- `validateWithAI: false`, `minConfidence: 35`
- Full scan uses AI validation

## Implemented (Phase 3+)

### Taint Analysis
- **Location:** `src/core/taint-analyzer.ts`
- Tracks user input (req.body, req.query, req.params, etc.) to sinks (eval, exec, innerHTML)
- Bypasses AI validation (confidence 95) – dataflow-proven

### Feedback Loop
- **FP button** on each finding in Results panel
- Marks as false positive → stored in globalState → filtered on next load
- Suppressions persist across sessions

### Benchmark Runner
- **Command:** `CipherMate: Run Benchmark`
- Runs full scan, outputs metrics (by severity, type, scanner) to Output channel
- Use for measuring scanner performance over time

## Next Steps (Future)

- Framework-specific rules (Express, React, Django)
- OWASP Benchmark expected-results comparison (precision/recall)
