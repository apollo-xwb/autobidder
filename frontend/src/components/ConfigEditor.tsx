import { useEffect, useState } from 'react'
import { getConfig, updateConfig } from '../services/api'
import type { Config } from '../services/api'
import '../App.css'

function ConfigEditor() {
  const [config, setConfig] = useState<Config>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const data = await getConfig()
      setConfig(data)
    } catch (error) {
      console.error('Failed to load config:', error)
      setMessage('Failed to load config')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await updateConfig(config)
      setMessage('Config saved successfully!')
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      setMessage('Failed to save config: ' + (error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (key: keyof Config, value: string | number) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return <div className="card">Loading config...</div>
  }

  return (
    <div className="card">
      <h2>Configuration</h2>
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
        <label>OAuth Token</label>
        <input
          type="text"
          value={config.OAUTH_TOKEN || ''}
          onChange={(e) => handleChange('OAUTH_TOKEN', e.target.value)}
          placeholder="Freelancer OAuth Token"
        />
      </div>

      <div className="input-group">
        <label>Bidder ID</label>
        <input
          type="number"
          value={config.YOUR_BIDDER_ID || ''}
          onChange={(e) => handleChange('YOUR_BIDDER_ID', parseInt(e.target.value) || 0)}
          placeholder="Your Freelancer User ID"
        />
      </div>

      <div className="input-group">
        <label>Gemini API Key</label>
        <input
          type="text"
          value={config.GEMINI_API_KEY || ''}
          onChange={(e) => handleChange('GEMINI_API_KEY', e.target.value)}
          placeholder="Google Gemini API Key"
        />
      </div>

      <div className="input-group">
        <label>Telegram Token</label>
        <input
          type="text"
          value={config.TELEGRAM_TOKEN || ''}
          onChange={(e) => handleChange('TELEGRAM_TOKEN', e.target.value)}
          placeholder="Telegram Bot Token"
        />
      </div>

      <div className="input-group">
        <label>Telegram Chat ID</label>
        <input
          type="text"
          value={config.TELEGRAM_CHAT_ID || ''}
          onChange={(e) => handleChange('TELEGRAM_CHAT_ID', e.target.value)}
          placeholder="Telegram Chat ID"
        />
      </div>

      <div className="input-group">
        <label>Minimum Budget ($)</label>
        <input
          type="number"
          value={config.MIN_BUDGET || ''}
          onChange={(e) => handleChange('MIN_BUDGET', parseFloat(e.target.value) || 0)}
          placeholder="250"
        />
      </div>

      <div className="input-group">
        <label>Poll Interval (seconds)</label>
        <input
          type="number"
          value={config.POLL_INTERVAL || ''}
          onChange={(e) => handleChange('POLL_INTERVAL', parseInt(e.target.value) || 0)}
          placeholder="5"
        />
      </div>

      <div className="input-group">
        <label>Bid Amount Multiplier</label>
        <input
          type="number"
          step="0.01"
          value={config.BID_AMOUNT_MULTIPLIER || ''}
          onChange={(e) => handleChange('BID_AMOUNT_MULTIPLIER', parseFloat(e.target.value) || 0)}
          placeholder="1.05"
        />
      </div>

      <div className="input-group">
        <label>Default Delivery Days</label>
        <input
          type="number"
          value={config.DEFAULT_DELIVERY_DAYS || ''}
          onChange={(e) => handleChange('DEFAULT_DELIVERY_DAYS', parseInt(e.target.value) || 0)}
          placeholder="14"
        />
      </div>

      <button
        className="btn btn-primary"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Saving...' : 'Save Configuration'}
      </button>
    </div>
  )
}

export default ConfigEditor

