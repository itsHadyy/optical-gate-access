/**
 * Gate Flash Receiver Utility
 * 
 * Receives optical flashes from the phone's screen using the laptop's camera.
 * Uses the same protocol as the phone's decoder.
 * Uses differential detection to only detect light changes from the phone screen (not ambient light).
 * Samples at 30+ fps using requestAnimationFrame.
 */

import { sampleCenterBrightness, TIMING_CONFIG } from './flashDecoder'

/**
 * Determine if light is ON or OFF based on differential detection
 * @param {number} brightness - Current brightness value (0-255)
 * @param {number} baseline - Baseline/reference brightness (0-255)
 * @returns {boolean} true if light is ON (significantly brighter than baseline), false if OFF
 */
function isLightOn(brightness, baseline) {
  const change = brightness - baseline
  return change >= TIMING_CONFIG.BRIGHTNESS_CHANGE_THRESHOLD
}

/**
 * Gate Flash Receiver Class
 * Manages the state machine for receiving optical flashes from phone
 * Uses differential detection to only detect light changes from phone screen (not ambient light)
 * Samples at 30+ fps using requestAnimationFrame
 */
export class GateFlashReceiver {
  constructor(onResponseReceived, onError) {
    this.onResponseReceived = onResponseReceived
    this.onError = onError
    this.state = 'IDLE' // IDLE, CALIBRATE, DETECT_START, READ_BITS, COMPLETE
    this.bits = []
    this.startTime = null
    this.lastStateChange = null
    this.currentBitIndex = 0
    this.animationFrameId = null
    this.video = null
    this.canvas = null
    
    // Baseline tracking for differential detection
    this.baselineBrightness = null
    this.baselineSamples = []
    this.isCalibrated = false
  }

  /**
   * Start receiving process
   * First calibrates baseline brightness, then starts detection
   * @param {HTMLVideoElement} video - Video element to sample from
   * @param {HTMLCanvasElement} canvas - Canvas element for drawing frames
   */
  start(video, canvas) {
    this.video = video
    this.canvas = canvas
    this.state = 'CALIBRATE'
    this.bits = []
    this.currentBitIndex = 0
    this.startTime = performance.now()
    this.lastStateChange = performance.now()
    this.baselineSamples = []
    this.isCalibrated = false
    this.baselineBrightness = null

    // Start sampling using requestAnimationFrame for 30+ fps (typically 60fps)
    this.animationFrameId = requestAnimationFrame((timestamp) => this.animate(timestamp))
  }

