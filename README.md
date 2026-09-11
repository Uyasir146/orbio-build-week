# Swiss-Army Web Watcher

> **Orbio Build Week 2026 — 🏆 Active Submission**

Point it at any URL, API, feed, or on-chain address and say "watch this."  
It diffs changes smartly, interprets them with the Orbio LLM, and delivers to Telegram.

🚫 No chat window. 🚫 No raw dumps. One key, one agent, one inbox.

---

## 🎬 One-Command Demo

```bash
git clone https://github.com/Uyasir146/orbio-build-week
cd orbio-build-week
npm install --legacy-peer-deps
npm run demo:mock
```

**Zero API calls. Zero keys. Safe to run anywhere.**  
[📸 View full demo screenshot →](assets/demo-screenshot.html)

```
$ npm run demo:mock

🤖 Swiss-Army Web Watcher — Dry Run Demo

━━━ WATCHERS (3) ━━━
🟢 ORBIO Token (onchain)    — scans:3 signals:3 📡33%
🟢 Orbio Build Page (url)    — scans:2 signals:1 📡50%
🟢 CoinTelegraph RSS (rss)   — scans:2 signals:1 📡50%

━━━ RECENT SIGNALS ━━━
🚨 ORBIO surged 40.3% to $0.02864 — Build Week deadline nears
📝 Builder count rose from 36 to 42 — interest accelerating
📝 6 new CoinTelegraph articles with ORBIO coverage

━━━ PATTERN DETECTION ━━━
📈 BREAKOUT: ORBIO (-50.7% → +10.4% → +40.3%)
   Signal: momentum accelerating

━━━ AUTO-THREAD ━━━
1/ 🤖 My monitoring agent runs on ONE Orbio key...
2/ ORBIO surged +40.3% — 42 builders approved for Build Week
3/ Smart diff + LLM interpretation = plain-language briefs
4/ 3 watcher types: on-chain, URL, RSS — all autonomous
5/ Zero credit burn. One key. One agent. One inbox.
   github.com/Uyasir146/orbio-build-week
```

With live keys: `npm run demo` — same output, real API calls.

---

## 🎯 What It Does

```
"watch this URL"  ───→  [Fetch]  ───→  [Smart Diff]  ───→  [Orbio LLM interprets]
                                                            ↓
                                                    "Price dropped 3.2% —
                                                     likely profit-taking after
                                                     the Build Week deadline"
                                                            ↓
                                                      Telegram inbox
```

| Feature | Detail |
|---|---|
| 🔍 **Universal targets** | URL, API, RSS feeds, on-chain addresses |
| 🧠 **Interprets changes** | "Price drop ≠ layout change" — Orbio LLM explains WHY |
| 🔇 **Noise learning** | Watches what you read, slows noisy watchers down |
| ⏱ **Adaptive intervals** | Faster checks when something's warming up |
| 💬 **Follow-ups** | "What moved since Monday?" — summaries across all watchers |
| 📊 **Live dashboard** | `npm run dashboard` — dark theme, auto-refresh |
| 🚨 **Pattern alerts** | Threshold breaches get priority Telegram messages |

---

## 🏗 Architecture

```
                      Swiss-Army Web Watcher
══════════════════════════════════════════════════════════════

  Target Layer                    Engine Layer                  Output Layer
 ┌──────────────┐            ┌──────────────────┐           ┌──────────────┐
 │  URL (HTML)  │──┐         │                  │           │  Telegram    │
 │  API (JSON)  │  │  fetch  │  Smart Diff      │  signal   │  Delivery    │
 │  RSS/Atom    │──┼────────→│  ┌────────────┐  │──────────→│  (formatted) │
 │  On-Chain    │  │         │  │ Hash check  │  │           │              │
 └──────────────┘  │         │  │ Value diff  │  │           └──────────────┘
                   │         │  │ LLM interp  │  │
                   │         │  └────────────┘  │           ┌──────────────┐
                   │         └──────────────────┘           │  Dashboard   │
                   │                  │                     │  :3456       │
                   │         ┌───────┴───────┐             │  (live HTML) │
                   │         │  Store        │             └──────────────┘
                   │         │  ┌──────────┐ │
                   │         │  │ History  │ │             ┌──────────────┐
                   │         │  │ Signals  │ │             │  Cron Job    │
                   └────────→│  │ Noise    │─┼────────────→│  every 30m   │
                             │  │ Score    │ │             └──────────────┘
                             │  └──────────┘ │
                             └───────────────┘

  One Orbio Key powers all LLM calls: interpret changes, answer
  follow-up queries, detect patterns, generate market notes.
```

