import { useEffect, useRef, useState } from 'react'
import Modal from '@/components/common/Modal'
import { CameraIcon, WarningIcon } from '@/components/common/Icons'

interface CameraScannerModalProps {
  open: boolean
  onClose: () => void
  onDetected: (code: string) => void
}

/**
 * Uses @zxing/browser to decode a barcode from the device's rear camera
 * feed. Loaded lazily (dynamic import) since the scanning library and
 * its camera access are only needed on mobile - desktop users never
 * trigger this component at all (gated by useIsMobileDevice upstream).
 */
export default function CameraScannerModal({ open, onClose, onDetected }: CameraScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const detectedRef = useRef(false)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(true)
  const [hint, setHint] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    let hintTimer: ReturnType<typeof setTimeout> | undefined
    detectedRef.current = false
    setError('')
    setStarting(true)
    setHint('Opening the rear camera…')

    async function start() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        if (cancelled || !videoRef.current) return

        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              // A product barcode normally needs the rear camera's autofocus.
              // `ideal` preserves compatibility with devices that do not
              // expose a facing-mode capability.
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          },
          videoRef.current,
          (result, err) => {
            if (result && !cancelled && !detectedRef.current) {
              detectedRef.current = true
              setHint(`Barcode detected: ${result.getText()}`)
              controlsRef.current?.stop()
              onDetected(result.getText())
            }
            // err fires continuously while no barcode is in frame - that's
            // normal scanning behavior, not a real error, so it's ignored.
            void err
          },
        )
        controlsRef.current = controls
        if (!cancelled) {
          setStarting(false)
          setHint('Hold the barcode inside the frame. Use good lighting and move closer if needed.')
          hintTimer = setTimeout(() => {
            if (!detectedRef.current) {
              setHint('Still scanning. Keep the barcode steady, avoid glare, and try moving closer.')
            }
          }, 10_000)
        }
      } catch (err) {
        if (cancelled) return
        console.error('Camera scanner failed to start:', err)
        setStarting(false)
        if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
          setError('Camera access was denied. Allow camera permission for this site and try again.')
        } else if (err instanceof DOMException && err.name === 'NotFoundError') {
          setError('No camera found on this device.')
        } else {
          setError('Could not start the camera. Try again, or enter the barcode manually.')
        }
      }
    }

    start()

    return () => {
      cancelled = true
      if (hintTimer) clearTimeout(hintTimer)
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [open, onDetected])

  function handleClose() {
    controlsRef.current?.stop()
    controlsRef.current = null
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Scan Barcode">
      <div className="space-y-3">
        <div className="relative bg-black rounded-lg overflow-hidden aspect-square">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          {starting && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-sm gap-2">
              <CameraIcon width={18} height={18} />
              Starting camera...
            </div>
          )}
          {!starting && !error && (
            <div className="absolute inset-6 border-2 border-primary rounded-lg pointer-events-none" />
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 text-danger text-sm rounded-lg px-3.5 py-2.5">
            <WarningIcon width={16} height={16} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {!error && <p className="text-xs text-app-faint text-center">{hint}</p>}
      </div>
    </Modal>
  )
}
