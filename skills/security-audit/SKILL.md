# Security Audit Skill — Socratic v2

## Decision Boundary
**Use when:** comprehensive repository-level security audit is requested.  
**Do not use when:** user needs single-finding deep dive only.

## Chat / file-aware behavior
- When the user names files or file contents are injected into context, **audit those artifacts first** with concrete findings and remediation — avoid boilerplate that only tells them to run a scan or open View Results.
- For broad “recode / secure the whole repo” asks, use any supplied **file tree or layout** to prioritize (entry points, configs, auth) instead of repeating fixed scripts.

## Input Contract
- Required: workspace path/repo scope.
- Optional: compliance target (ASVS/PCI/GDPR/SOC2), business context, crown jewels.

## Reasoning Checklist
1. Which assets and trust boundaries matter most?
2. What attack classes have meaningful exposure?
3. Which controls are present vs absent?
4. What findings are exploitable now?
5. What remediation sequence yields largest risk reduction?

## Execution Policy
1. Discovery: stack, dependencies, secrets, auth surface, data flows.
2. Code audit: injection/authz/crypto/input-output/logging/business-logic.
3. Architecture: STRIDE by component and boundary.
4. Compliance map: ASVS + requested framework controls.
5. Output prioritized roadmap with evidence and verification steps.

## Output Schema
```json
{
  "executiveSummary":"string",
  "riskSummary":{"critical":0,"high":0,"medium":0,"low":0},
  "findings":[
    {
      "title":"string",
      "severity":"critical|high|medium|low",
      "cwe":"string",
      "asvs":"string",
      "evidence":"string",
      "impact":"string",
      "remediation":"string",
      "verification":"string"
    }
  ],
  "complianceGaps":[{"framework":"string","control":"string","gap":"string"}],
  "roadmap":{"immediate":["string"],"shortTerm":["string"],"longTerm":["string"]}
}
```

## Failure Modes
- Tool-output dump without prioritization.
- No control mapping (CWE/ASVS/compliance).
- Recommendations without verification criteria.

## Verification Gates
- Every high/critical finding must include evidence + remediation + verification.
- Report must distinguish confirmed findings vs hypotheses.

## Finetuning Pack
- Positive: structured, evidence-backed audit report.
- Negative: noisy summary without exploitability prioritization.
# Security Audit Skill — Advanced

## Purpose
Comprehensive codebase security audit mapping to OWASP ASVS Level 3, CWE Top 25,
MITRE ATT&CK, and compliance frameworks (PCI-DSS, SOC2, ISO 27001, GDPR, HIPAA).
Produces a board-ready audit report with CVSS scores, remediation roadmap, and compliance gap analysis.

---

## Sub-Agent Architecture

```
Phase 1 (Parallel Discovery)
  ├── Stack Inventory Agent      — languages, frameworks, dependencies, infra
  ├── Secret Scanner Agent       — hardcoded secrets, entropy analysis, git history
  ├── Dependency CVE Agent       — all deps vs NVD/OSV/GHSA/CISA KEV
  ├── Auth Architecture Agent    — auth flows, session management, token handling
  └── Data Flow Agent            — PII/sensitive data identification and flows

Phase 2 (Parallel Code Audit — by category)
  ├── Injection Audit Agent      — SQLi, XSS, CMDi, XXE, SSTI, LDAPi, path traversal
  ├── Auth & Session Agent       — broken auth, IDOR, privilege escalation, JWT
  ├── Crypto & Secrets Agent     — algorithm strength, key management, TLS config
  ├── Input/Output Agent         — validation, encoding, CSP, CORS, upload handling
  ├── Error & Logging Agent      — info leakage, PII in logs, missing audit trail
  └── Business Logic Agent       — race conditions, mass assignment, logic bypasses

Phase 3 (Architecture Review — lead agent)
Phase 4 (Compliance Mapping — lead agent)
Phase 5 (Report Generation — lead agent)
```

---

## Phase 1: Discovery

### Dependency Security Scan
For every dependency file (`package.json`, `requirements.txt`, `Pipfile.lock`, `Cargo.toml`, `pom.xml`, `build.gradle`, `Gemfile.lock`, `go.sum`, `composer.json`):
1. Extract all dependencies with exact version numbers
2. Query OSV.dev API for known vulnerabilities per package@version
3. Cross-reference CISA KEV for actively exploited dependencies
4. Flag: transitive dependencies with critical CVEs
5. Identify: outdated packages (> 2 major versions behind)
6. Detect: dependency confusion attack vectors (internal package names published publicly)

