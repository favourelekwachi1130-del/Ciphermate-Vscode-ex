/**
 * Bundled GraphRAG-lite (Option 3): zero user setup, no Python.
 * Builds a knowledge graph from workspace code using the extension's AI provider,
 * stores it on disk, and answers graph-backed queries for the Mastra tool.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface Entity {
  id: string;
  name: string;
  type?: string;
  description?: string;
  filePath?: string;
  startLine?: number;
}

export interface Relation {
  sourceId: string;
  targetId: string;
  type?: string;
  description?: string;
}

export interface GraphData {
  entities: Entity[];
  relations: Relation[];
  communitySummaries?: string[];
  indexedAt: string;
  workspaceRoot: string;
}

const EXTRACT_SYSTEM = `You are a security-focused code analyst. From code snippets, extract entities (modules, functions, classes, APIs, config keys, auth mechanisms) and relations (calls, uses, imports, configures). Focus on security-relevant items: auth, validation, crypto, network, secrets. Output only valid JSON.`;

const EXTRACT_USER = (code: string, filePath: string) =>
  `Extract entities and relations from this code. Output a single JSON object with:
"entities": [ {"id": "unique-id", "name": "EntityName", "type": "function|class|module|config|api", "description": "brief", "filePath": "${filePath}", "startLine": number} ],
"relations": [ {"sourceId": "id", "targetId": "id", "type": "calls|uses|imports|configures", "description": "brief"} ].
Use short ids (e.g. file_baseName_entityName). Code:\n\n${code.slice(0, 6000)}`;

export interface IndexOptions {
  /** Call AI for extraction. Signature: (userPrompt, systemPrompt?) => response text */
  aiComplete: (userPrompt: string, systemPrompt?: string) => Promise<string>;
  maxFiles?: number;
  maxChunkChars?: number;
}

/**
 * Gather code files (same heuristics as RAG engine).
 */
function getCodeFiles(workspacePath: string, maxFiles: number): string[] {
  const files: string[] = [];
  const codeExtensions = ['.js', '.ts', '.py', '.php', '.java', '.c', '.cpp', '.cs', '.go', '.rs', '.rb', '.sh', '.json', '.yaml', '.yml'];
  const skipDirs = new Set(['node_modules', '.git', 'dist', 'out', 'build', 'target', 'vendor', '.venv', 'venv', '.vscode-test']);

  function walk(dir: string) {
    if (files.length >= maxFiles) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (files.length >= maxFiles) return;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (!e.name.startsWith('.') && !skipDirs.has(e.name)) walk(full);
        } else if (codeExtensions.some(ext => e.name.endsWith(ext))) {
          try {
            const stat = fs.statSync(full);
            if (stat.size < 500_000) files.push(full);
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }
  }
  walk(workspacePath);
  return files;
}

/**
 * Parse AI response into entities and relations. Tolerates markdown code blocks.
 */
function parseExtractionResponse(text: string, filePath: string): { entities: Entity[]; relations: Relation[] } {
  let jsonStr = text.trim();
  const codeBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) jsonStr = codeBlock[1].trim();
  const first = jsonStr.indexOf('{');
  const last = jsonStr.lastIndexOf('}');
  if (first === -1 || last <= first) return { entities: [], relations: [] };
  try {
    const parsed = JSON.parse(jsonStr.slice(first, last + 1)) as {
      entities?: Array<{ id?: string; name?: string; type?: string; description?: string; filePath?: string; startLine?: number }>;
      relations?: Array<{ sourceId?: string; targetId?: string; type?: string; description?: string }>;
    };
    const entities: Entity[] = (parsed.entities || []).map((e, i) => ({
      id: e.id || `e_${i}_${(e.name || '').replace(/\W/g, '_')}`,
      name: e.name || 'Unknown',
      type: e.type,
      description: e.description,
      filePath: e.filePath ?? filePath,
      startLine: e.startLine,
    }));
    const relations: Relation[] = (parsed.relations || []).map(r => ({
      sourceId: r.sourceId || '',
      targetId: r.targetId || '',
      type: r.type,
      description: r.description,
    })).filter(r => r.sourceId && r.targetId);
    return { entities, relations };
  } catch {
    return { entities: [], relations: [] };
  }
}

/**
 * Index workspace: read files, extract entities/relations via AI, build graph and save.
 */
