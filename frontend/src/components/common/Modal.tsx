import type { ReactNode } from 'react'
import { CloseIcon } from '@/components/common/Icons'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  maxWidth?: string
}

export default function Modal({ open, onClose, title, children, maxWidth = 'max-w-md' }: ModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className={`relative bg-app-card rounded-card shadow-xl w-full ${maxWidth} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-app-border sticky top-0 bg-app-card z-10">
          <h2 className="text-lg font-bold text-app-heading">{title}</h2>
          <button onClick={onClose} className="p-1 text-app-faint hover:text-app-body rounded-lg" aria-label="Close">
            <CloseIcon width={20} height={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
