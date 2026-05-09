import React from 'react'
import { Link } from 'react-router-dom'
import { loadFourceeSettings } from '../services/fourceeConfig'
import { filterOpsByRange, loadFourceeOps, summarizeOps, type OpsRangeKey } from '../services/fourceeTelemetry'
import '../App.css'

function fmtInt(n: number | undefined) {
  if (n === undefined || n === null || !Number.isFinite(n)) return '—'
  return Math.round(n).toLocaleString()
}

type Insight = { tone: 'pulse' | 'warn' | 'win' | 'idle'; text: string }

export default function FourceeDashboard() {
  React.useEffect(() => {
    document.documentElement.classList.add('fd-pulse-scroll-snap')
    return () => document.documentElement.classList.remove('fd-pulse-scroll-snap')
  }, [])

  const [range, setRange] = React.useState<OpsRangeKey>('7d')
  const [tick, setTick] = React.useState(() => Date.now())
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const settings = loadFourceeSettings()
  const isConfigured = !!settings.webhookBase?.trim()

  const refresh = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      void range
      setTick(Date.now())
    } catch (e: unknown) {
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

  const all = React.useMemo(() => loadFourceeOps(), [tick])
  const inRange = React.useMemo(() => filterOpsByRange(all, range), [all, range])
  const sum = React.useMemo(() => summarizeOps(inRange), [inRange])

  const insights: Insight[] = React.useMemo(() => {
    if (!isConfigured) return [{ tone: 'warn', text: 'Mission Control isn’t configured yet. Open Config and add your main link.' }]
    if (sum.total === 0) return [{ tone: 'idle', text: 'No ops logged in this window yet. Run a Scrape, Campaign, Demo, or Intake.' }]
    const out: Insight[] = [{ tone: 'pulse', text: `${sum.total} ops logged in the last ${range}.` }]
    if (sum.scrape > 0 && sum.launch === 0) out.push({ tone: 'pulse', text: 'You scraped leads — consider launching a campaign next.' })
    if (sum.launch > 0 && sum.demo === 0) out.push({ tone: 'pulse', text: 'Campaign launched — keep an eye on replies and ship demos fast.' })
    if (sum.demo > 0) out.push({ tone: 'win', text: 'Demos shipped — follow up while intent is hot.' })
    return out
  }, [isConfigured, range, sum.demo, sum.launch, sum.scrape, sum.total])

  return (
    <div className="fd-root">
      <div className="fd-aurora" aria-hidden="true" />

      <header className="fd-header">
        <div>
          <h1 className="fd-title">Activity</h1>
          <p className="fd-sub">A quick view of what you’ve run from Mission Control (this device).</p>
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

      {!isConfigured && (
        <div className="fd-banner">
          <strong>Not configured yet.</strong>{' '}
          <span className="fd-banner-muted">
            Open Mission Control → Config and paste your **main link**. That’s enough to run Lead / Scrape / Campaign / Demo.
          </span>
        </div>
      )}

      {error && (
        <div className="fd-banner fd-banner-error">
          <strong>Pulse error.</strong> {error}
        </div>
      )}

      <div className="fd-range-row">
        {(['24h', '7d', '30d'] as OpsRangeKey[]).map((r) => (
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
        <div className="fd-snap-ops">
          <div className="fd-ring-card card">
            <div className="fd-ring-label">Ops</div>
            <div className="fd-ring-wrap">
              <div className="fd-ring" style={{ background: 'conic-gradient(rgba(0, 255, 200, 0.85) 180deg, rgba(255,255,255,0.06) 0deg)' }}>
                <div className="fd-ring-inner">
                  <span className="fd-ring-value">{fmtInt(sum.total)}</span>
                  <span className="fd-ring-hint">{range} window</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="fd-snap-metric-cards fd-pulse-metrics-snap">
          <div className="fd-metric-grid">
            <article className="fd-metric card">
              <div className="fd-metric-label">Leads added</div>
              <div className="fd-metric-value">{fmtInt(sum.intake)}</div>
              <div className="fd-metric-hint">Manual intake runs</div>
            </article>
            <article className="fd-metric card fd-metric-accent">
              <div className="fd-metric-label">Scrapes</div>
              <div className="fd-metric-value">{fmtInt(sum.scrape)}</div>
              <div className="fd-metric-hint">Lead discovery runs</div>
            </article>
            <article className="fd-metric card">
              <div className="fd-metric-label">Campaigns</div>
              <div className="fd-metric-value">{fmtInt(sum.launch)}</div>
              <div className="fd-metric-hint">Outreach waves launched</div>
            </article>
            <article className="fd-metric card fd-metric-warn">
              <div className="fd-metric-label">Demos</div>
              <div className="fd-metric-value">{fmtInt(sum.demo)}</div>
              <div className="fd-metric-hint">Demo generations triggered</div>
            </article>
          </div>
        </div>
      </section>

      <section className="fd-secondary card">
        <div className="fd-secondary-head">
          <h2>Operator notes</h2>
          <span className="fd-chip">Next moves</span>
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

      {inRange.length > 0 && (
        <section className="fd-campaigns card">
          <div className="fd-secondary-head">
            <h2>Recent ops</h2>
            <span className="fd-chip">This device</span>
          </div>
          <div className="fd-table-wrap">
            <table className="table fd-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {inRange.slice(0, 10).map((e) => (
                  <tr key={e.id}>
                    <td className="fd-mono">
                      {new Date(e.ts).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>{e.type}</td>
                    <td className="fd-mono">{e.meta ? JSON.stringify(e.meta).slice(0, 80) : '—'}</td>
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
