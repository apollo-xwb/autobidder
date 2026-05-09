import React from 'react'
import { Link } from 'react-router-dom'
import { interestedRate, type FourceePulse } from '../services/fourceeApi'
import NeuroTelegramTopology from './NeuroTelegramTopology'
import MissionAssistant, { type AssistantDockMode } from './MissionAssistant'
import '../App.css'

const COMMAND_HEX: Array<{ mode: AssistantDockMode; ico: string; lbl: string }> = [
  { mode: 'intake', ico: '➕', lbl: 'Lead' },
  { mode: 'scrape', ico: '🔎', lbl: 'Scrape' },
  { mode: 'launch', ico: '🚀', lbl: 'Campaign' },
  { mode: 'demo', ico: '🎯', lbl: 'Demo' },
]

function pairKey(a: number, b: number) {
  return a < b ? `${a}-${b}` : `${b}-${a}`
}

/** Approximate inscribed-circle overlap for drifting hex shapes */
function circlesOverlap(ax: number, ay: number, ar: number, bx: number, by: number, br: number) {
  const d = Math.hypot(ax - bx, ay - by)
  return d < ar + br * 0.9
}

export default function MissionControl() {
  const [assistantMode, setAssistantMode] = React.useState<AssistantDockMode | null>(null)
  const [flowMapOpen, setFlowMapOpen] = React.useState(false)

  const [pulseMini, setPulseMini] = React.useState<FourceePulse | null>(null)

  const refreshMiniPulse = React.useCallback(() => {
    // Pulse is optional in the 4-action OS; keep the chip but don’t block actions.
    setPulseMini(null)
  }, [])

  React.useEffect(() => {
    void refreshMiniPulse()
  }, [refreshMiniPulse])

  React.useEffect(() => {
    const id = window.setInterval(() => void refreshMiniPulse(), 120000)
    return () => window.clearInterval(id)
  }, [refreshMiniPulse])

  const hexBtnRefs = React.useRef<Array<HTMLButtonElement | null>>([null, null, null, null])
  const touchCountRef = React.useRef([0, 0, 0, 0])
  const [, bumpTouch] = React.useReducer((x: number) => x + 1, 0)
  const prevOverlapPairs = React.useRef<Set<string>>(new Set())

  const flashPair = React.useCallback(
    (i: number, j: number) => {
      const c = touchCountRef.current
      c[i]++
      c[j]++
      bumpTouch()
      window.setTimeout(() => {
        c[i]--
        c[j]--
        bumpTouch()
      }, 450)
    },
    [bumpTouch]
  )

  React.useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined

    let rafId = 0
    const run = () => {
      const els = hexBtnRefs.current
      const n = COMMAND_HEX.length
      const rects: DOMRect[] = []
      let ok = true
      for (let i = 0; i < n; i++) {
        const el = els[i]
        if (!el) {
          ok = false
          break
        }
        rects.push(el.getBoundingClientRect())
      }
      if (!ok) {
        rafId = window.requestAnimationFrame(run)
        return
      }

      const radii = rects.map((r) => Math.min(r.width, r.height) * 0.46)
      const centers = rects.map((r) => ({
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
      }))

      const now = new Set<string>()
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (circlesOverlap(centers[i].x, centers[i].y, radii[i], centers[j].x, centers[j].y, radii[j])) {
            const pk = pairKey(i, j)
            now.add(pk)
            if (!prevOverlapPairs.current.has(pk)) {
              flashPair(i, j)
            }
          }
        }
      }
      prevOverlapPairs.current = now
      rafId = window.requestAnimationFrame(run)
    }
    rafId = window.requestAnimationFrame(run)
    return () => window.cancelAnimationFrame(rafId)
  }, [flashPair])

  const rate = pulseMini ? interestedRate(pulseMini) : 0

  return (
    <div className="mc-root mc-root-quiet mc-page-shell mc-page-shell--fullbleed mc-fit-viewport">
      <div className="mc-orch-hero" aria-hidden="true" />
      <div className="mc-grid-bg" aria-hidden="true" />

      <header className="mc-topbar mc-topbar-quiet mc-topbar-orch">
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
        <div className="mc-hex-field" role="group" aria-label="Operations">
          {COMMAND_HEX.map(({ mode, ico, lbl }, index) => (
            <button
              key={mode}
              ref={(el) => {
                hexBtnRefs.current[index] = el
              }}
              type="button"
              className={[
                'mc-hex-wrap',
                'mc-hex-float',
                `mc-hex-float--${index}`,
                touchCountRef.current[index] > 0 ? 'mc-hex-touch' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setAssistantMode(mode)}
              title={`${lbl} · mission action`}
            >
              <span className="mc-hex-core">
                <span className="mc-hex-ico">{ico}</span>
                <span className="mc-hex-lbl">{lbl}</span>
              </span>
            </button>
          ))}
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
