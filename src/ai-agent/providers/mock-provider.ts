/**
 * Mock AI Provider — Test prompts without a backend
 *
 * Returns canned responses so you can test the full flow (scan → fix → apply)
 * when the backend isn't set up yet. Enable via ciphermate.ai.devMode.
 */

import { BaseAIProvider, AIRequest, AIResponse, ProviderConfig } from './base-provider';

/** Mock explanations per vulnerability type (dev mode — no backend). */
const MOCK_EXPLANATIONS: Record<string, string> = {
  'command-injection': `**Command Injection** (dev mode explanation)

An attacker can inject shell commands by passing malicious input (e.g. \`; rm -rf /\` or \`$(whoami)\`) into the command string. The code concatenates user input directly into exec/execSync, allowing arbitrary command execution.

**Fix:** Use \`execFile\` or \`spawn\` with an args array instead of string interpolation. Never pass user input into shell commands via \`+\` or template literals.`,
  'sql-injection': `**SQL Injection** (dev mode explanation)

User input is concatenated into the SQL query, allowing attackers to modify the query (e.g. \`1 OR 1=1\`) and read, modify, or delete data.

**Fix:** Use parameterized queries or prepared statements. Never concatenate user input into SQL.`,
  'xss': `**Cross-Site Scripting (XSS)** (dev mode explanation)

User-controlled data is assigned to innerHTML or document.write without sanitization. An attacker can inject scripts that run in victims' browsers.

**Fix:** Use textContent instead of innerHTML, or sanitize/escape output. Avoid document.write.`,
  'code-injection': `**Code Injection** (dev mode explanation)

eval() or similar executes user input as code. An attacker can run arbitrary JavaScript.

**Fix:** Avoid eval(). Use JSON.parse for data, or a sandboxed expression evaluator.`,
  'hardcoded-secret': `**Hardcoded Secret** (dev mode explanation)

Credentials or API keys are stored in source code. They can be leaked via version control or builds.

**Fix:** Use environment variables (process.env) or a secrets manager. Add .env to .gitignore.`,
};

function inferVulnTypeFromContent(content: string): string {
  const c = content.toLowerCase();
  if (c.includes('command injection') || c.includes('exec') || c.includes('spawn') || c.includes('shell')) return 'command-injection';
  if (c.includes('sql') || c.includes('query') || c.includes('parameterized')) return 'sql-injection';
  if (c.includes('xss') || c.includes('innerhtml') || c.includes('document.write')) return 'xss';
  if (c.includes('eval') || c.includes('code injection')) return 'code-injection';
  if (c.includes('secret') || c.includes('password') || c.includes('api key') || c.includes('hardcoded')) return 'hardcoded-secret';
  return 'security-issue';
}

export class MockProvider extends BaseAIProvider {
  constructor(config: ProviderConfig) {
    super(config);
  }

  getName(): string {
    return 'Mock (dev mode)';
  }

  getSupportedModels(): string[] {
    return ['mock-dev'];
  }

  async callAI(request: AIRequest): Promise<AIResponse> {
    const lastMessage = request.messages[request.messages.length - 1];
    const content = typeof lastMessage?.content === 'string' ? lastMessage.content : '';

    // Explanation prompts (security expert, explain, vulnerability)
    const isExplainPrompt =
      (content.includes('security expert') || content.includes('As a security')) &&
      (content.includes('explain') || content.includes('Provide a') || content.includes('brief explanation') || content.includes('analyze'));

    if (isExplainPrompt) {
      const vulnType = inferVulnTypeFromContent(content);
      const explanation = MOCK_EXPLANATIONS[vulnType] || MOCK_EXPLANATIONS['command-injection'];
      return { content: explanation };
    }

    // Detect fix-generation prompts (contain vulnerability/fix keywords)
    const isFixPrompt =
      content.includes('VULNERABILITY') ||
      content.includes('fixedCode') ||
      content.includes('originalCode') ||
      content.includes('security fix');

    if (isFixPrompt) {
      // Extract originalCode from prompt (VULNERABLE CODE / code block) so replacement range works
      const codeBlockMatch = content.match(/```[\s\S]*?```/);
      const sampleCode = codeBlockMatch
        ? codeBlockMatch[0].replace(/```\w*\n?/g, '').replace(/```$/g, '').trim()
        : (content.match(/VULNERABLE CODE:[\s\S]*?```([\s\S]*?)```/)?.[1] || '// vulnerable code').trim();
      let fixedCode = sampleCode
        .replace(/password\s*=\s*["'][^"']+["']/i, 'password = process.env.SECRET_KEY || ""')
        .replace(/innerHTML\s*=/g, 'textContent =')
        .replace(/eval\s*\(/g, '// eval removed - use safe alternative');

      // Command injection: exec/execSync with string concat or template literal
      if (/(exec|execSync|spawn)\s*\([^)]*[+`]/.test(sampleCode) || /`[^`]*\$\{[^}]+\}[^`]*`/.test(sampleCode)) {
        fixedCode = sampleCode
          .replace(/\{\s*execSync\s*\}/g, '{ execFileSync }')
          .replace(/execSync\s*\(\s*`ls\s+-la\s+\$\{([^}]+)\}`\s*\)/g, "execFileSync('ls', ['-la', $1])")
          .replace(/exec\s*\(\s*['"`]ping\s+-c\s+4\s+['"`]\s*\+\s*(\w+)\s*\)/g, "execFile('ping', ['-c', '4', $1])")
          .replace(/exec\s*\(\s*`ping\s+-c\s+4\s+\$\{([^}]+)\}`\s*\)/g, "execFile('ping', ['-c', '4', $1])");
        if (fixedCode === sampleCode) {
          fixedCode = sampleCode.replace(
            /(exec|execSync)\s*\([^)]+\)/,
            "execFileSync('ls', ['-la', cmd])"
          );
        }
      }

      const response = {
        originalCode: sampleCode,
        fixedCode: fixedCode || sampleCode + '\n// Fixed by mock',
        explanation: 'Mock fix (dev mode — no backend). Replace with real model when ready.',
        confidence: 0.7,
        securityImprovements: ['Mock improvement'],
        testingNotes: 'Run tests after applying',
        envVarsToCreate: content.includes('secret') || content.includes('password') ? [{ name: 'SECRET_KEY', value: 'your-secret-here' }] : undefined,
      };
      return { content: JSON.stringify(response) };
    }

    // Generic response for other prompts (planFileData, preValidate, etc.)
    if (content.includes('createEnv') || content.includes('planFileData')) {
      return {
        content: JSON.stringify({
          createEnv: true,
          envVars: [{ name: 'EXAMPLE_VAR', value: 'placeholder' }],
          updateGitignore: true,
          otherFiles: ['.env.example'],
          reason: 'Mock plan (dev mode)',
        }),
      };
    }

    if (content.includes('approved') || content.includes('pre-implementation')) {
      return {
        content: JSON.stringify({
          approved: true,
          confidence: 0.8,
          reason: 'Mock approved (dev mode)',
          issues: [],
          suggestions: [],
        }),
      };
    }

    // Fallback
    return {
      content: 'Mock response (dev mode — enable ciphermate.ai.devMode to test without backend)',
    };
  }

  async testConnection(): Promise<{ success: boolean; error?: string; latency?: number }> {
    return { success: true, latency: 0 };
  }
}
