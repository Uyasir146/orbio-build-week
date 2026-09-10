/**
 * Telegram delivery — send scan results to @bladd33bot
 */
import { config } from 'dotenv'
config({ path: ['.env.local', '.env'], quiet: true })

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID = process.env.TELEGRAM_CHAT_ID

export interface TelegramMessage {
  text: string
  parse_mode?: 'HTML' | 'Markdown'
  disable_web_page_preview?: boolean
}

export async function sendTelegram(msg: TelegramMessage): Promise<boolean> {
  if (!TOKEN || !CHAT_ID) {
    console.log('[telegram] skipped — TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set')
    return false
  }

  const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: msg.text,
      parse_mode: msg.parse_mode ?? 'HTML',
      disable_web_page_preview: msg.disable_web_page_preview ?? true,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error(`[telegram] failed: ${res.status} ${err}`)
    return false
  }

  const data = await res.json() as { ok: boolean }
  return data.ok
}