import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Mascot } from '@/ui/components/brand'
import { Button } from '@/ui/components/shadcn/button'

interface Props {
  children: ReactNode
  /** Recibe el error y la pila de componentes (se reporta al backend). */
  onError: (error: unknown, componentStack: string) => void
}

/** Si una pantalla se rompe, muestra un aviso en vez de dejar la app en blanco. */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    this.props.onError(error, info.componentStack ?? '')
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div
        role="alert"
        className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-6 text-center"
      >
        <Mascot size={96} />
        <div>
          <h1 className="text-lg font-bold text-foreground">Algo salió mal</h1>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Ya registramos el problema. Tus proyecciones guardadas y las pendientes de sincronizar no se pierden.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => location.reload()}>Recargar</Button>
          <Button variant="outline" onClick={() => location.assign('/')}>
            Ir al inicio
          </Button>
        </div>
      </div>
    )
  }
}
