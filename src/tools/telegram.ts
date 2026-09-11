/**
 * Telegram delivery — send scan results to @bladd33bot.
 * Auto-splits long messages (Telegram limit: 4096 chars).
 */
import { config } from 'dotenv'
config({ path: ['.env.local', '.env'], quiet: true })

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID = process.env.TELEGRAM_CHAT_ID
const MAX_LEN = 4000  // safe margin under Telegram's 4096

export interface TelegramMessage {
  text: string
  parse_mode?: 'HTML' | 'Markdown'
  disable_web_page_preview?: boolean
}

function splitHtml(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text]

  const chunks: string[] = []
  const paragraphs = text.split('\n')
  let current = ''

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n${para}` : para
    if (candidate.length > maxLen) {
      // Current chunk is full, push it
      if (current) {
        chunks.push(current)
        current = ''
      }
      // If a single paragraph exceeds maxLen, split by sentence boundary
      if (para.length > maxLen) {
        const sentences = para.match(/[^.!?\n]+[.!?\n]*/g) ?? [para]
        let sub = ''
        for (const s of sentences) {
          const combined = sub ? `${sub}${s}` : s
          if (combined.length > maxLen) {
            if (sub) chunks.push(sub)
            sub = s
          } else {
            sub = combined
          }
        }
        if (sub) current = sub
      } else {
        current = para
      }
    } else {
      current = candidate
    }
  }
  if (current) chunks.push(current)

  return chunks
}

export async function sendTelegram(msg: TelegramMessage): Promise<boolean> {
  if (!TOKEN || !CHAT_ID) {
    console.log('[telegram] skipped — TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set')
    return false
  }

  const chunks = splitHtml(msg.text, MAX_LEN)
  if (chunks.length > 1) {
    console.log(`[telegram] splitting into ${chunks.length} chunks (${msg.text.length} chars)`)
  }

  let allOk = true
  for (let i = 0; i < chunks.length; i++) {
    const suffix = chunks.length > 1 ? `\n<i>[${i + 1}/${chunks.length}]</i>` : ''
    const text = chunks[i] + suffix

    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: msg.parse_mode ?? 'HTML',
        disable_web_page_preview: msg.disable_web_page_preview ?? true,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error(`[telegram] chunk ${i + 1}/${chunks.length} failed: ${res.status} ${err}`)
      allOk = false
    } else {
      // Small delay between chunks to respect rate limits
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, 200))
      }
    }
  }

  return allOk
}
