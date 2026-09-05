import type {
  ActivityLogEntry,
  Branch,
  ChatMessage,
  InventoryItem,
  OperationType,
  PendingOperation,
  RefundRecord,
  SaleRecord,
  StockAdjustmentRecord,
  SyncStatus,
} from '@/types'
import { STORAGE_KEYS, readStorage, writeStorage } from '@/utils/storage'
import { generateId } from '@/utils/helpers'
import {
  deleteBranchRemote,
  pushActivityLogEntry,
  pushBranch,
  pushChatMessage,
  pushInventoryItem,
  pushRefundRecord,
  pushSaleRecord,
  pushStockAdjustment,
} from '@/services/firebase/firestoreService'

type Listener = (status: SyncStatus) => void

class SyncService {
  private listeners: Set<Listener> = new Set()
  private status: SyncStatus = {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    pendingCount: this.getPendingOperations().length,
    lastSyncedAt: readStorage<string | null>('superpos_last_synced', null),
    lastError: null,
  }

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.updateStatus({ isOnline: true })
        void this.syncNow()
      })
      window.addEventListener('offline', () => {
        this.updateStatus({ isOnline: false })
      })
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.status)
    return () => this.listeners.delete(listener)
  }

  private updateStatus(partial: Partial<SyncStatus>) {
    this.status = { ...this.status, ...partial }
    this.listeners.forEach((l) => l(this.status))
  }

  getPendingOperations(): PendingOperation[] {
    return readStorage<PendingOperation[]>(STORAGE_KEYS.PENDING_OPERATIONS, [])
  }

  private setPendingOperations(ops: PendingOperation[]) {
    writeStorage(STORAGE_KEYS.PENDING_OPERATIONS, ops)
    this.updateStatus({ pendingCount: ops.length })
  }

  /**
   * Permanently discards a single stuck operation without syncing it -
   * for when an old/broken queued item can never succeed (e.g. it was
   * queued before a rules or schema change) and is blocking the queue
   * from ever showing "synced". Use with care: that change is lost.
   */
  discardPendingOperation(operationId: string) {
    this.setPendingOperations(this.getPendingOperations().filter((op) => op.id !== operationId))
  }

  addPendingOperation(type: OperationType, payload: unknown): PendingOperation {
    const op: PendingOperation = {
      id: generateId('op'),
      type,
      payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
      status: 'pending',
    }
    const ops = [...this.getPendingOperations(), op]
    this.setPendingOperations(ops)

    if (this.status.isOnline) {
      void this.syncNow()
    }
    return op
  }

  async processOperation(op: PendingOperation): Promise<void> {
    switch (op.type) {
      case 'ADD_PRODUCT':
      case 'ADD_STOCK':
        await pushInventoryItem(op.payload as InventoryItem)
        return
      case 'SALE':
        await pushSaleRecord(op.payload as SaleRecord)
        return
      case 'ADD_BRANCH':
      case 'UPDATE_BRANCH_PASSWORD':
        await pushBranch(op.payload as Branch)
        return
      case 'DELETE_BRANCH':
        await deleteBranchRemote((op.payload as { id: string }).id)
        return
      case 'REFUND':
        await pushRefundRecord(op.payload as RefundRecord)
        return
      case 'STOCK_ADJUSTMENT':
        await pushStockAdjustment(op.payload as StockAdjustmentRecord)
        return
      case 'ACTIVITY_LOG':
        await pushActivityLogEntry(op.payload as ActivityLogEntry)
        return
      case 'CHAT_MESSAGE':
        await pushChatMessage(op.payload as ChatMessage)
        return
      default:
        throw new Error(`Unknown operation type: ${op.type}`)
    }
  }

  async syncNow(): Promise<void> {
    if (this.status.isSyncing) return
    if (!navigator.onLine) return

    const pending = this.getPendingOperations()
    if (pending.length === 0) return

    this.updateStatus({ isSyncing: true, lastError: null })

    const remaining: PendingOperation[] = []
    let lastError: string | null = null

    for (const op of pending) {
      try {
        await this.processOperation(op)
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Sync failed'
        remaining.push({
          ...op,
          attempts: op.attempts + 1,
          status: 'failed',
          error: lastError,
        })
      }
    }

    this.setPendingOperations(remaining)
    this.updateStatus({
      isSyncing: false,
      lastError,
      lastSyncedAt: new Date().toISOString(),
    })
    writeStorage('superpos_last_synced', new Date().toISOString())
  }

  getStatus(): SyncStatus {
    return this.status
  }
}

export const syncService = new SyncService()