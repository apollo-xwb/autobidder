import { useEffect, useState, useRef, useCallback } from 'react'
import { getLogs, getAutobidderStatus } from '../services/api'
import type { AutobidderStatus } from '../services/api'
import '../App.css'

function LogsViewer() {
  const [logs, setLogs] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const [botRunning, setBotRunning] = useState<boolean>(false)
  const lastLogCountRef = useRef<number>(0)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const logsContainerRef = useRef<HTMLDivElement>(null)
  const userScrolledRef = useRef(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const loadLogs = useCallback(async () => {
    try {
      const data = await getLogs(500)
      // If bot is stopped, only update if log count changed (to avoid unnecessary re-renders)
      if (!botRunning) {
        // When stopped, only update if log count changed
        if (data.logs.length !== lastLogCountRef.current) {
          setLogs(data.logs)
          lastLogCountRef.current = data.logs.length
        }
      } else {
        // When running, always update to show new logs
        setLogs(data.logs)
        lastLogCountRef.current = data.logs.length
      }
    } catch (error) {
      console.error('Failed to load logs:', error)
    } finally {
      setLoading(false)
    }
  }, [botRunning])

  // Check bot status periodically
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status: AutobidderStatus = await getAutobidderStatus()
        setBotRunning(status.running)
      } catch (error) {
        console.error('Failed to check bot status:', error)
      }
    }
    
    checkStatus()
    const statusInterval = setInterval(checkStatus, 2000) // Check every 2 seconds
    return () => clearInterval(statusInterval)
  }, [])

  useEffect(() => {
    loadLogs()
    // Only fetch logs frequently if bot is running
    // If bot is stopped, check less frequently (every 5 seconds) to see if there are new logs
    const interval = setInterval(() => {
      loadLogs()
    }, botRunning ? 1000 : 5000) // 1 second when running, 5 seconds when stopped
    
    return () => {
      clearInterval(interval)
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [botRunning, loadLogs])

  useEffect(() => {
    // Only auto-scroll if user hasn't manually scrolled up
    if (autoScroll && !userScrolledRef.current && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  const handleScroll = () => {
    if (logsContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 50
      
      // If user scrolled away from bottom, mark as user-scrolled
      if (!isNearBottom) {
        userScrolledRef.current = true
        setAutoScroll(false)
        
        // Clear any existing timeout
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current)
        }
      } else {
        // User is near bottom - reset the flag after a short delay
        // This prevents auto-scroll from re-enabling immediately
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current)
        }
        scrollTimeoutRef.current = setTimeout(() => {
          userScrolledRef.current = false
          if (autoScroll) {
            setAutoScroll(true)
          }
        }, 500)
      }
    }
  }

  const isImportantLine = (logLine: string): boolean => {
    const importantKeywords = [
      'BID SUCCESS',
      'MATCHING PROJECT',
      'AUTOBIDDER STARTED',
      'AUTOBIDDER STOPPED',
      'FATAL ERROR',
      'BID PLACED',
      'Attempting to bid',
      'BID FAILED',
      'ERROR',
      'WARNING'
    ]
    return importantKeywords.some(keyword => logLine.includes(keyword))
  }

  if (loading && logs.length === 0) {
    return (
      <div className="card">
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
          Loading logs...
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h2>Live Logs</h2>
          {!botRunning && (
            <span
              style={{
                padding: '0.25rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                background: 'rgba(255, 165, 0, 0.2)',
                border: '1px solid rgba(255, 165, 0, 0.5)',
                color: '#ffa500',
              }}
            >
              PAUSED
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Auto-scroll
          </label>
          <button
            className="btn"
            onClick={() => {
              userScrolledRef.current = false
              setAutoScroll(true)
              logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
            }}
            style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
          >
            Scroll to Bottom
          </button>
        </div>
      </div>
      <div
        ref={logsContainerRef}
        onScroll={handleScroll}
        className="logs-container"
        style={{
          background: 'rgba(0, 0, 0, 0.5)',
          border: '1px solid var(--border-glass)',
          borderRadius: '12px',
          padding: '1.5rem',
          maxHeight: '600px',
          overflowY: 'auto',
          fontFamily: 'Share Tech Mono, monospace',
          fontSize: '0.875rem',
          lineHeight: '1.6',
          color: 'var(--text-primary)',
        }}
      >
        {logs.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
            No logs yet. Start the autobidder to see activity.
          </div>
        ) : (
          logs.map((log, index) => {
            const isImportant = isImportantLine(log)
            return (
              <div
                key={index}
                style={{
                  padding: '0.25rem 0',
                  borderBottom: index < logs.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
                  wordBreak: 'break-word',
                  color: isImportant ? '#bf00ff' : 'var(--text-primary)',
                  textShadow: isImportant ? '0 0 10px #bf00ff, 0 0 20px #bf00ff' : 'none',
                  fontWeight: isImportant ? 600 : 'normal',
                }}
              >
                {log}
              </div>
            )
          })
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  )
}

export default LogsViewer

