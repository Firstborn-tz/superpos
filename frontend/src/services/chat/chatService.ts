import type { ChatMessage, User } from '@/types'
import { generateId } from '@/utils/helpers'
import { syncService } from '@/services/sync/syncService'

export function sendChatMessage(branchId: string, text: string, sender: User): ChatMessage {
  const message: ChatMessage = {
    id: generateId('msg'),
    branchId,
    senderRole: sender.role,
    senderName: sender.fullName ?? (sender.role === 'admin' ? 'Admin' : 'Cashier'),
    text: text.trim(),
    createdAt: new Date().toISOString(),
  }
  syncService.addPendingOperation('CHAT_MESSAGE', message)
  return message
}
