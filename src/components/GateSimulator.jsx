import { useEffect, useRef, useState } from 'react'
import { useCamera } from '../hooks/useCamera'
import { GateFlashReceiver, verifyResponse } from '../utils/gateFlashReceiver'
import { sendGateFlash } from '../utils/gateFlashSender'
import './GateSimulator.css'

function GateSimulator() {
  const { videoRef, isInitialized, error, hasPermission, initializeCamera, stopCamera } = useCamera()
  const canvasRef = useRef(null)
  const receiverRef = useRef(null)
  const flashCancelRef = useRef(null)
  
  const [isListening, setIsListening] = useState(false)
  const [challenge, setChallenge] = useState(null)
  const [receivedResponse, setReceivedResponse] = useState(null)
  const [isSending, setIsSending] = useState(false)
  const [accessResult, setAccessResult] = useState(null)
  const [statusMessage, setStatusMessage] = useState('Ready to test')
  const [brightness, setBrightness] = useState(0)

  /**
   * Initialize camera when component mounts
   */
  useEffect(() => {
    initializeCamera()
    return () => {
      stopCamera()
      if (flashCancelRef.current) {
        flashCancelRef.current()
      }
      if (receiverRef.current) {
        receiverRef.current.stop()
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Initialize receiver when camera is ready
   */
  useEffect(() => {
    if (isInitialized && videoRef.current && canvasRef.current) {
      receiverRef.current = new GateFlashReceiver(
        handleResponseReceived,
        handleReceiveError
      )
    }

    return () => {
      if (receiverRef.current) {
        receiverRef.current.stop()
      }
    }
  }, [isInitialized, videoRef, canvasRef])

  /**
   * Monitor brightness for visual feedback
   */
  useEffect(() => {
    if (!isInitialized || !videoRef.current || !canvasRef.current) return

    const interval = setInterval(() => {
      if (videoRef.current && canvasRef.current) {
        const { sampleCenterBrightness } = require('../utils/flashDecoder')
        const brightnessValue = sampleCenterBrightness(videoRef.current, canvasRef.current)
        setBrightness(Math.round(brightnessValue))
      }
    }, 100)

    return () => clearInterval(interval)
  }, [isInitialized])

  /**
   * Handle successfully received response
   * @param {number} responseValue - Received response value (0-255)
   */
  const handleResponseReceived = (responseValue) => {
    console.log('[GateSimulator] Response received:', responseValue)
    setReceivedResponse(responseValue)
    setIsListening(false)
    
    // Verify response
    if (challenge !== null) {
      const isValid = verifyResponse(challenge, responseValue)
      setAccessResult(isValid ? 'granted' : 'failed')
      setStatusMessage(isValid ? 'Access Granted ✓' : 'Access Denied ✗')
      
      if (isValid) {
        console.log('[GateSimulator] Response verified successfully!')
      } else {
        console.log('[GateSimulator] Response verification failed. Expected:', (challenge + 10) % 256, 'Received:', responseValue)
      }
    } else {
      setStatusMessage(`Response received: ${responseValue}`)
    }
  }

  /**
   * Handle receive error
   * @param {string} errorMessage - Error message
   */
  const handleReceiveError = (errorMessage) => {
    console.error('[GateSimulator] Receive error:', errorMessage)
    setStatusMessage(`Error: ${errorMessage}`)
    setIsListening(false)
    setAccessResult('failed')
  }

  /**
   * Send a challenge flash
   * @param {number} challengeValue - Challenge value to send (0-255)
   */
  const sendChallenge = (challengeValue) => {
    if (isSending) return

    setChallenge(challengeValue)
    setReceivedResponse(null)
    setAccessResult(null)
    setIsSending(true)
    setStatusMessage(`Sending challenge: ${challengeValue}`)

    flashCancelRef.current = sendGateFlash(
      challengeValue,
      () => {
        // Transmission complete
        console.log('[GateSimulator] Challenge sent successfully')
        setIsSending(false)
        setStatusMessage('Challenge sent. Waiting for response...')
        
        // Start listening for response
        startListening()
      },
      (progress) => {
        console.log('[GateSimulator] Sending progress:', progress)
      }
    )
  }

  /**
   * Start listening for phone's response
   */
  const startListening = () => {
    if (!isInitialized || !videoRef.current || !canvasRef.current || !receiverRef.current) {
      setStatusMessage('Camera not ready')
      return
    }

    setIsListening(true)
    setStatusMessage('Listening for phone response...')
    receiverRef.current.reset()
    receiverRef.current.start(videoRef.current, canvasRef.current)
  }

  /**
   * Stop listening
   */
  const stopListening = () => {
    if (receiverRef.current) {
      receiverRef.current.stop()
    }
    setIsListening(false)
    setStatusMessage('Stopped listening')
  }

  /**
   * Reset everything
   */
  const reset = () => {
    if (flashCancelRef.current) {
      flashCancelRef.current()
      flashCancelRef.current = null
    }
    if (receiverRef.current) {
      receiverRef.current.reset()
    }
    setChallenge(null)
    setReceivedResponse(null)
    setAccessResult(null)
    setIsSending(false)
    setIsListening(false)
    setStatusMessage('Ready to test')
  }

  /**
   * Handle retry camera initialization
   */
  const handleRetry = () => {
    initializeCamera()
  }

  // Generate random challenge
  const sendRandomChallenge = () => {
    const randomChallenge = Math.floor(Math.random() * 256)
    sendChallenge(randomChallenge)
  }

  return (
    <div className="gate-simulator">
      {/* Hidden video element for camera feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="video-feed"
      />
      
      {/* Hidden canvas for frame sampling */}
      <canvas ref={canvasRef} className="hidden-canvas" />

      {/* Main UI */}
      <div className="gate-ui-container">
        <div className="gate-header">
          <h1>Gate Simulator</h1>
          <p className="subtitle">Test the optical communication system</p>
        </div>

        {/* Status Section */}
        <div className="gate-status-section">
          <div className="status-message">{statusMessage}</div>
          
          {/* Brightness indicator */}
          {isInitialized && (
            <div className="brightness-indicator">
              <div className="brightness-label">Camera Brightness:</div>
              <div className="brightness-value">{brightness}</div>
              <div className="brightness-bar">
                <div 
                  className="brightness-fill" 
                  style={{ width: `${Math.min(100, (brightness / 255) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {challenge !== null && (
            <div className="info-item">
              <span className="info-label">Challenge Sent:</span>
              <span className="info-value">{challenge}</span>
            </div>
          )}
          
          {receivedResponse !== null && (
            <div className="info-item">
              <span className="info-label">Response Received:</span>
              <span className="info-value">{receivedResponse}</span>
            </div>
          )}

          {challenge !== null && receivedResponse !== null && (
            <div className="info-item">
              <span className="info-label">Expected Response:</span>
              <span className="info-value">{(challenge + 10) % 256}</span>
            </div>
          )}
          
          {accessResult && (
            <div className={`access-result ${accessResult}`}>
              {accessResult === 'granted' ? '✓ Access Granted' : '✗ Access Denied'}
            </div>
          )}
        </div>

        {/* Camera Status */}
        <div className="camera-status">
          {!hasPermission && error && (
            <div className="error-message">
              <p>{error}</p>
              <button onClick={handleRetry} className="retry-button">
                Retry Camera Access
              </button>
            </div>
          )}
          
          {hasPermission && !isInitialized && (
            <div className="loading-message">Initializing camera...</div>
          )}
          
          {isInitialized && (
            <div className="camera-ready">
              <div className="camera-indicator">●</div>
              <span>Camera Ready</span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="gate-controls">
          <div className="control-group">
            <h3>Send Challenge</h3>
            <div className="button-group">
              <button 
                onClick={() => sendChallenge(0)} 
                className="challenge-button"
                disabled={isSending || isListening}
              >
                Send 0
              </button>
              <button 
                onClick={() => sendChallenge(128)} 
                className="challenge-button"
                disabled={isSending || isListening}
              >
                Send 128
              </button>
              <button 
                onClick={() => sendChallenge(255)} 
                className="challenge-button"
                disabled={isSending || isListening}
              >
                Send 255
              </button>
              <button 
                onClick={sendRandomChallenge} 
                className="challenge-button random"
                disabled={isSending || isListening}
              >
                Random
              </button>
            </div>
          </div>

          <div className="control-group">
            <h3>Receive Response</h3>
            <div className="button-group">
              {!isListening ? (
                <button 
                  onClick={startListening} 
                  className="listen-button"
                  disabled={!isInitialized || isSending}
                >
                  Start Listening
                </button>
              ) : (
                <button 
                  onClick={stopListening} 
                  className="listen-button stop"
                >
                  Stop Listening
                </button>
              )}
            </div>
          </div>

          <div className="control-group">
            <button onClick={reset} className="reset-button">
              Reset All
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="instructions">
          <h3>Testing Instructions:</h3>
          <ol>
            <li>Point your laptop camera at the phone screen</li>
            <li>Click "Send Challenge" to send a test challenge</li>
            <li>The gate simulator will flash white/black on screen</li>
            <li>Phone should detect and respond automatically</li>
            <li>Click "Start Listening" to detect phone's response</li>
            <li>Response will be verified automatically</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

export default GateSimulator

