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
 * Send a challenge flash sequence using requestAnimationFrame for 30+ fps
 * Updates screen continuously at display refresh rate for smooth rendering
 * @param {number} challengeValue - Challenge value to send (0-255)
 * @param {Function} onComplete - Callback when transmission is complete
 * @param {Function} onProgress - Optional callback for progress updates
 * @returns {Function} Function to cancel the transmission
 */
export function sendGateFlash(challengeValue, onComplete, onProgress) {
  const bits = numberToBits(challengeValue)
  let startTime = null
  let isCancelled = false
  let animationFrameId = null
  let lastProgressUpdate = 0

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
      will-change: background-color;
    `
    document.body.appendChild(flashOverlay)
  }

  // Make overlay visible
  flashOverlay.style.display = 'block'
  flashOverlay.style.zIndex = '99999'
  flashOverlay.style.transition = 'none'

  // Build flashing sequence
  const sequence = [
    // START signal: white for START_DURATION
    {
      color: '#FFFFFF', // White = ON
      duration: TIMING_CONFIG.START_DURATION,
      description: 'Sending START signal'
    },
    // Add 8 bits
    ...bits.map((bit, i) => ({
      color: bit === 1 ? '#FFFFFF' : '#000000', // White = ON, Black = OFF
      duration: TIMING_CONFIG.BIT_DURATION,
      description: `Sending bit ${i + 1}/8: ${bit}`
    })),
    // END signal: black for END_DURATION
    {
      color: '#000000', // Black = OFF
      duration: TIMING_CONFIG.END_DURATION,
      description: 'Sending END signal'
    }
  ]

  let currentStep = 0
  let stepStartTime = 0

  /**
   * Animation loop using requestAnimationFrame (runs at 30+ fps, typically 60fps)
   */
  function animate(timestamp) {
    if (isCancelled) {
      cleanup()
      return
    }

    if (startTime === null) {
      startTime = timestamp
      stepStartTime = timestamp
    }

    if (currentStep >= sequence.length) {
      // All steps complete
      cleanup()
      if (onComplete) onComplete()
      return
    }

    const step = sequence[currentStep]
    const stepElapsed = timestamp - stepStartTime

    // Continuously update color at 30+ fps for smooth rendering
    flashOverlay.style.backgroundColor = step.color

    // Update progress every ~100ms to avoid too frequent callbacks
    if (onProgress && timestamp - lastProgressUpdate > 100) {
      const progress = Math.min(100, (stepElapsed / step.duration) * 100)
      onProgress(`${step.description} (${Math.round(progress)}%)`)
      lastProgressUpdate = timestamp
    }

    if (stepElapsed >= step.duration) {
      // Move to next step
      currentStep++
      stepStartTime = timestamp
      lastProgressUpdate = timestamp
      if (onProgress && currentStep < sequence.length) {
        onProgress(sequence[currentStep].description)
      }
    }

    // Continue animation loop (runs at display refresh rate, typically 60fps)
    animationFrameId = requestAnimationFrame(animate)
  }

  /**
   * Cleanup function
   */
  function cleanup() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
    if (flashOverlay) {
      flashOverlay.style.display = 'none'
      flashOverlay.style.backgroundColor = 'transparent'
      flashOverlay.style.willChange = 'auto'
    }
  }

  // Start animation loop (runs at display refresh rate, minimum 30fps)
  animationFrameId = requestAnimationFrame(animate)

  // Return cancel function
  return () => {
    isCancelled = true
    cleanup()
  }
}

