import { useEffect, useState } from 'react'
import { getBids, updateDealStage, getMilestones, createMilestone, updateMilestoneStatus, deleteDeal } from '../services/api'
import type { Bid, Milestone } from '../services/api'
import { formatCurrency } from '../utils/currency'
import '../App.css'

const PIPELINE_STAGES = ['Won', 'In Progress', 'QA / Review', 'Delivered']

function DealsKanban() {
  const [bids, setBids] = useState<Bid[]>([])
  const [loading, setLoading] = useState(true)
  const [draggedBid, setDraggedBid] = useState<Bid | null>(null)
  const [milestoneBid, setMilestoneBid] = useState<Bid | null>(null)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('')
  const [newMilestoneAmount, setNewMilestoneAmount] = useState('')
  const [deleteBid, setDeleteBid] = useState<Bid | null>(null)
  const [excludeFromStats, setExcludeFromStats] = useState(false)

  useEffect(() => {
    loadDeals()
    const interval = setInterval(loadDeals, 3000)
    return () => clearInterval(interval)
  }, [])

  const loadDeals = async () => {
    try {
      const data = await getBids()
      // Only show bids that have been marked as deals (have pipeline_stage set)
      const deals = data.filter((bid) => bid.pipeline_stage && bid.status === 'won')
      setBids(deals)
    } catch (error) {
      console.error('Failed to load deals:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDragStart = (bid: Bid) => {
    setDraggedBid(bid)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = async (newStage: string) => {
    if (!draggedBid) return
    try {
      await updateDealStage(draggedBid.project_id, newStage)
      await loadDeals()
    } catch (error) {
      console.error('Failed to update deal stage:', error)
      alert('Failed to move deal')
    } finally {
      setDraggedBid(null)
    }
  }

  const getBidsForStage = (stage: string) => {
    return bids.filter((bid) => bid.pipeline_stage === stage)
  }

  const openMilestones = async (bid: Bid) => {
    try {
      setMilestoneBid(bid)
      const data = await getMilestones(bid.project_id)
      setMilestones(data)
      setNewMilestoneTitle('')
      setNewMilestoneAmount('')
    } catch (error) {
      console.error('Failed to load milestones:', error)
      alert('Failed to load milestones for this deal')
    }
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString()
    } catch {
      return dateString
    }
  }

  if (loading) {
    return (
      <div className="card">
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
          Loading deals...
        </div>
      </div>
    )
  }

  const totalDeals = bids.length

  return (
    <>
      <div style={{ padding: '0 1rem' }}>
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0 }}>Live Projects ({totalDeals})</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', marginBottom: 0 }}>
            Drag cards between columns to update status
          </p>
        </div>

        {totalDeals === 0 ? (
          <div className="card">
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No active deals yet</p>
              <p style={{ fontSize: '0.9rem' }}>
                Go to <strong>Bids</strong> and click <strong>Create Deal</strong> on a won project to add it here.
              </p>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${PIPELINE_STAGES.length}, 1fr)`,
              gap: '1.5rem',
              overflowX: 'auto',
              paddingBottom: '1rem',
            }}
          >
            {PIPELINE_STAGES.map((stage) => {
              const stageBids = getBidsForStage(stage)
              return (
                <div
                  key={stage}
                  style={{
                    minWidth: '280px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '12px',
                    padding: '1rem',
                    border: '1px solid var(--border-glass)',
                  }}
                  onDragOver={handleDragOver}
                  onDrop={(e) => {
                    e.preventDefault()
                    handleDrop(stage)
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '1rem',
                      paddingBottom: '0.75rem',
                      borderBottom: '2px solid var(--border-glass)',
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{stage}</h3>
                    <span
                      style={{
                        background: 'rgba(255, 255, 255, 0.1)',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}
                    >
                      {stageBids.length}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {stageBids.map((bid) => {
                      const clientTotal =
                        bid.profit !== null && bid.outsource_cost !== null
                          ? bid.profit + bid.outsource_cost
                          : bid.bid_amount
                      return (
                        <div
                          key={bid.project_id}
                          draggable
                          onDragStart={() => handleDragStart(bid)}
                          style={{
                            background: 'rgba(0, 0, 0, 0.5)',
                            border: '1px solid var(--border-glass)',
                            borderRadius: '8px',
                            padding: '1rem',
                            cursor: 'grab',
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)'
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)'
                            e.currentTarget.style.boxShadow = 'none'
                          }}
                          onClick={() => openMilestones(bid)}
                        >
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--text-secondary)',
                              marginBottom: '0.5rem',
                              fontFamily: 'Share Tech Mono',
                            }}
                          >
                            #{bid.project_id}
                          </div>
                          <h4
                            style={{
                              margin: '0 0 0.75rem 0',
                              fontSize: '0.9rem',
                              fontWeight: 600,
                              lineHeight: '1.4',
                              color: 'var(--text-primary)',
                            }}
                          >
                            {bid.title}
                          </h4>
                          <div style={{ marginBottom: '0.5rem' }}>
                            <div
                              style={{
                                fontSize: '0.8rem',
                                color: 'var(--text-secondary)',
                                marginBottom: '0.25rem',
                              }}
                            >
                              Client total:
                            </div>
                            <div
                              style={{
                                fontFamily: 'Orbitron',
                                fontWeight: 600,
                                fontSize: '1rem',
                                color: 'var(--text-accent)',
                              }}
                            >
                              {formatCurrency(clientTotal, bid.currency_code)}
                            </div>
                          </div>
                          {bid.outsource_cost !== null && (
                            <div style={{ marginBottom: '0.5rem' }}>
                              <div
                                style={{
                                  fontSize: '0.8rem',
                                  color: 'var(--text-secondary)',
                                  marginBottom: '0.25rem',
                                }}
                              >
                                Dev cost:
                              </div>
                              <div
                                style={{
                                  fontFamily: 'Orbitron',
                                  fontWeight: 600,
                                  fontSize: '0.9rem',
                                  color: 'var(--text-primary)',
                                }}
                              >
                                {formatCurrency(bid.outsource_cost, bid.currency_code)}
                              </div>
                            </div>
                          )}
                          {bid.profit !== null && (
                            <div style={{ marginBottom: '0.5rem' }}>
                              <div
                                style={{
                                  fontSize: '0.8rem',
                                  color: 'var(--text-secondary)',
                                  marginBottom: '0.25rem',
                                }}
                              >
                                Profit:
                              </div>
                              <div
                                style={{
                                  fontFamily: 'Orbitron',
                                  fontWeight: 600,
                                  fontSize: '0.9rem',
                                  color: bid.profit >= 0 ? '#00ff88' : '#ff0066',
                                }}
                              >
                                {formatCurrency(bid.profit, bid.currency_code)}
                              </div>
                            </div>
                          )}
                          {bid.assigned_freelancer && (
                            <div style={{ marginBottom: '0.5rem' }}>
                              <div
                                style={{
                                  fontSize: '0.8rem',
                                  color: 'var(--text-secondary)',
                                  marginBottom: '0.25rem',
                                }}
                              >
                                Freelancer:
                              </div>
                              <div
                                style={{
                                  fontSize: '0.85rem',
                                  color: 'var(--text-primary)',
                                  fontWeight: 500,
                                }}
                              >
                                {bid.assigned_freelancer}
                              </div>
                            </div>
                          )}
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginTop: '0.75rem',
                              paddingTop: '0.75rem',
                              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                            }}
                          >
                            <div
                              style={{
                                fontSize: '0.7rem',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {formatDate(bid.applied_at)}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setDeleteBid(bid)
                                setExcludeFromStats(false)
                              }}
                              style={{
                                background: 'rgba(255, 0, 102, 0.2)',
                                border: '1px solid rgba(255, 0, 102, 0.5)',
                                color: '#ff0066',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                cursor: 'pointer',
                                fontWeight: 600,
                                transition: 'all 0.2s',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 0, 102, 0.3)'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 0, 102, 0.2)'
                              }}
                            >
                              ×
                            </button>
                          </div>
                          <a
                            href={`https://www.freelancer.com/projects/${bid.project_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-block',
                              marginTop: '0.5rem',
                              fontSize: '0.75rem',
                              color: 'var(--text-accent)',
                              textDecoration: 'none',
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            🔗 View on Freelancer
                          </a>
                        </div>
                      )
                    })}
                    {stageBids.length === 0 && (
                      <div
                        style={{
                          padding: '2rem 1rem',
                          textAlign: 'center',
                          color: 'var(--text-secondary)',
                          fontSize: '0.85rem',
                          border: '2px dashed var(--border-glass)',
                          borderRadius: '8px',
                        }}
                      >
                        Drop deals here
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {milestoneBid && (
        <div className="bid-message-modal" onClick={() => setMilestoneBid(null)}>
          <div className="bid-message-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-modal" onClick={() => setMilestoneBid(null)}>
              ×
            </button>
            <h3>Milestones</h3>
            <div style={{ marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
              <strong>Project:</strong> {milestoneBid.title}
            </div>

            <div style={{ margin: '1rem 0' }}>
              {milestones.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  No milestones yet. Create the first one below.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {milestones.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-glass)',
                        background: 'rgba(0,0,0,0.4)',
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: '0.9rem',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            textDecoration: m.status === 'completed' ? 'line-through' : 'none',
                          }}
                        >
                          {m.title}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          Amount: {formatCurrency(m.amount || 0, milestoneBid.currency_code)}
                          {m.due_date ? ` • Due: ${m.due_date}` : ''}
                        </div>
                      </div>
                      <div>
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            fontSize: '0.8rem',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={m.status === 'completed'}
                            onChange={async (e) => {
                              const newStatus = e.target.checked ? 'completed' : 'pending'
                              try {
                                await updateMilestoneStatus(m.id, newStatus as 'pending' | 'completed')
                                const updated = await getMilestones(milestoneBid.project_id)
                                setMilestones(updated)
                                await loadDeals()
                              } catch (err) {
                                console.error('Failed to update milestone', err)
                                alert('Failed to update milestone status')
                              }
                            }}
                          />
                          Complete
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              style={{
                marginTop: '1rem',
                paddingTop: '1rem',
                borderTop: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <h4 style={{ margin: '0 0 0.5rem 0' }}>Add Milestone</h4>
              <label
                style={{
                  display: 'block',
                  marginBottom: '0.35rem',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem',
                }}
              >
                Title
              </label>
              <input
                type="text"
                value={newMilestoneTitle}
                onChange={(e) => setNewMilestoneTitle(e.target.value)}
                placeholder="e.g. Design phase, MVP delivery"
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
              <label
                style={{
                  display: 'block',
                  marginBottom: '0.35rem',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem',
                }}
              >
                Amount ({milestoneBid.currency_code || 'USD'})
              </label>
              <input
                type="number"
                value={newMilestoneAmount}
                onChange={(e) => setNewMilestoneAmount(e.target.value)}
                placeholder="Optional"
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-glass)',
                  background: 'rgba(0,0,0,0.4)',
                  color: 'var(--text-primary)',
                  marginBottom: '0.75rem',
                }}
              />
              <button
                className="btn btn-primary"
                onClick={async () => {
                  if (!milestoneBid) return
                  if (!newMilestoneTitle.trim()) {
                    alert('Milestone title is required')
                    return
                  }
                  const amt = parseFloat(newMilestoneAmount || '0') || 0
                  try {
                    await createMilestone(milestoneBid.project_id, {
                      title: newMilestoneTitle.trim(),
                      amount: amt,
                    })
                    const updated = await getMilestones(milestoneBid.project_id)
                    setMilestones(updated)
                    setNewMilestoneTitle('')
                    setNewMilestoneAmount('')
                  } catch (err) {
                    console.error('Failed to create milestone', err)
                    alert('Failed to create milestone')
                  }
                }}
                style={{ padding: '0.5rem 1.5rem', fontSize: '0.9rem' }}
              >
                Add Milestone
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteBid && (
        <div className="bid-message-modal" onClick={() => setDeleteBid(null)}>
          <div className="bid-message-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-modal" onClick={() => setDeleteBid(null)}>
              ×
            </button>
            <h3>Remove Deal</h3>
            <div style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
              <strong>Project:</strong> {deleteBid.title}
              <br />
              <strong>Project ID:</strong> #{deleteBid.project_id}
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  color: 'var(--text-primary)',
                }}
              >
                <input
                  type="checkbox"
                  checked={excludeFromStats}
                  onChange={(e) => setExcludeFromStats(e.target.checked)}
                />
                <span>
                  Exclude from stats (profit, total value, etc. won't be counted)
                  <br />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Use this for mock data or accidental projects
                  </span>
                </span>
              </label>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                className="btn"
                onClick={() => setDeleteBid(null)}
                style={{ padding: '0.5rem 1.5rem', fontSize: '0.9rem' }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  try {
                    await deleteDeal(deleteBid.project_id, excludeFromStats)
                    setDeleteBid(null)
                    await loadDeals()
                  } catch (error) {
                    console.error('Failed to delete deal:', error)
                    alert('Failed to remove deal')
                  }
                }}
                style={{
                  padding: '0.5rem 1.5rem',
                  fontSize: '0.9rem',
                  background: excludeFromStats ? undefined : 'rgba(255, 0, 102, 0.8)',
                  border: excludeFromStats ? undefined : '1px solid #ff0066',
                }}
              >
                {excludeFromStats ? 'Exclude from Stats' : 'Remove Deal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default DealsKanban