  /**
   * Stop receiving process
   */
  stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
    this.state = 'IDLE'
    this.isCalibrated = false
    this.baselineBrightness = null
    this.baselineSamples = []
  }

  /**
   * Animation loop using requestAnimationFrame (runs at 30+ fps, typically 60fps)
   * Samples brightness and updates state machine
   */
  animate(timestamp) {
    if (!this.video || !this.canvas) {
      this.animationFrameId = requestAnimationFrame((ts) => this.animate(ts))
      return
    }

    const brightness = sampleCenterBrightness(this.video, this.canvas)
    const now = performance.now()
    const elapsed = now - this.lastStateChange

    switch (this.state) {
      case 'CALIBRATE':
        // Collect baseline samples to calculate reference brightness
        // This filters out ambient light - we only detect changes from phone screen
        this.baselineSamples.push(brightness)
        
        if (this.baselineSamples.length >= TIMING_CONFIG.BASELINE_SAMPLES) {
          // Calculate baseline as average of samples
          const sum = this.baselineSamples.reduce((a, b) => a + b, 0)
          this.baselineBrightness = sum / this.baselineSamples.length
          this.isCalibrated = true
          this.state = 'DETECT_START'
          this.lastStateChange = now
          console.log(`[GateReceiver] Baseline calibrated: ${this.baselineBrightness.toFixed(1)}`)
          console.log('[GateReceiver] Listening for phone response...')
        }
        break

      case 'DETECT_START':
        // Wait for START signal: light ON (significantly brighter than baseline) for START_DURATION
        if (!this.isCalibrated || this.baselineBrightness === null) {
          this.state = 'CALIBRATE'
          this.baselineSamples = []
          break
        }
        
        const isOnStart = isLightOn(brightness, this.baselineBrightness)
        
        if (isOnStart && elapsed >= TIMING_CONFIG.START_DURATION) {
          // START signal detected, begin reading 8 bits
          this.state = 'READ_BITS'
          this.currentBitIndex = 0
          this.bits = []
          this.lastStateChange = now
          console.log('[GateReceiver] START signal detected, reading 8 bits...')
        } else if (!isOnStart && elapsed > TIMING_CONFIG.START_DURATION * 1.5) {
          // Reset if we've been waiting too long without seeing START
          this.lastStateChange = now
        }
        break

      case 'READ_BITS':
        // Read exactly 8 bits, each lasting BIT_DURATION
        if (!this.isCalibrated || this.baselineBrightness === null) {
          this.onError('Baseline lost during bit reading')
          this.stop()
          break
        }
        
        const isOnBit = isLightOn(brightness, this.baselineBrightness)
        
        if (elapsed >= TIMING_CONFIG.BIT_DURATION) {
          // Time to record this bit (ON = 1, OFF = 0)
          const bit = isOnBit ? 1 : 0
          this.bits.push(bit)
          this.currentBitIndex++
          this.lastStateChange = now

          console.log(`[GateReceiver] Bit ${this.currentBitIndex}/8: ${bit} (brightness: ${brightness.toFixed(1)}, baseline: ${this.baselineBrightness.toFixed(1)}, change: ${(brightness - this.baselineBrightness).toFixed(1)})`)

          if (this.currentBitIndex >= 8) {
            // All 8 bits received, wait for END signal
            this.state = 'DETECT_END'
            console.log('[GateReceiver] All 8 bits received. Bits:', this.bits.join(''))
          }
        }
        break

      case 'DETECT_END':
        // Wait for END signal: light OFF (back to baseline) for END_DURATION
        if (!this.isCalibrated || this.baselineBrightness === null) {
          this.onError('Baseline lost during END detection')
          this.stop()
          break
        }
        
        const isOnEnd = isLightOn(brightness, this.baselineBrightness)
        
        if (!isOnEnd && elapsed >= TIMING_CONFIG.END_DURATION) {
          // END signal detected, decode the 8-bit response
          this.decodeResponse()
          this.state = 'COMPLETE'
        } else if (isOnEnd && elapsed > TIMING_CONFIG.END_DURATION * 1.5) {
          // Still seeing light after expected END, might be error
          this.onError('END signal not detected properly - light still on')
          this.stop()
        }
        break

      case 'COMPLETE':
        // Decoding complete, stop animation
        this.stop()
        return

      default:
        break
    }

    // Continue animation loop (ensures 30+ fps sampling)
    this.animationFrameId = requestAnimationFrame((ts) => this.animate(ts))
  }

  /**
   * Decode the 8-bit response value from received bits
   * Ensures exactly 8 bits were received and converts MSB-first binary to decimal
   */
  decodeResponse() {
    if (this.bits.length !== 8) {
      this.onError(`Invalid number of bits received: ${this.bits.length} (expected 8)`)
      return
    }

    // Validate bits are 0 or 1
    for (let i = 0; i < 8; i++) {
      if (this.bits[i] !== 0 && this.bits[i] !== 1) {
        this.onError(`Invalid bit value at position ${i}: ${this.bits[i]}`)
        return
      }
    }

    // Convert binary array to decimal (MSB first - Most Significant Bit first)
    let response = 0
    for (let i = 0; i < 8; i++) {
      response = (response << 1) | this.bits[i]
    }

    // Validate response is in valid range (0-255 for 8 bits)
    if (response < 0 || response > 255) {
      this.onError(`Invalid response value: ${response} (expected 0-255)`)
      return
    }

    console.log('[GateReceiver] ✓ 8-bit response decoded successfully')
    console.log('[GateReceiver] Binary:', this.bits.join(''))
    console.log('[GateReceiver] Decimal:', response)
    this.onResponseReceived(response)
  }

  /**
   * Reset receiver to initial state
   */
  reset() {
    this.stop()
    this.state = 'IDLE'
    this.bits = []
    this.currentBitIndex = 0
    this.startTime = null
    this.lastStateChange = null
    this.baselineBrightness = null
    this.baselineSamples = []
    this.isCalibrated = false
  }
}

/**
 * Verify if the received response matches the expected response
 * @param {number} challenge - Original challenge sent
 * @param {number} receivedResponse - Response received from phone
 * @returns {boolean} True if response is correct
 */
export function verifyResponse(challenge, receivedResponse) {
  const expectedResponse = (challenge + 10) % 256
  return receivedResponse === expectedResponse
}

