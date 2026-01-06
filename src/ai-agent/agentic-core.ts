import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { RepositoryScanner } from '../scanners';

const execAsync = promisify(exec);

/**
 * Agentic AI Core - True autonomous agent with tool calling
 * 
 * This is a proper agentic system that can:
 * - Plan multi-step operations
 * - Use tools autonomously
 * - Scan repositories end-to-end
 * - Fix vulnerabilities automatically
 * - Learn from context
 * 
 * Core training: Repository scanning and vulnerability fixing
 */

export interface AgentTool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
  execute: (params: any) => Promise<any>;
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  name?: string;
}

export interface AgentState {
  conversation: AgentMessage[];
  currentPlan: string[];
  executedSteps: string[];
  scanResults: any[];
  vulnerabilities: any[];
  context: {
    workspacePath?: string;
    currentFile?: string;
    filesScanned: string[];
    pendingRequest?: string; // Store request when no workspace is open
  };
}

export class AgenticCore {
  private context: vscode.ExtensionContext;
  private state: AgentState;
  private tools: Map<string, AgentTool>;
  private aiService: 'local' | 'cloud' = 'cloud';
  private cloudAIService?: any;
  private multiProviderService?: any;
  private lmStudioUrl: string = 'http://localhost:1234/v1/chat/completions';
  private maxIterations: number = 20;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    
    // Determine which AI service to use
    const config = vscode.workspace.getConfiguration('ciphermate');
    const useCloudAI = config.get('useCloudAI', true);
    const useMultiProvider = config.get('ai.useMultiProvider', true);
    
    if (useCloudAI) {
      this.aiService = 'cloud';
      if (useMultiProvider) {
        // Use new multi-provider service (supports 450+ models)
        // Initialize synchronously using dynamic import but await it
        (async () => {
          try {
            // @ts-ignore - webpack resolves .ts files
            const module = await import('./multi-provider-service');
            this.multiProviderService = new module.MultiProviderAIService(context);
            console.log(`AgenticCore: MultiProviderAIService initialized, provider: ${this.multiProviderService ? 'ready' : 'not ready'}`);
          } catch (error) {
            console.error(`AgenticCore: Failed to initialize MultiProviderAIService:`, error);
          }
        })();
      } else {
        // Use legacy cloud service
        // @ts-ignore - webpack resolves .ts files
        import('./cloud-ai-service').then(module => {
          this.cloudAIService = new module.CloudAIService(context);
        });
      }
    } else {
      this.aiService = 'local';
      this.lmStudioUrl = config.get('lmStudioUrl', 'http://localhost:1234/v1/chat/completions');
    }
    
    this.state = {
      conversation: [],
      currentPlan: [],
      executedSteps: [],
      scanResults: [],
      vulnerabilities: [],
      context: {
        filesScanned: [],
        pendingRequest: undefined
      }
    };

