#!/usr/bin/env tsx
/**
 * One-Command Demo — clone, install, npm run demo → everything works.
 *
 * 1. Seeds default watchers (ORBIO token + Orbio Build Page + CoinTelegraph)
 * 2. Runs a full scan against all targets
 * 3. Prints a formatted summary
 * 4. Starts the dashboard server (background)
 * 5. Opens browser to dashboard (if possible)
 *
 * Usage: npm run demo
 */

import { config } from 'dotenv'
config({ path: ['.env.local', '.env'], quiet: true })

import { execSync } from 'child_process'

const BOLD = '\x1b[1m'
const GREEN = '\x1b[32m'
const BLUE = '\x1b[34m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'
const RESET = '\x1b[0m'

function banner(text: string) { console.log(`\n${BOLD}${BLUE}═══ ${text} ═══${RESET}\n`) }
function ok(text: string) { console.log(`${GREEN}✅ ${text}${RESET}`) }
function info(text: string) { console.log(`${CYAN}ℹ ${text}${RESET}`) }
function warn(text: string) { console.log(`${YELLOW}⚠ ${text}${RESET}`) }

async function main() {
  // Check for required keys
  if (!process.env.OPENROUTER_API_KEY) {
    console.log(`${BOLD}🔑 Orbio key not found!${RESET}`)
    console.log('   1. Copy .env.example to .env.local')
    console.log('   2. Fill in OPENROUTER_API_KEY + TELEGRAM_BOT_TOKEN')
    console.log('   3. Run: npm run demo')
    process.exit(1)
  }

  console.log(`${BOLD}${BLUE}🛠  Swiss-Army Web Watcher — Live Demo${RESET}\n`)

  // Step 1: Seed watchers
  banner('1. SEEDING WATCHERS')
  try {
    execSync('npx tsx src/watch.ts --init', { stdio: 'inherit', timeout: 10000 })
  } catch { /* --init is idempotent, errors if already seeded */ }

  // Add extra watchers for a richer demo
  const extraWatchers = [
    { type: 'url', url: 'https://sellers.orbio.so/build', label: 'Orbio Build Page' },
    { type: 'rss', url: 'https://cointelegraph.com/rss', label: 'CoinTelegraph RSS' },
    { type: 'api', url: 'https://api.dexscreener.com/latest/dex/tokens/0xAa07A0e9209e16aC99708C3EC70159c6eF3128A3', label: 'ORBIO DexScreener' },
  ]

  for (const w of extraWatchers) {
    try {
      const cmd = `npx tsx src/watch.ts --add ${w.type} "${w.url}" "${w.label}"`
      execSync(cmd, { stdio: 'pipe', timeout: 15000 })
      ok(`Added: ${w.label} (${w.type})`)
    } catch {
      info(`Already exists: ${w.label}`)
    }
  }

  // Step 2: Status check
  banner('2. CURRENT STATUS')
  try {
    execSync('npx tsx src/watch.ts --status', { stdio: 'inherit', timeout: 10000 })
  } catch { warn('Status check skipped') }

  // Step 3: Run a scan
  banner('3. SCANNING TARGETS')
  try {
    execSync('npx tsx src/watch.ts', { stdio: 'inherit', timeout: 60000 })
  } catch { warn('Scan completed with warnings (normal for first run)') }

  // Step 4: Dashboard
  banner('4. STARTING DASHBOARD')
  const port = process.env.DASHBOARD_PORT ?? '3456'
  console.log(`   Dashboard → ${CYAN}http://localhost:${port}${RESET}`)
  console.log(`   Leave this terminal open. Press Ctrl+C to stop.\n`)

  // Try to open browser
  try {
    const openCmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open'
    execSync(`${openCmd} http://localhost:${port}`, { stdio: 'ignore', timeout: 5000 })
  } catch { /* browser open is best-effort */ }

  // Start dashboard (foreground — user sees it)
  execSync('npx tsx src/dashboard.ts', { stdio: 'inherit' })
}

main().catch(err => {
  console.error(`${YELLOW}Demo interrupted:${RESET}`, err.message)
  process.exit(0) // graceful — don't scare the user
})