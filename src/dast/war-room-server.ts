/**
 * DAST War Room - Localhost dashboard server
 *
 * Tech hacky view of AI's actions: live stream + session replay.
 * Open in browser: http://localhost:PORT
 */

import * as http from 'http';
import * as url from 'url';
import { dastEventBus } from './dast-event-bus';
import type { DastEvent } from './dast-event-bus';

const DEFAULT_PORT = 38521;

let server: http.Server | null = null;
let sseClients: { res: http.ServerResponse }[] = [];
let unsubscribe: (() => void) | null = null;

function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CipherMate DAST War Room</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Share+Tech+Mono&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0a0e14;
      --surface: #0d1117;
      --border: #1f2937;
      --green: #00ff88;
      --red: #ff4444;
      --amber: #ffb020;
      --cyan: #00d4ff;
      --muted: #6b7280;
    }
    body {
      font-family: 'JetBrains Mono', 'Share Tech Mono', monospace;
      background: var(--bg);
      color: var(--green);
      min-height: 100vh;
      overflow: hidden;
    }
    .scan-line { position: fixed; left: 0; right: 0; height: 1px; background: linear-gradient(90deg,transparent,var(--cyan),transparent); opacity: 0.3; animation: scan 3s linear infinite; }
    @keyframes scan { 0% { top: 0; } 100% { top: 100vh; } }
    .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; grid-template-rows: auto 1fr 1fr; gap: 8px; padding: 8px; height: 100vh; }
    .panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 4px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .panel.full { grid-column: 1 / -1; }
    .panel-tit {
      padding: 8px 12px;
      background: rgba(0,255,136,0.08);
      border-bottom: 1px solid var(--border);
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .panel-body {
      flex: 1;
      overflow: auto;
      padding: 8px;
      font-size: 11px;
      line-height: 1.5;
    }
    .event { margin-bottom: 6px; padding: 6px 8px; border-left: 3px solid var(--muted); background: rgba(0,0,0,0.2); border-radius: 0 4px 4px 0; }
    .event.strategist { border-color: var(--cyan); }
    .event.payload { border-color: var(--amber); }
    .event.response { border-color: #888; }
    .event.vuln { border-color: var(--red); }
    .event.vuln.high-plus { border-color: var(--red); background: rgba(255,68,68,0.15); box-shadow: 0 0 12px rgba(255,68,68,0.3); }
    .event.promising { border-color: var(--amber); }
    .event.deepdive { border-color: var(--cyan); }
    .event.completed { border-color: var(--green); }
    .event.error { border-color: var(--red); }
    .ts { color: var(--muted); font-size: 10px; }
    .type { color: var(--cyan); }
    .data { color: #e5e7eb; word-break: break-all; margin-top: 4px; }
    .header-row { display: flex; justify-content: space-between; padding: 12px 16px; background: rgba(0,0,0,0.3); border-bottom: 1px solid var(--border); }
    .header-row h1 { font-size: 14px; }
    .timeline { height: 60px; display: flex; align-items: center; padding: 0 12px; gap: 4px; background: rgba(0,0,0,0.3); }
    .timeline-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); cursor: pointer; }
    .timeline-dot.active { background: var(--green); box-shadow: 0 0 8px var(--green); }
    .timeline-dot.vuln { background: var(--red); }
    .sessions-list { list-style: none; }
    .sessions-list li { padding: 8px 12px; border-bottom: 1px solid var(--border); cursor: pointer; }
    .sessions-list li:hover { background: rgba(0,255,136,0.1); }
    .replay-bar { padding: 8px 12px; display: flex; gap: 8px; align-items: center; }
    .replay-bar button { padding: 4px 12px; background: var(--border); border: none; color: var(--green); border-radius: 4px; cursor: pointer; font-family: inherit; }
    .replay-bar button:hover { background: #374151; }
    .replay-bar input[type="range"] { flex: 1; }
    select { background: var(--surface); color: var(--green); border: 1px solid var(--border); padding: 4px 8px; border-radius: 4px; font-family: inherit; }
  </style>
</head>
<body>
  <div class="scan-line"></div>
  <div class="header-row">
    <h1>🔓 CipherMate DAST War Room</h1>
    <div>
      <label>Session: <select id="sessionSelect"></select></label>
      <button id="liveBtn">LIVE</button>
      <button id="recordBtn">⏺ Record Video</button>
      <span id="recordStatus"></span>
    </div>
  </div>
  <div class="grid">
    <div class="panel">
      <div class="panel-tit">Strategy & Context</div>
      <div class="panel-body" id="strategyPanel"></div>
    </div>
    <div class="panel">
      <div class="panel-tit">Attack Feed (payloads → responses)</div>
      <div class="panel-body" id="attackPanel"></div>
    </div>
    <div class="panel">
      <div class="panel-tit">Findings & Deep-Dive</div>
      <div class="panel-body" id="findingsPanel"></div>
    </div>
    <div class="panel full">
      <div class="panel-tit">Timeline (screen-record style)</div>
      <div class="replay-bar">
        <button id="playBtn">▶ Play</button>
        <button id="pauseBtn">⏸ Pause</button>
        <input type="range" id="scrubber" min="0" max="100" value="0">
        <span id="replayProgress">0 / 0</span>
      </div>
      <div class="panel-body" id="timelinePanel"></div>
    </div>
  </div>
  <script>
    const strategyPanel = document.getElementById('strategyPanel');
    const attackPanel = document.getElementById('attackPanel');
    const findingsPanel = document.getElementById('findingsPanel');
    const timelinePanel = document.getElementById('timelinePanel');
    const sessionSelect = document.getElementById('sessionSelect');
    const scrubber = document.getElementById('scrubber');
    const playBtn = document.getElementById('playBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const replayProgress = document.getElementById('replayProgress');
    const liveBtn = document.getElementById('liveBtn');

    let events = [];
    let currentSessionId = null;
    let isLive = true;
    let replayIndex = 0;
    let replayTimer = null;
    const MAX_EVENTS = 500;

    function addEvent(panel, ev, cls = '') {
      const d = ev.data || {};
      const dataStr = Object.keys(d).length ? JSON.stringify(d).slice(0, 280) : '';
      const time = new Date(ev.ts).toLocaleTimeString();
      const div = document.createElement('div');
      div.className = 'event ' + cls + (d.isHighPlus ? ' high-plus' : '');
      div.innerHTML = '<span class="ts">' + time + '</span> <span class="type">' + ev.type + '</span>' + (d.isHighPlus ? ' <strong>⚠ HIGH+</strong>' : '') + '<div class="data">' + dataStr + '</div>';
      panel.appendChild(div);
      panel.scrollTop = panel.scrollHeight;
      while (panel.children.length > MAX_EVENTS) panel.removeChild(panel.firstChild);
    }

    function routeEvent(ev) {
      if (ev.type.includes('strategist') || ev.type === 'target_context_built') {
        addEvent(strategyPanel, ev, 'strategist');
      } else if (ev.type === 'payload_sent' || ev.type === 'response_received') {
        addEvent(attackPanel, ev, ev.type === 'payload_sent' ? 'payload' : 'response');
      } else if (ev.type === 'vuln_confirmed' || ev.type === 'promising_finding' || ev.type.includes('deep_dive') || ev.type === 'scan_completed') {
        addEvent(findingsPanel, ev, ev.type === 'vuln_confirmed' ? 'vuln' : ev.type.includes('deep') ? 'deepdive' : ev.type === 'scan_completed' ? 'completed' : 'promising');
      }
    }

    const es = new EventSource('/events');
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      const show = isLive || (currentSessionId && ev.sessionId === currentSessionId);
      if (show) {
        events.push(ev);
        routeEvent(ev);
      }
    };

    async function loadSessions() {
      const r = await fetch('/api/sessions');
      const ids = await r.json();
      sessionSelect.innerHTML = '<option value="">-- Select --</option>' + ids.map(id => '<option value="' + id + '">' + id + '</option>').join('');
    }
    loadSessions();

    sessionSelect.onchange = async () => {
      const id = sessionSelect.value;
      if (!id) return;
      currentSessionId = id;
      isLive = false;
      const r = await fetch('/api/sessions/' + encodeURIComponent(id));
      events = await r.json();
      strategyPanel.innerHTML = attackPanel.innerHTML = findingsPanel.innerHTML = '';
      scrubber.max = Math.max(events.length - 1, 0);
      scrubber.value = 0;
      replayIndex = 0;
      replayProgress.textContent = '0 / ' + events.length;
      timelinePanel.innerHTML = events.slice(0, 150).map((e, i) => '<span class="timeline-dot ' + (e.type === 'vuln_confirmed' ? 'vuln' : '') + '" data-i="' + i + '" title="' + e.type + '"></span>').join('');
    };

    scrubber.oninput = () => {
      replayIndex = parseInt(scrubber.value, 10);
      strategyPanel.innerHTML = attackPanel.innerHTML = findingsPanel.innerHTML = '';
      events.slice(0, replayIndex + 1).forEach(ev => routeEvent(ev));
      replayProgress.textContent = replayIndex + ' / ' + events.length;
    };

    playBtn.onclick = () => {
      if (replayIndex >= events.length) replayIndex = 0;
      replayTimer = setInterval(() => {
        replayIndex++;
        scrubber.value = replayIndex;
        scrubber.dispatchEvent(new Event('input'));
        if (replayIndex >= events.length) clearInterval(replayTimer);
      }, 80);
    };
    pauseBtn.onclick = () => clearInterval(replayTimer);

    liveBtn.onclick = () => {
      isLive = true;
      currentSessionId = null;
      loadSessions();
    };

    // Screen-record video export (real .webm video)
    const recordBtn = document.getElementById('recordBtn');
    const recordStatus = document.getElementById('recordStatus');
    let mediaRecorder = null;
    let recordedChunks = [];
    recordBtn.onclick = async () => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        recordStatus.textContent = 'Encoding...';
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e) => { if (e.data.size) recordedChunks.push(e.data); };
        mediaRecorder.onstop = () => {
          stream.getTracks().forEach(t => t.stop());
          const blob = new Blob(recordedChunks, { type: 'video/webm' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'dast-war-room-' + new Date().toISOString().slice(0,19).replace(/[:-]/g,'') + '.webm';
          a.click();
          URL.revokeObjectURL(a.href);
          recordStatus.textContent = 'Saved.';
          recordBtn.textContent = '⏺ Record Video';
          setTimeout(() => recordStatus.textContent = '', 2000);
        };
        mediaRecorder.start();
        recordBtn.textContent = '⏹ Stop & Save';
        recordStatus.textContent = 'Recording...';
      } catch (e) {
        recordStatus.textContent = 'Denied or unavailable';
        setTimeout(() => recordStatus.textContent = '', 3000);
      }
    };
  </script>
</body>
</html>`;
}

function sendSse(ev: DastEvent): void {
  const line = `data: ${JSON.stringify(ev)}\n\n`;
  sseClients = sseClients.filter(({ res }) => {
    try {
      res.write(line);
      return true;
    } catch {
      return false;
    }
  });
}

export function startWarRoomServer(port: number = DEFAULT_PORT): Promise<number> {
  return new Promise((resolve, reject) => {
    if (server) {
      resolve(port);
      return;
    }

    server = http.createServer((req, res) => {
      const parsed = url.parse(req.url || '/', true);
      const pathname = parsed.pathname || '/';

      if (pathname === '/' || pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(getDashboardHtml());
        return;
      }

      if (pathname === '/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        res.write('\n');
        sseClients.push({ res });
        req.on('close', () => {
          sseClients = sseClients.filter(c => c.res !== res);
        });
        return;
      }

      if (pathname.startsWith('/api/sessions/')) {
        const sessionId = decodeURIComponent(pathname.replace('/api/sessions/', ''));
        const events = dastEventBus.getSessionEvents(sessionId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(events));
        return;
      }

      if (pathname === '/api/sessions') {
        const sessions = dastEventBus.getAllSessions();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(sessions));
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    unsubscribe = dastEventBus.onEvent(sendSse);

    server.listen(port, 'localhost', () => {
      const addr = server!.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      console.log(`DAST War Room: http://localhost:${actualPort}`);
      resolve(actualPort);
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        server = null;
        startWarRoomServer(port + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
}

export function stopWarRoomServer(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  sseClients = [];
  if (server) {
    server.close();
    server = null;
  }
}

export function getWarRoomPort(): number {
  return DEFAULT_PORT;
}
