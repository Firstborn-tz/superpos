import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '@/components/layout/DashboardLayout'
import Modal from '@/components/common/Modal'
import { useAuthStore } from '@/store/authStore'
import { useDataStore } from '@/store/dataStore'
import { syncService } from '@/services/sync/syncService'
import { logActivity } from '@/services/activity/activityService'
import { toast } from '@/store/toastStore'
import type { InventoryItem, SaleRecord, StockAdjustmentReason, StockAdjustmentRecord } from '@/types'
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  generateBarcode,
  generateBatchNumber,
  generateId,
  isExpired,
  isExpiringSoon,
  isLowStock,
  isOutOfStock,
} from '@/utils/helpers'
import { PlusIcon, SearchIcon, PrintIcon, BoxIcon, WarningIcon, ReportsIcon } from '@/components/common/Icons'
import { addBatch, adjustBatchQuantity, ensureBatches, getBatchStatusCounts } from '@/utils/batches'
import type { StockBatch } from '@/types'

type Filter = 'all' | 'in_stock' | 'low_stock' | 'expired'

const ADJUSTMENT_REASONS: { key: StockAdjustmentReason; label: string }[] = [
  { key: 'damage', label: 'Damaged' },
  { key: 'theft', label: 'Theft / Loss' },
  { key: 'spoilage', label: 'Spoilage' },
  { key: 'stock_take_correction', label: 'Stock-take correction' },
  { key: 'other', label: 'Other' },
]

function statusFor(item: InventoryItem) {
  if (isExpired(item.expiryDate)) return { label: 'Expired', cls: 'bg-red-100 text-danger' }
  if (isOutOfStock(item.currentStock)) return { label: 'Out of Stock', cls: 'bg-red-100 text-danger' }
  if (isLowStock(item.currentStock, item.initialStock)) return { label: 'Low Stock', cls: 'bg-amber-100 text-warning' }
  if (isExpiringSoon(item.expiryDate)) return { label: 'Expiring Soon', cls: 'bg-amber-100 text-warning' }
  return { label: 'In Stock', cls: 'bg-green-100 text-primary' }
}

