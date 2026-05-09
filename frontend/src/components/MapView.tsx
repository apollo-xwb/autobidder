import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import axios from 'axios'
import { getConfig } from '../services/api'
import '../App.css'

const API_BASE_URL = '/api'

// Fix for default marker icons in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

interface MapProject {
  id: number
  title: string
  budget: {
    minimum?: number
    maximum?: number
  }
  currency_code: string
  skills: string[]
  location: {
    city: string
    country: string
    lat: number | null
    lon: number | null
  }
  bid_count: number
  time_submitted: number
}

function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const [projects, setProjects] = useState<MapProject[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProject, setSelectedProject] = useState<MapProject | null>(null)
  const markersRef = useRef<L.Marker[]>([])
  const [availableSkills, setAvailableSkills] = useState<string[]>([])
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [syncing, setSyncing] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [recencyFilter, setRecencyFilter] = useState<string>('all') // 'all', '1h', '24h', '7d', '30d'
  const [userSkills, setUserSkills] = useState<string[]>([])
  const [userSkillsLoaded, setUserSkillsLoaded] = useState(false)

  // Currency to approximate region mapping
  const currencyToRegion: { [key: string]: { lat: number; lon: number; spread: number } } = {
    'USD': { lat: 39.8283, lon: -98.5795, spread: 15 }, // USA
    'EUR': { lat: 50.1109, lon: 8.6821, spread: 20 }, // Europe
    'GBP': { lat: 51.5074, lon: -0.1278, spread: 5 }, // UK
    'AUD': { lat: -25.2744, lon: 133.7751, spread: 10 }, // Australia
    'CAD': { lat: 56.1304, lon: -106.3468, spread: 15 }, // Canada
    'INR': { lat: 20.5937, lon: 78.9629, spread: 10 }, // India
    'JPY': { lat: 36.2048, lon: 138.2529, spread: 5 }, // Japan
    'CNY': { lat: 35.8617, lon: 104.1954, spread: 15 }, // China
    'BRL': { lat: -14.2350, lon: -51.9253, spread: 15 }, // Brazil
    'MXN': { lat: 23.6345, lon: -102.5528, spread: 10 }, // Mexico
    'SGD': { lat: 1.3521, lon: 103.8198, spread: 2 }, // Singapore
    'HKD': { lat: 22.3193, lon: 114.1694, spread: 2 }, // Hong Kong
    'NZD': { lat: -40.9006, lon: 174.8860, spread: 5 }, // New Zealand
    'ZAR': { lat: -30.5595, lon: 22.9375, spread: 10 }, // South Africa
    'KRW': { lat: 35.9078, lon: 127.7669, spread: 5 }, // South Korea
    'TRY': { lat: 38.9637, lon: 35.2433, spread: 10 }, // Turkey
    'RUB': { lat: 61.5240, lon: 105.3188, spread: 20 }, // Russia
    'PLN': { lat: 51.9194, lon: 19.1451, spread: 5 }, // Poland
    'CHF': { lat: 46.8182, lon: 8.2275, spread: 5 }, // Switzerland
    'AED': { lat: 23.4241, lon: 53.8478, spread: 5 }, // UAE
    'SAR': { lat: 23.8859, lon: 45.0792, spread: 5 }, // Saudi Arabia
    'THB': { lat: 15.8700, lon: 100.9925, spread: 5 }, // Thailand
    'IDR': { lat: -0.7893, lon: 113.9213, spread: 10 }, // Indonesia
    'MYR': { lat: 4.2105, lon: 101.9758, spread: 5 }, // Malaysia
    'PHP': { lat: 12.8797, lon: 121.7740, spread: 5 }, // Philippines
    'VND': { lat: 14.0583, lon: 108.2772, spread: 5 }, // Vietnam
    'ILS': { lat: 31.0461, lon: 34.8516, spread: 2 }, // Israel
  }

  // Get location based on currency only (no geocoding)
  const getLocationFromCurrency = (currency?: string): { lat: number; lon: number } => {
    if (currency && currencyToRegion[currency]) {
      const region = currencyToRegion[currency]
      return {
        lat: region.lat + (Math.random() - 0.5) * region.spread,
        lon: region.lon + (Math.random() - 0.5) * region.spread,
      }
    }
    // Fallback: random location globally
    return {
      lat: 20 + (Math.random() - 0.5) * 40,
      lon: (Math.random() - 0.5) * 360,
    }
  }

  useEffect(() => {
    // Initialize map
    if (!mapContainer.current || map.current) return

    map.current = L.map(mapContainer.current, {
      center: [20, 0],
      zoom: 2,
      minZoom: 2, // Prevent zooming out too far (no white space)
      maxZoom: 18,
      zoomControl: false, // Remove zoom controls
      attributionControl: false, // Remove attribution (watermark)
      maxBounds: [[-85, -180], [85, 180]], // Prevent panning out of bounds
      maxBoundsViscosity: 1.0, // Strict bounds
    })

    // Use dark theme tile layer (CartoDB Dark Matter - free, no watermark)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '', // No attribution text
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map.current)

    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
      }
    }
  }, [])

  const loadProjects = async (additionalSkillsFilter?: string[]) => {
    try {
      setLoading(true)
      const params: any = {}
      
      // Always filter by user's configured skills
      const skillsToFilter = [...userSkills]
      
      // Add any additional skills from the filter UI
      if (additionalSkillsFilter && additionalSkillsFilter.length > 0) {
        additionalSkillsFilter.forEach(skill => {
          if (!skillsToFilter.includes(skill)) {
            skillsToFilter.push(skill)
          }
        })
      }
      
      // Require at least one skill to be configured
      if (userSkills.length === 0) {
        console.warn('No skills configured. Please configure your skills first.')
        setProjects([])
        setLoading(false)
        return
      }
      
      // Always send skills filter - this is required
      params.skills = skillsToFilter.join(',')
      
      const response = await axios.get(`${API_BASE_URL}/projects/map`, { params })
      if (response.data.success) {
        let projectsData = response.data.projects as MapProject[]
        
        // Frontend safety filter: Only show projects that match user's configured skills
        // This is a double-check to ensure no random projects slip through
        projectsData = projectsData.filter((project) => {
          const projectSkillsLower = project.skills.map(s => s.toLowerCase().trim())
          const userSkillsLower = userSkills.map(s => s.toLowerCase().trim())
          // Project must have at least one skill that matches user's skills
          return projectSkillsLower.some(ps => userSkillsLower.includes(ps))
        })
        
        // Apply recency filter
        if (recencyFilter !== 'all') {
          const now = Math.floor(Date.now() / 1000)
          const filterSeconds: { [key: string]: number } = {
            '1h': 3600,
            '24h': 86400,
            '7d': 604800,
            '30d': 2592000,
          }
          const cutoffTime = now - (filterSeconds[recencyFilter] || 0)
          projectsData = projectsData.filter((p) => p.time_submitted >= cutoffTime)
        }
        
        // Collect all unique skills
        const allSkills = new Set<string>()
        projectsData.forEach((p) => {
          p.skills.forEach((s) => allSkills.add(s))
        })
        setAvailableSkills(Array.from(allSkills).sort())
        
        // Assign locations based on currency only (no geocoding)
        const projectsWithLocations = projectsData.map((project) => {
          // Always use currency-based placement
          const coords = getLocationFromCurrency(project.currency_code)
          return {
            ...project,
            location: {
              ...project.location,
              lat: coords.lat,
              lon: coords.lon,
            }
          }
        })
        
        setProjects(projectsWithLocations)
      }
    } catch (error) {
      console.error('Failed to load projects:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Only load projects after user skills have been loaded
    // This ensures we always filter by user's configured skills
    if (userSkillsLoaded) {
      loadProjects(selectedSkills)
    }
  }, [selectedSkills, recencyFilter, userSkills, userSkillsLoaded])

  useEffect(() => {
    // Load user's skills for highlighting
    const loadUserSkills = async () => {
      try {
        const config = await getConfig()
        const skills = config.MY_SKILLS || []
        setUserSkills(skills)
        setUserSkillsLoaded(true)
      } catch (error) {
        console.error('Failed to load user skills:', error)
        // Even on error, mark as loaded so we can proceed (with empty skills)
        setUserSkillsLoaded(true)
      }
    }
    loadUserSkills()
  }, [])

  useEffect(() => {
    // Listen for filter toggle event from nav logo
    const handleToggleFilters = () => {
      setShowFilters(prev => !prev)
    }
    
    window.addEventListener('toggleMapFilters', handleToggleFilters)
    return () => {
      window.removeEventListener('toggleMapFilters', handleToggleFilters)
    }
  }, [])

  useEffect(() => {
    // Add markers to map
    if (!map.current || projects.length === 0) return

    // Clear existing markers
    markersRef.current.forEach((marker) => {
      map.current?.removeLayer(marker)
    })
    markersRef.current = []

    // Define different pin colors based on currency (white/grey/black with neon yellow border)
    const getPinStyle = (currency: string) => {
      const styles: { [key: string]: { bg: string } } = {
        'USD': { bg: '#ffffff' }, // White
        'EUR': { bg: '#cccccc' }, // Light grey
        'GBP': { bg: '#888888' }, // Medium grey
        'AUD': { bg: '#ffffff' }, // White
        'CAD': { bg: '#cccccc' }, // Light grey
        'INR': { bg: '#444444' }, // Dark grey
        'JPY': { bg: '#000000' }, // Black
        'CNY': { bg: '#888888' }, // Medium grey
        'BRL': { bg: '#ffffff' }, // White
        'MXN': { bg: '#cccccc' }, // Light grey
        'SGD': { bg: '#444444' }, // Dark grey
        'HKD': { bg: '#ffffff' }, // White
        'NZD': { bg: '#888888' }, // Medium grey
        'ZAR': { bg: '#cccccc' }, // Light grey
        'KRW': { bg: '#000000' }, // Black
        'TRY': { bg: '#444444' }, // Dark grey
        'RUB': { bg: '#888888' }, // Medium grey
        'PLN': { bg: '#ffffff' }, // White
        'CHF': { bg: '#cccccc' }, // Light grey
        'AED': { bg: '#444444' }, // Dark grey
        'SAR': { bg: '#888888' }, // Medium grey
        'THB': { bg: '#ffffff' }, // White
        'IDR': { bg: '#cccccc' }, // Light grey
        'MYR': { bg: '#000000' }, // Black
        'PHP': { bg: '#444444' }, // Dark grey
        'VND': { bg: '#888888' }, // Medium grey
        'ILS': { bg: '#ffffff' }, // White
      }
      
      return styles[currency] || { bg: '#ffffff' } // Default to white
    }

    const bounds = L.latLngBounds([])

    projects.forEach((project) => {
      if (!project.location.lat || !project.location.lon) return

      const pinStyle = getPinStyle(project.currency_code || 'USD')
      
      // Create custom pin icon (always circle) - white/grey/black with neon yellow border
      const customIcon = L.divIcon({
        className: 'custom-map-pin',
        html: `<div style="
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: ${pinStyle.bg};
          border: 3px solid #ffff00;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4), 0 0 12px rgba(255, 255, 0, 0.6);
          cursor: pointer;
          transition: transform 0.2s;
        "></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      })

      const marker = L.marker([project.location.lat!, project.location.lon!], {
        icon: customIcon,
      }).addTo(map.current!)

      marker.on('click', () => {
        setSelectedProject(project)
      })

      // Hover effect
      marker.on('mouseover', () => {
        const el = marker.getElement()
        if (el) {
          el.style.transform = 'scale(1.3)'
          el.style.transition = 'transform 0.2s'
        }
      })

      marker.on('mouseout', () => {
        const el = marker.getElement()
        if (el) {
          el.style.transform = 'scale(1)'
        }
      })

      markersRef.current.push(marker)
      bounds.extend([project.location.lat!, project.location.lon!])
    })

    // Fit map to show all markers
    if (markersRef.current.length > 0) {
      map.current.fitBounds(bounds, {
        padding: [50, 50],
        maxZoom: 10,
      })
    }
  }, [projects])

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString()
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      await loadProjects(selectedSkills)
    } finally {
      setSyncing(false)
    }
  }

  const toggleSkill = (skill: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    )
  }

  return (
    <>
      {/* Skills filter and sync button - hidden by default */}
      {showFilters && (
        <div
          style={{
            position: 'fixed',
            top: '140px', // Below toggle button
            left: '1rem',
            zIndex: 99998,
            background: 'rgba(0, 0, 0, 0.98)',
            border: '3px solid #ffff00',
            borderRadius: '12px',
            padding: '1rem',
            maxWidth: '300px',
            maxHeight: 'calc(100vh - 160px)',
            overflowY: 'auto',
            boxShadow: '0 4px 16px rgba(255, 255, 0, 0.5), 0 0 24px rgba(255, 255, 0, 0.4)',
            pointerEvents: 'auto',
          }}
        >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Filters</h4>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="btn btn-primary"
            style={{
              padding: '0.4rem 0.8rem',
              fontSize: '0.8rem',
              minWidth: '80px',
              zIndex: 10002,
            }}
          >
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
        
        {/* Recency filter */}
        <div style={{ marginBottom: '1rem' }}>
          <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: 'var(--text-primary)' }}>Posted Within</h5>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {[
              { value: 'all', label: 'All Time' },
              { value: '1h', label: 'Last Hour' },
              { value: '24h', label: 'Last 24h' },
              { value: '7d', label: 'Last 7 Days' },
              { value: '30d', label: 'Last 30 Days' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setRecencyFilter(option.value)}
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-glass)',
                  background: recencyFilter === option.value
                    ? 'linear-gradient(135deg, #00ff88, #00b3ff)'
                    : 'rgba(0, 0, 0, 0.4)',
                  color: recencyFilter === option.value ? '#000' : 'var(--text-primary)',
                  cursor: 'pointer',
                  fontWeight: recencyFilter === option.value ? 600 : 400,
                  transition: 'all 0.2s',
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        
        {/* Skills filter */}
        <div>
          <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: 'var(--text-primary)' }}>Skills</h5>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {availableSkills.map((skill) => (
            <button
              key={skill}
              onClick={() => toggleSkill(skill)}
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border-glass)',
                background: selectedSkills.includes(skill)
                  ? 'linear-gradient(135deg, #00ff88, #00b3ff)'
                  : 'rgba(0, 0, 0, 0.4)',
                color: selectedSkills.includes(skill) ? '#000' : 'var(--text-primary)',
                cursor: 'pointer',
                fontWeight: selectedSkills.includes(skill) ? 600 : 400,
                transition: 'all 0.2s',
              }}
            >
              {skill}
            </button>
          ))}
        </div>
        {selectedSkills.length > 0 && (
          <button
            onClick={() => setSelectedSkills([])}
            style={{
              marginTop: '0.75rem',
              padding: '0.4rem 0.8rem',
              fontSize: '0.75rem',
              background: 'rgba(255, 0, 102, 0.2)',
              border: '1px solid rgba(255, 0, 102, 0.5)',
              color: '#ff0066',
              borderRadius: '6px',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            Clear Filters
          </button>
        )}
        </div>
        </div>
      )}

      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', overflow: 'hidden', margin: 0, padding: 0, zIndex: 1 }}>
        <div ref={mapContainer} style={{ width: '100%', height: '100%', margin: 0, padding: 0, position: 'absolute', top: 0, left: 0 }} />
      
      {loading && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0, 0, 0, 0.9)',
            padding: '1.5rem 2rem',
            borderRadius: '12px',
            color: 'var(--text-primary)',
            zIndex: 1000,
            border: '1px solid var(--border-glass)',
            fontFamily: 'Orbitron',
          }}
        >
          Loading projects...
        </div>
      )}

      {!loading && projects.length === 0 && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0, 0, 0, 0.9)',
            padding: '1.5rem 2rem',
            borderRadius: '12px',
            color: 'var(--text-primary)',
            zIndex: 1000,
            textAlign: 'center',
            border: '1px solid var(--border-glass)',
          }}
        >
          No projects found{selectedSkills.length > 0 ? ' matching selected skills' : ''}
        </div>
      )}

      {selectedProject && (
        <div
          className="bid-message-modal"
          onClick={() => setSelectedProject(null)}
          style={{ zIndex: 2000 }}
        >
          <div className="bid-message-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-modal" onClick={() => setSelectedProject(null)}>
              ×
            </button>
            <h3>{selectedProject.title}</h3>
            <div style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
              <div><strong>Project ID:</strong> #{selectedProject.id}</div>
              <div>
                <strong>Budget:</strong>{' '}
                {selectedProject.budget.minimum
                  ? formatCurrency(selectedProject.budget.minimum, selectedProject.currency_code)
                  : 'Open'}
                {selectedProject.budget.maximum &&
                  selectedProject.budget.maximum !== selectedProject.budget.minimum &&
                  ` - ${formatCurrency(selectedProject.budget.maximum, selectedProject.currency_code)}`}
              </div>
              <div>
                <strong>Location:</strong>{' '}
                {[selectedProject.location.city, selectedProject.location.country]
                  .filter(Boolean)
                  .join(', ') || 'Unknown'}
              </div>
              <div>
                <strong>Skills:</strong>{' '}
                {selectedProject.skills.map((skill, index) => {
                  const isMatching = userSkills.some(us => us.toLowerCase() === skill.toLowerCase())
                  return (
                    <span key={index}>
                      {index > 0 && ', '}
                      <span style={{ color: isMatching ? '#ffff00' : 'var(--text-secondary)', fontWeight: isMatching ? 600 : 400 }}>
                        {skill}
                      </span>
                    </span>
                  )
                })}
              </div>
              <div>
                <strong>Bids:</strong> {selectedProject.bid_count}
              </div>
              <div>
                <strong>Posted:</strong> {formatDate(selectedProject.time_submitted)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                className="btn"
                onClick={() => setSelectedProject(null)}
                style={{ padding: '0.5rem 1.5rem', fontSize: '0.9rem' }}
              >
                Close
              </button>
              <a
                href={`https://www.freelancer.com/projects/${selectedProject.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                style={{ padding: '0.5rem 1.5rem', fontSize: '0.9rem', textDecoration: 'none' }}
              >
                View on Freelancer
              </a>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  )
}

export default MapView
