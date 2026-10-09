import { create } from 'zustand'
import type { ActivityLogEntry, Branch, BranchExpenseRecord, BranchSyncStatus, InventoryItem, OperationType, PendingOperation, RefundRecord, SaleRecord, StockAdjustmentRecord } from '@/types'
import { STORAGE_KEYS, readStorage, writeStorage } from '@/utils/storage'
import { pullAllFromFirestore, pullCashierRecords, pullPublicBranches, pullPublicOperationalData } from '@/services/firebase/firestoreService'
import { useAuthStore } from '@/store/authStore'
import { syncService } from '@/services/sync/syncService'

const REFUNDS_KEY = 'superpos_refunds'
const ADJUSTMENTS_KEY = 'superpos_stock_adjustments'
const EXPENSES_KEY = 'superpos_branch_expenses'
const ACTIVITY_LOG_KEY = 'superpos_activity_log'

function overlayPending<T extends { id: string }>(
  serverRecords: T[],
  operations: PendingOperation[],
  writeTypes: OperationType[],
  deleteType?: OperationType,
): T[] {
  const records = new Map(serverRecords.map((record) => [record.id, record]))
  for (const operation of operations) {
    if (writeTypes.includes(operation.type)) {
      const record = operation.payload as T
      if (record && typeof record.id === 'string') records.set(record.id, record)
    } else if (deleteType && operation.type === deleteType) {
      const id = (operation.payload as { id?: unknown } | null)?.id
      if (typeof id === 'string') records.delete(id)
    }
  }
  return [...records.values()]
}

interface DataState {
  inventory: InventoryItem[]
  sales: SaleRecord[]
  branches: Branch[]
  refunds: RefundRecord[]
  stockAdjustments: StockAdjustmentRecord[]
  branchExpenses: BranchExpenseRecord[]
  activityLog: ActivityLogEntry[]
  branchSyncs: BranchSyncStatus[]
  hydrated: boolean
  hydrateFromCache: () => void
  refreshFromServer: () => Promise<void>
  setInventory: (items: InventoryItem[]) => void
  setSales: (items: SaleRecord[]) => void
  setBranches: (items: Branch[]) => void
  upsertInventoryItem: (item: InventoryItem) => void
  removeInventoryItem: (itemId: string) => void
  addSale: (sale: SaleRecord) => void
  updateSale: (sale: SaleRecord) => void
  upsertBranch: (branch: Branch) => void
  removeBranch: (branchId: string) => void
  addRefund: (refund: RefundRecord) => void
  addStockAdjustment: (adjustment: StockAdjustmentRecord) => void
  addBranchExpense: (expense: BranchExpenseRecord) => void
  addActivityLogEntry: (entry: ActivityLogEntry) => void
  clearActivityLog: () => void
}

