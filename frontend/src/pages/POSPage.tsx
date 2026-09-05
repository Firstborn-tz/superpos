import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '@/components/layout/DashboardLayout'
import Modal from '@/components/common/Modal'
import CameraScannerModal from '@/components/common/CameraScannerModal'
import { useAuthStore } from '@/store/authStore'
import { useDataStore } from '@/store/dataStore'
import { useCartStore } from '@/store/cartStore'
import { useHeldSalesStore } from '@/store/heldSalesStore'
import { syncService } from '@/services/sync/syncService'
import { logActivity } from '@/services/activity/activityService'
import { toast } from '@/store/toastStore'
import { useNotificationStore } from '@/store/notificationStore'
import { useGlobalBarcodeScanner } from '@/hooks/useGlobalBarcodeScanner'
import { useIsMobileDevice } from '@/hooks/useIsMobileDevice'
import type { InventoryItem, CartItem, PaymentMethod, SaleRecord } from '@/types'
import { formatCurrency, formatDateTime, generateId, generateTransactionId, isExpired, isLowStock } from '@/utils/helpers'
import { consumeFEFO } from '@/utils/batches'
import { printElement } from '@/utils/print'
import {
  SearchIcon,
  PlusIcon,
  MinusIcon,
  TrashIcon,
  WarningIcon,
  DollarIcon,
  PrintIcon,
  ReportsIcon,
  ChevronRightIcon,
  CameraIcon,
  CheckIcon,
} from '@/components/common/Icons'

