import { useEffect, useMemo, useState } from 'react'
import { syncService } from '@/services/sync/syncService'
import { WifiOffIcon, CheckIcon } from '@/components/common/Icons'
import Loader from '@/components/common/Loader'
import type { PendingOperation, SyncStatus } from '@/types'
import { useAuthStore } from '@/store/authStore'
import { readStorage } from '@/utils/storage'

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
  const accountId = useAuthStore((state) => state.user?.id)

  useEffect(() => syncService.subscribe((next) => {
    setStatus(next)
    setOperations(syncService.getPendingOperations())
  }), [])

  const accountOperations = useMemo(() => operations.filter((operation) =>
    Boolean(accountId && operation.authUid === accountId),
  ), [operations, accountId])
  const accountGrouped = useMemo(() => {
    const counts = new Map<string, number>()
    for (const operation of accountOperations) counts.set(operation.type, (counts.get(operation.type) ?? 0) + 1)
    return [...counts.entries()]
  }, [accountOperations])
  const accountSyncing = status.isSyncing && accountOperations.length > 0
  const accountLastError = accountOperations.find((operation) => operation.status === 'failed')?.error ?? null
  const accountLastSyncedAt = accountId
    ? readStorage<string | null>(`superpos_last_synced_${accountId}`, null)
    : status.lastSyncedAt

  const failedCount = accountOperations.filter((operation) => operation.status === 'failed').length
  const tone = !status.isOnline || failedCount > 0 || accountLastError || status.refreshError
    ? 'border-danger/30 bg-danger/5 text-danger'
    : accountSyncing || accountOperations.length > 0
      ? 'border-warning/40 bg-warning/10 text-app-heading'
      : 'border-primary/20 bg-primary/5 text-app-heading'
  const title = !status.isOnline
    ? 'Offline · saved on this device'
    : failedCount > 0 || accountLastError
      ? `${failedCount || accountOperations.length} record${(failedCount || accountOperations.length) === 1 ? '' : 's'} need attention`
      : status.refreshError
        ? 'Could not refresh database records'
      : accountSyncing
        ? 'Sending records to the database…'
        : accountOperations.length > 0
          ? `${accountOperations.length} record${accountOperations.length === 1 ? '' : 's'} waiting to sync`
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
        <span className={`relative flex h-2.5 w-2.5 shrink-0 rounded-full ${accountSyncing ? 'bg-warning' : failedCount || accountLastError ? 'bg-danger' : status.isOnline ? 'bg-primary' : 'bg-app-faint'}`}>
          {accountSyncing && <span className="absolute inset-0 animate-ping rounded-full bg-warning opacity-60" />}
        </span>
        {accountSyncing ? <Loader size="small" label="Syncing records" className="[--loader-height:16px] [--loader-line:2px]" /> : !status.isOnline ? <WifiOffIcon width={16} height={16} /> : !accountOperations.length && !accountLastError ? <CheckIcon width={16} height={16} /> : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="truncate text-xs opacity-75">{formatTime(accountLastSyncedAt)}</p>
        </div>
        {accountOperations.length > 0 && <span className="rounded-full bg-app-card/70 px-2.5 py-1 text-xs font-bold">{accountOperations.length} queued</span>}
        {status.isOnline && accountOperations.length > 0 && (
          <button type="button" onClick={() => void retry()} disabled={retrying || accountSyncing} className="rounded-lg border border-current/20 px-3 py-1.5 text-xs font-semibold hover:bg-app-card/70 disabled:opacity-50">
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
          {accountOperations.length === 0 ? (
            <p className="text-sm">No queued records. The status above reflects successful database writes from this device.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {accountGrouped.map(([type, count]) => {
                const matching = accountOperations.filter((operation) => operation.type === type)
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
          {accountLastError && <p className="mt-3 break-words text-xs text-danger">Latest write error: {accountLastError}</p>}
          {status.refreshError && <p className="mt-3 break-words text-xs text-danger">Database read error: {status.refreshError}</p>}
        </div>
      )}
    </section>
  )
}
