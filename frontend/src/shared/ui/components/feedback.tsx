import { useState, type CSSProperties, type ReactNode } from 'react'
import { Backdrop } from '@/shared/ui/components/backdrop'
import { BrandMark } from '@/shared/ui/components/brand'
import { BRANDS } from '@/shared/types/brands'
import { useBrand } from '@/shared/ui/hooks/use-brand'
import { cn } from '@/shared/ui/lib/utils'
import { RETRY_LABEL, STATUS_LABEL, type StatusKind } from '@/shared/types/labels'

/**
 * Pantalla de carga con la marca (al abrir la app y al iniciar sesión). Sigue el tema y el color
 * principal: la mascota entra con un rebote, la rodea un arco que gira con ondas y aparecen el
 * nombre y unos puntos de espera. Al irse, el contenido crece y se desvanece. Con «Reducir
 * animaciones» queda quieta (las reglas globales cortan las animaciones).
 */
export function Splash({ visible }: { visible: boolean }) {
  const { brand } = useBrand()
  // Cada vez que vuelve a mostrarse, la animación arranca de cero (nueva `key`).
  const [run, setRun] = useState(0)
  const [shown, setShown] = useState(visible)
  if (visible !== shown) {
    setShown(visible)
    if (visible) setRun((r) => r + 1)
  }
  return (
    <div
      aria-hidden={!visible}
      className={cn(
        'fixed inset-0 z-[90] grid place-items-center overflow-hidden bg-background text-foreground transition-[opacity,visibility] duration-300',
        visible ? 'visible opacity-100' : 'invisible opacity-0',
      )}
    >
      <div aria-hidden data-decor className="splash-glow absolute inset-0 hc:hidden" />
      <div className="splash-backdrop absolute inset-0">
        <Backdrop animated />
      </div>
      <div key={run} className={cn('relative grid justify-items-center text-center', !visible && 'splash-leave')}>
        <div className="relative grid size-32 place-items-center">
          <span aria-hidden className="splash-ripple absolute inset-4 rounded-full border-2 border-primary" />
          <span aria-hidden className="splash-ripple late absolute inset-4 rounded-full border-2 border-primary" />
          <svg
            aria-hidden
            data-decor
            className="splash-orbit absolute inset-0 size-full text-primary"
            viewBox="0 0 100 100"
          >
            <circle
              cx="50"
              cy="50"
              r="46"
              pathLength={100}
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <div className="splash-mark">
            <BrandMark size={92} />
          </div>
        </div>
        <div className="splash-rise mt-6 text-3xl font-semibold hc:font-extrabold" style={delay(0.25)}>
          {BRANDS[brand].name}
        </div>
        <div className="splash-rise mt-1 text-md text-muted-foreground" style={delay(0.35)}>
          AviPlanner · Planificación de Demanda
        </div>
        <div aria-hidden className="splash-rise mt-6 flex gap-2" style={delay(0.45)}>
          {[0, 0.15, 0.3].map((d) => (
            <i key={d} className="splash-dot block size-2 rounded-full bg-primary" style={delay(0.5 + d)} />
          ))}
        </div>
      </div>
    </div>
  )
}

const delay = (s: number) => ({ '--delay': `${s}s` }) as CSSProperties

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
    info: 'border-info-border bg-info-soft text-ink-2 [&>svg]:text-primary',
    warn: 'border-warn-border bg-warn-soft text-warn-foreground [&>svg]:text-warn',
    bad: 'border-bad-border bg-bad-soft text-foreground [&>svg]:text-bad',
    ok: 'border-ok/30 bg-ok-soft text-foreground [&>svg]:text-ok',
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
        tone === 'ok' && 'bg-ok-fill',
        tone === 'warn' && 'bg-warn-fill ring-1 ring-warn/40',
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

/**
 * Estado en bloque lleno (Confirmada en verde, Pendiente en amarillo, borrador en gris). El color
 * repite lo que dice el texto: nunca va solo. En alto contraste vuelve a punto y texto.
 */
export function StatusBadge({ kind }: { kind: StatusKind }) {
  const tone = STATUS_TONE[kind]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-sm font-semibold whitespace-nowrap',
        tone === 'ok' && 'bg-ok-fill text-ok-fill-foreground',
        tone === 'warn' && 'bg-warn-fill text-warn-fill-foreground',
        tone === 'draft' && 'bg-muted font-medium text-muted-foreground',
        'hc:bg-transparent hc:px-0 hc:text-foreground',
      )}
    >
      <StatusDot tone={tone} className="hidden hc:inline-block" />
      {STATUS_LABEL[kind]}
    </span>
  )
}
