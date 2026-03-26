# Skill Composition Layer (Option C)

## Overview

The skill composition layer composes multiple skills per request for higher-quality, context-aware analysis. Instead of loading a single skill per task, it:

1. **Primary skill** — Always includes the task's core skill (e.g. `security-audit`, `vulnerability-analysis`)
2. **Context keywords** — Message contains "api", "auth", "pentest" → adds relevant antigravity skills
3. **Intent** — Recognized intent (e.g. `SCAN_DAST`, `FIX_VULNERABILITIES`) → layers on extra skills

## Architecture

```
User message + task + intent
        │
        ▼
┌─────────────────────────────────────┐
│  composeSkills(task, message, opts)  │
│  - resolveSkillIds()                 │
│  - mergeSkillContents()             │
└─────────────────────────────────────┘
        │
        ▼
Composed content (primary + secondary skills)
        │
        ├──► Single-call path (system prompt)
        └──► Orchestrator path (skillContext in sharedContext)
```

## Files

| File | Purpose |
|------|---------|
| `src/core/skill-composition.ts` | Registry, mapping, composition logic |
| `src/engine/scripter-max-inprocess.ts` | Wires composition into single-call and orchestrator |
| `src/engine/scripter-subagent-orchestrator.ts` | Accepts `skillContext` in shared context |
| `skills/antigravity/` | Optional antigravity skills (user copies in) |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `ciphermate.skills.useComposition` | true | Enable composition layer |
| `ciphermate.skills.useAntigravity` | true | Include antigravity skills when present |
| `ciphermate.skills.maxComposedChars` | 16000 | Max chars for single-call; orchestrator uses 12k |

## Intent → Skills Mapping

| Intent | Extra skills |
|--------|--------------|
| SCAN_DAST | api-security-testing |
| SCAN_PENTEST | attack-tree-construction, ethical-hacking-methodology |
| BUILD_THREAT_MODEL | attack-tree-construction |
| AUDIT_SLICE | api-security-best-practices, audit-context-building |
| FIX_VULNERABILITIES | systematic-debugging |
| ANALYZE | audit-context-building |

## Context Keywords → Skills

| Keywords in message | Extra skills |
|--------------------|--------------|
| api, rest, graphql, endpoint | api-security-best-practices |
| attack tree, threat model | attack-tree-construction |
| auth, jwt, oauth, session | auth-implementation-patterns |
| pentest, exploit, red team | ethical-hacking-methodology |
| fuzz, bug bounty | api-fuzzing-bug-bounty |
| debug, bug, fix | systematic-debugging |

## Adding Antigravity Skills

1. Clone [antigravity-awesome-skills](https://github.com/sickn33/antigravity-awesome-skills)
2. Copy desired skills to `skills/antigravity/<skill-id>/`
3. Each skill must have `SKILL.md` (YAML frontmatter is stripped automatically)

## Quality Notes

- **Primary first** — Core task skill gets full budget; secondaries fill remainder
- **No truncation of primary** — Primary skill is never truncated below its max
- **Deduplication** — Same skill ID never included twice
- **Fallback** — If composition returns empty, falls back to legacy single-skill load
