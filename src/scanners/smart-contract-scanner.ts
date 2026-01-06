/**
 * Smart Contract Security Scanner
 * Ported from CipherMate Core - Simplified for VS Code Extension
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BaseScanner } from './base-scanner';
import { ScanResult, Vulnerability, Severity } from './types';

interface ParsedContract {
  name: string;
  source: string;
  contracts: ContractDefinition[];
}

interface ContractDefinition {
  name: string;
  functions: FunctionDefinition[];
  lineStart: number;
  lineEnd: number;
}

interface FunctionDefinition {
  name: string;
  visibility: 'public' | 'private' | 'internal' | 'external';
  stateMutability: 'pure' | 'view' | 'payable' | 'nonpayable';
  body?: string;
  lineStart: number;
  lineEnd: number;
}

export class SmartContractScanner extends BaseScanner {
  getName(): string {
    return 'smart-contract-scanner';
  }

  getDescription(): string {
    return 'Scans Solidity smart contracts for security vulnerabilities (reentrancy, access control, etc.)';
  }

  async isAvailable(): Promise<boolean> {
    // Always available - uses regex-based pattern matching
    return true;
  }

  async scan(): Promise<ScanResult> {
    const startTime = Date.now();
    const vulnerabilities: Vulnerability[] = [];

    try {
      // Find all Solidity files
      const solidityFiles = await vscode.workspace.findFiles(
        '**/*.sol',
        '**/node_modules/**,**/lib/**,**/test/**,**/tests/**'
      );

      if (solidityFiles.length === 0) {
        return {
          scanner: this.getName(),
          success: true,
          vulnerabilities: [],
          summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          duration: Date.now() - startTime,
          timestamp: new Date(),
        };
      }

      // Scan each Solidity file
      for (const file of solidityFiles) {
        const fileVulns = await this.scanSolidityFile(file.fsPath);
        vulnerabilities.push(...fileVulns);
      }

      return {
        scanner: this.getName(),
        success: true,
        vulnerabilities,
        summary: this.calculateSummary(vulnerabilities),
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error: any) {
      return {
        scanner: this.getName(),
        success: false,
        vulnerabilities: [],
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        duration: Date.now() - startTime,
        timestamp: new Date(),
        error: error.message,
      };
    }
  }

  private async scanSolidityFile(filePath: string): Promise<Vulnerability[]> {
    const vulnerabilities: Vulnerability[] = [];

    try {
      const source = fs.readFileSync(filePath, 'utf-8');
      const parsed = this.parseContract(source, path.basename(filePath));

      // Run vulnerability detectors
      vulnerabilities.push(...this.detectReentrancy(parsed, filePath));
      vulnerabilities.push(...this.detectAccessControl(parsed, filePath));
      vulnerabilities.push(...this.detectUncheckedCalls(parsed, filePath));
      vulnerabilities.push(...this.detectTimestampDependence(parsed, filePath));
      vulnerabilities.push(...this.detectWeakRandomness(parsed, filePath));
      vulnerabilities.push(...this.detectIntegerOverflow(parsed, filePath));
    } catch (error: any) {
      console.error(`Error scanning ${filePath}:`, error);
    }

    return vulnerabilities;
  }

  private parseContract(source: string, name: string): ParsedContract {
    const contracts: ContractDefinition[] = [];
    
    // Extract contract definitions
    const contractRegex = /\b(contract|interface|library)\s+(\w+)[^{]*\{/g;
    let match;
    let lineNumber = 1;

    while ((match = contractRegex.exec(source)) !== null) {
      const contractName = match[2];
      const contractStart = match.index;
      const contractEnd = this.findMatchingBrace(source, contractStart);
      
      // Count lines
      const linesBefore = source.substring(0, contractStart).split('\n').length;
      const linesAfter = source.substring(0, contractEnd).split('\n').length;

      const functions = this.extractFunctions(source.substring(contractStart, contractEnd), linesBefore);

      contracts.push({
        name: contractName,
        functions,
        lineStart: linesBefore,
        lineEnd: linesAfter,
      });
    }

    return {
      name,
      source,
      contracts: contracts.length > 0 ? contracts : [{
        name,
        functions: this.extractFunctions(source, 0),
        lineStart: 0,
        lineEnd: source.split('\n').length,
      }],
    };
  }

  private extractFunctions(contractSource: string, offset: number): FunctionDefinition[] {
    const functions: FunctionDefinition[] = [];
    const functionRegex = /function\s+(\w+)\s*\([^)]*\)\s*(public|private|internal|external)?\s*(view|pure|payable|nonpayable)?[^{]*\{/g;
    let match;

    while ((match = functionRegex.exec(contractSource)) !== null) {
      const funcName = match[1];
      const visibility = (match[2] || 'public') as FunctionDefinition['visibility'];
      const stateMutability = (match[3] || 'nonpayable') as FunctionDefinition['stateMutability'];
      const funcStart = match.index;
      const funcEnd = this.findMatchingBrace(contractSource, funcStart);
      const funcBody = contractSource.substring(funcStart, funcEnd);
      
      const linesBefore = contractSource.substring(0, funcStart).split('\n').length;
      const linesAfter = contractSource.substring(0, funcEnd).split('\n').length;

      functions.push({
        name: funcName,
        visibility,
        stateMutability,
        body: funcBody,
        lineStart: offset + linesBefore,
        lineEnd: offset + linesAfter,
      });
    }

    return functions;
  }

  private findMatchingBrace(source: string, start: number): number {
    let depth = 0;
    let i = start;
    
    while (i < source.length) {
      if (source[i] === '{') depth++;
      if (source[i] === '}') {
        depth--;
        if (depth === 0) return i;
      }
      i++;
    }
    
    return source.length;
  }

  // Vulnerability Detectors

  private detectReentrancy(parsed: ParsedContract, filePath: string): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];

    for (const contract of parsed.contracts) {
      for (const func of contract.functions) {
        if (func.stateMutability === 'view' || func.stateMutability === 'pure') {
          continue;
        }

        const body = func.body || '';
        
        // Check for external calls before state changes
        const externalCallPatterns = [
          /\.call\s*\{[^}]*value\s*:/g,
          /\.call\s*\(/g,
          /\.send\s*\(/g,
          /\.transfer\s*\(/g,
        ];

        const stateChangePatterns = [
          /\b(\w+)\s*=\s*[^=]/g,
          /\b(\w+)\s*\+=\s*/g,
          /\b(\w+)\s*-=\s*/g,
        ];

        // Check if function has reentrancy guard
        const hasGuard = /nonReentrant|ReentrancyGuard|mutex|locked/i.test(body);

        if (hasGuard) {
          continue;
        }

        // Find external calls
        for (const callPattern of externalCallPatterns) {
          const callMatches = [...body.matchAll(callPattern)];
          
          for (const callMatch of callMatches) {
            const callPos = callMatch.index || 0;
            
            // Check if state change happens after this call
            const afterCall = body.substring(callPos);
            const hasStateChange = stateChangePatterns.some(p => p.test(afterCall));

            if (hasStateChange) {
              vulnerabilities.push({
                id: this.generateVulnId('reentrancy', filePath, func.lineStart),
                type: 'reentrancy',
                severity: 'critical',
                title: `Reentrancy vulnerability in ${contract.name}.${func.name}`,
                description: `External call before state change in ${func.name}. An attacker could re-enter the function before state is updated.`,
                file: filePath,
                line: func.lineStart,
                cwe: ['CWE-841'],
                fix: `Use ReentrancyGuard modifier or update state before external calls.`,
                references: ['https://swcregistry.io/docs/SWC-107'],
                metadata: {
                  contract: contract.name,
                  function: func.name,
                  swcId: 'SWC-107',
                },
              });
              break; // Only report once per function
            }
          }
        }
      }
    }

    return vulnerabilities;
  }

  private detectAccessControl(parsed: ParsedContract, filePath: string): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];

    for (const contract of parsed.contracts) {
      for (const func of contract.functions) {
        if (func.visibility === 'public' || func.visibility === 'external') {
          const body = func.body || '';
          
          // Check for sensitive operations without access control
          const sensitivePatterns = [
            /selfdestruct\s*\(/i,
            /\.transfer\s*\(/g,
            /\.send\s*\(/g,
            /delete\s+\w+/g,
          ];

          const hasAccessControl = /onlyOwner|onlyRole|require\(.*msg\.sender|modifier/i.test(body);

          if (!hasAccessControl) {
            for (const pattern of sensitivePatterns) {
              if (pattern.test(body)) {
                vulnerabilities.push({
                  id: this.generateVulnId('access-control', filePath, func.lineStart),
                  type: 'access-control',
                  severity: 'high',
                  title: `Missing access control in ${contract.name}.${func.name}`,
                  description: `Public function ${func.name} performs sensitive operations without access control checks.`,
                  file: filePath,
                  line: func.lineStart,
                  cwe: ['CWE-284'],
                  fix: `Add access control modifier (e.g., onlyOwner) or require() statement.`,
                  references: ['https://swcregistry.io/docs/SWC-105'],
                  metadata: {
                    contract: contract.name,
                    function: func.name,
                    swcId: 'SWC-105',
                  },
                });
                break;
              }
            }
          }
        }
      }
    }

    return vulnerabilities;
  }

  private detectUncheckedCalls(parsed: ParsedContract, filePath: string): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];

    for (const contract of parsed.contracts) {
      for (const func of contract.functions) {
        const body = func.body || '';
        
        // Find unchecked external calls
        const uncheckedPatterns = [
          /(\w+)\.call\s*\([^)]*\)\s*;/g,
          /(\w+)\.send\s*\([^)]*\)\s*;/g,
        ];

        for (const pattern of uncheckedPatterns) {
          const matches = [...body.matchAll(pattern)];
          
          for (const match of matches) {
            const callLine = func.lineStart + body.substring(0, match.index || 0).split('\n').length - 1;
            
            vulnerabilities.push({
              id: this.generateVulnId('unchecked-call', filePath, callLine),
              type: 'unchecked-call',
              severity: 'medium',
              title: `Unchecked external call in ${contract.name}.${func.name}`,
              description: `External call return value is not checked. Failed calls will silently fail.`,
              file: filePath,
              line: callLine,
              cwe: ['CWE-252'],
              fix: `Check return value: require(${match[1]}.call(...), "Call failed");`,
              references: ['https://swcregistry.io/docs/SWC-104'],
              metadata: {
                contract: contract.name,
                function: func.name,
                swcId: 'SWC-104',
              },
            });
          }
        }
      }
    }

    return vulnerabilities;
  }

  private detectTimestampDependence(parsed: ParsedContract, filePath: string): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];

    for (const contract of parsed.contracts) {
      for (const func of contract.functions) {
        const body = func.body || '';
        
        // Check for block.timestamp usage
        if (/block\.timestamp|now\b/.test(body)) {
          const line = func.lineStart + body.split('\n').findIndex((l: string) => /block\.timestamp|now\b/.test(l));
          
          vulnerabilities.push({
            id: this.generateVulnId('timestamp-dependence', filePath, line),
            type: 'timestamp-dependence',
            severity: 'medium',
            title: `Timestamp dependence in ${contract.name}.${func.name}`,
            description: `Using block.timestamp for critical logic. Miners can manipulate timestamps within ~15 seconds.`,
            file: filePath,
            line,
            cwe: ['CWE-367'],
            fix: `Use block.number for time-based logic or accept timestamp manipulation.`,
            references: ['https://swcregistry.io/docs/SWC-116'],
            metadata: {
              contract: contract.name,
              function: func.name,
              swcId: 'SWC-116',
            },
          });
        }
      }
    }

    return vulnerabilities;
  }

  private detectWeakRandomness(parsed: ParsedContract, filePath: string): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];

    for (const contract of parsed.contracts) {
      for (const func of contract.functions) {
        const body = func.body || '';
        
        // Check for weak randomness sources
        if (/block\.timestamp|block\.hash|block\.difficulty|block\.number/.test(body)) {
          const line = func.lineStart + body.split('\n').findIndex((l: string) => 
            /block\.timestamp|block\.hash|block\.difficulty|block\.number/.test(l)
          );
          
          vulnerabilities.push({
            id: this.generateVulnId('weak-randomness', filePath, line),
            type: 'weak-randomness',
            severity: 'high',
            title: `Weak randomness source in ${contract.name}.${func.name}`,
            description: `Using predictable block properties for randomness. Attackers can predict or manipulate these values.`,
            file: filePath,
            line,
            cwe: ['CWE-330'],
            fix: `Use Chainlink VRF or commit-reveal scheme for secure randomness.`,
            references: ['https://swcregistry.io/docs/SWC-120'],
            metadata: {
              contract: contract.name,
              function: func.name,
              swcId: 'SWC-120',
            },
          });
        }
      }
    }

    return vulnerabilities;
  }

  private detectIntegerOverflow(parsed: ParsedContract, filePath: string): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];

    for (const contract of parsed.contracts) {
      for (const func of contract.functions) {
        const body = func.body || '';
        
        // Check for arithmetic operations without SafeMath (Solidity < 0.8.0)
        const arithmeticPatterns = [
          /(\w+)\s*\+\s*(\w+)/g,
          /(\w+)\s*-\s*(\w+)/g,
          /(\w+)\s*\*\s*(\w+)/g,
        ];

        // Check if using Solidity 0.8+ (has built-in overflow protection)
        const pragmaMatch = parsed.source.match(/pragma\s+solidity\s+([\^>=<]+)?\s*([\d.]+)/);
        const solVersion = pragmaMatch ? parseFloat(pragmaMatch[2]) : 0.8;

        if (solVersion < 0.8) {
          for (const pattern of arithmeticPatterns) {
            const matches = [...body.matchAll(pattern)];
            
            for (const match of matches) {
              const line = func.lineStart + body.substring(0, match.index || 0).split('\n').length - 1;
              
              // Check if SafeMath is used
              if (!/SafeMath|\.add\(|\.sub\(|\.mul\(/.test(body)) {
                vulnerabilities.push({
                  id: this.generateVulnId('integer-overflow', filePath, line),
                  type: 'integer-overflow',
                  severity: 'high',
                  title: `Potential integer overflow in ${contract.name}.${func.name}`,
                  description: `Arithmetic operation without overflow protection. Use SafeMath library or upgrade to Solidity 0.8+.`,
                  file: filePath,
                  line,
                  cwe: ['CWE-190'],
                  fix: `Use SafeMath library or upgrade to Solidity 0.8+ for built-in overflow protection.`,
                  references: ['https://swcregistry.io/docs/SWC-101'],
                  metadata: {
                    contract: contract.name,
                    function: func.name,
                    swcId: 'SWC-101',
                  },
                });
                break;
              }
            }
          }
        }
      }
    }

    return vulnerabilities;
  }
}

