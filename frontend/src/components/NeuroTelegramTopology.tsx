import React from 'react'
import { FOURCEE_WEBHOOK_PATHS } from '../services/fourceeConfig'

export type TelegramTrackId =
  | 'ingress'
  | 'menus'
  | 'campaign'
  | 'scrape'
  | 'report'
  | 'pending'
  | 'human'
  | 'campaigns'

const TRACKS: { id: TelegramTrackId; label: string; accent?: boolean }[] = [
  { id: 'ingress', label: 'Ingress' },
  { id: 'menus', label: 'Menus' },
  { id: 'campaign', label: 'Campaign launch', accent: true },
  { id: 'scrape', label: 'Scrape' },
  { id: 'report', label: 'Reports' },
  { id: 'pending', label: 'Pending demos', accent: true },
  { id: 'human', label: 'Human follow-up' },
  { id: 'campaigns', label: 'History' },
]

export default function NeuroTelegramTopology() {
  const [active, setActive] = React.useState<TelegramTrackId | null>(null)

  return (
    <div className="nt-topology">
      <div className="nt-legend">
        <span className="nt-legend-title">Telegram control topology</span>
        <span className="nt-legend-hint">
          Mirrors <span className="mc-mono">[NEURO] Telegram Control Panel</span> routes — tap a lane to emphasise it.
        </span>
      </div>

      <div className="nt-track-tabs" role="tablist" aria-label="Flow lanes">
        {TRACKS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            className={[
              'nt-track-tab',
              active === t.id ? 'is-active' : '',
              t.accent ? 'is-hot' : '',
            ].join(' ')}
            onClick={() => setActive((c) => (c === t.id ? null : t.id))}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Phase 01 */}
      <section
        className={['nt-phase', active && active !== 'ingress' && active !== 'menus' ? 'nt-phase-dim' : ''].join(' ')}
        data-phase="ingress"
      >
        <header className="nt-phase-head">
          <span className="nt-phase-num">01</span>
          <div>
            <h3 className="nt-phase-title">Ingress &amp; router</h3>
            <p className="nt-phase-desc">Every tap or message becomes structured intent before Postgres or webhooks fire.</p>
          </div>
        </header>
        <div className="nt-node-row">
          <NeuroNode title="Telegram Trigger" detail="message · callback_query" />
          <NtArrow />
          <NeuroNode title="Parse Update" detail="route · extra · chatId · isCallback" highlight />
          <NtArrow />
          <NeuroNode title="Route (switch)" detail="12 branches · fallback → main_menu" />
        </div>
      </section>

      {/* Phase 02 — parallel menus */}
      <section className={['nt-phase', active && active !== 'menus' ? 'nt-phase-dim' : ''].join(' ')}>
        <header className="nt-phase-head">
          <span className="nt-phase-num">02</span>
          <div>
            <h3 className="nt-phase-title">Command surface</h3>
            <p className="nt-phase-desc">Same grid as your bot: Status, Campaigns, Launch, Pending, Scrape, Reports, Human.</p>
          </div>
        </header>
        <div className="nt-pill-grid">
          {[
            { k: 'main_menu', t: 'Main menu', d: 'Send Main Menu' },
            { k: 'status', t: 'Status', d: 'Query Status → Send Status' },
            { k: 'campaign', t: 'Launch', d: 'Count New → Campaign Menu' },
            { k: 'campaigns', t: 'Campaigns', d: 'Query Campaigns → Send Campaigns' },
            { k: 'pending', t: 'Pending demos', d: 'Query Pending → Send Pending' },
            { k: 'human', t: 'Human', d: 'Query Human → Send Human' },
            { k: 'scrape', t: 'Scrape', d: 'Send Scrape Instructions' },
            { k: 'report', t: 'Reports', d: 'Report Menu' },
          ].map((p) => (
            <div key={p.k} className="nt-pill">
              <span className="nt-pill-route mc-mono">{p.k}</span>
              <span className="nt-pill-title">{p.t}</span>
              <span className="nt-pill-detail">{p.d}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Execution lanes */}
      <div className="nt-lanes">
        <ExecutionLane
          id="campaign"
          active={active}
          num="03a"
          title="Campaign launch · deep path"
          subtitle="Matches Init Launch → HTTP First Outreach → batch send loop"
          nodes={[
            { label: 'Count New', sub: 'Postgres · new leads' },
            { label: 'Campaign Menu', sub: '10 / 25 / 50 / 100 / all' },
            { label: 'Init Launch', sub: 'UUID campaignId + count' },
            { label: 'POST First Outreach', sub: FOURCEE_WEBHOOK_PATHS.launchOutreach, mono: true },
            { label: 'Fetch & lock', sub: 'FOR UPDATE SKIP LOCKED' },
            { label: 'Loop leads', sub: 'Split in batches' },
            { label: 'Pick SMTP', sub: 'Rotate sender' },
            { label: 'Build + Send', sub: 'emailSend nodes' },
            { label: 'Mark sent', sub: 'outreach_sent_at' },
            { label: 'Complete', sub: 'Telegram summary · rates' },
          ]}
        />

        <ExecutionLane
          id="scrape"
          active={active}
          num="03b"
          title="Scrape path"
          subtitle="Free-text query → Apify Maps → dedupe → INSERT leads"
          nodes={[
            { label: 'Send instructions', sub: 'Optional UX copy' },
            { label: 'Run Scraper', sub: 'parse query + count + chatId' },
            { label: 'POST m1-scrape-website', sub: FOURCEE_WEBHOOK_PATHS.leadScrapeWebsite, mono: true },
            { label: 'Callback', sub: 'async results → /api/scraper-callback/:id', mono: true },
            { label: 'Apify Places', sub: 'run-sync dataset' },
            { label: 'Normalize', sub: 'URL quality gate' },
            { label: 'Insert Lead', sub: 'ON CONFLICT DO NOTHING' },
            { label: 'Telegram ack', sub: 'Progress ping' },
          ]}
        />

        <ExecutionLane
          id="report"
          active={active}
          num="03c"
          title="Reports path"
          subtitle="Interval picker → Query Report → formatted Telegram card"
          nodes={[
            { label: 'Report Menu', sub: '1 day · 7 days · 30 days' },
            { label: 'Prep interval', sub: 'extra → SQL interval' },
            { label: 'Query Report', sub: 'sent · interested · negative · demos' },
            { label: 'Send Report', sub: 'reply rate % in bot' },
          ]}
        />

        <ExecutionLane
          id="pending"
          active={active}
          num="03d"
          title="Pending demos path"
          subtitle="Positive replies without demo_url → pick lead → Ack → Jewl workflow"
          nodes={[
            { label: 'Query Pending', sub: 'replied_positive · demo_url NULL' },
            { label: 'Send Pending', sub: 'Inline keyboard demo_*' },
            { label: 'run_demo', sub: 'callback extra = lead_id' },
            { label: 'Ack Demo', sub: '~60s copy + trigger' },
            { label: 'POST Demo webhook', sub: FOURCEE_WEBHOOK_PATHS.demoGenerator, mono: true },
            { label: 'Fetch lead', sub: 'Postgres' },
            { label: 'Apify crawl', sub: 'Site + Maps context' },
            { label: 'LLM + GitHub', sub: 'Jewl template push' },
          ]}
        />

        <ExecutionLane
          id="human"
          active={active}
          num="03e"
          title="Human follow-up"
          subtitle="Demos delivered — surface close list with links"
          nodes={[
            { label: 'Query Human', sub: 'demo_sent_at NOT NULL' },
            { label: 'Send Human', sub: 'Markdown + demo URLs' },
          ]}
        />

        <ExecutionLane
          id="campaigns"
          active={active}
          num="03f"
          title="Campaign history"
          subtitle="Rollups per campaign_id — sent / interested / demos"
          nodes={[
            { label: 'Query Campaigns', sub: 'JOIN leads · LIMIT 5' },
            { label: 'Send Campaigns', sub: 'Formatted history card' },
          ]}
        />
      </div>

      <aside className="nt-footnote">
        <strong>Reply monitor</strong> runs out-of-band (email trigger → Match Lead → sentiment → update{' '}
        <span className="mc-mono">leads</span>) and feeds the metrics you see on Pulse when wired.
      </aside>
    </div>
  )
}

function NeuroNode({ title, detail, highlight }: { title: string; detail: string; highlight?: boolean }) {
  return (
    <div className={['nt-node', highlight ? 'nt-node-glow' : ''].join(' ')}>
      <div className="nt-node-title">{title}</div>
      <div className="nt-node-detail">{detail}</div>
    </div>
  )
}

function NtArrow() {
  return (
    <div className="nt-arrow" aria-hidden="true">
      <span className="nt-arrow-line" />
      <span className="nt-arrow-head">▸</span>
    </div>
  )
}

function ExecutionLane({
  id,
  active,
  num,
  title,
  subtitle,
  nodes,
}: {
  id: TelegramTrackId
  active: TelegramTrackId | null
  num: string
  title: string
  subtitle: string
  nodes: { label: string; sub: string; mono?: boolean }[]
}) {
  const dim = active !== null && active !== id
  return (
    <section className={['nt-exec-lane', dim ? 'is-dimmed' : '', active === id ? 'is-spotlight' : ''].join(' ')}>
      <header className="nt-exec-head">
        <span className="nt-phase-num">{num}</span>
        <div>
          <h3 className="nt-exec-title">{title}</h3>
          <p className="nt-exec-sub">{subtitle}</p>
        </div>
      </header>
      <div className="nt-exec-scroll">
        <div className="nt-exec-chain">
          {nodes.map((n, i) => (
            <React.Fragment key={n.label + i}>
              <div className="nt-step">
                <div className="nt-step-label">{n.label}</div>
                <div className={['nt-step-sub', n.mono ? 'mc-mono' : ''].join(' ')}>{n.sub}</div>
              </div>
              {i < nodes.length - 1 && (
                <div className="nt-micro-connector" aria-hidden="true">
                  <span />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  )
}