export default function InventoryPage() {
  const user = useAuthStore((s) => s.user)
  const { inventory, sales, upsertInventoryItem, addStockAdjustment } = useDataStore()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin'

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [stockTarget, setStockTarget] = useState<InventoryItem | null>(null)
  const [adjustTarget, setAdjustTarget] = useState<InventoryItem | null>(null)
  const [detailTarget, setDetailTarget] = useState<InventoryItem | null>(null)

  const scoped = useMemo(
    () => inventory.filter((i) => isAdmin || i.branchId === user?.branchId),
    [inventory, user, isAdmin],
  )

  const filtered = useMemo(() => {
    let list = scoped
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((i) => i.productName.toLowerCase().includes(q) || i.barcode.includes(q))
    }
    if (filter === 'in_stock') list = list.filter((i) => i.currentStock > 0 && !isLowStock(i.currentStock, i.initialStock))
    if (filter === 'low_stock') list = list.filter((i) => isLowStock(i.currentStock, i.initialStock))
    if (filter === 'expired') list = list.filter((i) => isExpired(i.expiryDate))
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [scoped, search, filter])

  const totalValue = useMemo(() => scoped.reduce((s, i) => s + i.buyingPrice * i.currentStock, 0), [scoped])

  function handleAddProduct(data: {
    productName: string
    buyingPrice: number
    sellingPrice: number
    quantity: number
    expiryDate: string
  }) {
    const createdAt = new Date().toISOString()
    const batchNumber = generateBatchNumber()
    const initialBatch: StockBatch = {
      id: generateId('batch'),
      quantity: data.quantity,
      buyingPrice: data.buyingPrice,
      expiryDate: data.expiryDate,
      batchNumber,
      receivedAt: createdAt,
    }
    const item: InventoryItem = {
      id: generateId('inv'),
      barcode: generateBarcode(),
      productName: data.productName,
      buyingPrice: data.buyingPrice,
      sellingPrice: data.sellingPrice,
      currentStock: data.quantity,
      initialStock: data.quantity,
      expiryDate: data.expiryDate,
      batchNumber,
      createdAt,
      branchId: user?.branchId,
      branchName: user?.branchName,
      batches: [initialBatch],
      hasExpiredBatches: false,
      expiredQuantity: 0,
    }
    upsertInventoryItem(item)
    syncService.addPendingOperation('ADD_PRODUCT', item)
    logActivity('ADD_PRODUCT', `Added product "${item.productName}" (${item.currentStock} units)`, user)
    toast.success('Product added')
    setShowAdd(false)
  }

  function handleAddStock(item: InventoryItem, quantity: number, expiryDate: string, buyingPrice: number) {
    const updated = addBatch(item, {
      quantity,
      buyingPrice,
      expiryDate,
      batchNumber: generateBatchNumber(),
    })
    upsertInventoryItem(updated)
    syncService.addPendingOperation('ADD_STOCK', updated)
    logActivity(
      'ADD_STOCK',
      `Added ${quantity} unit(s) of "${item.productName}" (new batch, expires ${expiryDate})`,
      user,
    )
    toast.success('Stock added')
    setStockTarget(null)
    setDetailTarget((prev) => (prev && prev.id === item.id ? updated : prev))
  }

  function handleAdjustStock(item: InventoryItem, quantityChange: number, reason: StockAdjustmentReason, note: string) {
    const updated = adjustBatchQuantity(item, quantityChange)
    upsertInventoryItem(updated)
    syncService.addPendingOperation('ADD_STOCK', updated)

    const adjustment: StockAdjustmentRecord = {
      id: generateId('adj'),
      inventoryId: item.id,
      productName: item.productName,
      quantityChange,
      reason,
      note: note || undefined,
      createdAt: new Date().toISOString(),
      performedBy: user?.fullName ?? user?.email ?? 'Unknown',
      branchId: item.branchId,
      branchName: item.branchName,
    }
    addStockAdjustment(adjustment)
    syncService.addPendingOperation('STOCK_ADJUSTMENT', adjustment)
    logActivity(
      'STOCK_ADJUSTMENT',
      `${quantityChange > 0 ? '+' : ''}${quantityChange} "${item.productName}" (${ADJUSTMENT_REASONS.find((r) => r.key === reason)?.label})`,
      user,
    )
    toast.success('Stock adjustment recorded')
    setAdjustTarget(null)
    setDetailTarget((prev) => (prev && prev.id === item.id ? updated : prev))
  }

  function handlePrintBarcode(item: InventoryItem) {
    navigate('/barcode', { state: { barcode: item.barcode, productName: item.productName, price: item.sellingPrice } })
  }

  return (
    <DashboardLayout title="Inventory">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {isAdmin && (
            <div className="bg-app-card rounded-card shadow-card px-5 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary flex items-center justify-center">
                <BoxIcon width={18} height={18} />
              </div>
              <div>
                <div className="text-xs text-app-muted">Total Inventory Value</div>
                <div className="font-bold text-app-heading">{formatCurrency(totalValue)}</div>
              </div>
            </div>
          )}
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors ml-auto"
          >
            <PlusIcon width={16} height={16} />
            Add Product
          </button>
        </div>

        <div className="bg-app-card rounded-card shadow-card p-4 space-y-3">
          <div className="relative">
            <SearchIcon width={16} height={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-app-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by product name or barcode..."
              className="w-full pl-9 pr-3 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {(['all', 'in_stock', 'low_stock', 'expired'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === f ? 'bg-primary text-white' : 'bg-app-hover text-app-body hover:bg-app-hover-strong'
                }`}
              >
                {f === 'all' ? 'All' : f === 'in_stock' ? 'In Stock' : f === 'low_stock' ? 'Low Stock' : 'Expired'}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-app-card rounded-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            {isAdmin ? (
              <AdminInventoryTable
                items={filtered}
                onAddStock={setStockTarget}
                onAdjust={setAdjustTarget}
                onPrint={handlePrintBarcode}
              />
            ) : (
              <CashierInventoryTable items={filtered} onViewDetails={setDetailTarget} />
            )}
          </div>
        </div>
      </div>

      <AddProductModal open={showAdd} onClose={() => setShowAdd(false)} onSubmit={handleAddProduct} />
      <AddStockModal item={stockTarget} onClose={() => setStockTarget(null)} onSubmit={handleAddStock} />
      <AdjustStockModal item={adjustTarget} onClose={() => setAdjustTarget(null)} onSubmit={handleAdjustStock} />
      <ProductDetailModal
        item={detailTarget}
        sales={sales}
        onClose={() => setDetailTarget(null)}
        onAddStock={(item) => {
          setDetailTarget(null)
          setStockTarget(item)
        }}
        onAdjust={(item) => {
          setDetailTarget(null)
          setAdjustTarget(item)
        }}
        onPrint={handlePrintBarcode}
      />
    </DashboardLayout>
  )
}

/* ------------------------------------------------------------------ */
/* Admin table: full detail including buying price and inline actions. */
/* ------------------------------------------------------------------ */

function AdminInventoryTable({
  items,
  onAddStock,
  onAdjust,
  onPrint,
}: {
  items: InventoryItem[]
  onAddStock: (item: InventoryItem) => void
  onAdjust: (item: InventoryItem) => void
  onPrint: (item: InventoryItem) => void
}) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-app-alt text-app-muted">
        <tr>
          <th className="text-left px-4 py-3 font-semibold">Barcode</th>
          <th className="text-left px-4 py-3 font-semibold">Product</th>
          <th className="text-right px-4 py-3 font-semibold">Buying Price</th>
          <th className="text-right px-4 py-3 font-semibold">Selling Price</th>
          <th className="text-right px-4 py-3 font-semibold">Stock</th>
          <th className="text-left px-4 py-3 font-semibold">Expiry</th>
          <th className="text-left px-4 py-3 font-semibold">Status</th>
          <th className="text-right px-4 py-3 font-semibold">Actions</th>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 ? (
          <tr>
            <td colSpan={8} className="text-center px-4 py-10 text-app-faint">
              No products found
            </td>
          </tr>
        ) : (
          items.map((item, idx) => {
            const status = statusFor(item)
            return (
              <tr key={item.id} className={idx % 2 === 0 ? 'bg-app-card' : 'bg-app-alt/50'}>
                <td className="px-4 py-3 font-mono text-xs text-app-muted">{item.barcode}</td>
                <td className="px-4 py-3 font-medium text-app-heading">{item.productName}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(item.buyingPrice)}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(item.sellingPrice)}</td>
                <td className="px-4 py-3 text-right">{item.currentStock}</td>
                <td className="px-4 py-3 text-app-muted">{formatDate(item.expiryDate)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${status.cls}`}>{status.label}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2 flex-wrap">
                    <button onClick={() => onAddStock(item)} className="text-xs font-semibold text-secondary hover:underline">
                      Add Stock
                    </button>
                    <button onClick={() => onAdjust(item)} className="text-xs font-semibold text-warning hover:underline">
                      Adjust
                    </button>
                    <button
                      onClick={() => onPrint(item)}
                      className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                    >
                      <PrintIcon width={12} height={12} />
                      Print
                    </button>
                  </div>
                </td>
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}

