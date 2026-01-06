# CipherMate Core → VS Code Extension Feature Porting Roadmap

This document outlines features from **CipherMate Core** (CLI) that can be ported to the **VS Code Extension** version.

---

## 🎯 High Priority Features (Core Security Tools)

### 1. **Dependency Vulnerability Scanning** ⭐⭐⭐
**Status**: Partially exists in Core, missing in Extension

**Core Implementation**:
- `src/agent/tools/DependencyScanner.ts`
- Scans `package.json`, `requirements.txt`, `Pipfile`, `Cargo.toml`
- Checks against vulnerability databases
- Supports npm, pip, cargo, go modules

**Extension Integration**:
- Add command: `CipherMate: Scan Dependencies`
- Show results in Results Panel
- Highlight vulnerable packages in `package.json`
- Auto-fix suggestions (update versions)
- Workspace-wide dependency audit

**Implementation Effort**: Medium (2-3 days)

---

### 2. **Web Application Security Scanning** ⭐⭐⭐
**Status**: Fully implemented in Core, missing in Extension

**Core Implementation**:
- `src/agent/tools/web/WebScanner.ts`
- OWASP Top 10 detection
- Security headers analysis (CSP, HSTS, X-Frame-Options)
- Cookie security checks
- CSRF/XSS detection
- Authorization framework

**Extension Integration**:
- Add command: `CipherMate: Scan Web Application`
- Input URL in chat or command palette
- Show findings in Results Panel
- Link to affected files if URL matches workspace
- Export report as Markdown

**Implementation Effort**: Medium-High (3-5 days)

---

### 3. **Smart Contract Security Scanner** ⭐⭐⭐
**Status**: Fully implemented in Core, missing in Extension

**Core Implementation**:
- `src/agent/tools/web3/SmartContractScanner.ts`
- 11 vulnerability detectors:
  - Reentrancy (SWC-107)
  - Access Control (SWC-115)
  - Integer Overflow (SWC-101)
  - Flash Loan Attacks
  - Oracle Manipulation
  - Precision Loss
  - Weak Randomness
  - Timestamp Dependence
  - Storage Collision
  - Arbitrary Calls
  - State Modification

**Extension Integration**:
- Auto-detect `.sol` files in workspace
- Add command: `CipherMate: Scan Smart Contracts`
- Show vulnerabilities inline (like ESLint)
- DeFiHackLabs exploit references
- SWC ID mapping in diagnostics

**Implementation Effort**: High (5-7 days)

---

### 4. **SSL/TLS Certificate Analysis** ⭐⭐
**Status**: Fully implemented in Core, missing in Extension

**Core Implementation**:
- `src/agent/tools/SSLAnalyzer.ts`
- Certificate validation
- Cipher suite analysis
- Grade scoring (A+ to F)
- Expiration warnings

**Extension Integration**:
- Add command: `CipherMate: Analyze SSL Certificate`
- Input hostname or detect from workspace URLs
- Show certificate details in Results Panel
- Warning badges for expired/weak certificates

**Implementation Effort**: Low-Medium (1-2 days)

---

### 5. **CVE Database Lookup** ⭐⭐
**Status**: Fully implemented in Core, missing in Extension

**Core Implementation**:
- `src/cli/commands/cve.ts`
- CVE details lookup
- Vulnerability enrichment
- CVSS scoring
- Remediation guidance

**Extension Integration**:
- Add command: `CipherMate: Lookup CVE`
- Quick lookup from Results Panel
- Show CVE details in hover/panel
- Link vulnerabilities to CVEs

**Implementation Effort**: Low (1 day)

---

## 🔍 Medium Priority Features (Advanced Analysis)

### 6. **OSINT Reconnaissance Tools** ⭐⭐
**Status**: Fully implemented in Core, missing in Extension

**Core Tools**:
- DNS reconnaissance
- Subdomain enumeration
- WHOIS lookup
- IP geolocation
- Email harvesting
- Username enumeration
- Technology stack detection
- Wayback Machine history
- Data breach checking

**Extension Integration**:
- Add command: `CipherMate: OSINT Reconnaissance`
- Input domain/username/IP
- Show results in dedicated OSINT panel
- Export findings
- Link to workspace domains

**Implementation Effort**: Medium (3-4 days)

---

### 7. **Log Analysis & Threat Hunting** ⭐⭐
**Status**: Fully implemented in Core, missing in Extension

**Core Implementation**:
- `src/agent/tools/log/LogAnalyzer.ts`
- Pattern detection
- Anomaly identification
- Security event correlation
- Threat hunting queries

