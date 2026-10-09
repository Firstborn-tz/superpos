import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { BARCODE_TYPE_LABELS, isValidBarcodeDataForType, renderBarcodeToDataUrl, type BarcodeType } from '@/services/barcode/barcodeService'
import { formatCurrency, generateBarcode } from '@/utils/helpers'
import { printElement } from '@/utils/print'
import { PrintIcon, WarningIcon } from '@/components/common/Icons'

type PrinterType = 'usb' | 'bluetooth'
type PrintMode = 'barcode' | 'text'

interface InventoryNavState {
  barcode?: string
  productName?: string
  price?: number
}

interface LabelSize {
  key: string
  label: string
  width: number
  height: number
}

// Common die-cut label sizes used with thermal label printers (Xprinter,
// GoDEX, TSC, Zebra, Flexi, etc). 50x30mm is set as the default here to
// match a Flexi 4B-2074A with 50x30mm labels and a 2mm gap - the gap
// itself is detected automatically by the printer's sensor once the
// driver/print dialog page size is set to match the label, so it doesn't
// need a separate setting here.
const LABEL_SIZES: LabelSize[] = [
  { key: '50x30', label: '50 x 30 mm (your Flexi 4B-2074A)', width: 50, height: 30 },
  { key: '40x30', label: '40 x 30 mm', width: 40, height: 30 },
  { key: '50x25', label: '50 x 25 mm', width: 50, height: 25 },
  { key: '40x25', label: '40 x 25 mm', width: 40, height: 25 },
  { key: '30x20', label: '30 x 20 mm (small items)', width: 30, height: 20 },
]

