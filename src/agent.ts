/**
 * Robinhood Chain Watcher — Orbio Build Week 2026
 *
 * Scans tokenized equities and memecoins on Robinhood Chain.
 * The Orbio key is THE BRAIN — LLM-driven market analysis, scoring with
 * structured output, and actionable calls delivered to Telegram.
 *
 * Usage:
 *   npm run scan                         → default watchlist
 *   npm run scan "AAPL token"            → specific topic
 *   npm run scan --address 0x123...      → by contract (on-chain data)
 *   npm run scan --data ./tokens.json    → from a token data file
 */

import { config } from 'dotenv'
import { z } from 'zod'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { DEFAULT_MODEL, openrouter } from './lib/openrouter.js'
import { sendTelegram } from './tools/telegram.js'
import { getTokenInfo, chainStatus, type TokenInfo } from './tools/onchain.js'
import { getMarketData, type MarketData } from './tools/dexscreener.js'
import { scanEscalations, type EscalationAlert } from './tools/escalation.js'

config({ path: ['.env.local', '.env'], quiet: true })

// ═════════════════════════════════════════════════════════════════════
// SCHEMAS
// ═════════════════════════════════════════════════════════════════════

const Call = z.object({
  symbol: z.string().describe('Token ticker/symbol.'),
  decision: z.enum(['ENTRY', 'WATCH', 'IGNORE']).describe('Trading call.'),
  confidence: z.number().min(0).max(100).describe('0-100 confidence.'),
  thesis: z.string().describe('One sentence: why this decision.'),
  key_levels: z.string().optional().describe('Entry range, S/R.'),
  risks: z.array(z.string()).describe('1-3 risks before acting.'),
  sources: z.array(z.string()).optional().describe('Any reference URLs.'),
})

const ScanResult = z.object({
  scanned_at: z.string(),
  watchlist: z.array(Call),
  market_note: z.string().describe('One-line macro: chain activity, sector flow.'),
})

type ScanInput = {
  topic: string
  onchain?: TokenInfo | null
  market?: MarketData | null
  customContext?: string
}

// ═════════════════════════════════════════════════════════════════════
// SCORE PERSISTENCE — track decisions over time
// ═════════════════════════════════════════════════════════════════════

interface ScoreHistory {
  [symbol: string]: Array<{
    timestamp: string
    decision: string
    confidence: number
    price: number | null
  }>
}

function loadHistory(): ScoreHistory {
  try {
    if (existsSync('.score-history.json')) {
      return JSON.parse(readFileSync('.score-history.json', 'utf-8'))
    }
  } catch {}
  return {}
}

function saveHistory(history: ScoreHistory) {
  writeFileSync('.score-history.json', JSON.stringify(history, null, 2))
}

// ═════════════════════════════════════════════════════════════════════
// LLM ANALYSIS — THE ORBIO KEY AT WORK
// ═════════════════════════════════════════════════════════════════════

/**
 * Orbio LLM outputs plain JSON — we parse + validate with Zod.
 * Free-tier models don't support json_schema but output JSON reliably.
 */
/**
 * One token → one LLM call → one Call result.
 * Free-tier models output shorter responses; per-token batching is more reliable.
 */
