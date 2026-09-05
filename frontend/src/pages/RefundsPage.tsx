import { useMemo, useState } from 'react'
import DashboardLayout from '@/components/layout/DashboardLayout'
import Modal from '@/components/common/Modal'
import { useAuthStore } from '@/store/authStore'
import { useDataStore } from '@/store/dataStore'
import { syncService } from '@/services/sync/syncService'
import { logActivity } from '@/services/activity/activityService'
import { toast } from '@/store/toastStore'
import { useNotificationStore } from '@/store/notificationStore'
import type { RefundItem, RefundReason, RefundRecord, SaleRecord } from '@/types'
import { formatCurrency, formatDateTime, generateId } from '@/utils/helpers'
import { restockAsBatch } from '@/utils/batches'
import { SearchIcon, WarningIcon, CheckIcon } from '@/components/common/Icons'

const REASONS: { key: RefundReason; label: string }[] = [
  { key: 'wrong_item', label: 'Wrong item sold' },
  { key: 'damaged', label: 'Item damaged / faulty' },
  { key: 'customer_changed_mind', label: 'Customer changed mind' },
  { key: 'expired', label: 'Item expired' },
  { key: 'other', label: 'Other' },
]

export default function RefundsPage() {
  const user = useAuthStore((s) => s.user)
  const { sales, inventory, refunds, updateSale, addRefund, upsertInventoryItem } = useDataStore()

  const [query, setQuery] = useState('')
  const [activeSale, setActiveSale] = useState<SaleRecord | null>(null)

  const scopedSales = useMemo(
    () => sales.filter((s) => user?.role === 'admin' || s.branchId === user?.branchId),
    [sales, user],
  )

  const results = useMemo(() => {
    if (!query.trim()) return scopedSales.slice(0, 15)
    const q = query.toLowerCase().trim()
    return scopedSales.filter((s) => s.transactionId.toLowerCase().includes(q)).slice(0, 15)
  }, [scopedSales, query])

  const recentRefunds = useMemo(
    () => refunds.filter((r) => user?.role === 'admin' || r.branchId === user?.branchId).slice(0, 10),
    [refunds, user],
  )

  function handleRefundSubmit(payload: {
    sale: SaleRecord
    items: RefundItem[]
    reason: RefundReason
    note: string
    restockItems: boolean
  }) {
    const totalRefunded = payload.items.reduce((sum, i) => sum + i.totalPrice, 0)

    const refund: RefundRecord = {
      id: generateId('refund'),
      refundId: `RFD-${Date.now().toString(36).toUpperCase()}`,
      originalSaleId: payload.sale.id,
      originalTransactionId: payload.sale.transactionId,
      items: payload.items,
      totalRefunded,
      reason: payload.reason,
      note: payload.note || undefined,
      restockItems: payload.restockItems,
      createdAt: new Date().toISOString(),
      cashierName: user?.fullName ?? 'Cashier',
      branchId: user?.branchId ?? payload.sale.branchId,
      branchName: user?.branchName ?? payload.sale.branchName,
    }

    addRefund(refund)
    syncService.addPendingOperation('REFUND', refund)

    const alreadyRefunded = payload.sale.refundedAmount ?? 0
    const updatedSale: SaleRecord = {
      ...payload.sale,
      refunded: true,
      refundedAmount: alreadyRefunded + totalRefunded,
    }
    updateSale(updatedSale)
    syncService.addPendingOperation('SALE', updatedSale)

    if (payload.restockItems) {
      payload.items.forEach((refundItem) => {
        const product = inventory.find((i) => i.id === refundItem.inventoryId)
        if (product) {
          const updated = restockAsBatch(product, refundItem.quantity, product.buyingPrice)
          upsertInventoryItem(updated)
          syncService.addPendingOperation('ADD_STOCK', updated)
        }
      })
    }

    logActivity(
      'REFUND',
      `Refund ${refund.refundId} for ${payload.sale.transactionId} - ${formatCurrency(totalRefunded)}`,
      user,
    )
    toast.success('Refund processed successfully')
    useNotificationStore.getState().add({
      type: 'warning',
      title: 'Refund processed',
      message: `${refund.refundId} for ${payload.sale.transactionId} - ${formatCurrency(totalRefunded)} at ${refund.branchName ?? 'a branch'}.`,
      audience: 'admin',
    })
    setActiveSale(null)
  }

  return (
    <DashboardLayout title="Refunds & Returns">
      <div className="space-y-5">
        <div className="bg-app-card rounded-card shadow-card p-4">
          <div className="relative">
            <SearchIcon width={16} height={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-app-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by transaction ID..."
              className="w-full pl-9 pr-3 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div className="bg-app-card rounded-card shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-app-border">
            <h2 className="font-bold text-app-heading">{query.trim() ? 'Search Results' : 'Recent Transactions'}</h2>
          </div>
          <div className="divide-y divide-app-border max-h-[50vh] overflow-y-auto">
            {results.length === 0 ? (
              <p className="text-center text-app-faint py-8 text-sm">No transactions found</p>
            ) : (
              results.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveSale(s)}
                  disabled={(s.refundedAmount ?? 0) >= s.totalAmount}
                  className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-app-alt disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <div>
                    <div className="font-mono text-xs text-app-muted">{s.transactionId}</div>
                    <div className="text-xs text-app-faint">{formatDateTime(s.createdAt)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-app-heading">{formatCurrency(s.totalAmount)}</div>
                    {s.refunded ? (
                      <div className="text-xs text-danger font-semibold">
                        {(s.refundedAmount ?? 0) >= s.totalAmount ? 'Fully refunded' : 'Partially refunded'}
                      </div>
                    ) : (
                      <div className="text-xs text-app-faint">{s.items.length} item(s)</div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="bg-app-card rounded-card shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-app-border">
            <h2 className="font-bold text-app-heading">Recent Refunds</h2>
          </div>
          <div className="divide-y divide-app-border max-h-[40vh] overflow-y-auto">
            {recentRefunds.length === 0 ? (
              <p className="text-center text-app-faint py-8 text-sm">No refunds recorded yet</p>
            ) : (
              recentRefunds.map((r) => (
                <div key={r.id} className="px-5 py-3 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-mono text-xs text-app-muted">
                      {r.refundId} &middot; for {r.originalTransactionId}
                    </div>
                    <div className="text-xs text-app-faint">{formatDateTime(r.createdAt)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-danger">-{formatCurrency(r.totalRefunded)}</div>
                    <div className="text-xs text-app-faint">{REASONS.find((x) => x.key === r.reason)?.label}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <RefundModal sale={activeSale} onClose={() => setActiveSale(null)} onSubmit={handleRefundSubmit} />
    </DashboardLayout>
  )
}

interface RefundModalProps {
  sale: SaleRecord | null
  onClose: () => void
  onSubmit: (payload: { sale: SaleRecord; items: RefundItem[]; reason: RefundReason; note: string; restockItems: boolean }) => void
}

function RefundModal({ sale, onClose, onSubmit }: RefundModalProps) {
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({})
  const [reason, setReason] = useState<RefundReason>('wrong_item')
  const [note, setNote] = useState('')
  const [restockItems, setRestockItems] = useState(true)
  const [error, setError] = useState('')

  if (!sale) return null

  function toggleItem(inventoryId: string, maxQty: number) {
    setSelectedQty((prev) => {
      const next = { ...prev }
      if (next[inventoryId] !== undefined) {
        delete next[inventoryId]
      } else {
        next[inventoryId] = maxQty
      }
      return next
    })
  }

  function updateQty(inventoryId: string, qty: number, maxQty: number) {
    setSelectedQty((prev) => ({ ...prev, [inventoryId]: Math.max(1, Math.min(maxQty, qty)) }))
  }

  const refundTotal = sale.items.reduce((sum, item) => {
    const qty = selectedQty[item.inventoryId]
    if (!qty) return sum
    return sum + (item.totalPrice / item.quantity) * qty
  }, 0)

  function handleSubmit() {
    setError('')
    const items: RefundItem[] = sale!.items
      .filter((i) => selectedQty[i.inventoryId])
      .map((i) => {
        const qty = selectedQty[i.inventoryId]
        return {
          inventoryId: i.inventoryId,
          productName: i.productName,
          unitPrice: i.unitPrice,
          quantity: qty,
          totalPrice: (i.totalPrice / i.quantity) * qty,
        }
      })
    if (items.length === 0) {
      setError('Select at least one item to refund.')
      return
    }
    onSubmit({ sale: sale!, items, reason, note, restockItems })
    setSelectedQty({})
    setNote('')
  }

  return (
    <Modal open={!!sale} onClose={onClose} title={`Refund - ${sale.transactionId}`} maxWidth="max-w-lg">
      <div className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 bg-red-50 text-danger text-sm rounded-lg px-3 py-2">
            <WarningIcon width={16} height={16} />
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-app-body mb-2">Select items to refund</label>
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {sale.items.map((item) => {
              const checked = selectedQty[item.inventoryId] !== undefined
              return (
                <div key={item.inventoryId} className="border border-app-border rounded-lg p-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleItem(item.inventoryId, item.quantity)}
                      className="rounded"
                    />
                    <span className="flex-1 text-sm font-medium text-app-heading">{item.productName}</span>
                    <span className="text-sm text-app-faint">{formatCurrency(item.unitPrice)}/unit</span>
                  </label>
                  {checked && (
                    <div className="flex items-center gap-2 mt-2 pl-6">
                      <label className="text-xs text-app-faint">Qty to refund</label>
                      <input
                        type="number"
                        min={1}
                        max={item.quantity}
                        value={selectedQty[item.inventoryId]}
                        onChange={(e) => updateQty(item.inventoryId, parseInt(e.target.value, 10) || 1, item.quantity)}
                        className="w-16 px-2 py-1 border border-app-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <span className="text-xs text-app-faint">of {item.quantity} purchased</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-app-body mb-1">Reason</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as RefundReason)}
            className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {REASONS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-app-body mb-1">Note (optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-app-body cursor-pointer">
          <input type="checkbox" checked={restockItems} onChange={(e) => setRestockItems(e.target.checked)} className="rounded" />
          Return items to inventory (uncheck if damaged/expired)
        </label>

        <div className="bg-app-alt rounded-lg p-4 flex justify-between items-center">
          <span className="text-sm font-medium text-app-body">Refund amount</span>
          <span className="text-xl font-bold text-danger">{formatCurrency(refundTotal)}</span>
        </div>

        <button
          onClick={handleSubmit}
          disabled={refundTotal === 0}
          className="w-full flex items-center justify-center gap-2 bg-danger hover:bg-red-600 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-colors"
        >
          <CheckIcon width={16} height={16} />
          Confirm refund
        </button>
      </div>
    </Modal>
  )
}
