import { useEffect, useState } from 'react'
import { getBids, setBidCost, createDeal, type CostPayload } from '../services/api'
import type { Bid } from '../services/api'
import { formatCurrency } from '../utils/currency'
import '../App.css'

// Fallback message used when Gemini fails (mirror of backend FALLBACK_MESSAGE intent)
const FALLBACK_MESSAGE =
  "I just saw your project and already have a clear plan to deliver exactly what you need. " +
  "I've shipped similar projects before and can start quickly. " +
  "What's the one feature or outcome you're most excited about so I can focus the plan around that first?"

function BidsList() {
  const [bids, setBids] = useState<Bid[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBid, setSelectedBid] = useState<Bid | null>(null)
  const [costBid, setCostBid] = useState<Bid | null>(null)
  const [clientBillingModel, setClientBillingModel] = useState<'hourly' | 'fixed'>('fixed')
  const [clientFixed, setClientFixed] = useState<string>('')
  const [clientRate, setClientRate] = useState<string>('')
  const [clientHours, setClientHours] = useState<string>('')

  const [devBillingModel, setDevBillingModel] = useState<'hourly' | 'fixed'>('fixed')
  const [devFixed, setDevFixed] = useState<string>('')
  const [devRate, setDevRate] = useState<string>('')
  const [devHours, setDevHours] = useState<string>('')
  const [dealBid, setDealBid] = useState<Bid | null>(null)
  const [dealFreelancer, setDealFreelancer] = useState<string>('')
  const [dealStage, setDealStage] = useState<string>('Won')

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
        </div>
        
        {bids.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
            No bids yet.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ color: '#ffffff' }}>Project ID</th>
                  <th style={{ color: '#ffffff' }}>Title</th>
                  <th style={{ color: '#ffffff' }}>Bid Amount</th>
                  <th style={{ color: '#ffffff' }}>Currency Code</th>
                  <th style={{ color: '#ffffff' }}>Billing</th>
                  <th style={{ color: '#ffffff' }}>Value (USD)</th>
                  <th style={{ color: '#ffffff' }}>Status</th>
                  <th style={{ color: '#ffffff' }}>Outsource Cost</th>
                  <th style={{ color: '#ffffff' }}>Profit</th>
                  <th style={{ color: '#ffffff' }}>Applied At</th>
                  <th style={{ color: '#ffffff' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bids.map((bid) => {
                  // Only highlight if fallback_reason is set (meaning ALL models failed)
                  // If prompt_id is set and fallback_reason is null, the prompt succeeded (even with model fallbacks)
                  const isFallbackBid = !!bid.fallback_reason
                  return (
                    <tr key={bid.project_id}>
                      <td style={{ fontFamily: 'Share Tech Mono', color: 'var(--text-primary)' }}>
                        #{bid.project_id}
                      </td>
                      <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {bid.title}
                      </td>
                    <td style={{ fontFamily: 'Orbitron', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {formatCurrency(bid.client_total ?? bid.bid_amount, bid.currency_code)}
                    </td>
                    <td style={{ fontFamily: 'Share Tech Mono', color: 'var(--text-secondary)' }}>
                      {bid.currency_code || '—'}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {bid.client_billing_model === 'hourly'
                        ? `Hourly @ ${formatCurrency(bid.client_rate || 0, bid.currency_code)}${
                            bid.client_hours ? ` × ${bid.client_hours}h` : ''
                          }`
                        : bid.client_billing_model === 'fixed'
                        ? 'Fixed price'
                        : '—'}
                    </td>
                      <td style={{ fontFamily: 'Orbitron', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {formatCurrency(bid.bid_amount_usd ?? bid.bid_amount, 'USD')}
                      </td>
                      <td>{getStatusBadge(bid.status)}</td>
                      <td>
                        {bid.outsource_cost !== null
                          ? formatCurrency(bid.outsource_cost, bid.currency_code)
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
                            {formatCurrency(bid.profit, bid.currency_code)}
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
                          <button
                            className="btn btn-primary"
                            onClick={() => {
                              setCostBid(bid)
                          setClientBillingModel('fixed')
                          setClientFixed('')
                          setClientRate('')
                          setClientHours('')
                          setDevBillingModel('fixed')
                          setDevFixed(bid.outsource_cost != null ? String(bid.outsource_cost) : '')
                          setDevRate('')
                          setDevHours('')
                            }}
                            style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                          >
                            Cost
                          </button>
                          <button
                            className="btn"
                            onClick={() => setSelectedBid(bid)}
                            style={{
                              padding: '0.5rem 1rem',
                              fontSize: '0.875rem',
                              background: isFallbackBid ? '#ffff33' : undefined,
                              color: isFallbackBid ? '#000000' : undefined,
                              boxShadow: isFallbackBid
                                ? '0 0 8px #ffff33, 0 0 16px #ffff33'
                                : undefined,
                              fontWeight: isFallbackBid ? 700 : 500,
                            }}
                          >
                            View
                          </button>
                          <button
                            className="btn btn-primary"
                            onClick={() => {
                              setDealBid(bid)
                              setDealFreelancer(bid.assigned_freelancer || '')
                              setDealStage(bid.pipeline_stage || 'Won')
                            }}
                            style={{
                              padding: '0.5rem 1rem',
                              fontSize: '0.875rem',
                              background:
                                bid.pipeline_stage && bid.pipeline_stage !== 'Won'
                                  ? 'linear-gradient(135deg, #00ff88, #00b3ff)'
                                  : undefined,
                            }}
                          >
                            Create Deal
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
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
            <div style={{ marginBottom: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              <div>
                <strong>Currency code:</strong> {selectedBid.currency_code || '—'}
              </div>
              <div>
                <strong>Prompt used:</strong>{' '}
                {selectedBid.prompt_name || 'Current active prompt (metadata not stored for this bid)'}
              </div>
            </div>
            <div className="bid-message-text">
              {selectedBid.bid_message && selectedBid.bid_message.trim() ? selectedBid.bid_message : FALLBACK_MESSAGE}
            </div>
            {selectedBid.fallback_reason ? (
              <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#ff6b6b' }}>
                <strong>⚠️ All AI models failed:</strong> {selectedBid.fallback_reason}
                <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  This bid used the generic fallback text because none of the AI models could generate a message.
                </div>
              </div>
            ) : selectedBid.prompt_id && selectedBid.bid_message && selectedBid.bid_message.trim() ? (
              <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-accent)' }}>
                ✓ Prompt generated successfully (may have used model fallbacks, which is normal)
              </div>
            ) : null}
          </div>
        </div>
      )}

      {dealBid && (
        <div className="bid-message-modal" onClick={() => setDealBid(null)}>
          <div className="bid-message-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-modal" onClick={() => setDealBid(null)}>
              ×
            </button>
            <h3>Create Deal - Project #{dealBid.project_id}</h3>
            <div style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
              <strong>Title:</strong> {dealBid.title}
            </div>
            <div style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
              <strong>Client total:</strong>{' '}
              <span style={{ fontFamily: 'Orbitron' }}>
                {formatCurrency(dealBid.profit !== null && dealBid.outsource_cost !== null
                  ? dealBid.profit + dealBid.outsource_cost
                  : dealBid.bid_amount, dealBid.currency_code)}
              </span>
            </div>
            <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>
              Assign freelancer (optional):
            </label>
            <input
              type="text"
              value={dealFreelancer}
              onChange={(e) => setDealFreelancer(e.target.value)}
              placeholder="Name, handle, or agency (you can leave this empty)"
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--border-glass)',
                background: 'rgba(0,0,0,0.4)',
                color: 'var(--text-primary)',
                marginBottom: '1rem',
              }}
            />
            <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>
              Pipeline stage:
            </label>
            <select
              value={dealStage}
              onChange={(e) => setDealStage(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--border-glass)',
                background: 'rgba(0,0,0,0.4)',
                color: 'var(--text-primary)',
                marginBottom: '1rem',
              }}
            >
              <option value="Won">Won</option>
              <option value="In Progress">In Progress</option>
              <option value="QA / Review">QA / Review</option>
              <option value="Delivered">Delivered</option>
            </select>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                className="btn"
                onClick={() => setDealBid(null)}
                style={{ padding: '0.5rem 1.2rem', fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  if (!dealBid) return
                  try {
                    await createDeal(
                      dealBid.project_id,
                      dealStage || 'Won',
                      dealFreelancer.trim() || undefined
                    )
                    setDealBid(null)
                    setDealFreelancer('')
                    setDealStage('Won')
                    await loadBids()
                  } catch (e) {
                    console.error('Failed to create deal', e)
                    alert('Failed to create deal: ' + (e as Error).message)
                  }
                }}
                style={{ padding: '0.5rem 1.5rem', fontSize: '0.9rem' }}
              >
                Create Deal
              </button>
            </div>
          </div>
        </div>
      )}

      {costBid && (
        <div className="bid-message-modal" onClick={() => setCostBid(null)}>
          <div className="bid-message-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-modal" onClick={() => setCostBid(null)}>
              ×
            </button>
            <h3>Set Cost & Profit - Project #{costBid.project_id}</h3>
            <div style={{ marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
              <strong>Bid Amount:</strong>{' '}
              <span style={{ fontFamily: 'Orbitron' }}>
                {formatCurrency(costBid.bid_amount, costBid.currency_code)}
              </span>
            </div>
            {/* Client side */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Final amount agreed with client
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    checked={clientBillingModel === 'fixed'}
                    onChange={() => setClientBillingModel('fixed')}
                  />
                  Fixed amount
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    checked={clientBillingModel === 'hourly'}
                    onChange={() => setClientBillingModel('hourly')}
                  />
                  Hourly × hours
                </label>
              </div>
              {clientBillingModel === 'fixed' ? (
                <>
                  <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>
                    Final fixed amount from client:
                  </label>
                  <input
                    type="number"
                    value={clientFixed}
                    onChange={(e) => setClientFixed(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-glass)',
                      background: 'rgba(0,0,0,0.4)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </>
              ) : (
                <>
                  <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
                    Client hourly rate:
                  </label>
                  <input
                    type="number"
                    value={clientRate}
                    onChange={(e) => setClientRate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-glass)',
                      background: 'rgba(0,0,0,0.4)',
                      color: 'var(--text-primary)',
                      marginBottom: '0.5rem',
                    }}
                  />
                  <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
                    Hours:
                  </label>
                  <input
                    type="number"
                    value={clientHours}
                    onChange={(e) => setClientHours(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-glass)',
                      background: 'rgba(0,0,0,0.4)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </>
              )}
            </div>

            {/* Dev side */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                How are you paying the dev?
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    checked={devBillingModel === 'fixed'}
                    onChange={() => setDevBillingModel('fixed')}
                  />
                  Fixed amount
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    checked={devBillingModel === 'hourly'}
                    onChange={() => setDevBillingModel('hourly')}
                  />
                  Hourly × hours
                </label>
              </div>
              {devBillingModel === 'fixed' ? (
                <>
                  <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>
                    Fixed amount you pay the dev:
                  </label>
                  <input
                    type="number"
                    value={devFixed}
                    onChange={(e) => setDevFixed(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-glass)',
                      background: 'rgba(0,0,0,0.4)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </>
              ) : (
                <>
                  <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
                    Dev hourly rate:
                  </label>
                  <input
                    type="number"
                    value={devRate}
                    onChange={(e) => setDevRate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-glass)',
                      background: 'rgba(0,0,0,0.4)',
                      color: 'var(--text-primary)',
                      marginBottom: '0.5rem',
                    }}
                  />
                  <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
                    Hours:
                  </label>
                  <input
                    type="number"
                    value={devHours}
                    onChange={(e) => setDevHours(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-glass)',
                      background: 'rgba(0,0,0,0.4)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </>
              )}
            </div>

            {(() => {
              if (!costBid) return null

              // Client total (project currency)
              let clientTotal = 0
              if (clientBillingModel === 'fixed') {
                clientTotal = parseFloat(clientFixed) || 0
              } else {
                const cr = parseFloat(clientRate)
                const ch = parseFloat(clientHours)
                if (!isNaN(cr) && !isNaN(ch)) clientTotal = cr * ch
              }
              if (!clientTotal) {
                clientTotal = costBid.bid_amount // fallback to original bid if nothing entered
              }

              // Dev total (always entered in USD)
              let devTotalUsd = 0
              if (devBillingModel === 'fixed') {
                devTotalUsd = parseFloat(devFixed) || 0
              } else {
                const dr = parseFloat(devRate)
                const dh = parseFloat(devHours)
                if (!isNaN(dr) && !isNaN(dh)) devTotalUsd = dr * dh
              }

              // Estimate profit in USD using bid_amount_usd as the FX reference
              let profitUsd: number | null = null
              if (
                typeof costBid.bid_amount_usd === 'number' &&
                typeof costBid.bid_amount === 'number' &&
                costBid.bid_amount > 0
              ) {
                const fx = costBid.bid_amount_usd / costBid.bid_amount
                const clientTotalUsd = clientTotal * fx
                profitUsd = clientTotalUsd - devTotalUsd
              }

              return (
                <div style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                  <div>
                    <strong>Total from client:</strong>{' '}
                    <span style={{ fontFamily: 'Orbitron' }}>
                      {formatCurrency(clientTotal, costBid.currency_code)}
                    </span>
                  </div>
                  <div>
                    <strong>Total you pay dev (USD):</strong>{' '}
                    <span style={{ fontFamily: 'Orbitron' }}>
                      {formatCurrency(devTotalUsd, 'USD')}
                    </span>
                  </div>
                  {profitUsd !== null && (
                    <div style={{ marginTop: '0.35rem' }}>
                      <strong>Estimated profit (USD):</strong>{' '}
                      <span
                        style={{
                          fontFamily: 'Orbitron',
                          color: profitUsd >= 0 ? 'var(--text-primary)' : '#ff4d4f',
                        }}
                      >
                        {formatCurrency(profitUsd, 'USD')}
                      </span>
                    </div>
                  )}
                </div>
              )
            })()}
            <button
              className="btn btn-primary"
              onClick={async () => {
                if (!costBid) return
                // Validate client side
                let clientTotal = 0
                let clientHoursNum: number | undefined
                let clientRateNum: number | undefined
                if (clientBillingModel === 'fixed') {
                  const v = parseFloat(clientFixed)
                  if (isNaN(v) || v <= 0) {
                    alert('Please enter a valid final client amount')
                    return
                  }
                  clientTotal = v
                } else {
                  const cr = parseFloat(clientRate)
                  const ch = parseFloat(clientHours)
                  if (isNaN(cr) || cr <= 0 || isNaN(ch) || ch <= 0) {
                    alert('Please enter a valid client hourly rate and hours')
                    return
                  }
                  clientTotal = cr * ch
                  clientRateNum = cr
                  clientHoursNum = ch
                }

                // Validate dev side
                let devTotal = 0
                let devHoursNum: number | undefined
                let devRateNum: number | undefined
                if (devBillingModel === 'fixed') {
                  const v = parseFloat(devFixed)
                  if (isNaN(v) || v < 0) {
                    alert('Please enter a valid dev amount')
                    return
                  }
                  devTotal = v
                } else {
                  const dr = parseFloat(devRate)
                  const dh = parseFloat(devHours)
                  if (isNaN(dr) || dr <= 0 || isNaN(dh) || dh <= 0) {
                    alert('Please enter a valid dev hourly rate and hours')
                    return
                  }
                  devTotal = dr * dh
                  devRateNum = dr
                  devHoursNum = dh
                }

                try {
                  const payload: CostPayload = {
                    client_billing_model: clientBillingModel,
                    client_hours: clientHoursNum,
                    client_rate: clientRateNum,
                    client_total: clientTotal,
                    dev_billing_model: devBillingModel,
                    dev_hours: devHoursNum,
                    dev_rate: devRateNum,
                    dev_total: devTotal,
                  }
                  await setBidCost(costBid.project_id, payload)
                  setCostBid(null)
                  await loadBids()
                } catch (e) {
                  console.error('Failed to set cost', e)
                  alert('Failed to set cost')
                }
              }}
              style={{ padding: '0.5rem 1.5rem', fontSize: '0.9rem' }}
            >
              Save Cost & Profit
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default BidsList
