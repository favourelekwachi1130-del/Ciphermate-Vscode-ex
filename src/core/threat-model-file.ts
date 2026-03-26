/**
 * Threat Model as Code — Research Direction #7
 *
 * Load/save threat model from threat-model.json or threat-model.yaml in repo root.
 * Enables version control, CI integration, and human-editable threat models.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ThreatModel } from './threat-model-from-cve';

/** Schema for threat-model.json / threat-model.yaml (human-editable subset) */
export interface ThreatModelFile {
  /** One-sentence focus */
  sliceFocus?: string;
  /** Entry points to audit */
  entryPoints?: string[];
  /** Trust boundaries */
  trustBoundaries?: string[];
  /** High-risk operations */
  highRiskOps?: string[];
  /** Attacker model */
  attackerModel?: 'remote-unauthenticated' | 'remote-authenticated-low' | 'cross-tenant' | 'local-code-exec';
  /** Optional: crown jewels (what we're protecting) */
  crownJewels?: string[];
  /** Optional: invariants to check (e.g. "Only admins can call DELETE /users") */
  invariants?: string[];
  /** Optional: source / provenance */
  source?: 'user' | 'cve-derived' | 'merged';
}

const THREAT_MODEL_FILES = ['threat-model.json', '.ciphermate/threat-model.json'];

const VALID_ATTACKER_MODELS = ['remote-unauthenticated', 'remote-authenticated-low', 'cross-tenant', 'local-code-exec'] as const;

/**
 * Load threat model from file if present.
 * Tries threat-model.json, threat-model.yaml, .ciphermate/threat-model.json.
 */
export function loadThreatModelFromFile(workspaceRoot: string): ThreatModelFile | null {
  for (const rel of THREAT_MODEL_FILES) {
    const full = path.join(workspaceRoot, rel);
    if (!fs.existsSync(full)) continue;

    try {
      const raw = fs.readFileSync(full, 'utf8');
      let parsed: Record<string, unknown>;

      parsed = JSON.parse(raw);

      const tm = parseThreatModelFile(parsed);
      if (tm) return tm;
    } catch {
      /* ignore parse errors */
    }
  }
  return null;
}

function parseThreatModelFile(obj: Record<string, unknown>): ThreatModelFile | null {
  if (!obj || typeof obj !== 'object') return null;

  const entryPoints = Array.isArray(obj.entryPoints) ? obj.entryPoints.map(String) : undefined;
  const trustBoundaries = Array.isArray(obj.trustBoundaries) ? obj.trustBoundaries.map(String) : undefined;
  const highRiskOps = Array.isArray(obj.highRiskOps) ? obj.highRiskOps.map(String) : undefined;
  const crownJewels = Array.isArray(obj.crownJewels) ? obj.crownJewels.map(String) : undefined;
  const invariants = Array.isArray(obj.invariants) ? obj.invariants.map(String) : undefined;

  let attackerModel = obj.attackerModel as string | undefined;
  if (attackerModel && !VALID_ATTACKER_MODELS.includes(attackerModel as any)) {
    attackerModel = 'remote-unauthenticated';
  }

  return {
    sliceFocus: typeof obj.sliceFocus === 'string' ? obj.sliceFocus : undefined,
    entryPoints: entryPoints?.length ? entryPoints : undefined,
    trustBoundaries: trustBoundaries?.length ? trustBoundaries : undefined,
    highRiskOps: highRiskOps?.length ? highRiskOps : undefined,
    attackerModel: attackerModel as ThreatModelFile['attackerModel'],
    crownJewels: crownJewels?.length ? crownJewels : undefined,
    invariants: invariants?.length ? invariants : undefined,
    source: (obj.source as ThreatModelFile['source']) || 'user',
  };
}

/**
 * Merge file-based threat model with CVE-derived threat model.
 * File values override when present; CVE-derived fills gaps.
 */
export function mergeThreatModels(
  fileModel: ThreatModelFile | null,
  cveModel: ThreatModel | null
): ThreatModel | null {
  if (!cveModel && !fileModel) return null;
  if (!cveModel) return fileModelToThreatModel(fileModel!);
  if (!fileModel) return cveModel;

  return {
    sliceFocus: fileModel.sliceFocus || cveModel.sliceFocus,
    entryPoints: fileModel.entryPoints?.length ? fileModel.entryPoints : cveModel.entryPoints,
    trustBoundaries: fileModel.trustBoundaries?.length ? fileModel.trustBoundaries : cveModel.trustBoundaries,
    highRiskOps: fileModel.highRiskOps?.length ? fileModel.highRiskOps : cveModel.highRiskOps,
    attackerModel: fileModel.attackerModel || cveModel.attackerModel,
    priorCves: cveModel.priorCves,
    cveDescriptions: cveModel.cveDescriptions,
    generatedAt: cveModel.generatedAt,
    crownJewels: fileModel.crownJewels?.length ? fileModel.crownJewels : (cveModel as any).crownJewels,
  };
}

function fileModelToThreatModel(fm: ThreatModelFile): ThreatModel {
  return {
    sliceFocus: fm.sliceFocus || 'Authorization and input validation',
    entryPoints: fm.entryPoints || [],
    trustBoundaries: fm.trustBoundaries || [],
    highRiskOps: fm.highRiskOps || ['deserialization', 'authz checks', 'parsing untrusted input'],
    attackerModel: fm.attackerModel || 'remote-unauthenticated',
    priorCves: [],
    cveDescriptions: [],
    generatedAt: Date.now(),
    crownJewels: fm.crownJewels,
  };
}

/**
 * Save threat model to threat-model.json in workspace root.
 */
export function saveThreatModelToFile(workspaceRoot: string, model: ThreatModel): boolean {
  const filePath = path.join(workspaceRoot, 'threat-model.json');
  const toSave: ThreatModelFile = {
    sliceFocus: model.sliceFocus,
    entryPoints: model.entryPoints,
    trustBoundaries: model.trustBoundaries,
    highRiskOps: model.highRiskOps,
    attackerModel: model.attackerModel,
    source: 'cve-derived',
  };

  try {
    fs.writeFileSync(filePath, JSON.stringify(toSave, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}
