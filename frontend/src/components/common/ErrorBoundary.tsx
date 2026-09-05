import { Component, type ReactNode } from 'react'
import { WarningIcon } from '@/components/common/Icons'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  message: string
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, message: error instanceof Error ? error.message : 'Something went wrong' }
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error('SuperPOS crashed:', error, info)
  }

  handleReload = () => {
    this.setState({ hasError: false, message: '' })
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface flex items-center justify-center p-4">
          <div className="bg-app-card rounded-card shadow-card p-8 max-w-md text-center">
            <div className="w-14 h-14 rounded-full bg-red-50 text-danger flex items-center justify-center mx-auto mb-4">
              <WarningIcon width={28} height={28} />
            </div>
            <h1 className="text-lg font-bold text-app-heading mb-2">Something went wrong</h1>
            <p className="text-sm text-app-muted mb-6">
              SuperPOS ran into an unexpected error. Your sales and inventory data is safe on this device.
            </p>
            <button
              onClick={this.handleReload}
              className="bg-primary hover:bg-primary-dark text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
            >
              Reload App
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
