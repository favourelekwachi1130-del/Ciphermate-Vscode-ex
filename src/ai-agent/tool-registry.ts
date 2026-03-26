/**
 * Tool Registry — Training-Oriented Metadata for CipherMate Tools
 *
 * Provides whenToUse, examples, prerequisites, and toolChain so:
 * 1. Fine-tuned models learn when to call each tool
 * 2. System prompts can inject tool-selection guidance
 * 3. Training data generators have accurate intent→tool mappings
 *
 * Every complex function in the ecosystem should have an entry here
 * so the model learns to invoke it when necessary.
 */

export interface ToolRegistryEntry {
  /** Tool name (matches agentic-core tools) */
  name: string;
  /** API description (sent to model) */
  description: string;
  /** When to use — explicit conditions the model should learn */
  whenToUse: string[];
  /** Example user messages that should trigger this tool */
  userExamples: string[];
  /** Prerequisites — must be true before calling */
  prerequisites: string[];
  /** Tools typically called after this one (tool chain) */
  typicalNextTools: string[];
  /** Tools that should be called before this (e.g. scan before fix) */
  typicalPrevTools: string[];
  /** Intent from intent-recognizer that maps here */
  intent?: string;
}

export const TOOL_REGISTRY: Record<string, ToolRegistryEntry> = {
  scan_repository: {
    name: 'scan_repository',
    description: 'Scan the entire repository for security vulnerabilities. Uses Dependency Scanner, Secrets Scanner, Smart Contract Scanner, Code Pattern Scanner, and AI analysis. Returns list of vulnerabilities with severity.',
    whenToUse: [
      'User asks to scan, audit, check, or analyze the repo/codebase/project',
      'User wants to find vulnerabilities, security issues, or problems',
      'User says "scan my code", "check my repo", "run a security audit"',
      'User asks "what vulnerabilities do I have" or "is my code secure"',
      'Before fixing: need to know what exists; call scan first',
    ],
    userExamples: [
      'scan my repository',
      'run a security scan',
      'check my codebase for vulnerabilities',
      'audit my project',
      'find security issues in my code',
      'what vulnerabilities are in my repo?',
    ],
    prerequisites: ['Workspace folder open'],
    typicalNextTools: ['show_results', 'generate_fix', 'explain_vulnerability'],
    typicalPrevTools: [],
    intent: 'SCAN_REPOSITORY',
  },

  scan_file: {
    name: 'scan_file',
    description: 'Scan a specific file for security vulnerabilities. Deep AI analysis of one file.',
    whenToUse: [
      'User points to a specific file (e.g. "scan src/auth.js")',
      'User says "check this file" with file context',
      'Narrow scope: single file instead of full repo',
    ],
    userExamples: [
      'scan src/auth.js',
      'check this file for vulnerabilities',
      'analyze api/routes/user.ts',
    ],
    prerequisites: ['File path known or in context'],
    typicalNextTools: ['generate_fix', 'explain_vulnerability'],
    typicalPrevTools: ['read_file'],
    intent: 'SCAN_REPOSITORY',
  },

  scan_dast: {
    name: 'scan_dast',
    description: 'Run DAST on a running web app or API. Simulates attacks (SQLi, XSS, SSRF), checks headers. Requires URL.',
    whenToUse: [
      'User provides a URL (localhost, https://...) and wants it tested',
      'User says "test my API", "scan my web app", "run DAST"',
      'Dynamic testing of running application',
    ],
    userExamples: [
      'scan https://api.example.com',
      'test my API at localhost:3000',
      'run DAST on my web app',
    ],
    prerequisites: ['Target URL provided', 'App should be running'],
    typicalNextTools: ['explain_vulnerability', 'generate_fix'],
    typicalPrevTools: [],
    intent: 'SCAN_DAST',
  },

  scan_pentest: {
    name: 'scan_pentest',
    description: 'Full penetration test with 200+ attack agents. Maximum coverage. Use for pentest, penetration test.',
    whenToUse: [
      'User explicitly asks for pentest or penetration test',
      'User wants maximum attack coverage',
    ],
    userExamples: [
      'run a pentest',
      'penetration test my API',
      'full pentest on localhost:8080',
    ],
    prerequisites: ['Target URL provided'],
    typicalNextTools: ['explain_vulnerability'],
    typicalPrevTools: [],
    intent: 'SCAN_PENTEST',
  },

  read_file: {
    name: 'read_file',
    description: 'Read file contents. Use before scanning, fixing, or analyzing a specific file.',
    whenToUse: [
      'Need to examine code before scan/fix',
      'User references a file; need its content',
      'Before generate_fix: read the file to get context',
    ],
    userExamples: [
      '(implicit) when fixing a vuln in auth.js',
      'read src/utils/db.js',
    ],
    prerequisites: ['File path known'],
    typicalNextTools: ['scan_file', 'analyze_code', 'generate_fix'],
    typicalPrevTools: ['list_files'],
    intent: undefined,
  },

  list_files: {
    name: 'list_files',
    description: 'List files in a directory. Use to discover files before scanning.',
    whenToUse: [
      'Need to find files matching a pattern',
      'Discover structure before scan',
    ],
    userExamples: [
      '(implicit) list all .js files in src',
    ],
    prerequisites: ['Directory path known'],
    typicalNextTools: ['read_file', 'scan_repository'],
    typicalPrevTools: [],
    intent: undefined,
  },

  analyze_code: {
    name: 'analyze_code',
    description: 'Deep AI analysis of code snippet for security patterns, vulnerabilities, best practices.',
    whenToUse: [
      'User pastes code and asks "is this secure" or "analyze this"',
      'Inline code analysis without full file scan',
      'Quick review of a snippet',
    ],
    userExamples: [
      'is this code secure? [code]',
      'analyze this for vulnerabilities [code]',
    ],
    prerequisites: ['Code provided in message'],
    typicalNextTools: ['generate_fix', 'explain_vulnerability'],
    typicalPrevTools: [],
    intent: 'ANALYZE',
  },

  generate_fix: {
    name: 'generate_fix',
    description: 'Generate secure fix for a vulnerability. Returns patched code with explanation.',
    whenToUse: [
      'User asks to fix, patch, or remediate a vulnerability',
      'After scan: user says "fix these" or "fix the critical ones"',
      'Vulnerability object available (from scan or user)',
    ],
    userExamples: [
      'fix this SQL injection',
      'fix all critical vulnerabilities',
      'patch the XSS in auth.js',
    ],
    prerequisites: ['Vulnerability details (type, code, location)'],
    typicalNextTools: ['apply_fix'],
    typicalPrevTools: ['scan_repository', 'scan_file', 'analyze_code'],
    intent: 'FIX_VULNERABILITIES',
  },

  apply_fix: {
    name: 'apply_fix',
    description: 'Apply a fix to a file safely. Requires user confirmation. Uses backup and undo.',
    whenToUse: [
      'After generate_fix: user confirms they want to apply',
      'User says "apply the fix", "patch it", "make the change"',
    ],
    userExamples: [
      'apply the fix',
      'yes, apply it',
      'patch the file',
    ],
    prerequisites: ['Fix generated', 'User confirmed'],
    typicalNextTools: [],
    typicalPrevTools: ['generate_fix'],
    intent: 'FIX_VULNERABILITIES',
  },

  explain_vulnerability: {
    name: 'explain_vulnerability',
    description: 'Get detailed explanation: impact, exploitation, prevention. Use when user asks "what is", "why", "explain".',
    whenToUse: [
      'User asks to explain, describe, or clarify a vulnerability',
      'User says "what is this", "why is it dangerous", "how does it work"',
      'After scan: user clicks on a finding and wants details',
    ],
    userExamples: [
      'explain this vulnerability',
      'what is SQL injection?',
      'why is this dangerous?',
    ],
    prerequisites: ['Vulnerability details available'],
    typicalNextTools: ['generate_fix'],
    typicalPrevTools: ['scan_repository', 'scan_file'],
    intent: 'EXPLAIN',
  },

  create_file: {
    name: 'create_file',
    description: 'Create a new file with content. Works without repo open.',
    whenToUse: [
      'User asks to create a file',
      'Generate project: create multiple files',
    ],
    userExamples: [
      'create a .env.example file',
      'create src/config/secure.ts',
    ],
    prerequisites: ['FilePath and content known'],
    typicalNextTools: [],
    typicalPrevTools: ['generate_project'],
    intent: undefined,
  },

  edit_file: {
    name: 'edit_file',
    description: 'Edit existing file: replace or append content.',
    whenToUse: [
      'Apply fix manually (alternative to apply_fix)',
      'User asks to modify a file',
    ],
    userExamples: [
      'add this import to auth.js',
      'replace the vulnerable function',
    ],
    prerequisites: ['File exists', 'Content to write'],
    typicalNextTools: [],
    typicalPrevTools: ['read_file'],
    intent: undefined,
  },

  generate_project: {
    name: 'generate_project',
    description: 'Generate complete project structure (web, api, etc.) with secure templates.',
    whenToUse: [
      'User asks to create a new project',
      'User wants a scaffold (e.g. "create a secure Express API")',
    ],
    userExamples: [
      'create a new secure Node.js API',
      'generate a Python web project',
    ],
    prerequisites: ['Project name, type, language specified'],
    typicalNextTools: ['create_file'],
    typicalPrevTools: [],
    intent: undefined,
  },

  build_threat_model: {
    name: 'build_threat_model',
    description: 'Build threat model from project CVE history (OSV, GHSA). Queries prior CVEs, feeds to LLM for threat model.',
    whenToUse: [
      'User asks to "build threat model", "analyze prior CVEs", "what vulnerabilities has this project had"',
    ],
    userExamples: ['build a threat model from our CVE history', 'analyze prior CVEs for this project'],
    prerequisites: ['Workspace open', 'Package/repo identifiable'],
    typicalNextTools: ['audit_slice', 'scan_repository'],
    typicalPrevTools: [],
    intent: 'BUILD_THREAT_MODEL',
  },

  audit_slice: {
    name: 'audit_slice',
    description: 'Audit a thin slice (auth, JWT, cookie, SQL, etc.) with framework-specific patterns. Devansh methodology.',
    whenToUse: [
      'User asks to "audit auth layer", "check JWT handling", "audit session management"',
      'Focused audit instead of full repo scan',
    ],
    userExamples: ['audit my auth layer', 'check JWT handling for vulnerabilities'],
    prerequisites: ['Workspace open', 'Slice type specified or inferred'],
    typicalNextTools: ['generate_fix', 'explain_vulnerability'],
    typicalPrevTools: ['build_threat_model'],
    intent: 'AUDIT_SLICE',
  },

  verify_exploit: {
    name: 'verify_exploit',
    description: 'Verify a vulnerability PoC: run curl against localhost or add/run a failing test. Devansh methodology.',
    whenToUse: [
      'User asks to "verify this exploit", "run the PoC", "prove this vulnerability"',
      'After AI reports a vuln with curl or test PoC',
    ],
    userExamples: ['verify this exploit', 'run the PoC', 'prove this vulnerability works'],
    prerequisites: ['Finding with PoC (curl or test code)', 'Workspace open'],
    typicalNextTools: ['generate_fix', 'explain_vulnerability'],
    typicalPrevTools: ['scan_repository', 'scan_file', 'analyze_code'],
    intent: 'VERIFY_EXPLOIT',
  },
};

