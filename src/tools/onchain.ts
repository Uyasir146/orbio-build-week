/**
 * Robinhood Chain on-chain data — blockscout API + RPC
 *
 * Fetch token metadata, holder counts, and recent activity for
 * tokenized equities and memecoins on Robinhood Chain (chain 4663).
 */
import { config } from 'dotenv'
config({ path: ['.env.local', '.env'], quiet: true })

const BLOCKSCOUT = process.env.ROBINHOOD_BLOCKSCOUT ?? 'https://robinhoodchain.blockscout.com'

const UA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'x-no-cache': 'true',
}

export interface TokenInfo {
  address: string
  name: string
  symbol: string
  price_usd: string | null
  holders: number | null
  total_supply: string | null
  exchange_rate: string | null
  market_cap_usd: string | null
}

export interface TokenHolder {
  address: string
  value: string
}

/** Fetch token info from blockscout */
export async function getTokenInfo(address: string): Promise<TokenInfo | null> {
  const url = `${BLOCKSCOUT}/api/v2/tokens/${address}`
  const res = await fetch(url, { headers: UA_HEADERS })

  if (!res.ok) {
    console.error(`[onchain] blockscout ${res.status} for ${address}`)
    return null
  }

  const data = await res.json() as Record<string, unknown>
  return {
    address,
    name: String(data.name ?? ''),
    symbol: String(data.symbol ?? ''),
    price_usd: data.exchange_rate ? String(data.exchange_rate) : null,
    holders: typeof data.holders === 'number' ? data.holders : null,
    total_supply: data.total_supply ? String(data.total_supply) : null,
    exchange_rate: data.exchange_rate ? String(data.exchange_rate) : null,
    market_cap_usd: data.circulating_market_cap ? String(data.circulating_market_cap) : null,
  }
}

/** Fetch top holders for a token */
export async function getTokenHolders(address: string, limit = 20): Promise<TokenHolder[]> {
  const url = `${BLOCKSCOUT}/api/v2/tokens/${address}/holders?limit=${limit}`
  const res = await fetch(url, { headers: UA_HEADERS })

  if (!res.ok) {
    console.error(`[onchain] holders fetch failed: ${res.status}`)
    return []
  }

  const data = await res.json() as { items?: Array<{ address: { hash: string }; value: string }> }
  return (data.items ?? []).map((item) => ({
    address: item.address.hash,
    value: item.value,
  }))
}

/** Quick health check — is the chain reachable? */
export async function chainStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${BLOCKSCOUT}/api/v2/stats`, { headers: UA_HEADERS })
    return res.ok
  } catch {
    return false
  }
}