### Secret Detection (beyond regex — entropy analysis)
High-entropy string detection:
- Shannon entropy > 4.0 on strings of length > 20 in non-test files
- Patterns: base64-encoded secrets, hex-encoded keys, JWT format strings
- Locations: hardcoded in source, `.env` committed to git, Docker env vars in Compose files, CI/CD configs

Check git history:
```bash
git log --all --full-history -- "*.env" "*.key" "*.pem"
git grep -l "password\|secret\|apikey\|token" $(git rev-list --all)
```

### Auth Architecture Map
Document completely:
- Every authentication endpoint and mechanism
- Token types and their validation logic
- Session storage and invalidation
- Password policy (hashing algorithm, complexity, rotation)
- MFA coverage and bypass paths
- API authentication vs web authentication consistency

---

## Phase 2: Code Audit Categories

### Injection (map to OWASP ASVS V5)
- **SQLi**: All DB query construction — ORM misuse, raw query concatenation, stored procedure injection
- **XSS**: All template rendering points — React `dangerouslySetInnerHTML`, Angular `[innerHTML]`, Vue `v-html`, server-side templates
- **CMDi**: All `exec`, `spawn`, `system`, `popen`, `subprocess` calls — check for shell injection
- **XXE**: XML parsers — are external entities disabled? (`DOCTYPE`, `ENTITY`, SYSTEM references)
- **SSTI**: Template engines — user input in template strings
- **LDAP injection**: DN construction, filter construction
- **Path traversal**: File reads/writes with user-controlled paths — `../` bypass, null byte, URL encoding

### Authentication & Session (OWASP ASVS V2, V3)
- Password hashing: bcrypt/Argon2/scrypt required — MD5/SHA1/SHA256 alone = fail
- Password reset flows: time-limited tokens, single-use, secure transmission
- Account lockout: brute force protection (but no lockout DoS)
- Session timeout: idle and absolute timeout
- Secure cookie flags: `HttpOnly`, `Secure`, `SameSite=Strict/Lax`
- CSRF protection: SameSite cookie + CSRF token or Origin/Referer validation
- JWT: none-algorithm disabled, short expiry, proper secret entropy

### Cryptography (OWASP ASVS V6)
Weak = instant fail:
- MD5 / SHA1 for integrity or password hashing
- DES / 3DES / RC4 / ECB mode
- RSA < 2048 bits
- Hardcoded IV/nonce
- `Math.random()` for security-sensitive randomness (use `crypto.randomBytes`)
- Weak PRNG seeding

### Access Control (OWASP ASVS V4)
- Every API endpoint: is authentication checked server-side?
- Every resource access: is authorization checked (not just authentication)?
- Principle of least privilege: are database credentials scoped minimally?
- API endpoint consistency: does removing authentication header bypass protections?
- Directory listing disabled?
- Admin functionality: separate auth gate beyond just session?

### Error Handling & Information Leakage
- Stack traces in production responses
- Internal paths, class names, version numbers in error messages
- Different error messages for valid vs invalid usernames (user enumeration)
- Verbose HTTP headers: `Server`, `X-Powered-By`, `X-Runtime`
- Debug endpoints left enabled: `/debug`, `/metrics`, `/actuator`, `/__admin__`

### Logging & Audit Trail (OWASP ASVS V7)
Required to be logged (with timestamps, user ID, IP):
- Authentication events (success, failure, lockout)
- Authorization failures
- Input validation failures
- Administrative actions
- High-value transactions

Must NOT be logged (PII/compliance):
- Passwords (including hashed)
- Full payment card numbers
- Session tokens
- Personal data (GDPR/HIPAA considerations)

---

## Phase 3: Architecture Review (STRIDE)

For each major component, apply STRIDE:
| Threat | Question |
|--------|---------|
| **Spoofing** | Can an attacker impersonate a user, service, or system component? |
| **Tampering** | Can an attacker modify data in transit or at rest? |
| **Repudiation** | Can a user deny performing an action? Is the audit log complete and tamper-evident? |
| **Info Disclosure** | What sensitive data could be exposed? To whom? Under what conditions? |
| **DoS** | What components are single points of failure? Are there rate limits? |
| **Elevation of Privilege** | Can a lower-privileged user gain higher privileges? |

