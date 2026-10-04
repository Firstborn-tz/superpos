import type { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: string
  icon: ReactNode
  accent?: 'primary' | 'secondary' | 'warning' | 'danger'
  subtext?: string
}

const ACCENTS: Record<string, string> = {
  primary: 'bg-primary-50 text-primary',
  secondary: 'bg-blue-50 text-secondary',
  warning: 'bg-amber-50 text-warning',
  danger: 'bg-red-50 text-danger',
}

export default function StatCard({ label, value, icon, accent = 'primary', subtext }: StatCardProps) {
  return (
    <div className="bg-app-card rounded-card shadow-card p-4 md:p-5 flex flex-col items-start gap-2 sm:flex-row sm:gap-4">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${ACCENTS[accent]}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-xs md:text-sm text-app-muted font-medium">{label}</div>
        <div className="text-base sm:text-lg md:text-2xl font-bold leading-tight text-app-heading tabular-nums [overflow-wrap:anywhere]">{value}</div>
        {subtext && <div className="text-xs text-app-faint mt-0.5">{subtext}</div>}
      </div>
    </div>
  )
}
