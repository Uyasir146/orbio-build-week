#!/usr/bin/env tsx
/**
 * Swiss-Army Watcher — universal web monitoring agent.
 *
 * Point it at any URL, API, feed, or on-chain address and say "watch this."
 * It diffs changes smartly, interprets with Orbio LLM, and delivers to Telegram.
 *
 * Usage:
 *   npm run watch                                        → scan all due targets
 *   npm run watch --add url "https://..." "Label"        → add a target
 *   npm run watch --add api "https://api..." "Label"     → add API target
 *   npm run watch --add rss "https://feed..." "Label"    → add RSS feed
 *   npm run watch --add onchain "0x..." "Label"          → add token
 *   npm run watch --remove <id>                          → remove a target
 *   npm run watch --status                               → list all targets
 *   npm run watch --since "Monday"                       → what changed since
 *   npm run watch --ask "<query>"                        → ask about your watchers
 */

import { config } from 'dotenv'
config({ path: ['.env.local', '.env'], quiet: true })

import { DEFAULT_MODEL, openrouter } from './lib/openrouter.js'
import {
  loadStore, saveStore, addTarget, removeTarget, addSnapshot,
  getLastSnapshot, addSignal, getAllSignalsSince, getDueTargets,
  updateTarget,
  type WatcherStore, type TargetConfig, type TargetType,
  type Snapshot, type Signal,
} from './lib/store.js'
import { fetchTarget, type FetchResult } from './lib/targets.js'
import { sendTelegram } from './tools/telegram.js'

// ═════════════════════════════════════════════════════════════════════
// DIFF ENGINE — smart comparison, not raw dumps
// ═════════════════════════════════════════════════════════════════════

interface Change {
  field: string
  old: string | number | null
  new: string | number | null
  pct_change: number | null
}

const MAX_CHANGES = 20

function diffSnapshots(prev: Snapshot | null, current: FetchResult): Change[] {
  const changes: Change[] = []

  if (prev && prev.content_hash !== current.content_hash) {
    changes.push({
      field: 'content', old: `${prev.content_preview.length} chars`,
      new: `${current.content.length} chars`,
      pct_change: prev.content_preview.length
        ? ((current.content.length - prev.content_preview.length) / prev.content_preview.length) * 100 : null,
    })
  }

  if (!prev) {
    changes.push({ field: '_baseline', old: null, new: 'first snapshot', pct_change: null })
  }

  for (const [key, newVal] of Object.entries(current.values)) {
    const oldVal = prev?.values?.[key]
    if (oldVal !== newVal && (oldVal !== null || newVal !== null)) {
      const pct = (typeof oldVal === 'number' && typeof newVal === 'number' && oldVal !== 0)
        ? ((newVal - oldVal) / Math.abs(oldVal)) * 100 : null
      changes.push({ field: key, old: oldVal ?? null, new: newVal, pct_change: pct })
    }
  }

  return changes.filter(c => {
    if (c.field === '_baseline' || c.field === 'content') return true
    if (c.field === 'text_length') return false
    if (c.pct_change === null) return c.old !== c.new
    return Math.abs(c.pct_change) > 0.5
  })
}

// ═════════════════════════════════════════════════════════════════════
// LLM INTERPRETATION — The Orbio Key interprets changes
// ═════════════════════════════════════════════════════════════════════

async function interpretChange(label: string, type: string, changes: Change[], ctx: string): Promise<string> {
  if (changes.length === 1 && changes[0].field === '_baseline') return `📌 Baseline captured.`

  const totalChanges = changes.filter(c => c.field !== '_baseline').length
  const capped = changes.filter(c => c.field !== '_baseline')
    .sort((a, b) => Math.abs(b.pct_change ?? 0) - Math.abs(a.pct_change ?? 0))
    .slice(0, MAX_CHANGES)

  const desc = capped.map(c => {
    if (c.field === 'content') return `Content changed`
    if (c.pct_change !== null) return `${c.field}: ${c.pct_change > 0 ? '+' : ''}${c.pct_change.toFixed(1)}%`
    return `${c.field}: ${c.old ?? '-'} → ${c.new ?? '-'}`
  }).join('; ')

  const overflow = totalChanges > MAX_CHANGES ? ` (+${totalChanges - MAX_CHANGES} more changes omitted)` : ''

  try {
    const res = await openrouter.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: 'You are a monitoring analyst. Given a detected change, write 1-2 sentences: WHAT changed in plain language + WHY it might matter. No hedging. Return ONLY the interpretation.' },
        { role: 'user', content: `${label} (${type})\nChanges: ${desc}\nPreview: ${ctx.slice(0, 800)}` },
      ],
      temperature: 0.3, max_tokens: 200,
    } as any)
    return (res.choices[0]?.message?.content ?? desc).trim()
  } catch { return desc }
}

