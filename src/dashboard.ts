#!/usr/bin/env tsx
/**
 * Web Dashboard — visual proof that the agent is alive.
 *
 * Serves a live HTML dashboard at http://localhost:3456 showing:
 *   - Current prices, volume, liquidity from last scan
 *   - Decision history sparkline per token
 *   - Escalation alerts
 *   - Auto-refreshes every 30s (non-intrusive)
 *
 * Usage:
 *   npm run dashboard
 */

import { config } from 'dotenv'
config({ path: ['.env.local', '.env'], quiet: true })

import { createServer, IncomingMessage, ServerResponse } from 'http'
import { readFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'

const PORT = parseInt(process.env.DASHBOARD_PORT ?? '3456')
const ROOT = process.cwd()

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
}

// ── Dashboard HTML (inline — no build step) ────────────────────────

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="refresh" content="60">
<title>RH Chain Watcher — Live Dashboard</title>
<style>
  :root {
    --fg: #f0f0f0;
    --bg: #0d1117;
    --card: #161b22;
    --border: #30363d;
    --accent: #58a6ff;
    --green: #3fb950;
    --yellow: #d2991d;
    --red: #f85149;
    --muted: #8b949e;
    --radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: var(--bg);
    color: var(--fg);
    padding: 24px;
    max-width: 1200px;
    margin: 0 auto;
  }
  header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border);
  }
  header h1 { font-size: 1.5rem; font-weight: 600; }
  header .status { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 0.85rem; }
  header .live { width: 8px; height: 8px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
  }
  .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .card-header h2 { font-size: 1.1rem; }
  .decision-badge {
    font-size: 0.8rem; font-weight: 600; padding: 2px 10px; border-radius: 12px;
    text-transform: uppercase;
  }
  .ENTRY { background: rgba(63,185,80,0.15); color: var(--green); }
  .WATCH { background: rgba(210,153,29,0.15); color: var(--yellow); }
  .IGNORE { background: rgba(248,81,73,0.15); color: var(--red); }
  .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
  .metric { text-align: center; }
  .metric-label { font-size: 0.7rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .metric-value { font-size: 0.95rem; font-weight: 600; margin-top: 2px; }
  .metric-value.down { color: var(--red); }
  .metric-value.up { color: var(--green); }
  .thesis { font-size: 0.85rem; color: var(--muted); line-height: 1.5; margin-bottom: 10px; }
  .risks { font-size: 0.78rem; color: var(--red); opacity: 0.85; }
  .risks ul { list-style: none; }
  .risks li::before { content: '⚠ '; }
  .sparkline { display: flex; align-items: flex-end; gap: 2px; height: 40px; margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--border); }
  .sparkline-bar { flex: 1; border-radius: 2px 2px 0 0; min-height: 3px; transition: height 0.3s; }
  .sparkline-bar.ENTRY { background: var(--green); }
  .sparkline-bar.WATCH { background: var(--yellow); }
  .sparkline-bar.IGNORE { background: var(--red); }
  .escalation { margin-top: 24px; }
  .escalation h2 { font-size: 1.1rem; margin-bottom: 12px; }
  .alert-card {
    padding: 12px 16px; border-radius: var(--radius); margin-bottom: 8px;
    font-size: 0.85rem; line-height: 1.6;
  }
  .alert-card.urgent { background: rgba(248,81,73,0.1); border: 1px solid rgba(248,81,73,0.2); }
  .alert-card.warn { background: rgba(210,153,29,0.1); border: 1px solid rgba(210,153,29,0.2); }
  .alert-card.info { background: rgba(63,185,80,0.1); border: 1px solid rgba(63,185,80,0.2); }
  .empty { text-align: center; color: var(--muted); padding: 40px; font-size: 0.85rem; }
  footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--border); text-align: center; color: var(--muted); font-size: 0.78rem; }
</style>
</head>
<body>
<header>
  <div>
    <h1>🤖 Robinhood Chain Watcher</h1>
    <div style="font-size:0.8rem;color:var(--muted);margin-top:4px">Orbio Build Week 2026</div>
  </div>
  <div class="status"><div class="live"></div> <span id="status">loading...</span></div>
</header>

<div id="content"></div>

<div class="escalation" id="escalation"></div>

<footer>
  Powered by <strong>Orbio</strong> — one key, one agent &nbsp;|&nbsp; Auto-refresh 60s
</footer>

