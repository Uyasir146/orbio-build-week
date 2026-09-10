/**
 * Pattern-based alert escalation.
 *
 * Detects momentum shifts across score history:
 * - BREAKOUT: IGNORE → WATCH → ENTRY (or WATCH → ENTRY in 2 scans)
 * - BREAKDOWN: ENTRY → WATCH → IGNORE (or ENTRY → WATCH)
 * - SURGE: confidence jump >20 points in 2 scans
 *
 * When a pattern triggers, returns an escalated message for Telegram.
 */

interface ScoreEntry {
  timestamp: string
  decision: string
  confidence: number
  price: number | null
}

export interface EscalationAlert {
  symbol: string
  pattern: 'BREAKOUT' | 'BREAKDOWN' | 'SURGE' | 'NEW_ENTRY'
  urgency: '🔴' | '🟡' | '🟢'
  message: string
}

/**
 * Analyze a symbol's score history for patterns.
 * Returns null if nothing interesting, or an escalation alert.
 */
export function detectPattern(symbol: string, entries: ScoreEntry[]): EscalationAlert | null {
  if (entries.length < 2) return null

  const latest = entries[entries.length - 1]
  const prev = entries[entries.length - 2]
  const prevPrev = entries.length >= 3 ? entries[entries.length - 3] : null

  // BREAKOUT: IGNORE → WATCH → ENTRY
  if (prevPrev && prevPrev.decision === 'IGNORE' && prev.decision === 'WATCH' && latest.decision === 'ENTRY') {
    return {
      symbol,
      pattern: 'BREAKOUT',
      urgency: '🔴',
      message: [
        `🔥 <b>BREAKOUT DETECTED: ${symbol}</b>`,
        `IGNORE(${prevPrev.confidence}) → WATCH(${prev.confidence}) → <b>ENTRY(${latest.confidence})</b>`,
        `Price trend: ${prevPrev.price ? '$' + prevPrev.price : 'N/A'} → ${latest.price ? '$' + latest.price : 'N/A'}`,
      ].join('\n'),
    }
  }

  // WATCH → ENTRY in 2 scans
  if (prev.decision === 'WATCH' && latest.decision === 'ENTRY') {
    return {
      symbol,
      pattern: 'BREAKOUT',
      urgency: '🟡',
      message: [
        `🔥 <b>MOMENTUM SHIFT: ${symbol}</b>`,
        `WATCH(${prev.confidence}) → <b>ENTRY(${latest.confidence})</b>`,
        `Confidence: +${latest.confidence - prev.confidence} points`,
      ].join('\n'),
    }
  }

  // SURGE: confidence jump >20 points
  const confidenceJump = latest.confidence - prev.confidence
  if (confidenceJump >= 20 && latest.decision !== 'IGNORE') {
    return {
      symbol,
      pattern: 'SURGE',
      urgency: '🟡',
      message: [
        `📈 <b>CONFIDENCE SURGE: ${symbol}</b>`,
        `${prev.decision}(${prev.confidence}) → ${latest.decision}(${latest.confidence}) [+${confidenceJump}]`,
        `Signal strengthening — monitor closely.`,
      ].join('\n'),
    }
  }

  // BREAKDOWN: ENTRY → WATCH → IGNORE
  if (prevPrev && prevPrev.decision === 'ENTRY' && prev.decision === 'WATCH' && latest.decision === 'IGNORE') {
    return {
      symbol,
      pattern: 'BREAKDOWN',
      urgency: '🔴',
      message: [
        `🚨 <b>BREAKDOWN: ${symbol}</b>`,
        `ENTRY(${prevPrev.confidence}) → WATCH(${prev.confidence}) → <b>IGNORE(${latest.confidence})</b>`,
        `Exit signal — conviction collapsed.`,
      ].join('\n'),
    }
  }

  // ENTRY → WATCH (pre-breakdown)
  if (prev.decision === 'ENTRY' && latest.decision === 'WATCH') {
    return {
      symbol,
      pattern: 'BREAKDOWN',
      urgency: '🟡',
      message: [
        `⚠ <b>WEAKENING: ${symbol}</b>`,
        `ENTRY(${prev.confidence}) → WATCH(${latest.confidence})`,
        `Conviction fading — review position.`,
      ].join('\n'),
    }
  }

  // First-ever ENTRY for this symbol
  if (entries.length >= 1 && latest.decision === 'ENTRY' && entries.filter(e => e.decision === 'ENTRY').length === 1) {
    return {
      symbol,
      pattern: 'NEW_ENTRY',
      urgency: '🟢',
      message: [
        `🆕 <b>FIRST ENTRY: ${symbol}</b>`,
        `Agent declares ENTRY for the first time at ${latest.confidence}% confidence.`,
        latest.price ? `Price: $${latest.price}` : '',
      ].filter(Boolean).join('\n'),
    }
  }

  return null
}

/**
 * Scan all symbols in history and return all active escalations.
 */
export function scanEscalations(history: Record<string, ScoreEntry[]>): EscalationAlert[] {
  const alerts: EscalationAlert[] = []
  for (const [symbol, entries] of Object.entries(history)) {
    const alert = detectPattern(symbol, entries)
    if (alert) alerts.push(alert)
  }
  return alerts.sort((a, b) => {
    const order = { '🔴': 0, '🟡': 1, '🟢': 2 }
    return (order[a.urgency] ?? 3) - (order[b.urgency] ?? 3)
  })
}