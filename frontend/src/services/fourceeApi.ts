import axios from 'axios'
import type { FourceeSettings } from './fourceeConfig'

export type PulseRangeKey = '24h' | '7d' | '30d'

/** Matches Telegram Control Panel “Query Report” row shape + optional rollups you may add in n8n. */
export type FourceePulse = {
  sent: number
  interested: number
  negative: number
  demos: number
  new_leads?: number
  pending_demo_leads?: number
  campaigns?: Array<{
    campaign_id: string
    created?: string
    total: number
    sent: number
    interested: number
    demos: number
  }>
}

// Note: report intervals intentionally removed from this build.

function headers(settings: FourceeSettings) {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (settings.bearerToken?.trim()) {
    h.Authorization = `Bearer ${settings.bearerToken.trim()}`
  }
  return h
}

export async function postFourceeJson<T = unknown>(
  settings: FourceeSettings,
  url: string,
  body: unknown,
  opts?: { timeoutMs?: number }
): Promise<T> {
  const res = await axios.post<T>(url, body, {
    headers: headers(settings),
    timeout: opts?.timeoutMs ?? 30_000,
  })
  return res.data
}

const SCRAPER_API_BASE =
  typeof import.meta.env.VITE_SCRAPER_CALLBACK_BASE === 'string' &&
  import.meta.env.VITE_SCRAPER_CALLBACK_BASE.trim()
    ? import.meta.env.VITE_SCRAPER_CALLBACK_BASE.trim().replace(/\/$/, '')
    : '/api'

/** Where n8n POSTs scrape results (`callbackUrl` in m1-scrape-website body). */
export function scraperCallbackUrl(jobId: string): string {
  return `${SCRAPER_API_BASE}/scraper-callback/${jobId}`
}

export type ScrapeJobPoll = {
  status: 'pending' | 'complete'
  result?: Record<string, unknown>
}

export type ScrapeCallbackStats = {
  query?: string
  target?: number
  newCount?: number
  dupCount?: number
  total?: number
  total_scraped?: number
  _no_leads?: boolean
  error?: boolean
  message?: string
}

export async function pollScrapeJob(
  jobId: string,
  opts?: { intervalMs?: number; timeoutMs?: number }
): Promise<ScrapeCallbackStats> {
  const intervalMs = opts?.intervalMs ?? 3000
  const timeoutMs = opts?.timeoutMs ?? 5 * 60 * 1000
  const deadline = Date.now() + timeoutMs
  const url = `${SCRAPER_API_BASE}/scraper-callback/${jobId}`

  while (Date.now() < deadline) {
    const res = await axios.get<ScrapeJobPoll>(url, { timeout: 15_000 })
    if (res.data?.status === 'complete' && res.data.result) {
      return res.data.result as ScrapeCallbackStats
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error('Scrape timed out waiting for results. Check that the API server is reachable from n8n.')
}

/** User-facing summary aligned with Telegram “Scrape Complete” copy. */
export function formatScrapeResultMessage(
  query: string,
  target: number,
  raw: ScrapeCallbackStats
): string {
  if (raw.error) {
    return `❌ **Scrape failed**\n\n${raw.message || 'The workflow reported an error. Check n8n.'}`
  }
  if (raw._no_leads) {
    const scraped = raw.total_scraped ?? 0
    return `⚠️ **Scrape finished — no leads found**\n\nQuery: _${query}_\nTarget: ${target}\n\nScraped ${scraped} businesses but none had usable websites. Try a different query.`
  }
  const newCount = num(raw.newCount)
  const dupCount = num(raw.dupCount)
  const total = num(raw.total) || newCount + dupCount
  if (total === 0) {
    return `⚠️ **Scrape finished — no qualified leads found**\n\nQuery: _${query}_\nTarget: ${target}\n\nNo emails were found on any business websites.`
  }
  const icon = total >= target ? '✅' : '⚠️'
  return `${icon} **Scrape complete**\n\nQuery: _${query}_\n\n📥 Leads processed: **${total}** / ${target} target\n🆕 New leads added: **${newCount}**\n🔄 Already in DB: **${dupCount}**\n\nNew leads are ready for outreach.`
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}

/** Accepts raw webhook / Postgres node output variants. */
export function normalizePulse(raw: unknown): Partial<FourceePulse> {
  if (raw == null) return {}
  let row: Record<string, unknown> | null = null
  if (Array.isArray(raw)) {
    row = (raw[0] as Record<string, unknown>) || null
  } else if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    if (o.data && typeof o.data === 'object') {
      return normalizePulse(o.data)
    }
    if (Array.isArray(o.rows) && o.rows.length) {
      return normalizePulse(o.rows)
    }
    row = o
  }
  if (!row) return {}

  const sent = num(row.sent ?? row.emails_sent ?? row.outreach_sent)
  const interested = num(row.interested ?? row.positive ?? row.replied_positive)
  const negative = num(row.negative ?? row.pass ?? row.not_interested)
  const demos = num(row.demos ?? row.demo_booked ?? row.demos_sent)
  const new_leads = row.new_leads !== undefined ? num(row.new_leads) : undefined
  const pending_demo_leads =
    row.pending_demo_leads !== undefined ? num(row.pending_demo_leads) : undefined

  let campaigns: FourceePulse['campaigns']
  if (Array.isArray(row.campaigns)) {
    campaigns = (row.campaigns as Record<string, unknown>[]).map((c) => ({
      campaign_id: String(c.campaign_id ?? ''),
      created: c.created != null ? String(c.created) : undefined,
      total: num(c.total),
      sent: num(c.sent),
      interested: num(c.interested),
      demos: num(c.demos),
    }))
  }

  return {
    sent,
    interested,
    negative,
    demos,
    ...(new_leads !== undefined ? { new_leads } : {}),
    ...(pending_demo_leads !== undefined ? { pending_demo_leads } : {}),
    ...(campaigns ? { campaigns } : {}),
  }
}

export async function fetchFourceePulse(
  settings: FourceeSettings,
  rangeKey: PulseRangeKey
): Promise<FourceePulse | null> {
  void settings
  void rangeKey
  return null
}

export function interestedRate(p: FourceePulse): number {
  if (p.sent <= 0) return 0
  return (p.interested / p.sent) * 100
}

/** Strip punctuation/symbols for scrape webhook payloads — only Unicode letters, digits, spaces (e.g. `Jewellery USA 10`). */
export function scrapeQueryWordsOnly(text: string): string {
  return text
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Same parsing as Telegram Control Panel “Run Scraper” code node. */
export function parseScrapeCommand(text: string): { query: string; count: number } | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const parts = trimmed.split(/\s+/)
  const last = parts[parts.length - 1]
  let count = 20
  let query = trimmed
  const lastNum = parseInt(last, 10)
  if (!Number.isNaN(lastNum) && lastNum > 0 && parts.length >= 2) {
    count = Math.min(lastNum, 100)
    query = parts.slice(0, -1).join(' ')
  }
  query = scrapeQueryWordsOnly(query.trim())
  if (!query) return null
  return { query, count }
}

// firstRowC removed with OS refactor
