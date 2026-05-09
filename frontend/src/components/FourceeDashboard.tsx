import React from 'react'
import { Link } from 'react-router-dom'
import {
  fetchFourceePulse,
  interestedRate,
  type FourceePulse,
  type PulseRangeKey,
} from '../services/fourceeApi'
import { loadFourceeSettings } from '../services/fourceeConfig'
import '../App.css'

function fmtPct(n: number) {
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(1)}%`
}

function fmtInt(n: number | undefined) {
  if (n === undefined || n === null || !Number.isFinite(n)) return '—'
  return Math.round(n).toLocaleString()
}

type Insight = { tone: 'pulse' | 'warn' | 'win' | 'idle'; text: string }

function buildInsights(p: FourceePulse | null, hasPulseUrl: boolean): Insight[] {
  if (!hasPulseUrl) {
    return [
      {
        tone: 'idle',
        text: 'Add a metrics webhook in Mission Control to mirror your Postgres funnel (same queries as the Telegram Control Panel).',
      },
    ]
  }
  if (!p) {
    return [{ tone: 'idle', text: 'Telemetry channel connected — waiting for the next sync.' }]
  }
  const out: Insight[] = []
  const rate = interestedRate(p)
  if (p.sent >= 25 && rate < 6) {
    out.push({
      tone: 'warn',
      text: 'Interested rate is thin versus volume — worth tightening ICP or creative.',
    })
  }
  if ((p.new_leads ?? 0) > 0 && (p.new_leads ?? 0) < 15) {
    out.push({ tone: 'pulse', text: 'Fresh leads are entering — prime window to launch another outreach wave.' })
  }
  if ((p.pending_demo_leads ?? 0) > 0) {
    out.push({
      tone: 'pulse',
      text: `${fmtInt(p.pending_demo_leads)} positive replies still need a demo asset — ship demos while intent is hot.`,
    })
  }
  if (p.demos > 0 && rate >= 10) {
    out.push({ tone: 'win', text: 'Demo momentum + healthy reply energy — double down on human follow-up.' })
  }
  if (out.length === 0) {
    out.push({ tone: 'pulse', text: 'Pipeline steady. Keep monitoring replies and demo throughput.' })
  }
  return out
}

export default function FourceeDashboard() {
  const [range, setRange] = React.useState<PulseRangeKey>('7d')
  const [pulse, setPulse] = React.useState<FourceePulse | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(() => Date.now())

  const settings = loadFourceeSettings()
  const hasPulseUrl = !!(settings.metricsWebhookUrl && settings.metricsWebhookUrl.trim())

  const refresh = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchFourceePulse(loadFourceeSettings(), range)
      setPulse(data)
      setTick(Date.now())
    } catch (e: unknown) {
      setPulse(null)
      setError(e instanceof Error ? e.message : 'Pulse sync failed')
    } finally {
      setLoading(false)
    }
  }, [range])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  React.useEffect(() => {
    const id = window.setInterval(() => void refresh(), 90000)
    return () => window.clearInterval(id)
  }, [refresh])

  const rate = pulse ? interestedRate(pulse) : 0
  const insights = buildInsights(pulse, hasPulseUrl)

  const ringStyle = {
    background: `conic-gradient(rgba(0, 255, 200, 0.85) ${Math.min(rate, 100) * 3.6}deg, rgba(255,255,255,0.06) 0deg)`,
  }

  return (
    <div className="fd-root">
      <div className="fd-aurora" aria-hidden="true" />

      <header className="fd-header">
        <div>
          <div className="fd-kicker">Live funnel intelligence</div>
          <h1 className="fd-title">Fourcee Pulse</h1>
          <p className="fd-sub">
            Signal-rich view of outreach throughput — sourced from the same automation spine as your Telegram Command Panel.
          </p>
        </div>
        <div className="fd-header-actions">
          <div className="fd-sync-badge" data-live={loading ? 'busy' : 'idle'}>
            <span className="fd-sync-dot" />
            {loading ? 'Syncing…' : `Updated ${new Date(tick).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
          </div>
          <button type="button" className="btn btn-primary fd-refresh" onClick={() => void refresh()}>
            Refresh
          </button>
          <Link to="/saas" className="btn fd-mission-link">
            Mission Control →
          </Link>
        </div>
      </header>

      {!hasPulseUrl && (
        <div className="fd-banner">
          <strong>No metrics webhook yet.</strong>{' '}
          <span className="fd-banner-muted">
            Point one n8n webhook at the same SQL as Telegram “Query Report”, respond with JSON (`sent`, `interested`, `negative`,
            `demos`). Configure it under Mission Control.
          </span>
        </div>
      )}

      {error && (
        <div className="fd-banner fd-banner-error">
          <strong>Pulse error.</strong> {error}
        </div>
      )}

      <div className="fd-range-row">
        {(['24h', '7d', '30d'] as PulseRangeKey[]).map((r) => (
          <button
            key={r}
            type="button"
            className={`fd-range-chip ${range === r ? 'active' : ''}`}
            onClick={() => setRange(r)}
          >
            {r === '24h' ? '24 hours' : r === '7d' ? '7 days' : '30 days'}
          </button>
        ))}
      </div>

      <section className="fd-hero-metrics">
        <div className="fd-ring-card card">
          <div className="fd-ring-label">Interested rate</div>
          <div className="fd-ring-wrap">
            <div className="fd-ring" style={ringStyle}>
              <div className="fd-ring-inner">
                <span className="fd-ring-value">{hasPulseUrl && pulse ? fmtPct(rate) : '—'}</span>
                <span className="fd-ring-hint">of contacted leads</span>
              </div>
            </div>
          </div>
        </div>

        <div className="fd-metric-grid">
          <article className="fd-metric card">
            <div className="fd-metric-label">Emails sent</div>
            <div className="fd-metric-value">{hasPulseUrl ? fmtInt(pulse?.sent) : '—'}</div>
            <div className="fd-metric-hint">Outreach touches in window</div>
          </article>
          <article className="fd-metric card fd-metric-accent">
            <div className="fd-metric-label">Interested</div>
            <div className="fd-metric-value">{hasPulseUrl ? fmtInt(pulse?.interested) : '—'}</div>
            <div className="fd-metric-hint">Positive sentiment replies</div>
          </article>
          <article className="fd-metric card">
            <div className="fd-metric-label">Demos</div>
            <div className="fd-metric-value">{hasPulseUrl ? fmtInt(pulse?.demos) : '—'}</div>
            <div className="fd-metric-hint">Assets shipped / booked</div>
          </article>
          <article className="fd-metric card fd-metric-warn">
            <div className="fd-metric-label">Pass / negative</div>
            <div className="fd-metric-value">{hasPulseUrl ? fmtInt(pulse?.negative) : '—'}</div>
            <div className="fd-metric-hint">Hard nos &amp; mismatch replies</div>
          </article>
        </div>
      </section>

      <section className="fd-secondary card">
        <div className="fd-secondary-head">
          <h2>Pipeline reserves</h2>
          <span className="fd-chip">Proactive signals</span>
        </div>
        <div className="fd-reserves">
          <div>
            <div className="fd-res-label">New leads (queue)</div>
            <div className="fd-res-value">{fmtInt(pulse?.new_leads)}</div>
          </div>
          <div>
            <div className="fd-res-label">Awaiting demo asset</div>
            <div className="fd-res-value">{fmtInt(pulse?.pending_demo_leads)}</div>
          </div>
          <div>
            <div className="fd-res-label">Reply intensity</div>
            <div className="fd-res-value">{hasPulseUrl && pulse && pulse.sent > 0 ? fmtPct(rate) : '—'}</div>
          </div>
        </div>

        <div className="fd-insights">
          {insights.map((it, i) => (
            <div key={i} className={`fd-insight fd-insight-${it.tone}`}>
              <span className="fd-insight-mark">◆</span>
              {it.text}
            </div>
          ))}
        </div>
      </section>

      {pulse?.campaigns && pulse.campaigns.length > 0 && (
        <section className="fd-campaigns card">
          <div className="fd-secondary-head">
            <h2>Recent campaigns</h2>
            <span className="fd-chip">Last waves</span>
          </div>
          <div className="fd-table-wrap">
            <table className="table fd-table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Created</th>
                  <th>Leads</th>
                  <th>Sent</th>
                  <th>Interested</th>
                  <th>Demos</th>
                </tr>
              </thead>
              <tbody>
                {pulse.campaigns.slice(0, 6).map((c) => (
                  <tr key={c.campaign_id}>
                    <td className="fd-mono">{c.campaign_id.slice(0, 8)}…</td>
                    <td>{c.created ?? '—'}</td>
                    <td>{fmtInt(c.total)}</td>
                    <td>{fmtInt(c.sent)}</td>
                    <td>{fmtInt(c.interested)}</td>
                    <td>{fmtInt(c.demos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
