/**
 * Prints only the element with the given id by temporarily marking it with
 * the `print-target` class and the body with `print-target-active`
 * (see the @media print rules in index.css). Falls back to a normal
 * full-page print if the element isn't found.
 *
 * - 'standard': normal page width, used for reports.
 * - 'thermal': narrow receipt-roll width (58mm-ish), used for customer
 *   receipts printed on a till's continuous-roll thermal printer.
 * - 'label': sized to the exact die-cut label dimensions passed in
 *   `labelSizeMm`, used for barcode stickers printed on a thermal label
 *   printer (e.g. Xprinter, GoDEX, TSC). No page margins are applied so
 *   the printer doesn't waste blank space around the label.
 */
export function printElement(
  elementId: string,
  format: 'standard' | 'thermal' | 'label' = 'standard',
  labelSizeMm?: { width: number; height: number },
): void {
  const el = document.getElementById(elementId)
  if (!el) {
    console.warn(`[printElement] No element found with id "${elementId}" - falling back to full-page print.`)
    window.print()
    return
  }

  let styleTag: HTMLStyleElement | null = null

  const cleanup = () => {
    el.classList.remove('print-target')
    document.body.classList.remove('print-target-active', 'print-target-thermal', 'print-target-label')
    if (styleTag) {
      styleTag.remove()
      styleTag = null
    }
    window.removeEventListener('afterprint', cleanup)
  }

  try {
    el.classList.add('print-target')
    document.body.classList.add('print-target-active')

    if (format === 'thermal') {
      document.body.classList.add('print-target-thermal')
    }

    if (format === 'label') {
      document.body.classList.add('print-target-label')
      if (labelSizeMm) {
        styleTag = document.createElement('style')
        styleTag.setAttribute('data-label-print-size', 'true')
        styleTag.textContent = `
          @media print {
            @page { size: ${labelSizeMm.width}mm ${labelSizeMm.height}mm; margin: 0; }
          }
        `
        document.head.appendChild(styleTag)
      }
    }

    window.addEventListener('afterprint', cleanup)
    window.print()
    // Fallback cleanup in case afterprint doesn't fire (some mobile browsers)
    setTimeout(cleanup, 2000)
  } catch (err) {
    console.error('[printElement] Printing failed:', err)
    cleanup()
    throw err
  }
}
