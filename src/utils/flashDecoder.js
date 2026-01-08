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
  END_DURATION: 1000,       // Duration of END signal
  SAMPLE_INTERVAL: 50,     // How often to sample brightness (ms)
  BRIGHTNESS_THRESHOLD: 100, // Threshold to determine ON vs OFF (0-255)
  RESPONSE_DELAY: 3000      // Delay between receiving challenge and sending response (ms)
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
 * Determine if light is ON or OFF based on brightness threshold
 * @param {number} brightness - Brightness value (0-255)
 * @returns {boolean} true if light is ON, false if OFF
 */
export function isLightOn(brightness) {
  return brightness > TIMING_CONFIG.BRIGHTNESS_THRESHOLD
}

/**
 * Flash Decoder Class
 * Manages the state machine for decoding optical flashes
 */
export class FlashDecoder {
  constructor(onDecodeComplete, onError) {
    this.onDecodeComplete = onDecodeComplete
    this.onError = onError
    this.state = 'IDLE' // IDLE, DETECT_START, READ_BITS, COMPLETE
    this.bits = []
    this.startTime = null
    this.lastStateChange = null
    this.currentBitIndex = 0
    this.sampleInterval = null
    this.video = null
    this.canvas = null
  }

  /**
   * Start decoding process
   * @param {HTMLVideoElement} video - Video element to sample from
   * @param {HTMLCanvasElement} canvas - Canvas element for drawing frames
   */
  start(video, canvas) {
    this.video = video
    this.canvas = canvas
    this.state = 'DETECT_START'
    this.bits = []
    this.currentBitIndex = 0
    this.startTime = Date.now()
    this.lastStateChange = Date.now()

    // Start sampling brightness at regular intervals
    this.sampleInterval = setInterval(() => {
      this.sample()
    }, TIMING_CONFIG.SAMPLE_INTERVAL)
  }

  /**
   * Stop decoding process
   */
  stop() {
    if (this.sampleInterval) {
      clearInterval(this.sampleInterval)
      this.sampleInterval = null
    }
    this.state = 'IDLE'
  }

  /**
   * Sample current brightness and update state machine
   */
  sample() {
    if (!this.video || !this.canvas) return

    const brightness = sampleCenterBrightness(this.video, this.canvas)
    const isOn = isLightOn(brightness)
    const now = Date.now()
    const elapsed = now - this.lastStateChange

    switch (this.state) {
      case 'DETECT_START':
        // Wait for START signal: light ON for START_DURATION
        if (isOn && elapsed >= TIMING_CONFIG.START_DURATION) {
          // START signal detected, begin reading bits
          this.state = 'READ_BITS'
          this.currentBitIndex = 0
          this.bits = []
          this.lastStateChange = now
          console.log('[FlashDecoder] START signal detected, reading bits...')
        } else if (!isOn && elapsed > TIMING_CONFIG.START_DURATION * 1.5) {
          // Reset if we've been waiting too long without seeing START
          this.lastStateChange = now
        }
        break

      case 'READ_BITS':
        // Read 8 bits, each lasting BIT_DURATION
        if (elapsed >= TIMING_CONFIG.BIT_DURATION) {
          // Time to record this bit
          const bit = isOn ? 1 : 0
          this.bits.push(bit)
          this.currentBitIndex++
          this.lastStateChange = now

          console.log(`[FlashDecoder] Bit ${this.currentBitIndex}/8: ${bit}`)

          if (this.currentBitIndex >= 8) {
            // All 8 bits received, wait for END signal
            this.state = 'DETECT_END'
          }
        }
        break

      case 'DETECT_END':
        // Wait for END signal: light OFF for END_DURATION
        if (!isOn && elapsed >= TIMING_CONFIG.END_DURATION) {
          // END signal detected, decode the challenge
          this.decodeChallenge()
          this.state = 'COMPLETE'
        } else if (isOn && elapsed > TIMING_CONFIG.END_DURATION * 1.5) {
          // Still seeing light after expected END, might be error
          this.onError('END signal not detected properly')
          this.stop()
        }
        break

      default:
        break
    }
  }

  /**
   * Decode the 8-bit challenge value from received bits
   */
  decodeChallenge() {
    if (this.bits.length !== 8) {
      this.onError('Invalid number of bits received')
      return
    }

    // Convert binary array to decimal (MSB first)
    let challenge = 0
    for (let i = 0; i < 8; i++) {
      challenge = (challenge << 1) | this.bits[i]
    }

    console.log('[FlashDecoder] Challenge decoded:', challenge, 'Bits:', this.bits.join(''))
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
  }
}

