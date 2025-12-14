import { useEffect, useState } from 'react'
import { getPrompt, updatePrompt } from '../services/api'
import '../App.css'

function PromptEditor() {
  const [prompt, setPrompt] = useState('')
  const [promptName, setPromptName] = useState('')
  const [promptDescription, setPromptDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    loadPrompt()
  }, [])

  const loadPrompt = async () => {
    try {
      const data = await getPrompt()
      setPrompt(data.prompt || data.template)
      setPromptName(data.name || '')
      setPromptDescription(data.description || '')
    } catch (error) {
      console.error('Failed to load prompt:', error)
      setMessage('Failed to load prompt')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await updatePrompt(prompt, promptName.trim() || undefined, promptDescription.trim() || undefined)
      setMessage('Prompt saved successfully!')
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      setMessage('Failed to save prompt: ' + (error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="card">Loading prompt...</div>
  }

  return (
    <div className="card">
      <h2>Prompt Template</h2>
      {message && (
        <div
          style={{
            padding: '1rem',
            marginBottom: '1.5rem',
            borderRadius: '12px',
            background: message.includes('success')
              ? 'rgba(0, 255, 136, 0.1)'
              : 'rgba(255, 0, 102, 0.1)',
            border: `1px solid ${message.includes('success') ? 'var(--text-accent)' : '#ff0066'}`,
            color: message.includes('success') ? 'var(--text-accent)' : '#ff0066',
            fontFamily: 'Rajdhani',
            fontWeight: 600,
          }}
        >
          {message}
        </div>
      )}

      <div className="input-group">
        <label>Prompt Name (Recommended)</label>
        <input
          type="text"
          value={promptName}
          onChange={(e) => setPromptName(e.target.value)}
          placeholder="e.g., 'Aggressive Approach', 'Friendly Tone', 'v2.1'"
          style={{ marginBottom: '1.5rem' }}
        />
        <small style={{ color: 'var(--text-secondary)', marginTop: '-1rem', marginBottom: '1rem', display: 'block' }}>
          Give this prompt version a name to easily track its performance in analytics. If left empty, it will be identified by hash.
        </small>
      </div>

      <div className="input-group">
        <label>Short Description / Blurt</label>
        <input
          type="text"
          value={promptDescription}
          onChange={(e) => setPromptDescription(e.target.value)}
          placeholder="e.g., 'Quick and direct, focuses on results', 'Warm and friendly approach', 'Technical deep-dive style'"
          style={{ marginBottom: '1.5rem' }}
        />
        <small style={{ color: 'var(--text-secondary)', marginTop: '-1rem', marginBottom: '1rem', display: 'block' }}>
          A quick reminder of what makes this prompt unique or when to use it.
        </small>
      </div>

      <div className="input-group">
        <label>Prompt Template</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter your prompt template here..."
          style={{ minHeight: '400px', fontFamily: 'monospace' }}
        />
        <small style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', display: 'block' }}>
          Use placeholders like {'{project_title}'}, {'{full_description}'}, {'{budget_min}'}, {'{budget_max}'}, {'{skills_list}'}
        </small>
      </div>

      <button
        className="btn btn-primary"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Saving...' : 'Save Prompt'}
      </button>
    </div>
  )
}

export default PromptEditor

