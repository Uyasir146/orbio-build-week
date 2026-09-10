/**
 * DexScreener market data — live price, volume, liquidity, pair data.
 *
 * Complements blockscout on-chain data with real-time trading metrics.
 * DexScreener covers all major DEXes on Robinhood Chain: Uniswap v3, Ramses.
 */

const DEXSCREENER = 'https://api.dexscreener.com'

const UA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
}

export interface MarketData {
  /** Best pair (highest liquidity) for this token */
  pair_address: string
  dex: string
  price_usd: number
  price_change_24h: number | null  // percent
  volume_24h: number | null        // USD
  liquidity_usd: number | null
  fdv_usd: number | null           // fully diluted valuation
  /** Volume/Liquidity ratio — >1 means active trading relative to depth */
  volume_liq_ratio: number | null
  /** Number of transactions in 24h */
  txns_24h: number | null
  /** When the pair was created */
  pair_created_at: string | null
  /** All pairs sorted by liquidity */
  pair_count: number
  /** URL to DexScreener chart */
  chart_url: string
}

export interface EnhancedTokenInfo {
  address: string
  symbol: string
  name: string
  price_usd: number | null
  volume_24h: number | null
  liquidity_usd: number | null
  fdv_usd: number | null
  price_change_24h: number | null
  holders: number | null
  volume_liq_ratio: number | null
  txns_24h: number | null
  pairs: number
  dex: string | null
  chart_url: string
}

/**
 * Fetch market data from DexScreener for a given token address.
 * Returns the best pair (highest liquidity) across all DEXes.
 */
export async function getMarketData(address: string): Promise<MarketData | null> {
  const url = `${DEXSCREENER}/latest/dex/tokens/${address}`
  try {
    const res = await fetch(url, { headers: UA_HEADERS })
    if (!res.ok) {
      console.error(`[dexscreener] ${res.status} for ${address}`)
      return null
    }

    const data = await res.json() as { pairs?: Array<Record<string, unknown>> }
    const pairs = data.pairs ?? []
    if (pairs.length === 0) return null

    // Best pair = highest liquidity
    const best = pairs.reduce((a, b) => {
      const aLiq = (a.liquidity as { usd?: number })?.usd ?? 0
      const bLiq = (b.liquidity as { usd?: number })?.usd ?? 0
      return aLiq > bLiq ? a : b
    })

    const volume = (best.volume as { h24?: number })?.h24 ?? null
    const liquidity = (best.liquidity as { usd?: number })?.usd ?? null

    return {
      pair_address: String(best.pairAddress ?? ''),
      dex: String(best.dexId ?? ''),
      price_usd: parseFloat(String(best.priceUsd ?? '0')),
      price_change_24h: best.priceChange ? parseFloat(String((best.priceChange as { h24?: number })?.h24 ?? best.priceChange)) : null,
      volume_24h: volume,
      liquidity_usd: liquidity,
      fdv_usd: best.fdv ? parseFloat(String(best.fdv)) : null,
      volume_liq_ratio: (volume && liquidity && liquidity > 0) ? volume / liquidity : null,
      txns_24h: best.txns ? parseFloat(String((best.txns as { h24?: { buys: number; sells: number } })?.h24?.buys ?? 0)) + parseFloat(String((best.txns as { h24?: { buys: number; sells: number } })?.h24?.sells ?? 0)) || null : null,
      pair_created_at: String(best.pairCreatedAt ?? ''),
      pair_count: pairs.length,
      chart_url: String(best.url ?? ''),
    }
  } catch (e) {
    console.error(`[dexscreener] fetch error for ${address}:`, e)
    return null
  }
}

/**
 * Search for tokens on DexScreener by query string.
 * Useful for discovering trending tokens by name/symbol.
 */
export async function searchTokens(query: string, chain = 'robinhood'): Promise<Array<{ address: string; symbol: string; name: string }>> {
  const url = `${DEXSCREENER}/latest/dex/search?q=${encodeURIComponent(query)}`
  try {
    const res = await fetch(url, { headers: UA_HEADERS })
    if (!res.ok) return []

    const data = await res.json() as { pairs?: Array<Record<string, unknown>> }
    const seen = new Set<string>()
    const tokens: Array<{ address: string; symbol: string; name: string }> = []

    for (const pair of (data.pairs ?? [])) {
      const chainId = String(pair.chainId ?? '')
      if (chainId !== chain) continue

      const baseToken = pair.baseToken as { address: string; symbol: string; name: string }
      const addr = baseToken?.address
      if (!addr || seen.has(addr)) continue
      seen.add(addr)

      tokens.push({
        address: addr,
        symbol: String(baseToken.symbol ?? ''),
        name: String(baseToken.name ?? ''),
      })
      if (tokens.length >= 10) break
    }

    return tokens
  } catch {
    return []
  }
}

/**
 * Fetch trending tokens on Robinhood Chain via DexScreener search.
 * Returns top tokens by liquidity as a discovery mechanism.
 */
export async function getTrendingTokens(): Promise<Array<{ address: string; symbol: string; name: string; liq_usd: number }>> {
  // Search for common token patterns on RH chain
  const queries = ['orbio', 'token', 'equity']
  const allTokens: Array<{ address: string; symbol: string; name: string }> = []

  for (const q of queries) {
    const results = await searchTokens(q)
    allTokens.push(...results)
  }

  // Deduplicate
  const seen = new Set<string>()
  const unique = allTokens.filter((t) => {
    if (seen.has(t.address)) return false
    seen.add(t.address)
    return true
  })

  // Fetch market data for each to sort by liquidity
  const enriched: Array<{ address: string; symbol: string; name: string; liq_usd: number }> = []
  for (const token of unique.slice(0, 15)) {
    const md = await getMarketData(token.address)
    enriched.push({
      ...token,
      liq_usd: md?.liquidity_usd ?? 0,
    })
  }

  return enriched.sort((a, b) => b.liq_usd - a.liq_usd).slice(0, 5)
}

/**
 * Combine blockscout + dexscreener into one rich token snapshot.
 */
export async function getEnhancedTokenInfo(address: string, holders?: number | null): Promise<EnhancedTokenInfo | null> {
  const md = await getMarketData(address)
  if (!md) return null

  return {
    address,
    symbol: '', // caller should fill
    name: '',
    price_usd: md.price_usd || null,
    volume_24h: md.volume_24h,
    liquidity_usd: md.liquidity_usd,
    fdv_usd: md.fdv_usd,
    price_change_24h: md.price_change_24h,
    holders: holders ?? null,
    volume_liq_ratio: md.volume_liq_ratio,
    txns_24h: md.txns_24h,
    pairs: md.pair_count,
    dex: md.dex,
    chart_url: md.chart_url,
  }
}