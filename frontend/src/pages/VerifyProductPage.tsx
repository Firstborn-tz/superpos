import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import DashboardLayout from '@/components/layout/DashboardLayout'
import CameraScannerModal from '@/components/common/CameraScannerModal'
import { useAuthStore } from '@/store/authStore'
import { useDataStore } from '@/store/dataStore'
import { useGlobalBarcodeScanner } from '@/hooks/useGlobalBarcodeScanner'
import { useIsMobileDevice } from '@/hooks/useIsMobileDevice'
import type { InventoryItem } from '@/types'
import { isExpired, isExpiringSoon, isLowStock, isOutOfStock } from '@/utils/helpers'
import { SearchIcon, CameraIcon, CheckIcon, WarningIcon, BoxIcon } from '@/components/common/Icons'

function statusFor(item: InventoryItem) {
  if (isExpired(item.expiryDate)) return { label: 'Expired', cls: 'bg-red-100 text-danger' }
  if (isOutOfStock(item.currentStock)) return { label: 'Out of Stock', cls: 'bg-red-100 text-danger' }
  if (isLowStock(item.currentStock, item.initialStock)) return { label: 'Low Stock', cls: 'bg-amber-100 text-warning' }
  if (isExpiringSoon(item.expiryDate)) return { label: 'Expiring Soon', cls: 'bg-amber-100 text-warning' }
  return { label: 'In Stock', cls: 'bg-green-100 text-primary' }
}

export default function VerifyProductPage() {
  const user = useAuthStore((s) => s.user)
  const inventory = useDataStore((s) => s.inventory)
  const isMobile = useIsMobileDevice()

  const [result, setResult] = useState<InventoryItem | null>(null)
  const [notFoundCode, setNotFoundCode] = useState('')
  const [showCamera, setShowCamera] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const branchProducts = inventory.filter((i) => !user?.branchId || i.branchId === user.branchId)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleScan = useCallback(
    (code: string) => {
      const product = branchProducts.find((p) => p.barcode === code)
      if (product) {
        setResult(product)
        setNotFoundCode('')
      } else {
        setResult(null)
        setNotFoundCode(code)
      }
    },
    [branchProducts],
  )

  useGlobalBarcodeScanner(handleScan, !showCamera)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const input = inputRef.current
    if (!input) return
    const code = input.value.trim()
    input.value = ''
    if (!code) return
    handleScan(code)
    input.focus()
  }

  function handleCameraDetected(code: string) {
    handleScan(code)
    setShowCamera(false)
  }

  const status = result ? statusFor(result) : null

  return (
    <DashboardLayout title="Verify Product">
      <div className="max-w-lg mx-auto space-y-5">
        <form onSubmit={handleSubmit} className="bg-app-card rounded-card shadow-card p-4 flex gap-2">
          <div className="relative flex-1">
            <SearchIcon width={16} height={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-app-faint" />
            <input
              ref={inputRef}
              defaultValue=""
              placeholder="Scan or type a barcode"
              autoFocus
              className="w-full pl-9 pr-3 py-3 border border-app-border-input rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          {isMobile && (
            <button
              type="button"
              onClick={() => setShowCamera(true)}
              className="px-4 py-3 bg-secondary hover:bg-blue-700 text-white rounded-lg transition-colors"
              aria-label="Scan with camera"
            >
              <CameraIcon width={18} height={18} />
            </button>
          )}
        </form>

        {result && status && (
          <div className="bg-app-card rounded-card shadow-card p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-primary-50 text-primary flex items-center justify-center mx-auto mb-4">
              <CheckIcon width={28} height={28} />
            </div>
            <h2 className="text-2xl font-bold text-app-heading mb-2">{result.productName}</h2>
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold mb-4 ${status.cls}`}>
              {status.label}
            </span>
            <div className="bg-app-alt rounded-lg p-5 flex items-center justify-center gap-3">
              <BoxIcon width={20} height={20} className="text-app-muted" />
              <div>
                <div className="text-xs text-app-faint">Available stock</div>
                <div className="text-3xl font-bold text-app-heading">{result.currentStock}</div>
              </div>
            </div>
          </div>
        )}

        {notFoundCode && (
          <div className="bg-app-card rounded-card shadow-card p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-50 text-danger flex items-center justify-center mx-auto mb-4">
              <WarningIcon width={28} height={28} />
            </div>
            <h2 className="text-lg font-bold text-app-heading mb-1">Product not found</h2>
            <p className="text-sm text-app-muted font-mono">{notFoundCode}</p>
          </div>
        )}

        {!result && !notFoundCode && (
          <div className="text-center text-app-faint text-sm py-10">
            Scan or type a barcode to check the product name and stock available.
          </div>
        )}
      </div>

      <CameraScannerModal open={showCamera} onClose={() => setShowCamera(false)} onDetected={handleCameraDetected} />
    </DashboardLayout>
  )
}
