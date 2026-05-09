/** Paths discovered from `frontend/public/NEURO` workflow exports (First Outreach, Lead Scraper, Demo Generator). */
export const FOURCEE_WEBHOOK_PATHS = {
  launchOutreach: '25463b37-dc0f-45df-b077-6022e3b4aab0',
  leadScrape: 'm1-scrape',
  demoGenerator: 'ae0a5a25-5238-4779-8efd-d9b98188fc45',
} as const

const STORAGE_KEY = 'fourcee:settings:v2'

export type FourceeSettings = {
  webhookBase: string
  bearerToken?: string
  /** Full URL — POST `{ extra: "1 day" | "7 days" | "30 days" }` — same SQL as Telegram “Query Report”. */
  metricsWebhookUrl?: string
  /** POST `{}` → row shaped like Telegram “Query Status” (pipeline overview). */
  pipelineStatusWebhookUrl?: string
  /** POST `{}` → rows shaped like Telegram “Query Campaigns” (campaign history). */
  campaignHistoryWebhookUrl?: string
  /** Passed to scrape webhook (`m1-scrape`) so Telegram acknowledgements still route somewhere sensible. */
  telegramChatId?: string
  /** Optional: POST → JSON like Telegram “Count New” (`{ "c": number }` or `[{ "c": N }]`). */
  countNewWebhookUrl?: string
  /** Optional: POST → JSON array of `{ lead_id, company_name, city? }` (Query Pending). */
  pendingDemosWebhookUrl?: string
  /** Optional: POST → JSON array of human follow-up rows (Query Human). */
  humanFollowupWebhookUrl?: string
}

const DEFAULT_WEBHOOK_BASE =
  typeof import.meta.env.VITE_FOURCEE_WEBHOOK_BASE === 'string' && import.meta.env.VITE_FOURCEE_WEBHOOK_BASE.trim()
    ? import.meta.env.VITE_FOURCEE_WEBHOOK_BASE.trim().replace(/\/$/, '')
    : 'https://app.fourcee.online/webhook'

const DEFAULT_METRICS =
  typeof import.meta.env.VITE_FOURCEE_METRICS_URL === 'string' && import.meta.env.VITE_FOURCEE_METRICS_URL.trim()
    ? import.meta.env.VITE_FOURCEE_METRICS_URL.trim()
    : ''

export function defaultFourceeSettings(): FourceeSettings {
  return {
    webhookBase: DEFAULT_WEBHOOK_BASE,
    bearerToken: undefined,
    metricsWebhookUrl: DEFAULT_METRICS || undefined,
    telegramChatId: undefined,
  }
}

export function loadFourceeSettings(): FourceeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultFourceeSettings()
    const parsed = JSON.parse(raw) as Partial<FourceeSettings>
    return { ...defaultFourceeSettings(), ...(parsed || {}) }
  } catch {
    return defaultFourceeSettings()
  }
}

export function saveFourceeSettings(settings: FourceeSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function webhookUrl(settings: FourceeSettings, path: string): string {
  const base = settings.webhookBase.replace(/\/$/, '')
  const p = path.replace(/^\//, '')
  return `${base}/${p}`
}
