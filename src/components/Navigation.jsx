import { Link, useLocation } from 'react-router-dom'
import './Navigation.css'

function Navigation() {
  const location = useLocation()
  const isPhoneApp = location.pathname === '/' || location.pathname === '/phone'
  const isGateSimulator = location.pathname === '/gate'

  return (
    <nav className="main-navigation">
      <Link 
        to="/phone" 
        className={`nav-link ${isPhoneApp ? 'active' : ''}`}
      >
        Phone App
      </Link>
      <Link 
        to="/gate" 
        className={`nav-link ${isGateSimulator ? 'active' : ''}`}
      >
        Gate Simulator
      </Link>
    </nav>
  )
}

export default Navigation

