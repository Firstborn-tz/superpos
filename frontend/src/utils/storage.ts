export const STORAGE_KEYS = {
  AUTH: 'superpos_auth',
  INVENTORY: 'superpos_inventory',
  SALES: 'superpos_sales',
  BRANCHES: 'superpos_branches',
  PENDING_OPERATIONS: 'superpos_pending_operations',
  SETTINGS: 'superpos_settings',
} as const

export const STORAGE_KEYS_EXTRA = {
  HELD_SALES: 'superpos_held_sales',
} as const

export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    // Storage quota exceeded or disabled - fail silently, app still works in-memory
    console.error(`Failed to persist ${key} to localStorage`, err)
  }
}

export function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* noop */
  }
}
