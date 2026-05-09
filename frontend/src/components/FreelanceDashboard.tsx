import { useEffect, useState } from 'react'
import { getStats } from '../services/api'
import AutobidderControls from './AutobidderControls'
import LogsViewer from './LogsViewer'
import type { Stats } from '../services/api'
import '../App.css'

interface FreelanceDashboardProps {
  mobileView?: 'stats' | 'console'
}

export default function FreelanceDashboard({ mobileView = 'stats' }: FreelanceDashboardProps) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    loadStats()
    const interval = setInterval(loadStats, 5000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadStats = async () => {
    try {
      const data = await getStats()
      setStats(data)
    } catch (error) {
      console.error('Failed to load stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="card">
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading...</div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="card">
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
          Failed to load stats
        </div>
      </div>
    )
  }

  const dashboardContent = (
    <>
      <div className="card">
        <h2>On The Prowl</h2>
        <AutobidderControls />
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Bids</h3>
          <div className="value">{stats.total_bids}</div>
        </div>
        <div className="stat-card">
          <h3>Applied</h3>
          <div className="value">{stats.applied}</div>
        </div>
        <div className="stat-card">
          <h3>Replies</h3>
          <div className="value">{stats.replies || 0}</div>
        </div>
        <div className="stat-card">
          <h3>Won</h3>
          <div className="value">{stats.won}</div>
        </div>
        <div className="stat-card">
          <h3>Total Value</h3>
          <div className="value">${stats.total_value.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <h3>Total Profit</h3>
          <div className="value">${stats.total_profit.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <h3>Win Rate</h3>
          <div className="value">
            {stats.total_bids > 0 ? ((stats.won / stats.total_bids) * 100).toFixed(1) : 0}%
          </div>
        </div>
      </div>
    </>
  )

  const consoleContent = <LogsViewer />

  if (isMobile) {
    return <div className="dashboard-mobile-container">{mobileView === 'stats' ? dashboardContent : consoleContent}</div>
  }

  return (
    <div>
      {dashboardContent}
      {consoleContent}
    </div>
  )
}

