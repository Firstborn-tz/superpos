import { useEffect, useRef, useState } from 'react'
import type { QuaggaJSResultCallbackFunction, QuaggaJSStatic } from '@ericblade/quagga2'
import Modal from '@/components/common/Modal'
import { CameraIcon, WarningIcon } from '@/components/common/Icons'

interface CameraScannerModalProps {
  open: boolean
  onClose: () => void
  onDetected: (code: string) => void
}

async function releaseCamera(quagga: QuaggaJSStatic, isRunning: boolean) {
  if (isRunning) {
    try {
      await quagga.stop()
      return
    } catch {
      // Fall through to release the stream if startup or shutdown raced.
    }
  }
  await quagga.CameraAccess.release().catch(() => undefined)
}

export default function CameraScannerModal({ open, onClose, onDetected }: CameraScannerModalProps) {
  const targetRef = useRef<HTMLDivElement>(null)
  const quaggaRef = useRef<QuaggaJSStatic | null>(null)
  const detectedRef = useRef(false)
  const onDetectedRef = useRef(onDetected)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(true)
  const [hint, setHint] = useState('')

  // Keep the latest callback without restarting the camera when a parent rerenders.
  onDetectedRef.current = onDetected

  useEffect(() => {
    if (!open) return

    let cancelled = false
    let isRunning = false
    let hintTimer: ReturnType<typeof setTimeout> | undefined
    let quagga: QuaggaJSStatic | null = null
    let detectedHandler: QuaggaJSResultCallbackFunction | null = null
    detectedRef.current = false
    setError('')
    setStarting(true)
    setHint('Opening the rear camera…')

    async function startScanner() {
      if (!window.isSecureContext) {
        setStarting(false)
        setError('Camera scanning requires HTTPS. Open this page over HTTPS, or use localhost while testing.')
        return
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setStarting(false)
        setError('This browser cannot access a camera. Try the latest version of Chrome or Safari.')
        return
      }

      try {
        const quaggaModule = await import('@ericblade/quagga2')
        quagga = quaggaModule.default
        if (cancelled || !targetRef.current) return
        quaggaRef.current = quagga

        detectedHandler = (result) => {
          const code = result.codeResult?.code
          if (!code || cancelled || detectedRef.current) return
          detectedRef.current = true
          setHint(`Barcode detected: ${code}`)
          onDetectedRef.current(code)
        }
        quagga.onDetected(detectedHandler)

        await quagga.init({
          inputStream: {
            type: 'LiveStream',
            target: targetRef.current,
            constraints: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            area: { top: '20%', right: '5%', left: '5%', bottom: '20%' },
          },
          locator: { patchSize: 'medium', halfSample: true },
          decoder: {
            readers: [
              'ean_reader',
              'ean_8_reader',
              'upc_reader',
              'upc_e_reader',
              'code_128_reader',
              'code_39_reader',
              'code_93_reader',
              'i2of5_reader',
              'codabar_reader',
            ],
          },
          locate: true,
          frequency: 12,
          numOfWorkers: Math.min(2, Math.max(1, (navigator.hardwareConcurrency || 2) - 1)),
          canvas: { createOverlay: true },
          debug: false,
        })

        if (cancelled) {
          await releaseCamera(quagga, false)
          return
        }

        quagga.start()
        isRunning = true
        setStarting(false)
        setHint('Center the product barcode in the frame. Hold steady and avoid glare.')
        hintTimer = setTimeout(() => {
          if (!detectedRef.current) {
            setHint('Still scanning. Move closer, improve the lighting, or tilt the package to reduce glare.')
          }
        }, 10_000)
      } catch (err) {
        if (cancelled) {
          if (quagga) await releaseCamera(quagga, isRunning)
          return
        }
        console.error('Product barcode scanner failed to start:', err)
        setStarting(false)
        const message = err instanceof Error ? err.message : String(err)
        if (/denied|permission/i.test(message)) {
          setError('Camera access was denied. Allow camera permission for this site, then try again.')
        } else if (/notfound|no camera|device/i.test(message)) {
          setError('No camera was found on this device.')
        } else if (/notreadable|trackstart|busy/i.test(message)) {
          setError('The camera is busy in another app. Close other camera apps and try again.')
        } else {
          setError('Could not start the camera. Check browser permissions or enter the barcode manually.')
        }
        if (quagga) await releaseCamera(quagga, isRunning)
      }
    }

    void startScanner()

    return () => {
      cancelled = true
      if (hintTimer) clearTimeout(hintTimer)
      if (quagga && detectedHandler) quagga.offDetected(detectedHandler)
      if (quagga) void releaseCamera(quagga, isRunning)
      if (quaggaRef.current === quagga) quaggaRef.current = null
    }
  }, [open])

  function handleClose() {
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Scan Product Barcode" maxWidth="max-w-lg">
      <div className="space-y-3">
        <div className="relative min-h-64 overflow-hidden rounded-xl bg-slate-950">
          <div ref={targetRef} className="product-scanner h-64 w-full" />
          {starting && !error && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/65 text-sm text-white">
              <CameraIcon width={18} height={18} />
              Starting retail barcode scanner…
            </div>
          )}
          {!starting && !error && (
            <div className="pointer-events-none absolute inset-x-[8%] top-1/2 h-28 -translate-y-1/2 rounded-lg border-2 border-emerald-400 shadow-[0_0_0_999px_rgba(0,0,0,0.18)]">
              <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/60 px-3 py-1 text-[11px] font-medium text-white">
                Align barcode here
              </span>
              <span className="absolute inset-x-2 top-1/2 h-px bg-emerald-300/80 shadow-[0_0_8px_2px_rgba(52,211,153,0.55)]" />
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-danger">
            <WarningIcon width={16} height={16} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {!error && <p className="text-center text-xs text-app-faint">{hint}</p>}
        <p className="text-center text-[11px] text-app-faint">Reads EAN, UPC, Code 128, Code 39, ITF and Codabar product labels.</p>
      </div>
    </Modal>
  )
}
