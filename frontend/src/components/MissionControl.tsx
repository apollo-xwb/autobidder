import React from 'react'
import { Link } from 'react-router-dom'
import { loadFourceeSettings } from '../services/fourceeConfig'
import { fetchFourceePulse, interestedRate, type FourceePulse } from '../services/fourceeApi'
import NeuroTelegramTopology from './NeuroTelegramTopology'
import MissionAssistant, { type AssistantDockMode } from './MissionAssistant'
import '../App.css'

const COMMAND_HEX: Array<{ mode: AssistantDockMode; ico: string; lbl: string; variant?: 'config' }> = [
  { mode: 'status', ico: '📊', lbl: 'Status' },
  { mode: 'campaigns', ico: '📈', lbl: 'Campaigns' },
  { mode: 'launch', ico: '🚀', lbl: 'Launch' },
  { mode: 'pending', ico: '🎯', lbl: 'Demos' },
  { mode: 'scrape', ico: '🔎', lbl: 'Scrape' },
  { mode: 'report', ico: '📋', lbl: 'Reports' },
  { mode: 'human', ico: '🤝', lbl: 'Human' },
  { mode: 'config', ico: '⚙️', lbl: 'Config', variant: 'config' },
]

export default function MissionControl() {
  const [assistantMode, setAssistantMode] = React.useState<AssistantDockMode | null>(null)
  const [flowMapOpen, setFlowMapOpen] = React.useState(false)

  const [pulseMini, setPulseMini] = React.useState<FourceePulse | null>(null)

  const refreshMiniPulse = React.useCallback(async () => {
    try {
      const p = await fetchFourceePulse(loadFourceeSettings(), '7d')
      setPulseMini(p)
    } catch {
      setPulseMini(null)
    }
  }, [])

  React.useEffect(() => {
    void refreshMiniPulse()
  }, [refreshMiniPulse])

  React.useEffect(() => {
    const id = window.setInterval(() => void refreshMiniPulse(), 120000)
    return () => window.clearInterval(id)
  }, [refreshMiniPulse])

  const rate = pulseMini ? interestedRate(pulseMini) : 0

  return (
    <div className="mc-root mc-root-quiet mc-page-shell">
      <div className="mc-grid-bg" aria-hidden="true" />

      <header className="mc-topbar mc-topbar-quiet">
        <div className="mc-topbar-intro">
          <h1 className="mc-title mc-title-quiet">Mission Control</h1>
          <p className="mc-lede-quiet">This screen is driven by actions — tap a tile to talk to the assistant.</p>
        </div>
        <div className="mc-topbar-right mc-topbar-right-quiet">
          <div className="mc-pulse-chip" title={pulseMini ? `${pulseMini.interested} interested / ${pulseMini.sent} sent (7d)` : undefined}>
            <span className="mc-pulse-chip-lbl">7d pulse</span>
            <span className="mc-pulse-chip-val">{pulseMini ? `${rate.toFixed(1)}%` : '—'}</span>
          </div>
          <Link to="/" className="btn mc-back-quiet">
            Dashboard
          </Link>
        </div>
      </header>

      <section className="mc-main-hub" aria-label="Main mission actions">
        <div className="mc-command-deck mc-command-deck-centered">
          <div className="mc-command-deck-frame">
            <div className="mc-command-deck-glow" aria-hidden="true" />
            <h2 className="mc-command-deck-heading">
              <span className="mc-command-deck-title-dot" aria-hidden="true" />
              Actions
            </h2>

            <div className="mc-hex-rows" role="group" aria-label="Operations">
              <div className="mc-hex-row">
                {COMMAND_HEX.slice(0, 4).map(({ mode, ico, lbl, variant }) => (
                  <button
                    key={mode}
                    type="button"
                    className={`mc-hex-wrap${variant === 'config' ? ' mc-hex-wrap-config' : ''}`}
                    onClick={() => setAssistantMode(mode)}
                  >
                    <span className="mc-hex-core">
                      <span className="mc-hex-ico">{ico}</span>
                      <span className="mc-hex-lbl">{lbl}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="mc-hex-row mc-hex-row-nest">
                {COMMAND_HEX.slice(4).map(({ mode, ico, lbl, variant }) => (
                  <button
                    key={mode}
                    type="button"
                    className={`mc-hex-wrap${variant === 'config' ? ' mc-hex-wrap-config' : ''}`}
                    onClick={() => setAssistantMode(mode)}
                  >
                    <span className="mc-hex-core">
                      <span className="mc-hex-ico">{ico}</span>
                      <span className="mc-hex-lbl">{lbl}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <details
        className="mc-flow-details card mc-secondary-fold"
        onToggle={(e) => setFlowMapOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="mc-flow-summary">
          Technical flow diagram
          <span className="mc-flow-summary-hint">for nerds · optional</span>
        </summary>
        <div className="mc-flow-body">{flowMapOpen ? <NeuroTelegramTopology /> : null}</div>
      </details>

      {assistantMode && (
        <MissionAssistant mode={assistantMode} onClose={() => setAssistantMode(null)} onPulseRefresh={refreshMiniPulse} />
      )}
    </div>
  )
}