// ═════════════════════════════════════════════════════════════════════
// FOLLOW-UP QUERIES — "what moved since Monday?"
// ═════════════════════════════════════════════════════════════════════

async function answerQuery(store: WatcherStore, query: string): Promise<string> {
  const now = new Date()
  let since = new Date(now)
  since.setDate(now.getDate() - 7)

  const dayMatch = query.match(/since (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i)
  if (dayMatch) {
    const dayMap: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }
    since = new Date(now)
    since.setDate(now.getDate() - ((now.getDay() - dayMap[dayMatch[1].toLowerCase()] + 7) % 7))
    since.setHours(0, 0, 0, 0)
  }
  const relMatch = query.match(/last (\d+) (hour|day|week)/i)
  if (relMatch) {
    since = new Date(now)
    const [num, unit] = [parseInt(relMatch[1]), relMatch[2]]
    if (unit === 'hour') since.setHours(now.getHours() - num)
    else if (unit === 'day') since.setDate(now.getDate() - num)
    else since.setDate(now.getDate() - num * 7)
  }

  const signals = getAllSignalsSince(store, since.toISOString())
  if (signals.length === 0) return `No changes since ${since.toLocaleDateString()}.`

  const list = signals.slice(0, 20).map(s => `[${s.label}] ${s.signal.interpretation ?? s.signal.summary}`).join('\n')
  try {
    const res = await openrouter.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: `Summarize these changes since ${since.toLocaleDateString()}. Group by theme. Max 5 sentences.` },
        { role: 'user', content: list },
      ],
      temperature: 0.3, max_tokens: 250,
    } as any)
    const summary = res.choices[0]?.message?.content ?? list
    return `📋 <b>Changes since ${since.toLocaleDateString()}</b>\n(${signals.length} signals across ${new Set(signals.map(s => s.label)).size} watchers)\n\n${summary}`
  } catch { return list }
}

// ═════════════════════════════════════════════════════════════════════
// SCAN LOOP
// ═════════════════════════════════════════════════════════════════════

async function scanTargets(store: WatcherStore): Promise<WatcherStore> {
  const due = getDueTargets(store)
  if (due.length === 0) { console.log('[watcher] no targets due'); return store }

  console.log(`[watcher] scanning ${due.length} target(s)...`)
  store.last_scan = new Date().toISOString()

  for (const target of due) {
    const t = target.config
    console.log(`  → ${t.label} (${t.type})`)

    const result = await fetchTarget(t)
    if (result.error) { console.log(`  ⚠ error: ${result.error}`); continue }

    const prev = getLastSnapshot(store, t.id)
    const changes = diffSnapshots(prev, result)
    const snapshot: Snapshot = {
      timestamp: store.last_scan ?? new Date().toISOString(),
      content_hash: result.content_hash,
      content_preview: result.content.slice(0, 500),
      values: result.values,
    }
    store = addSnapshot(store, t.id, snapshot)

    // No meaningful change? Skip.
    if (changes.length === 1 && changes[0].field === '_baseline') {
      console.log(`  ✅ baseline`)
      continue
    }
    if (changes.length === 0) { console.log(`  ✅ no changes`); continue }

    // ✦ Something changed — interpret ✦
    console.log(`  🔔 ${changes.length} change(s) → interpreting...`)
    const interpretation = await interpretChange(t.label, t.type, changes, result.content)

    const changeType: Signal['change_type'] = changes.some(c => c.pct_change !== null && Math.abs(c.pct_change!) > 10) ? 'threshold_breach'
      : changes.some(c => c.field !== 'content') ? 'value_change' : 'content_change'

    const sigChanges = changes.filter(c => c.field !== '_baseline')
      .sort((a, b) => Math.abs(b.pct_change ?? 0) - Math.abs(a.pct_change ?? 0))
    const summary = sigChanges.slice(0, 10).map(c =>
      c.pct_change !== null ? `${c.field} ${c.pct_change > 0 ? '+' : ''}${c.pct_change.toFixed(1)}%` : `${c.field} changed`
    ).join(', ')
    const sigOverflow = sigChanges.length > 10 ? ` (+${sigChanges.length - 10} more)` : ''

    const { store: ns, signal } = addSignal(store, t.id, {
      timestamp: snapshot.timestamp,
      change_type: changeType,
      summary: summary + sigOverflow,
      interpretation,
      details: Object.fromEntries(sigChanges.slice(0, 15).map(c => [c.field, { old: c.old, new: c.new }])),
    })
    store = ns

    signal.delivered = true
        const emoji = changeType === 'threshold_breach' ? '🚨' : changeType === 'value_change' ? '📊' : '📝'
        // Cap Telegram message to 4000 chars (Telegram limit: 4096)
        let msg = [`${emoji} <b>${t.label}</b>`, interpretation, `<i>${signal.summary.slice(0, 300)}</i>`].join('\n')
        if (msg.length > 3800) msg = msg.slice(0, 3800) + '…'
        await sendTelegram({ text: msg })
    console.log(`  ✅ → Telegram`)
  }

  saveStore(store)
  return store
}

