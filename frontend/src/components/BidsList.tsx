import { useEffect, useState } from 'react'
import { getBids, syncBids } from '../services/api'
import type { Bid } from '../services/api'
import { formatCurrency } from '../utils/currency'
import '../App.css'

function BidsList() {
  const [bids, setBids] = useState<Bid[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [selectedBid, setSelectedBid] = useState<Bid | null>(null)

  useEffect(() => {
    loadBids()
    const interval = setInterval(loadBids, 2000) // Refresh every 2 seconds for real-time updates
    return () => clearInterval(interval)
  }, [])

  const loadBids = async () => {
    try {
      const data = await getBids()
      setBids(data)
    } catch (error) {
      console.error('Failed to load bids:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setSyncMessage(null)
    console.log('🔄 Sync button clicked!')
    try {
      console.log('📡 Calling syncBids API...')
      const result = await syncBids()
      console.log('✅ Sync result:', result)
      setSyncMessage(result.message || 'Bids synced successfully')
      await loadBids() // Reload bids after sync
      setTimeout(() => setSyncMessage(null), 5000)
    } catch (error) {
      console.error('❌ Sync error:', error)
      setSyncMessage('Failed to sync bids: ' + (error as Error).message)
    } finally {
      setSyncing(false)
    }
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString()
    } catch {
      return dateString
    }
  }

  const getStatusBadge = (status: string) => {
    if (status === 'won') {
      return <span className="badge badge-success">Won</span>
    } else if (status === 'applied') {
      return <span className="badge badge-info">Applied</span>
    } else {
      return <span className="badge badge-warning">{status}</span>
    }
  }

  if (loading) {
    return (
      <div className="card">
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
          Loading bids...
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0 }}>Bid History ({bids.length})</h2>
          <button
            className="btn btn-primary"
            onClick={handleSync}
            disabled={syncing}
            style={{ fontFamily: 'Orbitron', fontWeight: 600 }}
          >
            {syncing ? 'Syncing...' : '🔄 Sync Currency Codes'}
          </button>
        </div>
        
        {syncMessage && (
          <div
            style={{
              padding: '1rem',
              marginBottom: '1.5rem',
              borderRadius: '12px',
              background: syncMessage.includes('success') || syncMessage.includes('Updated')
                ? 'rgba(0, 255, 136, 0.1)'
                : 'rgba(255, 0, 102, 0.1)',
              border: `1px solid ${syncMessage.includes('success') || syncMessage.includes('Updated') ? 'var(--text-accent)' : '#ff0066'}`,
              color: syncMessage.includes('success') || syncMessage.includes('Updated') ? 'var(--text-accent)' : '#ff0066',
              fontFamily: 'Rajdhani',
              fontWeight: 600,
            }}
          >
            {syncMessage}
          </div>
        )}
        
        {bids.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
            No bids yet.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Project ID</th>
                  <th>Title</th>
                  <th>Bid Amount</th>
                  <th>Status</th>
                  <th>Prompt</th>
                  <th>Outsource Cost</th>
                  <th>Profit</th>
                  <th>Applied At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bids.map((bid) => (
                  <tr key={bid.project_id}>
                    <td style={{ fontFamily: 'Share Tech Mono', color: 'var(--text-primary)' }}>
                      #{bid.project_id}
                    </td>
                    <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {bid.title}
                    </td>
                    <td style={{ fontFamily: 'Orbitron', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {formatCurrency(bid.bid_amount, bid.currency_code)}
                    </td>
                    <td>{getStatusBadge(bid.status)}</td>
                    <td>
                      {bid.prompt_name ? (
                        <span
                          style={{
                            fontFamily: 'Rajdhani',
                            fontWeight: 600,
                            color: 'var(--text-accent)',
                            fontSize: '0.875rem',
                          }}
                          title={`Prompt ID: ${bid.prompt_id}`}
                        >
                          {bid.prompt_name}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                          Unknown
                        </span>
                      )}
                    </td>
                    <td>
                      {bid.outsource_cost !== null
                        ? `$${bid.outsource_cost.toLocaleString()}`
                        : '-'}
                    </td>
                    <td>
                      {bid.profit !== null ? (
                        <span
                          style={{
                            color: bid.profit >= 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                            fontWeight: 600,
                            fontFamily: 'Orbitron',
                          }}
                        >
                          ${bid.profit.toLocaleString()}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td style={{ fontFamily: 'Share Tech Mono', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      {formatDate(bid.applied_at)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <a
                          href={`https://www.freelancer.com/projects/${bid.project_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn"
                          style={{
                            padding: '0.5rem 1rem',
                            fontSize: '0.875rem',
                            textDecoration: 'none',
                            display: 'inline-block',
                          }}
                        >
                          🔗 Job
                        </a>
                        {bid.bid_message && (
                          <button
                            className="btn btn-primary"
                            onClick={() => setSelectedBid(bid)}
                            style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                          >
                            View
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedBid && (
        <div className="bid-message-modal" onClick={() => setSelectedBid(null)}>
          <div className="bid-message-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-modal" onClick={() => setSelectedBid(null)}>
              ×
            </button>
            <h3>Bid Message - Project #{selectedBid.project_id}</h3>
            <div style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
              <strong>Title:</strong> {selectedBid.title}
            </div>
            <div style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
              <strong>Bid Amount:</strong>{' '}
              <span style={{ color: 'var(--text-primary)', fontFamily: 'Orbitron' }}>
                {formatCurrency(selectedBid.bid_amount, selectedBid.currency_code)}
              </span>
            </div>
            <div className="bid-message-text">
              {selectedBid.bid_message || 'No message available'}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default BidsList
