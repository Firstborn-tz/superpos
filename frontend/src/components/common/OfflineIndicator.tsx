import { useEffect, useState } from 'react'
import { syncService } from '@/services/sync/syncService'
import { WifiOffIcon, SyncIcon, CheckIcon } from '@/components/common/Icons'
import type { SyncStatus } from '@/types'

export default function OfflineIndicator() {
  const [status, setStatus] = useState<SyncStatus>(syncService.getStatus())
  const [showSynced, setShowSynced] = useState(false)

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

  if (status.isSyncing || status.pendingCount > 0) {
    return (
      <div className="flex items-center gap-2 bg-warning text-white text-sm font-medium px-4 py-2 w-full">
        <SyncIcon width={16} height={16} className="animate-spin" />
        <span>Syncing changes...</span>
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
