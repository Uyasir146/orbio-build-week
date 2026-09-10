/**
 * Target Fetchers — one fetcher per target type.
 *
 * Each fetcher returns a normalized { content, values } result
 * that the diff engine can compare across snapshots.
 *
 * Supported types:
 *   url    — scrape any web page, extract text
 *   api    — fetch JSON endpoint, extract values by path
 *   rss    — parse RSS/Atom feed, track new items
 *   onchain — fetch token data from blockscout + dexscreener
 *   text   — plain text comparison (for API docs, configs, etc.)
 */

import type { TargetConfig } from './store.js'

export interface FetchResult {
  /** Raw or processed content (first 2000 chars for diff) */
  content: string
  /** Hash of full content for quick comparison */
  content_hash: string
  /** Extracted numeric values for value-change detection */
  values: Record<string, number | null>
  /** Any metadata */
  meta?: Record<string, string>
  /** Error, if any */
  error?: string
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 RH-Watcher/1.0'

// ── URL Target: Scrape a web page ────────────────────────────────────

async function fetchUrl(target: TargetConfig): Promise<FetchResult> {
  const headers: Record<string, string> = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml',
    ...(target.headers ?? {}),
  }

  const res = await fetch(target.url, { headers })
  if (!res.ok) {
    return { content: '', content_hash: '', values: {}, error: `HTTP ${res.status}` }
  }

  const html = await res.text()

  // Extract text: strip all tags, scripts, styles
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

  // If selector provided, try to extract that portion
  if (target.selector) {
    const match = html.match(new RegExp(`id=["']${target.selector.replace(/^#/, '')}["'][^>]*>([\\s\\S]*?)<\\/`, 'i'))
      || html.match(new RegExp(`class=["'][^"']*${target.selector.replace(/^\./, '')}[^"']*["'][^>]*>([\\s\\S]*?)<\\/`, 'i'))
    if (match) {
      text = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    }
  }

  // Extract numbers (prices, counts, percentages)
  const values: Record<string, number | null> = {}
  const priceMatches = text.match(/\$[\d,]+\.?\d*/g)
  if (priceMatches) values.price_count = priceMatches.length

  const numberMatches = text.match(/\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b/g)
  if (numberMatches) {
    const nums = numberMatches.map(n => parseFloat(n.replace(/,/g, ''))).filter(n => !isNaN(n))
    if (nums.length > 0) {
      values.max_number = Math.max(...nums)
      values.min_number = Math.min(...nums)
      values.text_length = text.length
    }
  }

  // Simple hash
  const { createHash } = await import('crypto')
  const content_hash = createHash('sha256').update(text).digest('hex').slice(0, 16)

  return {
    content: text.slice(0, 2000),
    content_hash,
    values,
  }
}

// ── API Target: Fetch JSON endpoint ───────────────────────────────────

async function fetchApi(target: TargetConfig): Promise<FetchResult> {
  const headers: Record<string, string> = {
    'User-Agent': UA,
    'Accept': 'application/json',
    ...(target.headers ?? {}),
  }

  const init: RequestInit = { headers }
  if (target.body) {
    init.method = 'POST'
    init.body = target.body
  }

  const res = await fetch(target.url, init)
  if (!res.ok) {
    return { content: '', content_hash: '', values: {}, error: `HTTP ${res.status}` }
  }

  const json = await res.json()
  const content = JSON.stringify(json, null, 2)

  // Extract numeric values recursively from JSON
  const values: Record<string, number | null> = {}
  function extractValues(obj: unknown, prefix = '') {
    if (typeof obj === 'number') {
      values[prefix || 'value'] = obj
    } else if (Array.isArray(obj)) {
      obj.forEach((item, i) => extractValues(item, `${prefix}[${i}]`))
    } else if (obj && typeof obj === 'object') {
      for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
        const path = prefix ? `${prefix}.${key}` : key
        extractValues(val, path)
      }
    }
  }
  extractValues(json)

  // Optionally filter to specific paths
  if (target.selector) {
    const filtered: Record<string, number | null> = {}
    const paths = target.selector.split(',').map(p => p.trim())
    for (const path of paths) {
      if (path in values) filtered[path] = values[path]
    }
    if (Object.keys(filtered).length > 0) Object.assign(values, filtered)
  }

  const { createHash } = await import('crypto')
  const content_hash = createHash('sha256').update(content).digest('hex').slice(0, 16)

  return {
    content: content.slice(0, 2000),
    content_hash,
    values,
  }
}

// ── RSS Target: Parse feed, track new items ──────────────────────────

