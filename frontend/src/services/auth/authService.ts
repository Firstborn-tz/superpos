import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword as fbUpdatePassword,
  sendPasswordResetEmail,
} from 'firebase/auth'
import { auth } from '@/config/firebase'
import type { Branch, User } from '@/types'
import { hashPassword } from '@/utils/crypto'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { db } from '@/config/firebase'
import { pushBranch } from '@/services/firebase/firestoreService'
import { syncService } from '@/services/sync/syncService'

export interface LoginResult {
  ok: boolean
  user?: User
  token?: string
  message?: string
}

export function cashierAuthEmail(branchId: string): string {
  return `${branchId}@cashiers.superpos.invalid`
}

export async function loginAdmin(email: string, password: string): Promise<LoginResult> {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    const access = await getDoc(doc(db, 'admins', cred.user.uid))
    if (!access.exists() || access.data().role !== 'admin') {
      await signOut(auth)
      return {
        ok: false,
        message: `This Firebase account is signed in but is not registered as an administrator. In Firestore, create or correct document admins/${cred.user.uid} and set role (string) to admin.`,
      }
    }
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
    if (code === 'permission-denied' || code === 'firestore/permission-denied') {
      return {
        ok: false,
        message: 'Firebase sign-in succeeded, but Firestore denied access to the administrator record. Deploy the repository firestore.rules to project supermarketpos-464da, then confirm admins/{your Firebase UID} exists with role set to admin.',
      }
    }
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

/** Resolve the familiar branch name to its provisioned Firebase Auth account. */
export async function loginCashier(branchName: string, password: string): Promise<LoginResult> {
  let cashierLoginEmail: string | null = null
  try {
    const publicBranches = await getDocs(collection(db, 'public_branches'))
    const branch = publicBranches.docs.map((snapshot) => snapshot.data()).find(
      (entry) => typeof entry.name === 'string' && entry.name.trim().toLowerCase() === branchName.trim().toLowerCase(),
    )
    if (!branch || typeof branch.id !== 'string') {
      return { ok: false, message: 'Branch name was not found. Check its spelling or ask the administrator to confirm the branch exists in Firestore.' }
    }

    cashierLoginEmail = cashierAuthEmail(branch.id)
    const cred = await signInWithEmailAndPassword(auth, cashierLoginEmail, password)
    const access = await getDoc(doc(db, 'cashier_access', cred.user.uid))
    const data = access.data()
    if (!access.exists() || data?.role !== 'cashier' || data.branchId !== branch.id) {
      await signOut(auth)
      return {
        ok: false,
        message: `Cashier Firebase account is signed in, but its access record is missing or incorrect. Create cashier_access/${cred.user.uid} with role (string) cashier and branchId (string) ${branch.id}.`,
      }
    }
    const token = await cred.user.getIdToken()
    const user: User = {
      id: cred.user.uid,
      email: cred.user.email ?? cashierAuthEmail(branch.id),
      fullName: typeof data.fullName === 'string' ? data.fullName : `${branch.name} Cashier`,
      role: 'cashier',
      branchId: branch.id,
      branchName: branch.name,
    }
    return { ok: true, user, token }
  } catch (err) {
    if (!navigator.onLine) return { ok: false, message: 'Cashier sign-in requires an internet connection.' }
    const code = err instanceof Error && 'code' in err ? (err as { code: string }).code : undefined
    if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') {
      return {
        ok: false,
        message: 'The branch was found, but its saved branch name and password are not connected to a Firebase cashier account yet. Ask the administrator to finish the one-time cashier account setup. Cashiers should continue using only the branch name and branch password here.',
      }
    }
    if (code === 'auth/operation-not-allowed') return { ok: false, message: 'Enable Email/Password sign-in in Firebase Console > Authentication > Sign-in method.' }
    if (code === 'auth/network-request-failed') return { ok: false, message: 'Network error while signing in. Check the connection and try again.' }
    if (code === 'permission-denied' || code === 'firestore/permission-denied') {
      return { ok: false, message: 'Firestore denied branch lookup. Deploy firestore.rules and confirm public_branches allows reads.' }
    }
    return { ok: false, message: code ? `Cashier sign-in failed (${code}).` : 'Cashier login failed. Please try again.' }
  }
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

export async function changeBranchPassword(branch: Branch, newPassword: string, currentPassword: string): Promise<Branch> {
  const currentUser = auth.currentUser
  const expectedEmail = cashierAuthEmail(branch.id)
  if (!currentUser || currentUser.email !== expectedEmail) {
    throw new Error('An administrator must change this cashier password in Firebase Authentication Console.')
  }
  await reauthenticateWithCredential(currentUser, EmailAuthProvider.credential(expectedEmail, currentPassword))
  await fbUpdatePassword(currentUser, newPassword)
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
 * Sends Firebase's hosted password-reset link. The hosted page lets the
 * administrator choose and confirm a new password; Firebase then completes
 * the reset without requiring an authenticated session in this app.
 */
export async function sendAdminPasswordReset(email: string): Promise<{ ok: boolean; message: string }> {
  const normalizedEmail = email.trim()
  if (!normalizedEmail) return { ok: false, message: 'Enter the admin email address first.' }
  if (!navigator.onLine) {
    return { ok: false, message: 'You are offline. Connect to the internet to request a password reset.' }
  }
  try {
    await sendPasswordResetEmail(auth, normalizedEmail)
    return {
      ok: true,
      message: 'Firebase accepted the reset request. Check this email inbox and spam folder for the link, open it, then enter and confirm a new password.',
    }
  } catch (err) {
    const code = err instanceof Error && 'code' in err ? (err as { code: string }).code : undefined
    // Keep the response generic for unknown addresses to avoid account
    // enumeration, but surface configuration and delivery failures instead
    // of falsely telling the admin that Firebase sent a message.
    switch (code) {
      case 'auth/invalid-email':
        return { ok: false, message: 'Enter a valid admin email address.' }
      case 'auth/user-not-found':
        return {
          ok: true,
          message: 'If an account exists with that email, Firebase will send a password reset link. Check the inbox and spam folder; the link opens a page to enter and confirm a new password.',
        }
      case 'auth/operation-not-allowed':
        return { ok: false, message: 'Password reset is unavailable because Email/Password sign-in is disabled. Enable it in Firebase Console > Authentication > Sign-in method.' }
      case 'auth/too-many-requests':
        return { ok: false, message: 'Firebase temporarily blocked reset requests. Wait a while, then try again.' }
      case 'auth/network-request-failed':
        return { ok: false, message: 'Firebase could not be reached. Check your internet connection and try again.' }
      case 'auth/invalid-api-key':
      case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
        return { ok: false, message: 'Firebase rejected the app API key. Check the production Firebase configuration.' }
      default:
        console.error('Admin password reset email failed:', code, err)
        return { ok: false, message: 'Firebase could not send the reset email. Check Authentication email templates and project settings, then try again.' }
    }
  }
}
