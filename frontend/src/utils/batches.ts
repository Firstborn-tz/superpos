import type { InventoryItem, StockBatch } from '@/types'
import { generateId, isExpired, isExpiringSoon } from '@/utils/helpers'

export function sortBatchesByExpiry(batches: StockBatch[]): StockBatch[] {
  return [...batches].sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())
}

/**
 * Returns this product's batches, lazily migrating a legacy (pre-batch)
 * record into a single synthetic batch built from its flat
 * currentStock/buyingPrice/expiryDate fields. This means older products
 * created before FEFO tracking was added keep working with no manual
 * data migration - the first time stock is touched, they're upgraded.
 */
export function ensureBatches(item: InventoryItem): StockBatch[] {
  if (item.batches && item.batches.length > 0) return item.batches
  if (item.currentStock <= 0) return []
  return [
    {
      id: generateId('batch'),
      quantity: item.currentStock,
      buyingPrice: item.buyingPrice,
      expiryDate: item.expiryDate,
      batchNumber: item.batchNumber,
      receivedAt: item.createdAt,
    },
  ]
}

export function getTotalQuantity(batches: StockBatch[]): number {
  return batches.reduce((sum, b) => sum + Math.max(0, b.quantity), 0)
}

function getSellableTotalQuantity(batches: StockBatch[]): number {
  return batches.reduce((sum, b) => (isExpired(b.expiryDate) ? sum : sum + Math.max(0, b.quantity)), 0)
}

function getWeightedAvgBuyingPrice(batches: StockBatch[]): number {
  const sellable = batches.filter((b) => !isExpired(b.expiryDate) && b.quantity > 0)
  const total = getTotalQuantity(sellable)
  if (total <= 0) return 0
  return sellable.reduce((sum, b) => sum + b.quantity * b.buyingPrice, 0) / total
}

function getSoonestSellableExpiry(batches: StockBatch[]): string | null {
  const sellable = batches.filter((b) => b.quantity > 0 && !isExpired(b.expiryDate))
  if (sellable.length === 0) return null
  return sortBatchesByExpiry(sellable)[0].expiryDate
}

/**
 * Recomputes the summary fields (currentStock, buyingPrice, expiryDate,
 * hasExpiredBatches, expiredQuantity) from the batches array. Call this
 * after any batch mutation (add stock, sell, adjust, refund-restock) to
 * keep the legacy flat fields in sync with the real batch data.
 */
export function recomputeSummary(item: InventoryItem, batches: StockBatch[]): InventoryItem {
  const sellableStock = getSellableTotalQuantity(batches)
  const expiredQuantity = batches.reduce(
    (sum, b) => (isExpired(b.expiryDate) ? sum + Math.max(0, b.quantity) : sum),
    0,
  )
  const soonest = getSoonestSellableExpiry(batches)
  const avgPrice = getWeightedAvgBuyingPrice(batches)

  return {
    ...item,
    batches,
    currentStock: sellableStock,
    buyingPrice: avgPrice || item.buyingPrice,
    expiryDate: soonest ?? item.expiryDate,
    hasExpiredBatches: expiredQuantity > 0,
    expiredQuantity,
  }
}

/** Adds a new delivery as its own batch (used by "Add Stock"). */
export function addBatch(
  item: InventoryItem,
  newBatch: { quantity: number; buyingPrice: number; expiryDate: string; batchNumber: string },
): InventoryItem {
  const existing = ensureBatches(item)
  const batch: StockBatch = { ...newBatch, id: generateId('batch'), receivedAt: new Date().toISOString() }
  const batches = [...existing, batch]
  const updated = recomputeSummary(item, batches)
  return { ...updated, initialStock: item.initialStock + newBatch.quantity }
}

export interface FEFOConsumption {
  updatedItem: InventoryItem
  totalCost: number
  quantityConsumed: number
  shortfall: number
}

/**
 * Deducts `quantityToConsume` units from this product's batches,
 * oldest-expiring-first, skipping any already-expired batches (those
 * aren't sellable). Returns the actual cost of what was consumed - this
 * is the real FEFO cost, which may differ from a simple average if the
 * batches being sold from have different buying prices.
 */
