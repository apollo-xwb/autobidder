import React from 'react'
import { FOURCEE_WEBHOOK_PATHS, loadFourceeSettings, saveFourceeSettings, webhookUrl, type FourceeSettings } from '../services/fourceeConfig'
import {
  fetchCampaignHistory,
  fetchHumanFollowups,
  fetchNewLeadCount,
  fetchPendingDemoLeads,
  fetchPipelineStatus,
  fetchReportForInterval,
  parseScrapeCommand,
  postFourceeJson,
  REPORT_INTERVALS,
} from '../services/fourceeApi'

/** Matches Telegram main menu callbacks + web-only Config. */
export type AssistantDockMode =
  | 'status'
  | 'campaigns'
  | 'launch'
  | 'pending'
  | 'scrape'
  | 'report'
  | 'human'
  | 'config'

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

type ConfigFieldKey =
  | 'webhookBase'
  | 'metricsWebhookUrl'
  | 'pipelineStatusWebhookUrl'
  | 'campaignHistoryWebhookUrl'
  | 'bearerToken'
  | 'telegramChatId'
  | 'countNewWebhookUrl'
  | 'pendingDemosWebhookUrl'
  | 'humanFollowupWebhookUrl'

const CONFIG_STEPS: { field: ConfigFieldKey; ask: string; optional: boolean }[] = [
  {
    field: 'webhookBase',
    ask: 'Where should commands point?\n\nPaste your **main link** (the bit before `/m1-scrape` — **no** slash on the end).\n\nExample shape: `https://your-host/webhook`',
    optional: false,
  },
  {
    field: 'metricsWebhookUrl',
    ask:
      'Want **Reports** and richer Pulse numbers here?\n\nPaste the **full link** your automation uses for time‑based stats — or tap **Skip** and we\'ll skip Reports/Pulse extras.',
    optional: true,
  },
  {
    field: 'pipelineStatusWebhookUrl',
    ask:
      'Want the **Status** button to show your live funnel counts?\n\nPaste the **full link** that returns that snapshot — or **Skip** (Telegram can still show it).',
    optional: true,
  },
  {
    field: 'campaignHistoryWebhookUrl',
    ask:
      'Want **Campaigns** to list recent runs?\n\nPaste the **full link** for that list — or **Skip**.',
    optional: true,
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
  {
    field: 'countNewWebhookUrl',
    ask: 'Want **Launch** to know how many **new** leads are waiting?\n\nPaste the helper link — or **Skip** (you\'ll pick batch sizes yourself).',
    optional: true,
  },
  {
    field: 'pendingDemosWebhookUrl',
    ask: 'Want **Demos** to show who\'s waiting for a demo?\n\nPaste the helper link — or **Skip** (you can still paste a lead ID manually).',
    optional: true,
  },
  {
    field: 'humanFollowupWebhookUrl',
    ask: 'Want **Human** to list people ready for a personal follow‑up?\n\nPaste the helper link — or **Skip**.',
    optional: true,
  },
]

const MODE_TITLE: Record<AssistantDockMode, string> = {
  status: 'Status',
  campaigns: 'Campaigns',
  launch: 'Launch Campaign',
  pending: 'Pending Demos',
  scrape: 'Scrape Leads',
  report: 'Reports',
  human: 'Human Follow-up',
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
  const reportRunnerRef = React.useRef<(extra: string, label: string) => void>(() => {})

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

  const runReport = React.useCallback(
    async (extra: string, label: string) => {
      appendUser(label)
      appendAssistant('Pulling numbers…')
      setBusy(true)
      try {
        const s = loadFourceeSettings()
        const res = await fetchReportForInterval(s, extra)
        if (res.kind === 'missing') {
          appendAssistant('Open **Config** and add the link for **Reports** / Pulse — or keep using your bot for that.')
          return
        }
        if (res.kind === 'error') {
          appendAssistant(res.message)
          return
        }
        const row = res.value
        const rate = row.sent > 0 ? ((row.interested / row.sent) * 100).toFixed(1) : '0.0'
        appendAssistant(
          `📊 **Report — ${label}**\n\n📨 Emails Sent: **${row.sent}**\n🟢 Interested: **${row.interested}**\n🔴 Not Interested: **${row.negative ?? 0}**\n🎯 Demos Delivered: **${row.demos}**\n📈 Reply Rate: **${rate}%**`
        )
        onPulseRefresh()
      } finally {
        setBusy(false)
      }
    },
    [appendAssistant, appendUser, onPulseRefresh]
  )

  reportRunnerRef.current = runReport

  React.useEffect(() => {
    let cancelled = false

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

      if (mode === 'status') {
        setComposerEnabled(false)
        const s = loadFourceeSettings()
        setBusy(true)
        const res = await fetchPipelineStatus(s)
        if (cancelled) return
        setBusy(false)
        if (res.kind === 'missing') {
          appendAssistant(
            'To see **Status** here, open **Config** and link the snapshot your stack uses for funnel totals (same as the bot).'
          )
          return
        }
        if (res.kind === 'error') {
          appendAssistant(res.message)
          return
        }
        const x = res.value
        appendAssistant(
          `📊 **Pipeline Overview**\n\n📋 Total Leads: **${x.total_leads}**\n🆕 New (unsent): **${x.new_leads}**\n\n📨 Outreach Sent: **${x.emails_sent}**\n🟢 Interested Replies: **${x.interested}**\n🔴 Not Interested: **${x.not_interested}**\n\n🎯 Demos Delivered: **${x.demos_sent}**\n💀 Dead Leads: **${x.dead}**\n\n📈 Campaigns Run: **${x.total_campaigns}**`
        )
      } else if (mode === 'campaigns') {
        setComposerEnabled(false)
        const s = loadFourceeSettings()
        setBusy(true)
        const res = await fetchCampaignHistory(s)
        if (cancelled) return
        setBusy(false)
        if (res.kind === 'missing') {
          appendAssistant(
            'To see **Campaigns** here, open **Config** and link the list endpoint your automation uses (same data as the bot).'
          )
          return
        }
        if (res.kind === 'error') {
          appendAssistant(res.message)
          return
        }
        const camps = res.value
        if (camps.length === 0) {
          appendAssistant('📭 No campaigns launched yet.')
          return
        }
        const lines = camps
          .map((c, i) => {
            const rate = c.total > 0 ? ((c.interested / c.total) * 100).toFixed(0) : '0'
            return `${i + 1}. **${c.created}**\n   📨 ${c.sent}/${c.total} sent · 🟢 ${c.interested} interested · 🎯 ${c.demos} demos · 📈 ${rate}%`
          })
          .join('\n\n')
        appendAssistant(`📈 **Campaign History**\n\n${lines}`)
      } else if (mode === 'launch') {
        setComposerEnabled(false)
        const s = loadFourceeSettings()
        if (s.countNewWebhookUrl?.trim()) {
          appendAssistant('Checking new-lead queue…')
          setBusy(true)
          const c = await fetchNewLeadCount(s)
          if (cancelled) return
          setBusy(false)
          if (c === null) appendAssistant('Couldn\'t read the new‑lead count — pick a batch size:', batchChips(undefined))
          else if (c === 0)
            appendAssistant(
              '⚠️ No new leads available.\n\nUse 🔍 Scrape to find leads first.',
              [{ id: 'ok', label: 'OK', onSelect: onClose }]
            )
          else
            appendAssistant(
              `🚀 **Launch Campaign**\n\n📋 **${c}** new leads ready.\nHow many to contact?`,
              batchChips(c)
            )
        } else {
          appendAssistant('Pick batch size:', batchChips(undefined))
        }
      } else if (mode === 'scrape') {
        setComposerEnabled(true)
        setComposerHint('plumbers Cape Town 30')
        appendAssistant(
          '🔍 **Scrape Leads from Google Maps**\n\nJust type your search below — no commands needed:\n\n`industry city quantity`\n\nExamples:\n• `plumbers Cape Town 30`\n• `electricians Johannesburg 50`\n• `HVAC companies Durban 20`'
        )
      } else if (mode === 'report') {
        setComposerEnabled(false)
        appendAssistant(
          '📊 **Select Report Period:**',
          REPORT_INTERVALS.map((r) => ({
            id: r.extra,
            label: r.label,
            onSelect: () => reportRunnerRef.current(r.extra, r.label),
          }))
        )
      } else if (mode === 'pending') {
        const s = loadFourceeSettings()
        setBusy(true)
        const res = await fetchPendingDemoLeads(s)
        if (cancelled) return
        setBusy(false)
        if (res.kind === 'missing') {
          appendAssistant(
            'No **pending demos** link saved yet — add it under **Config**, or paste a **lead ID** below to run a demo anyway.'
          )
          setComposerEnabled(true)
          setComposerHint('lead_id UUID')
          return
        }
        if (res.kind === 'error') {
          appendAssistant(res.message)
          setComposerEnabled(true)
          setComposerHint('lead_id UUID')
          return
        }
        const leads = res.value
        if (leads.length === 0) {
          appendAssistant('✅ No pending demos — all caught up!')
          setComposerEnabled(false)
          return
        }
        appendAssistant(
          `🎯 **${leads.length} Lead${leads.length > 1 ? 's' : ''} Awaiting Demo**\n\nTap a company to generate their personalised demo:`,
          leads.map((l) => ({
            id: l.lead_id,
            label: `🏢 ${l.company_name}${l.city ? ` (${l.city})` : ''}`,
            onSelect: () => demoRunnerRef.current(l.lead_id, l.company_name),
          }))
        )
        setComposerEnabled(true)
        setComposerHint('Or paste lead_id')
      } else if (mode === 'human') {
        setComposerEnabled(false)
        const s = loadFourceeSettings()
        setBusy(true)
        const res = await fetchHumanFollowups(s)
        if (cancelled) return
        setBusy(false)
        if (res.kind === 'missing') {
          appendAssistant('Open **Config** and link **Human follow‑up** so I can pull your close list — same idea as the bot.', [
            { id: 'x', label: 'Close', onSelect: onClose },
          ])
          return
        }
        if (res.kind === 'error') {
          appendAssistant(res.message)
          return
        }
        const rows = res.value
        if (rows.length === 0) {
          appendAssistant('✅ No demos delivered yet — none to follow up on.', [
            { id: 'x', label: 'OK', onSelect: onClose },
          ])
          return
        }
        const lines = rows
          .slice(0, 25)
          .map((r, i) => {
            const d = r.demo_sent_at
              ? new Date(r.demo_sent_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
              : ''
            const demoLink = r.demo_url ? `[View Demo](${r.demo_url})` : '—'
            return `${i + 1}. **${r.company_name}** — ${r.city || ''}\n   📧 \`${r.email || '—'}\`\n   🎯 ${demoLink}\n   📅 Sent: ${d}`
          })
          .join('\n\n')
        appendAssistant(
          `🤝 **${rows.length} Lead${rows.length > 1 ? 's' : ''} Ready for Personal Follow-up**\n\nThese leads received their demo — reach out to close the deal:\n\n${lines}`
        )
      } else if (mode === 'config') {
        setComposerEnabled(true)
        setComposerHint(configAcc.current.webhookBase || '')
        appendAssistant(
          'Let\'s wire this once.\n\nI\'ll ask for your **main link** first. After that, everything is **optional** — use **Skip** anytime you don\'t have a link yet (your bot can still do those jobs).'
        )
        appendAssistant(CONFIG_STEPS[0].ask)
      }
    }

    void boot()
    return () => {
      cancelled = true
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
          `**Does this look right?**\n\nI\'ll save it **only on this device**.\n\n• Main link: \`${next.webhookBase}\`\n• Reports / Pulse add‑on: ${next.metricsWebhookUrl ? '✓ linked' : 'skipped'}\n• Status snapshot: ${next.pipelineStatusWebhookUrl ? '✓ linked' : 'skipped'}\n• Campaign list: ${next.campaignHistoryWebhookUrl ? '✓ linked' : 'skipped'}\n• Secret (if any): ${next.bearerToken ? '✓ set' : 'skipped'}\n• Telegram pings: ${next.telegramChatId ? '✓ set' : 'skipped'}\n• New‑lead count helper: ${next.countNewWebhookUrl ? '✓ linked' : 'skipped'}\n• Pending demos list: ${next.pendingDemosWebhookUrl ? '✓ linked' : 'skipped'}\n• Human follow‑up list: ${next.humanFollowupWebhookUrl ? '✓ linked' : 'skipped'}`,
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
    const chatId = s.telegramChatId ? parseInt(s.telegramChatId, 10) : 0
    setBusy(true)
    appendAssistant('Sending the scrape…')
    try {
      await postFourceeJson(s, webhookUrl(s, FOURCEE_WEBHOOK_PATHS.leadScrape), {
        query: parsed.query,
        count: parsed.count,
        chatId,
      })
      appendAssistant('✅ Sent. If Telegram is linked, you\'ll get a heads‑up there too.')
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
    else if (mode === 'scrape') void submitScrape()
    else if (mode === 'pending') {
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
