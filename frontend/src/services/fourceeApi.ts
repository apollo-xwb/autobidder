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

const RANGE_TO_SQL_INTERVAL: Record<PulseRangeKey, string> = {
  '24h': '1 day',
  '7d': '7 days',
  '30d': '30 days',
}

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

/** POST `{ extra: "<interval>" }` — mirrors Telegram Control Panel “Prep Report Interval” feeding “Query Report”. */
export async function fetchFourceePulse(
  settings: FourceeSettings,
  rangeKey: PulseRangeKey
): Promise<FourceePulse | null> {
  const url = settings.metricsWebhookUrl?.trim()
  if (!url) return null

  const extra = RANGE_TO_SQL_INTERVAL[rangeKey] ?? '7 days'
  const raw = await postFourceeJson<unknown>(settings, url, { extra })
  const n = normalizePulse(raw)
  return {
    sent: n.sent ?? 0,
    interested: n.interested ?? 0,
    negative: n.negative ?? 0,
    demos: n.demos ?? 0,
    new_leads: n.new_leads,
    pending_demo_leads: n.pending_demo_leads,
    campaigns: n.campaigns,
  }
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

function firstRowC(raw: unknown): number | null {
  let row: Record<string, unknown> | undefined
  if (Array.isArray(raw) && raw[0] && typeof raw[0] === 'object') {
    row = raw[0] as Record<string, unknown>
  } else if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    if (Array.isArray(o.rows) && o.rows[0]) row = o.rows[0] as Record<string, unknown>
    else row = o
  }
  if (!row) return null
  const c = row.c ?? row.count ?? row.new_count
  const n = typeof c === 'number' ? c : parseInt(String(c ?? ''), 10)
  return Number.isFinite(n) ? n : null
}

export async function fetchNewLeadCount(settings: FourceeSettings): Promise<number | null> {
  const url = settings.countNewWebhookUrl?.trim()
  if (!url) return null
  try {
    const raw = await postFourceeJson<unknown>(settings, url, {})
    return firstRowC(raw)
  } catch {
    return null
  }
}

/** Telegram “Query Status” aggregate row. */
export type PipelineStatusRow = {
  total_leads: number
  new_leads: number
  emails_sent: number
  interested: number
  not_interested: number
  demos_sent: number
  dead: number
  total_campaigns: number
}

function parsePipelineStatus(raw: unknown): PipelineStatusRow | null {
  let row: Record<string, unknown> | undefined
  if (Array.isArray(raw) && raw[0] && typeof raw[0] === 'object') row = raw[0] as Record<string, unknown>
  else if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    if (Array.isArray(o.rows) && o.rows[0]) row = o.rows[0] as Record<string, unknown>
    else row = o
  }
  if (!row) return null
  return {
    total_leads: num(row.total_leads),
    new_leads: num(row.new_leads),
    emails_sent: num(row.emails_sent ?? row.outreach_sent),
    interested: num(row.interested),
    not_interested: num(row.not_interested ?? row.negative),
    demos_sent: num(row.demos_sent ?? row.demos),
    dead: num(row.dead),
    total_campaigns: num(row.total_campaigns ?? row.campaigns_count),
  }
}

export type WebhookFetch<T> = { kind: 'missing' } | { kind: 'error'; message: string } | { kind: 'ok'; value: T }

export async function fetchPipelineStatus(settings: FourceeSettings): Promise<WebhookFetch<PipelineStatusRow>> {
  const url = settings.pipelineStatusWebhookUrl?.trim()
  if (!url) return { kind: 'missing' }
  try {
    const raw = await postFourceeJson<unknown>(settings, url, {})
    const v = parsePipelineStatus(raw)
    if (!v) return { kind: 'error', message: 'Status webhook returned an unexpected shape.' }
    return { kind: 'ok', value: v }
  } catch (e: unknown) {
    return { kind: 'error', message: e instanceof Error ? e.message : 'Status request failed' }
  }
}

/** Telegram “Query Campaigns” row (LIMIT 5). */
export type CampaignHistoryRow = {
  campaign_id?: string
  created: string
  total: number
  sent: number
  interested: number
  demos: number
}

