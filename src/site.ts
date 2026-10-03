#!/usr/bin/env tsx
/**
 * SWATCH Site — minimal live dashboard website.
 *
 * Hero stats + live price chart (DexScreener embed) + watchers +
 * signals + demo + links. No build step, no keys needed.
 *
 * Usage: npm run site  →  http://localhost:3457
 */

import { config } from 'dotenv'
config({ path: ['.env.local', '.env'], quiet: true })

import { createServer, IncomingMessage, ServerResponse } from 'http'
import { readFileSync, existsSync } from 'fs'
import { join, extname } from 'path'

const PORT = parseInt(process.env.SITE_PORT ?? '3457')
const ROOT = process.cwd()

const ORBIO_CA = '0xAa07A0e9209e16aC99708C3EC70159c6eF3128A3'
const MAIN_PAIR = '0xea9f200e13055b82f175f44f592c4c13dd8c9d9320a66487d3c5cd90d68550ef'

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SWATCH — Swiss-Army Watcher</title>
<style>
  :root { --fg:#111; --muted:#6b7280; --line:#e5e7eb; --bg:#fff; --soft:#f9fafb; --acc:#16a34a; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:var(--fg); background:var(--bg); line-height:1.6; }
  .wrap { max-width:960px; margin:0 auto; padding:0 20px; }
  nav { display:flex; justify-content:space-between; align-items:center; padding:18px 0; border-bottom:1px solid var(--line); }
  nav .logo { font-weight:700; font-size:1.1rem; letter-spacing:-0.01em; }
  nav .logo span { color:var(--acc); }
  nav a { color:var(--muted); text-decoration:none; font-size:0.9rem; margin-left:18px; }
  nav a:hover { color:var(--fg); }
  .live-dot { display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--acc); margin-right:6px; animation:pulse 2s infinite; }
  @keyframes pulse { 50% { opacity:0.35; } }
  .hero { padding:56px 0 32px; }
  .hero h1 { font-size:2.4rem; letter-spacing:-0.03em; line-height:1.15; max-width:640px; }
  .hero p { color:var(--muted); margin-top:12px; max-width:600px; font-size:1.05rem; }
  .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin:28px 0 8px; }
  .stat { border:1px solid var(--line); border-radius:10px; padding:14px 16px; }
  .stat .k { font-size:0.72rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--muted); }
  .stat .v { font-size:1.35rem; font-weight:700; letter-spacing:-0.02em; margin-top:2px; }
  .stat .v.up { color:var(--acc); } .stat .v.down { color:#dc2626; }
  section { padding:32px 0; border-top:1px solid var(--line); }
  section h2 { font-size:1.25rem; letter-spacing:-0.02em; margin-bottom:6px; }
  section .sub { color:var(--muted); font-size:0.92rem; margin-bottom:18px; }
  .chart { border:1px solid var(--line); border-radius:12px; overflow:hidden; }
  .chart iframe { display:block; width:100%; height:480px; border:0; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px; }
  .card { border:1px solid var(--line); border-radius:10px; padding:16px; background:var(--soft); }
  .card h3 { font-size:1rem; }
  .card .meta { font-size:0.82rem; color:var(--muted); margin-top:4px; }
  .sig { border-left:3px solid var(--acc); background:var(--soft); border-radius:0 8px 8px 0; padding:12px 16px; margin-bottom:10px; font-size:0.92rem; }
  .sig.alert { border-color:#dc2626; }
  .sig .s { color:var(--muted); font-size:0.82rem; margin-top:4px; }
  pre.demo { background:#0d1117; color:#c9d1d9; border-radius:12px; padding:20px; font-size:0.82rem; line-height:1.7; overflow-x:auto; font-family:Consolas,monospace; }
  .btns { margin-top:16px; display:flex; gap:10px; flex-wrap:wrap; }
  .btn { display:inline-block; padding:10px 20px; border-radius:8px; font-size:0.9rem; text-decoration:none; border:1px solid var(--line); color:var(--fg); }
  .btn.primary { background:var(--fg); color:#fff; border-color:var(--fg); }
  .btn:hover { opacity:0.8; }
  code.cmd { background:var(--soft); border:1px solid var(--line); border-radius:6px; padding:2px 8px; font-size:0.85rem; }
  footer { padding:28px 0 40px; color:var(--muted); font-size:0.82rem; border-top:1px solid var(--line); display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; }
  footer a { color:var(--muted); }
  img.demo-gif { width:100%; border-radius:12px; border:1px solid var(--line); margin-top:16px; }
</style>
</head>
<body>
<div class="wrap">

<nav>
  <div class="logo"><span class="live-dot"></span>SWATCH</div>
  <div>
    <a href="#chart">Chart</a><a href="#watchers">Watchers</a><a href="#demo">Demo</a><a href="https://github.com/Uyasir146/orbio-build-week" target="_blank">Repo ↗</a>
  </div>
</nav>

<div class="hero">
  <h1>Point it at anything.<br>It watches, so you don't have to.</h1>
  <p>Swiss-Army Watcher — autonomous monitoring agent on one Orbio key. URLs, APIs, RSS feeds, on-chain addresses. Smart diffs, plain-language briefs, Telegram delivery.</p>
  <div class="stats">
    <div class="stat"><div class="k">ORBIO price</div><div class="v" id="st-price">…</div></div>
    <div class="stat"><div class="k">Liquidity</div><div class="v" id="st-liq">…</div></div>
    <div class="stat"><div class="k">24h change</div><div class="v" id="st-chg">…</div></div>
    <div class="stat"><div class="k">Signals caught</div><div class="v" id="st-sig">…</div></div>
  </div>
</div>

<section id="chart">
  <h2>Live chart</h2>
  <div class="sub">ORBIO / WETH on Robinhood Chain — powered by DexScreener.</div>
  <div class="chart"><iframe src="https://dexscreener.com/robinhood/${MAIN_PAIR}?embed=1&theme=light&trades=0&info=0"></iframe></div>
</section>

<section id="watchers">
  <h2>Watchers</h2>
  <div class="sub">Everything the agent is currently tracking.</div>
  <div class="grid" id="watcher-grid"><div class="card">Loading…</div></div>
</section>

<section id="signals">
  <h2>Recent signals</h2>
  <div class="sub">What changed, and why it matters — in plain language.</div>
  <div id="signal-list"><div class="sig">Loading…<div class="s"></div></div></div>
</section>

<section id="demo">
  <h2>Try it in 30 seconds</h2>
  <div class="sub">Zero keys, zero API calls. The mock demo produces identical output shape to the live agent.</div>
  <pre class="demo">$ git clone https://github.com/Uyasir146/orbio-build-week
$ cd orbio-build-week && npm install --legacy-peer-deps
$ npm run demo:mock

🤖 Swiss-Army Web Watcher — Dry Run Demo
━━━ WATCHERS (3) ━━━
🟢 ORBIO Token (onchain) — scans:3 signals:3
🟢 Orbio Build Page (url) — scans:2 signals:1
🟢 CoinTelegraph RSS (rss) — scans:2 signals:1
🚨 ORBIO surged 40.3% to $0.02864 — Build Week deadline nears
📈 BREAKOUT: ORBIO (-50.7% → +10.4% → +40.3%)</pre>
  <img class="demo-gif" src="/demo.gif" alt="Animated terminal demo">
  <div class="btns">
    <a class="btn primary" href="https://github.com/Uyasir146/orbio-build-week" target="_blank">View repo</a>
    <a class="btn" href="https://www.orbio.so/launchpad/launch" target="_blank">$SWATCH on Launchpad</a>
    <a class="btn" href="https://dexscreener.com/robinhood/${MAIN_PAIR}" target="_blank">DexScreener ↗</a>
  </div>
</section>

<footer>
  <div>SWATCH — Swiss-Army Watcher · one key, one agent, one inbox</div>
  <div><a href="https://github.com/Uyasir146/orbio-build-week">GitHub</a> · Powered by Orbio</div>
</footer>

</div>
<script>
const CA = '${ORBIO_CA}';
async function stats() {
  try {
    const r = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + CA).then(r => r.json());
    const rh = (r.pairs || []).filter(p => p.chainId === 'robinhood');
    rh.sort((a, b) => ((b.liquidity || {}).usd || 0) - ((a.liquidity || {}).usd || 0));
    const p = rh[0];
    if (!p) return;
    document.getElementById('st-price').textContent = '$' + Number(p.priceUsd).toFixed(5);
    document.getElementById('st-liq').textContent = '$' + Math.round((p.liquidity || {}).usd || 0).toLocaleString();
    const chg = (p.priceChange || {}).h24;
    const el = document.getElementById('st-chg');
    el.textContent = (chg > 0 ? '+' : '') + chg + '%';
    el.className = 'v ' + (chg >= 0 ? 'up' : 'down');
  } catch (e) { document.getElementById('st-price').textContent = 'offline'; }
}
async function store() {
  try {
    const s = await fetch('/api/store').then(r => r.json());
    const targets = Object.values(s.targets || {});
    document.getElementById('st-sig').textContent = targets.reduce((n, t) => n + (t.total_signals || 0), 0);
    document.getElementById('watcher-grid').innerHTML = targets.map(t =>
      '<div class="card"><h3>' + t.config.label + '</h3>' +
      '<div class="meta">' + t.config.type + ' · every ' + Math.round(t.config.current_interval_s / 60) + 'm · ' +
      t.total_signals + ' signals · noise ' + t.noise_score + '%</div></div>'
    ).join('') || '<div class="card">No watchers yet.</div>';
    const sigs = [];
    for (const t of targets) for (const g of (t.signals || []).slice(-3))
      sigs.push({ label: t.config.label, ...g });
    sigs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    document.getElementById('signal-list').innerHTML = sigs.slice(0, 8).map(g =>
      '<div class="sig' + (g.change_type === 'threshold_breach' ? ' alert' : '') + '">' +
      '<b>' + g.label + '</b> — ' + (g.interpretation || g.summary) +
      '<div class="s">' + g.summary + ' · ' + new Date(g.timestamp).toLocaleString() + '</div></div>'
    ).join('') || '<div class="sig">No signals yet.<div class="s"></div></div>';
  } catch (e) {
    document.getElementById('watcher-grid').innerHTML = '<div class="card">Agent offline — run <code class="cmd">npm run watch</code>.</div>';
    document.getElementById('signal-list').innerHTML = '';
  }
}
stats(); store();
setInterval(stats, 60000);
</script>
</body>
</html>`

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.json': 'application/json',
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = (req.url ?? '/').split('?')[0]

  // Local store API (never leaks .env — only the watcher JSON)
  if (url === '/api/store') {
    const fp = join(ROOT, '.watcher-store.json')
    if (!existsSync(fp)) { res.writeHead(404); res.end('{}'); return }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(readFileSync(fp, 'utf-8'))
    return
  }

  if (url === '/demo.gif') {
    const fp = join(ROOT, 'assets/submission/00-demo.gif')
    if (existsSync(fp)) {
      res.writeHead(200, { 'Content-Type': 'image/gif' })
      res.end(readFileSync(fp))
      return
    }
  }

  if (url === '/token.png') {
    const fp = join(ROOT, 'assets/watch-token.png')
    if (existsSync(fp)) {
      res.writeHead(200, { 'Content-Type': 'image/png' })
      res.end(readFileSync(fp))
      return
    }
  }

  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(HTML)
    return
  }

  const ext = extname(url)
  if (MIME[ext]) {
    const fp = join(ROOT, url)
    if (existsSync(fp)) {
      res.writeHead(200, { 'Content-Type': MIME[ext] })
      res.end(readFileSync(fp))
      return
    }
  }

  res.writeHead(404)
  res.end('404')
})

server.listen(PORT, () => {
  console.log(`\n🌐 SWATCH site → http://localhost:${PORT}\n`)
})
