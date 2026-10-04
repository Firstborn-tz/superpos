interface LoaderProps {
  size?: 'small' | 'medium' | 'large'
  label?: string
  className?: string
}

export default function Loader({ size = 'medium', label = 'Loading', className = '' }: LoaderProps) {
  return (
    <span className={`loader loader--${size} ${className}`} role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
    </span>
  )
}
