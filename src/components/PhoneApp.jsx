import { useEffect, useRef, useState } from 'react'
import { useCamera } from '../hooks/useCamera'
import { FlashDecoder, TIMING_CONFIG } from '../utils/flashDecoder'
import { flashScreenRAF } from '../utils/screenFlasher'
import './PhoneApp.css'

// Protocol states
const STATES = {
  IDLE: 'IDLE',
  DETECT_START: 'DETECT_START',
  READ_BITS: 'READ_BITS',
  COMPUTE: 'COMPUTE',
  TRANSMIT: 'TRANSMIT',
  DONE: 'DONE'
}

// Status messages
const STATUS_MESSAGES = {
  [STATES.IDLE]: 'Initializing...',
  [STATES.DETECT_START]: 'Listening for gate signal',
  [STATES.READ_BITS]: 'Receiving challenge...',
  [STATES.COMPUTE]: 'Challenge received',
  [STATES.TRANSMIT]: 'Sending response',
  [STATES.DONE]: 'Access granted'
}

function App() {
  const { videoRef, isInitialized, error, hasPermission, initializeCamera, stopCamera } = useCamera()
  const canvasRef = useRef(null)
  const decoderRef = useRef(null)
  const flashCancelRef = useRef(null)
  const countdownIntervalRef = useRef(null)
  
  const [state, setState] = useState(STATES.IDLE)
  const [statusMessage, setStatusMessage] = useState(STATUS_MESSAGES[STATES.IDLE])
  const [challenge, setChallenge] = useState(null)
  const [response, setResponse] = useState(null)
  const [accessResult, setAccessResult] = useState(null)
  const [countdown, setCountdown] = useState(null)
  const [instructionMessage, setInstructionMessage] = useState(null)

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
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
        countdownIntervalRef.current = null
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Initialize decoder when camera is ready
   */
  useEffect(() => {
    if (isInitialized && videoRef.current && canvasRef.current) {
      // Create decoder instance
      decoderRef.current = new FlashDecoder(
        handleChallengeDecoded,
        handleDecodeError
      )
      
      // Start listening for gate signal
      setState(STATES.DETECT_START)
      setStatusMessage(STATUS_MESSAGES[STATES.DETECT_START])
      decoderRef.current.start(videoRef.current, canvasRef.current)
    }

    return () => {
      if (decoderRef.current) {
        decoderRef.current.stop()
      }
    }
  }, [isInitialized, videoRef, canvasRef])

  /**
   * Handle successfully decoded challenge
   * @param {number} challengeValue - Decoded challenge value (0-255)
   */
  const handleChallengeDecoded = (challengeValue) => {
    console.log('[App] Challenge decoded:', challengeValue)
    setChallenge(challengeValue)
    setState(STATES.COMPUTE)
    setStatusMessage('Challenge received!')
    setInstructionMessage('Preparing to send response...')
    
    // Compute response: (challenge + 10) % 256
    const responseValue = (challengeValue + 10) % 256
    setResponse(responseValue)
    console.log('[App] Computed response:', responseValue)
    
    // Start countdown before transmitting
    const delayMs = TIMING_CONFIG.RESPONSE_DELAY
    const countdownInterval = 100 // Update every 100ms for smooth countdown
    let remainingTime = delayMs
    
    setCountdown(Math.ceil(remainingTime / 1000))
    setInstructionMessage(`Please point your phone screen at the gate. Response will be sent in ${Math.ceil(remainingTime / 1000)} seconds...`)
    
    countdownIntervalRef.current = setInterval(() => {
      remainingTime -= countdownInterval
      const secondsRemaining = Math.ceil(remainingTime / 1000)
      setCountdown(secondsRemaining)
      
      if (secondsRemaining > 0) {
        setInstructionMessage(`Please point your phone screen at the gate. Response will be sent in ${secondsRemaining} second${secondsRemaining !== 1 ? 's' : ''}...`)
      } else {
        setInstructionMessage('Sending response now! Keep screen pointed at gate.')
      }
      
      if (remainingTime <= 0) {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current)
          countdownIntervalRef.current = null
        }
        setCountdown(null)
        transmitResponse(responseValue)
      }
    }, countdownInterval)
  }

  /**
   * Handle decode error
   * @param {string} errorMessage - Error message
   */
  const handleDecodeError = (errorMessage) => {
    console.error('[App] Decode error:', errorMessage)
    setStatusMessage(`Error: ${errorMessage}`)
    setAccessResult('failed')
    
    // Reset after delay
    setTimeout(() => {
      reset()
    }, 3000)
  }

  /**
   * Transmit response by flashing screen
   * @param {number} responseValue - Response value to send (0-255)
   */
  const transmitResponse = (responseValue) => {
    setState(STATES.TRANSMIT)
    setStatusMessage('Sending response...')
    setInstructionMessage('Screen will flash now. Keep phone steady and pointed at gate!')
    setCountdown(null)
    
    // Flash screen with response
    flashCancelRef.current = flashScreenRAF(
      responseValue,
      () => {
        // Transmission complete
        console.log('[App] Response transmitted successfully')
        setState(STATES.DONE)
        setStatusMessage('Response sent successfully!')
        setInstructionMessage('Waiting for gate to verify...')
        setAccessResult('granted')
        
        // Reset after delay to wait for new challenge
        setTimeout(() => {
          reset()
        }, 3000)
      },
      (progress) => {
        // Optional: update progress during transmission
        console.log('[App] Transmission progress:', progress)
      }
    )
  }

  /**
   * Reset to initial state and wait for new challenge
   */
  const reset = () => {
    console.log('[App] Resetting...')
    
    // Cancel any ongoing flash
    if (flashCancelRef.current) {
      flashCancelRef.current()
      flashCancelRef.current = null
    }
    
    // Clear countdown interval
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current)
      countdownIntervalRef.current = null
    }
    
    // Reset decoder
    if (decoderRef.current) {
      decoderRef.current.reset()
    }
    
    // Reset state
    setState(STATES.DETECT_START)
    setStatusMessage(STATUS_MESSAGES[STATES.DETECT_START])
    setChallenge(null)
    setResponse(null)
    setAccessResult(null)
    setCountdown(null)
    setInstructionMessage(null)
    
    // Restart decoder if camera is ready
    if (isInitialized && videoRef.current && canvasRef.current && decoderRef.current) {
      decoderRef.current.start(videoRef.current, canvasRef.current)
    }
  }

  /**
   * Handle manual reset button click
   */
  const handleReset = () => {
    reset()
  }

  /**
   * Handle retry camera initialization
   */
  const handleRetry = () => {
    initializeCamera()
  }

  return (
    <div className="app">
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
      <div className="ui-container">
        {/* Status Section */}
        <div className="status-section">
          <div className="status-message">{statusMessage}</div>
          
          {/* Countdown Timer */}
          {countdown !== null && countdown > 0 && (
            <div className="countdown-container">
              <div className="countdown-circle">
                <div className="countdown-number">{countdown}</div>
              </div>
            </div>
          )}
          
          {/* Instruction Message */}
          {instructionMessage && (
            <div className="instruction-message">
              {instructionMessage}
            </div>
          )}
          
          {challenge !== null && (
            <div className="info-item">
              <span className="info-label">Challenge:</span>
              <span className="info-value">{challenge}</span>
            </div>
          )}
          
          {response !== null && (
            <div className="info-item">
              <span className="info-label">Response:</span>
              <span className="info-value">{response}</span>
            </div>
          )}
          
          {accessResult && (
            <div className={`access-result ${accessResult}`}>
              {accessResult === 'granted' ? '✓ Access Granted' : '✗ Access Failed'}
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
        <div className="controls">
          <button onClick={handleReset} className="reset-button" disabled={state === STATES.IDLE}>
            Reset
          </button>
        </div>

        {/* Instructions */}
        <div className="instructions">
          <h3>Instructions:</h3>
          <ol>
            <li>Point your phone's back camera at the gate device</li>
            <li>Wait for the gate to send a challenge signal</li>
            <li>The app will automatically respond</li>
            <li>Access will be granted if the response is correct</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

export default App