export default function POSPage() {
  const user = useAuthStore((s) => s.user)
  const { inventory, sales, upsertInventoryItem, addSale } = useDataStore()
  const cart = useCartStore()
  const heldSales = useHeldSalesStore()

  const [search, setSearch] = useState('')
  const [scanError, setScanError] = useState('')
  const [showPayment, setShowPayment] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showHeld, setShowHeld] = useState(false)
  const [showCameraScanner, setShowCameraScanner] = useState(false)
  const [justAddedId, setJustAddedId] = useState<string | null>(null)
  const [lastReceipt, setLastReceipt] = useState<SaleRecord | null>(null)
  const barcodeRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const isMobile = useIsMobileDevice()

  useEffect(() => {
    barcodeRef.current?.focus()
  }, [])

  const branchProducts = useMemo(
    () => inventory.filter((i) => !user?.branchId || i.branchId === user.branchId),
    [inventory, user],
  )

  const branchSales = useMemo(
    () => sales.filter((s) => !user?.branchId || s.branchId === user.branchId).slice(0, 30),
    [sales, user],
  )

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return branchProducts
    const q = search.toLowerCase()
    return branchProducts.filter((p) => p.productName.toLowerCase().includes(q) || p.barcode.includes(q))
  }, [branchProducts, search])

  const addToCart = useCallback(
    (product: InventoryItem) => {
      setScanError('')
      if (isExpired(product.expiryDate)) {
        const message = `${product.productName} is expired and cannot be sold.`
        setScanError(message)
        return { ok: false, message }
      }
      const result = cart.addItem(product)
      if (!result.ok) {
        const message = result.message ?? 'Could not add item'
        setScanError(message)
        return { ok: false, message }
      }
      // Brief checkmark flash on the product card that was just added,
      // for satisfying visual feedback that the scan/click registered.
      setJustAddedId(product.id)
      setTimeout(() => setJustAddedId((current) => (current === product.id ? null : current)), 500)
      return { ok: true, message: `${product.productName} added to cart` }
    },
    [cart],
  )

  const handleScan = useCallback(
    (code: string) => {
      const product = branchProducts.find((p) => p.barcode === code)
      if (!product) {
        const message = `No product found with barcode ${code}`
        setScanError(message)
        return { ok: false, message }
      }
      return addToCart(product)
    },
    [branchProducts, addToCart],
  )

  const handleCameraDetected = useCallback(
    (code: string) => {
      const outcome = handleScan(code)
      setShowCameraScanner(false)
      if (outcome.ok) {
        toast.success(outcome.message)
      } else {
        toast.error(outcome.message)
      }
    },
    [handleScan],
  )

  // Captures scanner input anywhere on the page, not just while the
  // barcode text field is focused (e.g. cashier clicked into the cart).
  useGlobalBarcodeScanner(handleScan, !showPayment && !showHistory && !showHeld && !lastReceipt && !showCameraScanner)

  function handleBarcodeSubmit(e: FormEvent) {
    e.preventDefault()
    // Read the DOM value directly rather than through React state. A
    // controlled input re-renders on every keystroke, and a hardware
    // scanner can type a full code faster than that render cycle keeps
    // up with - dropping characters on rapid successive scans. Going
    // straight to the input element avoids that race entirely.
    const input = barcodeRef.current
    if (!input) return
    const code = input.value.trim()
    input.value = ''
    if (!code) return
    handleScan(code)
    input.focus()
  }

  function handleHoldSale() {
    if (cart.items.length === 0) return
    heldSales.hold(cart.items)
    cart.clearCart()
    toast.success('Sale parked. Resume it anytime from "Held Sales".')
    barcodeRef.current?.focus()
  }

  function handleResumeHeld(id: string) {
    if (cart.items.length > 0) {
      toast.error('Clear or complete the current cart before resuming a held sale.')
      return
    }
    const items = heldSales.resume(id)
    if (items) {
      cart.loadItems(items)
      setShowHeld(false)
      toast.success('Held sale resumed.')
    }
  }

  function completeSale(payment: { method: PaymentMethod; amountReceived?: number; changeAmount?: number }) {
    const subtotal = cart.getSubtotal()
    const discountAmount = cart.getDiscountAmount()

    // Consume stock oldest-expiring-batch-first (FEFO) for each line, and
    // use the *actual* cost of what was consumed for profit - this can
    // differ from the flat estimate shown while browsing the cart if the
    // batches being sold from have different buying prices.
    const saleItems: CartItem[] = []
    let actualTotalCost = 0
    let anyShortfall = false

    cart.items.forEach((cartItem) => {
      const product = inventory.find((i) => i.id === cartItem.inventoryId)
      if (!product) {
        saleItems.push(cartItem)
        return
      }
      const { updatedItem, totalCost, shortfall } = consumeFEFO(product, cartItem.quantity)
      if (shortfall > 0) anyShortfall = true

      upsertInventoryItem(updatedItem)
      syncService.addPendingOperation('ADD_STOCK', updatedItem)

      const actualUnitCost = cartItem.quantity > 0 ? totalCost / cartItem.quantity : cartItem.buyingPrice
      saleItems.push({ ...cartItem, buyingPrice: actualUnitCost })
      actualTotalCost += totalCost

      // Notify admin the moment a sale pushes an item into low-stock
      // territory, rather than waiting for them to notice on Dashboard.
      const wasLow = isLowStock(product.currentStock, product.initialStock)
      const nowLow = isLowStock(updatedItem.currentStock, updatedItem.initialStock)
      if (!wasLow && nowLow) {
        useNotificationStore.getState().add({
          type: 'warning',
          title: 'Low stock alert',
          message: `${product.productName} at ${user?.branchName ?? 'a branch'} is now low on stock (${updatedItem.currentStock} left).`,
          audience: 'admin',
        })
      }
    })

    if (anyShortfall) {
      // Shouldn't normally happen since cart quantity is capped to
      // sellable stock at add-time, but if inventory changed underneath
      // this sale (e.g. synced from another device), flag it rather
      // than silently recording an inaccurate profit figure.
      logActivity('SALE', 'Warning: a sale exceeded available non-expired stock for one or more items', user)
    }

    const totalAmount = subtotal - discountAmount
    const sale: SaleRecord = {
      id: generateId('sale'),
      transactionId: generateTransactionId(),
      items: saleItems,
      subtotal,
      discountAmount,
      totalAmount,
      totalProfit: totalAmount - actualTotalCost,
      paymentMethod: payment.method,
      amountReceived: payment.amountReceived,
      changeAmount: payment.changeAmount,
      createdAt: new Date().toISOString(),
      cashierName: user?.fullName ?? 'Cashier',
      branchId: user?.branchId,
      branchName: user?.branchName,
    }

    addSale(sale)
    syncService.addPendingOperation('SALE', sale)
    logActivity('SALE', `Sale ${sale.transactionId} - ${formatCurrency(sale.totalAmount)}`, user)
    useNotificationStore.getState().add({
      type: 'success',
      title: 'New sale',
      message: `${sale.cashierName} at ${sale.branchName ?? 'a branch'} sold ${formatCurrency(sale.totalAmount)}.`,
      audience: 'admin',
    })

    setLastReceipt(sale)
    cart.clearCart()
    setShowPayment(false)
    toast.success('Sale completed')
    setTimeout(() => barcodeRef.current?.focus(), 100)
  }

  return (
    <DashboardLayout title="Point of Sale">
      <div className="grid lg:grid-cols-[1fr_380px] gap-5 h-full">
        {/* Left: scan + products */}
        <div className="space-y-4 min-w-0">
          <form onSubmit={handleBarcodeSubmit} className="bg-app-card rounded-card shadow-card p-4 flex gap-2">
            <input
              ref={barcodeRef}
              defaultValue=""
              placeholder="Scan or type barcode"
              autoFocus
              className="flex-1 px-4 py-3 border border-app-border-input rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
            <button
              type="submit"
              className="px-5 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold text-sm transition-colors"
            >
              Add
            </button>
            {/* Camera scanning only makes sense on a phone/tablet with a
                rear camera positioned for scanning - hidden on desktop,
                where a physical scanner or manual entry is the norm. */}
            {isMobile && (
              <button
                type="button"
                onClick={() => setShowCameraScanner(true)}
                className="px-4 py-3 bg-secondary hover:bg-blue-700 text-white rounded-lg font-semibold text-sm transition-colors flex items-center gap-2"
                aria-label="Scan with camera"
              >
                <CameraIcon width={18} height={18} />
              </button>
            )}
          </form>

          {scanError && (
            <div className="flex items-center gap-2 bg-red-50 text-danger text-sm rounded-lg px-3.5 py-2.5">
              <WarningIcon width={16} height={16} />
              {scanError}
            </div>
          )}

          <div className="bg-app-card rounded-card shadow-card p-4">
            <div className="relative mb-4">
              <SearchIcon width={16} height={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-app-faint" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products by name or barcode..."
                className="w-full pl-9 pr-3 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[55vh] overflow-y-auto">
              {filteredProducts.length === 0 ? (
                <p className="col-span-full text-center text-app-faint py-8 text-sm">No products found</p>
              ) : (
                filteredProducts.map((p) => {
                  const expired = isExpired(p.expiryDate)
                  const outOfStock = p.currentStock <= 0
                  return (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p)}
                      disabled={expired || outOfStock}
                      className="relative text-left border border-app-border rounded-lg p-3 hover:border-primary hover:shadow-sm active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="font-semibold text-sm text-app-heading truncate">{p.productName}</div>
                      <div className="text-primary font-bold text-sm mt-1">{formatCurrency(p.sellingPrice)}</div>
                      <div className="text-xs text-app-faint mt-1">
                        {expired ? 'Expired' : outOfStock ? 'Out of stock' : `${p.currentStock} in stock`}
                      </div>
                      {justAddedId === p.id && (
                        <div className="absolute inset-0 flex items-center justify-center bg-primary/90 rounded-lg pointer-events-none">
                          <CheckIcon width={28} height={28} className="text-white animate-[checkPop_0.5s_ease-out]" />
                        </div>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => setShowHistory(true)}
              className="flex items-center gap-2 text-sm font-medium text-app-body hover:text-primary"
            >
              <ReportsIcon width={16} height={16} />
              Sales history
            </button>
            <button
              onClick={() => setShowHeld(true)}
              className="flex items-center gap-2 text-sm font-medium text-app-body hover:text-primary"
            >
              <ChevronRightIcon width={16} height={16} />
              Held sales {heldSales.held.length > 0 && `(${heldSales.held.length})`}
            </button>
            <button
              onClick={() => navigate('/refunds')}
              className="flex items-center gap-2 text-sm font-medium text-app-body hover:text-primary"
            >
              <ChevronRightIcon width={16} height={16} />
              Process a refund
            </button>
          </div>
        </div>

        {/* Right: cart */}
        <div className="bg-app-card rounded-card shadow-card flex flex-col overflow-hidden">
          <div className="px-5 py-4 border-b border-app-border flex items-center justify-between">
            <h2 className="font-bold text-app-heading">Cart ({cart.getItemCount()})</h2>
            {cart.items.length > 0 && (
              <button onClick={handleHoldSale} className="text-xs font-semibold text-secondary hover:underline">
                Hold sale
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
            {cart.items.length === 0 ? (
              <p className="text-center text-app-faint text-sm py-10">Cart is empty. Scan a product to begin.</p>
            ) : (
              cart.items.map((item) => (
                <div
                  key={item.id}
                  className="border border-app-border rounded-lg p-3 animate-[cartPop_0.3s_ease-out]"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-app-heading truncate">{item.productName}</div>
                      <div className="text-xs text-app-faint">{formatCurrency(item.unitPrice)} / unit</div>
                    </div>
                    <button
                      onClick={() => cart.removeItem(item.inventoryId)}
                      className="text-gray-300 hover:text-danger shrink-0"
                      aria-label="Remove item"
                    >
                      <TrashIcon width={16} height={16} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => cart.updateQuantity(item.inventoryId, item.quantity - 1)}
                        className="w-7 h-7 flex items-center justify-center rounded-md bg-app-hover hover:bg-app-hover-strong text-app-body"
                      >
                        <MinusIcon width={14} height={14} />
                      </button>
                      <span className="w-8 text-center font-semibold text-sm">{item.quantity}</span>
                      <button
                        onClick={() => cart.updateQuantity(item.inventoryId, item.quantity + 1)}
                        className="w-7 h-7 flex items-center justify-center rounded-md bg-app-hover hover:bg-app-hover-strong text-app-body"
                      >
                        <PlusIcon width={14} height={14} />
                      </button>
                    </div>
                    <span className="font-bold text-sm text-app-heading">{formatCurrency(item.totalPrice)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-app-border">
                    <label className="text-xs text-app-faint">Discount</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={item.discountPercent ?? 0}
                      onChange={(e) => cart.setItemDiscount(item.inventoryId, parseFloat(e.target.value) || 0)}
                      className="w-16 px-2 py-1 border border-app-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <span className="text-xs text-app-faint">%</span>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="border-t border-app-border p-5 space-y-2">
            {cart.getDiscountAmount() > 0 && (
              <>
                <div className="flex justify-between text-sm text-app-muted">
                  <span>Subtotal</span>
                  <span>{formatCurrency(cart.getSubtotal())}</span>
                </div>
                <div className="flex justify-between text-sm text-warning">
                  <span>Discount</span>
                  <span>-{formatCurrency(cart.getDiscountAmount())}</span>
                </div>
              </>
            )}
            <div className="flex justify-between items-center">
              <span className="text-app-muted font-medium">Total</span>
              <span
                key={cart.getTotal()}
                className="text-3xl font-bold text-primary inline-block animate-[totalBump_0.3s_ease-out]"
              >
                {formatCurrency(cart.getTotal())}
              </span>
            </div>
            <button
              onClick={() => setShowPayment(true)}
              disabled={cart.items.length === 0}
              className="w-full bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <DollarIcon width={18} height={18} />
              Charge {formatCurrency(cart.getTotal())}
            </button>
            {cart.items.length > 0 && (
              <button onClick={() => cart.clearCart()} className="w-full text-sm text-app-faint hover:text-danger">
                Clear cart
              </button>
            )}
          </div>
        </div>
      </div>

      <PaymentModal open={showPayment} onClose={() => setShowPayment(false)} total={cart.getTotal()} onComplete={completeSale} />

      <ReceiptModal receipt={lastReceipt} onClose={() => setLastReceipt(null)} />

      <CameraScannerModal
        open={showCameraScanner}
        onClose={() => setShowCameraScanner(false)}
        onDetected={handleCameraDetected}
      />

      <Modal open={showHistory} onClose={() => setShowHistory(false)} title="Sales History" maxWidth="max-w-2xl">
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {branchSales.length === 0 ? (
            <p className="text-center text-app-faint py-8 text-sm">No sales yet</p>
          ) : (
            branchSales.map((s) => (
              <div key={s.id} className="border border-app-border rounded-lg p-3 flex justify-between items-center text-sm">
                <div>
                  <div className="font-mono text-xs text-app-muted">{s.transactionId}</div>
                  <div className="text-app-faint text-xs">{formatDateTime(s.createdAt)}</div>
                  {s.refunded && <div className="text-xs text-danger font-semibold mt-0.5">Refunded</div>}
                </div>
                <div className="text-right">
                  <div className="font-bold text-app-heading">{formatCurrency(s.totalAmount)}</div>
                  <div className="text-xs text-app-faint capitalize">{s.paymentMethod.replace('_', ' ')}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>

      <Modal open={showHeld} onClose={() => setShowHeld(false)} title="Held Sales" maxWidth="max-w-lg">
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {heldSales.held.length === 0 ? (
            <p className="text-center text-app-faint py-8 text-sm">No held sales</p>
          ) : (
            heldSales.held.map((h) => (
              <div key={h.id} className="border border-app-border rounded-lg p-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm text-app-heading">{h.label}</div>
                  <div className="text-xs text-app-faint">
                    {h.items.length} item(s) &middot; {formatDateTime(h.heldAt)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleResumeHeld(h.id)}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Resume
                  </button>
                  <button
                    onClick={() => heldSales.discard(h.id)}
                    className="text-xs font-semibold text-danger hover:underline"
                  >
                    Discard
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>
    </DashboardLayout>
  )
}

interface PaymentModalProps {
  open: boolean
  onClose: () => void
  total: number
  onComplete: (payment: { method: PaymentMethod; amountReceived?: number; changeAmount?: number }) => void
}

function PaymentModal({ open, onClose, total, onComplete }: PaymentModalProps) {
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [received, setReceived] = useState('')

  useEffect(() => {
    if (open) {
      setMethod('cash')
      setReceived('')
    }
  }, [open])

  const receivedNum = parseFloat(received) || 0
  const change = method === 'cash' ? Math.max(0, receivedNum - total) : 0
  const canSubmit = method === 'mobile_money' || receivedNum >= total

  function handleSubmit() {
    onComplete({
      method,
      amountReceived: method === 'cash' ? receivedNum : total,
      changeAmount: method === 'cash' ? change : 0,
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="Process Payment">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMethod('cash')}
            className={`py-3 rounded-lg text-sm font-semibold border-2 transition-colors ${
              method === 'cash' ? 'border-primary bg-primary-50 text-primary' : 'border-app-border text-app-muted'
            }`}
          >
            Cash
          </button>
          <button
            onClick={() => setMethod('mobile_money')}
            className={`py-3 rounded-lg text-sm font-semibold border-2 transition-colors ${
              method === 'mobile_money' ? 'border-primary bg-primary-50 text-primary' : 'border-app-border text-app-muted'
            }`}
          >
            Mobile Money
          </button>
        </div>

        <div className="bg-app-alt rounded-lg p-4 text-center">
          <div className="text-xs text-app-muted font-medium">Amount Due</div>
          <div className="text-2xl font-bold text-app-heading">{formatCurrency(total)}</div>
        </div>

        {method === 'cash' && (
          <div>
            <label className="block text-sm font-medium text-app-body mb-1">Amount received</label>
            <input
              type="number"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              placeholder="0"
              autoFocus
              className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {receivedNum > 0 && (
              <div className="flex justify-between mt-2 text-sm">
                <span className="text-app-muted">Change</span>
                <span className="font-bold text-primary">{formatCurrency(change)}</span>
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full bg-primary hover:bg-primary-dark disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-colors"
        >
          Complete Sale
        </button>
      </div>
    </Modal>
  )
}

function ReceiptModal({ receipt, onClose }: { receipt: SaleRecord | null; onClose: () => void }) {
  if (!receipt) return null

  function handlePrint() {
    printElement('receipt-print', 'thermal')
  }

  return (
    <Modal open={!!receipt} onClose={onClose} title="Receipt">
      <div id="receipt-print" className="space-y-4">
        <div className="text-center">
          <div className="font-bold text-lg">SuperPOS</div>
          <div className="text-xs text-app-muted">{receipt.branchName ?? 'Main Branch'}</div>
          <div className="text-xs text-app-faint mt-1">{formatDateTime(receipt.createdAt)}</div>
          <div className="text-xs font-mono text-app-faint">{receipt.transactionId}</div>
        </div>
        <div className="border-t border-dashed border-app-border-input pt-3 space-y-1.5">
          {receipt.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="text-app-body">
                {item.productName} x{item.quantity}
                {!!item.discountPercent && <span className="text-warning"> (-{item.discountPercent}%)</span>}
              </span>
              <span className="font-medium">{formatCurrency(item.totalPrice)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-dashed border-app-border-input pt-3 space-y-1 text-sm">
          {receipt.discountAmount > 0 && (
            <>
              <div className="flex justify-between text-app-muted">
                <span>Subtotal</span>
                <span>{formatCurrency(receipt.subtotal)}</span>
              </div>
              <div className="flex justify-between text-warning">
                <span>Discount</span>
                <span>-{formatCurrency(receipt.discountAmount)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between font-bold text-base">
            <span>Total</span>
            <span>{formatCurrency(receipt.totalAmount)}</span>
          </div>
          <div className="flex justify-between text-app-muted">
            <span>Payment</span>
            <span className="capitalize">{receipt.paymentMethod.replace('_', ' ')}</span>
          </div>
          {receipt.paymentMethod === 'cash' && (
            <>
              <div className="flex justify-between text-app-muted">
                <span>Received</span>
                <span>{formatCurrency(receipt.amountReceived ?? 0)}</span>
              </div>
              <div className="flex justify-between text-app-muted">
                <span>Change</span>
                <span>{formatCurrency(receipt.changeAmount ?? 0)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between text-app-faint text-xs pt-1">
            <span>Cashier</span>
            <span>{receipt.cashierName}</span>
          </div>
        </div>
        <div className="text-center text-xs text-app-faint border-t border-dashed border-app-border-input pt-3">
          Thank you for shopping with us!
        </div>
      </div>
      <button
        onClick={handlePrint}
        className="w-full mt-4 flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-semibold py-2.5 rounded-lg transition-colors"
      >
        <PrintIcon width={16} height={16} />
        Print Receipt
      </button>
    </Modal>
  )
}
