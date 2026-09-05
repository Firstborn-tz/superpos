import { create } from 'zustand'
import type { CartItem, HeldSale } from '@/types'
import { generateId } from '@/utils/helpers'
import { STORAGE_KEYS_EXTRA, readStorage, writeStorage } from '@/utils/storage'

interface HeldSalesState {
  held: HeldSale[]
  hold: (items: CartItem[], label?: string) => void
  resume: (id: string) => CartItem[] | null
  discard: (id: string) => void
}

export const useHeldSalesStore = create<HeldSalesState>((set, get) => ({
  held: readStorage<HeldSale[]>(STORAGE_KEYS_EXTRA.HELD_SALES, []),

  hold: (items, label) => {
    if (items.length === 0) return
    const entry: HeldSale = {
      id: generateId('hold'),
      label: label?.trim() || `Parked sale #${get().held.length + 1}`,
      items,
      heldAt: new Date().toISOString(),
    }
    const next = [...get().held, entry]
    set({ held: next })
    writeStorage(STORAGE_KEYS_EXTRA.HELD_SALES, next)
  },

  resume: (id) => {
    const entry = get().held.find((h) => h.id === id)
    if (!entry) return null
    const next = get().held.filter((h) => h.id !== id)
    set({ held: next })
    writeStorage(STORAGE_KEYS_EXTRA.HELD_SALES, next)
    return entry.items
  },

  discard: (id) => {
    const next = get().held.filter((h) => h.id !== id)
    set({ held: next })
    writeStorage(STORAGE_KEYS_EXTRA.HELD_SALES, next)
  },
}))
