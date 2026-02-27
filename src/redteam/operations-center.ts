import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PenetrationTestingEngine } from './penetration-testing';
import { AgentOrchestrator } from '../dast/agent-orchestrator';
import { startWarRoomServer } from '../dast/war-room-server';
import { dastEventBus } from '../dast/dast-event-bus';
import { getFontConfig, getFontConfigCss, getFontConfigRaw } from '../core/font-config';

// Red Team Operations Center
export class RedTeamOperationsCenter {
  private panel: vscode.WebviewPanel | null = null;
  private context: vscode.ExtensionContext;
  private attackHistory: AttackOperation[] = [];
  private learningEngine: AIAttackEngine;
  private socialEngineeringToolkit: SocialEngineeringToolkit;
  private codeObfuscator: CodeObfuscator;
  private payloadGenerator: PayloadGenerator;
  private eventBusUnsubscribe: (() => void) | null = null;
  private lastPentestResult: { vulnerabilities: any[]; targetUrl?: string } | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.learningEngine = new AIAttackEngine();
    this.socialEngineeringToolkit = new SocialEngineeringToolkit();
    this.codeObfuscator = new CodeObfuscator();
    this.payloadGenerator = new PayloadGenerator();
  }

  async showOperationsCenter(): Promise<void> {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'redTeamOps',
      'Red Team Operations Center',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
      }
    );

    this.panel.webview.html = this.getOperationsCenterHtml();
    this.setupMessageHandlers();
    this.subscribeToEventBus();
    this.panel.onDidDispose(() => {
      if (this.eventBusUnsubscribe) {
        this.eventBusUnsubscribe();
        this.eventBusUnsubscribe = null;
      }
    });
  }

  private subscribeToEventBus(): void {
    if (this.eventBusUnsubscribe) return;
    this.eventBusUnsubscribe = dastEventBus.onEvent((ev) => {
      if (this.panel) {
        this.panel.webview.postMessage({
          command: 'dastEvent',
          event: {
            type: ev.type,
            ts: ev.ts,
            sessionId: ev.sessionId,
            data: ev.data
          }
        });
      }
    });
  }

  private getOperationsCenterHtml(): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Red Team Operations Center</title>
          <style>
              :root { ${getFontConfigCss()} }
              * {
                  margin: 0;
                  padding: 0;
                  box-sizing: border-box;
              }
              
              body {
                  font-family: var(--ciphermate-font-code);
                  background: var(--vscode-editor-background);
                  color: var(--vscode-foreground);
                  height: 100vh;
                  display: flex;
                  overflow: hidden;
              }
              
              .main-container {
                  display: flex;
                  flex-direction: column;
                  width: 100%;
                  height: 100vh;
              }
              
              .browser-bar {
                  background: var(--vscode-titleBar-activeBackground);
                  border-bottom: 1px solid var(--vscode-panel-border);
                  padding: 12px 16px;
                  flex-shrink: 0;
              }
              
              .url-bar {
                  display: flex;
                  align-items: center;
                  gap: 10px;
                  margin-bottom: 8px;
              }
              
              .url-icon { font-size: 16px; }
              
              .url-input {
                  flex: 1;
                  padding: 10px 14px;
                  background: var(--vscode-input-background);
                  color: var(--vscode-input-foreground);
                  border: 1px solid var(--vscode-input-border);
                  border-radius: 6px;
                  font-family: inherit;
                  font-size: 13px;
              }
              
              .url-input:focus {
                  outline: none;
                  border-color: var(--vscode-focusBorder);
              }
              
              .url-input::placeholder {
                  color: var(--vscode-input-placeholderForeground);
              }
              
              .btn-pentest {
                  background: var(--vscode-button-background);
                  color: var(--vscode-button-foreground);
                  font-weight: 600;
              }
              
              .btn-pentest:disabled {
                  opacity: 0.6;
                  cursor: not-allowed;
              }
              
              .btn-warroom {
                  background: var(--vscode-button-secondaryBackground);
                  color: var(--vscode-button-secondaryForeground);
              }
              
              .status-row {
                  display: flex;
                  align-items: center;
                  gap: 12px;
                  font-size: 12px;
                  color: var(--vscode-descriptionForeground);
              }
              
              .status-badge {
                  padding: 2px 8px;
                  border-radius: 4px;
                  background: var(--vscode-badge-background);
                  color: var(--vscode-badge-foreground);
              }
              
              .status-badge.running {
                  background: var(--vscode-charts-orange);
                  color: #fff;
              }
              
              .status-badge.complete {
                  background: var(--vscode-charts-green);
                  color: #fff;
              }
              
              .feed-container {
                  flex: 1;
                  display: flex;
                  flex-direction: column;
                  min-height: 0;
                  overflow: hidden;
                  background: #000;
              }
              
              .feed-header {
                  padding: 10px 16px;
                  background: #000;
                  border-bottom: 1px solid #0a3d0a;
                  flex-shrink: 0;
              }
              
              .feed-title {
                  font-weight: 600;
                  font-size: 13px;
                  color: #00ff00;
              }
              
              .feed-subtitle {
                  font-size: 11px;
                  color: #00aa00;
                  margin-left: 8px;
              }
              
              .activity-feed {
                  flex: 1;
                  overflow-y: auto;
                  padding: 12px 16px;
                  background: #000;
                  cursor: default;
                  outline: none;
              }
              
              .feed-item {
                  margin-bottom: 10px;
                  padding: 10px 12px;
                  border-radius: 2px;
                  border-left: 4px solid #0a5c0a;
                  background: #000;
              }
              
              .feed-item.vuln, .feed-item.vuln_confirmed {
                  border-color: #00ff00;
                  background: #000;
              }
              
              .feed-item.promising_finding {
                  border-color: #00cc00;
              }
              
              .feed-item.scan_started, .feed-item.strategist_started {
                  border-color: #00dd00;
              }
              
              .feed-item.scan_completed {
                  border-color: #00ff00;
              }
              
              .feed-item.welcome {
                  border-color: #00aa00;
              }
              
              .feed-time, .feed-type, .feed-content {
                  font-family: var(--ciphermate-font-code);
              }
              .feed-time {
                  font-size: 10px;
                  color: #008800;
                  margin-right: 8px;
              }
              
              .feed-type {
                  font-size: 11px;
                  font-weight: 600;
                  text-transform: uppercase;
                  color: #00ff00;
              }
              
              .feed-content {
                  margin-top: 6px;
                  font-size: 12px;
                  line-height: 1.5;
                  word-break: break-word;
                  color: #00cc00;
              }
              
              .feed-content strong {
                  color: #00ff00;
              }
              
              .feed-item small {
                  color: #00aa00;
              }
              
              .btn-terminal {
                  background: #000 !important;
                  color: #00ff00 !important;
                  border: 1px solid #0a5c0a !important;
              }
              .btn-terminal:hover {
                  background: #0a3d0a !important;
                  color: #00ff00 !important;
              }
              
              .activity-feed::-webkit-scrollbar {
                  width: 8px;
              }
              .activity-feed::-webkit-scrollbar-track {
                  background: #000;
              }
              .activity-feed::-webkit-scrollbar-thumb {
                  background: #0a5c0a;
                  border-radius: 2px;
              }
              
              .qa-container {
                  flex-shrink: 0;
                  padding: 12px 16px;
                  background: var(--vscode-input-background);
                  border-top: 1px solid var(--vscode-panel-border);
              }
              
              .qa-header {
                  font-size: 12px;
                  font-weight: 600;
                  color: var(--vscode-foreground);
                  margin-bottom: 8px;
              }
              
              .qa-input-row {
                  display: flex;
                  gap: 8px;
              }
              
              .qa-input {
                  flex: 1;
                  padding: 8px 12px;
                  background: var(--vscode-input-background);
                  color: var(--vscode-input-foreground);
                  border: 1px solid var(--vscode-input-border);
                  border-radius: 4px;
                  font-family: inherit;
                  font-size: 12px;
              }
              
              .qa-input:focus {
                  outline: none;
                  border-color: var(--vscode-focusBorder);
              }
              
              .btn-qa {
                  padding: 8px 16px;
              }
              
              .qa-responses {
                  margin-top: 10px;
                  max-height: 120px;
                  overflow-y: auto;
              }
              
              .qa-response {
                  padding: 8px 10px;
                  margin-bottom: 6px;
                  background: var(--vscode-editor-background);
                  border-radius: 4px;
                  font-size: 12px;
                  line-height: 1.4;
                  font-family: var(--ciphermate-font-code);
              }
              
              .input-actions {
                  display: flex;
                  gap: 10px;
                  margin-top: 10px;
              }
              
              .btn {
                  padding: 8px 16px;
                  background: var(--vscode-button-background);
                  color: var(--vscode-button-foreground);
                  border: 1px solid var(--vscode-button-border);
                  border-radius: 4px;
                  cursor: pointer;
                  font-size: 12px;
                  transition: all 0.2s;
              }
              
              .btn:hover {
                  background: var(--vscode-button-hoverBackground);
              }
              
              .btn.secondary {
                  background: var(--vscode-button-secondaryBackground);
                  color: var(--vscode-button-secondaryForeground);
              }
              
              .btn.secondary:hover {
                  background: var(--vscode-button-secondaryHoverBackground);
              }
              
              .code-block {
                  background: var(--vscode-textCodeBlock-background);
                  border: 1px solid var(--vscode-textCodeBlock-border);
                  border-radius: 4px;
                  padding: 10px;
                  margin: 10px 0;
                  font-family: var(--ciphermate-font-code);
                  font-size: 12px;
                  overflow-x: auto;
              }
              
              .attack-status {
                  display: flex;
                  align-items: center;
                  gap: 5px;
                  font-size: 11px;
                  color: var(--vscode-descriptionForeground);
              }
              
              .attack-status.running {
                  color: var(--vscode-charts-orange);
              }
              
              .attack-status.success {
                  color: var(--vscode-charts-green);
              }
              
              .attack-status.failed {
                  color: var(--vscode-charts-red);
              }
              
              .progress-bar {
                  width: 100%;
                  height: 4px;
                  background: var(--vscode-progressBar-background);
                  border-radius: 2px;
                  overflow: hidden;
                  margin: 5px 0;
              }
              
              .progress-fill {
                  height: 100%;
                  background: var(--vscode-progressBar-background);
                  transition: width 0.3s ease;
              }
              
              .terminal-output {
                  background: var(--vscode-terminal-background);
                  color: var(--vscode-terminal-foreground);
                  padding: 10px;
                  border-radius: 4px;
                  font-family: var(--ciphermate-font-code);
                  font-size: 11px;
                  max-height: 200px;
                  overflow-y: auto;
                  border: 1px solid var(--vscode-panel-border);
              }
              
              .quick-access {
                  display: flex;
                  align-items: center;
                  gap: 6px;
                  margin-top: 6px;
                  font-size: 11px;
                  color: var(--vscode-descriptionForeground);
              }
              .quick-access .qa-label { margin-right: 4px; }
              .quick-access a { color: var(--vscode-textLink-foreground); text-decoration: none; }
              .quick-access a:hover { text-decoration: underline; }
              .quick-access .qa-sep { color: var(--vscode-panel-border); }
          </style>
      </head>
      <body>
          <div class="main-container">
              <div class="browser-bar">
                  <div class="url-bar">
                      <span class="url-icon"></span>
                      <input type="text" id="targetUrl" class="url-input" placeholder="Enter URL or API endpoint (e.g. https://api.example.com)" />
                      <button class="btn btn-pentest" id="startPentestBtn" onclick="startPentest()">Start Pentest</button>
                      <button class="btn btn-warroom" id="warRoomBtn" onclick="openWarRoomLive()">War Room Live</button>
                  </div>
                  <div class="status-row">
                      <span class="status-badge" id="statusBadge">Ready</span>
                      <span class="target-display" id="targetDisplay"></span>
                      </div>
                  <div class="quick-access">
                      <span class="qa-label">Quick access:</span>
                      <a href="#" id="linkViewResults">View Results</a>
                      <span class="qa-sep">|</span>
                      <a href="#" id="linkViewImprovements">View Improvements</a>
                      <span class="qa-sep">|</span>
                      <a href="#" id="linkLoadLastPentest">Load Last Pentest</a>
                      <span class="qa-sep">|</span>
                      <a href="#" id="linkExport0x0">Export</a>
                      </div>
                      </div>
              
              <div class="feed-container">
                  <div class="feed-header">
                      <span class="feed-title">Live Activity Feed</span>
                      <span class="feed-subtitle">Findings and reports stream in as the pentest runs</span>
                      </div>
                  <div class="activity-feed" id="activityFeed" tabindex="-1" role="log" aria-live="polite">
                      <div class="feed-item welcome" id="welcomeMsg">
                          <span class="feed-type">System</span>
                          <div class="feed-content">
                              Enter a URL above and click <strong>Start Pentest</strong> to launch the attack.
                              Click <strong>War Room Live</strong> to open the full live dashboard in your browser.
                              Findings will stream here as they are discovered.
                      </div>
                      </div>
                  </div>
              </div>
              
              <div class="qa-container">
                  <div class="qa-header">Ask about the attack (when complete)</div>
                  <div class="qa-input-row">
                      <input type="text" id="qaInput" class="qa-input" placeholder="e.g. What was the most critical finding? How do I fix the SQL injection?" />
                      <button class="btn btn-qa" id="askBtn" onclick="askAboutAttack()">Ask</button>
                      </div>
                  <div class="qa-responses" id="qaResponses"></div>
                  </div>
                  
          </div>
          
          <script>
              const vscode = acquireVsCodeApi();
              const MAX_FEED_ITEMS = 300;
              
              function startPentest() {
                  const url = (document.getElementById('targetUrl').value || '').trim();
                  if (!url) {
                      addFeedItem({ type: 'error', content: 'Please enter a URL or API endpoint.' });
                      return;
                  }
                  if (!url.startsWith('http://') && !url.startsWith('https://')) {
                      addFeedItem({ type: 'error', content: 'URL must start with http:// or https://' });
                      return;
                  }
                  document.getElementById('startPentestBtn').disabled = true;
                  document.getElementById('statusBadge').textContent = 'Running';
                  document.getElementById('statusBadge').className = 'status-badge running';
                  document.getElementById('targetDisplay').textContent = 'Target: ' + url;
                  const welcome = document.getElementById('welcomeMsg');
                  if (welcome) welcome.remove();
                  addFeedItem({ type: 'scan_started', content: 'Pentest started for ' + url, data: { targetUrl: url } });
                  vscode.postMessage({ command: 'startPentest', targetUrl: url });
              }
              
              function openWarRoomLive() {
                  vscode.postMessage({ command: 'openWarRoomLive' });
              }
              
              document.getElementById('linkViewResults')?.addEventListener('click', function(e) { e.preventDefault(); vscode.postMessage({ command: 'viewResults' }); });
              document.getElementById('linkViewImprovements')?.addEventListener('click', function(e) { e.preventDefault(); vscode.postMessage({ command: 'viewResults', focusImprovements: true }); });
              document.getElementById('linkLoadLastPentest')?.addEventListener('click', function(e) { e.preventDefault(); vscode.postMessage({ command: 'viewLastPentest' }); });
              document.getElementById('linkExport0x0')?.addEventListener('click', function(e) { e.preventDefault(); vscode.postMessage({ command: 'exportTo0x0' }); });
              
              function askAboutAttack() {
                  const q = (document.getElementById('qaInput').value || '').trim();
                  if (!q) return;
                  document.getElementById('qaInput').value = '';
                  const el = document.createElement('div');
                  el.className = 'qa-response';
                  el.innerHTML = '<strong>You:</strong> ' + escapeHtml(q);
                  document.getElementById('qaResponses').appendChild(el);
                  vscode.postMessage({ command: 'askAboutAttack', question: q });
              }
              
              function escapeHtml(s) {
                  const d = document.createElement('div');
                  d.textContent = s;
                  return d.innerHTML;
              }
              
              function addFeedItem(ev) {
                  const feed = document.getElementById('activityFeed');
                  const div = document.createElement('div');
                  div.className = 'feed-item ' + (ev.type || 'info');
                  const time = new Date().toLocaleTimeString();
                  const dataStr = ev.data && Object.keys(ev.data).length ? JSON.stringify(ev.data).slice(0, 200) : '';
                  div.innerHTML = '<span class="feed-time">' + time + '</span><span class="feed-type">' + (ev.type || 'Event') + '</span><div class="feed-content">' + escapeHtml(ev.content || '') + (dataStr ? '<br><small>' + escapeHtml(dataStr) + '</small>' : '') + '</div>';
                  feed.appendChild(div);
                  feed.scrollTop = feed.scrollHeight;
                  while (feed.children.length > MAX_FEED_ITEMS) feed.removeChild(feed.firstChild);
              }
              
              window.addEventListener('message', event => {
                  const m = event.data;
                  if (m.command === 'dastEvent') {
                      const ev = m.event;
                      const d = ev.data || {};
                      let content = ev.type.replace(/_/g, ' ');
                      if (d.targetUrl) content += ': ' + d.targetUrl;
                      if (d.type) content += ' - ' + d.type;
                      if (d.severity) content += ' (' + d.severity + ')';
                      if (d.title) content += ': ' + d.title;
                      if (d.count !== undefined) content += ' - ' + d.count + ' endpoints';
                      addFeedItem({ type: ev.type, content: content, data: d });
                  } else if (m.command === 'pentestComplete') {
                      document.getElementById('startPentestBtn').disabled = false;
                      document.getElementById('statusBadge').textContent = 'Complete';
                      document.getElementById('statusBadge').className = 'status-badge complete';
                      const summary = m.summary || {};
                      const vulnCount = m.vulnerabilities?.length || 0;
                      const notConfirmed = Math.max(0, (m.attacksPerformed || 0) - vulnCount);
                      addFeedItem({ type: 'scan_completed', content: 'Pentest complete. Vulnerabilities: ' + vulnCount + ' (Critical: ' + (summary.critical || 0) + ', High: ' + (summary.high || 0) + ', Medium: ' + (summary.medium || 0) + '). ' + 
                        (notConfirmed > 0 ? notConfirmed + ' payloads did not confirm - review for tool improvements.' : '') });
                      var btn = document.createElement('div');
                      btn.className = 'feed-item feed-actions';
                      var actDiv = document.createElement('div');
                      actDiv.className = 'feed-content';
                      var vReport = document.createElement('button');
                      vReport.className = 'btn btn-pentest btn-terminal';
                      vReport.textContent = 'View Full Report';
                      vReport.style.marginRight = '8px';
                      vReport.onclick = function() { vscode.postMessage({ command: 'viewResults' }); };
                      var vImprove = document.createElement('button');
                      vImprove.className = 'btn btn-pentest btn-terminal';
                      vImprove.textContent = 'View Improvements';
                      vImprove.title = 'Open results and scroll to payloads that did not confirm vulnerabilities';
                      vImprove.style.marginRight = '8px';
                      vImprove.onclick = function() { vscode.postMessage({ command: 'viewResults', focusImprovements: true }); };
                      var wRoom = document.createElement('button');
                      wRoom.className = 'btn btn-warroom btn-terminal';
                      wRoom.textContent = 'War Room Live';
                      wRoom.onclick = function() { vscode.postMessage({ command: 'openWarRoomLive' }); };
                      actDiv.appendChild(vReport);
                      actDiv.appendChild(vImprove);
                      actDiv.appendChild(wRoom);
                      btn.innerHTML = '<span class="feed-type">Actions</span>';
                      btn.appendChild(actDiv);
                      document.getElementById('activityFeed').appendChild(btn);
                  } else if (m.command === 'pentestError') {
                      document.getElementById('startPentestBtn').disabled = false;
                      document.getElementById('statusBadge').textContent = 'Error';
                      document.getElementById('statusBadge').className = 'status-badge';
                      addFeedItem({ type: 'error', content: 'Pentest failed: ' + (m.error || 'Unknown error') });
                  } else if (m.command === 'warRoomPort') {
                      addFeedItem({ type: 'info', content: 'War Room opened at http://localhost:' + m.port });
                  } else if (m.command === 'askResponse') {
                      const el = document.createElement('div');
                      el.className = 'qa-response';
                      el.innerHTML = '<strong>AI:</strong> ' + (m.response || 'No response');
                      document.getElementById('qaResponses').appendChild(el);
                  }
              });
              
              document.getElementById('qaInput').addEventListener('keydown', function(e) {
                  if (e.key === 'Enter') { e.preventDefault(); askAboutAttack(); }
              });
          </script>
      </body>
      </html>
    `;
  }

  private setupMessageHandlers(): void {
    if (!this.panel) return;

    this.panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'startPentest':
          await this.runPentest(message.targetUrl);
          break;
        case 'openWarRoomLive':
          await this.openWarRoomLive();
          break;
        case 'askAboutAttack':
          await this.answerAttackQuestion(message.question);
          break;
        case 'viewResults':
          await vscode.commands.executeCommand('ciphermate.showPentestResults');
          break;
        case 'exportTo0x0':
          await vscode.commands.executeCommand('ciphermate.uploadPentestFindings');
          break;
        case 'viewLastPentest':
          await vscode.commands.executeCommand('ciphermate.viewPentestImprovements');
          break;
        case 'executeAttack':
          await this.executeAttack(message.attackType, message.target);
          break;
        case 'generatePayload':
          await this.generatePayload(message.payloadType, message.parameters);
          break;
        case 'obfuscateCode':
          await this.obfuscateCode(message.code);
          break;
        case 'trainAI':
          await this.trainAI(message.data);
          break;
        case 'executeActualScan':
          await this.executeActualScan(message.target);
          break;
      }
    });
  }

  private async runPentest(targetUrl: string): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration('ciphermate');
      const orchestrator = new AgentOrchestrator(this.context);
      const result = await orchestrator.run({
        targetUrl,
        discoverFromWorkspace: true,
        pentestMode: true,
        wafEvasion: config.get<boolean>('dast.wafEvasion', true),
        unrestrictedMode: config.get<boolean>('dast.unrestrictedMode', true),
        enableExternalTools: config.get<boolean>('dast.enableExternalTools', true),
        enableAIResponseAnalysis: config.get<boolean>('dast.enableAIAnalysis', true),
        enableContextAware: config.get<boolean>('dast.enableContextAware', true),
        enableDeepDive: true,
        maxDeepDiveAgents: config.get<number>('dast.pentestAgentSwarmSize', 100),
        agentsPerFinding: config.get<number>('dast.pentestAgentsPerFinding', 4),
        resilienceRetries: config.get<number>('dast.resilienceRetries', 12),
        maxEndpoints: config.get<number>('dast.pentestMaxEndpoints', 1000),
        concurrency: config.get<number>('dast.pentestConcurrency', 80),
        brutalMode: true,
        adaptiveThrottling: false,
        enableGraphQL: true,
        enableJwtOAuth: true,
        enableIdor: true,
        enableFileUploadTests: config.get<boolean>('dast.enableFileUploadTests', true),
      });
      this.lastPentestResult = {
        targetUrl,
        vulnerabilities: result.vulnerabilities || []
      };
      if (this.panel) {
        this.panel.webview.postMessage({
          command: 'pentestComplete',
          targetUrl,
          vulnerabilities: result.vulnerabilities,
          endpointsTested: result.endpointsTested ?? 0,
          attacksPerformed: result.attacksPerformed ?? 0,
          duration: result.duration ?? 0,
          summary: {
            critical: result.vulnerabilities?.filter((v: any) => v.severity === 'critical').length ?? 0,
            high: result.vulnerabilities?.filter((v: any) => v.severity === 'high').length ?? 0,
            medium: result.vulnerabilities?.filter((v: any) => v.severity === 'medium').length ?? 0,
          }
        });
      }
      await this.savePentestAndShowResults(targetUrl, result);
    } catch (error) {
      if (this.panel) {
        this.panel.webview.postMessage({
          command: 'pentestError',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  private async savePentestAndShowResults(targetUrl: string, result: any): Promise<void> {
    const vulnerabilities = result.vulnerabilities || [];
    const mapped = vulnerabilities.map((v: any) => {
      const meta = { ...(v.metadata || {}) };
      if (v.payload) meta.payload = v.payload;
      if (v.curlReplay) meta.curlReplay = v.curlReplay;
      if (v.responseSnippet) meta.responseSnippet = v.responseSnippet;
      if (v.responseStatus != null) meta.responseStatus = v.responseStatus;
      if (v.paramName) meta.paramName = v.paramName;
      if (v.paramLocation) meta.paramLocation = v.paramLocation;
      if (v.evidence) meta.evidence = v.evidence;
      return {
        tool: 'PENTEST',
        path: v.endpoint || targetUrl,
        file: v.endpoint || targetUrl,
        start: { line: 0 },
        extra: { message: v.description || v.title },
        severity: (v.severity || 'info').toUpperCase(),
        type: v.type,
        description: v.description,
        recommendation: v.recommendation,
        curlReplay: v.curlReplay,
        payload: v.payload,
        responseSnippet: v.responseSnippet,
        metadata: Object.keys(meta).length ? meta : undefined,
        ...v,
      };
    });
    this.context.globalState.update('ciphermate.pendingPentestResults', {
      vulnerabilities: mapped,
      targetUrl,
      endpointsTested: result.endpointsTested ?? 0,
      attacksPerformed: result.attacksPerformed ?? 0,
      duration: result.duration ?? 0,
    });
    await vscode.commands.executeCommand('ciphermate.showPentestResults');
  }

  private async openWarRoomLive(): Promise<void> {
    try {
      const fonts = getFontConfigRaw();
      const port = await startWarRoomServer(undefined, { fontFamily: fonts.fontFamily, fontFamilyCode: fonts.fontFamilyCode });
      const uri = vscode.Uri.parse(`http://localhost:${port}`);
      await vscode.env.openExternal(uri);
      if (this.panel) {
        this.panel.webview.postMessage({ command: 'warRoomPort', port });
      }
    } catch (error) {
      if (this.panel) {
        this.panel.webview.postMessage({
          command: 'pentestError',
          error: `Failed to open War Room: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }
  }

  private async answerAttackQuestion(question: string): Promise<void> {
    try {
      const response = await vscode.commands.executeCommand<string>('ciphermate.askAIAboutPentest', {
        question,
        targetUrl: this.lastPentestResult?.targetUrl,
        vulnerabilities: this.lastPentestResult?.vulnerabilities,
      });
      if (this.panel) {
        this.panel.webview.postMessage({ command: 'askResponse', response: response || 'No response.' });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const fallback = `Could not get AI answer: ${errMsg}. Make sure your AI provider (OpenRouter, OpenAI, etc.) is configured in CipherMate Settings.`;
      if (this.panel) {
        this.panel.webview.postMessage({ command: 'askResponse', response: fallback });
      }
    }
  }

  private async executeAttack(attackType: string, target: string): Promise<void> {
    const operation: AttackOperation = {
      id: crypto.randomUUID(),
      type: attackType,
      target: target,
      status: 'running',
      startTime: new Date(),
      results: []
    };

    this.attackHistory.push(operation);

    // Execute the attack based on type
    switch (attackType) {
      case 'penetration-test':
        await this.executePenetrationTest(target);
        break;
      case 'network-scan':
        await this.executeNetworkScan(target);
        break;
      case 'web-test':
        await this.executeWebSecurityTest(target);
        break;
      case 'mobile-test':
        await this.executeMobileSecurityTest(target);
        break;
      case 'social-engineering':
        await this.executeSocialEngineering(target);
        break;
    }
  }

  private async executePenetrationTest(target: string): Promise<void> {
    // Implementation for penetration testing
    console.log(`Executing penetration test on ${target}`);
  }

  private async executeNetworkScan(target: string): Promise<void> {
    // Implementation for network scanning
    console.log(`Executing network scan on ${target}`);
  }

  private async executeWebSecurityTest(target: string): Promise<void> {
    // Implementation for web security testing
    console.log(`Executing web security test on ${target}`);
  }

  private async executeMobileSecurityTest(target: string): Promise<void> {
    // Implementation for mobile security testing
    console.log(`Executing mobile security test on ${target}`);
  }

  private async executeSocialEngineering(target: string): Promise<void> {
    // Implementation for social engineering
    console.log(`Executing social engineering on ${target}`);
  }

  private async generatePayload(payloadType: string, parameters: any): Promise<void> {
    const payload = await this.payloadGenerator.generate(payloadType, parameters);
    console.log(`Generated payload: ${payload}`);
  }

  private async obfuscateCode(code: string): Promise<void> {
    const obfuscated = await this.codeObfuscator.obfuscate(code);
    console.log(`Obfuscated code: ${obfuscated}`);
  }

  private async trainAI(data: any): Promise<void> {
    await this.learningEngine.train(data);
    console.log('AI training completed');
  }

  private async executeActualScan(target: string): Promise<void> {
    try {
      // Initialize penetration testing engine
      const penetrationEngine = new PenetrationTestingEngine(this.context);
      
      // Perform actual reconnaissance
      const scanResult = await penetrationEngine.performComprehensiveTest(target);
      
      // Send results back to webview
      if (this.panel) {
        this.panel.webview.postMessage({
          command: 'scanResults',
          target: target,
          results: scanResult
        });
      }
      
    } catch (error) {
      console.error('Actual scan failed:', error);
      
      // Generate AI explanation for the error
      const errorExplanation = await this.generateErrorExplanation(error, target);
      
      if (this.panel) {
        this.panel.webview.postMessage({
          command: 'scanError',
          target: target,
          error: error instanceof Error ? error.message : String(error),
          explanation: errorExplanation
        });
      }
    }
  }

  private async generateErrorExplanation(error: any, target: string): Promise<string> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // AI-powered error analysis and explanation
    if (errorMessage.includes('root privileges')) {
      return `<strong>[SECURITY] Privilege Escalation Required</strong><br><br>
              <strong>Issue:</strong> The scan requires administrator/root privileges to perform SYN scans.<br><br>
              <strong>Explanation:</strong> SYN scans (-sS) are stealthier but require raw socket access, which needs elevated privileges.<br><br>
              <strong>Solutions:</strong><br>
              • Run VS Code as administrator/root<br>
              • Use TCP connect scans (-sT) instead<br>
              • Use alternative scanning tools<br>
              • Configure sudo access for nmap<br><br>
              <strong>Alternative Commands:</strong><br>
              • <code>nmap -sT -sV ${target}</code> (TCP connect scan)<br>
              • <code>nmap -sU ${target}</code> (UDP scan)<br>
              • <code>nmap -sC -sV ${target}</code> (Script scan)`;
    }
    
    if (errorMessage.includes('command not found')) {
      return `<strong>[ERROR] Tool Not Installed</strong><br><br>
              <strong>Issue:</strong> Required scanning tools are not installed on the system.<br><br>
              <strong>Explanation:</strong> The penetration testing engine requires tools like nmap, dig, or nslookup.<br><br>
              <strong>Solutions:</strong><br>
              • Install nmap: <code>brew install nmap</code> (macOS)<br>
              • Install nmap: <code>apt install nmap</code> (Ubuntu/Debian)<br>
              • Install nmap: <code>yum install nmap</code> (CentOS/RHEL)<br>
              • Use online scanning services as alternatives<br><br>
              <strong>Verification:</strong><br>
              • Check if nmap is installed: <code>which nmap</code><br>
              • Test nmap: <code>nmap --version</code>`;
    }
    
    if (errorMessage.includes('network') || errorMessage.includes('connection')) {
      return `<strong>[NETWORK] Connectivity Issue</strong><br><br>
              <strong>Issue:</strong> Unable to establish network connection to the target.<br><br>
              <strong>Explanation:</strong> This could be due to network restrictions, firewall blocking, or target unavailability.<br><br>
              <strong>Solutions:</strong><br>
              • Check internet connectivity<br>
              • Verify target domain/IP is reachable<br>
              • Check firewall settings<br>
              • Try different network interface<br>
              • Use VPN if behind corporate firewall<br><br>
              <strong>Diagnostics:</strong><br>
              • Test connectivity: <code>ping ${target}</code><br>
              • Check DNS: <code>nslookup ${target}</code><br>
              • Test specific port: <code>telnet ${target} 80</code>`;
    }
    
    if (errorMessage.includes('permission') || errorMessage.includes('access denied')) {
      return `<strong>[PERMISSION] Access Denied</strong><br><br>
              <strong>Issue:</strong> Insufficient permissions to execute the scan.<br><br>
              <strong>Explanation:</strong> The system is blocking the scan due to security policies or insufficient privileges.<br><br>
              <strong>Solutions:</strong><br>
              • Run with elevated privileges<br>
              • Check system security policies<br>
              • Use alternative scanning methods<br>
              • Configure proper permissions<br><br>
              <strong>Alternative Approaches:</strong><br>
              • Use web-based scanning tools<br>
              • Try different scanning techniques<br>
              • Use proxy or VPN services`;
    }
    
    // Generic error explanation
    return `<strong>[ERROR] Scan Execution Failed</strong><br><br>
            <strong>Issue:</strong> The scan encountered an unexpected error.<br><br>
            <strong>Error Details:</strong> ${errorMessage}<br><br>
            <strong>Possible Causes:</strong><br>
            • System resource limitations<br>
            • Network configuration issues<br>
            • Tool compatibility problems<br>
            • Security software interference<br><br>
            <strong>Recommended Actions:</strong><br>
            • Check system resources (CPU, memory)<br>
            • Verify network configuration<br>
            • Update scanning tools<br>
            • Check security software settings<br>
            • Try scanning a different target<br><br>
            <strong>Fallback Options:</strong><br>
            • Use online vulnerability scanners<br>
            • Try alternative scanning tools<br>
            • Use web-based reconnaissance services`;
  }

  dispose(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = null;
    }
  }
}

// Supporting classes
interface AttackOperation {
  id: string;
  type: string;
  target: string;
  status: 'running' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  results: any[];
}

class AIAttackEngine {
  async train(data: any): Promise<void> {
    // AI training implementation
    console.log('Training AI with new data:', data);
  }

  async analyze(target: string): Promise<any> {
    // AI analysis implementation
    return { target, analysis: 'AI analysis results' };
  }
}

class SocialEngineeringToolkit {
  async generateCampaign(target: string): Promise<any> {
    // Social engineering campaign generation
    return { target, campaign: 'Generated campaign' };
  }
}

class CodeObfuscator {
  async obfuscate(code: string): Promise<string> {
    // Code obfuscation implementation
    return `// Obfuscated: ${code}`;
  }
}

class PayloadGenerator {
  async generate(type: string, parameters: any): Promise<string> {
    // Payload generation implementation
    return `// Generated payload: ${type}`;
  }
}
