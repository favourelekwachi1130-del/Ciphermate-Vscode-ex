# Antigravity Skills (Optional)

Place curated skills from [antigravity-awesome-skills](https://github.com/sickn33/antigravity-awesome-skills) here to enrich CipherMate's analysis.

## Setup

1. Clone or download antigravity skills:
   ```bash
   git clone --depth 1 https://github.com/sickn33/antigravity-awesome-skills.git /tmp/antigravity-skills
   ```

2. Copy the skills you want into this folder:
   ```bash
   cp -r /tmp/antigravity-skills/skills/api-security-best-practices skills/antigravity/
   cp -r /tmp/antigravity-skills/skills/attack-tree-construction skills/antigravity/
   cp -r /tmp/antigravity-skills/skills/auth-implementation-patterns skills/antigravity/
   cp -r /tmp/antigravity-skills/skills/ethical-hacking-methodology skills/antigravity/
   cp -r /tmp/antigravity-skills/skills/systematic-debugging skills/antigravity/
   # ... add more as needed
   ```

3. Enable in CipherMate settings:
   - `ciphermate.skills.useComposition`: true (default)
   - `ciphermate.skills.useAntigravity`: true (default)

## Supported Skills (curated for security/code)

| Skill ID | Use case |
|----------|----------|
| api-security-best-practices | API design, auth, rate limiting |
| api-security-testing | API pentesting |
| api-fuzzing-bug-bounty | Fuzzing, bug bounty |
| attack-tree-construction | Threat modeling |
| audit-context-building | Audit context |
| audit-skills | General audit |
| auth-implementation-patterns | Auth flows, sessions |
| ethical-hacking-methodology | Pentest methodology |
| systematic-debugging | Structured debugging |

## How It Works

When you ask CipherMate to analyze, audit, or fix:

1. **Primary skill** — Always loaded (e.g. security-audit, vulnerability-analysis)
2. **Context keywords** — Message contains "api", "auth", "pentest" → extra skills added
3. **Intent** — Recognized intent (e.g. SCAN_DAST) → extra skills layered on

Composed content is injected into Scripter Max prompts for higher-quality, domain-aware analysis.
