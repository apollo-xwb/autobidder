import { useEffect, useState } from 'react'
import { getPrompts, createPrompt, updatePromptArsenal, activatePrompt, deletePrompt, getConfig, updateConfig } from '../services/api'
import type { PromptArsenal, Config } from '../services/api'
import '../App.css'

function PromptsArsenal() {
  const [prompts, setPrompts] = useState<PromptArsenal[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPrompt, setSelectedPrompt] = useState<PromptArsenal | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [newPromptName, setNewPromptName] = useState('')
  const [newPromptDescription, setNewPromptDescription] = useState('')
  const [newPromptTemplate, setNewPromptTemplate] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [promptMode, setPromptMode] = useState<'manual' | 'dynamic'>('dynamic')
  const [updatingMode, setUpdatingMode] = useState(false)

  useEffect(() => {
    loadPrompts()
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const config: Config = await getConfig()
      setPromptMode(config.PROMPT_SELECTION_MODE || 'dynamic')
    } catch (error) {
      console.error('Failed to load config:', error)
    }
  }

  const loadPrompts = async () => {
    try {
      const data = await getPrompts()
      setPrompts(data)
      const active = data.find(p => p.is_active)
      if (active) {
        setSelectedPrompt(active)
      }
    } catch (error) {
      console.error('Failed to load prompts:', error)
      setMessage('Failed to load prompts')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!newPromptName.trim() || !newPromptTemplate.trim()) {
      setMessage('Name and template are required')
      return
    }
    setSaving(true)
    try {
      await createPrompt(newPromptName.trim(), newPromptTemplate.trim(), newPromptDescription.trim() || undefined)
      setShowCreateModal(false)
      setNewPromptName('')
      setNewPromptDescription('')
      setNewPromptTemplate('')
      await loadPrompts()
      setMessage('Prompt created successfully!')
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      setMessage('Failed to create prompt: ' + (error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleActivate = async (id: number) => {
    try {
      await activatePrompt(id)
      await loadPrompts()
      setMessage('Prompt activated!')
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      setMessage('Failed to activate prompt: ' + (error as Error).message)
    }
  }

  const handleModeToggle = async (mode: 'manual' | 'dynamic') => {
    setUpdatingMode(true)
    try {
      await updateConfig({ PROMPT_SELECTION_MODE: mode })
      setPromptMode(mode)
      setMessage(`Prompt selection mode set to: ${mode === 'manual' ? 'Manual (Active Prompt Only)' : 'Dynamic (AI Selection)'}`)
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      setMessage('Failed to update prompt mode: ' + (error as Error).message)
    } finally {
      setUpdatingMode(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this prompt?')) return
    try {
      await deletePrompt(id)
      await loadPrompts()
      setMessage('Prompt deleted')
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      setMessage('Failed to delete prompt: ' + (error as Error).message)
    }
  }

  const handleEdit = async () => {
    if (!selectedPrompt) return
    if (!newPromptName.trim() || !newPromptTemplate.trim()) {
      setMessage('Name and template are required')
      return
    }
    setSaving(true)
    try {
      await updatePromptArsenal(selectedPrompt.id, newPromptName.trim(), newPromptTemplate.trim(), newPromptDescription.trim() || undefined)
      setShowEditModal(false)
      await loadPrompts()
      setMessage('Prompt updated!')
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      setMessage('Failed to update prompt: ' + (error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const openEditModal = (prompt: PromptArsenal) => {
    setSelectedPrompt(prompt)
    setNewPromptName(prompt.name)
    setNewPromptDescription(prompt.description || '')
    setNewPromptTemplate(prompt.template)
    setShowEditModal(true)
  }

  const calculateReplyRate = (prompt: PromptArsenal) => {
    if (prompt.stats_bids === 0) return 0
    return ((prompt.stats_replies / prompt.stats_bids) * 100).toFixed(1)
  }

  const calculateWinRate = (prompt: PromptArsenal) => {
    if (prompt.stats_bids === 0) return 0
    return ((prompt.stats_won / prompt.stats_bids) * 100).toFixed(1)
  }

  if (loading) {
    return (
      <div className="card">
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
          Loading arsenal...
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 style={{ margin: 0 }}>PROMPT ARSENAL</h2>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Prompt Selection Mode Toggle */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.75rem',
              padding: '0.5rem 1rem',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '8px',
              border: '1px solid var(--border-glass)'
            }}>
              <span style={{ 
                fontSize: '0.875rem', 
                fontFamily: 'Rajdhani', 
                fontWeight: 600,
                color: 'var(--text-secondary)'
              }}>
                Mode:
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  className={`btn ${promptMode === 'manual' ? 'btn-primary' : ''}`}
                  onClick={() => handleModeToggle('manual')}
                  disabled={updatingMode || promptMode === 'manual'}
                  style={{ 
                    fontSize: '0.75rem',
                    padding: '0.4rem 0.8rem',
                    fontFamily: 'Orbitron',
                    fontWeight: 600,
                    opacity: promptMode === 'manual' ? 1 : 0.6,
                    cursor: updatingMode ? 'not-allowed' : 'pointer'
                  }}
                  title="Use only the active prompt for all bids"
                >
                  MANUAL
                </button>
                <button
                  className={`btn ${promptMode === 'dynamic' ? 'btn-primary' : ''}`}
                  onClick={() => handleModeToggle('dynamic')}
                  disabled={updatingMode || promptMode === 'dynamic'}
                  style={{ 
                    fontSize: '0.75rem',
                    padding: '0.4rem 0.8rem',
                    fontFamily: 'Orbitron',
                    fontWeight: 600,
                    opacity: promptMode === 'dynamic' ? 1 : 0.6,
                    cursor: updatingMode ? 'not-allowed' : 'pointer'
                  }}
                  title="AI intelligently selects the best prompt for each project"
                >
                  DYNAMIC
                </button>
              </div>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => {
                setNewPromptName('')
                setNewPromptTemplate('')
                setShowCreateModal(true)
              }}
              style={{ fontFamily: 'Orbitron', fontWeight: 700, letterSpacing: '0.1em' }}
            >
              + NEW PROMPT
            </button>
          </div>
        </div>

        {message && (
          <div
            style={{
              padding: '1rem',
              marginBottom: '1.5rem',
              borderRadius: '12px',
              background: message.includes('success') || message.includes('activated') || message.includes('updated')
                ? 'rgba(0, 255, 136, 0.1)'
                : 'rgba(255, 0, 102, 0.1)',
              border: `1px solid ${message.includes('success') || message.includes('activated') || message.includes('updated') ? 'var(--text-accent)' : '#ff0066'}`,
              color: message.includes('success') || message.includes('activated') || message.includes('updated') ? 'var(--text-accent)' : '#ff0066',
              fontFamily: 'Rajdhani',
              fontWeight: 600,
            }}
          >
            {message}
          </div>
        )}

        {prompts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <p style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>No prompts in arsenal</p>
            <p>Create your first prompt to get started</p>
          </div>
        ) : (
          <div className="arsenal-grid">
            {prompts.map((prompt) => {
              const replyRate = calculateReplyRate(prompt)
              const isActive = prompt.is_active

              return (
                <div
                  key={prompt.id}
                  className={`arsenal-card ${isActive ? 'active' : ''}`}
                  style={{
                    position: 'relative',
                    background: isActive
                      ? 'linear-gradient(135deg, rgba(0, 255, 136, 0.15) 0%, rgba(0, 255, 136, 0.05) 100%)'
                      : 'rgba(0, 0, 0, 0.4)',
                    border: isActive
                      ? '2px solid var(--text-accent)'
                      : '2px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    backdropFilter: 'blur(10px)',
                    transition: 'all 0.3s ease',
                    cursor: 'pointer',
                  }}
                  onClick={() => setSelectedPrompt(prompt)}
                >
                  {isActive && (
                    <div
                      className="active-badge"
                      style={{
                        position: 'absolute',
                        top: '0.5rem',
                        right: '0.5rem',
                        background: 'var(--text-accent)',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontFamily: 'Orbitron',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                      }}
                    >
                      ACTIVE
                    </div>
                  )}

                  <div style={{ marginBottom: '1rem' }}>
                    <h3
                      style={{
                        margin: 0,
                        fontFamily: 'Orbitron',
                        fontWeight: 700,
                        fontSize: '1.25rem',
                        color: 'var(--text-primary)',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {prompt.name}
                    </h3>
                    {prompt.description && (
                      <div
                        style={{
                          fontSize: '0.875rem',
                          color: 'var(--text-accent)',
                          fontFamily: 'Rajdhani',
                          marginTop: '0.5rem',
                          fontStyle: 'italic',
                        }}
                      >
                        {prompt.description}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        fontFamily: 'Share Tech Mono',
                        marginTop: '0.5rem',
                      }}
                    >
                      ID: {prompt.id} | Created: {new Date(prompt.created_at).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="arsenal-stats">
                    <div className="stat-item">
                      <div className="stat-label">BIDS</div>
                      <div className="stat-value">{prompt.stats_bids}</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-label">REPLIES</div>
                      <div className="stat-value" style={{ color: 'var(--text-accent)' }}>
                        {prompt.stats_replies}
                      </div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-label">REPLY RATE</div>
                      <div className="stat-value" style={{ color: parseFloat(String(replyRate)) >= 20 ? 'var(--text-accent)' : 'var(--text-secondary)' }}>
                        {replyRate}%
                      </div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-label">WON</div>
                      <div className="stat-value" style={{ color: prompt.stats_won > 0 ? 'var(--text-accent)' : 'var(--text-secondary)' }}>
                        {prompt.stats_won}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                    {!isActive && (
                      <button
                        className="btn btn-success"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleActivate(prompt.id)
                        }}
                        style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                      >
                        ACTIVATE
                      </button>
                    )}
                    <button
                      className="btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        openEditModal(prompt)
                      }}
                      style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                    >
                      EDIT
                    </button>
                    {!isActive && (
                      <button
                        className="btn btn-danger"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(prompt.id)
                        }}
                        style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                      >
                        DELETE
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowCreateModal(false)}>×</button>
            <h2>Create New Prompt</h2>
            <div className="input-group">
              <label>Prompt Name *</label>
              <input
                type="text"
                value={newPromptName}
                onChange={(e) => setNewPromptName(e.target.value)}
                placeholder="e.g., Aggressive Approach, Friendly Tone"
              />
            </div>
            <div className="input-group">
              <label>Short Description / Blurt</label>
              <input
                type="text"
                value={newPromptDescription}
                onChange={(e) => setNewPromptDescription(e.target.value)}
                placeholder="e.g., 'Quick and direct, focuses on results'"
              />
            </div>
            <div className="input-group">
              <label>Prompt Template *</label>
              <textarea
                value={newPromptTemplate}
                onChange={(e) => setNewPromptTemplate(e.target.value)}
                placeholder="Enter your prompt template..."
                style={{ minHeight: '300px', fontFamily: 'monospace' }}
              />
              <small style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', display: 'block' }}>
                Use placeholders: {'{project_title}'}, {'{full_description}'}, {'{budget_min}'}, {'{budget_max}'}, {'{skills_list}'}
              </small>
            </div>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
                {saving ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedPrompt && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowEditModal(false)}>×</button>
            <h2>Edit Prompt: {selectedPrompt.name}</h2>
            <div className="input-group">
              <label>Prompt Name *</label>
              <input
                type="text"
                value={newPromptName}
                onChange={(e) => setNewPromptName(e.target.value)}
              />
            </div>
            <div className="input-group">
              <label>Short Description / Blurt</label>
              <input
                type="text"
                value={newPromptDescription}
                onChange={(e) => setNewPromptDescription(e.target.value)}
                placeholder="e.g., 'Quick and direct, focuses on results'"
              />
            </div>
            <div className="input-group">
              <label>Prompt Template *</label>
              <textarea
                value={newPromptTemplate}
                onChange={(e) => setNewPromptTemplate(e.target.value)}
                style={{ minHeight: '300px', fontFamily: 'monospace' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleEdit} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default PromptsArsenal

