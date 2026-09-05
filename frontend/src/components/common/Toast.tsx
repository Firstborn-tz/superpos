import { useToastStore } from '@/store/toastStore'
import { CheckIcon, WarningIcon, CloseIcon } from '@/components/common/Icons'

const STYLES: Record<string, string> = {
  success: 'bg-primary text-white',
  error: 'bg-danger text-white',
  info: 'bg-gray-800 text-white',
}

export default function ToastContainer() {
  const { toasts, dismiss } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-2 rounded-lg shadow-lg px-4 py-3 text-sm font-medium ${STYLES[t.type]}`}
        >
          {t.type === 'success' && <CheckIcon width={16} height={16} className="mt-0.5 shrink-0" />}
          {t.type === 'error' && <WarningIcon width={16} height={16} className="mt-0.5 shrink-0" />}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="shrink-0 opacity-70 hover:opacity-100" aria-label="Dismiss">
            <CloseIcon width={14} height={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
