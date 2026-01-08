/**
 * Gate Flash Receiver Utility
 * 
 * Receives optical flashes from the phone's screen using the laptop's camera.
 * Uses the same protocol as the phone's decoder.
 */

import { sampleCenterBrightness, isLightOn, TIMING_CONFIG } from './flashDecoder'

/**
 * Gate Flash Receiver Class
 * Manages the state machine for receiving optical flashes from phone
 */
export class GateFlashReceiver {
  constructor(onResponseReceived, onError) {
    this.onResponseReceived = onResponseReceived
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
   * Start receiving process
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
   * Stop receiving process
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
          console.log('[GateReceiver] START signal detected, reading bits...')
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

          console.log(`[GateReceiver] Bit ${this.currentBitIndex}/8: ${bit}`)

          if (this.currentBitIndex >= 8) {
            // All 8 bits received, wait for END signal
            this.state = 'DETECT_END'
          }
        }
        break

      case 'DETECT_END':
        // Wait for END signal: light OFF for END_DURATION
        if (!isOn && elapsed >= TIMING_CONFIG.END_DURATION) {
          // END signal detected, decode the response
          this.decodeResponse()
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
   * Decode the 8-bit response value from received bits
   */
  decodeResponse() {
    if (this.bits.length !== 8) {
      this.onError('Invalid number of bits received')
      return
    }

    // Convert binary array to decimal (MSB first)
    let response = 0
    for (let i = 0; i < 8; i++) {
      response = (response << 1) | this.bits[i]
    }

    console.log('[GateReceiver] Response decoded:', response, 'Bits:', this.bits.join(''))
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