export default function BarcodePage() {
  const location = useLocation()
  const navState = (location.state as InventoryNavState | null) ?? null

  // If we arrived here from a real inventory product (via the "Print"
  // button on the Inventory page), the barcode ID, product name, and
  // price are locked to that record - staff can't retype them, so the
  // printed sticker can never drift out of sync with what's actually in
  // the system and what rings up at checkout.
  const isLinkedToProduct = Boolean(navState?.barcode)

  const [type, setType] = useState<BarcodeType>('code128')
  const [data] = useState(navState?.barcode ?? generateBarcode())
  const [productName] = useState(navState?.productName ?? '')
  const [price] = useState(navState?.price ? String(navState.price) : '')
  const [labelText, setLabelText] = useState(navState?.productName ?? '')
  const [textPosition, setTextPosition] = useState<'top' | 'bottom'>('top')
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('center')
  const [boldText, setBoldText] = useState(false)
  const [printMode, setPrintMode] = useState<PrintMode>('barcode')
  const [quantity, setQuantity] = useState(1)
  const [printerType, setPrinterType] = useState<PrinterType>('usb')
  const [labelSizeKey, setLabelSizeKey] = useState(LABEL_SIZES[0].key)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [btConnected, setBtConnected] = useState(false)
  const [btStatus, setBtStatus] = useState('')

  const labelSize = LABEL_SIZES.find((s) => s.key === labelSizeKey) ?? LABEL_SIZES[0]
  const fittedText = useMemo(() => fitLabelText(labelText, labelSize.width - 4, printMode === 'text' ? labelSize.height - 4 : Math.min(8, labelSize.height * 0.3), boldText), [labelText, labelSize, boldText, printMode])

  // For QR codes, embed the full readable product info in the scannable
  // data itself - useful for phone-camera scans since the printed label
  // itself won't show name/price as text. For Code128/EAN-13/UPC-A, the
  // symbol can only reliably hold the short numeric ID (a hardware/
  // scanner limitation) - that ID is what the POS looks up against
  // inventory to pull name and price at checkout.
  const encodedData = useMemo(() => {
    if (type === 'qrcode' && (productName || price)) {
      const parts = [data]
      if (productName) parts.push(productName)
      if (price) parts.push(formatCurrency(parseFloat(price)))
      return parts.join(' | ')
    }
    return data
  }, [type, data, productName, price])

  useEffect(() => {
    handleGenerate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type])

  function handleGenerate() {
    setError('')
    if (!isValidBarcodeDataForType(data, type)) {
      setError(`Invalid data for ${BARCODE_TYPE_LABELS[type]}. Please check the format.`)
      setPreviewUrl(null)
      return
    }
    try {
      const url = renderBarcodeToDataUrl({ data: encodedData, type })
      setPreviewUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate barcode')
      setPreviewUrl(null)
    }
  }

  async function handleConnectBluetooth() {
    setBtStatus('')
    const nav = navigator as Navigator & { bluetooth?: { requestDevice: (opts: unknown) => Promise<{ name?: string }> } }
    if (!nav.bluetooth) {
      setBtStatus('Bluetooth printing is not supported in this browser. Try Chrome on Android/desktop, or use USB printing.')
      return
    }
    try {
      const device = await nav.bluetooth.requestDevice({ acceptAllDevices: true })
      setBtConnected(true)
      setBtStatus(`Connected to ${device.name ?? 'printer'}. Ready to print.`)
    } catch {
      setBtStatus('Could not connect to a Bluetooth printer.')
    }
  }

  function handlePrint() {
    try {
      console.log('[SuperPOS] Print requested', { labelSize, quantity, printMode, hasPreview: !!previewUrl })
      printElement('barcode-print', 'label', { width: labelSize.width, height: labelSize.height })
    } catch (err) {
      console.error('[SuperPOS] Print failed', err)
      setError('Printing failed unexpectedly. Check the browser console (F12) for details.')
    }
  }

  return (
    <DashboardLayout title="Barcode Generator">
      <div className="grid lg:grid-cols-[1fr_380px] gap-5">
        <div className="bg-app-card rounded-card shadow-card p-5 space-y-4">
          {isLinkedToProduct && (
            <div className="bg-primary-50 text-primary text-sm rounded-lg px-3.5 py-2.5">
              Name, price, and barcode ID are locked to the inventory
              record, the printed sticker always matches what's in the system.
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-app-body mb-2">Barcode type</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(BARCODE_TYPE_LABELS) as BarcodeType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                    type === t ? 'border-primary bg-primary-50 text-primary' : 'border-app-border text-app-muted'
                  }`}
                >
                  {BARCODE_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-app-body mb-1">Barcode ID</label>
            <input
              value={data}
              readOnly={isLinkedToProduct}
              disabled={isLinkedToProduct}
              className={`w-full px-3.5 py-2.5 border rounded-lg text-sm font-mono focus:outline-none ${
                isLinkedToProduct
                  ? 'border-app-border bg-app-alt text-app-muted cursor-not-allowed'
                  : 'border-app-border-input focus:ring-2 focus:ring-primary'
              }`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-app-body mb-1">Product name</label>
              <input
                value={productName}
                readOnly
                disabled
                placeholder={isLinkedToProduct ? '' : 'Not linked to a product'}
                className="w-full px-3.5 py-2.5 border border-app-border bg-app-alt text-app-muted rounded-lg text-sm cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-app-body mb-1">Price</label>
              <input
                value={price ? formatCurrency(parseFloat(price)) : ''}
                readOnly
                disabled
                placeholder={isLinkedToProduct ? '' : 'Not linked to a product'}
                className="w-full px-3.5 py-2.5 border border-app-border bg-app-alt text-app-muted rounded-lg text-sm cursor-not-allowed"
              />
            </div>
          </div>
          
          {!isLinkedToProduct && (
            <p className="text-xs text-app-faint">
              To print a label for a real product, go to Inventory and click "Print" next to the item. This page
              only generates a standalone test barcode when opened directly.
            </p>
          )}

          <div className="space-y-3 rounded-lg border border-app-border p-3">
            <div>
              <label className="block text-sm font-medium text-app-body mb-1">Print type</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setPrintMode('barcode')} className={`py-2 rounded-lg text-sm font-medium border ${printMode === 'barcode' ? 'border-primary bg-primary-50 text-primary' : 'border-app-border text-app-muted'}`}>Barcode label</button>
                <button type="button" onClick={() => setPrintMode('text')} className={`py-2 rounded-lg text-sm font-medium border ${printMode === 'text' ? 'border-primary bg-primary-50 text-primary' : 'border-app-border text-app-muted'}`}>Text only</button>
              </div>
              <p className="text-xs text-app-faint mt-1">Text only prints your custom text on its own label, without a barcode.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-app-body mb-1">Custom label text</label>
              <textarea value={labelText} onChange={(e) => setLabelText(e.target.value)} rows={2} maxLength={160} placeholder="Write your own label text" className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              <p className="text-xs text-app-faint mt-1">Text size adjusts to fit the label. Use line breaks to control wrapping.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-medium text-app-body">Text position<select value={textPosition} onChange={(e) => setTextPosition(e.target.value as 'top' | 'bottom')} className="mt-1 w-full px-3 py-2 border border-app-border-input rounded-lg bg-app-card"><option value="top">Above barcode</option><option value="bottom">Below barcode</option></select></label>
              <label className="text-sm font-medium text-app-body">Alignment<select value={textAlign} onChange={(e) => setTextAlign(e.target.value as 'left' | 'center' | 'right')} className="mt-1 w-full px-3 py-2 border border-app-border-input rounded-lg bg-app-card"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
            </div>
            <label className="flex items-center gap-2 text-sm text-app-body"><input type="checkbox" checked={boldText} onChange={(e) => setBoldText(e.target.checked)} /> Bold text</label>
          </div>

          <div>
            <label className="block text-sm font-medium text-app-body mb-1">Label Size</label>
            <select
              value={labelSizeKey}
              onChange={(e) => setLabelSizeKey(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {LABEL_SIZES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-app-faint mt-1">
              Match this to the die-cut labels loaded in your thermal label printer.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-app-body mb-1">Quantity</label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-app-body mb-1">Printer type</label>
              <select
                value={printerType}
                onChange={(e) => setPrinterType(e.target.value as PrinterType)}
                className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="usb">USB</option>
                <option value="bluetooth">Bluetooth</option>
              </select>
            </div>
          </div>

          {printerType === 'bluetooth' && (
            <div className="bg-app-alt rounded-lg p-3 space-y-2">
              <button
                onClick={handleConnectBluetooth}
                type="button"
                className="text-sm font-semibold text-secondary hover:underline"
              >
                {btConnected ? 'Reconnect printer' : 'Connect Bluetooth Printer'}
              </button>
              {btStatus && <p className="text-xs text-app-muted">{btStatus}</p>}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red-50 text-danger text-sm rounded-lg px-3 py-2">
              <WarningIcon width={16} height={16} />
              {error}
            </div>
          )}

          <button
            onClick={handleGenerate}
            className="w-full bg-primary hover:bg-primary-dark text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            Regenerate preview
          </button>
        </div>

        <div className="bg-app-card rounded-card shadow-card p-5 flex flex-col">
          <h2 className="font-bold text-app-heading mb-4">Preview</h2>
          <div className="flex-1 flex items-center justify-center bg-app-alt rounded-lg p-4 min-h-[200px]">
            {previewUrl ? (
              <div className="bg-white border border-app-border rounded-lg p-3">
                <LabelPreview imageUrl={previewUrl} width={labelSize.width} height={labelSize.height} text={printMode === 'text' ? labelText : ''} fittedText={fittedText} textPosition={textPosition} textAlign={textAlign} boldText={boldText} showBarcode={printMode === 'barcode'} />
                <p className="text-xs text-app-faint mt-2">
                  {labelSize.width} x {labelSize.height} mm label &middot; {quantity} {quantity > 1 ? 'copies' : 'copy'}
                </p>
              </div>
            ) : (
              <p className="text-app-faint text-sm">No preview available</p>
            )}
          </div>

          {/* Printed output: composed label text and barcode, sized to
              the physical label dimensions with no page margins. Hidden
              on screen (Tailwind's print:block only shows it inside an
              actual print job triggered by printElement below). */}
          {previewUrl && (
            <div id="barcode-print" className="hidden print:block">
              {Array.from({ length: quantity }).map((_, i) => (
                <LabelPreview
                  key={i}
                  imageUrl={previewUrl}
                  width={labelSize.width}
                  height={labelSize.height}
                  text={printMode === 'text' ? labelText : ''}
                  fittedText={fittedText}
                  textPosition={textPosition}
                  textAlign={textAlign}
                  boldText={boldText}
                  showBarcode={printMode === 'barcode'}
                  pageBreakAfter={i < quantity - 1 ? 'always' : 'auto'}
                />
              ))}
            </div>
          )}

          <button
            onClick={handlePrint}
            disabled={printMode === 'barcode' ? !previewUrl : !labelText.trim()}
            className="mt-4 w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            <PrintIcon width={16} height={16} />
            Print {quantity > 1 ? `${quantity} ${printMode === 'text' ? 'Text Labels' : 'Labels'}` : printMode === 'text' ? 'Text Label' : 'Label'}
          </button>
        </div>
      </div>
    </DashboardLayout>
  )
}

function fitLabelText(text: string, widthMm: number, heightMm: number, bold: boolean): { fontSizePx: number; lines: string[] } {
  const context = document.createElement('canvas').getContext('2d')
  const maxWidth = widthMm * 96 / 25.4
  const maxHeight = heightMm * 96 / 25.4
  const paragraphs = text.split('\n')
  for (let size = 24; size >= 8; size -= 1) {
    if (context) context.font = `${bold ? 'bold ' : ''}${size}px Arial`
    const lines: string[] = []
    for (const paragraph of paragraphs) {
      const words = paragraph.split(/\s+/).filter(Boolean)
      if (!words.length) { lines.push(''); continue }
      let line = ''
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word
        const wordWidth = (value: string) => context?.measureText(value).width ?? value.length * size * 0.55
        if (line && wordWidth(candidate) > maxWidth) { lines.push(line); line = word }
        else line = candidate
      }
      lines.push(line)
    }
    if (lines.length * size * 1.15 <= maxHeight) return { fontSizePx: size, lines }
  }
  return { fontSizePx: 8, lines: text.split('\n') }
}

function LabelPreview({ imageUrl, width, height, text, fittedText, textPosition, textAlign, boldText, showBarcode, pageBreakAfter }: {
  imageUrl: string; width: number; height: number; text: string
  fittedText: { fontSizePx: number; lines: string[] }; textPosition: 'top' | 'bottom'
  textAlign: 'left' | 'center' | 'right'; boldText: boolean; showBarcode: boolean; pageBreakAfter?: 'always' | 'auto'
}) {
  const textBlock = text.trim() ? <div style={{ fontSize: `${fittedText.fontSizePx}px`, fontWeight: boldText ? 700 : 400, textAlign: textAlign, lineHeight: 1.05, maxHeight: `${Math.min(8, height * 0.3)}mm`, overflow: 'hidden', overflowWrap: 'anywhere', flex: '0 0 auto' }}>{fittedText.lines.map((line, i) => <div key={i}>{line || '\u00a0'}</div>)}</div> : null
  return <div style={{ width: `${width}mm`, height: `${height}mm`, padding: '1mm 2mm', boxSizing: 'border-box', pageBreakAfter, display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: showBarcode ? 'center' : textPosition === 'top' ? 'flex-start' : 'flex-end', gap: '0.5mm', background: '#fff', color: '#000' }}>
    {textPosition === 'top' && textBlock}
    {showBarcode && <div style={{ minHeight: 0, flex: '1 1 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><img src={imageUrl} alt="Barcode" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /></div>}
    {textPosition === 'bottom' && textBlock}
  </div>
}
