/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FOURCEE_WEBHOOK_BASE?: string
  /** Public base for scrape callbacks (e.g. `https://your-api.onrender.com`). Defaults to same origin `/api`. */
  readonly VITE_SCRAPER_CALLBACK_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
