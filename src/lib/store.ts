/**
 * Watcher Store — persistence, history, and noise learning.
 *
 * Each target has:
 *   - config: what to watch + how to check
 *   - history: snapshots over time
 *   - signals: detected changes + LLM interpretations
 *   - meta: read count, last read, noise score
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'

// ── Types ────────────────────────────────────────────────────────────

export type TargetType = 'url' | 'api' | 'rss' | 'onchain' | 'text'

export interface TargetConfig {
  id: string                      // unique slug
  type: TargetType
  label: string                   // human-readable name
  url: string                     // source URL or endpoint
  /** Optional: CSS selector to extract only relevant content */
  selector?: string
  /** Optional: headers for API auth */
  headers?: Record<string, string>
  /** Optional: POST body for API targets */
  body?: string
  /** How often to check (seconds). Auto-adjusted by noise learning. */
  interval_s: number               // minimum interval
  current_interval_s: number       // adaptive — starts at interval_s
  /** Active or paused */
  active: boolean
  /** When was it created */
  created_at: string
}

export interface Snapshot {
  timestamp: string
  content_hash: string             // fast comparison
  content_preview: string          // first 500 chars for diff context
  /** Any numeric values extracted (prices, counts, etc.) */
  values: Record<string, number | null>
}

export interface Signal {
  id: string
  timestamp: string
  /** What type of change was detected */
  change_type: 'value_change' | 'content_change' | 'appeared' | 'disappeared' | 'threshold_breach'
  /** Human summary of what changed */
  summary: string
  /** LLM's interpretation of WHY it changed */
  interpretation: string | null
  /** Key changed values */
  details: Record<string, { old: string | number | null; new: string | number | null }>
  /** Was this signal delivered to the user? */
  delivered: boolean
  /** Did the user read/react to this? */
  read: boolean
}

export interface TargetState {
  config: TargetConfig
  snapshots: Snapshot[]            // last 20
  signals: Signal[]                // last 50
  /** 0-100: how often user ignored this target's signals */
  noise_score: number
  /** Total signals delivered */
  total_signals: number
  /** Signals user actually engaged with */
  engaged_signals: number
  /** When was the last time user asked about this target */
  last_engagement: string | null
}

export interface WatcherStore {
  targets: Record<string, TargetState>
  /** Global: last time any scan ran */
  last_scan: string | null
  /** Global: total signals across all targets */
  total_signals_delivered: number
}

// ── Store ────────────────────────────────────────────────────────────

const STORE_PATH = '.watcher-store.json'

export function loadStore(): WatcherStore {
  try {
    if (existsSync(STORE_PATH)) {
      return JSON.parse(readFileSync(STORE_PATH, 'utf-8'))
    }
  } catch {}
  return { targets: {}, last_scan: null, total_signals_delivered: 0 }
}

export function saveStore(store: WatcherStore) {
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2))
}

// ── Target Management ────────────────────────────────────────────────

export function addTarget(store: WatcherStore, config: TargetConfig): WatcherStore {
  store.targets[config.id] = {
    config: { ...config, current_interval_s: config.interval_s },
    snapshots: [],
    signals: [],
    noise_score: 0,
    total_signals: 0,
    engaged_signals: 0,
    last_engagement: null,
  }
  return store
}

export function removeTarget(store: WatcherStore, id: string): WatcherStore {
  delete store.targets[id]
  return store
}

export function updateTarget(store: WatcherStore, id: string, patch: Partial<TargetConfig>): WatcherStore {
  const target = store.targets[id]
  if (!target) return store
  Object.assign(target.config, patch)
  return store
}

// ── Snapshot Management ──────────────────────────────────────────────

export function addSnapshot(store: WatcherStore, id: string, snapshot: Snapshot): WatcherStore {
  const target = store.targets[id]
  if (!target) return store
  target.snapshots.push(snapshot)
  if (target.snapshots.length > 20) target.snapshots = target.snapshots.slice(-20)
  return store
}

export function getLastSnapshot(store: WatcherStore, id: string): Snapshot | null {
  const target = store.targets[id]
  if (!target || target.snapshots.length === 0) return null
  return target.snapshots[target.snapshots.length - 1]
}