// ═════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════

function slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) }

function printStatus(store: WatcherStore) {
  const targets = Object.values(store.targets)
  if (targets.length === 0) { console.log('No watchers yet. Add one: npm run watch --add url "https://..." "Label"'); return }
  console.log(`\n━━━ WATCHERS (${targets.length}) ━━━\n`)
  for (const t of targets) {
    const icon = t.config.active ? '🟢' : '⏸'
    const last = t.snapshots[t.snapshots.length - 1]
    const when = last ? new Date(last.timestamp).toLocaleString() : 'never'
    const noise = t.noise_score > 50 ? ` 🔇${t.noise_score}%` : ''
    console.log(`${icon} ${t.config.label} (${t.config.id}:${t.config.type})`)
    console.log(`   scans:${t.snapshots.length} signals:${t.total_signals}${noise} last:${when}`)
    const pending = t.signals.filter(s => !s.read).length
    if (pending) console.log(`   📬 ${pending} unread`)
  }
}

// ═════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════

async function main() {
  let store = loadStore()
  const args = process.argv.slice(2)

  if (args[0] === '--status') { printStatus(store); return }
  if (args[0] === '--since' || args[0] === '--ask') {
    const query = args.slice(1).join(' ') || args[0].replace('--', '').replace('-', ' ')
    const answer = await answerQuery(store, query)
    console.log(answer); await sendTelegram({ text: answer }); return
  }
  if (args[0] === '--remove') {
    const id = args[1]; if (!id) { console.error('Usage: --remove <id>'); process.exit(1) }
    store = removeTarget(store, id); saveStore(store)
    console.log(`✅ removed "${id}"`); return
  }
  if (args[0] === '--add') {
    const [type, url, label] = [args[1] as TargetType ?? 'url', args[2], args[3] ?? args[2]?.slice(0, 40) ?? 'untitled']
    if (!url) { console.error('Usage: --add <type> <url> "Label"'); process.exit(1) }
    const id = slug(label)
    if (store.targets[id]) store = updateTarget(store, id, { url, active: true })
    else store = addTarget(store, { id, type, label, url, interval_s: 3600, current_interval_s: 3600, active: true, created_at: new Date().toISOString() })
    saveStore(store)
    console.log(`✅ "${label}" (${id}:${type}) → will scan next run`)

    // Immediately take baseline snapshot
    console.log(`  📸 taking baseline...`)
    store = await scanTargets(store)
    saveStore(store)
    return
  }
  if (args[0] === '--init') {
    // Seed with default watchers
    if (Object.keys(store.targets).length === 0) {
      const id = slug('ORBIO token')
      store = addTarget(store, { id, type: 'onchain', label: 'ORBIO', url: 'https://robinhoodchain.blockscout.com/token/0xAa07A0e9209e16aC99708C3EC70159c6eF3128A3', interval_s: 1800, current_interval_s: 1800, active: true, created_at: new Date().toISOString() })
      saveStore(store)
      console.log('✅ seeded default watcher: ORBIO token')
    }
    return
  }

  // Default: scan
  store = await scanTargets(store)
  saveStore(store)
  console.log('[watcher] done')
}

main().catch(err => { console.error('[watcher] FATAL:', err.message); process.exit(1) })