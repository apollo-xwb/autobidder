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
  body: unknown
): Promise<T> {
  const res = await axios.post<T>(url, body, { headers: headers(settings) })
  return res.data
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
  if (!query.trim()) return null
  return { query: query.trim(), count }
}

// firstRowC removed with OS refactor
