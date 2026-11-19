import type {
  ActivityLogEntry,
  Branch,
  BranchExpenseRecord,
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
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/config/firebase'
import { useAuthStore } from '@/store/authStore'
import {
  deleteBranchRemote,
  deleteInventoryItemRemote,
  pushActivityLogEntry,
  pushBranch,
  pushChatMessage,
  pushInventoryItem,
  pushRefundRecord,
  pushSaleRecord,
  pushStockAdjustment,
  pushBranchExpense,
  pushBranchSyncStatus,
} from '@/services/firebase/firestoreService'

type Listener = (status: SyncStatus) => void
const WRITE_ACK_TIMEOUT_MS = 30_000

class SyncService {
  private listeners: Set<Listener> = new Set()
  private status: SyncStatus = {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    pendingCount: this.getPendingOperations().length,
    lastSyncedAt: readStorage<string | null>('superpos_last_synced', null),
    lastError: null,
    refreshError: null,
  }

  constructor() {
    // Firebase restores its persisted user asynchronously on app startup.
    // Resume queued writes only after Auth confirms a signed-in session.
    onAuthStateChanged(auth, (user) => {
      if (user && navigator.onLine) void this.syncNow()
    })

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

  private async waitForWriteAcknowledgement(op: PendingOperation): Promise<void> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        this.processOperation(op),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error(`No database acknowledgement after ${WRITE_ACK_TIMEOUT_MS / 1000} seconds`)),
            WRITE_ACK_TIMEOUT_MS,
          )
        }),
      ])
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    }
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
      authUid: auth.currentUser?.uid,
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
    const user = useAuthStore.getState().user
    // Records created by older app versions may have been saved locally
    // before branch metadata was added to their schemas. Cashier rules scope
    // these writes to the cashier's assigned branch, so restore that metadata
    // before sending the queued record. Never replace an explicit branch.
    const withCashierBranch = <T extends { branchId?: string; branchName?: string }>(record: T): T =>
      user?.role === 'cashier' && user.branchId && !record.branchId
        ? { ...record, branchId: user.branchId, branchName: record.branchName ?? user.branchName }
        : record

    switch (op.type) {
      case 'ADD_PRODUCT':
      case 'ADD_STOCK':
      case 'UPDATE_PRODUCT':
        await pushInventoryItem(op.payload as InventoryItem)
        return
      case 'DELETE_PRODUCT':
        await deleteInventoryItemRemote((op.payload as { id: string }).id)
        return
      case 'SALE':
        {
          const sale = op.payload as SaleRecord
          // Older queued sales can lack branch metadata. Recover it from the
          // authenticated cashier session before applying branch-scoped rules.
          await pushSaleRecord(withCashierBranch(sale))
        }
        return
      case 'ADD_BRANCH':
      case 'UPDATE_BRANCH_PASSWORD':
        await pushBranch(op.payload as Branch)
        return
      case 'DELETE_BRANCH':
        await deleteBranchRemote((op.payload as { id: string }).id)
        return
      case 'REFUND':
        await pushRefundRecord(withCashierBranch(op.payload as RefundRecord))
        return
      case 'STOCK_ADJUSTMENT':
        await pushStockAdjustment(withCashierBranch(op.payload as StockAdjustmentRecord))
        return
      case 'BRANCH_EXPENSE':
        await pushBranchExpense(withCashierBranch(op.payload as BranchExpenseRecord))
        return
      case 'ACTIVITY_LOG':
        await pushActivityLogEntry(withCashierBranch(op.payload as ActivityLogEntry))
        return
      case 'CHAT_MESSAGE':
        await pushChatMessage(withCashierBranch(op.payload as ChatMessage))
        return
      default:
        throw new Error(`Unknown operation type: ${op.type}`)
    }
  }

  private async markBranchSynced(op: PendingOperation): Promise<void> {
    const payload = op.payload as { branchId?: string; branchName?: string }
    if (!payload.branchId) return
    await pushBranchSyncStatus({
      branchId: payload.branchId,
      branchName: payload.branchName,
      lastSyncedAt: new Date().toISOString(),
      lastOperation: op.type,
    })
  }

  async syncNow(): Promise<void> {
    if (this.status.isSyncing) return
    if (!navigator.onLine) return
    // App startup can call syncNow before Firebase has restored its cached
    // session. Keep operations queued instead of sending unauthenticated
    // Firestore requests that would be marked as failed.
    if (!auth.currentUser) return

    const allPending = this.getPendingOperations()
    if (allPending.length === 0) return
    const currentUid = auth.currentUser.uid
    const isAdmin = useAuthStore.getState().user?.role === 'admin'
    // Activity logs are append-only audit records and Firestore rules allow
    // administrators to create them for every branch. Let an admin drain
    // these device-local records even when a cashier created them earlier;
    // otherwise they stay queued forever after switching accounts.
    const canAdminSyncActivity = (op: PendingOperation) => isAdmin && op.type === 'ACTIVITY_LOG'
    const canSyncOperation = (op: PendingOperation) =>
      !op.authUid || op.authUid === currentUid || canAdminSyncActivity(op)
    const pending = allPending.filter(canSyncOperation)
    const waitingForOtherAccount = allPending.some((op) => Boolean(op.authUid && op.authUid !== currentUid && !canAdminSyncActivity(op)))
    if (pending.length === 0) {
      this.updateStatus({ isSyncing: false, lastError: null, waitingForOtherAccount })
      return
    }

    this.updateStatus({ isSyncing: true, lastError: null, waitingForOtherAccount })

    const remaining: PendingOperation[] = []
    const initialOperationIds = new Set(allPending.map((op) => op.id))
    const processingOperationIds = new Set(pending.map((op) => op.id))
    let lastError: string | null = null
    let successfulWrites = 0

    for (const op of pending) {
      try {
        await this.waitForWriteAcknowledgement(op)
        successfulWrites += 1
        // Branch sync status is informative only. A missing/deferred rule for
        // that status document must never keep a successfully written sale in
        // the queue or make the cashier believe it was not recorded.
        try {
          await this.markBranchSynced(op)
        } catch (err) {
          console.warn('Could not update branch sync status', err)
        }
      } catch (err) {
        if (op.type === 'SALE' && err instanceof Error && err.message === 'SALE_PERMANENTLY_DELETED') {
          // A different admin device may have undone this sale while it was
          // still queued offline. The tombstone is authoritative; drop it.
          continue
        }
        const reason = err instanceof Error ? err.message : 'Unknown error'
        const errorCode = err && typeof err === 'object' && 'code' in err
          ? `${String((err as { code: unknown }).code)}: `
          : ''
        lastError = `${op.type}: ${errorCode}${reason}`
        remaining.push({
          ...op,
          attempts: op.attempts + 1,
          status: 'failed',
          error: lastError,
        })
      }
    }

    // Never overwrite operations added while the current batch was awaiting
    // Firestore. Previously this discarded SALE operations that were queued
    // immediately after stock updates, leaving branch-only sales forever
    // absent from the admin database reports.
    const currentPending = this.getPendingOperations()
    const waitingOperations = currentPending.filter((op) => initialOperationIds.has(op.id) && !processingOperationIds.has(op.id))
    const addedWhileSyncing = currentPending.filter((op) => !initialOperationIds.has(op.id))
    const nextPending = [...remaining, ...waitingOperations, ...addedWhileSyncing]
    this.setPendingOperations(nextPending)
    const stillWaitingForOtherAccount = nextPending.some((op) => Boolean(
      op.authUid && op.authUid !== currentUid && !canAdminSyncActivity(op),
    ))
    const syncedAt = successfulWrites > 0 ? new Date().toISOString() : this.status.lastSyncedAt
    this.updateStatus({
      isSyncing: false,
      lastError,
      lastSyncedAt: syncedAt,
      waitingForOtherAccount: stillWaitingForOtherAccount,
    })
    if (successfulWrites > 0) writeStorage('superpos_last_synced', syncedAt)

    // The callers that added these operations already tried to sync while
    // this batch was active. Start a fresh batch now that it is safe.
    if (addedWhileSyncing.length > 0) void this.syncNow()
  }

  getStatus(): SyncStatus {
    return this.status
  }

  reportDatabaseRefresh(error?: unknown) {
    const errorCode = error && typeof error === 'object' && 'code' in error
      ? `${String((error as { code: unknown }).code)}: `
      : ''
    const message = error instanceof Error ? error.message : 'Could not read the latest records from the database'
    const refreshError = error ? `${errorCode}${message}` : null
    this.updateStatus({ refreshError })
  }
}

export const syncService = new SyncService()