async function scoreToken(inp: ScanInput, index: number): Promise<z.infer<typeof Call>> {
  const lines = [inp.topic]

  // On-chain data
  if (inp.onchain) {
    lines.push(`Symbol: ${inp.onchain.symbol} (${inp.onchain.name})`)
    lines.push(`Holders: ${inp.onchain.holders ?? '?'} | MCap: $${inp.onchain.market_cap_usd ?? '?'}`)
  }

  // Live market data (DexScreener) — the key differentiator
  if (inp.market) {
    lines.push('')
    lines.push('=== LIVE MARKET DATA ===')
    lines.push(`Price: $${inp.market.price_usd} | DEX: ${inp.market.dex}`)
    if (inp.market.price_change_24h !== null) {
      lines.push(`24h Change: ${inp.market.price_change_24h > 0 ? '+' : ''}${inp.market.price_change_24h.toFixed(2)}%`)
    }
    if (inp.market.volume_24h !== null && inp.market.liquidity_usd !== null) {
      lines.push(`Volume 24h: $${inp.market.volume_24h.toLocaleString()} | Liquidity: $${inp.market.liquidity_usd.toLocaleString()}`)
      if (inp.market.volume_liq_ratio !== null) {
        lines.push(`Volume/Liquidity: ${inp.market.volume_liq_ratio.toFixed(2)}x`)
      }
    }
    if (inp.market.fdv_usd !== null) lines.push(`FDV: $${inp.market.fdv_usd.toLocaleString()}`)
    if (inp.market.txns_24h !== null) lines.push(`24h Txns: ${inp.market.txns_24h}`)
    if (inp.market.pair_created_at) lines.push(`Pair created: ${inp.market.pair_created_at}`)
    lines.push(`Pairs: ${inp.market.pair_count} | Chart: ${inp.market.chart_url}`)
  }

  if (inp.customContext) lines.push(`Context: ${inp.customContext}`)

  const systemPrompt = [
    'You are a disciplined crypto scalper. Score this token as ENTRY, WATCH, or IGNORE.',
    '',
    'Rules:',
    '🟢 ENTRY — clear catalyst + strong momentum + healthy liquidity. Volume/Liq >2x is bullish. Confidence 65-95.',
    '🟡 WATCH — mixed signals: decent liq but low vol, or momentum fading. Confidence 40-75.',
    '🔴 IGNORE — no edge: dead volume (<$1K), low liquidity (<$5K), Vol/Liq <0.5x, no catalyst. Confidence 60-100.',
    '',
    'Your thesis MUST reference the live market data (price, volume, liquidity, change%).',
    'Your risks MUST be concrete (e.g. "Vol/Liq only 0.3x — no real activity", not generic).',
    '',
    'Return ONLY valid JSON (no markdown, no fences):',
    '{"symbol":"TOKEN","decision":"WATCH","confidence":50,"thesis":"one sentence, concrete, references live data","risks":["vol/liq 0.3x — capitulation risk","only 15 holders"]}',
  ].join('\n')

  const res = await openrouter.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: lines.join('\n') },
    ],
    temperature: 0.2,
  } as any)

  let raw = (res.choices[0]?.message?.content ?? '').trim()
  raw = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```$/, '').trim()

  if (!raw) throw new Error(`Token ${index} — empty response`)

  try {
    const json = JSON.parse(raw)
    // Normalize field names
    return Call.parse({
      symbol: json.symbol || json.token || json.name || inp.topic.slice(0, 20),
      decision: json.decision,
      confidence: typeof json.confidence === 'number' ? json.confidence : parseInt(json.confidence) || 50,
      thesis: json.thesis || '',
      key_levels: json.key_levels || undefined,
      risks: Array.isArray(json.risks) ? json.risks.filter(Boolean) : [],
      sources: json.sources || undefined,
    })
  } catch {
    console.error(`[watcher] Token ${index} parse failed:`, raw.slice(0, 200))
    throw new Error(`Token ${index} — invalid JSON`)
  }
}

/**
 * Score all tokens in PARALLEL — each token gets its own LLM call.
 * Then run one final "market note" call for macro context.
 */
async function analyzeTokens(inputs: ScanInput[]): Promise<z.infer<typeof ScanResult>> {
  console.log(`[watcher] scoring ${inputs.length} tokens in parallel via Orbio LLM...`)

  const start = Date.now()

  // Parallel per-token scoring
  const callPromises = inputs.map((inp, i) => scoreToken(inp, i + 1))
  const calls = await Promise.all(callPromises)

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`[watcher] ${calls.length}/${inputs.length} tokens scored in ${elapsed}s`)
  console.log(`[watcher] ${calls.map(c => `${c.symbol}=${c.decision}`).join(', ')}`)

  // Generate market note from the calls
  const callsSummary = calls.map(c => `${c.symbol}: ${c.decision} — ${c.thesis}`).join('\n')
  const marketRes = await openrouter.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      {
        role: 'system',
        content: 'You are a market analyst. Given these token scores, write ONE sentence on the macro flow of Robinhood Chain right now. Be specific and useful. Return ONLY the sentence, no marks.',
      },
      { role: 'user', content: callsSummary },
    ],
    temperature: 0.3,
    max_tokens: 200,
  } as any)

  const market_note = (marketRes.choices[0]?.message?.content ?? 'Robinhood Chain ecosystem active — monitor for breakout signals.').trim()

  return {
    scanned_at: new Date().toISOString(),
    watchlist: calls,
    market_note,
  }
}

// ═════════════════════════════════════════════════════════════════════
// DELIVERY
// ═════════════════════════════════════════════════════════════════════

function formatTelegram(result: z.infer<typeof ScanResult>, history?: ScoreHistory): string {
  const lines: string[] = [
    '🤖 <b>Robinhood Chain Watcher</b>',
    `<i>${result.market_note}</i>`,
    '',
  ]

  for (const call of result.watchlist) {
    const emoji = call.decision === 'ENTRY' ? '🟢' : call.decision === 'WATCH' ? '🟡' : '🔴'

    // Trend from score history
    let trend = ''
    if (history) {
      const symHistory = history[call.symbol] || []
      if (symHistory.length >= 2) {
        const prev = symHistory[symHistory.length - 2]
        if (call.confidence > prev.confidence) trend = ' 📈'
        else if (call.confidence < prev.confidence) trend = ' 📉'
        else trend = ' ➡'
        trend += ` (was ${prev.decision} ${prev.confidence})`
      }
      if (symHistory.length >= 2 && symHistory[symHistory.length - 1]?.price && symHistory[symHistory.length - 2]?.price) {
        const curr = symHistory[symHistory.length - 1].price!
        const prevP = symHistory[symHistory.length - 2].price!
        const pct = ((curr - prevP) / prevP * 100).toFixed(1)
        trend += ` | Δ ${pct}%`
      }
    }

    lines.push(`${emoji} <b>${call.symbol}</b> → ${call.decision} (${call.confidence}%)${trend}`)
    lines.push(`   <i>${call.thesis}</i>`)
    if (call.key_levels) lines.push(`   📊 ${call.key_levels}`)
    if (call.risks.length) {
      lines.push(`   ⚠ ${call.risks.map(r => r.replace(/^[-•]\s*/, '')).join(' · ')}`)
    }
    lines.push('')
  }

  lines.push(`<i>Scanned: ${result.scanned_at} · Powered by Orbio</i>`)
  return lines.join('\n')
}

// ═════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2)
  const timestamp = new Date().toISOString()

  // Check chain
  let chainHealthy = false
  try { chainHealthy = await chainStatus() } catch {}
  if (!chainHealthy) console.warn('[watcher] ⚠ Chain data unavailable — using LLM knowledge only')

  const inputs: ScanInput[] = []

  // ─── parse args ───
  if (args[0] === '--data') {
    const file = args[1]
    if (!file || !existsSync(file)) {
      console.error('--data requires a valid JSON file path')
      process.exit(1)
    }
    const raw = JSON.parse(readFileSync(file, 'utf-8'))
    const items = Array.isArray(raw) ? raw : [raw]
    for (const item of items) {
      inputs.push({
        topic: item.topic || item.symbol || 'Unknown',
        customContext: item.context || item.description || undefined,
      })
    }
  } else if (args[0] === '--address') {
    const addr = args[1]
    if (!addr) { console.error('--address requires a contract address'); process.exit(1) }
    console.log(`[watcher] fetching on-chain + market data for ${addr}...`)
    const [info, market] = await Promise.all([
      getTokenInfo(addr),
      getMarketData(addr),
    ])
    inputs.push({
      topic: info ? `${info.symbol} (${info.name})` : addr,
      onchain: info,
      market,
    })
  } else if (args[0] === '--trending') {
    // Auto-discover trending tokens on Robinhood Chain
    const { searchTokens } = await import('./tools/dexscreener.js')
    const minLiq = args.includes('--min-liq') ? parseFloat(args[args.indexOf('--min-liq') + 1] || '5000') : 5000
    console.log(`[watcher] trending discovery mode — searching Robinhood Chain (min liq: $${minLiq.toLocaleString()})...`)

    const queries = ['orbio', 'token', 'equity', 'coin', 'dex']
    const seen = new Set<string>()
    for (const q of queries) {
      const results = await searchTokens(q, 'robinhood')
      for (const t of results) {
        if (!seen.has(t.address)) {
          seen.add(t.address)
          const [market] = await Promise.all([getMarketData(t.address)])
          if (market && market.liquidity_usd && market.liquidity_usd >= minLiq) {
            inputs.push({
              topic: `${t.symbol} (${t.name})`,
              market,
              customContext: `${t.symbol}: $${market.price_usd.toFixed(6)}, vol $${(market.volume_24h ?? 0).toLocaleString()}, liq $${(market.liquidity_usd ?? 0).toLocaleString()}, change ${market.price_change_24h !== null ? market.price_change_24h.toFixed(1) + '%' : 'N/A'}. Auto-discovered trending.`,
            })
            console.log(`[watcher]  → found ${t.symbol}: $${market.price_usd.toFixed(6)} | liq $${(market.liquidity_usd ?? 0).toLocaleString()}`)
          }
        }
      }
    }
    console.log(`[watcher] trending: ${inputs.length} tokens above liq threshold`)
    if (inputs.length === 0) {
      console.log('[watcher] no trending tokens found — falling back to default watchlist')
      inputs.push({
        topic: 'ORBIO (Orbio.so) — Build Week hackathon',
        customContext: 'ORBIO Build Week active. Price $0.0246, $23M mcap, 3,654 holders. Fallback from empty trending scan.',
      })
    }
  } else if (args.length > 0 && !args[0].startsWith('--')) {
    inputs.push({ topic: args.join(' ') })
  } else {
    // Default watchlist — real tokens on Robinhood Chain with live data
    const defaultAddrs = [
      { addr: '0xAa07A0e9209e16aC99708C3EC70159c6eF3128A3', desc: 'ORBIO — Build Week hackathon active, $0.0246, ~$23M mcap, 3,654 holders' },
      // Add more RH Chain token addresses here as they become known
    ]

    console.log(`[watcher] fetching on-chain + market data for ${defaultAddrs.length} tokens...`)
    for (const { addr, desc } of defaultAddrs) {
      const [info, market] = await Promise.all([
        getTokenInfo(addr),
        getMarketData(addr),
      ])
      // Fill symbol from blockscout if we have it
      const symbol = info?.symbol || market ? 'Token' : addr.slice(0, 10)
      inputs.push({
        topic: info ? `${info.symbol} (${info.name})` : `Token at ${addr}`,
        onchain: info,
        market,
        customContext: desc,
      })
    }

    // If no tokens configured, fall back to text-based scan
    if (inputs.length === 0) {
      inputs.push({
        topic: 'ORBIO token on Robinhood Chain — Build Week hackathon',
        customContext:
          'Orbio Build Week active with 36 builders. Prize pool: 8M ORBIO (~$196K). ' +
          'Price: ~$0.0246, market cap ~$23M, holders 3,654. ' +
          '24h volume: ~$2M on Uniswap v3. Deadline Sept 13. ' +
          'Contract: 0xAa07A0e9209e16aC99708C3EC70159c6eF3128A3',
      })
    }
  }

  console.log(`[watcher] analyzing ${inputs.length} items via Orbio key...`)

  // ✦ THE ORBIO KEY IN ACTION ✦
  // Load history for trend context
  const history = loadHistory()
  const ts = new Date().toISOString()

  // ✦ THE ORBIO KEY IN ACTION ✦
  const result = await analyzeTokens(inputs)

  // Console
  console.log(`\n━━━ SCAN COMPLETE ━━━`)
  console.log(`Market: ${result.market_note}`)
  for (const c of result.watchlist) {
    const icon = c.decision === 'ENTRY' ? '🟢' : c.decision === 'WATCH' ? '🟡' : '🔴'
    console.log(`${icon} ${c.symbol} → ${c.decision} (${c.confidence}%)`)
    console.log(`   ${c.thesis}`)
    if (c.key_levels) console.log(`   📊 ${c.key_levels}`)
  }

  // Telegram (with trend context from history)
  const tgText = formatTelegram(result, history)
  const sent = await sendTelegram({ text: tgText })
  console.log(sent ? '[watcher] ✅ → Telegram' : '[watcher] ⚠ Telegram skipped')

  // Save scan result
  writeFileSync('.last-scan.json', JSON.stringify({ timestamp, result }, null, 2))

  // Update score history
  for (const c of result.watchlist) {
    if (!history[c.symbol]) history[c.symbol] = []
    history[c.symbol].push({
      timestamp: ts,
      decision: c.decision,
      confidence: c.confidence,
      price: inputs.find(i => i.market?.price_usd)?.market?.price_usd ?? null,
    })
    // Keep last 20 entries per symbol to avoid bloat
    if (history[c.symbol].length > 20) history[c.symbol] = history[c.symbol].slice(-20)
  }
  saveHistory(history)

  // Show trend in console
  for (const c of result.watchlist) {
    const symHistory = history[c.symbol] || []
    if (symHistory.length > 1) {
      const prev = symHistory[symHistory.length - 2]
      const trend = c.confidence > prev.confidence ? '📈' : c.confidence < prev.confidence ? '📉' : '➡'
      const prevDec = prev.decision
      console.log(`[watcher] trend ${c.symbol}: ${prevDec}(${prev.confidence}) → ${c.decision}(${c.confidence}) ${trend}`)
    }
  }

  // ═══════════════════ ESCALATION DETECTION ═══════════════════
  const alerts = scanEscalations(history)
  if (alerts.length > 0) {
    console.log(`\n[escalation] ${alerts.length} pattern(s) detected:`)
    for (const alert of alerts) {
      console.log(`  ${alert.urgency} ${alert.pattern}: ${alert.symbol}`)
    }

    // Send priority alert to Telegram (separate from regular scan)
    const alertLines = ['🚨 <b>PRIORITY ALERTS</b>', '']
    for (const alert of alerts) {
      alertLines.push(`${alert.urgency} <b>${alert.pattern}</b>: ${alert.symbol}`)
      alertLines.push(`   ${alert.message.replace(/\n/g, '\n   ')}`)
      alertLines.push('')
    }
    alertLines.push(`<i>Auto-escalation · Powered by Orbio</i>`)

    const alertSent = await sendTelegram({ text: alertLines.join('\n') })
    if (alertSent) console.log('[escalation] ✅ priority alert → Telegram')
    else console.log('[escalation] ⚠ priority alert skipped')
  }

  console.log('[watcher] saved → .last-scan.json + .score-history.json')
}

main().catch((err) => {
  console.error('[watcher] FATAL:', err instanceof Error ? err.message : err)
  process.exit(1)
})