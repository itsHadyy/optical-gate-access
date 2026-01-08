import { useEffect, useRef, useState } from 'react'

/**
 * Custom hook for accessing the device's back camera
 * Uses getUserMedia with facingMode: "environment" to get the rear camera
 * 
 * @returns {Object} Camera state and controls
 */
export function useCamera() {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [error, setError] = useState(null)
  const [hasPermission, setHasPermission] = useState(false)

  /**
   * Initialize camera access
   */
  const initializeCamera = async () => {
    try {
      setError(null)
      
      // Request camera access with back camera preference
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Back camera
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      })

      streamRef.current = stream
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        // Wait for video to be ready
        await new Promise((resolve) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => {
              videoRef.current?.play()
              resolve()
            }
          }
        })
        setIsInitialized(true)
        setHasPermission(true)
      }
    } catch (err) {
      console.error('Camera initialization error:', err)
      setError(err.message || 'Failed to access camera')
      setHasPermission(false)
      setIsInitialized(false)
      
      // Provide user-friendly error messages
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Camera permission denied. Please allow camera access.')
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError('No camera found. Please ensure your device has a camera.')
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setError('Camera is already in use by another application.')
      } else {
        setError('Failed to initialize camera. Please try again.')
      }
    }
  }

  /**
   * Stop camera stream
   */
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsInitialized(false)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [])

  return {
    videoRef,
    isInitialized,
    error,
    hasPermission,
    initializeCamera,
    stopCamera
  }
}