Architectural red flags:
- Monolith with no internal trust boundaries
- Shared secrets between all microservices
- No network segmentation between public API and internal services
- Secrets in environment variables without a secrets manager
- Missing database connection pooling (DoS via connection exhaustion)
- Client-side authorization (trusting browser-provided role claims)
- Direct object storage access without signed URLs

---

## Phase 4: Compliance Mapping

### OWASP ASVS
- Level 1 (minimum for all apps): automated and manual review
- Level 2 (most apps): requires security controls appropriate for handling sensitive data
- Level 3 (critical apps): defence-in-depth, cryptography, advanced session management

Map every finding to an ASVS control number (V2.1.1, V3.4.2, etc.)

### PCI-DSS v4 (if payment card data in scope)
- Requirement 6.2: Bespoke software security (SAST, DAST, code review)
- Requirement 6.3: Security vulnerabilities managed (patch management)
- Requirement 6.4: Web application protection (WAF or code review)
- Map Critical/High findings to specific PCI requirements violated

### GDPR (if EU personal data)
- Article 25: Privacy by design and by default
- Article 32: Security of processing (appropriate technical measures)
- Article 33/34: Breach notification (logging/monitoring capability)
- Flag: unencrypted PII at rest, PII in logs, no data retention policy

### SOC 2 Type II (CC6, CC7, CC8)
- CC6.1: Logical access controls
- CC6.6: Transmission security
- CC7.1: Threat detection
- CC7.2: Monitoring (anomaly detection)

---

## Phase 5: Audit Report

```markdown
# Security Audit Report

| | |
|--|--|
| **Project** | [Name + version] |
| **Audit Date** | [ISO 8601] |
| **Auditor** | CipherMate Scripter Max |
| **Methodology** | OWASP ASVS 4.0, OWASP Testing Guide 4.2, NIST 800-115 |
| **Compliance Scope** | [PCI-DSS v4 / GDPR / SOC2 / HIPAA] |
| **ASVS Target Level** | Level [1/2/3] |

## Executive Summary
[Non-technical: 3 paragraphs — context, findings, recommended immediate actions]

## Risk Summary
| Severity | Count | CVSS Range | Actively Exploited |
|----------|-------|-----------|-------------------|
| Critical | N     | 9.0-10.0  | N                 |
| High     | N     | 7.0-8.9   | N                 |
| Medium   | N     | 4.0-6.9   | N                 |
| Low      | N     | 0.1-3.9   | —                 |

## Key Findings

### [Finding Title] — CRITICAL

| | |
|--|--|
| **CVSS v3.1** | 9.8 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H) |
| **CWE** | CWE-89: Improper Neutralization of Special Elements in SQL |
| **ASVS** | V5.3.4 |
| **PCI-DSS** | Requirement 6.2.4 |
| **CISA KEV** | Not listed |
| **File** | src/db/queries.ts:47 |

**Description:** [Precise technical description]

**Evidence:**
\`\`\`typescript
[Vulnerable code with line numbers]
\`\`\`

**Attack Scenario:** [Specific attack with payload]
**Impact:** [Business and technical impact]

**Remediation:**
\`\`\`typescript
[Fixed code]
\`\`\`

**Verification:** [How to confirm fix is effective]

---

## Dependency Vulnerabilities
| Package | Version | CVE | CVSS | Fix Version | KEV |
|---------|---------|-----|------|-------------|-----|
| lodash | 4.17.20 | CVE-2021-23337 | 7.2 | 4.17.21 | No |

## Architecture Assessment
[STRIDE analysis, trust boundary violations, design recommendations]

## Compliance Gap Analysis
### OWASP ASVS Level [N] — [X]% Compliant
[Pass/Fail per control with evidence]

### [PCI-DSS / GDPR / SOC2] Status
[Gap analysis with required remediation]

## Remediation Roadmap
### Immediate (0-7 days)
- [ ] [Critical finding: CVE-xxx patch]

### Short-term (7-30 days)
- [ ] [High findings]

### Long-term (30-90 days)
- [ ] [Medium/architectural improvements]

## Appendix A: Full Dependency CVE List
## Appendix B: ASVS Control Checklist
## Appendix C: Secret Scan Results
```

---

## Rules
- CVSS v3.1 vector string required for every Critical and High
- Every finding mapped to CWE ID + ASVS control
- Dependency CVEs: list ALL, not just Critical/High
- Compliance gaps: map specifically to control numbers, not just "GDPR applies"
- Executive summary: zero jargon — a non-technical stakeholder should understand the risk
