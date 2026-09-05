import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { BARCODE_TYPE_LABELS, isValidBarcodeDataForType, renderBarcodeToDataUrl, type BarcodeType } from '@/services/barcode/barcodeService'
import { formatCurrency, generateBarcode } from '@/utils/helpers'
import { printElement } from '@/utils/print'
import { PrintIcon, WarningIcon } from '@/components/common/Icons'

type PrinterType = 'usb' | 'bluetooth'

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
  const [quantity, setQuantity] = useState(1)
  const [printerType, setPrinterType] = useState<PrinterType>('usb')
  const [labelSizeKey, setLabelSizeKey] = useState(LABEL_SIZES[0].key)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [btConnected, setBtConnected] = useState(false)
  const [btStatus, setBtStatus] = useState('')

  const labelSize = LABEL_SIZES.find((s) => s.key === labelSizeKey) ?? LABEL_SIZES[0]

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
      console.log('[SuperPOS] Print requested', { labelSize, quantity, hasPreview: !!previewUrl })
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
              <div className="bg-app-card border border-app-border rounded-lg p-4 text-center">
                <img src={previewUrl} alt="Barcode preview" className="mx-auto max-w-full" />
                <p className="text-xs text-app-faint mt-2">
                  {labelSize.width} x {labelSize.height} mm label &middot; {quantity} {quantity > 1 ? 'copies' : 'copy'}
                </p>
              </div>
            ) : (
              <p className="text-app-faint text-sm">No preview available</p>
            )}
          </div>

          {/* Printed output: barcode image only, one per label, sized to
              the physical label dimensions with no page margins. Hidden
              on screen (Tailwind's print:block only shows it inside an
              actual print job triggered by printElement below). */}
          {previewUrl && (
            <div id="barcode-print" className="hidden print:block">
              {Array.from({ length: quantity }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: `${labelSize.width}mm`,
                    height: `${labelSize.height}mm`,
                    pageBreakAfter: i < quantity - 1 ? 'always' : 'auto',
                  }}
                  className="flex items-center justify-center"
                >
                  <img src={previewUrl} alt="Barcode" />
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handlePrint}
            disabled={!previewUrl}
            className="mt-4 w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            <PrintIcon width={16} height={16} />
            Print {quantity > 1 ? `${quantity} Labels` : 'Label'}
          </button>
        </div>
      </div>
    </DashboardLayout>
  )
}