<script>
async function load() {
  const c = document.getElementById('content');
  const e = document.getElementById('escalation');

  try {
    const [scanR, histR] = await Promise.all([
      fetch('/.last-scan.json').then(r => r.json()),
      fetch('/.score-history.json').then(r => r.ok ? r.json() : {})
    ]);
    const scan = scanR.result || scanR;

    // Status
    const ts = scan.scanned_at ? new Date(scan.scanned_at) : new Date();
    document.getElementById('status').textContent =
      'Last scan: ' + ts.toLocaleString() + ' · ' + scan.watchlist.length + ' tokens';

    // Token cards
    c.innerHTML = '<div class="grid">' + scan.watchlist.map(tok => {
      const hist = (histR[tok.symbol] || []).slice(-10);
      const bars = hist.length > 1 ? hist.map(h => {
        const max = Math.max(...hist.map(x => x.confidence || 0), 1);
        const hPct = Math.max(8, (h.confidence / max) * 100);
        return '<div class="sparkline-bar ' + h.decision + '" style="height:' + hPct + '%" title="' + h.decision + ' ' + h.confidence + '%"></div>';
      }).join('') : '';

      const change = tok.key_levels?.includes('+') ? 'up' : tok.key_levels?.includes('-') ? 'down' : '';

      return '<div class="card">' +
        '<div class="card-header">' +
          '<h2>' + tok.symbol + '</h2>' +
          '<span class="decision-badge ' + tok.decision + '">' + tok.decision + ' (' + tok.confidence + '%)</span>' +
        '</div>' +
        '<div class="thesis">' + tok.thesis + '</div>' +
        (tok.risks?.length ? '<div class="risks"><ul>' +
          tok.risks.map(r => '<li>' + r + '</li>').join('') +
        '</ul></div>' : '') +
        (bars ? '<div class="sparkline">' + bars + '</div>' : '') +
      '</div>';
    }).join('') + '</div>';

    // No data
    if (!scan.watchlist?.length) {
      c.innerHTML = '<div class="empty">No scan data yet. Run <code>npm run scan</code> to populate.</div>';
    }

    // Escalation alerts
    const alerts = [];
    for (const [sym, entries] of Object.entries(histR)) {
      if (entries.length < 2) continue;
      const latest = entries[entries.length-1];
      const prev = entries[entries.length-2];
      if (prev.decision === 'WATCH' && latest.decision === 'ENTRY') {
        alerts.push({ cls: 'warn', text: '🔥 <b>' + sym + '</b>: WATCH → ENTRY (+' + (latest.confidence - prev.confidence) + ' confidence)' });
      } else if (prev.decision === 'ENTRY' && latest.decision === 'WATCH') {
        alerts.push({ cls: 'urgent', text: '⚠ <b>' + sym + '</b>: ENTRY → WATCH — conviction fading' });
      } else if (prev.decision === 'WATCH' && latest.decision === 'IGNORE') {
        alerts.push({ cls: 'urgent', text: '🚨 <b>' + sym + '</b>: WATCH → IGNORE — signal died' });
      } else if (latest.confidence - prev.confidence >= 20) {
        alerts.push({ cls: 'info', text: '📈 <b>' + sym + '</b>: confidence surge +' + (latest.confidence - prev.confidence) + ' points' });
      }
    }
    e.innerHTML = alerts.length
      ? '<h2>🚨 Pattern Alerts</h2>' + alerts.map(a => '<div class="alert-card ' + a.cls + '">' + a.text + '</div>').join('')
      : '<h2>🚨 Pattern Alerts</h2><div class="empty">No active patterns. All quiet.</div>';

  } catch (err) {
    c.innerHTML = '<div class="empty">Dashboard loading... waiting for first scan.</div>';
    document.getElementById('status').textContent = 'no data yet';
  }
}
load();
</script>
</body>
</html>`

// ── Server ──────────────────────────────────────────────────────────

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = req.url ?? '/'

  // API: serve data files
  if (url === '/.last-scan.json' || url === '/.score-history.json' || url === '/.trending.json') {
    const filePath = join(ROOT, url)
    if (!existsSync(filePath)) {
      res.writeHead(404)
      res.end(JSON.stringify({ error: 'not found' }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(readFileSync(filePath, 'utf-8'))
    return
  }

  // Main dashboard
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(DASHBOARD_HTML)
    return
  }

  // Static files (CSS/JS if any)
  const ext = extname(url)
  if (MIME[ext]) {
    const filePath = join(ROOT, url)
    if (existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': MIME[ext] })
      res.end(readFileSync(filePath))
      return
    }
  }

  res.writeHead(404)
  res.end('404')
})

server.listen(PORT, () => {
  console.log(`\n📊 Dashboard → http://localhost:${PORT}`)
  console.log('   Auto-refreshes every 60s — leave it open in a browser tab.\n')
})