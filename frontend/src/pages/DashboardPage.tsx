import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '@/components/layout/DashboardLayout'
import StatCard from '@/components/common/StatCard'
import { useDataStore } from '@/store/dataStore'
import type { BranchPerformance, ReportPeriod } from '@/types'
import {
  formatCurrency,
  formatDateTime,
  getRangeForPeriod,
  isExpired,
  isExpiringSoon,
  isLowStock,
  isWithinRange,
  startOfDay,
  endOfDay,
} from '@/utils/helpers'
import {
  DollarIcon,
  BoxIcon,
  WarningIcon,
  ReportsIcon,
  POSIcon,
  InventoryIcon,
  BarcodeIcon,
} from '@/components/common/Icons'

const PERIODS: { key: ReportPeriod; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
  { key: 'custom', label: 'Custom Range' },
]

export default function DashboardPage() {
  const navigate = useNavigate()
  const { inventory, sales, branches } = useDataStore()
  const [period, setPeriod] = useState<ReportPeriod>('daily')
  const [branchFilter, setBranchFilter] = useState<string>('all')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const range = useMemo(() => {
    if (period === 'custom') {
      if (!customStart || !customEnd) return null
      return { start: startOfDay(new Date(customStart)), end: endOfDay(new Date(customEnd)) }
    }
    return getRangeForPeriod(period)
  }, [period, customStart, customEnd])

  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      if (branchFilter !== 'all' && s.branchId !== branchFilter) return false
      if (!range) return true
      return isWithinRange(s.createdAt, range.start, range.end)
    })
  }, [sales, branchFilter, range])

  const filteredInventory = useMemo(() => {
    if (branchFilter === 'all') return inventory
    return inventory.filter((i) => i.branchId === branchFilter)
  }, [inventory, branchFilter])

  const totals = useMemo(() => {
    const totalSales = filteredSales.reduce((s, r) => s + r.totalAmount, 0)
    const totalProfit = filteredSales.reduce((s, r) => s + r.totalProfit, 0)
    const itemsSold = filteredSales.reduce((s, r) => s + r.items.reduce((a, i) => a + i.quantity, 0), 0)
    return { totalSales, totalProfit, itemsSold, transactions: filteredSales.length }
  }, [filteredSales])

  const inventorySummary = useMemo(() => {
    const totalProducts = filteredInventory.length
    const inventoryValue = filteredInventory.reduce((s, i) => s + i.buyingPrice * i.currentStock, 0)
    const potentialProfit = filteredInventory.reduce(
      (s, i) => s + (i.sellingPrice - i.buyingPrice) * i.currentStock,
      0,
    )
    const lowStock = filteredInventory.filter((i) => isLowStock(i.currentStock, i.initialStock))
    const expired = filteredInventory.filter((i) => isExpired(i.expiryDate) || i.hasExpiredBatches)
    const expiringSoon = filteredInventory.filter((i) => isExpiringSoon(i.expiryDate))
    return { totalProducts, inventoryValue, potentialProfit, lowStock, expired, expiringSoon }
  }, [filteredInventory])

  const branchPerformance: BranchPerformance[] = useMemo(() => {
    return branches.map((b) => {
      const branchSales = filteredSales.filter((s) => s.branchId === b.id)
      return {
        branchId: b.id,
        branchName: b.name,
        totalSales: branchSales.reduce((s, r) => s + r.totalAmount, 0),
        totalProfit: branchSales.reduce((s, r) => s + r.totalProfit, 0),
        transactions: branchSales.length,
        itemsSold: branchSales.reduce((s, r) => s + r.items.reduce((a, i) => a + i.quantity, 0), 0),
      }
    })
  }, [branches, filteredSales])

  const recentSales = useMemo(() => filteredSales.slice(0, 10), [filteredSales])

  return (
    <DashboardLayout title="Dashboard">
      <div className="space-y-6">
        {/* Filters */}
        <div className="bg-app-card rounded-card shadow-card p-4 flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  period === p.key ? 'bg-primary text-white' : 'bg-app-hover text-app-body hover:bg-app-hover-strong'
                }`}
              >
                {p.label}
              </button>
            ))}
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="ml-auto px-3 py-1.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          {period === 'custom' && (
            <div className="flex flex-wrap gap-3 items-center">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-3 py-1.5 border border-app-border-input rounded-lg text-sm"
              />
              <span className="text-app-faint text-sm">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-3 py-1.5 border border-app-border-input rounded-lg text-sm"
              />
            </div>
          )}
        </div>

        {/* Sales summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Sales" value={formatCurrency(totals.totalSales)} icon={<DollarIcon />} accent="primary" />
          <StatCard label="Total Profit" value={formatCurrency(totals.totalProfit)} icon={<DollarIcon />} accent="secondary" />
          <StatCard label="Items Sold" value={totals.itemsSold.toLocaleString()} icon={<BoxIcon />} accent="primary" />
          <StatCard label="Transactions" value={totals.transactions.toLocaleString()} icon={<ReportsIcon />} accent="secondary" />
        </div>

        {/* Inventory summary */}
        <div>
          <h2 className="text-sm font-bold text-app-muted uppercase tracking-wide mb-3">Inventory summary</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Products" value={inventorySummary.totalProducts.toLocaleString()} icon={<InventoryIcon />} />
            <StatCard label="Inventory Value" value={formatCurrency(inventorySummary.inventoryValue)} icon={<BoxIcon />} />
            <StatCard
              label="Potential Profit"
              value={formatCurrency(inventorySummary.potentialProfit)}
              icon={<DollarIcon />}
              accent="secondary"
            />
            <StatCard
              label="Low Stock Items"
              value={inventorySummary.lowStock.length.toLocaleString()}
              icon={<WarningIcon />}
              accent="warning"
            />
          </div>
        </div>

        {/* Alerts */}
        {(inventorySummary.lowStock.length > 0 ||
          inventorySummary.expired.length > 0 ||
          inventorySummary.expiringSoon.length > 0) && (
          <div className="grid md:grid-cols-3 gap-4">
            {inventorySummary.lowStock.length > 0 && (
              <AlertCard
                title="Low Stock Alert"
                color="warning"
                items={inventorySummary.lowStock.map((i) => `${i.productName} - ${i.currentStock} left`)}
              />
            )}
            {inventorySummary.expired.length > 0 && (
              <AlertCard
                title="Expired Products"
                color="danger"
                items={inventorySummary.expired.map((i) => `${i.productName} - expired ${i.expiryDate}`)}
              />
            )}
            {inventorySummary.expiringSoon.length > 0 && (
              <AlertCard
                title="Expiring Soon (7 days)"
                color="warning"
                items={inventorySummary.expiringSoon.map((i) => `${i.productName} - expires ${i.expiryDate}`)}
              />
            )}
          </div>
        )}

        {/* Branch performance */}
        {branches.length > 0 && (
          <div className="bg-app-card rounded-card shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-app-border">
              <h2 className="font-bold text-app-heading">Branch Performance</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-app-alt text-app-muted">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold">Branch</th>
                    <th className="text-right px-5 py-3 font-semibold">Sales</th>
                    <th className="text-right px-5 py-3 font-semibold">Profit</th>
                    <th className="text-right px-5 py-3 font-semibold">Items sold</th>
                    <th className="text-right px-5 py-3 font-semibold">Transactions</th>
                  </tr>
                </thead>
                <tbody>
                  {branchPerformance
                    .sort((a, b) => b.totalSales - a.totalSales)
                    .map((bp, idx) => (
                      <tr key={bp.branchId} className={idx % 2 === 0 ? 'bg-app-card' : 'bg-app-alt/50'}>
                        <td className="px-5 py-3 font-medium text-app-heading">{bp.branchName}</td>
                        <td className="px-5 py-3 text-right">{formatCurrency(bp.totalSales)}</td>
                        <td className="px-5 py-3 text-right text-primary font-medium">{formatCurrency(bp.totalProfit)}</td>
                        <td className="px-5 py-3 text-right">{bp.itemsSold}</td>
                        <td className="px-5 py-3 text-right">{bp.transactions}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Recent sales */}
        <div className="bg-app-card rounded-card shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-app-border">
            <h2 className="font-bold text-app-heading">Recent Sales</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-app-alt text-app-muted">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Transaction ID</th>
                  <th className="text-left px-5 py-3 font-semibold">Branch</th>
                  <th className="text-right px-5 py-3 font-semibold">Items</th>
                  <th className="text-right px-5 py-3 font-semibold">Total</th>
                  <th className="text-right px-5 py-3 font-semibold">Profit</th>
                  <th className="text-left px-5 py-3 font-semibold">Payment</th>
                  <th className="text-left px-5 py-3 font-semibold">Cashier</th>
                  <th className="text-left px-5 py-3 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentSales.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center px-5 py-8 text-app-faint">
                      No sales recorded for this period
                    </td>
                  </tr>
                ) : (
                  recentSales.map((s, idx) => (
                    <tr key={s.id} className={idx % 2 === 0 ? 'bg-app-card' : 'bg-app-alt/50'}>
                      <td className="px-5 py-3 font-mono text-xs text-app-body">{s.transactionId}</td>
                      <td className="px-5 py-3">{s.branchName ?? '-'}</td>
                      <td className="px-5 py-3 text-right">{s.items.reduce((a, i) => a + i.quantity, 0)}</td>
                      <td className="px-5 py-3 text-right font-medium">{formatCurrency(s.totalAmount)}</td>
                      <td className="px-5 py-3 text-right text-primary">{formatCurrency(s.totalProfit)}</td>
                      <td className="px-5 py-3 capitalize">{s.paymentMethod.replace('_', ' ')}</td>
                      <td className="px-5 py-3">{s.cashierName}</td>
                      <td className="px-5 py-3 text-app-muted">{formatDateTime(s.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickAction icon={<POSIcon />} label="Open POS" onClick={() => navigate('/pos')} />
          <QuickAction icon={<InventoryIcon />} label="Inventory" onClick={() => navigate('/inventory')} />
          <QuickAction icon={<BarcodeIcon />} label="Print Barcodes" onClick={() => navigate('/barcode')} />
          <QuickAction icon={<ReportsIcon />} label="View Reports" onClick={() => navigate('/reports')} />
        </div>
      </div>
    </DashboardLayout>
  )
}

function AlertCard({ title, color, items }: { title: string; color: 'warning' | 'danger'; items: string[] }) {
  const styles = color === 'warning' ? 'bg-amber-50 text-warning border-amber-200' : 'bg-red-50 text-danger border-red-200'
  return (
    <div className={`rounded-card border p-4 ${styles}`}>
      <div className="flex items-center gap-2 font-bold text-sm mb-2">
        <WarningIcon width={16} height={16} />
        {title} ({items.length})
      </div>
      <ul className="text-xs space-y-1 max-h-32 overflow-y-auto">
        {items.slice(0, 8).map((it, i) => (
          <li key={i} className="truncate">
            {it}
          </li>
        ))}
      </ul>
    </div>
  )
}

function QuickAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-app-card rounded-card shadow-card p-4 flex flex-col items-center gap-2 hover:shadow-md transition-shadow"
    >
      <div className="w-10 h-10 rounded-lg bg-primary-50 text-primary flex items-center justify-center">{icon}</div>
      <span className="text-sm font-medium text-app-body">{label}</span>
    </button>
  )
}
