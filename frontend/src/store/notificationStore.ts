import { create } from 'zustand'
import { readStorage, writeStorage } from '@/utils/storage'
import { generateId } from '@/utils/helpers'

const NOTIFICATIONS_KEY = 'superpos_notifications'
const MAX_NOTIFICATIONS = 100

export type NotificationType = 'info' | 'warning' | 'success'

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  message: string
  createdAt: string
  read: boolean
  // Scope: notifications created for 'admin' show only in the admin's
  // bell; 'branch:<id>' scopes to that branch's cashiers; 'all' shows
  // to everyone (e.g. a broadcast).
  audience: 'admin' | 'all' | `branch:${string}`
}

interface NotificationState {
  notifications: AppNotification[]
  add: (n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => void
  markRead: (id: string) => void
  markAllRead: (forAudience: string[]) => void
  clear: () => void
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: readStorage<AppNotification[]>(NOTIFICATIONS_KEY, []),

  add: (n) => {
    const notification: AppNotification = {
      ...n,
      id: generateId('notif'),
      createdAt: new Date().toISOString(),
      read: false,
    }
    const next = [notification, ...get().notifications].slice(0, MAX_NOTIFICATIONS)
    set({ notifications: next })
    writeStorage(NOTIFICATIONS_KEY, next)
  },

  markRead: (id) => {
    const next = get().notifications.map((n) => (n.id === id ? { ...n, read: true } : n))
    set({ notifications: next })
    writeStorage(NOTIFICATIONS_KEY, next)
  },

  markAllRead: (forAudience) => {
    const next = get().notifications.map((n) => (forAudience.includes(n.audience) ? { ...n, read: true } : n))
    set({ notifications: next })
    writeStorage(NOTIFICATIONS_KEY, next)
  },

  clear: () => {
    set({ notifications: [] })
    writeStorage(NOTIFICATIONS_KEY, [])
  },
}))
