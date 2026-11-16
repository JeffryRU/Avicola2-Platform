import type { CSSProperties, ReactNode } from 'react'
import { BrandMark } from '@/shared/ui/components/brand'
import { BRANDS } from '@/shared/types/brands'
import { useBrand } from '@/shared/ui/hooks/use-brand'
import { cn } from '@/shared/ui/lib/utils'
import { RETRY_LABEL, STATUS_LABEL, type StatusKind } from '@/shared/types/labels'

/** Pantalla de carga con la marca (al abrir la app y al iniciar sesión). */
export function Splash({ visible, durationS = 2.2 }: { visible: boolean; durationS?: number }) {
  const { brand } = useBrand()
  return (
    <div
      aria-hidden={!visible}
      className={cn(
        'fixed inset-0 z-[90] grid place-items-center bg-head text-head-foreground transition-[opacity,visibility] duration-300',
        visible ? 'visible opacity-100' : 'invisible opacity-0',
      )}
    >
      <div className="grid justify-items-center gap-1 text-center">
        <BrandMark size={88} onDark />
        <div className="mt-4 text-3xl font-semibold hc:font-extrabold">{BRANDS[brand].name}</div>
        <div className="text-md text-head-muted">AviPlanner · Planificación de Demanda</div>
        <div className="mt-6 h-0.5 w-40 overflow-hidden bg-head-muted/30">
          {visible && (
            <i
              className="splash-bar block h-full w-full bg-brand-accent"
              style={{ '--dur': `${durationS}s` } as CSSProperties}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/** Capa de espera con la mascota ("Enviando proyección"). */
export function LoadingOverlay({ label }: { label: string | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed inset-0 z-[70] grid place-items-center bg-background/95 transition-opacity',
        label ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <div className="grid justify-items-center gap-3 font-medium text-ink-2">
        {label && <BrandMark size={72} animated shadow />}
        <span>{label}</span>
      </div>
    </div>
  )
}

/** Aviso en bloque: borde y fondo suave según el tono; el ícono es pequeño y del color del tono. */
export function Note({
  tone = 'info',
  icon,
  children,
  className,
}: {
  tone?: 'info' | 'warn' | 'bad' | 'ok'
  icon: ReactNode
  children: ReactNode
  className?: string
}) {
  const tones = {
    info: 'border-border bg-surface text-ink-2 [&>svg]:text-primary',
    warn: 'border-warn-border bg-warn-soft text-warn-foreground [&>svg]:text-warn',
    bad: 'border-bad-border bg-bad-soft text-foreground [&>svg]:text-bad',
    ok: 'border-border bg-ok-soft text-foreground [&>svg]:text-ok',
  }
  return (
    <div
      role={tone === 'bad' ? 'alert' : undefined}
      className={cn(
        'flex items-start gap-3 rounded-md border p-4 [overflow-wrap:anywhere] [&_b]:font-semibold [&_b]:text-foreground hc:[&_b]:font-extrabold [&>svg]:mt-0.5 [&>svg]:size-4.5 [&>svg]:flex-none',
        tones[tone],
        className,
      )}
    >
      {icon}
      {/* El texto ocupa el resto: el ícono nunca queda solo en otra línea. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-3">{children}</div>
    </div>
  )
}

/** Estado vacío: qué pasa y, si hace falta, qué hacer. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-4 py-8 text-center text-muted-foreground">
      <b className="mb-1 block text-md font-semibold text-foreground">{title}</b>
      {children}
    </div>
  )
}

/** Error al cargar: dice qué falló, con el detalle técnico pequeño y un «Reintentar». */
export function ErrorState({ title, detail, onRetry }: { title: string; detail?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="grid justify-items-center gap-1 px-4 py-8 text-center">
      <b className="text-md font-semibold text-bad">{title}</b>
      <span className="text-sm text-muted-foreground">Revisa tu conexión e inténtalo de nuevo.</span>
      {detail && <small className="text-xs text-muted-foreground">{detail}</small>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 min-h-touch px-3 font-medium text-primary underline-offset-4 hover:underline dsk:min-h-8"
        >
          {RETRY_LABEL}
        </button>
      )}
    </div>
  )
}

/** Punto de estado: lleno (hecho), hueco (falta), gris (borrador/local) o rojo (rechazado, error). */
export function StatusDot({ tone, className }: { tone: 'ok' | 'warn' | 'draft' | 'bad'; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-2 flex-none rounded-full',
        tone === 'ok' && 'bg-ok',
        tone === 'warn' && 'border-[1.5px] border-warn',
        tone === 'draft' && 'bg-draft',
        tone === 'bad' && 'bg-bad',
        className,
      )}
    />
  )
}

const STATUS_TONE: Record<StatusKind, 'ok' | 'warn' | 'draft'> = {
  confirmed: 'ok',
  synced: 'ok',
  pending: 'warn',
  queued: 'warn',
  local: 'draft',
}

/** Estado con punto y texto (Confirmada, Pendiente, Sincronizada...). Sin pastillas de color. */
export function StatusBadge({ kind }: { kind: StatusKind }) {
  const tone = STATUS_TONE[kind]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-sm whitespace-nowrap',
        tone === 'ok' && 'text-foreground',
        tone === 'warn' && 'font-medium text-warn hc:font-bold',
        tone === 'draft' && 'text-muted-foreground',
      )}
    >
      <StatusDot tone={tone} />
      {STATUS_LABEL[kind]}
    </span>
  )
}
