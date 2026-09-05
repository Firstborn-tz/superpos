import { create } from 'zustand'
import type { ActivityLogEntry, Branch, InventoryItem, RefundRecord, SaleRecord, StockAdjustmentRecord } from '@/types'
import { STORAGE_KEYS, readStorage, writeStorage } from '@/utils/storage'
import { pullAllFromFirestore, pullPublicOperationalData } from '@/services/firebase/firestoreService'
import { useAuthStore } from '@/store/authStore'

const REFUNDS_KEY = 'superpos_refunds'
const ADJUSTMENTS_KEY = 'superpos_stock_adjustments'
const ACTIVITY_LOG_KEY = 'superpos_activity_log'

interface DataState {
  inventory: InventoryItem[]
  sales: SaleRecord[]
  branches: Branch[]
  refunds: RefundRecord[]
  stockAdjustments: StockAdjustmentRecord[]
  activityLog: ActivityLogEntry[]
  hydrated: boolean
  hydrateFromCache: () => void
  refreshFromServer: () => Promise<void>
  setInventory: (items: InventoryItem[]) => void
  setSales: (items: SaleRecord[]) => void
  setBranches: (items: Branch[]) => void
  upsertInventoryItem: (item: InventoryItem) => void
  addSale: (sale: SaleRecord) => void
  updateSale: (sale: SaleRecord) => void
  upsertBranch: (branch: Branch) => void
  removeBranch: (branchId: string) => void
  addRefund: (refund: RefundRecord) => void
  addStockAdjustment: (adjustment: StockAdjustmentRecord) => void
  addActivityLogEntry: (entry: ActivityLogEntry) => void
}

export const useDataStore = create<DataState>((set, get) => ({
  inventory: [],
  sales: [],
  branches: [],
  refunds: [],
  stockAdjustments: [],
  activityLog: [],
  hydrated: false,

  hydrateFromCache: () => {
    set({
      inventory: readStorage<InventoryItem[]>(STORAGE_KEYS.INVENTORY, []),
      sales: readStorage<SaleRecord[]>(STORAGE_KEYS.SALES, []),
      branches: readStorage<Branch[]>(STORAGE_KEYS.BRANCHES, []),
      refunds: readStorage<RefundRecord[]>(REFUNDS_KEY, []),
      stockAdjustments: readStorage<StockAdjustmentRecord[]>(ADJUSTMENTS_KEY, []),
      activityLog: readStorage<ActivityLogEntry[]>(ACTIVITY_LOG_KEY, []),
      hydrated: true,
    })
  },

  refreshFromServer: async () => {
    if (!navigator.onLine) return
    try {
      const isAdmin = useAuthStore.getState().user?.role === 'admin'
      if (!isAdmin) {
        const { inventory, branches } = await pullPublicOperationalData()
        set({ inventory, branches })
        writeStorage(STORAGE_KEYS.INVENTORY, inventory)
        writeStorage(STORAGE_KEYS.BRANCHES, branches)
        return
      }

      const { inventory, sales, branches, refunds, stockAdjustments, activityLog } = await pullAllFromFirestore()
      set({ inventory, sales, branches, refunds, stockAdjustments, activityLog })
      writeStorage(STORAGE_KEYS.INVENTORY, inventory)
      writeStorage(STORAGE_KEYS.SALES, sales)
      writeStorage(STORAGE_KEYS.BRANCHES, branches)
      writeStorage(REFUNDS_KEY, refunds)
      writeStorage(ADJUSTMENTS_KEY, stockAdjustments)
      writeStorage(ACTIVITY_LOG_KEY, activityLog)
    } catch (err) {
      console.error('Failed to refresh from server', err)
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

  addActivityLogEntry: (entry) => {
    const next = [entry, ...get().activityLog].slice(0, 1000)
    set({ activityLog: next })
    writeStorage(ACTIVITY_LOG_KEY, next)
  },
}))
