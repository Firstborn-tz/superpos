import { useMemo, useState } from 'react'
import DashboardLayout from '@/components/layout/DashboardLayout'
import Modal from '@/components/common/Modal'
import StatCard from '@/components/common/StatCard'
import { useAuthStore } from '@/store/authStore'
import { useDataStore } from '@/store/dataStore'
import type { SaleRecord } from '@/types'
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  getRangeForPeriod,
  isExpired,
  isExpiringSoon,
  isLowStock,
  isWithinRange,
  startOfDay,
  endOfDay,
} from '@/utils/helpers'
import { exportToCsv } from '@/utils/csv'
import { printElement } from '@/utils/print'
import { DollarIcon, BoxIcon, WarningIcon, PrintIcon, ReportsIcon, CalendarIcon, ChartIcon } from '@/components/common/Icons'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

export default function ReportsPage() {
  const user = useAuthStore((s) => s.user)

  // Cashiers get a simplified, sales-only view with no profit figures anywhere.
  // Admins get the full multi-report view including profit and activity log.
  if (user?.role === 'cashier') {
    return <CashierDailySalesReport />
  }
  return <AdminReports />
}

/* ------------------------------------------------------------------ */
/* Cashier: pick a day, see total sales for that day, drill into the   */
/* individual transactions. No profit or buying-price data is shown.   */
/* ------------------------------------------------------------------ */

