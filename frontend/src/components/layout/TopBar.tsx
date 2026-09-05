import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { MenuIcon, UserIcon, SunIcon, MoonIcon } from '@/components/common/Icons'
import NotificationBell from '@/components/common/NotificationBell'

interface TopBarProps {
  title: string
  onMenuClick: () => void
}

export default function TopBar({ title, onMenuClick }: TopBarProps) {
  const { user } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()

  return (
    <header className="sticky top-0 z-20 bg-app-card border-b border-app-border px-4 md:px-6 py-3 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 -ml-2 text-app-body hover:bg-app-hover rounded-lg"
          aria-label="Open menu"
        >
          <MenuIcon />
        </button>
        <h1 className="text-lg md:text-xl font-bold text-app-heading">{title}</h1>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-3">
        <button
          onClick={toggleTheme}
          className="p-2 text-app-body hover:bg-app-hover rounded-lg transition-colors"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? <SunIcon width={19} height={19} /> : <MoonIcon width={19} height={19} />}
        </button>
        <NotificationBell />
        <div className="hidden sm:flex items-center gap-2 text-sm text-app-body pl-1">
          <div className="w-8 h-8 rounded-full bg-primary-50 text-primary flex items-center justify-center">
            <UserIcon width={16} height={16} />
          </div>
          <span className="font-medium">{user?.fullName ?? user?.email}</span>
        </div>
      </div>
    </header>
  )
}
