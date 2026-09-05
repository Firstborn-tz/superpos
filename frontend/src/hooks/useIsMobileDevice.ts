import { useEffect, useState } from 'react'

function detectMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const uaMatch = /Android|iPhone|iPad|iPod|Mobile|IEMobile/i.test(ua)
  // Also consider fine-vs-coarse pointer as a signal, since some tablets
  // and desktop-mode mobile browsers spoof the user agent string.
  const coarsePointer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  return uaMatch || !!coarsePointer
}

/**
 * Returns whether the current device looks like a phone/tablet (touch,
 * mobile user agent) vs a desktop/laptop. Used to show camera-based
 * barcode scanning only where it makes sense - desktops rarely have a
 * usable rear camera positioned for scanning products.
 */
export function useIsMobileDevice(): boolean {
  const [isMobile, setIsMobile] = useState(detectMobile)

  useEffect(() => {
    const mq = window.matchMedia?.('(pointer: coarse)')
    if (!mq) return
    const handler = () => setIsMobile(detectMobile())
    mq.addEventListener?.('change', handler)
    return () => mq.removeEventListener?.('change', handler)
  }, [])

  return isMobile
}
