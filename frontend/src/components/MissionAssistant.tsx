import React from 'react'
import { FOURCEE_WEBHOOK_PATHS, loadFourceeSettings, saveFourceeSettings, webhookUrl, type FourceeSettings } from '../services/fourceeConfig'
import {
  formatScrapeResultMessage,
  parseScrapeCommand,
  pollScrapeJob,
  postFourceeJson,
  scraperCallbackUrl,
} from '../services/fourceeApi'
import { logFourceeOp } from '../services/fourceeTelemetry'

/** Matches Telegram main menu callbacks + web-only Config. */
export type AssistantDockMode = 'intake' | 'scrape' | 'launch' | 'demo' | 'config'

type Chip = { id: string; label: string; onSelect: () => void }

type ChatMsg = {
  id: string
  role: 'assistant' | 'user'
  text: string
  chips?: Chip[]
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function newCampaignId() {
  return crypto.randomUUID()
}

type IntakeBody = {
  email: string
  company_name: string
  city?: string
  current_url?: string
}

type ConfigFieldKey =
  | 'webhookBase'
  | 'bearerToken'
  | 'telegramChatId'

const CONFIG_STEPS: { field: ConfigFieldKey; ask: string; optional: boolean }[] = [
  {
    field: 'webhookBase',
    ask: 'Where should commands point?\n\nPaste your **main link** (the bit before `/m1-scrape-website` — **no** slash on the end).\n\nExample shape: `https://your-host/webhook`',
    optional: false,
  },
  {
    field: 'bearerToken',
    ask: 'If your host asks for a **secret password** on each call, paste it here. Otherwise **Skip**.',
    optional: true,
  },
  {
    field: 'telegramChatId',
    ask: 'Want scrape progress **pinged in Telegram**? Paste your chat number. Otherwise **Skip**.',
    optional: true,
  },
]

const MODE_TITLE: Record<AssistantDockMode, string> = {
  intake: 'Lead intake',
  scrape: 'Scrape',
  launch: 'Campaign',
  demo: 'Demo',
  config: 'Config',
}

export default function MissionAssistant({
  mode,
  onClose,
  onPulseRefresh,
}: {
  mode: AssistantDockMode
  onClose: () => void
  onPulseRefresh: () => void
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const configAcc = React.useRef<FourceeSettings>(loadFourceeSettings())
  const launchRunnerRef = React.useRef<(count: number, label: string) => void>(() => {})
  const demoRunnerRef = React.useRef<(leadId: string, echo: string) => void>(() => {})

  const [msgs, setMsgs] = React.useState<ChatMsg[]>([])
  const [composer, setComposer] = React.useState('')
  const [composerHint, setComposerHint] = React.useState('')
  const [composerEnabled, setComposerEnabled] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [configIdx, setConfigIdx] = React.useState(0)
  const [configReview, setConfigReview] = React.useState(false)

  const appendAssistant = React.useCallback((text: string, chips?: Chip[]) => {
    setMsgs((m) => [...m, { id: uid(), role: 'assistant', text, chips }])
  }, [])

  const appendUser = React.useCallback((text: string) => {
    setMsgs((m) => [...m, { id: uid(), role: 'user', text }])
  }, [])

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, busy])

  const runLaunch = React.useCallback(
    async (count: number, label: string) => {
      const s = loadFourceeSettings()
      const campaignId = newCampaignId()
      appendUser(label)
      appendAssistant('Starting outreach…')
      setBusy(true)
      try {
        await postFourceeJson(s, webhookUrl(s, FOURCEE_WEBHOOK_PATHS.launchOutreach), { count, campaignId })
        appendAssistant(`Live.\n\n\`${campaignId}\` · **${count}** leads locked for send.`)
        logFourceeOp('launch', { count, campaignId })
        onPulseRefresh()
      } catch (e: unknown) {
        appendAssistant(`${e instanceof Error ? e.message : 'Launch failed'}`)
      } finally {
        setBusy(false)
      }
    },
    [appendAssistant, appendUser, onPulseRefresh]
  )

  launchRunnerRef.current = runLaunch

  const runDemoLead = React.useCallback(
    async (leadId: string, echo: string) => {
      appendUser(echo)
      appendAssistant(
        '🎯 **Generating Demo…**\n\nThis takes ~60 seconds. You\'ll receive a notification once it\'s ready.'
      )
      setBusy(true)
      try {
        const s = loadFourceeSettings()
        await postFourceeJson(s, webhookUrl(s, FOURCEE_WEBHOOK_PATHS.demoGenerator), { lead_id: leadId.trim() })
        appendAssistant('Got it — your demo run is queued.')
        logFourceeOp('demo', { lead_id: leadId.trim() })
        setComposerEnabled(false)
        onPulseRefresh()
      } catch (e: unknown) {
        appendAssistant(`${e instanceof Error ? e.message : 'Demo failed'}`)
      } finally {
        setBusy(false)
      }
    },
    [appendAssistant, appendUser, onPulseRefresh]
  )

  demoRunnerRef.current = runDemoLead

  // Reports/status/history are intentionally out-of-scope for the 4-action Mission Control OS.

  React.useEffect(() => {
    function batchChips(max: number | undefined): Chip[] {
      const sizes = [10, 25, 50, 100] as const
      const chips: Chip[] = sizes
        .filter((n) => max === undefined || n <= max)
        .map((n) => ({
          id: `b-${n}`,
          label: `${n} leads`,
          onSelect: () => launchRunnerRef.current(n, `${n} leads`),
        }))
      const cap = max === undefined ? 9999 : Math.min(max, 9999)
      chips.push({
        id: 'all',
        label: max !== undefined ? `All (${max})` : 'All',
        onSelect: () => launchRunnerRef.current(cap, max !== undefined ? `All (${max})` : 'All'),
      })
      return chips
    }

    async function boot() {
      setMsgs([])
      setComposer('')
      setComposerHint('')
      setBusy(false)
      setConfigIdx(0)
      setConfigReview(false)
      configAcc.current = loadFourceeSettings()

      if (mode === 'intake') {
        setComposerEnabled(true)
        setComposerHint('email, company, city, url (optional)')
        appendAssistant(
          '➕ **Add a lead**\n\nSend one line like:\n\n`email | company | city | website`\n\nCity + website are optional.'
        )
      } else if (mode === 'launch') {
        setComposerEnabled(false)
        appendAssistant('🚀 **Launch**\nHow many leads should I send to?', batchChips(undefined))
      } else if (mode === 'scrape') {
        setComposerEnabled(true)
        setComposerHint('plumbers Cape Town 30')
        appendAssistant(
          '🔍 **Scrape Leads from Google Maps**\n\nJust type your search below — no commands needed:\n\n`industry city quantity`\n\nExamples:\n• `plumbers Cape Town 30`\n• `electricians Johannesburg 50`\n• `HVAC companies Durban 20`'
        )
      } else if (mode === 'demo') {
        setComposerEnabled(true)
        setComposerHint('lead_id UUID')
        appendAssistant('🎯 **Demo**\nPaste a **lead_id** and I’ll generate & deploy the demo site.')
      } else if (mode === 'config') {
        setComposerEnabled(true)
        setComposerHint(configAcc.current.webhookBase || '')
        appendAssistant(
          'Let’s wire this once.\n\nI need your **main link**. Everything else is optional.'
        )
        appendAssistant(CONFIG_STEPS[0].ask)
      }
    }

    void boot()
    return () => {
      // no-op
    }
  }, [mode, appendAssistant, onClose])

  const submitConfig = React.useCallback(
    (skipped: boolean) => {
      const step = CONFIG_STEPS[configIdx]
      if (!step || configReview) return

      let skip = skipped
      let raw = composer.trim()
      setComposer('')
      if (!skip && !raw && step.optional) skip = true

      let next = { ...configAcc.current }

      if (skip && step.optional) {
        appendUser('Skip')
        if (step.field !== 'webhookBase') (next as Record<string, string | undefined>)[step.field] = undefined
      } else {
        if (!raw) {
          appendAssistant('I need something in the box for this step — or tap **Skip** if it\'s optional.')
          return
        }
        appendUser(raw.length > 40 ? `${raw.slice(0, 40)}…` : raw)
        if (step.field === 'webhookBase') next.webhookBase = raw.replace(/\/$/, '')
        else (next as Record<string, string | undefined>)[step.field] = raw
      }

      configAcc.current = next

      const ni = configIdx + 1
      if (ni >= CONFIG_STEPS.length) {
        setConfigReview(true)
        setComposerEnabled(false)
        appendAssistant(
          `**Does this look right?**\n\nI’ll save it **only on this device**.\n\n• Main link: \`${next.webhookBase}\`\n• Secret (if any): ${next.bearerToken ? '✓ set' : 'skipped'}\n• Telegram pings: ${next.telegramChatId ? '✓ set' : 'skipped'}`,
          [
            {
              id: 'save',
              label: 'Save & close',
              onSelect: () => {
                saveFourceeSettings(next)
                appendAssistant('Stored locally.')
                onPulseRefresh()
                onClose()
              },
            },
          ]
        )
        return
      }

      setConfigIdx(ni)
      appendAssistant(CONFIG_STEPS[ni].ask)
      const h = next[CONFIG_STEPS[ni].field]
      setComposerHint(typeof h === 'string' ? h : '')
    },
    [appendAssistant, appendUser, composer, configIdx, configReview, onClose, onPulseRefresh]
  )

  const submitScrape = React.useCallback(async () => {
    const parsed = parseScrapeCommand(composer)
    setComposer('')
    if (!parsed) {
      appendAssistant('Need text like `coffee shops Austin 25`.')
      return
    }
    appendUser(`${parsed.query} ${parsed.count}`)
    const s = loadFourceeSettings()
    const rawChat = s.telegramChatId?.trim()
    const chatNum = rawChat ? parseInt(rawChat, 10) : NaN
    const chatId = Number.isFinite(chatNum) && chatNum !== 0 ? chatNum : undefined
    const jobId = crypto.randomUUID()
    const callbackUrl = scraperCallbackUrl(jobId)
    setBusy(true)
    appendAssistant('Scraping in progress… Usually **1–2 minutes**. You can leave this open.')
    try {
      await postFourceeJson(
        s,
        webhookUrl(s, FOURCEE_WEBHOOK_PATHS.leadScrapeWebsite),
        {
          query: parsed.query,
          count: parsed.count,
          callbackUrl,
          ...(chatId !== undefined ? { chatId } : {}),
        },
        { timeoutMs: 20_000 }
      )
      const stats = await pollScrapeJob(jobId)
      appendAssistant(formatScrapeResultMessage(parsed.query, parsed.count, stats))
      logFourceeOp('scrape', { query: parsed.query, count: parsed.count, ...stats })
      setComposerEnabled(false)
      onPulseRefresh()
    } catch (e: unknown) {
      appendAssistant(`${e instanceof Error ? e.message : 'Failed'}`)
    } finally {
      setBusy(false)
    }
  }, [appendAssistant, appendUser, composer, onPulseRefresh])

  const onSend = React.useCallback(() => {
    if (busy) return
    if (mode === 'config') submitConfig(false)
    else if (mode === 'intake') {
      const t = composer.trim()
      setComposer('')
      if (!t) return
      void (async () => {
        // Parse `email | company | city | website`
        const parts = t.split('|').map((p) => p.trim()).filter(Boolean)
        const [email, company_name, city, current_url] = parts
        if (!email || !company_name) {
          appendAssistant('I need at least **email** and **company**.\n\nTry: `email | company | city | website`')
          return
        }
        appendUser(`${email} · ${company_name}`)
        setBusy(true)
        appendAssistant('Adding…')
        try {
          const s = loadFourceeSettings()
          const body: IntakeBody = { email, company_name }
          if (city) body.city = city
          if (current_url) body.current_url = current_url
          await postFourceeJson(s, webhookUrl(s, 'lead-intake'), body)
          appendAssistant('✅ Saved.')
          logFourceeOp('intake', { email, company_name, city, current_url })
        } catch (e: unknown) {
          appendAssistant(`${e instanceof Error ? e.message : 'Failed'}`)
        } finally {
          setBusy(false)
        }
      })()
    }
    else if (mode === 'scrape') void submitScrape()
    else if (mode === 'demo') {
      const t = composer.trim()
      setComposer('')
      if (t) void demoRunnerRef.current(t, t)
    }
  }, [busy, mode, composer, submitConfig, submitScrape])

  const optionalSkip =
    mode === 'config' && !configReview && CONFIG_STEPS[configIdx]?.optional === true

  const showComposer = composerEnabled && !(mode === 'config' && configReview)

  return (
    <div className="ma-backdrop" role="presentation" onClick={onClose}>
      <div
        className="ma-shell card"
        role="dialog"
        aria-modal="true"
        aria-label={`Assistant · ${MODE_TITLE[mode]}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ma-head">
          <div className="ma-head-title">
            <span className="ma-pulse-dot" />
            <span>{MODE_TITLE[mode]}</span>
          </div>
          <button type="button" className="ma-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="ma-thread" ref={scrollRef}>
          {msgs.map((m) => (
            <div key={m.id} className={`ma-msg ma-msg-${m.role}`}>
              <div className="ma-bubble">
                {m.text.split('\n').map((line, i) => (
                  <React.Fragment key={i}>
                    {i > 0 ? <br /> : null}
                    <MaLine text={line} />
                  </React.Fragment>
                ))}
              </div>
              {m.chips && (
                <div className="ma-chips">
                  {m.chips.map((c) => (
                    <button key={c.id} type="button" className="ma-chip" disabled={busy} onClick={() => c.onSelect()}>
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div className="ma-msg ma-msg-assistant">
              <div className="ma-typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
        </div>

        {showComposer && (
          <footer className="ma-footer">
            <input
              className="ma-input"
              placeholder={composerHint || 'Message…'}
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              disabled={busy}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onSend())}
            />
            {optionalSkip && (
              <button type="button" className="btn ma-skip" disabled={busy} onClick={() => submitConfig(true)}>
                Skip
              </button>
            )}
            <button type="button" className="btn btn-primary ma-send" disabled={busy} onClick={onSend}>
              Send
            </button>
          </footer>
        )}
      </div>
    </div>
  )
}

function MaLine({ text }: { text: string }) {
  const tokenRe = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g
  const parts = text.split(tokenRe).filter(Boolean)
  return (
    <>
      {parts.map((p, i) => {
        const mdLink = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p)
        if (mdLink) {
          const [, label, href] = mdLink
          return (
            <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="ma-link">
              {label}
            </a>
          )
        }
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
        if (p.startsWith('`') && p.endsWith('`'))
          return (
            <code key={i} className="ma-code">
              {p.slice(1, -1)}
            </code>
          )
        return <span key={i}>{p}</span>
      })}
    </>
  )
}
