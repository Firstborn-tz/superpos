import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '@/components/layout/DashboardLayout'
import Modal from '@/components/common/Modal'
import { useAuthStore } from '@/store/authStore'
import { useDataStore } from '@/store/dataStore'
import { syncService } from '@/services/sync/syncService'
import { logActivity } from '@/services/activity/activityService'
import { reauthenticateAdmin } from '@/services/auth/reauthService'
import { toast } from '@/store/toastStore'
import type { Branch, InventoryItem } from '@/types'
import { formatCurrency, formatDate, generateBranchCode, generateId } from '@/utils/helpers'
import { hashPassword } from '@/utils/crypto'
import { PlusIcon, BranchesIcon, PhoneIcon, TrashIcon, BoxIcon, PrintIcon, EditIcon, LockIcon, WarningIcon } from '@/components/common/Icons'

export default function BranchesPage() {
  const user = useAuthStore((s) => s.user)
  const { branches, inventory, upsertBranch, removeBranch } = useDataStore()
  const navigate = useNavigate()
  const [showAdd, setShowAdd] = useState(false)
  const [viewBranch, setViewBranch] = useState<Branch | null>(null)
  const [renameBranch, setRenameBranch] = useState<Branch | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null)

  async function handleAddBranch(data: { name: string; password: string; address: string; phone: string }) {
    const hashed = await hashPassword(data.password)
    const branch: Branch = {
      id: generateId('branch'),
      name: data.name,
      code: generateBranchCode(data.name),
      password: hashed,
      address: data.address,
      phone: data.phone,
      createdAt: new Date().toISOString(),
    }
    upsertBranch(branch)
    syncService.addPendingOperation('ADD_BRANCH', branch)
    logActivity('ADD_BRANCH', `Added branch "${branch.name}" (${branch.code})`, user)
    toast.success('Branch created')
    setShowAdd(false)
  }

  function handleRename(branch: Branch, newName: string) {
    const oldName = branch.name
    const updated: Branch = { ...branch, name: newName }
    upsertBranch(updated)
    syncService.addPendingOperation('ADD_BRANCH', updated)
    logActivity('ADD_BRANCH', `Renamed branch "${oldName}" to "${newName}"`, user)
    toast.success('Branch renamed')
    setRenameBranch(null)
  }

  function handleDeleteConfirmed(branch: Branch) {
    removeBranch(branch.id)
    syncService.addPendingOperation('DELETE_BRANCH', { id: branch.id })
    logActivity('DELETE_BRANCH', `Deleted branch "${branch.name}" (admin password verified)`, user)
    toast.success('Branch deleted')
    setDeleteTarget(null)
  }

  return (
    <DashboardLayout title="Branches">
      <div className="space-y-5">
        <div className="flex justify-end">
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors"
          >
            <PlusIcon width={16} height={16} />
            Add Branch
          </button>
        </div>

        {branches.length === 0 ? (
          <div className="bg-app-card rounded-card shadow-card p-10 text-center text-app-faint">
            <BranchesIcon width={32} height={32} className="mx-auto mb-3 text-app-faint" />
            No branches yet. Add your first branch to get started.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {branches.map((b) => {
              const productCount = inventory.filter((i) => i.branchId === b.id).length
              return (
                <div key={b.id} className="bg-app-card rounded-card shadow-card p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-app-heading">{b.name}</h3>
                      <span className="text-xs font-mono text-app-faint">{b.code}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setRenameBranch(b)}
                        className="p-1 text-app-faint hover:text-secondary"
                        aria-label="Rename branch"
                      >
                        <EditIcon width={16} height={16} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(b)}
                        className="p-1 text-app-faint hover:text-danger"
                        aria-label="Delete branch"
                      >
                        <TrashIcon width={16} height={16} />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-app-muted mt-2">{b.address}</p>
                  <div className="flex items-center gap-1.5 text-sm text-app-muted mt-1">
                    <PhoneIcon width={13} height={13} />
                    {b.phone}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-app-muted mt-1">
                    <BoxIcon width={13} height={13} />
                    {productCount} products
                  </div>
                  <button
                    onClick={() => setViewBranch(b)}
                    className="mt-4 w-full text-sm font-semibold text-primary border border-primary/30 rounded-lg py-2 hover:bg-primary-50 transition-colors"
                  >
                    View Products
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <AddBranchModal open={showAdd} onClose={() => setShowAdd(false)} onSubmit={handleAddBranch} />

      <RenameBranchModal branch={renameBranch} onClose={() => setRenameBranch(null)} onSubmit={handleRename} />

      <DeleteBranchModal branch={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDeleteConfirmed} />

      <BranchProductsModal
        branch={viewBranch}
        inventory={inventory}
        onClose={() => setViewBranch(null)}
        onPrintBarcode={(item) =>
          navigate('/barcode', { state: { barcode: item.barcode, productName: item.productName, price: item.sellingPrice } })
        }
      />
    </DashboardLayout>
  )
}

function AddBranchModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (data: { name: string; password: string; address: string; phone: string }) => void
}) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !password.trim() || !address.trim() || !phone.trim()) return
    onSubmit({ name: name.trim(), password, address: address.trim(), phone: phone.trim() })
    setName('')
    setPassword('')
    setAddress('')
    setPhone('')
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Branch">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-app-body mb-1">Branch name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="e.g. Kariakoo Branch"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-app-body mb-1">Branch password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Set a login password for this branch"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-app-body mb-1">Address</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-app-body mb-1">Phone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <p className="text-xs text-app-faint">A unique branch code will be generated automatically.</p>
        <button
          type="submit"
          className="w-full bg-primary hover:bg-primary-dark text-white font-semibold py-2.5 rounded-lg transition-colors"
        >
          Create branch
        </button>
      </form>
    </Modal>
  )
}

