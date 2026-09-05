export type UserRole = 'admin' | 'cashier'

export interface User {
  id: string
  email?: string
  fullName?: string
  role: UserRole
  branchId?: string
  branchName?: string
}

export interface AuthSession {
  user: User
  token: string
}

export interface Branch {
  id: string
  name: string
  code: string
  password: string
  address: string
  phone: string
  createdAt: string
}

/** Location information that may safely be displayed on the public site. */
export type PublicBranch = Omit<Branch, 'password'>

export interface StockBatch {
  id: string
  quantity: number
  buyingPrice: number
  expiryDate: string
  batchNumber: string
  receivedAt: string
}

export interface InventoryItem {
  id: string
  barcode: string
  productName: string
  buyingPrice: number
  sellingPrice: number
  currentStock: number
  initialStock: number
  expiryDate: string
  batchNumber: string
  createdAt: string
  branchId?: string
  branchName?: string
  // Batch-level FEFO (first-expire-first-out) tracking. Each stock
  // delivery is its own batch with its own expiry and cost. The fields
  // above (currentStock, expiryDate, buyingPrice) are kept in sync as a
  // derived summary of these batches - see utils/batches.ts - so
  // existing code that reads them directly (Dashboard, Reports, POS,
  // low-stock/expiry checks) keeps working unchanged. currentStock only
  // counts non-expired batches (sellable stock); expired quantities are
  // tracked separately below for admin visibility.
  batches?: StockBatch[]
  hasExpiredBatches?: boolean
  expiredQuantity?: number
}

export interface CartItem {
  id: string
  inventoryId: string
  barcode: string
  productName: string
  unitPrice: number
  buyingPrice: number
  quantity: number
  totalPrice: number
  availableStock: number
  discountPercent?: number
}

export type PaymentMethod = 'cash' | 'mobile_money'

export interface SaleRecord {
  id: string
  transactionId: string
  items: CartItem[]
  subtotal: number
  discountAmount: number
  totalAmount: number
  totalProfit: number
  paymentMethod: PaymentMethod
  amountReceived?: number
  changeAmount?: number
  createdAt: string
  cashierName: string
  branchId?: string
  branchName?: string
  refunded?: boolean
  refundedAmount?: number
}

export type RefundReason = 'wrong_item' | 'damaged' | 'customer_changed_mind' | 'expired' | 'other'

export interface RefundItem {
  inventoryId: string
  productName: string
  unitPrice: number
  quantity: number
  totalPrice: number
}

export interface RefundRecord {
  id: string
  refundId: string
  originalSaleId: string
  originalTransactionId: string
  items: RefundItem[]
  totalRefunded: number
  reason: RefundReason
  note?: string
  restockItems: boolean
  createdAt: string
  cashierName: string
  branchId?: string
  branchName?: string
}

export type StockAdjustmentReason = 'damage' | 'theft' | 'spoilage' | 'stock_take_correction' | 'other'

export interface StockAdjustmentRecord {
  id: string
  inventoryId: string
  productName: string
  quantityChange: number // negative for write-off, positive for correction upward
  reason: StockAdjustmentReason
  note?: string
  createdAt: string
  performedBy: string
  branchId?: string
  branchName?: string
}

export interface HeldSale {
  id: string
  label: string
  items: CartItem[]
  heldAt: string
}

export type ActivityAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'SALE'
  | 'REFUND'
  | 'STOCK_ADJUSTMENT'
  | 'ADD_PRODUCT'
  | 'ADD_STOCK'
  | 'ADD_BRANCH'
  | 'DELETE_BRANCH'
  | 'PASSWORD_CHANGE'

export interface ChatMessage {
  id: string
  branchId: string
  senderRole: 'admin' | 'cashier'
  senderName: string
  text: string
  createdAt: string
}

export interface ActivityLogEntry {
  id: string
  action: ActivityAction
  description: string
  performedBy: string
  branchId?: string
  branchName?: string
  createdAt: string
}

export type OperationType =
  | 'ADD_PRODUCT'
  | 'ADD_STOCK'
  | 'SALE'
  | 'ADD_BRANCH'
  | 'DELETE_BRANCH'
  | 'UPDATE_BRANCH_PASSWORD'
  | 'REFUND'
  | 'STOCK_ADJUSTMENT'
  | 'ACTIVITY_LOG'
  | 'CHAT_MESSAGE'

export interface PendingOperation {
  id: string
  type: OperationType
  payload: unknown
  createdAt: string
  attempts: number
  status: 'pending' | 'syncing' | 'failed'
  error?: string
}

export interface SyncStatus {
  isOnline: boolean
  isSyncing: boolean
  pendingCount: number
  lastSyncedAt: string | null
  lastError: string | null
}

export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'

export interface DateRange {
  start: string
  end: string
}

export interface BranchPerformance {
  branchId: string
  branchName: string
  totalSales: number
  totalProfit: number
  transactions: number
  itemsSold: number
}

export interface AppSettings {
  language: 'en' | 'sw'
  currency: string
  receiptFooter: string
}
