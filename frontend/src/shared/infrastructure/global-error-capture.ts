import type { ErrorReporter } from '@/shared/application/error-reporter'

/** Captura lo que React no ve: errores de scripts, promesas rechazadas sin manejar y cierre. */
export function installGlobalErrorCapture(reporter: ErrorReporter, target: Window = window) {
  const onError = (event: ErrorEvent) => {
    // Un recurso que no carga (imagen, script) llega sin `error`; se reporta como aviso.
    if (event.error) reporter.report(event.error, 'error')
    else if (event.message) reporter.report(event.message, 'error', 'warning')
  }
  const onRejection = (event: PromiseRejectionEvent) => reporter.report(event.reason, 'unhandledrejection')
  const onHide = () => reporter.flushOnExit()
  const onOnline = () => void reporter.flush()
  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onRejection)
  target.addEventListener('pagehide', onHide)
  target.addEventListener('online', onOnline)
  return () => {
    target.removeEventListener('error', onError)
    target.removeEventListener('unhandledrejection', onRejection)
    target.removeEventListener('pagehide', onHide)
    target.removeEventListener('online', onOnline)
  }
}