function RenameBranchModal({
  branch,
  onClose,
  onSubmit,
}: {
  branch: Branch | null
  onClose: () => void
  onSubmit: (branch: Branch, newName: string) => void
}) {
  const [name, setName] = useState(branch?.name ?? '')

  // Reset the field whenever a different branch is opened for renaming
  useMemo(() => setName(branch?.name ?? ''), [branch])

  if (!branch) return null

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || trimmed === branch!.name) {
      onClose()
      return
    }
    onSubmit(branch!, trimmed)
  }

  return (
    <Modal open={!!branch} onClose={onClose} title="Rename Branch">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-app-body mb-1">Branch name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <p className="text-xs text-app-faint">
          Cashiers at this branch will need to use the new name to log in going forward - the branch password stays
          the same.
        </p>
        <button
          type="submit"
          className="w-full bg-primary hover:bg-primary-dark text-white font-semibold py-2.5 rounded-lg transition-colors"
        >
          Save new name
        </button>
      </form>
    </Modal>
  )
}

function DeleteBranchModal({
  branch,
  onClose,
  onConfirm,
}: {
  branch: Branch | null
  onClose: () => void
  onConfirm: (branch: Branch) => void
}) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function reset() {
    setPassword('')
    setError('')
    setLoading(false)
  }

  if (!branch) return null

  async function handleConfirm(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!password) {
      setError('Enter your admin password to confirm.')
      return
    }
    setLoading(true)
    const result = await reauthenticateAdmin(password)
    setLoading(false)
    if (!result.ok) {
      setError(result.message ?? 'Verification failed.')
      return
    }
    onConfirm(branch!)
    reset()
  }

  return (
    <Modal
      open={!!branch}
      onClose={() => {
        reset()
        onClose()
      }}
      title="Delete Branch"
    >
      <form onSubmit={handleConfirm} className="space-y-4">
        <div className="flex items-start gap-2 bg-red-50 text-danger text-sm rounded-lg px-3.5 py-2.5">
          <WarningIcon width={16} height={16} className="mt-0.5 shrink-0" />
          <span>
            You are about to permanently delete <span className="font-bold">{branch.name}</span> and its cashier
            login. This cannot be undone. Products already assigned to this branch will remain in the database but
            will no longer be reachable from a branch login.
          </span>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 text-danger text-sm rounded-lg px-3 py-2">
            <WarningIcon width={16} height={16} />
            {error}
          </div>
        )}

        <div>
          <label className="flex items-center gap-1.5 text-sm font-medium text-app-body mb-1">
            <LockIcon width={14} height={14} />
            Confirm your admin password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="w-full px-3.5 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-danger"
            placeholder="Enter your password to confirm"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              reset()
              onClose()
            }}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-app-hover text-app-body hover:bg-app-hover-strong"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-danger text-white hover:bg-red-600 disabled:opacity-60"
          >
            {loading ? 'Verifying...' : 'Delete Branch'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function BranchProductsModal({
  branch,
  inventory,
  onClose,
  onPrintBarcode,
}: {
  branch: Branch | null
  inventory: InventoryItem[]
  onClose: () => void
  onPrintBarcode: (item: InventoryItem) => void
}) {
  const products = useMemo(() => (branch ? inventory.filter((i) => i.branchId === branch.id) : []), [branch, inventory])

  if (!branch) return null

  return (
    <Modal open={!!branch} onClose={onClose} title={`${branch.name} - Products`} maxWidth="max-w-2xl">
      {products.length === 0 ? (
        <p className="text-center text-app-faint py-8 text-sm">No products in this branch yet</p>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {products.map((p) => (
            <div key={p.id} className="border border-app-border rounded-lg p-3 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm text-app-heading">{p.productName}</div>
                <div className="text-xs text-app-faint">
                  {p.currentStock} in stock &middot; expires {formatDate(p.expiryDate)}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-sm text-primary">{formatCurrency(p.sellingPrice)}</span>
                <button onClick={() => onPrintBarcode(p)} className="text-app-faint hover:text-primary" aria-label="Print barcode">
                  <PrintIcon width={16} height={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
