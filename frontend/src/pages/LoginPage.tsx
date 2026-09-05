import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useDataStore } from '@/store/dataStore'
import { loginAdmin, loginBranch, sendAdminPasswordReset } from '@/services/auth/authService'
import { logActivity } from '@/services/activity/activityService'
import { useTranslation } from '@/store/languageStore'
import { UserIcon, WarningIcon, CheckIcon } from '@/components/common/Icons'

type Tab = 'admin' | 'branch'

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const branches = useDataStore((s) => s.branches)
  const t = useTranslation()

  const [tab, setTab] = useState<Tab>('admin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [branchName, setBranchName] = useState('')
  const [branchPassword, setBranchPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [showReset, setShowReset] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMessage, setResetMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleAdminSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await loginAdmin(email.trim(), password)
    setLoading(false)
    if (result.ok && result.user && result.token) {
      setAuth(result.user, result.token)
      logActivity('LOGIN', `Admin login: ${result.user.email}`, result.user)
      navigate('/dashboard')
    } else {
      setError(result.message ?? 'Login failed')
    }
  }

  async function handleBranchSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await loginBranch(branchName.trim(), branchPassword, branches)
    setLoading(false)
    if (result.ok && result.user && result.token) {
      setAuth(result.user, result.token)
      logActivity('LOGIN', `Cashier login: ${result.user.branchName}`, result.user)
      navigate('/pos')
    } else {
      setError(result.message ?? 'Login failed')
    }
  }

  function openReset() {
    setResetEmail(email)
    setResetMessage(null)
    setShowReset(true)
  }

  async function handleResetSubmit(e: FormEvent) {
    e.preventDefault()
    setResetMessage(null)
    setResetLoading(true)
    const result = await sendAdminPasswordReset(resetEmail)
    setResetLoading(false)
    setResetMessage({ type: result.ok ? 'success' : 'error', text: result.message })
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary text-white flex items-center justify-center text-2xl font-bold mx-auto mb-3 shadow-card">
            S
          </div>
          <h1 className="text-2xl font-bold text-app-heading">Sengasu Mini Supermarket</h1>
          <p className="text-app-muted text-sm mt-1">{t('login_title')}</p>
        </div>

        <div className="bg-app-card rounded-card shadow-card overflow-hidden">
          <div className="grid grid-cols-2">
            <button
              onClick={() => {
                setTab('admin')
                setError('')
                setShowReset(false)
              }}
              className={`py-3.5 text-sm font-semibold transition-colors ${
                tab === 'admin' ? 'bg-primary text-white' : 'bg-app-alt text-app-muted hover:bg-app-hover'
              }`}
            >
              {t('login_admin_tab')}
            </button>
            <button
              onClick={() => {
                setTab('branch')
                setError('')
                setShowReset(false)
              }}
              className={`py-3.5 text-sm font-semibold transition-colors ${
                tab === 'branch' ? 'bg-primary text-white' : 'bg-app-alt text-app-muted hover:bg-app-hover'
              }`}
            >
              {t('login_branch_tab')}
            </button>
          </div>

          <div className="p-6">
            {error && (
              <div className="flex items-start gap-2 bg-red-50 text-danger text-sm rounded-lg px-3 py-2.5 mb-4">
                <WarningIcon width={16} height={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {tab === 'admin' && showReset ? (
              <form onSubmit={handleResetSubmit} className="space-y-4">
                <div>
                  <h2 className="text-sm font-bold text-app-heading mb-1">Reset your password</h2>
                  <p className="text-xs text-app-muted">
                    Enter your admin email and we'll send you a link to set a new password.
                  </p>
                </div>

                {resetMessage && (
                  <div
                    className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2.5 ${
                      resetMessage.type === 'success' ? 'bg-green-50 text-primary' : 'bg-red-50 text-danger'
                    }`}
                  >
                    {resetMessage.type === 'success' ? (
                      <CheckIcon width={16} height={16} className="mt-0.5 shrink-0" />
                    ) : (
                      <WarningIcon width={16} height={16} className="mt-0.5 shrink-0" />
                    )}
                    <span>{resetMessage.text}</span>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-app-body mb-1">{t('login_email')}</label>
                  <input
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="owner@supermarket.com"
                    autoFocus
                    className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>

                <button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full bg-primary hover:bg-primary-dark disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors"
                >
                  {resetLoading ? 'Sending...' : 'Send reset link'}
                </button>

                <button
                  type="button"
                  onClick={() => setShowReset(false)}
                  className="w-full text-sm font-medium text-app-muted hover:text-app-body py-1"
                >
                  &larr; Back to login
                </button>
              </form>
            ) : tab === 'admin' ? (
              <form onSubmit={handleAdminSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-app-body mb-1">{t('login_email')}</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="owner@supermarket.com"
                    className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-app-body">{t('login_password')}</label>
                    <button
                      type="button"
                      onClick={openReset}
                      className="text-xs font-semibold text-secondary hover:underline"
                    >
                      {t('login_forgot_password')}
                    </button>
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary hover:bg-primary-dark disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? 'Signing in...' : t('login_signin_admin')}
                </button>
              </form>
            ) : (
              <form onSubmit={handleBranchSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-app-body mb-1">{t('login_branch_name')}</label>
                  <input
                    type="text"
                    required
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    placeholder="e.g. Kariakoo Branch"
                    className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-app-body mb-1">{t('login_branch_password')}</label>
                  <input
                    type="password"
                    required
                    value={branchPassword}
                    onChange={(e) => setBranchPassword(e.target.value)}
                    placeholder="Enter branch password"
                    className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary hover:bg-primary-dark disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <UserIcon width={16} height={16} />
                  {loading ? 'Signing in...' : t('login_signin_cashier')}
                </button>
                {branches.length === 0 && (
                  <p className="text-xs text-app-faint text-center">
                    No branch found!. Connect your device to the internet to sync branch data.
                  </p>
                )}
                <p className="text-xs text-app-faint text-center">
                  Forgot your branch password? Ask your administrator!.
                </p>
              </form>
            )}
          </div>
        </div>
        <p className="text-center text-xs text-app-faint mt-6">{t('login_offline_note')}</p>
      </div>
    </div>
  )
}
