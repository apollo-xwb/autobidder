import { useState } from 'react'
import '../App.css'

export const SUB_AGENT_ROLES = [
  {
    id: 'idea',
    name: 'Idea Creator',
    description: 'Generates and validates app concepts, user stories, and feature ideas.',
    icon: '💡',
  },
  {
    id: 'developer',
    name: 'Developer',
    description: 'Builds the app: architecture, code, APIs, and deployment.',
    icon: '⚙️',
  },
  {
    id: 'pm',
    name: 'Product Manager',
    description: 'Prioritizes roadmap, defines specs, and keeps scope aligned.',
    icon: '📋',
  },
  {
    id: 'tester',
    name: 'Tester',
    description: 'Quality assurance, test plans, and regression checks.',
    icon: '🧪',
  },
  {
    id: 'marketer',
    name: 'Marketer',
    description: 'Positioning, copy, launch strategy, and growth hooks.',
    icon: '📢',
  },
] as const

interface AgentConnection {
  endpoint: string
  apiKey: string
  enabled: boolean
}

interface OrchestratorState {
  name: string
  endpoint: string
  apiKey: string
  enabled: boolean
}

function AgentsStudio() {
  const [orchestrator, setOrchestrator] = useState<OrchestratorState>({
    name: 'App Builder Orchestrator',
    endpoint: '',
    apiKey: '',
    enabled: true,
  })

  const [subAgents, setSubAgents] = useState<Record<string, AgentConnection>>(
    SUB_AGENT_ROLES.reduce(
      (acc, r) => ({
        ...acc,
        [r.id]: { endpoint: '', apiKey: '', enabled: true },
      }),
      {} as Record<string, AgentConnection>
    )
  )

  const updateSubAgent = (id: string, patch: Partial<AgentConnection>) => {
    setSubAgents((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }))
  }

  return (
    <div className="agents-studio">
      <div className="card agents-hero">
        <h2>Autonomous App Builder</h2>
        <p className="agents-tagline">
          One orchestrator agent with 4–5 sub-agents that autonomously create apps: from idea to build, test, and launch.
        </p>
        <div className="agents-pipeline-viz">
          <div className="pipeline-node pipeline-orchestrator">
            <span className="pipeline-label">Orchestrator</span>
          </div>
          <div className="pipeline-connector" />
          <div className="pipeline-nodes">
            {SUB_AGENT_ROLES.map((r) => (
              <div key={r.id} className="pipeline-node pipeline-sub">
                <span className="pipeline-label">{r.name.split(' ')[0]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card agents-plug-section">
        <h2>Orchestrator — plug in</h2>
        <p className="agents-hint">Configure the main agent that coordinates all sub-agents. Interface only; no live connection yet.</p>
        <div className="agent-plug-form">
          <div className="input-group">
            <label>Display name</label>
            <input
              type="text"
              value={orchestrator.name}
              onChange={(e) => setOrchestrator((o) => ({ ...o, name: e.target.value }))}
              placeholder="e.g. App Builder Orchestrator"
            />
          </div>
          <div className="input-group">
            <label>Endpoint URL</label>
            <input
              type="url"
              value={orchestrator.endpoint}
              onChange={(e) => setOrchestrator((o) => ({ ...o, endpoint: e.target.value }))}
              placeholder="https://api.example.com/orchestrator"
            />
          </div>
          <div className="input-group">
            <label>API Key</label>
            <input
              type="password"
              value={orchestrator.apiKey}
              onChange={(e) => setOrchestrator((o) => ({ ...o, apiKey: e.target.value }))}
              placeholder="••••••••••••••••"
              autoComplete="off"
            />
          </div>
          <div className="input-group input-group-row">
            <label className="toggle-label">Enabled</label>
            <button
              type="button"
              className={`btn btn-toggle ${orchestrator.enabled ? 'on' : ''}`}
              onClick={() => setOrchestrator((o) => ({ ...o, enabled: !o.enabled }))}
              aria-pressed={orchestrator.enabled}
            >
              <span className="btn-toggle-knob" />
            </button>
          </div>
        </div>
      </div>

      <h2 className="agents-section-title">Sub-agents — plug in</h2>
      <p className="agents-hint agents-hint-section">
        Configure each role. The orchestrator will delegate to these agents. Add endpoints and keys when you connect your backend.
      </p>
      <div className="subagents-grid">
        {SUB_AGENT_ROLES.map((role) => {
          const conn = subAgents[role.id]
          return (
            <div key={role.id} className="card agent-card">
              <div className="agent-card-header">
                <span className="agent-icon" aria-hidden>{role.icon}</span>
                <h3>{role.name}</h3>
                <p className="agent-desc">{role.description}</p>
              </div>
              <div className="agent-plug-form compact">
                <div className="input-group">
                  <label>Endpoint URL</label>
                  <input
                    type="url"
                    value={conn.endpoint}
                    onChange={(e) => updateSubAgent(role.id, { endpoint: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                <div className="input-group">
                  <label>API Key</label>
                  <input
                    type="password"
                    value={conn.apiKey}
                    onChange={(e) => updateSubAgent(role.id, { apiKey: e.target.value })}
                    placeholder="••••••••"
                    autoComplete="off"
                  />
                </div>
                <div className="input-group input-group-row">
                  <label className="toggle-label">Enabled</label>
                  <button
                    type="button"
                    className={`btn btn-toggle ${conn.enabled ? 'on' : ''}`}
                    onClick={() => updateSubAgent(role.id, { enabled: !conn.enabled })}
                    aria-pressed={conn.enabled}
                  >
                    <span className="btn-toggle-knob" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="card agents-footer">
        <h3>Ready to connect</h3>
        <p>
          Once your backend supports the orchestrator and sub-agents, use the same endpoint and API key fields above.
          This screen is the interface to plug in; wiring and persistence can be added next.
        </p>
      </div>
    </div>
  )
}

export default AgentsStudio
