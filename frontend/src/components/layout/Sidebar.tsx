import { NavLink, useNavigate } from 'react-router-dom'
import type { ReactElement } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useTranslation } from '@/store/languageStore'
import { logActivity } from '@/services/activity/activityService'
import {
  DashboardIcon,
  POSIcon,
  InventoryIcon,
  BarcodeIcon,
  ReportsIcon,
  BranchesIcon,
  SettingsIcon,
  LogoutIcon,
  CloseIcon,
  UserIcon,
  RefundIcon,
  SearchIcon,
  ChatIcon,
} from '@/components/common/Icons'

interface NavItem {
  to: string
  labelKey:
    | 'nav_dashboard'
    | 'nav_pos'
    | 'nav_inventory'
    | 'nav_refunds'
    | 'nav_verify'
    | 'nav_barcode'
    | 'nav_reports'
    | 'nav_branches'
    | 'nav_settings'
    | 'nav_messages'
  icon: (p: { width?: number; height?: number }) => ReactElement
  roles: Array<'admin' | 'cashier'>
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', labelKey: 'nav_dashboard', icon: DashboardIcon, roles: ['admin'] },
  { to: '/pos', labelKey: 'nav_pos', icon: POSIcon, roles: ['cashier'] },
  { to: '/inventory', labelKey: 'nav_inventory', icon: InventoryIcon, roles: ['admin', 'cashier'] },
  { to: '/refunds', labelKey: 'nav_refunds', icon: RefundIcon, roles: ['admin', 'cashier'] },
  { to: '/verify-product', labelKey: 'nav_verify', icon: SearchIcon, roles: ['cashier'] },
  { to: '/barcode', labelKey: 'nav_barcode', icon: BarcodeIcon, roles: ['admin', 'cashier'] },
  { to: '/reports', labelKey: 'nav_reports', icon: ReportsIcon, roles: ['admin', 'cashier'] },
  { to: '/messages', labelKey: 'nav_messages', icon: ChatIcon, roles: ['admin', 'cashier'] },
  { to: '/branches', labelKey: 'nav_branches', icon: BranchesIcon, roles: ['admin'] },
  { to: '/settings', labelKey: 'nav_settings', icon: SettingsIcon, roles: ['admin', 'cashier'] },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const t = useTranslation()

  if (!user) return null
  const currentUser = user
  const items = NAV_ITEMS.filter((i) => i.roles.includes(currentUser.role))

  function handleLogout() {
    logActivity('LOGOUT', `${currentUser.role === 'admin' ? 'Admin' : 'Cashier'} logged out`, currentUser)
    logout()
    navigate('/login')
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={onClose} aria-hidden="true" />
      )}
      {/* The sidebar keeps its brand green background in both light and
          dark theme (a deliberate design choice - the app shell stays on
          brand, only content surfaces adapt to the theme), so all
          overlays here are literal white/opacity, not the theme-aware
          app-card token. */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-64 bg-primary text-white flex flex-col transition-transform duration-200 ease-in-out
          ${open ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
      >
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/15">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center font-bold text-lg">S</div>
            <div>
              <div className="font-bold text-base leading-tight">Sengasu Mini</div>
              <div className="text-xs text-white/70">Supermarket</div>
            </div>
          </div>
          <button onClick={onClose} className="md:hidden p-1 text-white/80 hover:text-white" aria-label="Close menu">
            <CloseIcon />
          </button>
        </div>

        <div className="px-5 py-4 border-b border-white/15 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center">
            <UserIcon width={18} height={18} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate">{user.fullName ?? user.email}</div>
            <div className="text-xs text-white/70 truncate">
              {user.role === 'admin' ? 'Administrator' : user.branchName}
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${isActive ? 'bg-white text-primary-dark' : 'text-white/90 hover:bg-white/10'}`
              }
            >
              <item.icon width={18} height={18} />
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-white/15">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/90 hover:bg-white/10 transition-colors"
          >
            <LogoutIcon width={18} height={18} />
            {t('nav_logout')}
          </button>
        </div>
      </aside>
    </>
  )
}
