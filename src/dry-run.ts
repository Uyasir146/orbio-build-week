#!/usr/bin/env tsx
/**
 * Dry-Run Demo Mode — identical output, zero API calls.
 *
 * Generates realistic mock scan data for demos, screenshots, and GIFs.
 * No Orbio key needed. No network calls. Safe to record/share.
 *
 * Usage:
 *   npm run demo -- --dry-run
 *   npm run watch -- --dry-run
 *   npm run post -- --dry-run
 */

import type { TargetConfig, TargetState, Signal, Snapshot, WatcherStore } from './lib/store.js'

// ═════════════════════════════════════════════════════════════════════
// MOCK DATA
// ═════════════════════════════════════════════════════════════════════

const MOCK_STORE: WatcherStore = {
  targets: {
    'orbio-token': {
      config: {
        id: 'orbio-token',
        type: 'onchain',
        label: 'ORBIO Token',
        url: '0xAa07A0e9209e16aC99708C3EC70159c6eF3128A3',
        interval_s: 1800,
        current_interval_s: 900,
        active: true,
        created_at: '2026-09-10T00:00:00Z',
      },
      snapshots: [
        { timestamp: '2026-09-10T12:00:00Z', content_hash: 'abc123', content_preview: '{"priceUsd":"0.01992"}', values: { price: 0.01992, volume_24h: 1770000, liquidity: 589000, price_change_24h: -50.7 } },
        { timestamp: '2026-09-10T12:15:00Z', content_hash: 'abc124', content_preview: '{"priceUsd":"0.02200"}', values: { price: 0.022, volume_24h: 1400000, liquidity: 600000, price_change_24h: -45.3 } },
        { timestamp: '2026-09-11T05:26:00Z', content_hash: 'abc125', content_preview: '{"priceUsd":"0.02864"}', values: { price: 0.02864, volume_24h: 1360000, liquidity: 741000, price_change_24h: +40.3 } },
      ],
      signals: [
        { id: 'sig-1', timestamp: '2026-09-10T12:00:00Z', change_type: 'value_change', summary: 'price -50.7%, vol $1.77M, liq $589K', interpretation: 'ORBIO dropped 50.7% to $0.01992 on $1.77M volume — heavy selling pressure after initial hype, likely profit-taking from early buyers.', delivered: true, read: true, details: { price: { old: 0.04064, new: 0.01992 } } },
        { id: 'sig-2', timestamp: '2026-09-10T12:15:00Z', change_type: 'value_change', summary: 'price +10.4%, vol $1.40M', interpretation: 'ORBIO bouncing +10.4% from local bottom to $0.022 — dip buyers stepping in.', delivered: true, read: true, details: { price: { old: 0.01992, new: 0.022 } } },
        { id: 'sig-3', timestamp: '2026-09-11T05:26:00Z', change_type: 'threshold_breach', summary: 'price +40.3%, vol $1.36M, liq $741K', interpretation: 'ORBIO surged 40.3% to $0.02864 as Build Week deadline nears — 36 builders competing for 8M prize pool driving demand.', delivered: true, read: false, details: { price: { old: 0.022, new: 0.02864 } } },
      ],
      noise_score: 33,
      total_signals: 3,
      engaged_signals: 2,
      last_engagement: '2026-09-10T12:16:00Z',
    },
    'orbio-build-page': {
      config: {
        id: 'orbio-build-page',
        type: 'url',
        label: 'Orbio Build Page',
        url: 'https://sellers.orbio.so/build',
        interval_s: 3600,
        current_interval_s: 3600,
        active: true,
        created_at: '2026-09-10T00:00:00Z',
      },
      snapshots: [
        { timestamp: '2026-09-10T12:00:00Z', content_hash: 'xyz789', content_preview: '36 approved builders...8M $ORBIO prize', values: { max_number: 8_000_000, text_length: 152585 } },
        { timestamp: '2026-09-11T05:26:00Z', content_hash: 'xyz790', content_preview: '42 approved builders...8M $ORBIO prize', values: { max_number: 8_000_000, text_length: 153200 } },
      ],
      signals: [
        { id: 'sig-4', timestamp: '2026-09-11T05:26:00Z', change_type: 'content_change', summary: 'Builder count: 36 → 42', interpretation: 'Orbio Build Week page updated — builder count rose from 36 to 42. Interest accelerating ahead of deadline.', delivered: true, read: false, details: {} },
      ],
      noise_score: 50,
      total_signals: 1,
      engaged_signals: 0,
      last_engagement: null,
    },
    'cointelegraph-rss': {
      config: {
        id: 'cointelegraph-rss',
        type: 'rss',
        label: 'CoinTelegraph RSS',
        url: 'https://cointelegraph.com/rss',
        interval_s: 3600,
        current_interval_s: 3600,
        active: true,
        createdAt: '2026-09-10T00:00:00Z',
      } as any,
      snapshots: [
        { timestamp: '2026-09-10T12:00:00Z', content_hash: 'rss001', content_preview: 'Bitcoin nears $80K...Orbio surges 160%...', values: { item_count: 25, newest_item_ts: Date.now() } },
        { timestamp: '2026-09-11T05:26:00Z', content_hash: 'rss002', content_preview: 'ORBIO Build Week update...Robinhood Chain activity...', values: { item_count: 31, newest_item_ts: Date.now() } },
      ],
      signals: [
        { id: 'sig-5', timestamp: '2026-09-11T05:26:00Z', change_type: 'content_change', summary: '6 new articles, 31 total', interpretation: 'CoinTelegraph published 6 new articles including ORBIO coverage — Build Week getting media attention.', delivered: true, read: false, details: {} },
      ],
      noise_score: 50,
      total_signals: 1,
      engaged_signals: 0,
      last_engagement: null,
    },
  },
  last_scan: '2026-09-11T05:26:00Z',
  total_signals_delivered: 5,
}