async function fetchRss(target: TargetConfig): Promise<FetchResult> {
  const res = await fetch(target.url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml, application/atom+xml, text/xml' },
  })
  if (!res.ok) {
    return { content: '', content_hash: '', values: {}, error: `HTTP ${res.status}` }
  }

  const xml = await res.text()

  // Extract items/titles/dates
  const items: Array<{ title: string; link: string; date: string }> = []
  const itemRegex = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/g
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    const body = match[1]
    const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/)
    const linkMatch = body.match(/<link[^>]*>([^<]+)<\/link>/) || body.match(/<link[^>]*href="([^"]+)"/)
    const dateMatch = body.match(/<(?:pubDate|published|updated)[^>]*>([^<]+)<\/(?:pubDate|published|updated)>/)
    if (titleMatch) {
      items.push({
        title: titleMatch[1].trim(),
        link: linkMatch?.[1]?.trim() ?? '',
        date: dateMatch?.[1]?.trim() ?? '',
      })
    }
  }

  const content = items.slice(0, 10).map(i => `${i.title} | ${i.date}`).join('\n')

  const { createHash } = await import('crypto')
  const content_hash = createHash('sha256').update(content).digest('hex').slice(0, 16)

  return {
    content: content.slice(0, 2000),
    content_hash,
    values: {
      item_count: items.length,
      newest_item_ts: items[0]?.date ? new Date(items[0].date).getTime() : null,
    },
  }
}

// ── On-Chain Target: DexScreener + Blockscout ────────────────────────

async function fetchOnchain(target: TargetConfig): Promise<FetchResult> {
  // Extract address from URL (format: https://.../token/0x...)
  const addrMatch = target.url.match(/0x[a-fA-F0-9]{40}/)
  if (!addrMatch) {
    return { content: '', content_hash: '', values: {}, error: 'No valid address in URL' }
  }

  const address = addrMatch[0]

  // Fetch from DexScreener
  const dsHead = { 'User-Agent': UA }
  const dsRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, { headers: dsHead })
  const values: Record<string, number | null> = {
    price: null,
    volume_24h: null,
    liquidity: null,
    price_change_24h: null,
    txns_24h: null,
    fdv: null,
  }

  let content = ''
  if (dsRes.ok) {
    const data = await dsRes.json() as { pairs?: Array<Record<string, unknown>> }
    const pairs = data.pairs ?? []
    if (pairs.length > 0) {
      const best = pairs.reduce((a, b) =>
        ((a.liquidity as { usd?: number })?.usd ?? 0) > ((b.liquidity as { usd?: number })?.usd ?? 0) ? a : b
      )
      values.price = parseFloat(String(best.priceUsd ?? '')) || null
      values.volume_24h = (best.volume as { h24?: number })?.h24 ?? null
      values.liquidity = (best.liquidity as { usd?: number })?.usd ?? null
      values.price_change_24h = best.priceChange ? parseFloat(String((best.priceChange as { h24?: number })?.h24 ?? best.priceChange)) : null
      values.txns_24h = best.txns ? parseFloat(String((best.txns as { h24?: { buys: number; sells: number } })?.h24?.buys ?? 0)) : null
      values.fdv = best.fdv ? parseFloat(String(best.fdv)) : null
      content = JSON.stringify(best)
    }
  }

  // Try blockscout too
  try {
    const bsRes = await fetch(`https://robinhoodchain.blockscout.com/api/v2/tokens/${address}`, {
      headers: { ...dsHead, 'x-no-cache': 'true' },
    })
    if (bsRes.ok) {
      const bsData = await bsRes.json() as Record<string, unknown>
      content += '\n' + JSON.stringify(bsData)
      if (bsData.holders !== undefined) values['holders'] = typeof bsData.holders === 'number' ? bsData.holders : null
      if (bsData.circulating_market_cap) values['mcap'] = parseFloat(String(bsData.circulating_market_cap)) || null
    }
  } catch {}

  const { createHash } = await import('crypto')
  const content_hash = createHash('sha256').update(content).digest('hex').slice(0, 16)

  return {
    content: content.slice(0, 2000),
    content_hash,
    values,
  }
}

// ── Dispatcher ───────────────────────────────────────────────────────

const FETCHERS: Record<string, (target: TargetConfig) => Promise<FetchResult>> = {
  url: fetchUrl,
  api: fetchApi,
  rss: fetchRss,
  onchain: fetchOnchain,
  text: fetchUrl, // text targets use URL fetcher (treat as web page)
}

export async function fetchTarget(target: TargetConfig): Promise<FetchResult> {
  const fetcher = FETCHERS[target.type]
  if (!fetcher) {
    return {
      content: '',
      content_hash: '',
      values: {},
      error: `Unknown target type: ${target.type}`,
    }
  }

  try {
    return await fetcher(target)
  } catch (e) {
    return {
      content: '',
      content_hash: '',
      values: {},
      error: e instanceof Error ? e.message : 'Unknown error',
    }
  }
}