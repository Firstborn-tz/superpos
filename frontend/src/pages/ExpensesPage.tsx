import { useMemo, useState, type FormEvent } from 'react'
import DashboardLayout from '@/components/layout/DashboardLayout'
import StatCard from '@/components/common/StatCard'
import { useAuthStore } from '@/store/authStore'
import { useDataStore } from '@/store/dataStore'
import { syncService } from '@/services/sync/syncService'
import { toast } from '@/store/toastStore'
import { formatCurrency, formatDate, formatDateTime, generateId, startOfDay, endOfDay, isWithinRange } from '@/utils/helpers'
import { CalendarIcon, DollarIcon, ReportsIcon } from '@/components/common/Icons'

export default function ExpensesPage() {
  const user = useAuthStore((s) => s.user)
  const { branchExpenses, addBranchExpense } = useDataStore()
  const today = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }, [])
  const [selectedDate, setSelectedDate] = useState(today)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')

  const expenses = useMemo(() => branchExpenses
    .filter((expense) => (!user?.branchId || expense.branchId === user.branchId) && isWithinRange(expense.createdAt, startOfDay(new Date(selectedDate)), endOfDay(new Date(selectedDate))))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [branchExpenses, user, selectedDate])
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0)

  function submit(event: FormEvent) {
    event.preventDefault()
    const cleanName = name.trim()
    const value = Number(amount)
    if (!cleanName || !Number.isFinite(value) || value <= 0 || !user) {
      toast.error('Enter an expense name and an amount greater than zero')
      return
    }
    const expense = {
      id: generateId('expense'), name: cleanName, amount: value, createdAt: new Date().toISOString(),
      recordedBy: user.fullName ?? user.email ?? 'Cashier', branchId: user.branchId, branchName: user.branchName,
    }
    addBranchExpense(expense)
    syncService.addPendingOperation('BRANCH_EXPENSE', expense)
    toast.success('Branch expense recorded')
    setName('')
    setAmount('')
  }

  return <DashboardLayout title="Branch Expenses">
    <div className="space-y-5">
      <form onSubmit={submit} className="bg-app-card rounded-card shadow-card p-5 grid sm:grid-cols-[1fr_180px_auto] gap-3 items-end">
        <label className="text-sm font-medium text-app-body">Expense name<input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cleaning supplies" className="mt-1 w-full px-3 py-2 border border-app-border-input rounded-lg bg-app-card" /></label>
        <label className="text-sm font-medium text-app-body">Amount<input required min="0.01" step="0.01" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="mt-1 w-full px-3 py-2 border border-app-border-input rounded-lg bg-app-card" /></label>
        <button className="px-5 py-2 rounded-lg bg-primary text-white font-semibold hover:bg-primary-dark">Add expense</button>
      </form>
      <div className="bg-app-card rounded-card shadow-card p-4 flex flex-wrap gap-3 items-center">
        <CalendarIcon width={18} height={18} className="text-app-faint" /><label className="text-sm">Select day</label>
        <input type="date" value={selectedDate} max={today} onChange={(e) => setSelectedDate(e.target.value)} className="px-3 py-2 border border-app-border-input rounded-lg bg-app-card" />
        <button type="button" onClick={() => setSelectedDate(today)} className="px-3 py-2 rounded-lg bg-app-hover text-sm">Today</button>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <StatCard label="Total Expenses" value={formatCurrency(total)} icon={<DollarIcon />} subtext={formatDate(new Date(`${selectedDate}T00:00:00`).toISOString())} />
        <StatCard label="Expense Entries" value={expenses.length.toLocaleString()} icon={<ReportsIcon />} accent="secondary" />
      </div>
      <div className="bg-app-card rounded-card shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-app-border"><h2 className="font-bold text-app-heading">Expenses for {formatDate(new Date(`${selectedDate}T00:00:00`).toISOString())}</h2></div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-app-alt text-app-muted"><tr><th className="text-left px-5 py-3">Expense</th><th className="text-right px-5 py-3">Amount</th><th className="text-left px-5 py-3">Recorded by</th><th className="text-left px-5 py-3">Time</th></tr></thead>
          <tbody>{expenses.length ? expenses.map((expense, index) => <tr key={expense.id} className={index % 2 ? 'bg-app-alt/50' : ''}><td className="px-5 py-3 font-medium">{expense.name}</td><td className="px-5 py-3 text-right font-semibold">{formatCurrency(expense.amount)}</td><td className="px-5 py-3">{expense.recordedBy}</td><td className="px-5 py-3 text-app-muted">{formatDateTime(expense.createdAt)}</td></tr>) : <tr><td colSpan={4} className="text-center px-5 py-10 text-app-faint">No expenses recorded for this day</td></tr>}</tbody>
        </table></div>
      </div>
    </div>
  </DashboardLayout>
}
