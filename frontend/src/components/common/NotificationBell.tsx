import { useMemo, useState, useRef, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore, type AppNotification } from '@/store/notificationStore'
import { BellIcon, CheckIcon, WarningIcon } from '@/components/common/Icons'
import { formatDateTime } from '@/utils/helpers'

export default function NotificationBell() {
  const user = useAuthStore((s) => s.user)
  const { notifications, markRead, markAllRead } = useNotificationStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const audiences = useMemo(() => {
    const list: string[] = ['all']
    if (user?.role === 'admin') list.push('admin')
    if (user?.branchId) list.push(`branch:${user.branchId}`)
    return list
  }, [user])

  const scoped = useMemo(
    () => notifications.filter((n) => audiences.includes(n.audience)).slice(0, 30),
    [notifications, audiences],
  )
  const unreadCount = scoped.filter((n) => !n.read).length

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function iconFor(n: AppNotification) {
    if (n.type === 'warning') return <WarningIcon width={14} height={14} className="text-warning" />
    if (n.type === 'success') return <CheckIcon width={14} height={14} className="text-primary" />
    return <BellIcon width={14} height={14} className="text-secondary" />
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 text-app-body hover:bg-app-alt rounded-lg transition-colors"
        aria-label="Notifications"
      >
        <BellIcon width={20} height={20} />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 bg-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-app-card border border-app-border rounded-card shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-app-border">
            <h3 className="font-bold text-sm text-app-heading">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead(audiences)}
                className="text-xs font-semibold text-secondary hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-app-border">
            {scoped.length === 0 ? (
              <p className="text-center text-app-faint text-sm py-8">No notifications yet</p>
            ) : (
              scoped.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={`w-full text-left px-4 py-3 flex gap-2.5 hover:bg-app-alt transition-colors ${
                    !n.read ? 'bg-primary-50/40' : ''
                  }`}
                >
                  <div className="mt-0.5 shrink-0">{iconFor(n)}</div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-app-heading truncate">{n.title}</div>
                    <div className="text-xs text-app-muted mt-0.5">{n.message}</div>
                    <div className="text-[11px] text-app-faint mt-1">{formatDateTime(n.createdAt)}</div>
                  </div>
                  {!n.read && <div className="w-2 h-2 rounded-full bg-secondary shrink-0 mt-1.5 ml-auto" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
