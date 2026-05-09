export type FourceeOpType = 'intake' | 'scrape' | 'launch' | 'demo'

export type FourceeOpEvent = {
  id: string
  ts: number
  type: FourceeOpType
  meta?: Record<string, unknown>
}

const STORAGE_KEY = 'fourcee:ops:v1'
const MAX_EVENTS = 250

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function loadFourceeOps(): FourceeOpEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((x): x is FourceeOpEvent => !!x && typeof x === 'object')
      .map((e) => ({
        id: typeof e.id === 'string' ? e.id : uid(),
        ts: typeof e.ts === 'number' ? e.ts : Date.now(),
        type: (e.type as FourceeOpType) || 'launch',
        meta: typeof e.meta === 'object' && e.meta ? (e.meta as Record<string, unknown>) : undefined,
      }))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, MAX_EVENTS)
  } catch {
    return []
  }
}

export function saveFourceeOps(events: FourceeOpEvent[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(0, MAX_EVENTS)))
}

export function logFourceeOp(type: FourceeOpType, meta?: Record<string, unknown>) {
  const current = loadFourceeOps()
  const next: FourceeOpEvent = { id: uid(), ts: Date.now(), type, meta }
  saveFourceeOps([next, ...current])
}

export type OpsRangeKey = '24h' | '7d' | '30d'

const RANGE_MS: Record<OpsRangeKey, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

export function filterOpsByRange(events: FourceeOpEvent[], range: OpsRangeKey): FourceeOpEvent[] {
  const cutoff = Date.now() - RANGE_MS[range]
  return events.filter((e) => e.ts >= cutoff)
}

export function summarizeOps(events: FourceeOpEvent[]) {
  const out = { total: events.length, intake: 0, scrape: 0, launch: 0, demo: 0 }
  for (const e of events) out[e.type]++
  return out
}