/* ------------------------------------------------------------------ */
/* Cashier table: name, price, status only - no buying price/profit    */
/* data anywhere. "View Details" opens the full exploration modal.     */
/* ------------------------------------------------------------------ */

function CashierInventoryTable({
  items,
  onViewDetails,
}: {
  items: InventoryItem[]
  onViewDetails: (item: InventoryItem) => void
}) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-app-alt text-app-muted">
        <tr>
          <th className="text-left px-4 py-3 font-semibold">Product</th>
          <th className="text-right px-4 py-3 font-semibold">Selling price</th>
          <th className="text-left px-4 py-3 font-semibold">Status</th>
          <th className="text-right px-4 py-3 font-semibold"></th>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 ? (
          <tr>
            <td colSpan={4} className="text-center px-4 py-10 text-app-faint">
              No products found
            </td>
          </tr>
        ) : (
          items.map((item, idx) => {
            const status = statusFor(item)
            return (
              <tr
                key={item.id}
                onClick={() => onViewDetails(item)}
                className={`cursor-pointer hover:bg-primary-50/40 transition-colors ${idx % 2 === 0 ? 'bg-app-card' : 'bg-app-alt/50'}`}
              >
                <td className="px-4 py-3 font-medium text-app-heading">{item.productName}</td>
                <td className="px-4 py-3 text-right font-semibold text-primary">{formatCurrency(item.sellingPrice)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${status.cls}`}>{status.label}</span>
                </td>
                <td className="px-4 py-3 text-right text-primary text-xs font-semibold">Details &rarr;</td>
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}

/* ------------------------------------------------------------------ */
/* Product detail modal - reachable by any role, but never shows       */
/* buying price. Includes sales history for this specific product and */
/* the add-stock / adjust / print-barcode actions.                     */
/* ------------------------------------------------------------------ */

function ProductDetailModal({
  item,
  sales,
  onClose,
  onAddStock,
  onAdjust,
  onPrint,
}: {
  item: InventoryItem | null
  sales: SaleRecord[]
  onClose: () => void
  onAddStock: (item: InventoryItem) => void
  onAdjust: (item: InventoryItem) => void
  onPrint: (item: InventoryItem) => void
}) {
  const history = useMemo(() => {
    if (!item) return []
    const rows: { transactionId: string; quantity: number; date: string }[] = []
    for (const sale of sales) {
      for (const line of sale.items) {
        if (line.inventoryId === item.id) {
          rows.push({ transactionId: sale.transactionId, quantity: line.quantity, date: sale.createdAt })
        }
      }
    }
    return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 20)
  }, [item, sales])

  if (!item) return null
  const status = statusFor(item)
  const batches = ensureBatches(item)
  const batchCounts = getBatchStatusCounts(batches)
  const sortedBatches = [...batches].sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())

  return (
    <Modal open={!!item} onClose={onClose} title={item.productName} maxWidth="max-w-lg">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-app-alt rounded-lg p-3">
            <div className="text-app-faint text-xs">Selling Price</div>
            <div className="font-bold text-primary">{formatCurrency(item.sellingPrice)}</div>
          </div>
          <div className="bg-app-alt rounded-lg p-3">
            <div className="text-app-faint text-xs">Sellable Stock</div>
            <div className="font-bold text-app-heading">{item.currentStock}</div>
          </div>
          <div className="bg-app-alt rounded-lg p-3">
            <div className="text-app-faint text-xs">Next Expiry</div>
            <div className="font-bold text-app-heading">{formatDate(item.expiryDate)}</div>
          </div>
          <div className="bg-app-alt rounded-lg p-3">
            <div className="text-app-faint text-xs">Overall Status</div>
            <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-semibold ${status.cls}`}>
              {status.label}
            </span>
          </div>
        </div>

        {/* Inventory status breakdown by batch - a product can have some
            stock in each category simultaneously (e.g. an older batch
            expiring soon while a newer delivery is still fresh). */}
        <div>
          <h3 className="text-sm font-bold text-app-heading mb-2">Inventory Status</h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-green-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-primary">{batchCounts.inStock}</div>
              <div className="text-xs text-app-muted mt-0.5">In Stock</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-warning">{batchCounts.expiringSoon}</div>
              <div className="text-xs text-app-muted mt-0.5">Expiring soon</div>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-danger">{batchCounts.expired}</div>
              <div className="text-xs text-app-muted mt-0.5">Expired</div>
            </div>
          </div>
          {batchCounts.expired > 0 && (
            <p className="text-xs text-danger mt-2">
              Expired stock won't be sold at checkout - use "Adjust" to write it off once confirmed.
            </p>
          )}
        </div>

        {sortedBatches.length > 1 && (
          <div>
            <h3 className="text-sm font-bold text-app-heading mb-2">Batches (oldest-expiring first)</h3>
            <div className="border border-app-border rounded-lg divide-y divide-app-border max-h-40 overflow-y-auto">
              {sortedBatches.map((b) => (
                <div key={b.id} className="flex justify-between px-3 py-2 text-sm">
                  <span className="text-app-body">{b.quantity} units</span>
                  <span
                    className={
                      isExpired(b.expiryDate) ? 'text-danger' : isExpiringSoon(b.expiryDate) ? 'text-warning' : 'text-app-muted'
                    }
                  >
                    {formatDate(b.expiryDate)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => onAddStock(item)}
            className="py-2.5 rounded-lg text-xs font-semibold bg-secondary/10 text-secondary hover:bg-secondary/20 transition-colors"
          >
            Add stock
          </button>
          <button
            onClick={() => onAdjust(item)}
            className="py-2.5 rounded-lg text-xs font-semibold bg-warning/10 text-warning hover:bg-warning/20 transition-colors"
          >
            Adjust
          </button>
          <button
            onClick={() => onPrint(item)}
            className="flex items-center justify-center gap-1 py-2.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            <PrintIcon width={13} height={13} />
            Print barcode
          </button>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <ReportsIcon width={14} height={14} className="text-app-muted" />
            <h3 className="text-sm font-bold text-app-heading">Recent sales history</h3>
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-app-faint text-center py-6">No sales recorded for this product yet</p>
          ) : (
            <div className="border border-app-border rounded-lg divide-y divide-app-border max-h-56 overflow-y-auto">
              {history.map((h, i) => (
                <div key={i} className="flex justify-between px-3 py-2 text-sm">
                  <span className="font-mono text-xs text-app-muted">{h.transactionId}</span>
                  <span className="text-app-body">{h.quantity} sold</span>
                  <span className="text-xs text-app-faint">{formatDateTime(h.date)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

function AddProductModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (data: { productName: string; buyingPrice: number; sellingPrice: number; quantity: number; expiryDate: string }) => void
}) {
  const [productName, setProductName] = useState('')
  const [pricingMode, setPricingMode] = useState<'per_unit' | 'bulk'>('per_unit')
  const [buyingPrice, setBuyingPrice] = useState('')
  const [bulkTotalCost, setBulkTotalCost] = useState('')
  const [bulkUnitCount, setBulkUnitCount] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [quantity, setQuantity] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [error, setError] = useState('')

  // When buying in bulk (a carton/case), the buying price per unit is
  // derived automatically: total amount paid for the carton divided by
  // how many individual items it contains. The selling price is still
  // set per unit, same as normal.
  const bulkComputedUnitCost = useMemo(() => {
    const total = parseFloat(bulkTotalCost)
    const count = parseInt(bulkUnitCount, 10)
    if (isNaN(total) || isNaN(count) || count <= 0) return null
    return total / count
  }, [bulkTotalCost, bulkUnitCount])

  function reset() {
    setProductName('')
    setPricingMode('per_unit')
    setBuyingPrice('')
    setBulkTotalCost('')
    setBulkUnitCount('')
    setSellingPrice('')
    setQuantity('')
    setExpiryDate('')
    setError('')
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const bp = pricingMode === 'bulk' ? bulkComputedUnitCost : parseFloat(buyingPrice)
    const sp = parseFloat(sellingPrice)
    // In bulk mode, quantity is the same as the number of units in the
    // carton - no need to make the cashier enter it twice.
    const qty = pricingMode === 'bulk' ? parseInt(bulkUnitCount, 10) : parseInt(quantity, 10)

    if (!productName.trim() || bp === null || bp === undefined || isNaN(bp) || isNaN(sp) || isNaN(qty) || !expiryDate) {
      setError('Please fill in all fields with valid values.')
      return
    }
    if (sp < bp) {
      setError('Selling price should not be lower than the buying price per unit.')
      return
    }
    onSubmit({ productName: productName.trim(), buyingPrice: bp, sellingPrice: sp, quantity: qty, expiryDate })
    reset()
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title="Add Product"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 bg-red-50 text-danger text-sm rounded-lg px-3 py-2">
            <WarningIcon width={16} height={16} />
            {error}
          </div>
        )}
        <Field label="Product Name">
          <input
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="e.g. Rice 5kg"
          />
        </Field>

        <div>
          <label className="block text-sm font-medium text-app-body mb-2">How was this priced?</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPricingMode('per_unit')}
              className={`py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors ${
                pricingMode === 'per_unit' ? 'border-primary bg-primary-50 text-primary' : 'border-app-border text-app-muted'
              }`}
            >
              Priced per item
            </button>
            <button
              type="button"
              onClick={() => setPricingMode('bulk')}
              className={`py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors ${
                pricingMode === 'bulk' ? 'border-primary bg-primary-50 text-primary' : 'border-app-border text-app-muted'
              }`}
            >
              Bought as a carton/case
            </button>
          </div>
        </div>

        {pricingMode === 'per_unit' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Buying Price (per item)">
              <input
                type="number"
                value={buyingPrice}
                onChange={(e) => setBuyingPrice(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="0"
              />
            </Field>
            <Field label="Selling Price (per item)">
              <input
                type="number"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="0"
              />
            </Field>
          </div>
        ) : (
          <div className="space-y-3 bg-app-alt rounded-lg p-3.5">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Total amount paid for the carton">
                <input
                  type="number"
                  value={bulkTotalCost}
                  onChange={(e) => setBulkTotalCost(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g. 60000"
                />
              </Field>
              <Field label="Number of items in the carton">
                <input
                  type="number"
                  value={bulkUnitCount}
                  onChange={(e) => setBulkUnitCount(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g. 24"
                />
              </Field>
            </div>
            {bulkComputedUnitCost !== null && (
              <div className="text-sm text-app-body">
                Buying price per item:{' '}
                <span className="font-bold text-app-heading">{formatCurrency(bulkComputedUnitCost)}</span>
              </div>
            )}
            <Field label="Selling Price (per item)">
              <input
                type="number"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="0"
              />
            </Field>
          </div>
        )}

        {pricingMode === 'per_unit' && (
          <Field label="Quantity">
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="0"
            />
          </Field>
        )}
        <Field label="Expiry Date">
          <input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </Field>

        <p className="text-xs text-app-faint">A barcode will be generated automatically.</p>
        <button
          type="submit"
          className="w-full bg-primary hover:bg-primary-dark text-white font-semibold py-2.5 rounded-lg transition-colors"
        >
          Save Product
        </button>
      </form>
    </Modal>
  )
}

function AddStockModal({
  item,
  onClose,
  onSubmit,
}: {
  item: InventoryItem | null
  onClose: () => void
  onSubmit: (item: InventoryItem, quantity: number, expiryDate: string, buyingPrice: number) => void
}) {
  const [quantity, setQuantity] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [buyingPrice, setBuyingPrice] = useState('')
  const [error, setError] = useState('')

  if (!item) return null

  function reset() {
    setQuantity('')
    setExpiryDate('')
    setBuyingPrice('')
    setError('')
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const qty = parseInt(quantity, 10)
    const price = parseFloat(buyingPrice)
    if (isNaN(qty) || qty <= 0) {
      setError('Enter a valid quantity.')
      return
    }
    if (isNaN(price) || price < 0) {
      setError('Enter a valid buying price for this delivery.')
      return
    }
    if (!expiryDate) {
      setError('Enter the expiry date for this new stock.')
      return
    }
    onSubmit(item!, qty, expiryDate, price)
    reset()
  }

  return (
    <Modal
      open={!!item}
      onClose={() => {
        reset()
        onClose()
      }}
      title={`Add Stock - ${item.productName}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 bg-red-50 text-danger text-sm rounded-lg px-3 py-2">
            <WarningIcon width={16} height={16} />
            {error}
          </div>
        )}
        <div className="bg-app-alt rounded-lg p-3 text-sm text-app-body">
          Current sellable stock: <span className="font-bold text-app-heading">{item.currentStock}</span>
        </div>
        <p className="text-xs text-app-faint -mt-2">
          This delivery is tracked as its own batch, so it sells after any older stock still in date
          (first-expire-first-out).
        </p>
        <Field label="Quantity to add">
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            autoFocus
            className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="0"
          />
        </Field>
        <Field label="Buying price (per unit, this delivery)">
          <input
            type="number"
            value={buyingPrice}
            onChange={(e) => setBuyingPrice(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder={String(item.buyingPrice || 0)}
          />
        </Field>
        <Field label="Expiry date (this delivery)">
          <input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </Field>
        <button
          type="submit"
          className="w-full bg-primary hover:bg-primary-dark text-white font-semibold py-2.5 rounded-lg transition-colors"
        >
          Add Stock
        </button>
      </form>
    </Modal>
  )
}

function AdjustStockModal({
  item,
  onClose,
  onSubmit,
}: {
  item: InventoryItem | null
  onClose: () => void
  onSubmit: (item: InventoryItem, quantityChange: number, reason: StockAdjustmentReason, note: string) => void
}) {
  const [direction, setDirection] = useState<'decrease' | 'increase'>('decrease')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState<StockAdjustmentReason>('damage')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  if (!item) return null
  const totalPhysicalStock = item.currentStock + (item.expiredQuantity ?? 0)

  function reset() {
    setQuantity('')
    setNote('')
    setDirection('decrease')
    setReason('damage')
    setError('')
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const qty = parseInt(quantity, 10)
    if (isNaN(qty) || qty <= 0) {
      setError('Enter a valid quantity.')
      return
    }
    const change = direction === 'decrease' ? -qty : qty
    if (direction === 'decrease' && qty > totalPhysicalStock) {
      setError(`Cannot remove more than the total stock on hand (${totalPhysicalStock}).`)
      return
    }
    onSubmit(item!, change, reason, note)
    reset()
  }

  return (
    <Modal
      open={!!item}
      onClose={() => {
        reset()
        onClose()
      }}
      title={`Adjust Stock - ${item.productName}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 bg-red-50 text-danger text-sm rounded-lg px-3 py-2">
            <WarningIcon width={16} height={16} />
            {error}
          </div>
        )}
        <div className="bg-app-alt rounded-lg p-3 text-sm text-app-body">
          Sellable stock: <span className="font-bold text-app-heading">{item.currentStock}</span>
          {(item.expiredQuantity ?? 0) > 0 && (
            <span className="text-danger"> &middot; {item.expiredQuantity} expired (not sellable)</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setDirection('decrease')}
            className={`py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors ${
              direction === 'decrease' ? 'border-danger bg-red-50 text-danger' : 'border-app-border text-app-muted'
            }`}
          >
            Remove stock
          </button>
          <button
            type="button"
            onClick={() => setDirection('increase')}
            className={`py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors ${
              direction === 'increase' ? 'border-primary bg-primary-50 text-primary' : 'border-app-border text-app-muted'
            }`}
          >
            Correct upward
          </button>
        </div>
        <Field label="Quantity">
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            autoFocus
            className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="0"
          />
        </Field>
        <Field label="Reason">
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as StockAdjustmentReason)}
            className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {ADJUSTMENT_REASONS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note (optional)">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </Field>
        <button
          type="submit"
          className="w-full bg-gray-800 hover:bg-gray-700 text-white font-semibold py-2.5 rounded-lg transition-colors"
        >
          Record adjustment
        </button>
      </form>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-app-body mb-1">{label}</label>
      {children}
    </div>
  )
}
