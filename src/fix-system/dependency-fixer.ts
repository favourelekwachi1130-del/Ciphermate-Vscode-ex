/**
 * Dependency Fixer - One-Click SCA AutoFix
 *
 * Generates fixes for vulnerable dependencies by updating package.json,
 * requirements.txt, and other dependency files to patched versions.
 * Replaces: Snyk, GitHub Advanced Security for dependency fixes.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Vulnerability } from '../scanners/types';
import { RuleBasedFix } from './rule-based-fixer';

export class DependencyFixer {
  /**
   * Generate a fix for a dependency vulnerability (SCA)
   * Returns null if no fix can be generated
   */
  public generateFix(vulnerability: Vulnerability): RuleBasedFix | null {
    if (vulnerability.type !== 'dependency-vulnerability') {
      return null;
    }

    const component = vulnerability.metadata?.component;
    const currentVersion = vulnerability.metadata?.version;
    const fixedVersion =
      vulnerability.metadata?.fixedVersion ||
      this.parseFixedVersionFromFix(vulnerability.fix);

    if (!component || !fixedVersion || !vulnerability.file) {
      return null;
    }

    const fileName = path.basename(vulnerability.file).toLowerCase();

    if (fileName === 'package.json') {
      return this.fixNpmDependency(vulnerability.file, component, currentVersion, fixedVersion);
    }

    if (fileName === 'requirements.txt' || fileName === 'requirements-dev.txt') {
      return this.fixPythonDependency(vulnerability.file, component, currentVersion, fixedVersion);
    }

    // Pipfile, Cargo.toml, go.mod, pom.xml - extend as needed
    return null;
  }

  private parseFixedVersionFromFix(fix: string | undefined): string | null {
    if (!fix || typeof fix !== 'string') return null;
    // "Upgrade to 4.17.21 or higher" -> "4.17.21"
    const match = fix.match(/(\d+\.\d+\.\d+(?:\.\d+)?(-[a-zA-Z0-9.]+)?)/);
    return match ? match[1] : null;
  }

  private fixNpmDependency(
    filePath: string,
    component: string,
    _currentVersion: string,
    fixedVersion: string
  ): RuleBasedFix | null {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const pkg = JSON.parse(content);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const depKey = Object.keys(deps).find(
        (k) => k.toLowerCase() === component.toLowerCase()
      );
      if (!depKey || !deps[depKey]) return null;

      const oldValue = deps[depKey];
      // Preserve range prefix (^, ~) if present for npm convention
      const prefix = /^[\^~]/.test(oldValue) ? oldValue.charAt(0) : '';
      const newValue = `${prefix}${fixedVersion}`;

      // Find the exact line in the file (handles various formatting)
      const lines = content.split('\n');
      let originalLine = '';
      let fixedLine = '';

      for (const line of lines) {
        if (line.includes(`"${depKey}"`) && line.includes(oldValue)) {
          originalLine = line;
          // Replace the version - handle "version" or 'version'
          fixedLine = line.replace(`"${oldValue}"`, `"${newValue}"`)
            .replace(`'${oldValue}'`, `'${newValue}'`);
          break;
        }
      }

      if (!originalLine) {
        originalLine = `"${depKey}": "${oldValue}"`;
        fixedLine = `"${depKey}": "${newValue}"`;
        if (!content.includes(originalLine)) return null;
      }

      return {
        originalCode: originalLine,
        fixedCode: fixedLine,
        explanation: `Upgrade ${component} to ${fixedVersion} to resolve known vulnerabilities. Run \`npm install\` after applying.`,
        confidence: 0.95,
        securityImprovements: [
          `Patches known CVEs in ${component}`,
          'Follow npm semver for safe upgrades',
        ],
        testingNotes: 'Run `npm install` then `npm test` to verify.',
      };
    } catch {
      return null;
    }
  }

  private fixPythonDependency(
    filePath: string,
    component: string,
    _currentVersion: string,
    fixedVersion: string
  ): RuleBasedFix | null {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const componentLower = component.toLowerCase();

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || !trimmed) continue;

        // package==1.2.3 or package>=1.2.3 etc.
        const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*([=<>!~]+)\s*(.+)$/);
        if (match) {
          const [pkg, op, ver] = match.slice(1);
          if (pkg.toLowerCase() === componentLower) {
            const newLine = `${pkg}==${fixedVersion}`;
            return {
              originalCode: line,
              fixedCode: newLine,
              explanation: `Upgrade ${component} to ${fixedVersion} to resolve known vulnerabilities. Run \`pip install -r ${path.basename(filePath)}\` after applying.`,
              confidence: 0.9,
              securityImprovements: [`Patches known CVEs in ${component}`],
              testingNotes: 'Run pip install then tests to verify.',
            };
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }
}

let _instance: DependencyFixer | null = null;

export function getDependencyFixer(): DependencyFixer {
  if (!_instance) {
    _instance = new DependencyFixer();
  }
  return _instance;
}