function parseCampaignHistory(raw: unknown): CampaignHistoryRow[] {
  const arr = Array.isArray(raw) ? raw : (raw as { rows?: unknown }).rows
  if (!Array.isArray(arr)) return []
  return arr
    .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
    .map((r) => ({
      campaign_id: r.campaign_id != null ? String(r.campaign_id) : undefined,
      created: String(r.created ?? r.created_at ?? ''),
      total: num(r.total),
      sent: num(r.sent),
      interested: num(r.interested),
      demos: num(r.demos),
    }))
}

export async function fetchCampaignHistory(settings: FourceeSettings): Promise<WebhookFetch<CampaignHistoryRow[]>> {
  const url = settings.campaignHistoryWebhookUrl?.trim()
  if (!url) return { kind: 'missing' }
  try {
    const raw = await postFourceeJson<unknown>(settings, url, {})
    const list = parseCampaignHistory(raw)
    return { kind: 'ok', value: list }
  } catch (e: unknown) {
    return { kind: 'error', message: e instanceof Error ? e.message : 'Campaign history request failed' }
  }
}

export type PendingDemoLead = { lead_id: string; company_name: string; city?: string }

export async function fetchPendingDemoLeads(
  settings: FourceeSettings
): Promise<WebhookFetch<PendingDemoLead[]>> {
  const url = settings.pendingDemosWebhookUrl?.trim()
  if (!url) return { kind: 'missing' }
  try {
    const raw = await postFourceeJson<unknown>(settings, url, {})
    const arr = Array.isArray(raw) ? raw : (raw as { rows?: unknown }).rows
    if (!Array.isArray(arr)) return { kind: 'error', message: 'Pending demos webhook returned an unexpected shape.' }
    const leads = arr
      .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
      .map((r) => ({
        lead_id: String(r.lead_id ?? ''),
        company_name: String(r.company_name ?? 'Lead'),
        city: r.city != null ? String(r.city) : undefined,
      }))
      .filter((r) => r.lead_id.length > 0)
    return { kind: 'ok', value: leads }
  } catch (e: unknown) {
    return { kind: 'error', message: e instanceof Error ? e.message : 'Pending demos request failed' }
  }
}

export type HumanFollowupLead = {
  lead_id?: string
  company_name: string
  email?: string
  city?: string
  demo_url?: string
  demo_sent_at?: string
}

export async function fetchHumanFollowups(settings: FourceeSettings): Promise<WebhookFetch<HumanFollowupLead[]>> {
  const url = settings.humanFollowupWebhookUrl?.trim()
  if (!url) return { kind: 'missing' }
  try {
    const raw = await postFourceeJson<unknown>(settings, url, {})
    const arr = Array.isArray(raw) ? raw : (raw as { rows?: unknown }).rows
    if (!Array.isArray(arr)) return { kind: 'error', message: 'Human follow-up webhook returned an unexpected shape.' }
    const rows = arr
      .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
      .map((r) => ({
        lead_id: r.lead_id != null ? String(r.lead_id) : undefined,
        company_name: String(r.company_name ?? ''),
        email: r.email != null ? String(r.email) : undefined,
        city: r.city != null ? String(r.city) : undefined,
        demo_url: r.demo_url != null ? String(r.demo_url) : undefined,
        demo_sent_at: r.demo_sent_at != null ? String(r.demo_sent_at) : undefined,
      }))
      .filter((r) => r.company_name.length > 0)
    return { kind: 'ok', value: rows }
  } catch (e: unknown) {
    return { kind: 'error', message: e instanceof Error ? e.message : 'Human follow-up request failed' }
  }
}

/** Telegram report intervals → `Query Report` SQL. */
export const REPORT_INTERVALS = [
  { extra: '1 day', label: 'Today' },
  { extra: '7 days', label: 'This Week' },
  { extra: '30 days', label: 'This Month' },
] as const

export async function fetchReportForInterval(
  settings: FourceeSettings,
  extra: string
): Promise<WebhookFetch<FourceePulse>> {
  const url = settings.metricsWebhookUrl?.trim()
  if (!url) return { kind: 'missing' }
  try {
    const raw = await postFourceeJson<unknown>(settings, url, { extra })
    const n = normalizePulse(raw)
    return {
      kind: 'ok',
      value: {
        sent: n.sent ?? 0,
        interested: n.interested ?? 0,
        negative: n.negative ?? 0,
        demos: n.demos ?? 0,
      },
    }
  } catch (e: unknown) {
    return { kind: 'error', message: e instanceof Error ? e.message : 'Report request failed' }
  }
}
