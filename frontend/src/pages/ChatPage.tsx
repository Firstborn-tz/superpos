import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { useAuthStore } from '@/store/authStore'
import { useDataStore } from '@/store/dataStore'
import { subscribeToChatMessages } from '@/services/firebase/firestoreService'
import { sendChatMessage } from '@/services/chat/chatService'
import type { ChatMessage } from '@/types'
import { formatDateTime } from '@/utils/helpers'
import { ChatIcon, BranchesIcon } from '@/components/common/Icons'

export default function ChatPage() {
  const user = useAuthStore((s) => s.user)
  const branches = useDataStore((s) => s.branches)
  const isAdmin = user?.role === 'admin'

  const [activeBranchId, setActiveBranchId] = useState<string | null>(user?.branchId ?? null)

  // Admin picks a branch to chat with from the list; default to the
  // first one available so the thread isn't empty on first visit.
  useEffect(() => {
    if (isAdmin && !activeBranchId && branches.length > 0) {
      setActiveBranchId(branches[0].id)
    }
  }, [isAdmin, activeBranchId, branches])

  if (isAdmin) {
    return (
      <DashboardLayout title="Messages">
        <div className="grid md:grid-cols-[240px_1fr] gap-5 h-[calc(100vh-140px)]">
          <div className="bg-app-card rounded-card shadow-card overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-app-border flex items-center gap-2">
              <BranchesIcon width={16} height={16} className="text-app-muted" />
              <h2 className="font-bold text-sm text-app-heading">Branches</h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              {branches.length === 0 ? (
                <p className="text-center text-app-faint text-sm py-8 px-3">No branches yet</p>
              ) : (
                branches.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setActiveBranchId(b.id)}
                    className={`w-full text-left px-4 py-3 text-sm font-medium border-b border-app-border transition-colors ${
                      activeBranchId === b.id ? 'bg-primary-50 text-primary' : 'text-app-body hover:bg-app-alt'
                    }`}
                  >
                    {b.name}
                  </button>
                ))
              )}
            </div>
          </div>
          <ChatThread branchId={activeBranchId} branchName={branches.find((b) => b.id === activeBranchId)?.name} />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout title="Messages">
      <div className="h-[calc(100vh-140px)]">
        <ChatThread branchId={user?.branchId ?? null} branchName={user?.branchName} />
      </div>
    </DashboardLayout>
  )
}

function ChatThread({ branchId, branchName }: { branchId: string | null; branchName?: string }) {
  const user = useAuthStore((s) => s.user)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [pendingLocal, setPendingLocal] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!branchId) return
    setMessages([])
    const unsubscribe = subscribeToChatMessages(branchId, (msgs) => {
      setMessages(msgs)
      // Once the live subscription includes a locally-sent message, drop
      // it from the optimistic list so it isn't shown twice.
      setPendingLocal((prev) => prev.filter((p) => !msgs.some((m) => m.id === p.id)))
    })
    return unsubscribe
  }, [branchId])

  const combined = useMemo(() => {
    const all = [...messages, ...pendingLocal]
    return all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }, [messages, pendingLocal])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [combined.length])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || !branchId || !user) return
    const message = sendChatMessage(branchId, trimmed, user)
    setPendingLocal((prev) => [...prev, message])
    setText('')
  }

  if (!branchId) {
    return (
      <div className="bg-app-card rounded-card shadow-card flex items-center justify-center h-full">
        <div className="text-center text-app-faint">
          <ChatIcon width={32} height={32} className="mx-auto mb-3" />
          Select a branch to start chatting
        </div>
      </div>
    )
  }

  return (
    <div className="bg-app-card rounded-card shadow-card flex flex-col h-full overflow-hidden">
      <div className="px-5 py-3.5 border-b border-app-border">
        <h2 className="font-bold text-app-heading">{branchName ?? 'Chat'}</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {combined.length === 0 ? (
          <div className="h-full flex items-center justify-center text-app-faint text-sm">
            No messages yet. Say hello!
          </div>
        ) : (
          combined.map((m) => {
            const isMine = m.senderRole === user?.role
            return (
              <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                    isMine ? 'bg-primary text-white rounded-br-sm' : 'bg-app-alt text-app-heading rounded-bl-sm'
                  }`}
                >
                  {!isMine && <div className="text-xs font-semibold opacity-70 mb-0.5">{m.senderName}</div>}
                  <div className="text-sm whitespace-pre-wrap break-words">{m.text}</div>
                  <div className={`text-[10px] mt-1 ${isMine ? 'text-white/70' : 'text-app-faint'}`}>
                    {formatDateTime(m.createdAt)}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t border-app-border flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 px-4 py-2.5 border border-app-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="px-5 py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white rounded-lg font-semibold text-sm transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  )
}
