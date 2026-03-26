/**
 * Remediation Playbooks — guided multi-step fixes per vuln type
 *
 * For recurring vuln types: "Step 1: add helper in X; Step 2: replace in Y, Z."
 * Enables repeatable, consistent fixes across the codebase. Phase 4.
 */

export interface PlaybookStep {
  id: string;
  title: string;
  description: string;
  /** Example: "Create utils/sanitize.ts with escapeHtml()" */
  action: string;
  /** Files to create or touch */
  files?: string[];
  /** Optional verification hint */
  verify?: string;
}

export interface RemediationPlaybook {
  vulnType: string;
  name: string;
  steps: PlaybookStep[];
  /** One-line summary for UI */
  summary: string;
}

const PLAYBOOKS: RemediationPlaybook[] = [
  {
    vulnType: 'sql-injection',
    name: 'Parameterized queries',
    summary: 'Add a DB helper and replace string-concat queries across the repo.',
    steps: [
      { id: '1', title: 'Identify DB layer', description: 'Find where queries are executed (e.g. db.query, knex, Sequelize).', action: 'Audit files that import db/knex/sequelize.', verify: 'List all files with raw query calls.' },
      { id: '2', title: 'Use parameterized API', description: 'Replace string concatenation with parameterized calls.', action: 'Use $1,$2 or ? placeholders and pass values as array/second arg.', files: ['Replace each vulnerable file.'], verify: 'No user input in query string.' },
      { id: '3', title: 'Verify payloads blocked', description: 'Ensure attack payloads (e.g. 1\' OR \'1\'=\'1) are neutralized.', action: 'Run tests or manual checks with strategy verification payloads.', verify: 'Payloads return safe result or error.' },
    ],
  },
  {
    vulnType: 'xss',
    name: 'Output encoding',
    summary: 'Centralize encoding and use it for all user-derived output.',
    steps: [
      { id: '1', title: 'Add sanitizer', description: 'Create a single escape/sanitize helper (e.g. utils/sanitize.ts).', action: 'Implement escapeHtml() and use for HTML context; use textContent where possible.', files: ['utils/sanitize.ts'], verify: 'Helper covers angle brackets, quotes, ampersand.' },
      { id: '2', title: 'Replace dangerous sinks', description: 'Replace innerHTML/dangerouslySetInnerHTML with safe output.', action: 'Use sanitize(userInput) or textContent for text.', files: [], verify: 'No raw user input to DOM.' },
      { id: '3', title: 'CSP header', description: 'Add Content-Security-Policy to reduce impact of any residual XSS.', action: 'Set strict CSP in server or meta tag.', verify: 'CSP present in response.' },
    ],
  },
  {
    vulnType: 'hardcoded-secret',
    name: 'Secrets to env',
    summary: 'Move secrets to environment variables and document in .env.example.',
    steps: [
      { id: '1', title: 'Create .env.example', description: 'List required env vars without values.', action: 'Add API_KEY=, DATABASE_URL=, etc.', files: ['.env.example'], verify: 'No real secrets in repo.' },
      { id: '2', title: 'Replace with getenv', description: 'Use process.env / os.environ.get / getenv() in code.', action: 'Replace literal with env read; add default only for non-secret.', files: [], verify: 'No secrets in source.' },
      { id: '3', title: 'Update .gitignore', description: 'Ensure .env and .env.local are ignored.', action: 'Add .env and .env.*.local to .gitignore.', files: ['.gitignore'], verify: '.env not tracked.' },
    ],
  },
  {
    vulnType: 'command-injection',
    name: 'Safe command execution',
    summary: 'Use execFile with argument array; never pass user input into shell.',
    steps: [
      { id: '1', title: 'Identify exec calls', description: 'Find exec/execSync/spawn with user input.', action: 'Grep for exec( or spawn( with + or template literal.', verify: 'List all call sites.' },
      { id: '2', title: 'Switch to execFile', description: 'Use execFile(command, [arg1, arg2], cb) or spawn without shell.', action: 'Pass arguments as array; set shell: false.', files: [], verify: 'No shell: true with user in command.' },
      { id: '3', title: 'Allowlist if needed', description: 'If command name is user-dependent, allowlist allowed commands.', action: 'Validate against a fixed list before exec.', verify: 'Only allowed commands run.' },
    ],
  },
];

export function getPlaybookForVulnType(vulnType: string): RemediationPlaybook | undefined {
  const norm = vulnType.toLowerCase().replace(/\s+/g, '-');
  return PLAYBOOKS.find((p) => p.vulnType === norm);
}

export function getAllPlaybooks(): RemediationPlaybook[] {
  return PLAYBOOKS;
}
