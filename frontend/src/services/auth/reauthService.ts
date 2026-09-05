import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
import { auth } from '@/config/firebase'

export interface ReauthResult {
  ok: boolean
  message?: string
}

/**
 * Re-verifies the currently signed-in admin's password before a
 * destructive action (e.g. deleting a branch). Firebase requires this
 * for sensitive operations, and it's good practice generally - a
 * cashier or anyone else with brief access to an unlocked admin session
 * shouldn't be able to delete a branch without knowing the password.
 */
export async function reauthenticateAdmin(password: string): Promise<ReauthResult> {
  const currentUser = auth.currentUser
  if (!currentUser || !currentUser.email) {
    return { ok: false, message: 'Not signed in as admin.' }
  }
  if (!navigator.onLine) {
    return { ok: false, message: 'You are offline. This action requires an internet connection to verify your password.' }
  }
  try {
    const credential = EmailAuthProvider.credential(currentUser.email, password)
    await reauthenticateWithCredential(currentUser, credential)
    return { ok: true }
  } catch (err) {
    const code = err instanceof Error && 'code' in err ? (err as { code: string }).code : undefined
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
      return { ok: false, message: 'Incorrect password.' }
    }
    if (code === 'auth/too-many-requests') {
      return { ok: false, message: 'Too many attempts. Please wait a moment and try again.' }
    }
    console.error('Reauthentication failed:', code, err)
    return { ok: false, message: 'Could not verify your password. Please try again.' }
  }
}