export function consumeFEFO(item: InventoryItem, quantityToConsume: number): FEFOConsumption {
  const batches = sortBatchesByExpiry(ensureBatches(item)).map((b) => ({ ...b }))
  let remaining = quantityToConsume
  let totalCost = 0

  for (const batch of batches) {
    if (remaining <= 0) break
    if (isExpired(batch.expiryDate)) continue
    const take = Math.min(batch.quantity, remaining)
    if (take <= 0) continue
    batch.quantity -= take
    totalCost += take * batch.buyingPrice
    remaining -= take
  }

  const updatedItem = recomputeSummary(item, batches)
  return {
    updatedItem,
    totalCost,
    quantityConsumed: quantityToConsume - remaining,
    shortfall: remaining,
  }
}

/**
 * Restocks a returned/refunded quantity as its own new batch, dated
 * today. Since a sale doesn't currently track which specific batch each
 * unit was consumed from, the restocked batch reuses the product's
 * current soonest sellable expiry (or falls back to 30 days out if none
 * exists) as a reasonable approximation rather than exact provenance.
 */
export function restockAsBatch(item: InventoryItem, quantity: number, unitBuyingPrice: number): InventoryItem {
  const existing = ensureBatches(item)
  const fallbackExpiry = new Date()
  fallbackExpiry.setDate(fallbackExpiry.getDate() + 30)
  const expiryDate = getSoonestSellableExpiry(existing) ?? fallbackExpiry.toISOString().slice(0, 10)

  return addBatch(item, {
    quantity,
    buyingPrice: unitBuyingPrice,
    expiryDate,
    batchNumber: `RETURN-${new Date().toISOString().slice(0, 10)}`,
  })
}

export interface BatchStatusCounts {
  inStock: number
  expiringSoon: number
  expired: number
}

/** Breaks batch quantities into in-stock / expiring-soon / expired counts, for the product detail view. */
export function getBatchStatusCounts(batches: StockBatch[]): BatchStatusCounts {
  let inStock = 0
  let expiringSoon = 0
  let expired = 0
  for (const b of batches) {
    if (b.quantity <= 0) continue
    if (isExpired(b.expiryDate)) expired += b.quantity
    else if (isExpiringSoon(b.expiryDate)) expiringSoon += b.quantity
    else inStock += b.quantity
  }
  return { inStock, expiringSoon, expired }
}

/**
 * Applies a manual stock adjustment (write-off or correction) while
 * keeping the batches array consistent with the resulting summary.
 *
 * - Decrease (write-off, e.g. damage/theft/spoilage): deducts from
 *   already-expired batches first (since a write-off is most often
 *   clearing out spoiled/expired stock), then falls through to
 *   FEFO order among non-expired batches if the quantity exceeds what
 *   was expired.
 * - Increase (stock-take correction upward): added as a new batch,
 *   reusing the product's current soonest sellable expiry as a
 *   reasonable default since a correction isn't a new delivery with its
 *   own known expiry.
 */
export function adjustBatchQuantity(item: InventoryItem, quantityChange: number): InventoryItem {
  const batches = ensureBatches(item).map((b) => ({ ...b }))

  if (quantityChange > 0) {
    const fallbackExpiry = new Date()
    fallbackExpiry.setDate(fallbackExpiry.getDate() + 30)
    const expiryDate = getSoonestSellableExpiry(batches) ?? fallbackExpiry.toISOString().slice(0, 10)
    return addBatch(item, {
      quantity: quantityChange,
      buyingPrice: item.buyingPrice,
      expiryDate,
      batchNumber: `ADJ-${new Date().toISOString().slice(0, 10)}`,
    })
  }

  let remaining = Math.abs(quantityChange)
  const expiredFirst = [...batches].sort((a, b) => {
    const aExpired = isExpired(a.expiryDate) ? 0 : 1
    const bExpired = isExpired(b.expiryDate) ? 0 : 1
    if (aExpired !== bExpired) return aExpired - bExpired
    return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
  })

  for (const batch of expiredFirst) {
    if (remaining <= 0) break
    const take = Math.min(batch.quantity, remaining)
    batch.quantity -= take
    remaining -= take
  }

  const updated = recomputeSummary(item, batches)
  return { ...updated, initialStock: Math.max(0, item.initialStock + quantityChange) }
}
