/**
 * Mastra Instance - Centralized AI orchestration with memory management
 * 
 * Provides unified model routing, agent framework, and memory management
 */

// Optional Mastra imports - will fail gracefully if packages not installed
let Mastra: any = null;
try {
  Mastra = require('@mastra/core/mastra').Mastra;
} catch (error) {
  console.warn('Mastra core not available:', error);
}

import * as path from 'path';
import * as vscode from 'vscode';

// Try to load LibSQLStore, but make it optional
// Direct require works: @mastra/libsql is in webpack externals, so it won't be bundled
let LibSQLStore: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  LibSQLStore = require('@mastra/libsql').LibSQLStore;
} catch (error) {
  console.warn('LibSQLStore not available:', error);
}

let mastraInstance: any = null;

/**
 * Get or create Mastra instance with disk-based storage (if available)
 */
export function getMastra(context: vscode.ExtensionContext): any {
  if (!Mastra) {
    throw new Error('Mastra packages not installed. Run: npm install @mastra/core');
  }

  if (mastraInstance) {
    return mastraInstance;
  }

  const config: any = {};

  // Try to use LibSQL storage if available
  if (LibSQLStore) {
    try {
      const storagePath = path.join(
        context.globalStorageUri.fsPath,
        'ciphermate-memory.db'
      );
      config.storage = new LibSQLStore({
        url: `file:${storagePath}`, // Disk storage, not memory
      });
      console.log('Mastra: Using LibSQL disk storage');
    } catch (error) {
      console.warn('Mastra: Failed to initialize LibSQL storage, using in-memory:', error);
      // Continue without storage - Mastra will use in-memory fallback
    }
  } else {
    console.warn('Mastra: LibSQL not available, using in-memory storage');
  }

  mastraInstance = new Mastra(config);
  return mastraInstance;
}

/**
 * Reset Mastra instance (useful for testing or reconfiguration)
 */
export function resetMastra(): void {
  mastraInstance = null;
}
