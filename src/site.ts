#!/usr/bin/env tsx
/**
 * SWATCH Site — dashboard app layout (sidebar + main panel).
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
<title>SWATCH — Dashboard</title>
<style>
  :root { --fg:#111; --muted:#6b7280; --line:#e5e7eb; --bg:#fff; --soft:#f6f7f9; --acc:#16a34a; --side:#0d1117; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:var(--fg); background:var(--bg); display:flex; min-height:100vh; }
  aside { width:228px; background:var(--side); color:#c9d1d9; flex-shrink:0; display:flex; flex-direction:column; position:sticky; top:0; height:100vh; }
  aside .brand { padding:20px; font-weight:700; font-size:1.05rem; color:#fff; border-bottom:1px solid #21262d; }
  aside .brand span { color:var(--acc); }
  aside nav { padding:12px; display:flex; flex-direction:column; gap:2px; flex:1; }
  aside nav a { color:#8b949e; text-decoration:none; font-size:0.9rem; padding:9px 12px; border-radius:8px; }
  aside nav a:hover, aside nav a.active { background:#161b22; color:#fff; }
  aside .foot { padding:16px 20px; border-top:1px solid #21262d; font-size:0.78rem; color:#6e7681; }
  aside .foot a { color:#8b949e; }
  main { flex:1; min-width:0; background:var(--soft); }
  .topbar { background:var(--bg); border-bottom:1px solid var(--line); padding:16px 28px; display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; z-index:5; }
  .topbar h1 { font-size:1.1rem; letter-spacing:-0.01em; }
  .topbar .live { font-size:0.82rem; color:var(--muted); }
  .live-dot { display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--acc); margin-right:6px; animation:pulse 2s infinite; }
  @keyframes pulse { 50% { opacity:0.35; } }
  .content { padding:24px 28px 48px; max-width:1100px; }
  .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-bottom:20px; }
  .stat { background:var(--bg); border:1px solid var(--line); border-radius:10px; padding:14px 16px; }
  .stat .k { font-size:0.72rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--muted); }
  .stat .v { font-size:1.35rem; font-weight:700; letter-spacing:-0.02em; margin-top:2px; }
  .stat .v.up { color:var(--acc); } .stat .v.down { color:#dc2626; }
  .panel { background:var(--bg); border:1px solid var(--line); border-radius:12px; padding:20px; margin-bottom:16px; }
  .panel h2 { font-size:1rem; margin-bottom:4px; }
  .panel .sub { color:var(--muted); font-size:0.86rem; margin-bottom:14px; }
  .chart { border:1px solid var(--line); border-radius:10px; overflow:hidden; }
  .chart iframe { display:block; width:100%; height:480px; border:0; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:12px; }
  .card { border:1px solid var(--line); border-radius:10px; padding:14px 16px; }
  .card h3 { font-size:0.95rem; }
  .card .meta { font-size:0.8rem; color:var(--muted); margin-top:4px; }
  .sig { border-left:3px solid var(--acc); background:var(--soft); border-radius:0 8px 8px 0; padding:10px 14px; margin-bottom:8px; font-size:0.88rem; }
  .sig.alert { border-color:#dc2626; }
  .sig .s { color:var(--muted); font-size:0.78rem; margin-top:3px; }
  pre.demo { background:#0d1117; color:#c9d1d9; border-radius:10px; padding:18px; font-size:0.8rem; line-height:1.7; overflow-x:auto; font-family:Consolas,monospace; }
  .btns { margin-top:14px; display:flex; gap:10px; flex-wrap:wrap; }
  .btn { display:inline-block; padding:9px 18px; border-radius:8px; font-size:0.86rem; text-decoration:none; border:1px solid var(--line); color:var(--fg); background:#fff; }
  .btn.primary { background:var(--fg); color:#fff; border-color:var(--fg); }
  .btn:hover { opacity:0.8; }
  img.demo-gif { width:100%; border-radius:10px; border:1px solid var(--line); margin-top:14px; }
  section.anchor { scroll-margin-top:80px; }
  @media (max-width:760px) { aside { display:none; } .content { padding:16px; } }
</style>
</head>
<body>

<aside>
  <div class="brand"><span>●</span> SWATCH</div>
  <nav>
    <a href="#overview" class="active">Overview</a>
    <a href="#chart">Chart</a>
    <a href="#watchers">Watchers</a>
    <a href="#signals">Signals</a>
    <a href="#demo">Demo</a>
    <a href="https://github.com/Uyasir146/orbio-build-week" target="_blank">Repo ↗</a>
  </nav>
  <div class="foot">Swiss-Army Watcher<br>one key · one agent<br><a href="https://github.com/Uyasir146/orbio-build-week">GitHub</a> · Orbio</div>
</aside>

<main>
  <div class="topbar">
    <h1>Overview</h1>
    <div class="live"><span class="live-dot"></span><span id="tb-status">connecting…</span></div>
  </div>
  <div class="content">

    <section class="anchor" id="overview">
      <div class="stats">
        <div class="stat"><div class="k">ORBIO price</div><div class="v" id="st-price">…</div></div>
        <div class="stat"><div class="k">Liquidity</div><div class="v" id="st-liq">…</div></div>
        <div class="stat"><div class="k">24h change</div><div class="v" id="st-chg">…</div></div>
        <div class="stat"><div class="k">Signals caught</div><div class="v" id="st-sig">…</div></div>
      </div>
    </section>

    <section class="anchor panel" id="chart">
      <h2>Live chart</h2>
      <div class="sub">ORBIO / WETH on Robinhood Chain — DexScreener.</div>
      <div class="chart"><iframe src="https://dexscreener.com/robinhood/${MAIN_PAIR}?embed=1&theme=light&trades=0&info=0"></iframe></div>
    </section>

    <section class="anchor panel" id="watchers">
      <h2>Watchers</h2>
      <div class="sub">Everything the agent is tracking.</div>
      <div class="grid" id="watcher-grid"><div class="card">Loading…</div></div>
    </section>

    <section class="anchor panel" id="signals">
      <h2>Recent signals</h2>
      <div class="sub">What changed, and why it matters.</div>
      <div id="signal-list"><div class="sig">Loading…<div class="s"></div></div></div>
    </section>

    <section class="anchor panel" id="demo">
      <h2>Try it in 30 seconds</h2>
      <div class="sub">Zero keys, zero API calls. Mock demo = identical output shape to the live agent.</div>
      <pre class="demo">$ git clone https://github.com/Uyasir146/orbio-build-week
$ cd orbio-build-week && npm install --legacy-peer-deps
$ npm run demo:mock</pre>
      <img class="demo-gif" src="/demo.gif" alt="Animated terminal demo">
      <div class="btns">
        <a class="btn primary" href="https://github.com/Uyasir146/orbio-build-week" target="_blank">View repo</a>
        <a class="btn" href="https://www.orbio.so/launchpad/launch" target="_blank">$SWATCH on Launchpad</a>
        <a class="btn" href="https://dexscreener.com/robinhood/${MAIN_PAIR}" target="_blank">DexScreener ↗</a>
      </div>
    </section>

  </div>
</main>

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
    document.getElementById('tb-status').textContent = 'live · $' + Number(p.priceUsd).toFixed(5);
  } catch (e) { document.getElementById('tb-status').textContent = 'offline'; }
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
    document.getElementById('watcher-grid').innerHTML = '<div class="card">Agent offline.</div>';
  }
}
document.querySelectorAll('aside nav a[href^="#"]').forEach(a => {
  a.addEventListener('click', () => {
    document.querySelectorAll('aside nav a').forEach(x => x.classList.remove('active'));
    a.classList.add('active');
  });
});
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