function CashierDailySalesReport() {
  const user = useAuthStore((s) => s.user)
  const { sales } = useDataStore()

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [selectedDate, setSelectedDate] = useState(todayIso)
  const [activeSale, setActiveSale] = useState<SaleRecord | null>(null)

  const daySales = useMemo(() => {
    const start = startOfDay(new Date(selectedDate))
    const end = endOfDay(new Date(selectedDate))
    return sales
      .filter((s) => (!user?.branchId || s.branchId === user.branchId) && isWithinRange(s.createdAt, start, end))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [sales, selectedDate, user])

  const totals = useMemo(() => {
    const totalSales = daySales.reduce((sum, s) => sum + s.totalAmount, 0)
    const itemsSold = daySales.reduce((sum, s) => sum + s.items.reduce((a, i) => a + i.quantity, 0), 0)
    const cash = daySales.filter((s) => s.paymentMethod === 'cash').reduce((sum, s) => sum + s.totalAmount, 0)
    const mobile = daySales.filter((s) => s.paymentMethod === 'mobile_money').reduce((sum, s) => sum + s.totalAmount, 0)
    return { totalSales, itemsSold, transactions: daySales.length, cash, mobile }
  }, [daySales])

  function handlePrint() {
    window.print()
  }

  function handleExport() {
    exportToCsv(
      `sales-${selectedDate}`,
      daySales.map((s) => ({
        'Transaction ID': s.transactionId,
        Items: s.items.reduce((a, i) => a + i.quantity, 0),
        Total: s.totalAmount,
        Payment: s.paymentMethod,
        Time: formatDateTime(s.createdAt),
      })),
    )
  }

  return (
    <DashboardLayout title="Sales Report">
      <div className="space-y-5">
        <div className="bg-app-card rounded-card shadow-card p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <CalendarIcon width={18} height={18} className="text-app-faint" />
            <label className="text-sm font-medium text-app-body">Select day</label>
          </div>
          <input
            type="date"
            value={selectedDate}
            max={todayIso}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={() => setSelectedDate(todayIso)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-app-hover text-app-body hover:bg-app-hover-strong"
          >
            Today
          </button>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={handleExport}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-secondary hover:bg-blue-700 text-white"
            >
              Export CSV
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold px-4 py-2 rounded-lg"
            >
              <PrintIcon width={16} height={16} />
              Print
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Sales"
            value={formatCurrency(totals.totalSales)}
            icon={<DollarIcon />}
            subtext={formatDate(new Date(selectedDate).toISOString())}
          />
          <StatCard label="Transactions" value={totals.transactions.toLocaleString()} icon={<ReportsIcon />} accent="secondary" />
          <StatCard label="Items Sold" value={totals.itemsSold.toLocaleString()} icon={<BoxIcon />} />
          <StatCard
            label="Cash / Mobile Money"
            value={`${formatCurrency(totals.cash)} / ${formatCurrency(totals.mobile)}`}
            icon={<DollarIcon />}
            accent="secondary"
          />
        </div>

        <div className="bg-app-card rounded-card shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-app-border">
            <h2 className="font-bold text-app-heading">Transactions for {formatDate(new Date(selectedDate).toISOString())}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-app-alt text-app-muted">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Transaction ID</th>
                  <th className="text-right px-5 py-3 font-semibold">Items</th>
                  <th className="text-right px-5 py-3 font-semibold">Total</th>
                  <th className="text-left px-5 py-3 font-semibold">Payment</th>
                  <th className="text-left px-5 py-3 font-semibold">Time</th>
                  <th className="text-right px-5 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {daySales.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center px-5 py-10 text-app-faint">
                      No sales recorded on this day
                    </td>
                  </tr>
                ) : (
                  daySales.map((s, idx) => (
                    <tr
                      key={s.id}
                      className={`cursor-pointer hover:bg-primary-50/50 transition-colors ${idx % 2 === 0 ? 'bg-app-card' : 'bg-app-alt/50'}`}
                      onClick={() => setActiveSale(s)}
                    >
                      <td className="px-5 py-3 font-mono text-xs text-app-body">{s.transactionId}</td>
                      <td className="px-5 py-3 text-right">{s.items.reduce((a, i) => a + i.quantity, 0)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-app-heading">{formatCurrency(s.totalAmount)}</td>
                      <td className="px-5 py-3 capitalize">{s.paymentMethod.replace('_', ' ')}</td>
                      <td className="px-5 py-3 text-app-muted">{formatDateTime(s.createdAt).split(' ').slice(-2).join(' ')}</td>
                      <td className="px-5 py-3 text-right text-primary text-xs font-semibold">View &rarr;</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal open={!!activeSale} onClose={() => setActiveSale(null)} title="Transaction Details">
        {activeSale && (
          <div className="space-y-4">
            <div className="flex justify-between text-sm text-app-muted">
              <span className="font-mono">{activeSale.transactionId}</span>
              <span>{formatDateTime(activeSale.createdAt)}</span>
            </div>
            <div className="border-t border-app-border pt-3 space-y-1.5">
              {activeSale.items.map((item) => (
                <div key={item.inventoryId} className="flex justify-between text-sm">
                  <span className="text-app-body">
                    {item.productName} x{item.quantity}
                  </span>
                  <span className="font-medium">{formatCurrency(item.totalPrice)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-app-border pt-3 flex justify-between font-bold">
              <span>Total</span>
              <span className="text-primary">{formatCurrency(activeSale.totalAmount)}</span>
            </div>
            <div className="flex justify-between text-sm text-app-muted">
              <span>Payment</span>
              <span className="capitalize">{activeSale.paymentMethod.replace('_', ' ')}</span>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  )
}

/* ------------------------------------------------------------------ */
/* Admin: full multi-report view - sales, profit, inventory, expiry,   */
/* activity log - with branch filtering, trend/comparison charts, an   */
/* item-and-discount drill-down per transaction, and CSV export on     */
/* every tab.                                                          */
/* ------------------------------------------------------------------ */

type ReportType = 'sales' | 'profit' | 'inventory' | 'expiry' | 'activity'
type RangeKey = 'daily' | 'weekly' | 'monthly' | 'all'

const REPORT_TYPES: { key: ReportType; label: string }[] = [
  { key: 'sales', label: 'Sales' },
  { key: 'profit', label: 'Profit' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'expiry', label: 'Expiry' },
  { key: 'activity', label: 'Activity Log' },
]

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'all', label: 'All Time' },
]

const CHART_COLORS = ['#16a34a', '#2563eb', '#f59e0b', '#ef4444', '#8b5cf6', '#0891b2', '#db2777']

function AdminReports() {
  const { sales, inventory, activityLog, branches } = useDataStore()
  const [reportType, setReportType] = useState<ReportType>('sales')
  const [range, setRange] = useState<RangeKey>('daily')
  const [branchFilter, setBranchFilter] = useState<string>('all')
  const [activeSale, setActiveSale] = useState<SaleRecord | null>(null)

  const branchScopedSales = useMemo(
    () => (branchFilter === 'all' ? sales : sales.filter((s) => s.branchId === branchFilter)),
    [sales, branchFilter],
  )
  const branchScopedInventory = useMemo(
    () => (branchFilter === 'all' ? inventory : inventory.filter((i) => i.branchId === branchFilter)),
    [inventory, branchFilter],
  )

  const filteredSales = useMemo(() => {
    if (range === 'all') return branchScopedSales
    const { start, end } = getRangeForPeriod(range)
    return branchScopedSales.filter((s) => isWithinRange(s.createdAt, start, end))
  }, [branchScopedSales, range])

  const totals = useMemo(() => {
    const totalSales = filteredSales.reduce((s, r) => s + r.totalAmount, 0)
    const totalProfit = filteredSales.reduce((s, r) => s + r.totalProfit, 0)
    const totalDiscount = filteredSales.reduce((s, r) => s + (r.discountAmount || 0), 0)
    const itemsSold = filteredSales.reduce((s, r) => s + r.items.reduce((a, i) => a + i.quantity, 0), 0)
    return { totalSales, totalProfit, totalDiscount, itemsSold, transactions: filteredSales.length }
  }, [filteredSales])

  const inventoryStats = useMemo(() => {
    const totalProducts = branchScopedInventory.length
    const totalValue = branchScopedInventory.reduce((s, i) => s + i.buyingPrice * i.currentStock, 0)
    const lowStock = branchScopedInventory.filter((i) => isLowStock(i.currentStock, i.initialStock))
    return { totalProducts, totalValue, lowStock }
  }, [branchScopedInventory])

  const expiryStats = useMemo(() => {
    const expired = branchScopedInventory.filter((i) => isExpired(i.expiryDate) || i.hasExpiredBatches)
    const expiringSoon = branchScopedInventory.filter((i) => isExpiringSoon(i.expiryDate))
    return { expired, expiringSoon }
  }, [branchScopedInventory])

  // Trend chart: sales & profit grouped by calendar day, oldest to newest.
  const trendData = useMemo(() => {
    const byDay = new Map<string, { date: string; sales: number; profit: number }>()
    for (const s of filteredSales) {
      const day = s.createdAt.slice(0, 10)
      const entry = byDay.get(day) ?? { date: day, sales: 0, profit: 0 }
      entry.sales += s.totalAmount
      entry.profit += s.totalProfit
      byDay.set(day, entry)
    }
    return Array.from(byDay.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ ...d, label: formatDate(d.date) }))
  }, [filteredSales])

  // Branch comparison chart: only meaningful when viewing all branches
  // together and there's more than one branch to compare.
  const branchComparisonData = useMemo(() => {
    if (branchFilter !== 'all' || branches.length < 2) return []
    return branches
      .map((b) => {
        const branchSales = filteredSales.filter((s) => s.branchId === b.id)
        return {
          name: b.name,
          sales: branchSales.reduce((s, r) => s + r.totalAmount, 0),
          profit: branchSales.reduce((s, r) => s + r.totalProfit, 0),
        }
      })
      .filter((b) => b.sales > 0 || b.profit > 0)
  }, [branches, filteredSales, branchFilter])

  function handlePrint() {
    printElement('report-print-area')
  }

  function handleExport() {
    if (reportType === 'sales' || reportType === 'profit') {
      exportToCsv(
        `${reportType}-report-${range}`,
        filteredSales.map((s) => ({
          'Transaction ID': s.transactionId,
          Branch: s.branchName ?? '',
          Subtotal: s.subtotal,
          Discount: s.discountAmount,
          Total: s.totalAmount,
          Profit: s.totalProfit,
          Cashier: s.cashierName,
          Date: formatDateTime(s.createdAt),
        })),
      )
    } else if (reportType === 'inventory') {
      exportToCsv(
        'inventory-report',
        branchScopedInventory.map((i) => ({
          Product: i.productName,
          Stock: i.currentStock,
          'Buying Price': i.buyingPrice,
          'Selling Price': i.sellingPrice,
          Value: i.buyingPrice * i.currentStock,
          'Potential Profit': (i.sellingPrice - i.buyingPrice) * i.currentStock,
          Expiry: i.expiryDate,
        })),
      )
    } else if (reportType === 'expiry') {
      exportToCsv(
        'expiry-report',
        [...expiryStats.expired, ...expiryStats.expiringSoon].map((i) => ({
          Product: i.productName,
          Expiry: i.expiryDate,
          Status: isExpired(i.expiryDate) ? 'Expired' : i.hasExpiredBatches ? 'Partially Expired' : 'Expiring Soon',
        })),
      )
    } else if (reportType === 'activity') {
      exportToCsv(
        'activity-log',
        activityLog.map((a) => ({
          Action: a.action,
          Description: a.description,
          'Performed By': a.performedBy,
          Branch: a.branchName ?? '',
          Date: formatDateTime(a.createdAt),
        })),
      )
    }
  }

  return (
    <DashboardLayout title="Reports">
      <div className="space-y-5">
        <div className="bg-app-card rounded-card shadow-card p-4 flex flex-wrap items-center gap-3">
          <div className="flex gap-2 flex-wrap">
            {REPORT_TYPES.map((r) => (
              <button
                key={r.key}
                onClick={() => setReportType(r.key)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  reportType === r.key ? 'bg-primary text-white' : 'bg-app-hover text-app-body hover:bg-app-hover-strong'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="px-3 py-1.5 border border-app-border-input rounded-lg text-sm bg-app-card focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          {(reportType === 'sales' || reportType === 'profit') && (
            <div className="flex gap-2 flex-wrap">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    range === r.key ? 'bg-secondary text-white' : 'bg-app-hover text-app-body hover:bg-app-hover-strong'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2 ml-auto">
            <button onClick={handleExport} className="px-4 py-2 rounded-lg text-sm font-semibold bg-secondary hover:bg-blue-700 text-white">
              Export CSV
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold px-4 py-2 rounded-lg"
            >
              <PrintIcon width={16} height={16} />
              Print
            </button>
          </div>
        </div>

        <div id="report-print-area">
          {(reportType === 'sales' || reportType === 'profit') && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <StatCard label="Total Sales" value={formatCurrency(totals.totalSales)} icon={<DollarIcon />} />
                <StatCard label="Total Profit" value={formatCurrency(totals.totalProfit)} icon={<DollarIcon />} accent="secondary" />
                <StatCard label="Discounts Given" value={formatCurrency(totals.totalDiscount)} icon={<DollarIcon />} accent="warning" />
                <StatCard label="Items Sold" value={totals.itemsSold.toLocaleString()} icon={<BoxIcon />} />
                <StatCard label="Transactions" value={totals.transactions.toLocaleString()} icon={<ReportsIcon />} accent="secondary" />
              </div>

              {trendData.length > 1 && (
                <div className="bg-app-card rounded-card shadow-card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <ChartIcon width={16} height={16} className="text-primary" />
                    <h2 className="font-bold text-app-heading">Sales &amp; Profit Trend</h2>
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} />
                      <YAxis tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        contentStyle={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 8 }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="sales" name="Sales" stroke="#16a34a" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="profit" name="Profit" stroke="#2563eb" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {branchComparisonData.length > 0 && (
                <div className="bg-app-card rounded-card shadow-card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <ChartIcon width={16} height={16} className="text-secondary" />
                    <h2 className="font-bold text-app-heading">Branch Comparison</h2>
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={branchComparisonData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} />
                      <YAxis tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        contentStyle={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 8 }}
                      />
                      <Legend />
                      <Bar dataKey="sales" name="Sales" radius={[4, 4, 0, 0]}>
                        {branchComparisonData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                      <Bar dataKey="profit" name="Profit" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="bg-app-card rounded-card shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-app-border flex items-center justify-between">
                  <h2 className="font-bold text-app-heading">Transactions</h2>
                  <span className="text-xs text-app-faint">Click a row for item &amp; discount detail</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-app-alt text-app-muted">
                      <tr>
                        <th className="text-left px-5 py-3 font-semibold">Transaction ID</th>
                        <th className="text-left px-5 py-3 font-semibold">Branch</th>
                        <th className="text-right px-5 py-3 font-semibold">Total</th>
                        <th className="text-right px-5 py-3 font-semibold">Discount</th>
                        <th className="text-right px-5 py-3 font-semibold">Profit</th>
                        <th className="text-left px-5 py-3 font-semibold">Cashier</th>
                        <th className="text-left px-5 py-3 font-semibold">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSales.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center px-5 py-10 text-app-faint">
                            No transactions in this period
                          </td>
                        </tr>
                      ) : (
                        filteredSales.map((s, idx) => (
                          <tr
                            key={s.id}
                            onClick={() => setActiveSale(s)}
                            className={`cursor-pointer hover:bg-primary-50/40 transition-colors ${idx % 2 === 0 ? 'bg-app-card' : 'bg-app-alt/50'}`}
                          >
                            <td className="px-5 py-3 font-mono text-xs text-app-body">{s.transactionId}</td>
                            <td className="px-5 py-3">{s.branchName ?? '-'}</td>
                            <td className="px-5 py-3 text-right font-medium">{formatCurrency(s.totalAmount)}</td>
                            <td className="px-5 py-3 text-right text-warning">
                              {s.discountAmount > 0 ? formatCurrency(s.discountAmount) : '-'}
                            </td>
                            <td className="px-5 py-3 text-right text-primary">{formatCurrency(s.totalProfit)}</td>
                            <td className="px-5 py-3">{s.cashierName}</td>
                            <td className="px-5 py-3 text-app-muted">{formatDateTime(s.createdAt)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {reportType === 'inventory' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <StatCard label="Total Products" value={inventoryStats.totalProducts.toLocaleString()} icon={<BoxIcon />} />
                <StatCard label="Inventory Value" value={formatCurrency(inventoryStats.totalValue)} icon={<DollarIcon />} accent="secondary" />
                <StatCard label="Low Stock Items" value={inventoryStats.lowStock.length.toLocaleString()} icon={<WarningIcon />} accent="warning" />
              </div>
              <div className="bg-app-card rounded-card shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-app-border">
                  <h2 className="font-bold text-app-heading">Inventory Summary</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-app-alt text-app-muted">
                      <tr>
                        <th className="text-left px-5 py-3 font-semibold">Product</th>
                        <th className="text-right px-5 py-3 font-semibold">Stock</th>
                        <th className="text-right px-5 py-3 font-semibold">Value</th>
                        <th className="text-right px-5 py-3 font-semibold">Potential profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {branchScopedInventory.map((i, idx) => (
                        <tr key={i.id} className={idx % 2 === 0 ? 'bg-app-card' : 'bg-app-alt/50'}>
                          <td className="px-5 py-3 font-medium text-app-heading">{i.productName}</td>
                          <td className="px-5 py-3 text-right">{i.currentStock}</td>
                          <td className="px-5 py-3 text-right">{formatCurrency(i.buyingPrice * i.currentStock)}</td>
                          <td className="px-5 py-3 text-right text-primary">
                            {formatCurrency((i.sellingPrice - i.buyingPrice) * i.currentStock)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {reportType === 'expiry' && (
            <div className="grid md:grid-cols-2 gap-5">
              <div className="bg-app-card rounded-card shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-app-border flex items-center gap-2">
                  <WarningIcon width={16} height={16} className="text-danger" />
                  <h2 className="font-bold text-app-heading">Expired products ({expiryStats.expired.length})</h2>
                </div>
                <div className="divide-y divide-app-border max-h-[400px] overflow-y-auto">
                  {expiryStats.expired.length === 0 ? (
                    <p className="text-center text-app-faint py-8 text-sm">No expired products</p>
                  ) : (
                    expiryStats.expired.map((i) => (
                      <div key={i.id} className="px-5 py-3 flex justify-between text-sm">
                        <span className="font-medium text-app-heading">{i.productName}</span>
                        <span className="text-danger">{formatDate(i.expiryDate)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="bg-app-card rounded-card shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-app-border flex items-center gap-2">
                  <WarningIcon width={16} height={16} className="text-warning" />
                  <h2 className="font-bold text-app-heading">Expiring soon ({expiryStats.expiringSoon.length})</h2>
                </div>
                <div className="divide-y divide-app-border max-h-[400px] overflow-y-auto">
                  {expiryStats.expiringSoon.length === 0 ? (
                    <p className="text-center text-app-faint py-8 text-sm">No products expiring soon</p>
                  ) : (
                    expiryStats.expiringSoon.map((i) => (
                      <div key={i.id} className="px-5 py-3 flex justify-between text-sm">
                        <span className="font-medium text-app-heading">{i.productName}</span>
                        <span className="text-warning">{formatDate(i.expiryDate)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {reportType === 'activity' && (
            <div className="bg-app-card rounded-card shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-app-border">
                <h2 className="font-bold text-app-heading">Activity log</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-app-alt text-app-muted">
                    <tr>
                      <th className="text-left px-5 py-3 font-semibold">Action</th>
                      <th className="text-left px-5 py-3 font-semibold">Description</th>
                      <th className="text-left px-5 py-3 font-semibold">By</th>
                      <th className="text-left px-5 py-3 font-semibold">Branch</th>
                      <th className="text-left px-5 py-3 font-semibold">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityLog.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center px-5 py-10 text-app-faint">
                          No activity recorded yet
                        </td>
                      </tr>
                    ) : (
                      activityLog.slice(0, 200).map((a, idx) => (
                        <tr key={a.id} className={idx % 2 === 0 ? 'bg-app-card' : 'bg-app-alt/50'}>
                          <td className="px-5 py-3 font-mono text-xs text-app-muted">{a.action}</td>
                          <td className="px-5 py-3">{a.description}</td>
                          <td className="px-5 py-3">{a.performedBy}</td>
                          <td className="px-5 py-3">{a.branchName ?? '-'}</td>
                          <td className="px-5 py-3 text-app-muted">{formatDateTime(a.createdAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      <SaleDetailModal sale={activeSale} onClose={() => setActiveSale(null)} />
    </DashboardLayout>
  )
}

/** Item-and-discount drill-down for a single transaction, admin only -
 * shows per-line unit price, quantity, discount %, line total, and the
 * overall profit for the sale. */
function SaleDetailModal({ sale, onClose }: { sale: SaleRecord | null; onClose: () => void }) {
  if (!sale) return null

  return (
    <Modal open={!!sale} onClose={onClose} title={`Transaction ${sale.transactionId}`} maxWidth="max-w-2xl">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-app-muted">
          <span>{sale.branchName ?? '-'}</span>
          <span>{sale.cashierName}</span>
          <span>{formatDateTime(sale.createdAt)}</span>
          <span className="capitalize">{sale.paymentMethod.replace('_', ' ')}</span>
        </div>

        <div className="overflow-x-auto border border-app-border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-app-alt text-app-muted">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Item</th>
                <th className="text-right px-3 py-2 font-semibold">Qty</th>
                <th className="text-right px-3 py-2 font-semibold">Unit price</th>
                <th className="text-right px-3 py-2 font-semibold">Discount</th>
                <th className="text-right px-3 py-2 font-semibold">Line total</th>
                <th className="text-right px-3 py-2 font-semibold">Profit</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item) => {
                const lineProfit =
                  (item.unitPrice * (1 - (item.discountPercent ?? 0) / 100) - item.buyingPrice) * item.quantity
                return (
                  <tr key={item.id} className="border-t border-app-border">
                    <td className="px-3 py-2 font-medium text-app-heading">{item.productName}</td>
                    <td className="px-3 py-2 text-right">{item.quantity}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                    <td className="px-3 py-2 text-right text-warning">
                      {item.discountPercent ? `${item.discountPercent}%` : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{formatCurrency(item.totalPrice)}</td>
                    <td className="px-3 py-2 text-right text-primary">{formatCurrency(lineProfit)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="bg-app-alt rounded-lg p-3">
            <div className="text-app-faint text-xs">Subtotal</div>
            <div className="font-bold text-app-heading">{formatCurrency(sale.subtotal)}</div>
          </div>
          <div className="bg-app-alt rounded-lg p-3">
            <div className="text-app-faint text-xs">Discount</div>
            <div className="font-bold text-warning">{formatCurrency(sale.discountAmount)}</div>
          </div>
          <div className="bg-app-alt rounded-lg p-3">
            <div className="text-app-faint text-xs">Total</div>
            <div className="font-bold text-app-heading">{formatCurrency(sale.totalAmount)}</div>
          </div>
          <div className="bg-app-alt rounded-lg p-3">
            <div className="text-app-faint text-xs">Profit</div>
            <div className="font-bold text-primary">{formatCurrency(sale.totalProfit)}</div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
