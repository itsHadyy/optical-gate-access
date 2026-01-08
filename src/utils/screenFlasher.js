/**
 * Screen Flasher Utility
 * 
 * Flashes the screen (white/black) to send optical response to gate device.
 * Uses full-screen overlay with backgroundColor changes.
 * Protocol matches the gate's protocol:
 * - START: white (ON) for 1000ms
 * - 8 bits (MSB first), each bit lasts 300ms
 *   - 1 = white (ON)
 *   - 0 = black (OFF)
 * - END: black (OFF) for 1000ms
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
 * Flash the screen to send response to gate
 * @param {number} responseValue - Response value to send (0-255)
 * @param {Function} onComplete - Callback when flashing is complete
 * @param {Function} onProgress - Optional callback for progress updates
 * @returns {Function} Function to cancel the flashing
 */
export function flashScreen(responseValue, onComplete, onProgress) {
  const bits = numberToBits(responseValue)
  let currentStep = 0
  let timeoutId = null
  let isCancelled = false

  // Get or create flash overlay element
  let flashOverlay = document.getElementById('flash-overlay')
  if (!flashOverlay) {
    flashOverlay = document.createElement('div')
    flashOverlay.id = 'flash-overlay'
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

  // Make overlay visible and ensure it's on top
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

/**
 * Flash screen using requestAnimationFrame for smoother transitions
 * Alternative implementation with more precise timing
 * @param {number} responseValue - Response value to send (0-255)
 * @param {Function} onComplete - Callback when flashing is complete
 * @param {Function} onProgress - Optional callback for progress updates
 * @returns {Function} Function to cancel the flashing
 */
export function flashScreenRAF(responseValue, onComplete, onProgress) {
  const bits = numberToBits(responseValue)
  let startTime = null
  let isCancelled = false
  let animationFrameId = null

  // Get or create flash overlay element
  let flashOverlay = document.getElementById('flash-overlay')
  if (!flashOverlay) {
    flashOverlay = document.createElement('div')
    flashOverlay.id = 'flash-overlay'
    flashOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 99999;
      pointer-events: none;
    `
    document.body.appendChild(flashOverlay)
  }

  flashOverlay.style.display = 'block'
  flashOverlay.style.zIndex = '99999'
  flashOverlay.style.transition = 'none'

  // Build sequence: START + 8 bits + END
  const sequence = [
    { color: '#FFFFFF', duration: TIMING_CONFIG.START_DURATION, desc: 'START' },
    ...bits.map((bit, i) => ({
      color: bit === 1 ? '#FFFFFF' : '#000000',
      duration: TIMING_CONFIG.BIT_DURATION,
      desc: `Bit ${i + 1}`
    })),
    { color: '#000000', duration: TIMING_CONFIG.END_DURATION, desc: 'END' }
  ]

  let currentStep = 0
  let stepStartTime = 0
  let totalElapsed = 0

  function animate(timestamp) {
    if (isCancelled) {
      cleanup()
      return
    }

    if (startTime === null) {
      startTime = timestamp
      stepStartTime = timestamp
    }

    const elapsed = timestamp - startTime

    if (currentStep >= sequence.length) {
      // All steps complete
      cleanup()
      if (onComplete) onComplete()
      return
    }

    const step = sequence[currentStep]
    const stepElapsed = timestamp - stepStartTime

    // Update color immediately (no transition for precise timing)
    flashOverlay.style.backgroundColor = step.color

    if (stepElapsed >= step.duration) {
      // Move to next step
      currentStep++
      stepStartTime = timestamp
      if (onProgress && currentStep < sequence.length) {
        onProgress(sequence[currentStep].desc)
      }
    }

    animationFrameId = requestAnimationFrame(animate)
  }

  function cleanup() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
    if (flashOverlay) {
      flashOverlay.style.display = 'none'
      flashOverlay.style.backgroundColor = 'transparent'
    }
  }

  // Start animation
  animationFrameId = requestAnimationFrame(animate)

  // Return cancel function
  return () => {
    isCancelled = true
    cleanup()
  }
}

