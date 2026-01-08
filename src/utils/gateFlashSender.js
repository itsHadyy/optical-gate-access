/**
 * Gate Flash Sender Utility
 * 
 * Simulates the gate device sending optical flashes.
 * Protocol:
 * - START: light ON (white screen) for 1000ms
 * - 8 bits (MSB first), each bit lasts 300ms
 *   - 1 = white (ON)
 *   - 0 = black (OFF)
 * - END: light OFF (black screen) for 1000ms
 */

import { TIMING_CONFIG } from './flashDecoder'

/**
 * Convert a number to 8-bit binary array (MSB first)
 * @param {number} value - Value to convert (0-255)
 * @returns {Array<number>} Array of 8 bits (MSB first)
 */
export function numberToBits(value) {
  const bits = []
  for (let i = 7; i >= 0; i--) {
    bits.push((value >> i) & 1)
  }
  return bits
}

/**
 * Send a challenge flash sequence
 * @param {number} challengeValue - Challenge value to send (0-255)
 * @param {Function} onComplete - Callback when transmission is complete
 * @param {Function} onProgress - Optional callback for progress updates
 * @returns {Function} Function to cancel the transmission
 */
export function sendGateFlash(challengeValue, onComplete, onProgress) {
  const bits = numberToBits(challengeValue)
  let currentStep = 0
  let timeoutId = null
  let isCancelled = false

  // Get or create flash overlay element
  let flashOverlay = document.getElementById('gate-flash-overlay')
  if (!flashOverlay) {
    flashOverlay = document.createElement('div')
    flashOverlay.id = 'gate-flash-overlay'
    flashOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 99999;
      pointer-events: none;
      transition: background-color 0ms linear;
    `
    document.body.appendChild(flashOverlay)
  }

  // Make overlay visible
  flashOverlay.style.display = 'block'
  flashOverlay.style.zIndex = '99999'

  /**
   * Execute next step in flashing sequence
   */
  function executeStep() {
    if (isCancelled) {
      cleanup()
      return
    }

    const step = steps[currentStep]

    if (!step) {
      // All steps complete
      cleanup()
      if (onComplete) onComplete()
      return
    }

    // Update overlay color
    flashOverlay.style.backgroundColor = step.color
    flashOverlay.style.transition = `background-color ${step.duration}ms linear`

    if (onProgress && step.description) {
      onProgress(step.description)
    }

    // Schedule next step
    timeoutId = setTimeout(() => {
      currentStep++
      executeStep()
    }, step.duration)
  }

  /**
   * Cleanup function
   */
  function cleanup() {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    if (flashOverlay) {
      flashOverlay.style.display = 'none'
      flashOverlay.style.backgroundColor = 'transparent'
    }
  }

  // Build flashing sequence
  const steps = [
    // START signal: white for START_DURATION
    {
      color: '#FFFFFF', // White = ON
      duration: TIMING_CONFIG.START_DURATION,
      description: 'Sending START signal'
    }
  ]

  // Add 8 bits
  for (let i = 0; i < 8; i++) {
    const bit = bits[i]
    steps.push({
      color: bit === 1 ? '#FFFFFF' : '#000000', // White = ON, Black = OFF
      duration: TIMING_CONFIG.BIT_DURATION,
      description: `Sending bit ${i + 1}/8: ${bit}`
    })
  }

  // END signal: black for END_DURATION
  steps.push({
    color: '#000000', // Black = OFF
    duration: TIMING_CONFIG.END_DURATION,
    description: 'Sending END signal'
  })

  // Start flashing sequence
  executeStep()

  // Return cancel function
  return () => {
    isCancelled = true
    cleanup()
  }
}

