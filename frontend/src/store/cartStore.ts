import { create } from 'zustand'
import type { CartItem, InventoryItem } from '@/types'
import { generateId } from '@/utils/helpers'

function computeLineTotal(unitPrice: number, quantity: number, discountPercent = 0): number {
  const gross = unitPrice * quantity
  return Math.max(0, gross - gross * (discountPercent / 100))
}

interface CartState {
  items: CartItem[]
  addItem: (product: InventoryItem, quantity?: number) => { ok: boolean; message?: string }
  removeItem: (inventoryId: string) => void
  updateQuantity: (inventoryId: string, quantity: number) => { ok: boolean; message?: string }
  setItemDiscount: (inventoryId: string, discountPercent: number) => void
  loadItems: (items: CartItem[]) => void
  clearCart: () => void
  getSubtotal: () => number
  getDiscountAmount: () => number
  getTotal: () => number
  getProfit: () => number
  getItemCount: () => number
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  addItem: (product, quantity = 1) => {
    if (product.currentStock <= 0) {
      return { ok: false, message: `${product.productName} is out of stock` }
    }
    const items = get().items
    const existing = items.find((i) => i.inventoryId === product.id)
    const desiredQty = (existing?.quantity ?? 0) + quantity

    if (desiredQty > product.currentStock) {
      return { ok: false, message: `Only ${product.currentStock} unit(s) of ${product.productName} available` }
    }

    if (existing) {
      set({
        items: items.map((i) =>
          i.inventoryId === product.id
            ? { ...i, quantity: desiredQty, totalPrice: computeLineTotal(i.unitPrice, desiredQty, i.discountPercent) }
            : i,
        ),
      })
    } else {
      const newItem: CartItem = {
        id: generateId('cartitem'),
        inventoryId: product.id,
        barcode: product.barcode,
        productName: product.productName,
        unitPrice: product.sellingPrice,
        buyingPrice: product.buyingPrice,
        quantity,
        totalPrice: computeLineTotal(product.sellingPrice, quantity),
        availableStock: product.currentStock,
        discountPercent: 0,
      }
      set({ items: [...items, newItem] })
    }
    return { ok: true }
  },

  removeItem: (inventoryId) => {
    set({ items: get().items.filter((i) => i.inventoryId !== inventoryId) })
  },

  updateQuantity: (inventoryId, quantity) => {
    const items = get().items
    const item = items.find((i) => i.inventoryId === inventoryId)
    if (!item) return { ok: false, message: 'Item not found in cart' }
    if (quantity <= 0) {
      set({ items: items.filter((i) => i.inventoryId !== inventoryId) })
      return { ok: true }
    }
    if (quantity > item.availableStock) {
      return { ok: false, message: `Only ${item.availableStock} unit(s) of ${item.productName} available` }
    }
    set({
      items: items.map((i) =>
        i.inventoryId === inventoryId
          ? { ...i, quantity, totalPrice: computeLineTotal(i.unitPrice, quantity, i.discountPercent) }
          : i,
      ),
    })
    return { ok: true }
  },

  setItemDiscount: (inventoryId, discountPercent) => {
    const clamped = Math.max(0, Math.min(100, discountPercent))
    set({
      items: get().items.map((i) =>
        i.inventoryId === inventoryId
          ? { ...i, discountPercent: clamped, totalPrice: computeLineTotal(i.unitPrice, i.quantity, clamped) }
          : i,
      ),
    })
  },

  loadItems: (items) => set({ items }),

  clearCart: () => set({ items: [] }),

  getSubtotal: () => get().items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),

  getDiscountAmount: () => get().getSubtotal() - get().getTotal(),

  getTotal: () => get().items.reduce((sum, i) => sum + i.totalPrice, 0),

  getProfit: () =>
    get().items.reduce((sum, i) => {
      const perUnitDiscount = i.unitPrice * ((i.discountPercent ?? 0) / 100)
      return sum + (i.unitPrice - perUnitDiscount - i.buyingPrice) * i.quantity
    }, 0),

  getItemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
}))
