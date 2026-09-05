import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import { auth, db } from '@/config/firebase'
import type { ActivityLogEntry, Branch, ChatMessage, InventoryItem, PublicBranch, RefundRecord, SaleRecord, StockAdjustmentRecord } from '@/types'

export const COLLECTIONS = {
  BRANCHES: 'branches',
  PUBLIC_BRANCHES: 'public_branches',
  INVENTORY: 'inventory',
  SALES: 'sales',
  REFUNDS: 'refunds',
  STOCK_ADJUSTMENTS: 'stock_adjustments',
  ACTIVITY_LOG: 'activity_log',
  CHAT_MESSAGES: 'chat_messages',
  ADMINS: 'admins',
  SETTINGS: 'settings',
} as const

export async function pullAllFromFirestore(): Promise<{
  inventory: InventoryItem[]
  sales: SaleRecord[]
  branches: Branch[]
  refunds: RefundRecord[]
  stockAdjustments: StockAdjustmentRecord[]
  activityLog: ActivityLogEntry[]
}> {
  const [invSnap, salesSnap, branchSnap, refundSnap, adjSnap, logSnap] = await Promise.all([
    getDocs(query(collection(db, COLLECTIONS.INVENTORY), orderBy('createdAt', 'desc'))),
    getDocs(query(collection(db, COLLECTIONS.SALES), orderBy('createdAt', 'desc'))),
    getDocs(query(collection(db, COLLECTIONS.BRANCHES), orderBy('createdAt', 'desc'))),
    getDocs(query(collection(db, COLLECTIONS.REFUNDS), orderBy('createdAt', 'desc'))),
    getDocs(query(collection(db, COLLECTIONS.STOCK_ADJUSTMENTS), orderBy('createdAt', 'desc'))),
    getDocs(query(collection(db, COLLECTIONS.ACTIVITY_LOG), orderBy('createdAt', 'desc'), limit(500))),
  ])

  return {
    inventory: invSnap.docs.map((d) => d.data() as InventoryItem),
    sales: salesSnap.docs.map((d) => d.data() as SaleRecord),
    branches: branchSnap.docs.map((d) => d.data() as Branch),
    refunds: refundSnap.docs.map((d) => d.data() as RefundRecord),
    stockAdjustments: adjSnap.docs.map((d) => d.data() as StockAdjustmentRecord),
    activityLog: logSnap.docs.map((d) => d.data() as ActivityLogEntry),
  }
}

/** Data that may safely be refreshed before a cashier is Firebase-authenticated. */
export async function pullPublicOperationalData(): Promise<Pick<Awaited<ReturnType<typeof pullAllFromFirestore>>, 'inventory' | 'branches'>> {
  const [invSnap, branchSnap] = await Promise.all([
    getDocs(query(collection(db, COLLECTIONS.INVENTORY), orderBy('createdAt', 'desc'))),
    getDocs(query(collection(db, COLLECTIONS.BRANCHES), orderBy('createdAt', 'desc'))),
  ])

  return {
    inventory: invSnap.docs.map((d) => d.data() as InventoryItem),
    branches: branchSnap.docs.map((d) => d.data() as Branch),
  }
}

export async function pushInventoryItem(item: InventoryItem): Promise<void> {
  await setDoc(doc(db, COLLECTIONS.INVENTORY, item.id), item, { merge: true })
}

/**
 * Fetches the separate, credential-free collection used by the public
 * landing page. Never expose records from the private branches collection.
 */
export async function pullPublicBranches(): Promise<PublicBranch[]> {
  const snap = await getDocs(query(collection(db, COLLECTIONS.PUBLIC_BRANCHES), orderBy('createdAt', 'desc')))
  return snap.docs.map((d) => d.data() as PublicBranch)
}

export async function pushSaleRecord(sale: SaleRecord): Promise<void> {
  await setDoc(doc(db, COLLECTIONS.SALES, sale.id), sale, { merge: true })
}

export async function pushBranch(branch: Branch): Promise<void> {
  const { password, ...publicBranch } = branch
  void password
  const branchWrite = setDoc(doc(db, COLLECTIONS.BRANCHES, branch.id), branch, { merge: true })

  // Cashiers may change only their branch password under the current rules;
  // the public projection deliberately does not contain that field.
  if (!auth.currentUser) {
    await branchWrite
    return
  }

  await Promise.all([branchWrite, setDoc(doc(db, COLLECTIONS.PUBLIC_BRANCHES, branch.id), publicBranch, { merge: true })])
}

export async function deleteBranchRemote(branchId: string): Promise<void> {
  await Promise.all([
    deleteDoc(doc(db, COLLECTIONS.BRANCHES, branchId)),
    deleteDoc(doc(db, COLLECTIONS.PUBLIC_BRANCHES, branchId)),
  ])
}

export async function pushRefundRecord(refund: RefundRecord): Promise<void> {
  await setDoc(doc(db, COLLECTIONS.REFUNDS, refund.id), refund, { merge: true })
}

export async function pushStockAdjustment(adjustment: StockAdjustmentRecord): Promise<void> {
  await setDoc(doc(db, COLLECTIONS.STOCK_ADJUSTMENTS, adjustment.id), adjustment, { merge: true })
}

export async function pushActivityLogEntry(entry: ActivityLogEntry): Promise<void> {
  await setDoc(doc(db, COLLECTIONS.ACTIVITY_LOG, entry.id), entry, { merge: true })
}

export async function pushChatMessage(message: ChatMessage): Promise<void> {
  await setDoc(doc(db, COLLECTIONS.CHAT_MESSAGES, message.id), message, { merge: true })
}

/**
 * Live-subscribes to a branch's chat thread, newest last. Unlike the
 * rest of the app (which syncs on an interval), chat needs messages to
 * appear instantly for both sides of the conversation, so this uses
 * Firestore's onSnapshot listener directly rather than the polling
 * sync pattern used elsewhere. Returns an unsubscribe function - call
 * it when the chat view unmounts to stop listening.
 */
export function subscribeToChatMessages(branchId: string, onMessages: (messages: ChatMessage[]) => void): Unsubscribe {
  const q = query(collection(db, COLLECTIONS.CHAT_MESSAGES), where('branchId', '==', branchId), orderBy('createdAt', 'asc'))
  return onSnapshot(
    q,
    (snap) => {
      onMessages(snap.docs.map((d) => d.data() as ChatMessage))
    },
    (err) => {
      console.error('Chat subscription error:', err)
    },
  )
}
