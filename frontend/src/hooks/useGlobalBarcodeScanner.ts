import { useEffect, useRef } from 'react'

const MAX_GAP_MS = 50 // scanners "type" far faster than a human between keystrokes
const MIN_LENGTH = 4

/**
 * Listens for keystrokes anywhere on the page and detects the
 * fast-burst-then-Enter pattern typical of a USB/Bluetooth barcode scanner,
 * even when focus is on a button or nothing at all. Calls `onScan` with the
 * captured code. Ignores bursts that look like normal human typing, and
 * skips capturing while focus is already inside a text input/textarea
 * (those handle their own submit-on-Enter).
 */
export function useGlobalBarcodeScanner(onScan: (code: string) => void, enabled = true) {
  const bufferRef = useRef('')
  const lastKeyTimeRef = useRef(0)

  useEffect(() => {
    if (!enabled) return

    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const isEditable =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (isEditable) return // let the focused field handle it normally

      const now = Date.now()
      const gap = now - lastKeyTimeRef.current
      lastKeyTimeRef.current = now

      if (gap > MAX_GAP_MS) {
        bufferRef.current = '' // too slow to be a scanner - start fresh
      }

      if (e.key === 'Enter') {
        const code = bufferRef.current.trim()
        bufferRef.current = ''
        if (code.length >= MIN_LENGTH) {
          onScan(code)
        }
        return
      }

      if (e.key.length === 1) {
        bufferRef.current += e.key
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onScan, enabled])
}
