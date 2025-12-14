import React from 'react'
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'

// Component to track location changes inside Router
function LocationHandler({ onPathChange }: { onPathChange: (path: string) => void }) {
  const location = useLocation()
  React.useEffect(() => {
    onPathChange(location.pathname)
  }, [location.pathname, onPathChange])
  return null
}
import { ThemeProvider, useTheme } from './contexts/ThemeContext'
import Dashboard from './components/Dashboard'
import ConfigEditor from './components/ConfigEditor'
import PromptEditor from './components/PromptEditor'
import PromptsArsenal from './components/PromptsArsenal'
import SkillsManager from './components/SkillsManager'
import BidsList from './components/BidsList'
import PromptAnalytics from './components/PromptAnalytics'
import './App.css'

function AppContent() {
  const { toggleTheme } = useTheme()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false)
  const [showScrollTop, setShowScrollTop] = React.useState(false)
  const [mobileDashboardView, setMobileDashboardView] = React.useState<'stats' | 'console'>('stats')
  const [isMobile, setIsMobile] = React.useState(false)
  
  // Get current pathname - will be updated inside Router
  const [currentPath, setCurrentPath] = React.useState(window.location.pathname)
  const isHomePage = currentPath === '/'

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Reset to stats view when navigating away from home
  React.useEffect(() => {
    if (!isHomePage) {
      setMobileDashboardView('stats')
    }
  }, [isHomePage])

  React.useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop
      setShowScrollTop(scrollY > 300) // Show after scrolling 300px
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleNavEdgeTouch = (side: 'left' | 'right') => {
    // Only handle on mobile, on home page
    if (isMobile && isHomePage) {
      if (side === 'left') {
        // Left edge -> Go to stats
        setMobileDashboardView('stats')
        console.log('✅ Left edge tapped - showing stats')
      } else {
        // Right edge -> Go to console
        setMobileDashboardView('console')
        console.log('✅ Right edge tapped - showing console')
      }
      // Haptic feedback
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(30)
      }
      return true
    }
    return false
  }


  const handleLogoClick = () => {
    // Logo always toggles theme
    toggleTheme()
    // Haptic feedback for devices that support it
    if (window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(50) // Vibrate for 50ms
    }
  }

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen)
  }

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    // Haptic feedback
    if (window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(30)
    }
  }

  return (
    <Router>
      <LocationHandler onPathChange={setCurrentPath} />
      <div className={`app ${isMobileMenuOpen ? 'menu-open' : ''}`}>
        {isMobileMenuOpen && <div className="menu-backdrop" onClick={toggleMobileMenu} />}
        <nav className="navbar">
          {/* Invisible touch areas on edges (mobile only, home page only) */}
          {isMobile && isHomePage && (
            <>
              <div 
                className="nav-edge-touch-area nav-edge-left"
                onTouchEnd={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleNavEdgeTouch('left')
                }}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleNavEdgeTouch('left')
                }}
              />
              <div 
                className="nav-edge-touch-area nav-edge-right"
                onTouchEnd={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleNavEdgeTouch('right')
                }}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleNavEdgeTouch('right')
                }}
              />
            </>
          )}
          <div className="nav-container">
            <div className="nav-title">
              <img 
                src="/voel.png" 
                alt="Autobidder" 
                className="nav-logo" 
                onClick={handleLogoClick}
                style={{ cursor: 'pointer', userSelect: 'none' }}
                title="Click to toggle light/dark mode"
              />
              <img 
                src="/landing.png" 
                alt="Menu" 
                className="nav-landing-toggle" 
                onClick={toggleMobileMenu}
                style={{ cursor: 'pointer', userSelect: 'none' }}
                title="Toggle menu"
              />
            </div>
            <div className={`nav-links ${isMobileMenuOpen ? 'nav-links-open' : ''}`}>
              <Link to="/" onClick={() => setIsMobileMenuOpen(false)}>Dashboard</Link>
              <Link to="/bids" onClick={() => setIsMobileMenuOpen(false)}>Bids</Link>
              <Link to="/arsenal" onClick={() => setIsMobileMenuOpen(false)}>Arsenal</Link>
              <Link to="/analytics" onClick={() => setIsMobileMenuOpen(false)}>Analytics</Link>
              <Link to="/config" onClick={() => setIsMobileMenuOpen(false)}>Config</Link>
              <Link to="/prompt" onClick={() => setIsMobileMenuOpen(false)}>Prompt</Link>
              <Link to="/skills" onClick={() => setIsMobileMenuOpen(false)}>Skills</Link>
            </div>
          </div>
          <div className="binary-bar">
            <div className="binary-content">
              {(() => {
                const binaryText = "01010100 01101000 01100101 00100000 01100110 01110101 01110100 01110101 01110010 01100101 00100000 01101001 01110011 00100000 01101110 01101111 01110100 00100000 01110011 01101111 01101101 01100101 00100000 01110000 01101100 01100001 01100011 01100101 00100000 01110111 01100101 00100000 01100001 01110010 01100101 00100000 01100111 01101111 01101001 01101110 01100111 00101100 00100000 01100010 01110101 01110100 00100000 01101111 01101110 01100101 00100000 01110111 01100101 00100000 01100001 01110010 01100101 00100000 01100011 01110010 01100101 01100001 01110100 01101001 01101110 01100111 00101110 00100000 01010100 01101000 01100101 00100000 01110000 01100001 01110100 01101000 01110011 00100000 01100001 01110010 01100101 00100000 01101110 01101111 01110100 00100000 01110100 01101111 00100000 01100010 01100101 00100000 01100110 01101111 01110101 01101110 01100100 00101100 00100000 01100010 01110101 01110100 00100000 01101101 01100001 01100100 01100101 00101110 00100000 01000001 01101110 01100100 00100000 01110100 01101000 01100101 00100000 01100001 01100011 01110100 01101001 01110110 01101001 01110100 01111001 00100000 01101111 01100110 00100000 01101101 01100001 01101011 01101001 01101110 01100111 00100000 01110100 01101000 01100101 01101101 00100000 01100011 01101000 01100001 01101110 01100111 01100101 01110011 00100000 01100010 01101111 01110100 01101000 00100000 01110100 01101000 01100101 00100000 01101101 01100001 01101011 01100101 01110010 00100000 01100001 01101110 01100100 00100000 01110100 01101000 01100101 00100000 01100100 01100101 01110011 01110100 01101001 01101110 01100001 01110100 01101001 01101111 01101110 00101110 00100000 01010100 01101000 01100101 00100000 01100110 01110101 01110100 01110101 01110010 01100101 00100000 01101001 01110011 00100000 01101110 01101111 01110100 00100000 01110011 01101111 01101101 01100101 00100000 01110000 01101100 01100001 01100011 01100101 00100000 01110111 01100101 00100000 01100001 01110010 01100101 00100000 01100111 01101111 01101001 01101110 01100111 00101100 00100000 01100010 01110101 01110100 00100000 01101111 01101110 01100101 00100000 01110111 01100101 00100000 01100001 01110010 01100101 00100000 01100011 01110010 01100101 01100001 01110100 01101001 01101110 01100111 00101110 00100000 01010100 01101000 01100101 00100000 01110000 01100001 01110100 01101000 01110011 00100000 01100001 01110010 01100101 00100000 01101110 01101111 01110100 00100000 01110100 01101111 00100000 01100010 01100101 00100000 01100110 01101111 01110101 01101110 01100100 00101100 00100000 01100010 01110101 01110100 00100000 01101101 01100001 01100100 01100101 00101110 00100000 01000001 01101110 01100100 00100000 01110100 01101000 01100101 00100000 01100001 01100011 01110100 01101001 01110110 01101001 01110100 01111001 00100000 01101111 01100110 00100000 01101101 01100001 01101011 01101001 01101110 01100111 00100000 01110100 01101000 01100101 01101101 00100000 01100011 01101000 01100001 01101110 01100111 01100101 01110011 00100000 01100010 01101111 01110100 01101000 00100000 01110100 01101000 01100101 00100000 01101101 01100001 01101011 01100101 01110010 00100000 01100001 01101110 01100100 00100000 01110100 01101000 01100101 00100000 01100100 01100101 01110011 01110100 01101001 01101110 01100001 01110100 01101001 01101111 01101110 00101110 00100000"
                const lastChar = binaryText[binaryText.length - 1]
                const beforeLast = binaryText.slice(0, -1)
                return (
                  <>
                    {beforeLast}
                    <span className="binary-last-char">{lastChar}</span>
                  </>
                )
              })()}
            </div>
          </div>
        </nav>
        
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard mobileView={mobileDashboardView} />} />
            <Route path="/bids" element={<BidsList />} />
            <Route path="/arsenal" element={<PromptsArsenal />} />
            <Route path="/analytics" element={<PromptAnalytics />} />
            <Route path="/config" element={<ConfigEditor />} />
            <Route path="/prompt" element={<PromptEditor />} />
            <Route path="/skills" element={<SkillsManager />} />
          </Routes>
        </main>

        {showScrollTop && (
          <button
            className="scroll-to-top"
            onClick={scrollToTop}
            aria-label="Scroll to top"
          >
            ↑
          </button>
        )}
      </div>
    </Router>
  )
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  )
}

export default App