/** Tools that require a URL (DAST, pentest) */
export const URL_REQUIRED_TOOLS = new Set(['scan_dast', 'scan_pentest']);

/** Tools that require scan results (fix, explain) */
export const SCAN_RESULT_TOOLS = new Set(['generate_fix', 'apply_fix', 'explain_vulnerability']);

/** Get tool entry by name */
export function getToolEntry(name: string): ToolRegistryEntry | undefined {
  return TOOL_REGISTRY[name];
}

/**
 * Proposed tools (not yet in agentic-core). Add to registry when implemented.
 * Training data can reference these so the model is ready when tools ship.
 */
export const PROPOSED_TOOLS: Partial<Record<string, ToolRegistryEntry>> = {
  lookup_cve: {
    name: 'lookup_cve',
    description: 'Look up CVE details from NVD/MITRE. Returns CVSS, description, references, patch status.',
    whenToUse: [
      'User asks "what is CVE-2024-1234" or "lookup CVE"',
      'User references a CVE ID and wants details',
    ],
    userExamples: ['what is CVE-2024-1234?', 'lookup CVE-2021-44228'],
    prerequisites: ['CVE ID provided'],
    typicalNextTools: ['explain_vulnerability'],
    typicalPrevTools: [],
    intent: 'EXPLAIN',
  },
  audit_slice: {
    name: 'audit_slice',
    description: 'Audit a thin slice (auth, session, parsing, etc.) with threat model. Devansh methodology.',
    whenToUse: [
      'User asks to "audit auth layer", "check JWT handling", "audit session management"',
      'Focused audit instead of full repo scan',
    ],
    userExamples: ['audit my auth layer', 'check JWT handling for vulnerabilities'],
    prerequisites: ['Workspace open', 'Slice type specified'],
    typicalNextTools: ['generate_fix', 'explain_vulnerability'],
    typicalPrevTools: [],
    intent: 'AUDIT_SLICE',
  },
  build_threat_model: {
    name: 'build_threat_model',
    description: 'Build threat model from project CVE history (OSV, GHSA). Feeds into audit.',
    whenToUse: [
      'User asks to "build threat model", "analyze prior CVEs", "what vulnerabilities has this project had"',
    ],
    userExamples: ['build a threat model from our CVE history'],
    prerequisites: ['Workspace open', 'Package/repo identifiable'],
    typicalNextTools: ['audit_slice', 'scan_repository'],
    typicalPrevTools: [],
    intent: 'BUILD_THREAT_MODEL',
  },
};

/** Get all user examples for training data generation */
export function getAllUserExamples(): Array<{ tool: string; example: string }> {
  const out: Array<{ tool: string; example: string }> = [];
  for (const [tool, entry] of Object.entries(TOOL_REGISTRY)) {
    for (const ex of entry.userExamples) {
      out.push({ tool, example: ex });
    }
  }
  return out;
}
