import type { ActivityAction, ActivityLogEntry, User } from '@/types'
import { generateId } from '@/utils/helpers'
import { syncService } from '@/services/sync/syncService'
import { useDataStore } from '@/store/dataStore'

export function logActivity(action: ActivityAction, description: string, user: User | null): void {
  const entry: ActivityLogEntry = {
    id: generateId('log'),
    action,
    description,
    performedBy: user?.fullName ?? user?.email ?? 'Unknown',
    branchId: user?.branchId,
    branchName: user?.branchName,
    createdAt: new Date().toISOString(),
  }
  useDataStore.getState().addActivityLogEntry(entry)
  syncService.addPendingOperation('ACTIVITY_LOG', entry)
}