export const useDataStore = create<DataState>((set, get) => ({
  inventory: [],
  sales: [],
  branches: [],
  refunds: [],
  stockAdjustments: [],
  branchExpenses: [],
  activityLog: [],
  branchSyncs: [],
  hydrated: false,

  hydrateFromCache: () => {
    set({
      inventory: readStorage<InventoryItem[]>(STORAGE_KEYS.INVENTORY, []),
      sales: readStorage<SaleRecord[]>(STORAGE_KEYS.SALES, []),
      branches: readStorage<Branch[]>(STORAGE_KEYS.BRANCHES, []),
      refunds: readStorage<RefundRecord[]>(REFUNDS_KEY, []),
      stockAdjustments: readStorage<StockAdjustmentRecord[]>(ADJUSTMENTS_KEY, []),
      branchExpenses: readStorage<BranchExpenseRecord[]>(EXPENSES_KEY, []),
      activityLog: readStorage<ActivityLogEntry[]>(ACTIVITY_LOG_KEY, []),
      hydrated: true,
    })
  },

  refreshFromServer: async () => {
    if (!navigator.onLine) return
    try {
      const pendingQueue = readStorage<PendingOperation[]>(STORAGE_KEYS.PENDING_OPERATIONS, [])
      const currentUser = useAuthStore.getState().user
      const pending = pendingQueue.filter((operation) => !operation.authUid || operation.authUid === currentUser?.id)
      const isAdmin = currentUser?.role === 'admin'
      if (!currentUser) {
        const publicBranches = await pullPublicBranches()
        set({ branches: publicBranches.map((branch) => ({ ...branch, password: '' })) })
        writeStorage(STORAGE_KEYS.BRANCHES, publicBranches.map((branch) => ({ ...branch, password: '' })))
        syncService.reportDatabaseRefresh()
        return
      }
      if (!isAdmin) {
        const remote = await pullPublicOperationalData()
        const inventory = overlayPending(remote.inventory, pending, ['ADD_PRODUCT', 'ADD_STOCK', 'UPDATE_PRODUCT'], 'DELETE_PRODUCT')
        const branches = overlayPending(remote.branches, pending, ['ADD_BRANCH', 'UPDATE_BRANCH_PASSWORD'], 'DELETE_BRANCH')
        const branchId = useAuthStore.getState().user?.branchId
        const remoteRecords = branchId ? await pullCashierRecords(branchId) : { sales: [], refunds: [], branchExpenses: [] }
        const branchOperations = pending.filter((operation) => {
          const payload = operation.payload as { branchId?: string } | null
          return payload?.branchId === branchId
        })
        const sales = overlayPending(remoteRecords.sales, branchOperations, ['SALE'])
        const refunds = overlayPending(remoteRecords.refunds, branchOperations, ['REFUND'])
        const branchExpenses = overlayPending(remoteRecords.branchExpenses, branchOperations, ['BRANCH_EXPENSE'])
        set({ inventory, branches, sales, refunds, branchExpenses })
        writeStorage(STORAGE_KEYS.INVENTORY, inventory)
        writeStorage(STORAGE_KEYS.BRANCHES, branches)
        writeStorage(STORAGE_KEYS.SALES, sales)
        writeStorage(REFUNDS_KEY, refunds)
        writeStorage(EXPENSES_KEY, branchExpenses)
        syncService.reportDatabaseRefresh()
        return
      }

      const remote = await pullAllFromFirestore()
      const inventory = overlayPending(remote.inventory, pending, ['ADD_PRODUCT', 'ADD_STOCK', 'UPDATE_PRODUCT'], 'DELETE_PRODUCT')
      const sales = overlayPending(remote.sales, pending, ['SALE'])
      const branches = overlayPending(remote.branches, pending, ['ADD_BRANCH', 'UPDATE_BRANCH_PASSWORD'], 'DELETE_BRANCH')
      const refunds = overlayPending(remote.refunds, pending, ['REFUND'])
      const stockAdjustments = overlayPending(remote.stockAdjustments, pending, ['STOCK_ADJUSTMENT'])
      const branchExpenses = overlayPending(remote.branchExpenses, pending, ['BRANCH_EXPENSE'])
      const activityLog = overlayPending(remote.activityLog, pending, ['ACTIVITY_LOG'])
      const { branchSyncs } = remote
      set({ inventory, sales, branches, refunds, stockAdjustments, branchExpenses, activityLog, branchSyncs, hydrated: true })
      writeStorage(STORAGE_KEYS.INVENTORY, inventory)
      writeStorage(STORAGE_KEYS.SALES, sales)
      writeStorage(STORAGE_KEYS.BRANCHES, branches)
      writeStorage(REFUNDS_KEY, refunds)
      writeStorage(ADJUSTMENTS_KEY, stockAdjustments)
      writeStorage(EXPENSES_KEY, branchExpenses)
      writeStorage(ACTIVITY_LOG_KEY, activityLog)
      syncService.reportDatabaseRefresh()
    } catch (err) {
      console.error('Failed to refresh from server', err)
      syncService.reportDatabaseRefresh(err)
    }
  },

  setInventory: (items) => {
    set({ inventory: items })
    writeStorage(STORAGE_KEYS.INVENTORY, items)
  },
  setSales: (items) => {
    set({ sales: items })
    writeStorage(STORAGE_KEYS.SALES, items)
  },
  setBranches: (items) => {
    set({ branches: items })
    writeStorage(STORAGE_KEYS.BRANCHES, items)
  },

  upsertInventoryItem: (item) => {
    const items = get().inventory
    const idx = items.findIndex((i) => i.id === item.id)
    const next = idx >= 0 ? items.map((i) => (i.id === item.id ? item : i)) : [...items, item]
    set({ inventory: next })
    writeStorage(STORAGE_KEYS.INVENTORY, next)
  },

  removeInventoryItem: (itemId) => {
    const next = get().inventory.filter((item) => item.id !== itemId)
    set({ inventory: next })
    writeStorage(STORAGE_KEYS.INVENTORY, next)
  },

  addSale: (sale) => {
    const next = [sale, ...get().sales]
    set({ sales: next })
    writeStorage(STORAGE_KEYS.SALES, next)
  },

  updateSale: (sale) => {
    const next = get().sales.map((s) => (s.id === sale.id ? sale : s))
    set({ sales: next })
    writeStorage(STORAGE_KEYS.SALES, next)
  },

  upsertBranch: (branch) => {
    const items = get().branches
    const idx = items.findIndex((b) => b.id === branch.id)
    const next = idx >= 0 ? items.map((b) => (b.id === branch.id ? branch : b)) : [...items, branch]
    set({ branches: next })
    writeStorage(STORAGE_KEYS.BRANCHES, next)
  },

  removeBranch: (branchId) => {
    const next = get().branches.filter((b) => b.id !== branchId)
    set({ branches: next })
    writeStorage(STORAGE_KEYS.BRANCHES, next)
  },

  addRefund: (refund) => {
    const next = [refund, ...get().refunds]
    set({ refunds: next })
    writeStorage(REFUNDS_KEY, next)
  },

  addStockAdjustment: (adjustment) => {
    const next = [adjustment, ...get().stockAdjustments]
    set({ stockAdjustments: next })
    writeStorage(ADJUSTMENTS_KEY, next)
  },

  addBranchExpense: (expense) => {
    const next = [expense, ...get().branchExpenses]
    set({ branchExpenses: next })
    writeStorage(EXPENSES_KEY, next)
  },

  addActivityLogEntry: (entry) => {
    const next = [entry, ...get().activityLog].slice(0, 1000)
    set({ activityLog: next })
    writeStorage(ACTIVITY_LOG_KEY, next)
  },
  clearActivityLog: () => {
    set({ activityLog: [] })
    writeStorage(ACTIVITY_LOG_KEY, [])
  },
}))
