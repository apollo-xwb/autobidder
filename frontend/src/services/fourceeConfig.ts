/** Paths discovered from `frontend/public/NEURO` workflow exports (First Outreach, Lead Scraper, Demo Generator). */
export const FOURCEE_WEBHOOK_PATHS = {
  // Your dev’s consolidated campaign launcher endpoint
  launchOutreach: 'm1-campaign',
  leadScrape: 'm1-scrape',
  demoGenerator: 'ae0a5a25-5238-4779-8efd-d9b98188fc45',
} as const

const STORAGE_KEY = 'fourcee:settings:v2'

export type FourceeSettings = {
  webhookBase: string
  bearerToken?: string
  /** Passed to scrape webhook (`m1-scrape`) so Telegram acknowledgements still route somewhere sensible. */
  telegramChatId?: string
}

const DEFAULT_WEBHOOK_BASE =
  typeof import.meta.env.VITE_FOURCEE_WEBHOOK_BASE === 'string' && import.meta.env.VITE_FOURCEE_WEBHOOK_BASE.trim()
    ? import.meta.env.VITE_FOURCEE_WEBHOOK_BASE.trim().replace(/\/$/, '')
    : 'https://app.fourcee.online/webhook'

export function defaultFourceeSettings(): FourceeSettings {
  return {
    webhookBase: DEFAULT_WEBHOOK_BASE,
    bearerToken: undefined,
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
