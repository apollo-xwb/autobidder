import { useEffect, useState } from 'react'
import { getPromptAnalytics } from '../services/api'
import type { PromptAnalytics as PromptAnalyticsType } from '../services/api'
import '../App.css'

function PromptAnalytics() {
  const [analytics, setAnalytics] = useState<PromptAnalyticsType[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAnalytics()
    const interval = setInterval(loadAnalytics, 10000) // Refresh every 10 seconds
    return () => clearInterval(interval)
  }, [])

  const loadAnalytics = async () => {
    try {
      const data = await getPromptAnalytics()
      setAnalytics(data)
    } catch (error) {
      console.error('Failed to load prompt analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    try {
      return new Date(dateString).toLocaleString()
    } catch {
      return dateString
    }
  }

  if (loading) {
    return (
      <div className="card">
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
          Loading analytics...
        </div>
      </div>
    )
  }

  if (analytics.length === 0) {
    return (
      <div className="card">
        <h2>Prompt Performance Analytics</h2>
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
          No prompt data available yet. Start bidding to see analytics.
        </p>
      </div>
    )
  }

  return (
    <div className="card">
      <h2>Prompt Performance Analytics</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        Track how different prompt configurations perform. All prompts from your arsenal are shown here. Prompts with no bids are displayed with reduced opacity and a "NO BIDS" indicator. Each prompt hash represents a unique prompt template version.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Prompt Name</th>
              <th>Total Bids</th>
              <th>Replies</th>
              <th>Reply Rate</th>
              <th>Won</th>
              <th>Win Rate</th>
              <th>First Used</th>
              <th>Last Used</th>
            </tr>
          </thead>
          <tbody>
            {analytics.map((item) => {
              const winRate = item.total_bids > 0 
                ? ((item.total_won / item.total_bids) * 100).toFixed(1) 
                : '0.0'
              const displayName = item.prompt_name || (item.prompt_hash === 'unknown' ? 'Unnamed (old)' : `Hash: ${item.prompt_hash}`)
              const hasNoBids = item.total_bids === 0
              return (
                <tr 
                  key={item.prompt_hash}
                  style={{
                    opacity: hasNoBids ? 0.5 : 1,
                    background: hasNoBids ? 'rgba(128, 128, 128, 0.05)' : 'transparent',
                    borderLeft: hasNoBids ? '3px solid rgba(128, 128, 128, 0.3)' : 'none',
                  }}
                >
                  <td>
                    <div style={{ 
                      fontFamily: 'Rajdhani', 
                      fontWeight: 600, 
                      color: hasNoBids ? 'var(--text-secondary)' : 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      {displayName}
                      {hasNoBids && (
                        <span style={{
                          fontSize: '0.7rem',
                          padding: '0.15rem 0.5rem',
                          background: 'rgba(128, 128, 128, 0.2)',
                          borderRadius: '8px',
                          fontFamily: 'Share Tech Mono',
                          color: 'var(--text-secondary)',
                          border: '1px solid rgba(128, 128, 128, 0.3)'
                        }}>
                          NO BIDS
                        </span>
                      )}
                    </div>
                    {item.prompt_hash !== 'unknown' && (
                      <div style={{ fontFamily: 'Share Tech Mono', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        {item.prompt_hash}
                      </div>
                    )}
                  </td>
                  <td style={{ fontFamily: 'Orbitron', fontWeight: 600, color: hasNoBids ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                    {item.total_bids}
                  </td>
                  <td style={{ fontFamily: 'Orbitron', fontWeight: 600, color: hasNoBids ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                    {item.total_replies}
                  </td>
                  <td>
                    <span
                      style={{
                        color: hasNoBids ? 'var(--text-secondary)' : (item.reply_rate >= 20 ? 'var(--text-primary)' : item.reply_rate >= 10 ? '#ffaa00' : 'var(--text-secondary)'),
                        fontWeight: 600,
                        fontFamily: 'Orbitron',
                      }}
                    >
                      {item.reply_rate.toFixed(1)}%
                    </span>
                  </td>
                  <td style={{ fontFamily: 'Orbitron', fontWeight: 600, color: hasNoBids ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                    {item.total_won}
                  </td>
                  <td>
                    <span
                      style={{
                        color: hasNoBids ? 'var(--text-secondary)' : (parseFloat(winRate) >= 10 ? 'var(--text-primary)' : parseFloat(winRate) >= 5 ? '#ffaa00' : 'var(--text-secondary)'),
                        fontWeight: 600,
                        fontFamily: 'Orbitron',
                      }}
                    >
                      {winRate}%
                    </span>
                  </td>
                  <td style={{ fontFamily: 'Share Tech Mono', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    {formatDate(item.first_used)}
                  </td>
                  <td style={{ fontFamily: 'Share Tech Mono', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    {formatDate(item.last_used)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      
      <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.1rem' }}>How to Use This Data</h3>
        <ul style={{ margin: 0, paddingLeft: '1.5rem', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
          <li>Name your prompts in the Prompt Editor to easily identify different versions</li>
          <li>Compare reply rates across different prompt versions to identify what works best</li>
          <li>Higher reply rates indicate more engaging bid messages</li>
          <li>Use this data to A/B test different prompt configurations</li>
          <li>When you modify the prompt and save it with a new name, a new hash will be generated</li>
          <li>Unnamed prompts will show as "Unnamed (old)" or display the hash</li>
        </ul>
      </div>
    </div>
  )
}

export default PromptAnalytics

