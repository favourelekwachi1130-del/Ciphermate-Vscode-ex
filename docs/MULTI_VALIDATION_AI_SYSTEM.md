# Multi-Validation AI System

CipherMate uses a **four-agent AI pipeline** to ensure fixes are accurate, safe, and aligned with your project before any code is written. This prevents wrong or broken code from being applied.

---

## Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  User: "fix vulnerabilities" / "apply fix"                                  │
└──────────────────────────────────┬────────────────────────────────────────┘
                                    │
┌──────────────────────────────────▼────────────────────────────────────────┐
│  AGENT 1: Fix Generator                                                      │
│  • Generates security fixes from vulnerability context                       │
│  • Produces executable code (no comment-only advice)                         │
│  • Suggests env vars when moving secrets out of code                         │
└──────────────────────────────────┬────────────────────────────────────────┘
                                    │ Fix proposal
┌──────────────────────────────────▼────────────────────────────────────────┐
│  AGENT 2: Pre-Implementation Validator                                      │
│  • Validates fix BEFORE it is written to disk                                │
│  • Blocks syntactically invalid or broken code                              │
│  • Checks: syntax, vulnerability addressed, runtime/build errors            │
│  • Rejects fixes that would cause import errors or break the build           │
└──────────────────────────────────┬────────────────────────────────────────┘
                                    │ Approved
┌──────────────────────────────────▼────────────────────────────────────────┐
│  AGENT 3: File/Data Handler                                                  │
│  • Plans file creation: .env, .env.example, .gitignore                      │
│  • Decides when to create vs append based on project state                   │
│  • Applies env vars and .gitignore updates after fix is written              │
└──────────────────────────────────┬────────────────────────────────────────┘
                                    │
┌──────────────────────────────────▼────────────────────────────────────────┐
│  AGENT 4: Final Validator (when user requests apply)                         │
│  • Comprehensive AI review right before writing to disk                     │
│  • Checks: project context, conventions, potential errors                    │
│  • Ensures fix won't cause type errors, runtime errors, or build failures    │
│  • Validates alignment with project patterns                                 │
└──────────────────────────────────┬────────────────────────────────────────┘
                                    │ Approved → Apply
┌──────────────────────────────────▼────────────────────────────────────────┐
│  Fix Applicator + Backup + Undo                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Agent Roles

| Agent | Role | When It Runs |
|-------|------|--------------|
| **1. Fix Generator** | Creates the actual code fix | When generating a fix proposal for a vulnerability |
| **2. Pre-Implementation Validator** | Blocks wrong/broken code | Before any fix is applied (always when pipeline enabled) |
| **3. File/Data Handler** | Plans and creates .env, .gitignore, etc. | After fix is successfully applied (when env vars needed) |
| **4. Final Validator** | Project-context and accuracy check | When user confirms "Apply" (right before writing to disk) |

---

## Configuration

In VS Code Settings (`ciphermate.fixes`):

| Setting | Default | Description |
|---------|---------|--------------|
| `enableMultiAIPipeline` | `true` | Enable the full four-agent pipeline |
| `multiAI.preImplementationValidator` | `true` | Agent 2: Block wrong code before applying |
| `multiAI.finalValidator` | `true` | Agent 4: Final AI check when user applies |
| `multiAI.fileDataHandler` | `true` | Agent 3: AI-planned file creation (.env, .gitignore) |

---

## Validation Layers (Summary)

1. **Rule-based** – TaskGuard, syntax checks (always run)
2. **Pre-Implementation AI** – Agent 2 validates fix quality before write
3. **Final AI** – Agent 4 validates project context and accuracy when user confirms

Wrong or unsafe code is blocked at multiple stages before ever reaching your files.
