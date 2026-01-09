/**
 * Flash Decoder Utility
 * 
 * Decodes optical flashes from the gate device using time-based binary encoding.
 * Protocol:
 * - START: light ON for 1000ms
 * - 8 bits (MSB first), each bit lasts 300ms
 *   - 1 = light ON
 *   - 0 = light OFF
 * - END: light OFF for 1000ms
 */

// Configurable timing values (in milliseconds)
export const TIMING_CONFIG = {
  START_DURATION: 1000,    // Duration of START signal
  BIT_DURATION: 300,       // Duration of each bit
  END_DURATION: 1000,      // Duration of END signal
  SAMPLE_INTERVAL: 33,     // Target 30 fps sampling (1000/30 ≈ 33ms), actual will be ~60fps with RAF
  BRIGHTNESS_CHANGE_THRESHOLD: 50, // Minimum brightness change to detect ON (0-255) - differential detection
  BASELINE_SAMPLES: 30,    // Number of samples to calculate baseline brightness (1 second at 30fps)
  RESPONSE_DELAY: 3000     // Delay between receiving challenge and sending response (ms)
}

/**
 * Calculate brightness from RGB values
 * @param {number} r - Red component (0-255)
 * @param {number} g - Green component (0-255)
 * @param {number} b - Blue component (0-255)
 * @returns {number} Brightness value (0-255)
 */
export function calculateBrightness(r, g, b) {
  return (r + g + b) / 3
}

/**
 * Sample center pixels from a video frame to detect light state
 * @param {HTMLVideoElement} video - Video element to sample from
 * @param {HTMLCanvasElement} canvas - Canvas element for drawing frames
 * @returns {number} Average brightness of center region (0-255)
 */
export function sampleCenterBrightness(video, canvas) {
  if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
    return 0
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) return 0

  // Draw current video frame to canvas
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

  // Sample center region (20% of width/height from center)
  const centerX = canvas.width / 2
  const centerY = canvas.height / 2
  const sampleWidth = canvas.width * 0.2
  const sampleHeight = canvas.height * 0.2
  const startX = centerX - sampleWidth / 2
  const startY = centerY - sampleHeight / 2

  // Get image data from center region
  const imageData = ctx.getImageData(
    Math.max(0, startX),
    Math.max(0, startY),
    Math.min(sampleWidth, canvas.width),
    Math.min(sampleHeight, canvas.height)
  )

  // Calculate average brightness
  let totalBrightness = 0
  const pixelCount = imageData.data.length / 4 // RGBA = 4 values per pixel

  for (let i = 0; i < imageData.data.length; i += 4) {
    const r = imageData.data[i]
    const g = imageData.data[i + 1]
    const b = imageData.data[i + 2]
    totalBrightness += calculateBrightness(r, g, b)
  }

  return totalBrightness / pixelCount
}

/**
 * Determine if light is ON or OFF based on differential detection
 * Compares current brightness to baseline to detect device light changes
 * @param {number} brightness - Current brightness value (0-255)
 * @param {number} baseline - Baseline/reference brightness (0-255)
 * @returns {boolean} true if light is ON (significantly brighter than baseline), false if OFF
 */
export function isLightOn(brightness, baseline) {
  // Use differential detection: light is ON if significantly brighter than baseline
  // This filters out ambient light and only detects changes from the device
  const change = brightness - baseline
  return change >= TIMING_CONFIG.BRIGHTNESS_CHANGE_THRESHOLD
}

/**
 * Flash Decoder Class
 * Manages the state machine for decoding optical flashes
 * Uses differential detection to only detect light changes from the device (not ambient light)
 * Samples at 30+ fps using requestAnimationFrame
 */
export class FlashDecoder {
  constructor(onDecodeComplete, onError) {
    this.onDecodeComplete = onDecodeComplete
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
   * Start decoding process
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
    // This ensures smooth, consistent sampling regardless of display refresh rate
    this.animationFrameId = requestAnimationFrame((timestamp) => this.animate(timestamp))
  }

  /**
   * Stop decoding process
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
        // This filters out ambient light - we only detect changes from baseline
        this.baselineSamples.push(brightness)
        
        if (this.baselineSamples.length >= TIMING_CONFIG.BASELINE_SAMPLES) {
          // Calculate baseline as average of samples
          const sum = this.baselineSamples.reduce((a, b) => a + b, 0)
          this.baselineBrightness = sum / this.baselineSamples.length
          this.isCalibrated = true
          this.state = 'DETECT_START'
          this.lastStateChange = now
          console.log(`[FlashDecoder] Baseline calibrated: ${this.baselineBrightness.toFixed(1)}`)
          console.log('[FlashDecoder] Listening for gate signal...')
        }
        break

      case 'DETECT_START':
        // Wait for START signal: light ON (significantly brighter than baseline) for START_DURATION
        if (!this.isCalibrated || this.baselineBrightness === null) {
          // Fallback to calibration if not calibrated
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
          console.log('[FlashDecoder] START signal detected, reading 8 bits...')
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

          console.log(`[FlashDecoder] Bit ${this.currentBitIndex}/8: ${bit} (brightness: ${brightness.toFixed(1)}, baseline: ${this.baselineBrightness.toFixed(1)}, change: ${(brightness - this.baselineBrightness).toFixed(1)})`)

          if (this.currentBitIndex >= 8) {
            // All 8 bits received, wait for END signal
            this.state = 'DETECT_END'
            console.log('[FlashDecoder] All 8 bits received. Bits:', this.bits.join(''))
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
          // END signal detected, decode the 8-bit challenge
          this.decodeChallenge()
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
   * Decode the 8-bit challenge value from received bits
   * Ensures exactly 8 bits were received and converts MSB-first binary to decimal
   */
  decodeChallenge() {
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
    let challenge = 0
    for (let i = 0; i < 8; i++) {
      challenge = (challenge << 1) | this.bits[i]
    }

    // Validate challenge is in valid range (0-255 for 8 bits)
    if (challenge < 0 || challenge > 255) {
      this.onError(`Invalid challenge value: ${challenge} (expected 0-255)`)
      return
    }

    console.log('[FlashDecoder] ✓ 8-bit challenge decoded successfully')
    console.log('[FlashDecoder] Binary:', this.bits.join(''))
    console.log('[FlashDecoder] Decimal:', challenge)
    this.onDecodeComplete(challenge)
  }

  /**
   * Reset decoder to initial state
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