### Project Structure

```
src/
├── watch.ts               ★ Universal watcher engine
├── demo.ts                  One-command demo (npm run demo)
├── dashboard.ts             Live web UI (localhost:3456)
├── trending.ts              DexScreener discovery engine
├── agent.ts                 Crypto scoring pipeline (demo use case)
├── lib/
│   ├── store.ts             Persistence, noise learning, adaptive intervals
│   ├── targets.ts           Fetchers (URL/API/RSS/onchain — multi-type)
│   └── openrouter.ts        Orbio API client (api.orbio.so/api/v1)
└── tools/
    ├── dexscreener.ts       Live DEX market data (price, volume, liquidity)
    ├── onchain.ts           Robinhood Chain blockscout explorer
    ├── escalation.ts        Pattern detection (BREAKOUT/SURGE/BREAKDOWN)
    └── telegram.ts          Formatted delivery to Telegram
```

---

## 🚀 Quick Start

```bash
git clone https://github.com/Uyasir146/orbio-build-week
cd orbio-build-week
npm install --legacy-peer-deps
cp .env.example .env.local
# → Fill in OPENROUTER_API_KEY + TELEGRAM_BOT_TOKEN in .env.local

# One command to start watching
npm run watch -- --init && npm run watch

# Add any target
npm run watch -- --add url "https://example.com" "Label"
npm run watch -- --add api "https://api.example.com/data" "API Monitor"
npm run watch -- --add rss "https://example.com/feed.xml" "RSS Feed"
npm run watch -- --add onchain "0x..." "Token"

# Live dashboard
npm run dashboard
```

---

## 🎥 Demo Workflow

```bash
# Terminal 1: Run watcher (auto-discovers ORBIO + any targets)
npm run watch -- --init && npm run watch

# Terminal 2: Live dashboard
npm run dashboard
# → Open http://localhost:3456

# Terminal 3: Ask questions
npm run watch -- --since "Monday"
npm run watch -- --status
npm run watch -- --add url "https://..." "New Page"
```

---

## 🧠 How the Diff Engine Works

1. **Fetch** — every N seconds, grab current state from the target
2. **Hash compare** — cheap SHA256 check skips unchanged targets
3. **Value extraction** — pull out numbers, prices, counts, item lists
4. **Smart diff** — only flag changes >0.5% (not layout noise)
5. **LLM interpretation** — Orbio key explains WHAT changed and WHY
6. **Noise learning** — if you ignore a watcher's signals, it slows down

---

## 💬 Follow-up Queries

```
> "what moved since Monday?"
📋 Changes since 9/8/2026 (3 signals across 2 watchers)
ORBIO dropped 3.2% after Build Week deadline, CoinTelegraph published
4 new articles about Robinhood Chain. No threshold breaches.

> "any new token launches?"
🔍 Checking on-chain watchers... Pons launched 2 new tokens this week,
both below $5K liquidity. Nothing actionable yet.
```

---

## 🔇 Adaptive Noise Learning

| User behavior | Watcher response |
|---|---|
| You read every signal → | Interval stays fast (e.g. 5 min) |
| You ignore 7/10 signals → | Noise score rises, interval slows (e.g. 20 min) |
| You re-engage after silence → | Interval speeds back up |

---

## 🛠 Built with Orbio

- **One key** — `api.orbio.so/api/v1` for all LLM calls
- **Free model** — `nex-agi/nex-n2.5-mini:free` (zero credit burn)
- **Structured interpretation** — LLM explains changes in plain language
- **No chat window** — fully autonomous agent on a schedule

---

## 📜 License

MIT. Build something magical. 🚀