// ═════════════════════════════════════════════════════════════════════
// DRY-RUN RENDERING
// ═════════════════════════════════════════════════════════════════════

const CYAN = '\x1b[36m'
const YELLOW = '\x1b[33m'
const GREEN = '\x1b[32m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'

function dryRun() {
  const store = MOCK_STORE
  const targets = Object.values(store.targets)

  console.log(`${BOLD}${CYAN}🤖 Swiss-Army Web Watcher — Dry Run Demo${RESET}`)
  console.log(`${YELLOW}⚠  Mock mode: no API calls, no real keys needed${RESET}\n`)

  // ── Status ──
  console.log(`━━━ WATCHERS (${targets.length}) ━━━\n`)
  for (const t of targets) {
    const noise = t.noise_score > 50 ? ` 🔇${t.noise_score}%` : t.noise_score > 30 ? ` 📡${t.noise_score}%` : ''
    const pending = t.signals.filter(s => !s.read).length
    console.log(`🟢 ${t.config.label} (${t.config.type})`)
    console.log(`   scans:${t.snapshots.length} signals:${t.total_signals}${noise} unread:${pending}`)
  }

  // ── Recent Signals ──
  const allSignals = Object.entries(store.targets).flatMap(([id, t]) =>
    t.signals.slice(-2).map(s => ({ id, label: t.config.label, signal: s }))
  ).sort((a, b) => new Date(b.signal.timestamp).getTime() - new Date(a.signal.timestamp).getTime())

  console.log(`\n━━━ RECENT SIGNALS (${allSignals.length}) ━━━\n`)
  for (const { label, signal } of allSignals) {
    const emoji = signal.change_type === 'threshold_breach' ? '🚨' : signal.change_type === 'value_change' ? '📊' : '📝'
    console.log(`${emoji} ${label} — ${signal.interpretation}`)
    if (signal.summary) console.log(`   ${YELLOW}${signal.summary}${RESET}`)
    console.log()
  }

  // ── Trend Detection ──
  console.log('━━━ PATTERN DETECTION ━━━\n')
  const orboSignals = store.targets['orbio-token']?.signals ?? []
  if (orboSignals.length >= 3) {
    const [s1, s2, s3] = orboSignals.slice(-3)
    console.log(`📈 ${GREEN}BREAKOUT PATTERN DETECTED:${RESET} ORBIO`)
    console.log(`   ${s1.interpretation?.split('.')[0]}`)
    console.log(`   ${s2.interpretation?.split('.')[0]}`)
    console.log(`   ${s3.interpretation?.split('.')[0]}`)
    console.log(`   ${BOLD}Signal: momentum accelerating — price +40% in 1 day${RESET}`)
  }

  // ── Thread Preview ──
  console.log('\n━━━ AUTO-THREAD PREVIEW ━━━\n')
  const thread = [
    '1/ 🤖 My monitoring agent runs on ONE Orbio key — no chat window, no manual refresh. Here\'s what it caught in 48 hours ↓',
    '',
    `2/ ORBIO surged +40.3% to $0.0286. 42 builders now approved for Build Week. Deadline: Sept 13. ${store.targets['orbio-token']?.signals.slice(-1)[0]?.interpretation}`,
    '',
    '3/ New watchers detected: Orbio Build Page (builder count) + CoinTelegraph RSS (media coverage). All monitored autonomously.',
    '',
    '4/ Smart diff + LLM interpretation means I get plain-language briefs, not raw JSON dumps. "Price dropped" vs "Layout changed" — it knows the difference.',
    '',
    '5/ Zero credit burn (free tier model). One key. One agent. One Telegram inbox. github.com/Uyasir146/orbio-build-week',
  ].join('\n')
  console.log(thread)

  console.log(`\n${GREEN}━━━ DEMO COMPLETE ━━━${RESET}`)
  console.log(`${CYAN}This is mock data. Real agent produces identical output with live API calls.${RESET}`)
  console.log(`${CYAN}Try it: npm run watch --init && npm run watch${RESET}`)
}

dryRun()