import { useEffect, useState } from 'react'
import { getAutobidderStatus, startAutobidder, stopAutobidder } from '../services/api'
import type { AutobidderStatus } from '../services/api'
import '../App.css'

function AutobidderControls() {
  // Initialize with a default state that assumes it might be running
  // This prevents showing "Stopped" when it's actually running
  const [status, setStatus] = useState<AutobidderStatus | null>({ running: false, message: 'Checking...' })
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [isPaused, setIsPaused] = useState(false) // Track if user has paused

  useEffect(() => {
    // Load status immediately on mount (synchronously if possible)
    const checkStatus = async () => {
      await loadStatus()
    }
    checkStatus()
    // Then check periodically
    const interval = setInterval(loadStatus, 2000) // Check every 2 seconds
    return () => clearInterval(interval)
  }, [])

  const loadStatus = async () => {
    try {
      const data = await getAutobidderStatus()
      setStatus(data)
      // If status shows stopped and we were paused, clear paused state
      if (!data.running && isPaused) {
        setIsPaused(false)
      }
    } catch (error) {
      console.error('Failed to load status:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStart = async () => {
    setActionLoading(true)
    setIsPaused(false) // Clear paused state when starting
    try {
      await startAutobidder()
      await loadStatus()
    } catch (error) {
      alert('Failed to start autobidder: ' + (error as Error).message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleStop = async () => {
    console.log('Pause button clicked')
    setActionLoading(true)
    setIsPaused(true) // Optimistically set paused state
    // Immediately update UI to show paused
    setStatus({ running: false, message: 'Paused' })
    try {
      console.log('Calling stopAutobidder...')
      await stopAutobidder()
      console.log('stopAutobidder completed successfully')
      // Always reload status after stop attempt
      // Give it a moment for the server to process
      setTimeout(() => {
        console.log('Reloading status...')
        loadStatus()
      }, 1000) // Increased delay to give process time to stop
    } catch (error: any) {
      console.error('Stop error:', error)
      // Even on error, reload status - the endpoint should have marked it as stopped
      loadStatus()
      // Only show alert if it's a real error (not just a 500 with success: true)
      if (error.response?.data?.success !== true) {
        console.error('Showing error alert')
        alert('Failed to stop autobidder: ' + (error?.message || 'Unknown error'))
      } else {
        console.log('Error had success: true, not showing alert')
      }
    } finally {
      console.log('Setting actionLoading to false')
      setActionLoading(false)
    }
  }

  if (loading || !status) {
    return (
      <div style={{ color: 'var(--text-secondary)' }}>Loading status...</div>
    )
  }

  // Determine display state: if paused, show paused; otherwise use actual status
  const displayRunning = status.running && !isPaused
  const displayMessage = isPaused ? 'Paused' : status.message

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
      <div className={`status-indicator ${displayRunning ? 'running' : 'stopped'}`}>
        <span className="status-dot"></span>
        {displayMessage}
      </div>
      {displayRunning ? (
        <button
          className="btn btn-danger"
          onClick={handleStop}
          disabled={actionLoading}
        >
          {actionLoading ? 'Stopping...' : 'Pause Bot'}
        </button>
      ) : (
        <button
          className="btn btn-success"
          onClick={handleStart}
          disabled={actionLoading}
        >
          {actionLoading ? 'Starting...' : isPaused ? 'PAUSED BOT' : 'Start Autobidder'}
        </button>
      )}
    </div>
  )
}

export default AutobidderControls
