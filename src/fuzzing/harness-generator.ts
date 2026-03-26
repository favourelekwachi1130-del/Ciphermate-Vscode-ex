/**
 * Harness Generator — Devansh Methodology
 *
 * "Generate minimal repro for crash/vuln."
 *
 * Given a vulnerability description + code context, emit:
 * 1. A curl command that demonstrates the vuln (for HTTP endpoints)
 * 2. A failing test (Jest/pytest) that proves the vuln
 * 3. A minimal repro script
 *
 * The LLM does the heavy lifting; this module provides templates and structure.
 */

export interface VulnContext {
  /** Vulnerability type (e.g. sql-injection, xss, ssrf) */
  type: string;
  /** Affected file and optional line */
  file?: string;
  line?: number;
  /** Code snippet around the vuln */
  codeSnippet?: string;
  /** HTTP route if applicable (e.g. POST /api/users) */
  route?: string;
  /** Parameter or input that is vulnerable */
  vulnerableParam?: string;
  /** Framework (express, fastify, etc.) */
  framework?: string;
}

export interface HarnessOutput {
  kind: 'curl' | 'test' | 'script';
  content: string;
  language?: string;
  description?: string;
}

/**
 * Build prompt for LLM to generate a curl harness
 */
export function buildCurlHarnessPrompt(vuln: VulnContext): string {
  return `You are a security researcher. Generate a minimal curl command that demonstrates this vulnerability.

VULNERABILITY: ${vuln.type}
${vuln.route ? `ROUTE: ${vuln.route}` : ''}
${vuln.vulnerableParam ? `VULNERABLE PARAMETER: ${vuln.vulnerableParam}` : ''}
${vuln.codeSnippet ? `CODE CONTEXT:\n\`\`\`\n${vuln.codeSnippet.slice(0, 1500)}\n\`\`\`` : ''}

Requirements:
- Target localhost (e.g. http://localhost:3000)
- Use the exact route and parameter
- Include a payload that would trigger the vuln (e.g. SQL injection, XSS)
- Single curl command, no explanation

Output ONLY the curl command, nothing else.`;
}

/**
 * Build prompt for LLM to generate a failing test harness
 */
export function buildTestHarnessPrompt(
  vuln: VulnContext,
  options?: { testFramework?: 'jest' | 'pytest' }
): string {
  const framework = options?.testFramework ?? 'jest';

  if (framework === 'pytest') {
    return `You are a security researcher. Generate a pytest test that PROVES this vulnerability exists.

VULNERABILITY: ${vuln.type}
${vuln.file ? `FILE: ${vuln.file}` : ''}
${vuln.codeSnippet ? `CODE CONTEXT:\n\`\`\`\n${vuln.codeSnippet.slice(0, 1500)}\n\`\`\`` : ''}

Requirements:
- The test should FAIL if the vuln is fixed (or PASS if it demonstrates the vuln)
- Use requests or httpx to hit the endpoint if it's HTTP
- Include a malicious payload
- Minimal, self-contained test
- No explanation, only code

Output ONLY the Python test code, nothing else.`;
  }

  return `You are a security researcher. Generate a Jest/Vitest test that PROVES this vulnerability exists.

VULNERABILITY: ${vuln.type}
${vuln.file ? `FILE: ${vuln.file}` : ''}
${vuln.route ? `ROUTE: ${vuln.route}` : ''}
${vuln.codeSnippet ? `CODE CONTEXT:\n\`\`\`\n${vuln.codeSnippet.slice(0, 1500)}\n\`\`\`` : ''}

Requirements:
- The test should demonstrate the vuln (e.g. assert that malicious input is reflected)
- Use fetch or supertest if HTTP
- Include a malicious payload
- Minimal, self-contained test
- No explanation, only code

Output ONLY the test code, nothing else.`;
}

/**
 * Build prompt for LLM to generate a minimal repro script
 */
export function buildScriptHarnessPrompt(vuln: VulnContext): string {
  return `You are a security researcher. Generate a minimal Node.js or Python script that reproduces this vulnerability.

VULNERABILITY: ${vuln.type}
${vuln.route ? `ROUTE: ${vuln.route}` : ''}
${vuln.codeSnippet ? `CODE CONTEXT:\n\`\`\`\n${vuln.codeSnippet.slice(0, 1500)}\n\`\`\`` : ''}

Requirements:
- Minimal script (no dependencies if possible, or standard libs only)
- Script should demonstrate the vuln when run (e.g. print "VULNERABLE" or similar)
- Single file
- No explanation, only code

Output ONLY the script, nothing else.`;
}

/**
 * Parse LLM output into a harness. Extracts code from markdown blocks if present.
 */
export function parseHarnessFromLLM(
  llmOutput: string,
  kind: 'curl' | 'test' | 'script'
): HarnessOutput {
  const trimmed = llmOutput.trim();

  // Extract from ``` block
  const blockMatch = trimmed.match(/```(?:bash|sh|shell|javascript|js|typescript|ts|python|py)?\s*\n?([\s\S]*?)```/);
  const content = blockMatch ? blockMatch[1].trim() : trimmed;

  const lang =
    kind === 'curl' ? 'bash' : kind === 'test' ? 'javascript' : 'javascript';

  return {
    kind,
    content,
    language: lang,
    description: `Generated ${kind} harness`,
  };
}