**Extension Integration**:
- Add command: `CipherMate: Analyze Log File`
- Right-click on log files → "Analyze with CipherMate"
- Show anomalies in Results Panel
- Timeline visualization
- Export threat intelligence

**Implementation Effort**: Medium (3-4 days)

---

### 8. **System Hardening Checks** ⭐
**Status**: Fully implemented in Core, missing in Extension

**Core Implementation**:
- `src/agent/tools/hardening.ts`
- Platform-specific checks (macOS, Linux, Windows)
- Security baseline validation
- Compliance checking

**Extension Integration**:
- Add command: `CipherMate: System Hardening Check`
- Show recommendations in Results Panel
- Platform detection
- Actionable remediation steps

**Implementation Effort**: Medium (2-3 days)

---

## 🚀 Advanced Features (Nice to Have)

### 9. **PCAP Network Traffic Analysis** ⭐
**Status**: Fully implemented in Core, complex for Extension

**Core Implementation**:
- `src/agent/tools/PcapAnalyzer.ts`
- Protocol dissection
- IOC extraction
- MITRE ATT&CK mapping
- Evidence preservation

**Extension Integration**:
- Add command: `CipherMate: Analyze PCAP File`
- Right-click `.pcap` files → "Analyze"
- Show network flows in Results Panel
- IOC extraction panel
- STIX 2.1 export

**Implementation Effort**: High (5-7 days)
**Note**: Less relevant for VS Code context, but useful for security teams

---

### 10. **Mobile App Scanning (APK/IPA)** ⭐
**Status**: Fully implemented in Core, niche use case

**Core Implementation**:
- `src/cli/commands/mobilescan.ts`
- APK/IPA analysis
- Permission analysis
- Vulnerability detection

**Extension Integration**:
- Add command: `CipherMate: Scan Mobile App`
- Drag-drop APK/IPA files
- Show findings in Results Panel

**Implementation Effort**: Medium (2-3 days)
**Note**: Niche use case, lower priority

---

### 11. **Screenshot Tool** ⭐
**Status**: Fully implemented in Core, simple utility

**Core Implementation**:
- `src/agent/tools/ScreenshotTool.ts`
- Website screenshots
- Full-page capture

**Extension Integration**:
- Add command: `CipherMate: Capture Screenshot`
- Input URL
- Save to workspace

**Implementation Effort**: Low (1 day)

---

## 🎨 UI/UX Enhancements

### 12. **Multiple Agent Modes** ⭐⭐⭐
**Status**: Fully implemented in Core, missing in Extension

**Core Modes**:
- `base` - General security assistant
- `redteam` - Offensive security perspective
- `blueteam` - Defensive operations
- `desktopsecurity` - Personal computer security
- `webpentest` - Web application testing
- `osint` - Open source intelligence
- `smartcontract` - Blockchain security

**Extension Integration**:
- Add mode selector in chat interface
- Mode-specific system prompts
- Context-aware suggestions
- Mode badges in UI

**Implementation Effort**: Low-Medium (2-3 days)

---

### 13. **Pre-configured Workflows** ⭐⭐
**Status**: Fully implemented in Core, missing in Extension

**Core Workflows**:
- Quick Security Health Check
- Website Security Audit
- Domain Intelligence Gathering
- Incident Response Triage
- Network Traffic Threat Hunting
- Full OSINT Investigation
- System Hardening Guide
- Red Team Reconnaissance
- CTF Web Challenge Solver
- Learn OSINT Basics

**Extension Integration**:
- Add "Workflows" section in welcome screen
- Interactive workflow selector
- Step-by-step guided execution
- Progress tracking

**Implementation Effort**: Medium (3-4 days)

---

### 14. **MCP Tool Integration** ⭐⭐
**Status**: Fully implemented in Core, missing in Extension

**Core MCP Tools**:
- Nuclei (5000+ vulnerability templates)
- SSLScan (SSL/TLS analysis)
- SQLmap (SQL injection testing)
- Nmap (Network scanning)
- Httpx (HTTP probing)
- Katana (Web crawling)
- Amass (Subdomain enumeration)

**Extension Integration**:
- Auto-install via `npx` when needed
- Tool status indicator
- Integration with web scanning
- Results aggregation

**Implementation Effort**: Medium-High (4-5 days)

---

## 🔐 Professional Features

### 15. **Evidence Preservation & Chain of Custody** ⭐
**Status**: Fully implemented in Core, useful for enterprise

**Core Implementation**:
- Triple hash (MD5, SHA1, SHA256)
- Chain of custody tracking
- Case management
- Forensic soundness

