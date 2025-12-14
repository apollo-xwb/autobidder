import { useEffect, useState } from 'react'
import { getConfig, updateConfig } from '../services/api'
import type { Config } from '../services/api'
import '../App.css'

function SkillsManager() {
  const [skills, setSkills] = useState<string[]>([])
  const [newSkill, setNewSkill] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    loadSkills()
  }, [])

  const loadSkills = async () => {
    try {
      const config = await getConfig()
      setSkills(config.MY_SKILLS || [])
    } catch (error) {
      console.error('Failed to load skills:', error)
      setMessage('Failed to load skills')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await updateConfig({ MY_SKILLS: skills })
      setMessage('Skills saved successfully!')
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      setMessage('Failed to save skills: ' + (error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleAddSkill = () => {
    if (newSkill.trim() && !skills.includes(newSkill.trim())) {
      setSkills([...skills, newSkill.trim()])
      setNewSkill('')
    }
  }

  const handleRemoveSkill = (skillToRemove: string) => {
    setSkills(skills.filter((skill) => skill !== skillToRemove))
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddSkill()
    }
  }

  if (loading) {
    return <div className="card">Loading skills...</div>
  }

  return (
    <div className="card">
      <h2>Skills Management</h2>
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
        <label>Add New Skill</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={newSkill}
            onChange={(e) => setNewSkill(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Enter skill name..."
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={handleAddSkill}>
            Add
          </button>
        </div>
      </div>

      <div className="input-group">
        <label>Your Skills ({skills.length})</label>
        {skills.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>No skills added yet.</p>
        ) : (
          <div className="skills-grid">
            {skills.map((skill) => (
              <div key={skill} className="skill-tag">
                {skill}
                <button onClick={() => handleRemoveSkill(skill)}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        className="btn btn-primary"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Saving...' : 'Save Skills'}
      </button>
    </div>
  )
}

export default SkillsManager

