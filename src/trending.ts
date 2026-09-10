#!/usr/bin/env tsx
/**
 * Trending Discovery — finds new tokens on Robinhood Chain autonomously.
 *
 * Queries DexScreener search for active RH Chain pairs, filters by
 * minimum liquidity, and outputs a ready-to-use watchlist.
 *
 * Usage:
 *   npm run trending                  → print watchlist JSON
 *   npm run trending --min-liq 5000   → only tokens with ≥$5K liquidity
 */

import { config } from 'dotenv'
config({ path: ['.env.local', '.env'], quiet: true })

import { searchTokens, getMarketData } from './tools/dexscreener.js'

const MIN_LIQUIDITY_USD = parseFloat(process.argv.find(a => !a.startsWith('--') || a === '--min-liq' ? false : false) || '0') ||
                          (process.argv.includes('--min-liq') ? parseFloat(process.argv[process.argv.indexOf('--min-liq') + 1] || '5000') : 5000)

async function main() {
  console.log(`[trending] discovering tokens on Robinhood Chain (min liq: $${MIN_LIQUIDITY_USD.toLocaleString()})...`)

  // Search for diverse patterns to catch different token types
  const searchQueries = ['orbio', 'token', 'equity', 'coin', 'dex', 'fi', 'ai']
  const seen = new Set<string>()
  const tokens: Array<{ address: string; symbol: string; name: string }> = []

  for (const q of searchQueries) {
    const results = await searchTokens(q, 'robinhood')
    for (const t of results) {
      if (!seen.has(t.address)) {
        seen.add(t.address)
        tokens.push(t)
      }
    }
  }

  console.log(`[trending] found ${tokens.length} unique tokens, fetching market data...`)

  // Fetch market data in parallel batches of 5 (rate limit friendly)
  const enriched: Array<{
    address: string; symbol: string; name: string
    price: number; liq: number; vol: number; change_24h: number | null; dex: string
  }> = []

  for (let i = 0; i < tokens.length; i += 5) {
    const batch = tokens.slice(i, i + 5)
    const marketData = await Promise.all(batch.map(t => getMarketData(t.address)))
    for (let j = 0; j < batch.length; j++) {
      const md = marketData[j]
      if (md && md.liquidity_usd && md.liquidity_usd >= MIN_LIQUIDITY_USD) {
        enriched.push({
          address: batch[j].address,
          symbol: batch[j].symbol,
          name: batch[j].name,
          price: md.price_usd,
          liq: md.liquidity_usd,
          vol: md.volume_24h ?? 0,
          change_24h: md.price_change_24h,
          dex: md.dex,
        })
      }
    }
  }

  // Sort by liquidity descending
  enriched.sort((a, b) => b.liq - a.liq)

  console.log(`\n━━━ TOP TOKENS ON ROBINHOOD CHAIN ━━━\n`)
  for (const t of enriched.slice(0, 10)) {
    const change = t.change_24h !== null ? `${t.change_24h > 0 ? '+' : ''}${t.change_24h.toFixed(1)}%` : 'N/A'
    console.log(`💧 $${t.liq.toLocaleString()}  |  ${t.symbol}  |  $${t.price.toFixed(6)}  |  ${change}  |  ${t.dex}`)
    console.log(`   Vol: $${t.vol.toLocaleString()}  |  ${t.name}  |  ${t.address}`)
  }

  // Output as JSON for piping into agent
  const watchlist = enriched.slice(0, 5).map(t => ({
    topic: `${t.symbol} (${t.name}) on Robinhood Chain — $${t.price.toFixed(6)}, $${t.liq.toLocaleString()} liquidity on ${t.dex}`,
    address: t.address,
    customContext: `${t.symbol}: price $${t.price.toFixed(6)}, 24h vol $${t.vol.toLocaleString()}, liq $${t.liq.toLocaleString()}, change ${t.change_24h !== null ? t.change_24h.toFixed(1) + '%' : 'N/A'}, DEX: ${t.dex}. Auto-discovered by trending scan.`,
  }))

  const fs = await import('fs')
  fs.writeFileSync('.trending.json', JSON.stringify(watchlist, null, 2))
  console.log(`\n[trending] saved → .trending.json (${watchlist.length} tokens, min liq $${MIN_LIQUIDITY_USD.toLocaleString()})`)

  // Print the JSON for piping
  console.log('\n--- JSON OUTPUT (pipe to agent) ---')
  console.log(JSON.stringify(watchlist))
}

main().catch((err) => {
  console.error('[trending] FATAL:', err instanceof Error ? err.message : err)
  process.exit(1)
})