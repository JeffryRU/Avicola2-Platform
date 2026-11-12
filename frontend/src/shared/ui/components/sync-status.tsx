import { Loader2, RefreshCw, WifiOff } from 'lucide-react'
import { cn } from '@/shared/ui/lib/utils'

/** Estado de una consulta, en lo mínimo que hace falta para avisar. */
export interface SyncQuery {
  isFetching: boolean
  isError: boolean
  error?: Error | null
  refetch: () => unknown
}

/**
 * Aviso discreto de carga: un spinner mientras llegan los datos y, si el servidor no responde,
 * que se muestra la pantalla sin datos y se reintenta sola. La pantalla se dibuja igual.
 */
export function SyncStatus({ queries, className }: { queries: SyncQuery[]; className?: string }) {
  const failed = queries.some((q) => q.isError)
  const detail = queries.find((q) => q.isError)?.error?.message
  const loading = queries.some((q) => q.isFetching)
  if (!failed && !loading) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'mb-3 flex items-center gap-2 rounded-[12px] px-3 py-2 text-[13px] font-semibold',
        failed ? 'bg-warn-soft text-warn' : 'text-muted-foreground',
        className,
      )}
    >
      {failed ? <WifiOff className="size-4 flex-none" /> : <Loader2 className="size-4 flex-none animate-spin" />}
      <span className="min-w-0 flex-1">
        {failed
          ? 'No se pudieron traer los datos del servidor. Se muestra la pantalla sin datos y se reintenta sola.'
          : 'Cargando datos…'}
        {failed && detail && <small className="block font-normal opacity-80">{detail}</small>}
      </span>
      {failed && (
        <button
          type="button"
          onClick={() => queries.forEach((q) => void q.refetch())}
          className="inline-flex flex-none items-center gap-1 rounded-[8px] px-2 py-1 font-bold hover:bg-white/60"
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Reintentar
        </button>
      )}
    </div>
  )
}
