/**
 * Lightweight password hashing using the Web Crypto API (SHA-256 with a
 * static app-level pepper + per-record salt). This is used for branch
 * cashier passwords, which are simple PINs managed by the shop owner
 * rather than individual end-user accounts.
 *
 * For the admin account, Firebase Authentication (email/password) is used
 * instead, which handles secure hashing server-side.
 */

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function randomSalt(): string {
  const arr = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomSalt()
  const hash = await sha256Hex(`${salt}:${plain}`)
  return `${salt}:${hash}`
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const check = await sha256Hex(`${salt}:${plain}`)
  return check === hash
}
