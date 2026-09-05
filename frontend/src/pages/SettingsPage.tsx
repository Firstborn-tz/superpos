import { useEffect, useState, type FormEvent } from 'react'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { useAuthStore } from '@/store/authStore'
import { useDataStore } from '@/store/dataStore'
import { useThemeStore } from '@/store/themeStore'
import { useLanguageStore, useTranslation } from '@/store/languageStore'
import { STORAGE_KEYS, readStorage, writeStorage } from '@/utils/storage'
import type { AppSettings, PendingOperation } from '@/types'
import { changeAdminPassword, changeBranchPassword } from '@/services/auth/authService'
import { logActivity } from '@/services/activity/activityService'
import { syncService } from '@/services/sync/syncService'
import {
  CheckIcon,
  SettingsIcon,
  UserIcon,
  WarningIcon,
  SunIcon,
  MoonIcon,
  SyncIcon,
  TrashIcon,
} from '@/components/common/Icons'

const DEFAULT_SETTINGS: AppSettings = {
  language: 'en',
  currency: 'TZS',
  receiptFooter: 'Thank you for shopping with us!',
}

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const branches = useDataStore((s) => s.branches)
  const upsertBranch = useDataStore((s) => s.upsertBranch)
  const { theme, setTheme } = useThemeStore()
  const { language, setLanguage } = useLanguageStore()
  const t = useTranslation()

  const [settings, setSettings] = useState<AppSettings>(() => readStorage(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS))
  const [saved, setSaved] = useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwMessage, setPwMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [pwLoading, setPwLoading] = useState(false)

  function saveSettings(next: AppSettings) {
    setSettings(next)
    writeStorage(STORAGE_KEYS.SETTINGS, next)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  function handleLanguageChange(lang: 'en' | 'sw') {
    setLanguage(lang)
    saveSettings({ ...settings, language: lang })
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault()
    setPwMessage(null)
    if (newPassword.length < 4) {
      setPwMessage({ type: 'error', text: 'Password must be at least 4 characters.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setPwMessage({ type: 'error', text: 'Passwords do not match.' })
      return
    }
    setPwLoading(true)
    if (user?.role === 'admin') {
      const result = await changeAdminPassword(newPassword)
      setPwLoading(false)
      if (result.ok) {
        setPwMessage({ type: 'success', text: 'Password updated successfully.' })
        logActivity('PASSWORD_CHANGE', 'Admin password changed', user)
        setNewPassword('')
        setConfirmPassword('')
      } else {
        setPwMessage({ type: 'error', text: result.message ?? 'Could not update password.' })
      }
    } else {
      const branch = branches.find((b) => b.id === user?.branchId)
      if (!branch) {
        setPwLoading(false)
        setPwMessage({ type: 'error', text: 'Branch record not found.' })
        return
      }
      const updated = await changeBranchPassword(branch, newPassword)
      upsertBranch(updated)
      setPwLoading(false)
      setPwMessage({ type: 'success', text: 'Branch password updated successfully.' })
      logActivity('PASSWORD_CHANGE', `Branch password changed for "${branch.name}"`, user)
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  return (
    <DashboardLayout title={t('settings_title')}>
      <div className="max-w-2xl space-y-5">
        <section className="bg-app-card rounded-card shadow-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <SettingsIcon width={18} height={18} className="text-primary" />
            <h2 className="font-bold text-app-heading">{t('settings_general')}</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-app-body mb-2">{t('settings_theme')}</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors ${
                    theme === 'light' ? 'border-primary bg-primary-50 text-primary' : 'border-app-border text-app-muted'
                  }`}
                >
                  <SunIcon width={16} height={16} />
                  {t('settings_theme_light')}
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors ${
                    theme === 'dark' ? 'border-primary bg-primary-50 text-primary' : 'border-app-border text-app-muted'
                  }`}
                >
                  <MoonIcon width={16} height={16} />
                  {t('settings_theme_dark')}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-app-body mb-1">{t('settings_language')}</label>
              <select
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value as 'en' | 'sw')}
                className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="en">English</option>
                <option value="sw">Kiswahili</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-app-body mb-1">{t('settings_currency')}</label>
              <input
                value={settings.currency}
                onChange={(e) => saveSettings({ ...settings, currency: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-app-body mb-1">{t('settings_receipt_footer')}</label>
              <textarea
                value={settings.receiptFooter}
                onChange={(e) => saveSettings({ ...settings, receiptFooter: e.target.value })}
                rows={2}
                className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            {saved && (
              <div className="flex items-center gap-2 text-primary text-sm font-medium">
                <CheckIcon width={16} height={16} />
                Settings saved
              </div>
            )}
          </div>
        </section>

        <section className="bg-app-card rounded-card shadow-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <UserIcon width={18} height={18} className="text-primary" />
            <h2 className="font-bold text-app-heading">{t('settings_account_info')}</h2>
          </div>
          <div className="space-y-2 text-sm">
            <Row label="Name" value={user?.fullName ?? '-'} />
            {user?.role === 'admin' ? (
              <Row label="Email" value={user?.email ?? '-'} />
            ) : (
              <Row label="Branch" value={user?.branchName ?? '-'} />
            )}
            <Row label="Role" value={user?.role === 'admin' ? 'Administrator' : 'Cashier'} />
          </div>
        </section>

        <section className="bg-app-card rounded-card shadow-card p-5">
          <h2 className="font-bold text-app-heading mb-4">{t('settings_change_password')}</h2>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            {pwMessage && (
              <div
                className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${
                  pwMessage.type === 'success' ? 'bg-green-50 text-primary' : 'bg-red-50 text-danger'
                }`}
              >
                {pwMessage.type === 'success' ? <CheckIcon width={16} height={16} /> : <WarningIcon width={16} height={16} />}
                {pwMessage.text}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-app-body mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-app-body mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <button
              type="submit"
              disabled={pwLoading}
              className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
            >
              {pwLoading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </section>

        {user?.role === 'admin' && <SyncQueuePanel />}

        <section className="bg-app-card rounded-card shadow-card p-5">
          <h2 className="font-bold text-app-heading mb-2">{t('settings_about')}</h2>
          <p className="text-sm text-app-muted">Sengasu Supermarket - Point of Sale System</p>
          <p className="text-xs text-app-faint mt-1">Version 1.0.0 &middot; Work offline,and on any device</p>
          <p className="text-xs text-app-faint mt-3 pt-3 border-t border-app-border">Developed by Progr_Willy</p>
        </section>
      </div>
    </DashboardLayout>
  )
}

/**
 * Shows every operation still stuck in the offline sync queue, with the
 * specific error each one hit on its last attempt - the aggregate
 * banner at the top of the app only shows the *last* error seen across
 * an entire sync pass, which can hide the real cause when several
 * different things are failing for different reasons.
 */
function SyncQueuePanel() {
  const [ops, setOps] = useState<PendingOperation[]>(syncService.getPendingOperations())
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    const unsub = syncService.subscribe(() => setOps(syncService.getPendingOperations()))
    return unsub
  }, [])

  async function handleRetry() {
    setSyncing(true)
    await syncService.syncNow()
    setOps(syncService.getPendingOperations())
    setSyncing(false)
  }

  function handleDiscard(id: string) {
    syncService.discardPendingOperation(id)
    setOps(syncService.getPendingOperations())
  }

  return (
    <section className="bg-app-card rounded-card shadow-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-app-heading">Sync Queue</h2>
        <button
          onClick={handleRetry}
          disabled={syncing || ops.length === 0}
          className="flex items-center gap-1.5 text-sm font-semibold text-secondary hover:underline disabled:opacity-50"
        >
          <SyncIcon width={14} height={14} className={syncing ? 'animate-spin' : ''} />
          Retry Now
        </button>
      </div>

      {ops.length === 0 ? (
        <p className="text-sm text-app-faint">Nothing pending - everything is synced.</p>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {ops.map((op) => (
            <div key={op.id} className="border border-app-border rounded-lg p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-app-heading">{op.type}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-app-faint">{op.attempts} attempt(s)</span>
                  <button
                    onClick={() => handleDiscard(op.id)}
                    className="text-app-faint hover:text-danger"
                    title="Discard this operation without syncing it"
                    aria-label="Discard"
                  >
                    <TrashIcon width={14} height={14} />
                  </button>
                </div>
              </div>
              {op.error && <p className="text-xs text-danger mt-1.5 font-mono break-all">{op.error}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-app-border last:border-0">
      <span className="text-app-muted">{label}</span>
      <span className="font-medium text-app-heading">{value}</span>
    </div>
  )
}