// ── Signal Management ────────────────────────────────────────────────

export function addSignal(store: WatcherStore, id: string, signal: Omit<Signal, 'id' | 'delivered' | 'read'>): { store: WatcherStore; signal: Signal } {
  const target = store.targets[id]
  if (!target) return { store, signal: { ...signal, id: '', delivered: false, read: false } }

  const full: Signal = {
    ...signal,
    id: `${id}-${Date.now()}-${target.signals.length}`,
    delivered: false,
    read: false,
  }

  target.signals.push(full)
  target.total_signals++
  store.total_signals_delivered++
  if (target.signals.length > 50) target.signals = target.signals.slice(-50)

  // Noise learning: if user hasn't engaged with recent signals, increase noise score
  const recentSignals = target.signals.slice(-10)
  const engaged = recentSignals.filter(s => s.read).length
  const total = recentSignals.length
  target.noise_score = total > 0 ? Math.round((1 - engaged / total) * 100) : target.noise_score

  // Adaptive interval: high noise → slow down; low noise → speed up
  if (target.noise_score > 70) {
    target.config.current_interval_s = Math.min(
      target.config.current_interval_s * 2,
      target.config.interval_s * 8,
    )
  } else if (target.noise_score < 30) {
    target.config.current_interval_s = Math.max(
      target.config.current_interval_s / 1.5,
      target.config.interval_s,
    )
  }

  return { store, signal: full }
}

// ── Engagement Tracking ──────────────────────────────────────────────

export function markRead(store: WatcherStore, id: string, signalId: string): WatcherStore {
  const target = store.targets[id]
  if (!target) return store
  const signal = target.signals.find(s => s.id === signalId)
  if (signal) {
    signal.read = true
    target.engaged_signals++
    target.last_engagement = new Date().toISOString()
    // Recalculate noise
    const recentSignals = target.signals.slice(-10)
    const engaged = recentSignals.filter(s => s.read).length
    target.noise_score = recentSignals.length > 0
      ? Math.round((1 - engaged / recentSignals.length) * 100)
      : target.noise_score
  }
  return store
}

// ── Follow-up Queries ────────────────────────────────────────────────

/**
 * Get all signals since a given date for a target.
 * Used for: "what moved since Monday?"
 */
export function getSignalsSince(store: WatcherStore, id: string, since: string): Signal[] {
  const target = store.targets[id]
  if (!target) return []
  const cutoff = new Date(since).getTime()
  return target.signals.filter(s => new Date(s.timestamp).getTime() >= cutoff)
}

/**
 * Get all signals since a date for ALL targets.
 */
export function getAllSignalsSince(store: WatcherStore, since: string): Array<{ targetId: string; label: string; signal: Signal }> {
  const results: Array<{ targetId: string; label: string; signal: Signal }> = []
  const cutoff = new Date(since).getTime()
  for (const [id, target] of Object.entries(store.targets)) {
    for (const signal of target.signals) {
      if (new Date(signal.timestamp).getTime() >= cutoff) {
        results.push({ targetId: id, label: target.config.label, signal })
      }
    }
  }
  return results.sort((a, b) => new Date(b.signal.timestamp).getTime() - new Date(a.signal.timestamp).getTime())
}

/**
 * Get all targets sorted by noise score (lowest = most relevant).
 */
export function getRelevantTargets(store: WatcherStore): TargetState[] {
  return Object.values(store.targets)
    .filter(t => t.config.active)
    .sort((a, b) => a.noise_score - b.noise_score)
}

/**
 * Get targets that are due for a scan based on their adaptive intervals.
 */
export function getDueTargets(store: WatcherStore): TargetState[] {
  const now = Date.now()
  return Object.values(store.targets)
    .filter(t => {
      if (!t.config.active) return false
      const lastSnapshot = t.snapshots[t.snapshots.length - 1]
      if (!lastSnapshot) return true // never scanned
      const lastTime = new Date(lastSnapshot.timestamp).getTime()
      return (now - lastTime) >= (t.config.current_interval_s * 1000)
    })
    .sort((a, b) => a.noise_score - b.noise_score) // low noise = scan first
}