/**
 * CipherMate Hooks API — Lifecycle extension points (ECC-style)
 *
 * Defines hook points: before_scan, after_scan, before_fix_apply, after_fix_apply,
 * on_findings_loaded. User config lists VS Code commands to run at each hook.
 * Enables "run linter after fix", "notify on critical", etc.
 */

import * as vscode from 'vscode';

export type HookName = 'before_scan' | 'after_scan' | 'before_fix_apply' | 'after_fix_apply' | 'on_findings_loaded';

export interface HookPayload {
  [key: string]: unknown;
}

const HOOK_CONFIG_KEYS: Record<HookName, string> = {
  before_scan: 'hooks.before_scan',
  after_scan: 'hooks.after_scan',
  before_fix_apply: 'hooks.before_fix_apply',
  after_fix_apply: 'hooks.after_fix_apply',
  on_findings_loaded: 'hooks.on_findings_loaded',
};

/**
 * Get the list of command IDs to run for a hook. Config: ciphermate.hooks.<hookName> = string[].
 */
export function getHookCommands(hookName: HookName): string[] {
  try {
    const config = vscode.workspace.getConfiguration('ciphermate');
    const key = HOOK_CONFIG_KEYS[hookName];
    const value = config.get<string | string[]>(key);
    if (Array.isArray(value)) return value.filter((c) => typeof c === 'string');
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return [];
  } catch {
    return [];
  }
}

/**
 * Run all commands registered for a hook. Payload is passed for future use (e.g. findings count).
 * Commands are executed in order; errors are logged but do not block.
 */
export async function runHook(hookName: HookName, payload?: HookPayload): Promise<void> {
  const commands = getHookCommands(hookName);
  for (const commandId of commands) {
    try {
      await vscode.commands.executeCommand(commandId, payload);
    } catch (e) {
      console.warn(`CipherMate hook ${hookName} command "${commandId}" failed:`, e);
    }
  }
}
