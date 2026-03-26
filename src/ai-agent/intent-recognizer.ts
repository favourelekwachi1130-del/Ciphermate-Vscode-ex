/**
 * Dynamic Natural Language Intent Recognition
 *
 * Understands user requests across many phrasings, typos, and variations.
 * Uses keyword scoring rather than rigid regex for flexible pattern matching.
 */

export type SecurityIntent =
  | 'SCAN_REPOSITORY'
  | 'SCAN_SECRETS'
  | 'SCAN_DEPENDENCIES'
  | 'SCAN_SMART_CONTRACTS'
  | 'FIX_VULNERABILITIES'
  | 'SHOW_RESULTS'
  | 'EXPLAIN'
  | 'ANALYZE'
  | 'CONVERSATIONAL';

export interface RecognizedIntent {
  intent: SecurityIntent;
  confidence: number;
  subIntent?: 'secrets' | 'dependencies' | 'smart_contracts' | 'full';
}

/** Common typo corrections and expansions */
const NORMALIZATIONS: [RegExp | string, string][] = [
  [/\brepo\b/gi, 'repository'],
  [/\brepos\b/gi, 'repositories'],
  [/\bwithmy\b/gi, 'with my'],
  [/\bwanna\b/gi, 'want to'],
  [/\bgonna\b/gi, 'going to'],
  [/\bgotcha\b/gi, 'got you'],
  [/\bdont\b/gi, "don't"],
  [/\bwont\b/gi, "won't"],
  [/\bcant\b/gi, "can't"],
  [/\bdoesnt\b/gi, "doesn't"],
  [/\bwasnt\b/gi, "wasn't"],
  [/\bisnt\b/gi, "isn't"],
  [/\baren't\b/gi, 'are not'],
  [/\bim\b/gi, "i'm"],
  [/\bive\b/gi, "i've"],
  [/\bwhats\b/gi, "what's"],
  [/\bthats\b/gi, "that's"],
  [/\bit's\b/gi, 'it is'],
  [/\btheres\b/gi, "there's"],
  [/\bheres\b/gi, "here's"],
  [/\bhow's\b/gi, 'how is'],
  [/\bpls\b/gi, 'please'],
  [/\bplz\b/gi, 'please'],
  [/\bsec\b/gi, 'security'],
  [/\bdeps\b/gi, 'dependencies'],
  [/\bvulns?\b/gi, 'vulnerabilities'],
  [/\bprobs?\b/gi, 'problems'],
  [/\bprob\b/gi, 'problem'],
  [/\bissus\b/gi, 'issues'],
  [/\brecieve\b/gi, 'receive'],
  [/\baccidentaly\b/gi, 'accidentally'],
  [/\breccomend\b/gi, 'recommend'],
  [/\benvironement\b/gi, 'environment'],
  [/\benvironemnt\b/gi, 'environment'],
];

/** Words that negate the intent (e.g. "don't scan") */
const NEGATORS = /\b(dont|don't|do not|won't|will not|cant|can't|cannot|shouldn't|should not|never|avoid|skip|stop)\b/i;

interface IntentDefinition {
  intent: SecurityIntent;
  subIntent?: 'secrets' | 'dependencies' | 'smart_contracts' | 'full';
  primary: string[];   // Strong signal - high weight
  secondary: string[]; // Supporting - lower weight
  context?: string[];  // Domain words that boost confidence when present
  exclude?: string[];  // Words that reduce confidence
}

const INTENT_DEFINITIONS: IntentDefinition[] = [
  {
    intent: 'SCAN_SECRETS',
    subIntent: 'secrets',
    primary: ['secret', 'secrets', 'hardcoded', 'credentials', 'credential', 'api key', 'apikey', 'api_key', 'password', 'passwords', 'token', 'tokens', 'keys', 'exposed', 'leaked', 'sensitive', 'env var', 'private key', 'secret key'],
    secondary: ['find', 'detect', 'scan', 'search', 'look for', 'identify', 'discover', 'check for', 'hunt', 'locate', 'uncover'],
    context: ['repository', 'repo', 'codebase', 'code', 'project', 'file', 'files'],
  },
  {
    intent: 'SCAN_DEPENDENCIES',
    subIntent: 'dependencies',
    primary: ['dependenc', 'dependencies', 'packages', 'package', 'cve', 'cvss', 'vulnerable packages', 'outdated', 'npm', 'pip', 'yarn', 'lockfile', 'package.json', 'requirements.txt', 'gemfile'],
    secondary: ['check', 'scan', 'audit', 'review', 'analyze', 'find', 'detect', 'inspect', 'verify'],
    context: ['repository', 'repo', 'project', 'codebase', 'libraries'],
  },
  {
    intent: 'SCAN_SMART_CONTRACTS',
    subIntent: 'smart_contracts',
    primary: ['smart contract', 'solidity', 'web3', 'blockchain', 'ethereum', '.sol', 'solana', 'defi', 'evm', 'contract audit'],
    secondary: ['scan', 'audit', 'analyze', 'check', 'review', 'inspect'],
    context: ['repository', 'repo', 'project'],
  },
  {
    intent: 'FIX_VULNERABILITIES',
    primary: ['fix', 'repair', 'remediate', 'patch', 'resolve', 'correct', 'apply fix', 'auto fix', 'automatically fix', 'address', 'mitigate', 'fix all', 'fix them'],
    secondary: ['vulnerabilit', 'issues', 'findings', 'problems', 'bugs', 'all', 'them', 'these', 'critical', 'high', 'first', 'priority', 'prioritize'],
    context: ['repository', 'repo', 'code', 'codebase'],
    exclude: ['how to', 'how do i', 'explain', 'tell me', 'what is', 'why', 'can you explain'],
  },
  {
    intent: 'SHOW_RESULTS',
    primary: ['show', 'display', 'view', 'list', 'see', 'get', 'give me', 'bring up', 'open', 'pull up', 'present'],
    secondary: ['result', 'results', 'finding', 'findings', 'vulnerabilit', 'issues', 'critical', 'high', 'medium', 'low', 'report', 'dashboard', 'what did you find'],
    context: ['scan', 'security', 'all', 'the'],
  },
  {
    intent: 'EXPLAIN',
    primary: ['explain', 'what is', 'whats', 'why', 'how does', 'how do', 'tell me about', 'describe', 'elaborate', 'clarify', 'break down', 'walk me through', 'help me understand'],
    secondary: ['vulnerabilit', 'issue', 'finding', 'this', 'that', 'critical', 'fix', 'remediate', 'security', 'risk'],
    context: ['security', 'code', 'sql', 'xss', 'injection'],
  },
  {
    intent: 'SCAN_REPOSITORY',
    subIntent: 'full',
    primary: [
      'scan', 'scaning', 'scann', 'audit', 'analyze', 'analyse', 'check', 'review', 'examine', 'inspect', 'assess', 'evaluate',
      'security scan', 'run scan', 'carry out scan', 'perform scan', 'conduct scan', 'do a scan', 'execute scan',
      'send report', 'send me report', 'get report', 'generate report', 'security report', 'run a report',
      'vulnerability scan', 'repo scan', 'code scan', 'codebase scan', 'project scan',
      'look at', 'take a look', 'have a look', 'check out', 'go through',
      're-run scan', 'rerun scan', 'run again', 'rescan', 'scan again',
    ],
    secondary: [
      'repository', 'repo', 'repos', 'codebase', 'code', 'project', 'my code', 'my project',
      'issues', 'problems', 'vulnerabilities', 'security', 'state', 'health', 'condition',
      'best state', 'good state', 'not sure', 'not in good', 'help me', 'can you', 'could you', 'would you',
      'unsure', 'concerned', 'worried', 'need help',
    ],
    context: ['repository', 'repo', 'codebase', 'project', 'code'],
  },
  {
    intent: 'ANALYZE',
    subIntent: 'full',
    primary: ['analyze', 'analyse', 'analysis', 'audit', 'assess', 'evaluate', 'review', 'examine', 'inspect', 'look at', 'go through'],
    secondary: ['repository', 'repo', 'code', 'codebase', 'security', 'vulnerabilities', 'project'],
    context: ['my', 'the', 'this'],
  },
];

export class IntentRecognizer {
  private normalizedCache = new Map<string, string>();

  /**
   * Normalize user input for consistent matching
   */
  normalize(text: string): string {
    const cached = this.normalizedCache.get(text);
    if (cached) return cached;

    let normalized = text.toLowerCase().trim();
    // Apply typo/contraction expansions
    for (const [pattern, replacement] of NORMALIZATIONS) {
      normalized = typeof pattern === 'string'
        ? normalized.replace(new RegExp(pattern, 'gi'), replacement)
        : normalized.replace(pattern, replacement);
    }
    // Collapse multiple spaces
    normalized = normalized.replace(/\s+/g, ' ').trim();
    this.normalizedCache.set(text, normalized);
    return normalized;
  }

  /**
   * Tokenize into words and bigrams for flexible matching
   */
  tokenize(text: string): { words: Set<string>; phrases: string[] } {
    const normalized = this.normalize(text);
    const words = new Set(normalized.split(/\s+/).filter(w => w.length > 1));
    const phrases: string[] = [];
    const parts = normalized.split(/\s+/);
    for (let i = 0; i < parts.length - 1; i++) {
      phrases.push(`${parts[i]} ${parts[i + 1]}`);
      if (i < parts.length - 2) {
        phrases.push(`${parts[i]} ${parts[i + 1]} ${parts[i + 2]}`);
      }
    }
    return { words, phrases };
  }

  /**
   * Check if text contains any of the keywords (supports partial match for word stems)
   */
  private matchesKeyword(text: string, keywords: string[], tokens: { words: Set<string>; phrases: string[] }): number {
    let score = 0;
    const fullText = ` ${text} `;

    for (const kw of keywords) {
      const isPhrase = kw.includes(' ');
      if (isPhrase) {
        if (fullText.includes(` ${kw} `) || fullText.includes(kw)) {
          score += 2;
        }
      } else {
        let found = false;
        for (const word of tokens.words) {
          if (word === kw || word.startsWith(kw) || kw.startsWith(word)) {
            score += 1;
            found = true;
            break;
          }
        }
        if (!found && fullText.includes(kw)) {
          score += 1;
        }
      }
    }
    return score;
  }

  /**
   * Recognize the primary intent from a user message
   */
  recognize(message: string): RecognizedIntent {
    const trimmed = message.trim();
    if (!trimmed || trimmed.length < 2) {
      return { intent: 'CONVERSATIONAL', confidence: 0 };
    }

    const normalized = this.normalize(trimmed);
    const tokens = this.tokenize(trimmed);

    // Negation check - if user says "don't scan" etc., treat as conversational
    if (NEGATORS.test(normalized)) {
      const negatorBeforeScan = /\b(dont|don't|do not|won't|can't|cannot|never)\s+(scan|run|perform|do|fix|show)/i.test(normalized);
      if (negatorBeforeScan) {
        return { intent: 'CONVERSATIONAL', confidence: 0.9 };
      }
    }

    let best: RecognizedIntent = { intent: 'CONVERSATIONAL', confidence: 0 };
    const scores: { intent: SecurityIntent; subIntent?: string; score: number }[] = [];

    for (const def of INTENT_DEFINITIONS) {
      let score = 0;

      const primaryScore = this.matchesKeyword(normalized, def.primary, tokens);
      const secondaryScore = this.matchesKeyword(normalized, def.secondary, tokens);
      const contextScore = def.context ? this.matchesKeyword(normalized, def.context, tokens) : 0;

      score = primaryScore * 3 + secondaryScore * 1 + (contextScore > 0 ? 1 : 0);

      if (def.exclude) {
        for (const ex of def.exclude) {
          if (normalized.includes(ex)) {
            score -= 2;
            break;
          }
        }
      }

      if (score > 0) {
        scores.push({
          intent: def.intent,
          subIntent: def.subIntent,
          score: Math.max(0, score),
        });
      }
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    if (scores.length > 0) {
      const top = scores[0];
      const second = scores[1];
      // Confidence: higher score = higher confidence; also consider gap from 2nd place
      const gap = second ? top.score - second.score : top.score;
      const confidence = Math.min(0.95, 0.5 + (top.score * 0.08) + (gap * 0.05));

      best = {
        intent: top.intent,
        confidence,
        subIntent: top.subIntent as RecognizedIntent['subIntent'],
      };
    }

    return best;
  }

  /**
   * Check if the message indicates a security/scan-related request that should use AgenticCore
   */
  isSecurityRequest(message: string): boolean {
    const result = this.recognize(message);
    return result.intent !== 'CONVERSATIONAL' && result.confidence >= 0.4;
  }

  /**
   * Get sub-intent for scan type (secrets, dependencies, smart contracts, or full)
   */
  getScanSubIntent(message: string): 'secrets' | 'dependencies' | 'smart_contracts' | 'full' | undefined {
    const result = this.recognize(message);
    if (result.intent === 'SCAN_SECRETS') return 'secrets';
    if (result.intent === 'SCAN_DEPENDENCIES') return 'dependencies';
    if (result.intent === 'SCAN_SMART_CONTRACTS') return 'smart_contracts';
    if (result.intent === 'SCAN_REPOSITORY' || result.intent === 'ANALYZE') return result.subIntent || 'full';
    return undefined;
  }
}

let recognizerInstance: IntentRecognizer | null = null;

export function getIntentRecognizer(): IntentRecognizer {
  if (!recognizerInstance) {
    recognizerInstance = new IntentRecognizer();
  }
  return recognizerInstance;
}
