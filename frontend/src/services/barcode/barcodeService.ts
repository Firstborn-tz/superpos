import bwipjs from 'bwip-js/browser'

export type BarcodeType = 'code128' | 'ean13' | 'upca' | 'qrcode'

export const BARCODE_TYPE_LABELS: Record<BarcodeType, string> = {
  code128: 'Code128',
  ean13: 'EAN-13',
  upca: 'UPC-A',
  qrcode: 'QR Code',
}

const BWIP_MAP: Record<BarcodeType, string> = {
  code128: 'code128',
  ean13: 'ean13',
  upca: 'upca',
  qrcode: 'qrcode',
}

interface RenderOptions {
  data: string
  type: BarcodeType
  productName?: string
  price?: string
}

/**
 * Renders a barcode (or QR code) to a data URL PNG using bwip-js running
 * entirely client-side via an offscreen canvas. Works fully offline.
 */
export function renderBarcodeToDataUrl({ data, type }: RenderOptions): string {
  const canvas = document.createElement('canvas')
  try {
    bwipjs.toCanvas(canvas, {
      bcid: BWIP_MAP[type],
      text: data,
      scale: 3,
      height: type === 'qrcode' ? 25 : 12,
      includetext: type !== 'qrcode',
      textxalign: 'center',
    })
    return canvas.toDataURL('image/png')
  } catch (err) {
    console.error('Barcode render failed', err)
    throw new Error(`Could not generate ${BARCODE_TYPE_LABELS[type]} barcode for "${data}". Check the data format.`)
  }
}

export function isValidBarcodeDataForType(data: string, type: BarcodeType): boolean {
  if (!data) return false
  if (type === 'ean13') return /^\d{12,13}$/.test(data)
  if (type === 'upca') return /^\d{11,12}$/.test(data)
  return true
}
