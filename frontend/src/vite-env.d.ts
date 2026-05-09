/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FOURCEE_WEBHOOK_BASE?: string
  readonly VITE_FOURCEE_METRICS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
