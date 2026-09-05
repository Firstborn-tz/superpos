import {
  signInWithEmailAndPassword,
  updatePassword as fbUpdatePassword,
  sendPasswordResetEmail,
} from 'firebase/auth'
import { auth } from '@/config/firebase'
import type { Branch, User } from '@/types'
import { verifyPassword, hashPassword } from '@/utils/crypto'
import { generateId } from '@/utils/helpers'
import { pushBranch } from '@/services/firebase/firestoreService'
import { syncService } from '@/services/sync/syncService'

export interface LoginResult {
  ok: boolean
  user?: User
  token?: string
  message?: string
}

export async function loginAdmin(email: string, password: string): Promise<LoginResult> {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    const token = await cred.user.getIdToken()
    const user: User = {
      id: cred.user.uid,
      email: cred.user.email ?? email,
      fullName: cred.user.displayName ?? 'Administrator',
      role: 'admin',
    }
    return { ok: true, user, token }
  } catch (err) {
    if (!navigator.onLine) {
      return { ok: false, message: 'You are offline. Admin login requires an internet connection the first time.' }
    }
    const code = err instanceof Error && 'code' in err ? (err as { code: string }).code : undefined
    console.error('Admin login failed:', code, err)
    const message = code ? mapFirebaseAuthError(code) : 'Login failed. Please try again.'
    return { ok: false, message }
  }
}

function mapFirebaseAuthError(code: string): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password.'
    case 'auth/invalid-email':
      return 'That email address is not valid.'
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact your Firebase project admin.'
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not enabled for this Firebase project. Enable it in Firebase Console → Authentication → Sign-in method.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.'
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.'
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
    case 'auth/invalid-api-key':
      return 'Invalid Firebase API key. Check your .env configuration.'
    case 'auth/configuration-not-found':
      return 'Firebase Authentication is not set up for this project. Enable Email/Password sign-in in Firebase Console.'
    default:
      return `Login failed (${code}). Check the browser console for details.`
  }
}

/**
 * Branch (cashier) login validates against locally cached branch records
 * so cashiers can log in even while fully offline, as long as the branch
 * list has synced to this device at least once before.
 */
export async function loginBranch(branchName: string, password: string, branches: Branch[]): Promise<LoginResult> {
  const branch = branches.find((b) => b.name.toLowerCase().trim() === branchName.toLowerCase().trim())
  if (!branch) {
    return { ok: false, message: 'Branch not found. Check the branch name or contact the administrator.' }
  }

  const valid = branch.password.includes(':') ? await verifyPassword(password, branch.password) : password === branch.password

  if (!valid) {
    return { ok: false, message: 'Incorrect branch password.' }
  }

  const user: User = {
    id: branch.id,
    fullName: `${branch.name} Cashier`,
    role: 'cashier',
    branchId: branch.id,
    branchName: branch.name,
  }
  const token = generateId('token')
  return { ok: true, user, token }
}

export async function changeAdminPassword(newPassword: string): Promise<{ ok: boolean; message?: string }> {
  if (!auth.currentUser) return { ok: false, message: 'Not signed in.' }
  try {
    await fbUpdatePassword(auth.currentUser, newPassword)
    return { ok: true }
  } catch {
    return { ok: false, message: 'Could not update password. Please re-login and try again.' }
  }
}

export async function changeBranchPassword(branch: Branch, newPassword: string): Promise<Branch> {
  const hashed = await hashPassword(newPassword)
  const updated: Branch = { ...branch, password: hashed }
  if (navigator.onLine) {
    try {
      await pushBranch(updated)
    } catch {
      syncService.addPendingOperation('UPDATE_BRANCH_PASSWORD', updated)
    }
  } else {
    syncService.addPendingOperation('UPDATE_BRANCH_PASSWORD', updated)
  }
  return updated
}

/**
 * Sends a Firebase-hosted password reset email to the given address.
 * Always returns a generic success message regardless of whether the
 * email actually has an account, to avoid leaking which emails are
 * registered admins (standard security practice for reset flows).
 */
export async function sendAdminPasswordReset(email: string): Promise<{ ok: boolean; message: string }> {
  if (!navigator.onLine) {
    return { ok: false, message: 'You are offline. Connect to the internet to request a password reset.' }
  }
  try {
    await sendPasswordResetEmail(auth, email.trim())
  } catch (err) {
    const code = err instanceof Error && 'code' in err ? (err as { code: string }).code : undefined
    // auth/invalid-email is the only case worth surfacing distinctly - all
    // other errors (including "user not found") get the same generic
    // message so the form can't be used to enumerate registered emails.
    if (code === 'auth/invalid-email') {
      return { ok: false, message: 'Enter a valid email address.' }
    }
    console.error('Password reset request failed:', code, err)
  }
  return {
    ok: true,
    message: 'If an account exists with that email, a password reset link has been sent. Check your inbox (and spam folder).',
  }
}