**Extension Integration**:
- Add "Evidence" panel
- Track scan evidence
- Export evidence packages
- Integrity verification

**Implementation Effort**: Medium (2-3 days)
**Note**: Enterprise-focused feature

---

### 16. **IOC Extraction & MITRE ATT&CK Mapping** ⭐
**Status**: Fully implemented in Core, advanced feature

**Core Implementation**:
- IOC extraction (IPs, domains, URLs, hashes, CVEs)
- MITRE ATT&CK technique mapping
- STIX 2.1 export
- Threat intelligence format

**Extension Integration**:
- IOC extraction from scan results
- MITRE mapping in Results Panel
- STIX export option
- Threat intelligence panel

**Implementation Effort**: Medium (3-4 days)

---

### 17. **Scheduled Scanning (Daemon)** ⭐
**Status**: Fully implemented in Core, useful for CI/CD

**Core Implementation**:
- `src/daemon/Daemon.ts`
- Cron-based scheduling
- Background job execution
- Report generation

**Extension Integration**:
- Add "Scheduled Scans" settings
- Configure scan schedules
- Background execution
- Notification on findings

**Implementation Effort**: Medium-High (4-5 days)

---

## 📊 Implementation Priority Matrix

| Feature | Priority | Effort | Impact | Status |
|---------|----------|--------|--------|--------|
| Dependency Scanning | ⭐⭐⭐ | Medium | High | Not Started |
| Web App Scanning | ⭐⭐⭐ | Medium-High | High | Not Started |
| Smart Contract Scanner | ⭐⭐⭐ | High | High | Not Started |
| SSL/TLS Analysis | ⭐⭐ | Low-Medium | Medium | Not Started |
| CVE Lookup | ⭐⭐ | Low | Medium | Not Started |
| OSINT Tools | ⭐⭐ | Medium | Medium | Not Started |
| Log Analysis | ⭐⭐ | Medium | Medium | Not Started |
| System Hardening | ⭐ | Medium | Low | Not Started |
| PCAP Analysis | ⭐ | High | Low | Not Started |
| Mobile Scanning | ⭐ | Medium | Low | Not Started |
| Agent Modes | ⭐⭐⭐ | Low-Medium | High | Not Started |
| Workflows | ⭐⭐ | Medium | Medium | Not Started |
| MCP Integration | ⭐⭐ | Medium-High | Medium | Not Started |
| Evidence Preservation | ⭐ | Medium | Low | Not Started |
| IOC/MITRE | ⭐ | Medium | Low | Not Started |
| Scheduled Scans | ⭐ | Medium-High | Medium | Not Started |

---

## 🛠️ Implementation Strategy

### Phase 1: Core Security Tools (Weeks 1-2)
1. Dependency Vulnerability Scanning
2. SSL/TLS Certificate Analysis
3. CVE Database Lookup
4. Agent Modes

### Phase 2: Advanced Scanning (Weeks 3-4)
5. Web Application Security Scanning
6. Smart Contract Scanner
7. Log Analysis

### Phase 3: Professional Features (Weeks 5-6)
8. OSINT Tools
9. Workflows
10. MCP Integration

### Phase 4: Enterprise Features (Weeks 7-8)
11. Evidence Preservation
12. IOC/MITRE Mapping
13. Scheduled Scanning

---

## 🔄 Code Reuse Strategy

### Direct Porting
- **Tool Logic**: Most Core tools can be ported directly
- **AI Prompts**: System prompts can be reused
- **Vulnerability Detection**: Pattern matching logic is reusable

### Adaptation Needed
- **CLI Commands → VS Code Commands**: Convert CLI commands to VS Code commands
- **Terminal Output → Webview UI**: Convert terminal output to webview panels
- **File System → VS Code API**: Use `vscode.workspace` instead of `fs`

### New Components Needed
- **Results Panel Integration**: Display findings in existing Results Panel
- **Inline Diagnostics**: Show vulnerabilities like ESLint errors
- **Quick Actions**: Add fix/explain actions in UI

---

## 📝 Next Steps

1. **Start with Dependency Scanning** (easiest win)
2. **Add Agent Modes** (enhances existing chat)
3. **Port Web Scanner** (high value feature)
4. **Integrate Smart Contract Scanner** (unique capability)

---

## 🎯 Quick Wins (Can implement in 1-2 days each)

1. ✅ CVE Lookup
2. ✅ SSL/TLS Analysis
3. ✅ Agent Modes
4. ✅ Screenshot Tool
5. ✅ System Hardening Checks

---

**Last Updated**: 2025-12-27
**Status**: Planning Phase