export async function indexWorkspace(
  workspacePath: string,
  graphPath: string,
  options: IndexOptions
): Promise<{ entities: number; relations: number; filesProcessed: number }> {
  const maxFiles = options.maxFiles ?? 80;
  const maxChunkChars = options.maxChunkChars ?? 8000;
  const files = getCodeFiles(workspacePath, maxFiles);
  const allEntities: Entity[] = [];
  const allRelations: Relation[] = [];
  const seenIds = new Set<string>();

  for (const filePath of files) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    const chunk = content.length > maxChunkChars ? content.slice(0, maxChunkChars) + '\n...' : content;
    const relPath = path.relative(workspacePath, filePath);
    try {
      const raw = await options.aiComplete(EXTRACT_USER(chunk, relPath), EXTRACT_SYSTEM);
      const { entities, relations } = parseExtractionResponse(raw, relPath);
      for (const e of entities) {
        if (!seenIds.has(e.id)) {
          seenIds.add(e.id);
          allEntities.push(e);
        }
      }
      for (const r of relations) {
        allRelations.push(r);
      }
    } catch (err) {
      console.warn(`GraphRAG bundled: extract failed for ${relPath}:`, err);
    }
  }

  const data: GraphData = {
    entities: allEntities,
    relations: allRelations,
    indexedAt: new Date().toISOString(),
    workspaceRoot: workspacePath,
  };
  const dir = path.dirname(graphPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(graphPath, JSON.stringify(data, null, 0), 'utf8');

  return {
    entities: allEntities.length,
    relations: allRelations.length,
    filesProcessed: files.length,
  };
}

/**
 * Load graph from disk.
 */
export function loadGraph(graphPath: string): GraphData | null {
  try {
    const raw = fs.readFileSync(graphPath, 'utf8');
    return JSON.parse(raw) as GraphData;
  } catch {
    return null;
  }
}

/**
 * Query: return text context for the agent. Global = summarize whole graph; local = keyword match entities + neighborhood.
 */
export function queryGraph(graph: GraphData, question: string, scope: 'global' | 'local'): string {
  const q = question.toLowerCase();
  const words = q.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  const entityById = new Map<string, Entity>(graph.entities.map(e => [e.id, e]));

  if (scope === 'local' && words.length > 0) {
    const matchingIds = new Set<string>();
    for (const e of graph.entities) {
      const text = `${e.name} ${e.type || ''} ${e.description || ''} ${e.filePath || ''}`.toLowerCase();
      if (words.some(w => text.includes(w))) matchingIds.add(e.id);
    }
    const out: string[] = ['## Relevant entities and relations\n'];
    for (const id of matchingIds) {
      const e = entityById.get(id);
      if (e) out.push(`- **${e.name}** (${e.type || 'entity'}): ${e.description || '—'} @ ${e.filePath || ''}`);
    }
    const rels = graph.relations.filter(r => matchingIds.has(r.sourceId) || matchingIds.has(r.targetId));
    if (rels.length > 0) {
      out.push('\nRelations:');
      for (const r of rels.slice(0, 30)) {
        const a = entityById.get(r.sourceId)?.name ?? r.sourceId;
        const b = entityById.get(r.targetId)?.name ?? r.targetId;
        out.push(`  ${a} --[${r.type || 'rel'}]--> ${b}`);
      }
    }
    return out.join('\n') || 'No matching entities found. Try a broader question or run Index again.';
  }

  // Global: summarize graph
  const lines: string[] = [
    `## Codebase graph summary (${graph.entities.length} entities, ${graph.relations.length} relations)`,
    `Indexed: ${graph.indexedAt}`,
    '',
    '### Entities (sample)',
  ];
  const byType = new Map<string, Entity[]>();
  for (const e of graph.entities) {
    const t = e.type || 'other';
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(e);
  }
  for (const [type, list] of byType) {
    lines.push(`**${type}**: ${list.slice(0, 15).map(e => e.name).join(', ')}${list.length > 15 ? '...' : ''}`);
  }
  lines.push('\n### Sample relations');
  for (const r of graph.relations.slice(0, 25)) {
    const a = entityById.get(r.sourceId)?.name ?? r.sourceId;
    const b = entityById.get(r.targetId)?.name ?? r.targetId;
    lines.push(`  ${a} → ${b} (${r.type || 'rel'})`);
  }
  return lines.join('\n');
}
