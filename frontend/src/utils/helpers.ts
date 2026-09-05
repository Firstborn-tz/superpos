export function generateId(prefix = ''): string {
  const rand = Math.random().toString(36).slice(2, 10)
  const time = Date.now().toString(36)
  return `${prefix}${prefix ? '_' : ''}${time}${rand}`
}

export function generateTransactionId(): string {
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `TXN-${stamp}-${rand}`
}

export function generateBranchCode(name: string): string {
  const letters = name.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 3).padEnd(3, 'X')
  const rand = Math.floor(100 + Math.random() * 900)
  return `${letters}${rand}`
}

/**
 * Generates a 13-digit EAN-13-shaped barcode string.
 * Deterministic length, unique enough for a single-tenant POS.
 */
export function generateBarcode(): string {
  let digits = ''
  for (let i = 0; i < 12; i++) {
    digits += Math.floor(Math.random() * 10).toString()
  }
  // Compute EAN-13 check digit
  let sum = 0
  for (let i = 0; i < 12; i++) {
    const n = parseInt(digits[i], 10)
    sum += i % 2 === 0 ? n : n * 3
  }
  const check = (10 - (sum % 10)) % 10
  return digits + check.toString()
}

export function generateBatchNumber(): string {
  const d = new Date()
  return `BATCH-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${Math.floor(
    100 + Math.random() * 900,
  )}`
}

export function formatCurrency(amount: number, currency = 'TZS'): string {
  return `${currency} ${Math.round(amount).toLocaleString('en-US')}`
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return `${formatDate(iso)} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

export function daysUntil(dateIso: string): number {
  const target = new Date(dateIso)
  target.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export function isExpired(dateIso: string): boolean {
  return daysUntil(dateIso) < 0
}

export function isExpiringSoon(dateIso: string, thresholdDays = 7): boolean {
  const d = daysUntil(dateIso)
  return d >= 0 && d <= thresholdDays
}

export function isLowStock(current: number, initial: number, thresholdPct = 0.05): boolean {
  if (initial <= 0) return false
  return current > 0 && current / initial <= thresholdPct
}

export function isOutOfStock(current: number): boolean {
  return current <= 0
}

export function startOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

export function endOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(23, 59, 59, 999)
  return c
}

export function getRangeForPeriod(period: 'daily' | 'weekly' | 'monthly' | 'yearly'): { start: Date; end: Date } {
  const now = new Date()
  const end = endOfDay(now)
  const start = new Date(now)
  if (period === 'daily') {
    return { start: startOfDay(now), end }
  }
  if (period === 'weekly') {
    start.setDate(now.getDate() - 6)
    return { start: startOfDay(start), end }
  }
  if (period === 'monthly') {
    start.setDate(now.getDate() - 29)
    return { start: startOfDay(start), end }
  }
  // yearly
  start.setFullYear(now.getFullYear() - 1)
  return { start: startOfDay(start), end }
}

export function isWithinRange(iso: string, start: Date, end: Date): boolean {
  const t = new Date(iso).getTime()
  return t >= start.getTime() && t <= end.getTime()
}
