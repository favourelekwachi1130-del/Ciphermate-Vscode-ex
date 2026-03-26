# Kode Agent Integration Architecture

CipherMate uses [Kode Agent](https://github.com/shareAI-lab/Kode-Agent) as the **core code-adjustment engine** for security fixes. Our custom task pipeline (Idea → Access → Review → Fix → Production) orchestrates Kode while keeping the heavy lifting in Kode's proven agent system.

## Overview

| Layer | Responsibility |
|-------|----------------|
| **CipherMate Pipeline** | Idea, Access, Review, Production stages; vulnerability context; user approval |
| **Kode Engine** | Code generation, editing, validation; multi-model; AGENTS.md; subagents |

## Task Pipeline (Our "Scripters")

```
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌────────────┐
│  IDEA   │ → │ ACCESS  │ → │ REVIEW  │ → │  FIX    │ → │ PRODUCTION │
└─────────┘   └─────────┘   └─────────┘   └─────────┘   └────────────┘
     │              │             │             │              │
     │              │             │             │              │
  Refine fix    Gather code   AI review    Kode applies   Validate &
   concept      context      minimal       edits via      push (opt)
                & vuln       errors        engine         to prod
```

### Stage Definitions

1. **Idea** – Capture and refine the fix concept from the vulnerability
   - Input: Vulnerability (type, title, file, code)
   - Output: Structured fix intent (what to change, why, constraints)

2. **Access** – Gather code context and project state
   - Input: File path, project root, related files
   - Output: Code snippets, imports, patterns, env vars

3. **Review** – AI review for minimal errors before applying
   - Input: Proposed fix, original code, context
   - Output: Approved/rejected, confidence, issues, suggestions

4. **Fix** – Apply the fix (delegated to Kode)
   - Input: Approved fix intent + context
   - Output: Edits (or diff) ready for application

5. **Production** – Validate and optionally push
   - Input: Applied fix, re-scan results
   - Output: Validation status, optional git push

## Integration Modes

### Mode A: CLI (Recommended for v1)

Use Kode's non-interactive mode:

```bash
kode -p "Generate a security fix for: [vuln context]" path/to/file
```

- **Pros**: No ACP protocol dependency; works with `npm install -g @shareai-lab/kode`
- **Cons**: Spawn per request; output parsing required

### Mode B: ACP (Agent Client Protocol)

Use `kode-acp` or `kode --acp` for stdio JSON-RPC:

- **Pros**: Persistent process; structured requests/responses
- **Cons**: Requires ACP client implementation; Kode docs reference `docs/acp.md` (may need verification)

### Mode C: Programmatic (Future)

If Kode exposes a Node API or we fork to add one:

- **Pros**: Direct function calls; no process spawn
- **Cons**: Not currently documented; may require manual repo import

## Implementation

### Kode Engine Adapter (`src/fix-system/kode-engine-adapter.ts`)

- `isAvailable()` – Check if Kode is installed (`which kode` or `npx kode --version`)
- `runPrompt(prompt, cwd?, files?)` – Spawn `kode -p "prompt"` and return stdout
- `generateFix(vulnerability, codeContext)` – Build prompt, call Kode, parse JSON/code block
- `validateFix(proposal, context)` – Run review prompt, parse approval

### Pipeline Wiring

- `FixService` checks `ciphermate.fixes.useKodeEngine` (new config)
- If true: use `KodeEngineAdapter` instead of `MultiAIFixPipeline` for fix generation
- Our pipeline stages (Idea, Access, Review, Production) remain in CipherMate
- Kode handles the actual code generation and editing logic

### Fallback

- If Kode is not installed or fails: fall back to `MultiAIFixPipeline` (current behavior)
- User can toggle `ciphermate.fixes.useKodeEngine` to switch engines

## Manual Import (If Needed)

If you need to:

- Fork Kode and add a programmatic API
- Use unreleased features
- Debug or extend Kode internals

**Steps:**

1. Clone: `git clone https://github.com/shareAI-lab/Kode-Agent.git`
2. Place in workspace or link: `npm link` from Kode repo, then `npm link @shareai-lab/kode` in CipherMate
3. Or add as git submodule: `git submodule add https://github.com/shareAI-lab/Kode-Agent.git lib/kode-agent`

**Keep me in the loop** if you perform a manual import so we can update the adapter to use local paths or linked packages.

## Configuration

```json
{
  "ciphermate.fixes.useKodeEngine": false,
  "ciphermate.fixes.kodePath": "kode",
  "ciphermate.fixes.kodeFallbackToMultiAI": true
}
```

- `useKodeEngine`: Use Kode when available
- `kodePath`: Path to `kode` binary (default: `kode` from PATH)
- `kodeFallbackToMultiAI`: Fall back to MultiAIFixPipeline if Kode fails

## References

- [Kode Agent GitHub](https://github.com/shareAI-lab/Kode-Agent)
- [Kode npm](https://www.npmjs.com/package/@shareai-lab/kode)
- [AGENTS.md standard](https://github.com/openai/agents-md) (Kode supports this)
