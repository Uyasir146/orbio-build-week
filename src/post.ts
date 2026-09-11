#!/usr/bin/env tsx
/**
 * Auto-Generated Social Post — agent publishes findings.
 *
 * Takes the last scan results (from .last-scan.json or .watcher-store.json)
 * and generates a ready-to-post X/Twitter thread using the Orbio LLM.
 *
 * Output:
 *   — Prints the thread to console (copy-paste to X)
 *   — Saves as .thread.md (formatted markdown)
 *   — Optionally delivers to Telegram for review
 *
 * Usage:
 *   npm run post                         → thread from last scan
 *   npm run post -- --since "Monday"     → thread covering a date range
 *   npm run post -- --style "bullish"    → tone: bullish, bearish, neutral, meme
 */

import { config } from 'dotenv'
config({ path: ['.env.local', '.env'], quiet: true })

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { DEFAULT_MODEL, openrouter } from './lib/openrouter.js'
import { loadStore, getAllSignalsSince, getDueTargets } from './lib/store.js'
import { sendTelegram } from './tools/telegram.js'

// ═════════════════════════════════════════════════════════════════════

interface ThreadContext {
  signals: Array<{ label: string; interpretation: string; timestamp: string }>
  targets: Array<{ label: string; type: string; scans: number; signals: number }>
  since: string
}

async function gatherContext(store: ReturnType<typeof loadStore>, sinceDate?: string): Promise<ThreadContext> {
  let since = sinceDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  if (sinceDate) {
    // Parse natural language
    const now = new Date()
    const dayMatch = sinceDate.match(/monday|tuesday|wednesday|thursday|friday|saturday|sunday/i)
    if (dayMatch) {
      const dayMap: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }
      const d = new Date(now)
      d.setDate(now.getDate() - ((now.getDay() - dayMap[dayMatch[0].toLowerCase()] + 7) % 7))
      d.setHours(0, 0, 0, 0)
      since = d.toISOString()
    }
  }

  const allSignals = getAllSignalsSince(store, since)
  const targets = getDueTargets(store)

  return {
    signals: allSignals.slice(0, 15).map(s => ({
      label: s.label,
      interpretation: s.signal.interpretation ?? s.signal.summary,
      timestamp: s.signal.timestamp,
    })),
    targets: targets.map(t => ({
      label: t.config.label,
      type: t.config.type,
      scans: t.snapshots.length,
      signals: t.total_signals,
    })),
    since: new Date(since).toLocaleDateString(),
  }
}

async function generateThread(ctx: ThreadContext, style: string): Promise<string> {
  const signalList = ctx.signals.map(s =>
    `[${s.label}] ${s.interpretation}`
  ).join('\n')

  const targetList = ctx.targets.map(t =>
    `${t.label} (${t.type}: ${t.scans} scans, ${t.signals} signals)`
  ).join('\n')

  const styleGuide = style === 'bullish' ? 'Focus on upside, use rocket emojis. Energy: confident.'
    : style === 'bearish' ? 'Focus on risks. Energy: cautious but not panicked.'
    : style === 'meme' ? 'Use meme energy. Mix serious data with humor. Emojis encouraged.'
    : 'Balanced. Both opportunities and risks. Professional but not boring.'

  const systemPrompt = [
    'You are a crypto analyst writing an X/Twitter thread about what your monitoring agent detected.',
    '',
    'Thread rules:',
    '- Tweet 1: Hook. One compelling sentence + emoji. Must make people stop scrolling.',
    '- Tweet 2-4: Key findings. One insight per tweet. Data-backed, not vague.',
    '- Tweet 5: Call to action + link to project.',
    '',
    `Tone: ${styleGuide}`,
    '',
    'Format:',
    'Each tweet on its own line starting with "1/ " through "5/ ".',
    'Keep each tweet under 240 chars.',
    'No hashtag spam (2-3 max total).',
    'End with a link to: github.com/Uyasir146/orbio-build-week',
    '',
    'Return ONLY the thread. No preamble, no explanation outside the tweets.',
  ].join('\n')

  const prompt = [
    `Watchers active: ${ctx.targets.length} (since ${ctx.since})`,
    '',
    'Recent signals:',
    signalList || '(no signals — use watcher descriptions to hype what is being monitored)',
    '',
    'All watchers:',
    targetList,
    '',
    'Context: This is for Orbio Build Week — a hackathon where 36 builders compete for 8M $ORBIO.',
    'The agent runs on an Orbio key (api.orbio.so/api/v1) using nex-agi/nex-n2.5-mini:free (zero credit burn).',
  ].join('\n')

  const res = await openrouter.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 800,
  } as any)

  return (res.choices[0]?.message?.content ?? 'Thread generation failed.').trim()
}

// ═════════════════════════════════════════════════════════════════════

async function main() {
  const store = loadStore()
  const args = process.argv.slice(2)

  const style = args.includes('--style') ? args[args.indexOf('--style') + 1] ?? 'neutral' : 'neutral'
  const since = args.includes('--since') ? args[args.indexOf('--since') + 1] : undefined

  console.log('🧵 Generating thread...')
  const ctx = await gatherContext(store, since)
  console.log(`   ${ctx.signals.length} signals, ${ctx.targets.length} watchers since ${ctx.since}`)

  const thread = await generateThread(ctx, style)

  // Print to console
  console.log('\n' + '='.repeat(50))
  console.log(thread)
  console.log('='.repeat(50) + '\n')

  // Save to file
  writeFileSync('.thread.md', thread)
  console.log('✅ Saved → .thread.md')

  // Deliver to Telegram for review
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    const preview = thread.split('\n').slice(0, 3).join('\n')
    const sent = await sendTelegram({
      text: [
        '🧵 <b>Auto-Generated Thread</b>',
        `Style: ${style} · Since: ${ctx.since} · ${ctx.signals.length} signals`,
        '',
        '<b>Preview:</b>',
        preview,
        '',
        `<i>Full thread saved to .thread.md — review before posting.</i>`,
      ].join('\n'),
    })
    if (sent) console.log('✅ Preview → Telegram')
  }
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })