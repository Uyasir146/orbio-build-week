# Swiss-Army Web Watcher

> **Orbio Build Week 2026 — 🏆 Active Submission**

Point it at any URL, API, feed, or on-chain address and say "watch this."  
It diffs changes smartly, interprets them with the Orbio LLM, and delivers to Telegram.

🚫 No chat window. 🚫 No raw dumps. One key, one agent, one inbox.

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

## 🚀 Quick Start

```bash
git clone https://github.com/Uyasir146/orbio-build-week
cd orbio-build-week
npm install --legacy-peer-deps

# Add your keys
cp .env.example .env.local
# Fill in OPENROUTER_API_KEY and TELEGRAM_BOT_TOKEN

# Seed default watcher (ORBIO token)
npm run watch -- --init

# Add anything you want to watch
npm run watch -- --add url "https://example.com" "My Page"
npm run watch -- --add api "https://api.example.com/data" "API Monitor"
npm run watch -- --add rss "https://blog.example.com/feed.xml" "Blog RSS"
npm run watch -- --add onchain "0x..." "Token Name"

# Scan all watchers manually
npm run watch

# Check status
npm run watch -- --status

# Ask: what changed?
npm run watch -- --since "Monday"
npm run watch -- --ask "what happened in the last 24 hours"
```

---

## 🏗 Architecture

```
src/
├── watch.ts               ★ Universal watcher engine
├── agent.ts                 Legacy: crypto-first scan pipeline
├── dashboard.ts             Live web UI (localhost:3456)
├── trending.ts              DexScreener discovery engine
├── lib/
│   ├── store.ts             Persistence, history, noise learning
│   ├── targets.ts           Fetchers (URL/API/RSS/onchain)
│   └── openrouter.ts        Orbio API client
└── tools/
    ├── dexscreener.ts       Live DEX market data
    ├── onchain.ts           Blockscout explorer
    ├── escalation.ts        Pattern detection
    └── telegram.ts          Delivery
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