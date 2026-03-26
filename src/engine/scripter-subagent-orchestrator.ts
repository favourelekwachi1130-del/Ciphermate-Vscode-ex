/**
 * Scripter Sub-Agent Orchestrator
 *
 * Runs multi-phase deep analysis in-process:
 *   Phase 1: Triage (lead agent)
 *   Phase 2: Sub-agents in parallel (Pro = 2, Max = 4)
 *   Phase 3: Synthesis (lead agent combines all)
 *
 * Makes Pro/Max obviously better than a single-call flow: structured roles,
 * parallel specialist agents, and a single synthesized report.
 */

import type { ScripterMaxChunk } from './scripter-max-engine';
import { getPhaseConfig, getSubAgentCount, getSynthesisPrompt, type ScripterTierForDepth } from './scripter-max-phases';
import type { ScripterMaxTask } from './scripter-max-engine';
import { getCveKevForVulnType, formatCveKevForPrompt } from './cve-kev-client';
import { buildSubAgentToolContext } from './subagent-tools';

export type EmitChunk = (chunk: ScripterMaxChunk) => void;

export interface OrchestratorInput {
  task: ScripterMaxTask;
  message: string;
  vulnerabilityContext?: Record<string, unknown>;
  tier: ScripterTierForDepth;
  /** AI service with callAI(request) */
  aiService: { callAI: (req: { messages: Array<{ role: string; content: string }>; temperature?: number; max_tokens?: number }) => Promise<{ content?: string }> };
  emit: EmitChunk;
  /** Optional workspace root for sub-agent tools (read_file, grep) and CVE/KEV context */
  workspaceRoot?: string;
  /** Optional composed skill context (Option C) — enriches sub-agent prompts */
  skillContext?: string;
}

export interface OrchestratorResult {
  content: string;
  durationMs: number;
}

