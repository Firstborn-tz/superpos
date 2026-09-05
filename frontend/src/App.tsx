import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useDataStore } from '@/store/dataStore'
import { syncService } from '@/services/sync/syncService'
import { useInactivityLogout } from '@/hooks/useInactivityLogout'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import ToastContainer from '@/components/common/Toast'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import POSPage from '@/pages/POSPage'
import InventoryPage from '@/pages/InventoryPage'
import RefundsPage from '@/pages/RefundsPage'
import VerifyProductPage from '@/pages/VerifyProductPage'
import LandingPage from '@/pages/LandingPage'
import ChatPage from '@/pages/ChatPage'
import BarcodePage from '@/pages/BarcodePage'
import ReportsPage from '@/pages/ReportsPage'
import BranchesPage from '@/pages/BranchesPage'
import SettingsPage from '@/pages/SettingsPage'

function AppRoutes() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useAuthStore((s) => s.user)

  // Requires Router context (uses useNavigate), so it lives inside <BrowserRouter>.
  useInactivityLogout()

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to={user?.role === 'admin' ? '/dashboard' : '/pos'} replace /> : <LoginPage />}
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pos"
        element={
          <ProtectedRoute allowedRoles={['cashier']}>
            <POSPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/inventory"
        element={
          <ProtectedRoute>
            <InventoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/refunds"
        element={
          <ProtectedRoute>
            <RefundsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/verify-product"
        element={
          <ProtectedRoute allowedRoles={['cashier']}>
            <VerifyProductPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/messages"
        element={
          <ProtectedRoute>
            <ChatPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/barcode"
        element={
          <ProtectedRoute>
            <BarcodePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <ReportsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/branches"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <BranchesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          isAuthenticated ? (
            <Navigate to={user?.role === 'admin' ? '/dashboard' : '/pos'} replace />
          ) : (
            <LandingPage />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  const hydrateFromCache = useDataStore((s) => s.hydrateFromCache)
  const refreshFromServer = useDataStore((s) => s.refreshFromServer)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const userRole = useAuthStore((s) => s.user?.role)

  useEffect(() => {
    hydrateFromCache()
    void refreshFromServer()
    void syncService.syncNow()
    const interval = setInterval(() => {
      void refreshFromServer()
      void syncService.syncNow()
    }, 60_000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refresh private records immediately after an administrator signs in;
  // the initial anonymous refresh intentionally fetches public data only.
  useEffect(() => {
    if (isAuthenticated) void refreshFromServer()
  }, [isAuthenticated, userRole, refreshFromServer])

  return (
    <BrowserRouter>
      <AppRoutes />
      <ToastContainer />
    </BrowserRouter>
  )
}
