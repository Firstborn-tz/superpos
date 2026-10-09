import { useEffect, useState } from 'react'
import { syncService } from '@/services/sync/syncService'
import { WifiOffIcon, CheckIcon } from '@/components/common/Icons'
import Loader from '@/components/common/Loader'
import type { SyncStatus } from '@/types'

export default function OfflineIndicator() {
  const [status, setStatus] = useState<SyncStatus>(syncService.getStatus())
  const [showSynced, setShowSynced] = useState(false)
  const [failedOperation, ...errorParts] = (status.lastError ?? '').split(': ')
  const syncError = errorParts.join(': ')
  const expensePermissionError = failedOperation === 'BRANCH_EXPENSE'
    && syncError.toLowerCase().includes('missing or insufficient permissions')

  useEffect(() => {
    const unsub = syncService.subscribe((next) => {
      setStatus((prev) => {
        if (prev.isSyncing && !next.isSyncing && next.pendingCount === 0 && !next.lastError) {
          setShowSynced(true)
          setTimeout(() => setShowSynced(false), 2500)
        }
        return next
      })
    })
    return unsub
  }, [])

  if (!status.isOnline) {
    return (
      <div className="flex items-center gap-2 bg-danger text-white text-sm font-medium px-4 py-2 w-full">
        <WifiOffIcon width={16} height={16} />
        <span>You are offline. Changes are saved on this device and will sync automatically.</span>
        {status.pendingCount > 0 && (
          <span className="ml-auto bg-white/20 rounded-full px-2 py-0.5 text-xs">{status.pendingCount} pending</span>
        )}
      </div>
    )
  }

  if (status.lastError) {
    return (
      <div className="flex items-center gap-2 bg-danger text-white text-sm font-medium px-4 py-2 w-full">
        <WifiOffIcon width={16} height={16} />
        <span className="flex-1">
          Sync failed while saving {failedOperation || 'data'}: {syncError || 'Unknown error'}. Pending changes are still on this device.
          {expensePermissionError && ' Deploy firestore.rules with the branch_expenses rule, and confirm cashier_access/{uid}.branchId matches this branch.'}
        </span>
        <button
          onClick={() => void syncService.syncNow()}
          className="rounded bg-white/20 hover:bg-white/30 px-2 py-0.5 text-xs font-semibold"
        >
          Retry
        </button>
      </div>
    )
  }

  if (status.waitingForOtherAccount && !status.isSyncing) {
    return (
      <div className="flex items-center gap-2 bg-warning text-white text-sm font-medium px-4 py-2 w-full">
        <span className="flex-1">Some pending changes belong to another signed-in account. Sign in with that account on this device to sync them.</span>
        <span className="bg-white/20 rounded-full px-2 py-0.5 text-xs">{status.pendingCount} pending</span>
      </div>
    )
  }

  if (status.isSyncing || status.pendingCount > 0) {
    return (
      <div className="flex items-center gap-2 bg-warning text-white text-sm font-medium px-4 py-2 w-full">
        {status.isSyncing && <Loader size="small" label="Syncing changes" className="[--loader-height:16px] [--loader-line:2px]" />}
        <span>{status.isSyncing ? 'Syncing changes...' : 'Pending changes will sync when signed in and online.'}</span>
        {status.pendingCount > 0 && (
          <span className="ml-auto bg-white/20 rounded-full px-2 py-0.5 text-xs">{status.pendingCount} pending</span>
        )}
      </div>
    )
  }

  if (showSynced) {
    return (
      <div className="flex items-center gap-2 bg-primary text-white text-sm font-medium px-4 py-2 w-full">
        <CheckIcon width={16} height={16} />
        <span>All changes synced</span>
      </div>
    )
  }

  return null
}