export async function runSubAgentOrchestrator(input: OrchestratorInput): Promise<OrchestratorResult> {
  const { task, message, vulnerabilityContext, tier, aiService, emit, workspaceRoot, skillContext } = input;
  const startTime = Date.now();

  const config = getPhaseConfig(task);
  const numAgents = Math.min(getSubAgentCount(tier), config.subAgents.length);
  const vulnBlock = vulnerabilityContext
    ? `\n## Vulnerability context\n\`\`\`json\n${JSON.stringify(vulnerabilityContext, null, 2)}\n\`\`\`\n`
    : '';

  // Real CVE/KEV data for vulnerability-analysis (Phase 2)
  let cveKevBlock = '';
  if (task === 'vulnerability-analysis' && vulnerabilityContext?.type) {
    emit({ type: 'thinking', text: 'Fetching CISA KEV data for CVE context...' });
    try {
      const vulnType = String(vulnerabilityContext.type);
      const kevResult = await getCveKevForVulnType(vulnType, { maxEntries: 12 });
      cveKevBlock = formatCveKevForPrompt(kevResult);
    } catch {
      cveKevBlock = '\n## CVE/KEV\n(Catalog unavailable for this run)\n';
    }
  }

  // Sub-agent tools: read_file / grep when workspace root and file available (Phase 2)
  let toolContextBlock = '';
  if (workspaceRoot && vulnerabilityContext?.file) {
    const primaryFile = String(vulnerabilityContext.file);
    const grepPatterns = ['query|execute|exec\\s*\\(|eval\\s*\\(|innerHTML|dangerouslySetInnerHTML|require\\s*\\(|document\\.write'];
    toolContextBlock = buildSubAgentToolContext(workspaceRoot, primaryFile, { grepPatterns });
  }

  // ── Phase 1: Triage ─────────────────────────────────────────────────────
  emit({ type: 'thinking', text: 'Phase 1: Triage & classification...' });
  let triageOutput = '';
  try {
    const triageRes = await aiService.callAI({
      messages: [
        { role: 'system', content: config.triagePrompt },
        { role: 'user', content: `${vulnBlock}${message}` },
      ],
      temperature: 0.2,
      max_tokens: 4096,
    });
    triageOutput = (triageRes?.content ?? '').trim();
  } catch (e) {
    triageOutput = `(Triage failed: ${e instanceof Error ? e.message : String(e)})`;
  }

  if (numAgents === 0) {
    // No sub-agents (e.g. general task): single synthesis with triage as context
    emit({ type: 'thinking', text: 'Synthesizing final report...' });
    const synthRes = await aiService.callAI({
      messages: [
        { role: 'system', content: config.synthesisPrompt },
        { role: 'user', content: `Context:\n${triageOutput}\n\nOriginal request:\n${message}` },
      ],
      temperature: 0.3,
      max_tokens: 8192,
    });
    const content = (synthRes?.content ?? '').trim();
    return { content, durationMs: Date.now() - startTime };
  }

  // ── Phase 2: Sub-agents in parallel ──────────────────────────────────────
  const agentsToRun = config.subAgents.slice(0, numAgents);
  const skillBlock = skillContext?.trim()
    ? `\n## Skill context (apply these guidelines)\n${skillContext}\n\n`
    : '';
  const sharedContext = `${skillBlock}${vulnBlock}${cveKevBlock}${toolContextBlock}${message}\n\n## Triage output\n${triageOutput}`;

  emit({ type: 'thinking', text: `Phase 2: Running ${agentsToRun.length} specialist sub-agents...` });

  const subAgentPromises = agentsToRun.map(async (role) => {
    emit({ type: 'sub-agent', text: `Starting ${role.name}...`, agentName: role.name });
    try {
      const res = await aiService.callAI({
        messages: [
          { role: 'system', content: role.systemPrompt },
          { role: 'user', content: sharedContext },
        ],
        temperature: 0.2,
        max_tokens: role.maxTokens,
      });
      const text = (res?.content ?? '').trim();
      emit({ type: 'sub-agent', text: `${role.name} complete.`, agentName: role.name });
      return { name: role.name, id: role.id, output: text };
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      emit({ type: 'sub-agent', text: `${role.name} error: ${err}`, agentName: role.name });
      return { name: role.name, id: role.id, output: `(Error: ${err})` };
    }
  });

  const subResults = await Promise.all(subAgentPromises);

  // ── Phase 3: Synthesis (tier-aware: Pro = 2-page researcher, Max = 2–4 page publication-ready) ──
  const synthesisPrompt = getSynthesisPrompt(task, tier);
  emit({ type: 'thinking', text: 'Phase 3: Lead agent synthesizing final report...' });

  const combinedInput = [
    '## Triage',
    triageOutput,
    '',
    ...subResults.map((r) => `## ${r.name}\n${r.output}`),
  ].join('\n\n');

  let synthRes = await aiService.callAI({
    messages: [
      { role: 'system', content: synthesisPrompt },
      { role: 'user', content: `Original request:\n${message}\n\n--- Sub-agent outputs ---\n\n${combinedInput}` },
    ],
    temperature: 0.3,
    max_tokens: tier === 'scripter' ? 16000 : 12000,
  });

  let content = (synthRes?.content ?? '').trim();

  // ── Phase 4 (Max only): Refinement pass for publication / compliance ─────────────────────────
  if (task === 'vulnerability-analysis' && tier === 'scripter' && content.length > 200) {
    emit({ type: 'thinking', text: 'Phase 4 (Max): Refining for publication and compliance...' });
    try {
      const refineRes = await aiService.callAI({
        messages: [
          {
            role: 'system',
            content: `You are the Report Refinement agent for the Max tier. Review the draft security report below and produce an enhanced, publication-ready version. Ensure: (1) Executive summary is clear for leadership if weak or missing. (2) All CVE/CWE refs are properly cited. (3) Add a short "Compliance mapping" paragraph (OWASP ASVS / Top 10, and optionally PCI-DSS or SOC2 control) if not already present. (4) Language is audit-ready. Output the complete enhanced report (2–4 pages). Do not shorten; expand where it adds value.`,
          },
          { role: 'user', content: `Draft report:\n\n${content.slice(0, 14000)}` },
        ],
        temperature: 0.2,
        max_tokens: 16000,
      });
      const refined = (refineRes?.content ?? '').trim();
      if (refined.length > content.length) { content = refined; }
    } catch {
      // keep original content
    }
  }

  return { content, durationMs: Date.now() - startTime };
}