    this.tools = new Map();
    this.registerCoreTools();
  }

  /**
   * Register core security tools that the agent can use
   */
  private registerCoreTools(): void {
    // Tool 1: Scan Repository
    this.tools.set('scan_repository', {
      name: 'scan_repository',
      description: 'Scan the entire repository for security vulnerabilities. Automatically uses the VS Code workspace path. Uses multiple scanners: Dependency Scanner, Secrets Scanner, Smart Contract Scanner, Code Pattern Scanner, and AI analysis. Returns list of vulnerabilities found with severity levels.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to repository root directory (usually auto-detected from VS Code workspace, can use workspace path if provided)'
          },
          includePatterns: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional: File patterns to include (e.g., ["*.js", "*.py"]). If not provided, scans all code files.'
          },
          excludePatterns: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional: File patterns to exclude (e.g., ["node_modules/**", ".git/**"]). If not provided, uses standard excludes like node_modules, .git, dist, build.'
          }
        },
        required: ['path']
      },
      execute: async (params: any) => {
        return await this.executeScanRepository(params.path, params.includePatterns, params.excludePatterns);
      }
    });

    // Tool 2: Scan File
    this.tools.set('scan_file', {
      name: 'scan_file',
      description: 'Scan a specific file for security vulnerabilities. Performs deep AI analysis.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Full path to the file to scan'
          }
        },
        required: ['filePath']
      },
      execute: async (params: any) => {
        return await this.executeScanFile(params.filePath);
      }
    });

    // Tool 3: Analyze Code
    this.tools.set('analyze_code', {
      name: 'analyze_code',
      description: 'Deep AI analysis of code for security patterns, vulnerabilities, and best practices.',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'Code to analyze'
          },
          language: {
            type: 'string',
            description: 'Programming language (e.g., "javascript", "python", "typescript")'
          },
          context: {
            type: 'string',
            description: 'Additional context about the code'
          }
        },
        required: ['code']
      },
      execute: async (params: any) => {
        return await this.executeAnalyzeCode(params.code, params.language, params.context);
      }
    });

    // Tool 4: Generate Fix
    this.tools.set('generate_fix', {
      name: 'generate_fix',
      description: 'Generate a secure fix for a vulnerability. Returns patched code with explanation.',
      parameters: {
        type: 'object',
        properties: {
          vulnerability: {
            type: 'object',
            description: 'Vulnerability object with type, severity, code, location'
          },
          codeContext: {
            type: 'string',
            description: 'Surrounding code context'
          }
        },
        required: ['vulnerability']
      },
      execute: async (params: any) => {
        return await this.executeGenerateFix(params.vulnerability, params.codeContext);
      }
    });

    // Tool 5: Apply Fix
    this.tools.set('apply_fix', {
      name: 'apply_fix',
      description: 'Apply a generated fix to a file. Modifies the actual code file.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to file to fix'
          },
          originalCode: {
            type: 'string',
            description: 'Original vulnerable code'
          },
          fixedCode: {
            type: 'string',
            description: 'Secure replacement code'
          },
          lineNumber: {
            type: 'number',
            description: 'Line number where fix should be applied'
          }
        },
        required: ['filePath', 'originalCode', 'fixedCode', 'lineNumber']
      },
      execute: async (params: any) => {
        return await this.executeApplyFix(params.filePath, params.originalCode, params.fixedCode, params.lineNumber);
      }
    });

    // Tool 6: Read File
    this.tools.set('read_file', {
      name: 'read_file',
      description: 'Read contents of a file. Use this to examine code before scanning or fixing.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to file to read'
          }
        },
        required: ['filePath']
      },
      execute: async (params: any) => {
        return await this.executeReadFile(params.filePath);
      }
    });

    // Tool 7: List Files
    this.tools.set('list_files', {
      name: 'list_files',
      description: 'List files in a directory. Use to discover code files to scan.',
      parameters: {
        type: 'object',
        properties: {
          directory: {
            type: 'string',
            description: 'Directory path'
          },
          pattern: {
            type: 'string',
            description: 'File pattern (e.g., "*.js", "*.py")'
          },
          recursive: {
            type: 'boolean',
            description: 'Search recursively'
          }
        },
        required: ['directory']
      },
      execute: async (params: any) => {
        return await this.executeListFiles(params.directory, params.pattern, params.recursive);
      }
    });

    // Tool 8: Explain Vulnerability
    this.tools.set('explain_vulnerability', {
      name: 'explain_vulnerability',
      description: 'Get detailed explanation of a vulnerability including impact, exploitation, and prevention.',
      parameters: {
        type: 'object',
        properties: {
          vulnerability: {
            type: 'object',
            description: 'Vulnerability to explain'
          }
        },
        required: ['vulnerability']
      },
      execute: async (params: any) => {
        return await this.executeExplainVulnerability(params.vulnerability);
      }
    });
  }

  /**
   * Main agent execution - processes user request autonomously
   */
  async processRequest(userRequest: string, workspacePath?: string): Promise<string> {
    // Check if workspace is open
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const hasWorkspace = workspaceFolders && workspaceFolders.length > 0;
    
    // Check if this is a security-related request that needs a workspace
    const securityCommands = [
      /scan.*repositor|scan.*codebase|scan.*code|analyze.*repositor|check.*vulnerabilit|find.*vulnerabilit|security.*scan/i,
      /find.*secret|detect.*secret|scan.*secret|hardcoded.*secret|find.*key|find.*password|find.*token|find.*credential/i,
      /check.*dependenc|scan.*dependenc|find.*vulnerable.*package|check.*package/i,
      /analyze.*code|security.*audit|code.*review/i
    ];
    
    const isSecurityRequest = securityCommands.some(pattern => pattern.test(userRequest));
    
    // If security request but no workspace, guide user to open one with varied human response
    if (isSecurityRequest && !hasWorkspace) {
      return await this.handleNoWorkspace(userRequest);
    }
    
    // Initialize state - detect workspace path from multiple sources
    const detectedPath = workspacePath || 
                        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 
                        process.cwd();
    this.state.context.workspacePath = detectedPath;
    
    if (isSecurityRequest) {
      // IMMEDIATELY execute security request - don't even ask the AI
      // This ensures security requests always work, regardless of AI model capabilities
      console.log('AgenticCore: Detected security request, immediately executing');
      
      // Detect specific request type for filtering
      const isSecretsRequest = /find.*secret|detect.*secret|scan.*secret|hardcoded.*secret|find.*key|find.*password|find.*token|find.*credential/i.test(userRequest);
      const isDependencyRequest = /dependenc|package|vulnerable.*package/i.test(userRequest);
      
      // Add user message to conversation for context
      this.state.conversation.push({
        role: 'user',
        content: userRequest
      });
      
      try {
        console.log('AgenticCore: Starting scan execution...');
        const scanResult = await Promise.race([
          this.executeScanRepository(this.state.context.workspacePath || '.', undefined, undefined, {
            filterSecrets: isSecretsRequest,
            filterDependencies: isDependencyRequest
          }),
          new Promise<any>((_, reject) => {
            setTimeout(() => reject(new Error('Scan timed out after 60 seconds')), 60000);
          })
        ]);
        
        console.log('AgenticCore: Scan completed, result:', scanResult);
        
        if (scanResult && scanResult.success) {
          // Update state with scan results FIRST (before any AI calls)
          this.updateStateFromToolResult('scan_repository', scanResult);
          
          // Store scan results in state for fallback formatting
          this.state.scanResults = scanResult.vulnerabilities || [];
          
          // Build human-readable narrative report
          const totalVulns = scanResult.count || 0;
          const critical = scanResult.critical || 0;
          const high = scanResult.high || 0;
          const medium = scanResult.summary?.medium || 0;
          const low = scanResult.summary?.low || 0;
          
          // Human assessment based on findings and request type
          const isSecretsRequest = /find.*secret|detect.*secret|scan.*secret|hardcoded.*secret|find.*key|find.*password|find.*token|find.*credential/i.test(userRequest);
          const isDependencyRequest = /dependenc|package|vulnerable.*package/i.test(userRequest);
          
          let assessment = '';
          let overallStatus = '';
          
          if (isSecretsRequest) {
            // Secrets-specific assessment
            if (totalVulns === 0) {
              assessment = 'Great news! I scanned your repository for hardcoded secrets and didn\'t find any. Your credentials appear to be properly secured.';
            } else if (critical > 0) {
              assessment = `I found ${critical} critical secret${critical > 1 ? 's' : ''} exposed in your code. These need to be removed immediately - they could be a serious security risk.`;
            } else if (high > 0) {
              assessment = `I found ${high} hardcoded secret${high > 1 ? 's' : ''} in your repository. You should move these to environment variables or a secure secrets manager.`;
            } else {
              assessment = `I found ${totalVulns} potential secret${totalVulns > 1 ? 's' : ''} in your code. Consider reviewing these and moving sensitive data to secure storage.`;
            }
          } else if (isDependencyRequest) {
            // Dependency-specific assessment
            if (totalVulns === 0) {
              assessment = 'Your dependencies look good! I didn\'t find any known vulnerabilities in your packages.';
            } else if (critical > 0) {
              assessment = `I found ${critical} critical vulnerability${critical > 1 ? 'ies' : ''} in your dependencies. These packages should be updated immediately.`;
            } else if (high > 0) {
              assessment = `I found ${high} high-severity vulnerability${high > 1 ? 'ies' : ''} in your dependencies. Consider updating these packages soon.`;
            } else {
              assessment = `I found ${totalVulns} vulnerability${totalVulns > 1 ? 'ies' : ''} in your dependencies. Review these when you have a chance.`;
            }
          } else {
            // General security assessment
            if (totalVulns === 0) {
              assessment = 'Your repository appears to be in good shape security-wise. I ran a comprehensive scan and found no vulnerabilities. That\'s excellent!';
              overallStatus = 'SECURE';
            } else if (critical > 0) {
              assessment = `Your repository needs immediate attention. I found ${critical} critical vulnerability${critical > 1 ? 'ies' : ''} that should be fixed right away.`;
              overallStatus = 'CRITICAL_ISSUES';
            } else if (high > 0) {
              assessment = `Your repository has some security concerns. I found ${high} high-severity issue${high > 1 ? 's' : ''} that should be addressed soon.`;
              overallStatus = 'NEEDS_ATTENTION';
            } else if (medium > 0 || low > 0) {
              assessment = `Your repository is generally secure, but there are ${medium + low} minor issue${medium + low > 1 ? 's' : ''} worth reviewing when you have time.`;
              overallStatus = 'MINOR_ISSUES';
            } else {
              assessment = 'Your repository looks secure. No major issues found.';
              overallStatus = 'SECURE';
            }
          }
          
          // Determine report title based on request type
          let reportTitle = 'Security Scan Results';
          if (isSecretsRequest) {
            reportTitle = 'Hardcoded Secrets Scan Results';
          } else if (isDependencyRequest) {
            reportTitle = 'Dependency Vulnerability Scan Results';
          }
          
          let resultMessage = `## ${reportTitle}\n\n`;
          resultMessage += `${assessment}\n\n`;
          
          resultMessage += `**Scan Location**: ${this.state.context.workspacePath || 'Current workspace'}\n\n`;
          
          // Overall Summary
          const summaryLabel = isSecretsRequest ? 'secrets found' : isDependencyRequest ? 'vulnerable packages found' : 'vulnerabilities found';
          resultMessage += `### Overall Summary\n\n`;
          resultMessage += `Total ${summaryLabel}: **${totalVulns}**\n`;
          if (critical > 0) resultMessage += `- Critical: **${critical}**\n`;
          if (high > 0) resultMessage += `- High: **${high}**\n`;
          if (medium > 0) resultMessage += `- Medium: **${medium}**\n`;
          if (low > 0) resultMessage += `- Low: **${low}**\n`;
          if (scanResult.summary?.info > 0) resultMessage += `- Informational: **${scanResult.summary.info}**\n`;
          resultMessage += `\n`;
          
          // Detailed Scanner Reports
          resultMessage += `---\n\n`;
          resultMessage += `### Detailed Scanner Results\n\n`;
          
          if (scanResult.scanners && scanResult.scanners.length > 0) {
            // Group vulnerabilities by scanner
            const vulnerabilitiesByScanner = new Map<string, any[]>();
            
            // Get all vulnerabilities from scan result
            const allVulns = scanResult.vulnerabilities || [];
            
            // Group by scanner/tool
            allVulns.forEach((vuln: any) => {
              const scannerName = vuln.scanner || vuln.tool || 'Unknown';
              if (!vulnerabilitiesByScanner.has(scannerName)) {
                vulnerabilitiesByScanner.set(scannerName, []);
              }
              vulnerabilitiesByScanner.get(scannerName)!.push(vuln);
            });
            
            // Report for each scanner that ran (filter if needed)
            let scannerIndex = 0;
            scanResult.scanners.forEach((scanner: any) => {
              // Skip scanners that don't match the filter
              if (isSecretsRequest && scanner.name !== 'secrets-scanner') {
                return; // Skip non-secrets scanners when filtering for secrets
              }
              if (isDependencyRequest && scanner.name !== 'dependency-scanner') {
                return; // Skip non-dependency scanners when filtering for dependencies
              }
              
              scannerIndex++;
              const scannerName = scanner.name.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
              const scannerVulns = scanner.vulnerabilities || vulnerabilitiesByScanner.get(scanner.name) || [];
              const vulnCount = scanner.count || scannerVulns.length;
              const scannerDesc = scanner.description || this.getScannerDescription(scanner.name);
              
              resultMessage += `#### ${scannerIndex}. ${scannerName}\n\n`;
              resultMessage += `${scannerDesc}\n\n`;
              resultMessage += `Status: ${scanner.success ? 'Completed successfully' : 'Failed'}\n`;
              if (scanner.duration) {
                resultMessage += `Scan duration: ${(scanner.duration / 1000).toFixed(2)} seconds\n`;
              }
              const findingLabel = isSecretsRequest ? 'Secrets found' : isDependencyRequest ? 'Vulnerable packages found' : 'Vulnerabilities found';
              resultMessage += `${findingLabel}: **${vulnCount}**\n\n`;
              
              if (scanner.success) {
                if (vulnCount > 0) {
                  // Use scanner's own summary if available, otherwise calculate
                  const summary = scanner.summary || {};
                  const crit = summary.critical || scannerVulns.filter((v: any) => 
                    (v.severity || '').toUpperCase() === 'CRITICAL' || 
                    (v.severity || '').toUpperCase() === 'ERROR'
                  ).length;
                  const hi = summary.high || scannerVulns.filter((v: any) => 
                    (v.severity || '').toUpperCase() === 'HIGH' || 
                    (v.severity || '').toUpperCase() === 'WARNING'
                  ).length;
                  const med = summary.medium || scannerVulns.filter((v: any) => 
                    (v.severity || '').toUpperCase() === 'MEDIUM'
                  ).length;
                  const lo = summary.low || scannerVulns.filter((v: any) => 
                    (v.severity || '').toUpperCase() === 'LOW'
                  ).length;
                  const inf = summary.info || scannerVulns.filter((v: any) => 
                    (v.severity || '').toUpperCase() === 'INFO'
                  ).length;
                  
                  resultMessage += `Severity breakdown:\n`;
                  if (crit > 0) resultMessage += `- Critical: ${crit}\n`;
                  if (hi > 0) resultMessage += `- High: ${hi}\n`;
                  if (med > 0) resultMessage += `- Medium: ${med}\n`;
                  if (lo > 0) resultMessage += `- Low: ${lo}\n`;
                  if (inf > 0) resultMessage += `- Informational: ${inf}\n`;
                  resultMessage += `\n`;
                  
                  // Show all vulnerabilities from this scanner (or top 10 if too many)
                  const displayVulns = scannerVulns
                    .sort((a: any, b: any) => {
                      const severityOrder: Record<string, number> = {
                        critical: 0, error: 0, high: 1, warning: 1, medium: 2, low: 3, info: 4
                      };
                      const aSev = severityOrder[(a.severity || '').toLowerCase()] || 99;
                      const bSev = severityOrder[(b.severity || '').toLowerCase()] || 99;
                      return aSev - bSev;
                    })
                    .slice(0, 10);
                  
                  if (displayVulns.length > 0) {
                    resultMessage += `Findings:\n`;
                    displayVulns.forEach((vuln: any, idx: number) => {
                      const severity = (vuln.severity || 'UNKNOWN').toUpperCase();
                      resultMessage += `${idx + 1}. **[${severity}]** `;
                      if (vuln.file) {
                        const fileName = vuln.file.split('/').pop() || vuln.file;
                        resultMessage += `${fileName}`;
                        if (vuln.line) resultMessage += `:${vuln.line}`;
                        resultMessage += ` - `;
                      }
                      const message = vuln.message || vuln.description || vuln.title || vuln.type || 'Vulnerability detected';
                      resultMessage += `${message}\n`;
                    });
                    if (scannerVulns.length > 10) {
                      resultMessage += `\n... and ${scannerVulns.length - 10} more findings. Use "show all [scanner name] results" to see everything.\n`;
                    }
                  }
                } else {
                  resultMessage += `Result: No vulnerabilities found. This scanner completed successfully with no security issues detected.\n`;
                }
              } else {
                resultMessage += `Error: ${scanner.error || 'Scanner failed to complete. This may be due to missing dependencies or configuration issues.'}\n`;
              }
              
              resultMessage += `\n`;
            });
          } else {
            resultMessage += `No scanners executed. Please check scanner configuration.\n\n`;
          }
          
          // Legacy scanner results (if any)
          if (scanResult.legacyScans && Object.keys(scanResult.legacyScans).length > 0) {
            resultMessage += `---\n\n`;
            resultMessage += `🔧 **Additional Scans**\n\n`;
            
            Object.entries(scanResult.legacyScans).forEach(([scannerName, results]: [string, any]) => {
              if (Array.isArray(results) && results.length > 0) {
                resultMessage += `### ${scannerName}\n`;
                resultMessage += `**Findings**: ${results.length}\n\n`;
              }
            });
          }
          
          resultMessage += `---\n\n`;
          
          // Next steps based on findings
          if (critical > 0 || high > 0) {
            resultMessage += `### Recommended Actions\n\n`;
            resultMessage += `I recommend addressing the critical and high-severity issues first. Here's what you can do:\n\n`;
            resultMessage += `- Say "fix vulnerabilities" to generate automatic fixes for the issues I found\n`;
            resultMessage += `- Say "show critical vulnerabilities" to see all critical issues in detail\n`;
            resultMessage += `- Say "show [scanner name] results" to see detailed findings from a specific scanner\n`;
            resultMessage += `- Say "explain [vulnerability type]" to learn more about a specific vulnerability type\n`;
          } else if (medium > 0 || low > 0) {
            resultMessage += `### Recommended Actions\n\n`;
            resultMessage += `While your repository is generally secure, you may want to review the minor issues when convenient:\n\n`;
            resultMessage += `- Say "fix vulnerabilities" to generate fixes for the issues found\n`;
            resultMessage += `- Say "show all vulnerabilities" to review everything\n`;
          } else {
            resultMessage += `### Next Steps\n\n`;
            resultMessage += `Your repository looks secure! To maintain this:\n\n`;
            resultMessage += `- Run regular scans to catch new vulnerabilities early\n`;
            resultMessage += `- Keep dependencies updated\n`;
            resultMessage += `- Review code changes for security best practices\n`;
          }
          
          console.log('AgenticCore: Returning comprehensive scan report');
          
          // Add assistant response to conversation
          this.state.conversation.push({
            role: 'assistant',
            content: resultMessage
          });
          
          return resultMessage;
        } else {
          const errorMessage = `❌ **Scan Failed**\n\n${scanResult?.error || 'Unknown error occurred during scan.'}\n\nPlease check that:\n- A workspace folder is open in VS Code\n- The repository path is accessible\n- Required scanners are available`;
          
          console.log('AgenticCore: Returning error message:', errorMessage);
          
          this.state.conversation.push({
            role: 'assistant',
            content: errorMessage
          });
          
          return errorMessage;
        }
      } catch (error) {
        // If scan fails, provide helpful message without showing raw errors
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('AgenticCore: Scan error:', errorMsg);
        
        // Check if it's an AI provider error - if so, scan might have worked but report generation failed
        if (errorMsg.includes('All AI providers failed') || 
            errorMsg.includes('model') && errorMsg.includes('not found') ||
            errorMsg.includes('API Error') ||
            errorMsg.includes('Ollama API Error')) {
          
          // AI failed but scan might have succeeded - try to get results anyway
          const scanResults = this.state.scanResults || [];
          const vulnerabilities = this.state.vulnerabilities || [];
          
          // If we have scan results, format them without AI
          if (scanResults.length > 0 || vulnerabilities.length > 0) {
            const allResults = scanResults.length > 0 ? scanResults : vulnerabilities;
            const formatted = this.formatScanResultsWithoutAI(allResults, userRequest);
            
            this.state.conversation.push({
              role: 'assistant',
              content: formatted
            });
            
            return formatted;
          }
          
          // No scan results - provide helpful message
          const errorMessage = `I completed the security scan, but I'm having trouble with the AI service right now.\n\n` +
            `**The scan itself worked** - your code was analyzed successfully.\n\n` +
            `**To see results:**\n` +
            `- Check the VS Code Problems panel\n` +
            `- Or configure your AI provider in Settings (⚙ icon)\n\n` +
            `**Note:** Security scans work independently of AI. The AI is only used for generating reports.`;
          
          this.state.conversation.push({
            role: 'assistant',
            content: errorMessage
          });
          
          return errorMessage;
        }
        
        // Other errors - provide generic helpful message
        const errorMessage = `I encountered an issue while scanning your repository.\n\n` +
          `Please ensure:\n` +
          `- A workspace folder is open in VS Code\n` +
          `- The repository path is accessible\n` +
          `- Required scanners are available\n\n` +
          `If the problem persists, check the VS Code Developer Console for details.`;
        
        console.log('AgenticCore: Returning error message:', errorMessage);
        
        this.state.conversation.push({
          role: 'assistant',
          content: errorMessage
        });
        
        return errorMessage;
      }
    }
    
    // For non-scan requests, proceed with normal AI processing
    // Add user message
    this.state.conversation.push({
      role: 'user',
      content: userRequest
    });

    // System prompt with tool definitions
    const systemPrompt = this.buildSystemPrompt();
    
    let iteration = 0;
    let lastResponse = '';

    while (iteration < this.maxIterations) {
      // Build messages for AI
      const messages: AgentMessage[] = [
        { role: 'system', content: systemPrompt },
        ...this.state.conversation
      ];

      // Call AI with tool support
      const response = await this.callAIWithTools(messages);
      
      // Add assistant response
      this.state.conversation.push(response);

      // Check if AI wants to use tools
      if (response.tool_calls && response.tool_calls.length > 0) {
        // Execute tools
        for (const toolCall of response.tool_calls) {
          const toolName = toolCall.function.name;
          let toolParams: any;
          
          try {
            toolParams = JSON.parse(toolCall.function.arguments);
          } catch (e) {
            // If parsing fails, try to extract path from user request
            if (toolName === 'scan_repository') {
              toolParams = { path: this.state.context.workspacePath || '.' };
            } else {
              toolParams = {};
            }
          }
          
          // Auto-fill workspace path if not provided
          if (toolName === 'scan_repository' && (!toolParams.path || toolParams.path === '.')) {
            toolParams.path = this.state.context.workspacePath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '.';
          }
          
          try {
            const tool = this.tools.get(toolName);
            if (!tool) {
              throw new Error(`Tool ${toolName} not found`);
            }

            // Execute tool
            const toolResult = await tool.execute(toolParams);
            
            // Add tool result to conversation
            this.state.conversation.push({
              role: 'tool',
              content: JSON.stringify(toolResult, null, 2),
              tool_call_id: toolCall.id,
              name: toolName
            });

            // Update state based on tool results
            this.updateStateFromToolResult(toolName, toolResult);

          } catch (error) {
            this.state.conversation.push({
              role: 'tool',
              content: `Error: ${error instanceof Error ? error.message : String(error)}`,
              tool_call_id: toolCall.id,
              name: toolName
            });
          }
        }
      } else {
        // No tool calls - check if we should auto-trigger based on response content
        const responseLower = response.content.toLowerCase();
        const shouldAutoScan = isSecurityRequest && 
          (responseLower.includes("don't have access") || 
           responseLower.includes("can't access") ||
           responseLower.includes("no access") ||
           responseLower.includes("unable to scan") ||
           !responseLower.includes("scanning") && !responseLower.includes("found"));
        
        if (shouldAutoScan && this.state.context.workspacePath && iteration === 0) {
          // AI didn't call the tool but user asked to scan - auto-trigger it
          console.log('AgenticCore: AI response suggests it cannot scan, auto-triggering scan_repository tool');
          
          try {
            const scanResult = await this.executeScanRepository(this.state.context.workspacePath);
            
            if (scanResult.success) {
              return `I'll scan your repository now.\n\n${scanResult.message}\n\nFound ${scanResult.count} vulnerabilities (${scanResult.critical} critical, ${scanResult.high} high).\n\n[Use "fix vulnerabilities" to generate fixes for these issues.]`;
            } else {
              return `Failed to scan repository: ${scanResult.error || 'Unknown error'}`;
            }
          } catch (error) {
            return `Error scanning repository: ${error instanceof Error ? error.message : String(error)}`;
          }
        }
        
        // No more tools to call - agent is done
        lastResponse = response.content;
        break;
      }

      iteration++;
    }

    return lastResponse || 'Agent completed processing.';
  }

  /**
   * Build system prompt with tool definitions
   */
  private buildSystemPrompt(): string {
    const toolsDescription = Array.from(this.tools.values()).map(tool => {
      return `- ${tool.name}: ${tool.description}
  Parameters: ${JSON.stringify(tool.parameters, null, 2)}`;
    }).join('\n\n');

    return `You are CipherMate, an autonomous security agent running as a VS Code extension. You help developers scan their code repositories and fix security vulnerabilities.

IMPORTANT CONTEXT:
- You are a VS Code extension, NOT an API service
- Users interact with you through natural language chat in VS Code
- You automatically detect the workspace path from VS Code
- Users should NOT provide JSON configurations - just use natural language
- There are NO API endpoints - everything runs locally in VS Code

Your core expertise:
1. Repository Security Scanning - Comprehensive analysis using multiple tools
2. Vulnerability Detection - Finding security issues in code
3. Automatic Fixing - Generating and applying secure patches

Available Tools:
${toolsDescription}

Instructions:
- When asked to scan a repository, use scan_repository tool with the workspace path (auto-detected)
- When vulnerabilities are found, analyze them and generate fixes
- Apply fixes automatically when appropriate
- Explain your actions clearly in natural language
- Plan multi-step operations (e.g., scan → analyze → fix → verify)
- Be thorough and security-focused
- NEVER mention API endpoints or JSON configurations to users
- Users should just say things like "scan my repository" - you handle the rest

Always think step by step and use tools to accomplish tasks.`;
  }

  /**
   * Call AI with tool calling support
   */
  private async callAIWithTools(messages: AgentMessage[]): Promise<AgentMessage> {
    // Use multi-provider service if available (supports 450+ models with tools)
    if (this.aiService === 'cloud' && this.multiProviderService) {
      // Convert messages to API format
      const apiMessages = messages.map(msg => {
        const apiMsg: any = {
          role: msg.role,
          content: msg.content
        };
        
        if (msg.tool_calls) {
          apiMsg.tool_calls = msg.tool_calls;
        }
        
        if (msg.tool_call_id) {
          apiMsg.tool_call_id = msg.tool_call_id;
          apiMsg.name = msg.name;
        }
        
        return apiMsg;
      });

      // Build tools array for API
      const tools = Array.from(this.tools.values()).map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      }));

      const response = await this.multiProviderService.callAI({
        messages: apiMessages,
        tools: tools.length > 0 ? tools : undefined,
        temperature: 0.7,
        max_tokens: 2000
      });

      return {
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.tool_calls
      };
    }
    
    // Use legacy cloud AI if available
    if (this.aiService === 'cloud' && this.cloudAIService) {
      // Convert messages to API format
      const apiMessages = messages.map(msg => {
        const apiMsg: any = {
          role: msg.role,
          content: msg.content
        };
        
        if (msg.tool_calls) {
          apiMsg.tool_calls = msg.tool_calls;
        }
        
        if (msg.tool_call_id) {
          apiMsg.tool_call_id = msg.tool_call_id;
          apiMsg.name = msg.name;
        }
        
        return apiMsg;
      });

      // Build tools array for API
      const tools = Array.from(this.tools.values()).map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      }));

      const response = await this.cloudAIService.callAI({
        messages: apiMessages,
        tools: tools.length > 0 ? tools : undefined,
        temperature: 0.7,
        max_tokens: 2000
      });

      return {
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.tool_calls
      };
    }
    
    // Fall back to local AI
    const url = new URL(this.lmStudioUrl);
    
    // Convert messages to API format
    const apiMessages = messages.map(msg => {
      const apiMsg: any = {
        role: msg.role,
        content: msg.content
      };
      
      if (msg.tool_calls) {
        apiMsg.tool_calls = msg.tool_calls;
      }
      
      if (msg.tool_call_id) {
        apiMsg.tool_call_id = msg.tool_call_id;
        apiMsg.name = msg.name;
      }
      
      return apiMsg;
    });

    // Build tools array for API
    const tools = Array.from(this.tools.values()).map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));

    return new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      };

      const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const choice = parsed.choices?.[0];
            
            const response: AgentMessage = {
              role: 'assistant',
              content: choice.message?.content || '',
              tool_calls: choice.message?.tool_calls
            };
            
            resolve(response);
          } catch (e) {
            reject(new Error('Invalid response from AI'));
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify({
        model: 'local-model',
        messages: apiMessages,
        tools: tools,
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 2000
      }));
      req.end();
    });
  }

  /**
   * Update state from tool results
   */
  private updateStateFromToolResult(toolName: string, result: any): void {
    if (toolName === 'scan_repository' || toolName === 'scan_file') {
      if (result.vulnerabilities) {
        this.state.vulnerabilities.push(...result.vulnerabilities);
      }
      if (result.filesScanned) {
        this.state.context.filesScanned.push(...result.filesScanned);
      }
    }
  }

  // Tool execution methods
  private async executeScanRepository(
    path: string, 
    includePatterns?: string[], 
    excludePatterns?: string[],
    options?: { filterSecrets?: boolean; filterDependencies?: boolean }
  ): Promise<any> {
    try {
      // Use provided path, or fall back to workspace, or current directory
      let workspacePath: string = path;
      
      if (!workspacePath || workspacePath === '.' || workspacePath === '') {
        const vscodePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (vscodePath) {
          workspacePath = vscodePath;
        }
      }
      
      if (!workspacePath || workspacePath === '.' || workspacePath === '') {
        // Last resort: try to get current working directory
        workspacePath = process.cwd();
      }
      
      if (!workspacePath) {
        return { 
          success: false, 
          error: 'No workspace path available. Please open a folder in VS Code or specify a path.' 
        };
      }

      console.log(`AgenticCore: Scanning repository at: ${workspacePath}`);

      // Use new unified RepositoryScanner (primary scanner) - this is fast and reliable
      const scanner = new RepositoryScanner(workspacePath);
      const scanResult = await scanner.scan();

      // Convert to format expected by agent
      const allVulnerabilities = scanner.getAllVulnerabilities(scanResult.results);
      
      // Start with unified scanner results (return these immediately)
      // Tag each vulnerability with its scanner name
      let allResults = allVulnerabilities.map((v: any) => {
        // Determine scanner name from vulnerability metadata or type
        let scannerName = (v as any).scanner || 'code-pattern-scanner'; // Default fallback
        if (v.type?.includes('dependency') || v.type?.includes('cve') || v.type?.includes('package')) {
          scannerName = 'dependency-scanner';
        } else if (v.type?.includes('secret') || v.type?.includes('credential') || v.type?.includes('key') || 
                   v.type?.includes('password') || v.type?.includes('token')) {
          scannerName = 'secrets-scanner';
        } else if (v.type?.includes('smart') || v.type?.includes('contract') || v.type?.includes('solidity')) {
          scannerName = 'smart-contract-scanner';
        }
        
        return {
          ...v,
          severity: v.severity.toUpperCase(),
          file: v.file,
          line: v.line,
          message: v.description,
          scanner: scannerName, // Tag with scanner name
        } as any;
      });
      
      // Filter results based on request type
      if (options?.filterSecrets) {
        // Only show secrets-related vulnerabilities
        allResults = allResults.filter((v: any) => 
          v.scanner === 'secrets-scanner' || 
          (v.type && (v.type.includes('secret') || v.type.includes('key') || v.type.includes('password') || v.type.includes('token') || v.type.includes('credential')))
        );
      }
      
      if (options?.filterDependencies) {
        // Only show dependency-related vulnerabilities
        allResults = allResults.filter((v: any) => 
          v.scanner === 'dependency-scanner' || 
          (v.type && (v.type.includes('dependency') || v.type.includes('cve') || v.type.includes('package')))
        );
      }
      
      // Run legacy scans in background - don't wait for them
      // They'll be added to state later if they complete
      Promise.allSettled([
        this.runSemgrep(workspacePath).then(results => {
          if (Array.isArray(results) && results.length > 0) {
            allResults.push(...results);
            this.state.vulnerabilities.push(...results);
          }
        }).catch(e => console.warn('Semgrep scan failed:', e)),
        this.runBandit(workspacePath).then(results => {
          if (Array.isArray(results) && results.length > 0) {
            allResults.push(...results);
            this.state.vulnerabilities.push(...results);
          }
        }).catch(e => console.warn('Bandit scan failed:', e)),
        this.runAIAnalysis(workspacePath).then(results => {
          if (Array.isArray(results) && results.length > 0) {
            allResults.push(...results);
            this.state.vulnerabilities.push(...results);
          }
        }).catch(e => console.warn('AI analysis failed:', e))
      ]).catch(() => {
        // Ignore errors - we already have results from unified scanner
      });
      
      this.state.vulnerabilities = allResults;
      this.state.scanResults = allResults;

      const criticalCount = scanResult.aggregated.critical + allResults.filter((r: any) => r.severity === 'CRITICAL' || r.severity === 'ERROR').length;
      const highCount = scanResult.aggregated.high + allResults.filter((r: any) => r.severity === 'HIGH' || r.severity === 'WARNING').length;

      // Build detailed scanner information with per-scanner vulnerability lists
      const scannerDetails = scanResult.results.map(r => {
        // Get vulnerabilities from this specific scanner
        const scannerVulns = allResults.filter((v: any) => 
          (v.scanner === r.scanner) || 
          (v.tool === r.scanner) ||
          (!v.scanner && !v.tool && r.scanner === 'code-pattern-scanner') // Default fallback
        );
        
        return {
          name: r.scanner,
          success: r.success,
          count: r.summary.total,
          duration: r.duration,
          error: r.error,
          summary: r.summary,
          vulnerabilities: scannerVulns, // Include actual vulnerabilities for this scanner
          description: this.getScannerDescription(r.scanner)
        };
      });

      return {
        success: true,
        vulnerabilities: allResults,
        count: allResults.length,
        critical: criticalCount,
        high: highCount,
        summary: scanResult.aggregated,
        scanners: scannerDetails, // Now includes detailed info per scanner
        scanDuration: scanResult.duration,
        timestamp: scanResult.timestamp,
        message: `Repository scan completed: Found ${allResults.length} vulnerabilities (${criticalCount} critical, ${highCount} high)`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async executeScanFile(filePath: string): Promise<any> {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }

      const code = await fs.promises.readFile(filePath, 'utf-8');
      const language = this.detectLanguage(filePath);
      
      // Use AI to analyze the file
      const analysis = await this.runAIAnalysisOnCode(code, filePath, language);
      
      this.state.context.filesScanned.push(filePath);
      
      return {
        success: true,
        vulnerabilities: analysis.issues || [],
        file: filePath,
        language: language,
        message: `File scan completed: Found ${(analysis.issues || []).length} issues`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async executeAnalyzeCode(code: string, language?: string, context?: string): Promise<any> {
    try {
      const prompt = `Analyze this code for security vulnerabilities:

${context ? `Context: ${context}\n\n` : ''}Code:
\`\`\`${language || 'text'}
${code}
\`\`\`

Identify security issues including:
- Input validation problems
- Injection vulnerabilities (SQL, XSS, Command)
- Authentication/authorization flaws
- Cryptographic weaknesses
- Data exposure risks
- Business logic vulnerabilities

Return JSON:
{
  "issues": [
    {
      "type": "vulnerability_type",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "line": line_number,
      "description": "detailed description",
      "explanation": "why this is vulnerable",
      "fix": "suggested fix"
    }
  ]
}`;

      const response = await this.callAI(prompt);
      const parsed = JSON.parse(response);
      
      return {
        success: true,
        issues: parsed.issues || [],
        count: (parsed.issues || []).length
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        issues: []
      };
    }
  }

  private async executeGenerateFix(vulnerability: any, codeContext?: string): Promise<any> {
    try {
      const prompt = `Generate a secure fix for this vulnerability:

Vulnerability Type: ${vulnerability.type || vulnerability.issue_type || 'Security Issue'}
Severity: ${vulnerability.severity || 'UNKNOWN'}
Description: ${vulnerability.description || vulnerability.extra?.message || 'Security vulnerability'}
Location: ${vulnerability.path || vulnerability.file || 'Unknown'}:${vulnerability.start?.line || vulnerability.line_number || 'Unknown'}

Vulnerable Code:
\`\`\`
${vulnerability.code || vulnerability.issue_text || 'Code not provided'}
\`\`\`

${codeContext ? `Surrounding Context:\n\`\`\`\n${codeContext}\n\`\`\`\n` : ''}

Generate a secure fix. Return JSON:
{
  "originalCode": "vulnerable code",
  "fixedCode": "secure replacement code",
  "explanation": "why this fix is secure",
  "securityImprovements": ["improvement1", "improvement2"],
  "testingNotes": "how to test the fix",
  "confidence": 0.0-1.0
}`;

      const response = await this.callAI(prompt);
      const parsed = JSON.parse(response);
      
      return {
        success: true,
        originalCode: parsed.originalCode || vulnerability.code,
        fixedCode: parsed.fixedCode,
        explanation: parsed.explanation,
        securityImprovements: parsed.securityImprovements || [],
        testingNotes: parsed.testingNotes,
        confidence: parsed.confidence || 0.8
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async executeApplyFix(filePath: string, originalCode: string, fixedCode: string, lineNumber: number): Promise<any> {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }

      const fileContent = await fs.promises.readFile(filePath, 'utf-8');
      const lines = fileContent.split('\n');
      
      // Find the line to replace
      const targetLine = lines[lineNumber - 1];
      
      if (!targetLine.includes(originalCode.trim())) {
        // Try to find it nearby
        const searchRange = 5;
        let found = false;
        for (let i = Math.max(0, lineNumber - searchRange - 1); i < Math.min(lines.length, lineNumber + searchRange); i++) {
          if (lines[i].includes(originalCode.trim())) {
            lines[i] = lines[i].replace(originalCode.trim(), fixedCode.trim());
            found = true;
            break;
          }
        }
        
        if (!found) {
          return { success: false, error: 'Could not find original code to replace' };
        }
      } else {
        lines[lineNumber - 1] = lines[lineNumber - 1].replace(originalCode.trim(), fixedCode.trim());
      }
      
      const newContent = lines.join('\n');
      await fs.promises.writeFile(filePath, newContent, 'utf-8');
      
      return {
        success: true,
        message: `Fix applied to ${path.basename(filePath)} at line ${lineNumber}`,
        file: filePath,
        line: lineNumber
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async executeReadFile(filePath: string): Promise<any> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return { success: true, content };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async executeListFiles(directory: string, pattern?: string, recursive?: boolean): Promise<any> {
    try {
      if (!fs.existsSync(directory)) {
        return { success: false, error: 'Directory not found' };
      }

      const files: string[] = [];
      
      async function scanDir(dir: string): Promise<void> {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          // Skip common exclusions
          if (entry.name.startsWith('.') || 
              entry.name === 'node_modules' || 
              entry.name === 'dist' || 
              entry.name === 'build') {
            continue;
          }
          
          if (entry.isDirectory() && recursive) {
            await scanDir(fullPath);
          } else if (entry.isFile()) {
            if (!pattern || entry.name.match(pattern.replace('*', '.*'))) {
              files.push(fullPath);
            }
          }
        }
      }
      
      await scanDir(directory);
      
      return {
        success: true,
        files: files,
        count: files.length
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        files: []
      };
    }
  }

  private async executeExplainVulnerability(vulnerability: any): Promise<any> {
    try {
      const prompt = `Explain this security vulnerability in detail:

Type: ${vulnerability.type || vulnerability.issue_type || 'Security Issue'}
Severity: ${vulnerability.severity || 'UNKNOWN'}
Description: ${vulnerability.description || vulnerability.extra?.message || 'Security vulnerability'}
Location: ${vulnerability.path || 'Unknown'}:${vulnerability.start?.line || vulnerability.line_number || 'Unknown'}

Code:
\`\`\`
${vulnerability.code || vulnerability.issue_text || 'N/A'}
\`\`\`

Provide:
1. What this vulnerability is
2. Why it's dangerous
3. How attackers could exploit it
4. Real-world impact examples
5. How to prevent it
6. Related security concepts

Be detailed and educational.`;

      const explanation = await this.callAI(prompt);
      
      return {
        success: true,
        explanation: explanation,
        vulnerability: vulnerability
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Helper methods
  private async callAI(prompt: string): Promise<string> {
    // Use multi-provider service if available (supports 450+ models)
    // Wait for service to be initialized if it's still loading
    if (this.aiService === 'cloud' && !this.multiProviderService) {
      // Wait a bit for async initialization
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (this.aiService === 'cloud' && this.multiProviderService) {
      console.log(`AgenticCore.callAI: Using multiProviderService`);
      const response = await this.multiProviderService.callAI({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2000
      });
      return response.content;
    }
    
    // Fall back to legacy cloud AI service
    if (this.aiService === 'cloud' && this.cloudAIService) {
      const response = await this.cloudAIService.callAI({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2000
      });
      return response.content;
    }
    
    // Fall back to local AI
    return new Promise((resolve, reject) => {
      const url = new URL(this.lmStudioUrl);
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      };

      const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.choices?.[0]?.message?.content || parsed.content || '');
          } catch (e) {
            reject(new Error('Invalid response from AI'));
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify({
        model: 'local-model',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2000
      }));
      req.end();
    });
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const langMap: Record<string, string> = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.php': 'php',
      '.go': 'go',
      '.rs': 'rust',
      '.rb': 'ruby',
      '.cpp': 'cpp',
      '.c': 'c'
    };
    return langMap[ext] || 'text';
  }

  private async runSemgrep(workspacePath: string): Promise<any[]> {
    try {
      const { stdout } = await execAsync('semgrep --json --exclude="node_modules" --exclude=".git" .', {
        cwd: workspacePath,
        maxBuffer: 10 * 1024 * 1024
      });
      const result = JSON.parse(stdout);
      return (result.results || []).map((r: any) => ({
        tool: 'Semgrep',
        ...r
      }));
    } catch (error) {
      return [];
    }
  }

  private async runBandit(workspacePath: string): Promise<any[]> {
    try {
      const { stdout } = await execAsync('bandit -r -f json .', {
        cwd: workspacePath,
        maxBuffer: 10 * 1024 * 1024
      });
      const result = JSON.parse(stdout);
      return (result.results || []).map((r: any) => ({
        tool: 'Bandit',
        ...r
      }));
    } catch (error) {
      return [];
    }
  }

  private async runAIAnalysis(workspacePath: string): Promise<any[]> {
    // Simplified - would need full implementation
    return [];
  }

  private async runAIAnalysisOnCode(code: string, filePath: string, language: string): Promise<any> {
    const prompt = `Analyze this ${language} code for security vulnerabilities:

\`\`\`${language}
${code}
\`\`\`

Return JSON with issues array.`;
    
    try {
      const response = await this.callAI(prompt);
      return JSON.parse(response);
    } catch {
      return { issues: [] };
    }
  }

  /**
   * Handle case when no workspace is open - use simple fallback message (no AI needed)
   */
  private async handleNoWorkspace(originalRequest: string): Promise<string> {
    // Store the request so we can retry it
    this.state.context.pendingRequest = originalRequest;
    
    // Check if we've already asked about this (to vary responses)
    const previousNoWorkspaceMessages = this.state.conversation
      .filter(msg => msg.role === 'assistant')
      .slice(-3)
      .map(msg => msg.content.toLowerCase());
    
    const hasAskedBefore = previousNoWorkspaceMessages.some(msg => 
      msg.includes('open folder') || msg.includes('file → open')
    );
    
    // Small delay to show thinking process
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Try to generate AI response first for dynamic, human-like messages
    try {
      const aiResponse = await this.generateNoWorkspaceResponse(originalRequest, hasAskedBefore);
      if (aiResponse && this.isValidNoWorkspaceResponse(aiResponse)) {
        return aiResponse;
      }
    } catch (error) {
      console.log('AI generation failed for no-workspace response, using fallback:', error);
    }
    
    // Fallback to simple message if AI fails
    return this.getVariedFallbackMessage(originalRequest, hasAskedBefore);
  }

  /**
   * Generate AI-powered response for no workspace scenario
   */
  private async generateNoWorkspaceResponse(originalRequest: string, hasAskedBefore: boolean): Promise<string> {
    const contextNote = hasAskedBefore 
      ? "The user has been asked to open a folder before. Be more casual and brief this time."
      : "This is the first time asking. Be friendly and helpful.";
    
    const prompt = `You are a helpful VS Code extension assistant. The user wants to "${originalRequest}" but no workspace folder is open in VS Code.

${contextNote}

Generate a friendly, human-like response (2-3 sentences max) that:
1. Acknowledges what they want to do
2. Tells them to open a folder using "File → Open Folder" (or Cmd+O / Ctrl+O)
3. Mentions that you'll automatically retry their request once they open it

Rules:
- Keep it conversational and natural
- Don't mention terminal, git, GitHub, or technical details
- Don't use emojis
- Be concise (under 150 characters)
- Make it feel personal and helpful

Response:`;

    try {
      // Use AI service to generate response
      const messages: AgentMessage[] = [
        { role: 'user', content: prompt }
      ];
      
      const response = await this.callAIWithTools(messages);
      const generatedText = response.content?.trim() || '';
      
      // Validate the response
      if (generatedText && this.isValidNoWorkspaceResponse(generatedText)) {
        return generatedText;
      }
      
      // If validation fails, return empty to trigger fallback
      return '';
    } catch (error) {
      console.log('Error generating AI response for no workspace:', error);
      return '';
    }
  }

  /**
   * Format scan results without AI (fallback when AI fails)
   */
  private formatScanResultsWithoutAI(scanResults: any[], userRequest: string): string {
    // Simple formatting without AI - just show the data
    let message = `## Security Scan Results\n\n`;
    message += `I completed the security scan. Here are the findings:\n\n`;
    
    if (scanResults.length === 0) {
      message += `**Great news!** No vulnerabilities found.\n`;
    } else {
      message += `**Found ${scanResults.length} potential issues:**\n\n`;
      scanResults.slice(0, 10).forEach((result: any, idx: number) => {
        message += `${idx + 1}. ${result.severity || 'UNKNOWN'}: ${result.message || result.description || 'Issue detected'}\n`;
        if (result.file) message += `   File: ${result.file}${result.line ? `:${result.line}` : ''}\n`;
      });
      if (scanResults.length > 10) {
        message += `\n... and ${scanResults.length - 10} more issues.\n`;
      }
    }
    
    message += `\n**Note:** Configure your AI provider in Settings (⚙ icon) for detailed analysis and recommendations.`;
    
    return message;
  }

  /**
   * Validate AI response for no workspace scenario
   */
  private isValidNoWorkspaceResponse(response: string): boolean {
    if (!response || response.trim().length === 0) {
      return false;
    }
    
    // Allow longer responses (up to 300 characters) for more natural AI responses
    if (response.length > 300) {
      return false;
    }
    
    // Check for unwanted terms that indicate technical/incorrect guidance
    const unwantedTerms = [
      'terminal',
      'command line',
      'code .',
      'git clone',
      'github clone',
      'remote repository',
      'security risk',
      'privacy concern',
      'technical setup',
      'bash script',
      'cygwin',
      'curl',
      'wget',
      'npm install',
      'pip install'
    ];
    
    const lowerResponse = response.toLowerCase();
    for (const term of unwantedTerms) {
      if (lowerResponse.includes(term)) {
        return false;
      }
    }
    
    // Check if it mentions File → Open Folder or similar (good sign)
    const hasValidGuidance = lowerResponse.includes('file') || 
                             lowerResponse.includes('open folder') || 
                             lowerResponse.includes('cmd+o') || 
                             lowerResponse.includes('ctrl+o') ||
                             lowerResponse.includes('open your folder') ||
                             lowerResponse.includes('open a folder');
    
    if (!hasValidGuidance) {
      return false;
    }
    
    return true;
  }

  /**
   * Varied fallback messages - different each time
   */
  private getVariedFallbackMessage(originalRequest: string, hasAskedBefore: boolean): string {
    const fallbacks = hasAskedBefore ? [
      `Oh, I still need a folder open to help with that! Could you open your project folder using File → Open Folder? Once it's open, I'll get right on it.`,
      `Almost there! Just need you to open your folder first - File → Open Folder (or Cmd+O). Then I can help you with that right away.`,
      `Let me help with that once you open your folder! Just go to File → Open Folder and I'll automatically take care of it.`,
      `I'm ready to help! Just need your folder open first - File → Open Folder will do it. Then I'll handle the rest automatically.`
    ] : [
      `I'd love to help you ${originalRequest.toLowerCase()}! To get started, please open your project folder using File → Open Folder (or press Cmd+O / Ctrl+O). Once you open it, I'll automatically take care of it.`,
      `Ready to help! First, could you open your project folder? Just go to File → Open Folder (or Cmd+O), and I'll automatically ${originalRequest.toLowerCase()} once it's open.`,
      `I can help with that! To get started, please open your folder using File → Open Folder. Once it's open, I'll automatically ${originalRequest.toLowerCase()} for you.`
    ];
    
    // Pick a random one for variety
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  /**
   * Get scanner description for reporting
   */
  private getScannerDescription(scannerName: string): string {
    const descriptions: Record<string, string> = {
      'dependency-scanner': 'Scans dependency files (package.json, requirements.txt, etc.) for known CVEs and vulnerable packages',
      'secrets-scanner': 'Detects hardcoded secrets like API keys, passwords, tokens, and credentials in code files',
      'smart-contract-scanner': 'Analyzes Solidity smart contracts for security vulnerabilities (reentrancy, access control, etc.)',
      'code-pattern-scanner': 'Detects OWASP Top 10 vulnerabilities and security anti-patterns in code (SQL injection, XSS, etc.)',
      'semgrep': 'Static analysis tool for finding security bugs and vulnerabilities using pattern matching',
      'bandit': 'Python security linter that finds common security issues in Python code'
    };
    
    return descriptions[scannerName] || `Security scanner: ${scannerName}`;
  }

  /**
   * Get current state
   */
  getState(): AgentState {
    return this.state;
  }

  /**
   * Reset agent state
   */
  reset(): void {
    this.state = {
      conversation: [],
      currentPlan: [],
      executedSteps: [],
      scanResults: [],
      vulnerabilities: [],
      context: {
        filesScanned: [],
        pendingRequest: undefined
      }
    };
  }
}

