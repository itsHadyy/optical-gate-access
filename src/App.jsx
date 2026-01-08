import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import PhoneApp from './components/PhoneApp'
import GateSimulator from './components/GateSimulator'
import Navigation from './components/Navigation'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <div className="app-router">
        <Navigation />
        <Routes>
          <Route path="/" element={<Navigate to="/phone" replace />} />
          <Route path="/phone" element={<PhoneApp />} />
          <Route path="/gate" element={<GateSimulator />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App

