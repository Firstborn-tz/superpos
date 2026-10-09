import { useEffect, useMemo, useState } from 'react'
import { syncService } from '@/services/sync/syncService'
import { WifiOffIcon, CheckIcon } from '@/components/common/Icons'
import Loader from '@/components/common/Loader'
import type { PendingOperation, SyncStatus } from '@/types'

const operationLabels: Record<string, string> = {
  ADD_PRODUCT: 'New products',
  UPDATE_PRODUCT: 'Product edits',
  ADD_STOCK: 'Stock received',
  DELETE_PRODUCT: 'Product removals',
  SALE: 'Sales',
  REFUND: 'Refunds',
  STOCK_ADJUSTMENT: 'Stock adjustments',
  BRANCH_EXPENSE: 'Branch expenses',
  ADD_BRANCH: 'Branch changes',
  UPDATE_BRANCH_PASSWORD: 'Branch password changes',
  DELETE_BRANCH: 'Branch removals',
  ACTIVITY_LOG: 'Activity records',
  CHAT_MESSAGE: 'Messages',
}

function formatTime(value: string | null) {
  if (!value) return 'No confirmed database write yet'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Previously synced' : `Last database write ${date.toLocaleString()}`
}

export default function OfflineIndicator() {
  const [status, setStatus] = useState<SyncStatus>(syncService.getStatus())
  const [operations, setOperations] = useState<PendingOperation[]>(syncService.getPendingOperations())
  const [expanded, setExpanded] = useState(false)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => syncService.subscribe((next) => {
    setStatus(next)
    setOperations(syncService.getPendingOperations())
  }), [])

  const grouped = useMemo(() => {
    const counts = new Map<string, number>()
    for (const operation of operations) counts.set(operation.type, (counts.get(operation.type) ?? 0) + 1)
    return [...counts.entries()]
  }, [operations])

  const failedCount = operations.filter((operation) => operation.status === 'failed').length
  const tone = !status.isOnline || failedCount > 0 || status.lastError || status.refreshError
    ? 'border-danger/30 bg-danger/5 text-danger'
    : status.isSyncing || operations.length > 0
      ? 'border-warning/40 bg-warning/10 text-app-heading'
      : 'border-primary/20 bg-primary/5 text-app-heading'
  const title = !status.isOnline
    ? 'Offline · saved on this device'
    : failedCount > 0 || status.lastError
      ? `${failedCount || operations.length} record${(failedCount || operations.length) === 1 ? '' : 's'} need attention`
      : status.refreshError
        ? 'Could not refresh database records'
      : status.isSyncing
        ? 'Sending records to the database…'
        : operations.length > 0
          ? `${operations.length} record${operations.length === 1 ? '' : 's'} waiting to sync`
          : 'Database sync is up to date'

  async function retry() {
    setRetrying(true)
    try {
      await syncService.syncNow()
    } finally {
      setOperations(syncService.getPendingOperations())
      setRetrying(false)
    }
  }

  return (
    <section className={`mx-3 mt-3 rounded-xl border ${tone}`} aria-label="Database sync status">
      <div className="flex min-h-12 items-center gap-3 px-4 py-2">
        <span className={`relative flex h-2.5 w-2.5 shrink-0 rounded-full ${status.isSyncing ? 'bg-warning' : failedCount || status.lastError ? 'bg-danger' : status.isOnline ? 'bg-primary' : 'bg-app-faint'}`}>
          {status.isSyncing && <span className="absolute inset-0 animate-ping rounded-full bg-warning opacity-60" />}
        </span>
        {status.isSyncing ? <Loader size="small" label="Syncing records" className="[--loader-height:16px] [--loader-line:2px]" /> : !status.isOnline ? <WifiOffIcon width={16} height={16} /> : !operations.length && !status.lastError ? <CheckIcon width={16} height={16} /> : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="truncate text-xs opacity-75">{formatTime(status.lastSyncedAt)}</p>
        </div>
        {operations.length > 0 && <span className="rounded-full bg-app-card/70 px-2.5 py-1 text-xs font-bold">{operations.length} queued</span>}
        {status.isOnline && operations.length > 0 && (
          <button type="button" onClick={() => void retry()} disabled={retrying || status.isSyncing} className="rounded-lg border border-current/20 px-3 py-1.5 text-xs font-semibold hover:bg-app-card/70 disabled:opacity-50">
            {retrying ? 'Retrying…' : 'Sync now'}
          </button>
        )}
        <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold hover:bg-app-card/70">
          {expanded ? 'Hide details' : 'Details'}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-current/10 px-4 py-3">
          {!status.isOnline && <p className="mb-3 text-xs">Changes are kept on this device until the connection returns. Keep this device signed in to send them.</p>}
          {status.waitingForOtherAccount && <p className="mb-3 rounded-lg bg-warning/15 p-2 text-xs">Some queued records were created by another account. Sign back in with that account on this device to sync them.</p>}
          {operations.length === 0 ? (
            <p className="text-sm">No queued records. The status above reflects successful database writes from this device.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {grouped.map(([type, count]) => {
                const matching = operations.filter((operation) => operation.type === type)
                const failures = matching.filter((operation) => operation.status === 'failed')
                return (
                  <div key={type} className="rounded-lg border border-current/10 bg-app-card/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{operationLabels[type] ?? type}</span>
                      <span className="rounded-full bg-app-surface px-2 py-0.5 text-xs font-bold">{count}</span>
                    </div>
                    {failures.map((operation) => (
                      <p key={operation.id} className="mt-2 break-words text-xs text-danger" title={operation.error}>
                        Failed after {operation.attempts} attempt{operation.attempts === 1 ? '' : 's'}: {operation.error || 'Unknown database error'}
                      </p>
                    ))}
                    {!failures.length && <p className="mt-1 text-xs opacity-70">Waiting for a successful database acknowledgement.</p>}
                  </div>
                )
              })}
            </div>
          )}
          {status.lastError && <p className="mt-3 break-words text-xs text-danger">Latest write error: {status.lastError}</p>}
          {status.refreshError && <p className="mt-3 break-words text-xs text-danger">Database read error: {status.refreshError}</p>}
        </div>
      )}
    </section>
  )
}
