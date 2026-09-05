import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const

/**
 * Logs the current user out after `timeoutMs` of no interaction. Cashier
 * tills are often shared / left unattended, so a shorter timeout is used
 * for cashiers than for admin sessions (which are more likely a personal
 * device).
 */
export function useInactivityLogout(timeoutMs?: number) {
  const navigate = useNavigate()
  const { isAuthenticated, user, logout } = useAuthStore()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return

    const effectiveTimeout = timeoutMs ?? (user?.role === 'cashier' ? 10 * 60 * 1000 : 30 * 60 * 1000)

    function reset() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        logout()
        toast.info('You were logged out due to inactivity.')
        navigate('/login')
      }, effectiveTimeout)
    }

    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, reset))
    reset()

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, reset))
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.role])
}
