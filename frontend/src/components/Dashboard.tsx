import React from 'react'
import '../App.css'
import FourceeDashboard from './FourceeDashboard'
import FreelanceDashboard from './FreelanceDashboard'

interface DashboardProps {
  mobileView?: 'stats' | 'console'
}

function Dashboard({ mobileView = 'stats' }: DashboardProps) {
  const STORAGE_KEY = 'dashboard:mode:v1'
  const [mode, setMode] = React.useState<'saas' | 'freelance'>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'freelance' ? 'freelance' : 'saas'
  })

  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode)
  }, [mode])

  return (
    <div>
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="htos-topbar">
          <div>
            <div className="htos-brand" style={{ marginBottom: 0 }}>
              Fourcee
            </div>
            <div className="htos-topbar-sub">
              <a className="htos-link" href="https://www.fourcee.online" target="_blank" rel="noreferrer">
                www.fourcee.online
              </a>
            </div>
          </div>

          <div className="htos-mode">
            <div className="htos-mode-label">SaaS OS</div>
            <button
              className={`btn-toggle ${mode === 'saas' ? 'on' : ''}`}
              onClick={() => setMode((m) => (m === 'saas' ? 'freelance' : 'saas'))}
              aria-label="Toggle dashboard mode"
              title="Toggle SaaS OS / Freelance"
            >
              <span className="btn-toggle-knob" />
            </button>
            <div className="htos-mode-label">Freelance</div>
          </div>
        </div>
      </div>

      {mode === 'saas' ? <FourceeDashboard /> : <FreelanceDashboard mobileView={mobileView} />}
    </div>
  )
}

export default Dashboard
