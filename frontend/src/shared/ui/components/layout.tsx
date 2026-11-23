import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/shared/ui/lib/utils'

/** Encabezado de pantalla: en celular es fijo arriba y trae botón "Volver". */
export function PageHeader({
  title,
  subtitle,
  back = '/',
  actions,
  mobileActions,
  sticky = true,
}: {
  title: string
  subtitle?: string
  /** null: pantalla raíz, sin botón Volver. */
  back?: string | null
  actions?: ReactNode
  mobileActions?: ReactNode
  /** false: el encabezado se va con el scroll (p. ej. cuando lo fijo es una barra de filtros). */
  sticky?: boolean
}) {
  return (
    <header
      className={cn(
        'flex items-center gap-2 border-b border-border bg-background px-4 py-2.5',
        sticky && 'sticky top-0 z-20',
        'dsk:static dsk:mb-6 dsk:flex-wrap dsk:items-end dsk:gap-4 dsk:border-0 dsk:bg-transparent dsk:p-0',
      )}
    >
      {back !== null && (
        <Link
          to={back}
          aria-label="Volver"
          className="-ml-2 grid size-touch flex-none place-items-center rounded-md text-foreground hover:bg-muted dsk:hidden"
        >
          <ChevronLeft className="size-6" strokeWidth={2} />
        </Link>
      )}
      <div className="min-w-0 flex-1 dsk:flex-[1_1_auto]">
        <h1 className="title-display text-xl text-head dsk:text-3xl dark:text-foreground hc:font-extrabold hc:text-foreground">
          {title}
        </h1>
        {subtitle && <p className="text-sm text-muted-foreground dsk:mt-1 dsk:text-base">{subtitle}</p>}
      </div>
      {mobileActions && <div className="flex-none dsk:hidden">{mobileActions}</div>}
      {actions && <div className="hidden max-w-full dsk:block">{actions}</div>}
    </header>
  )
}

/** Contenido de la pantalla con los márgenes del sistema. */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-4 pt-4 dsk:p-0', className)}>{children}</div>
}

/**
 * Bloque de contenido: superficie con borde de 1 px (reglas gruesas arriba y abajo en alto
 * contraste) y un encabezado opcional separado por una regla.
 */
export function Section({
  title,
  aside,
  children,
  className,
}: {
  title?: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('panel min-w-0', className)}>
      {title && (
        <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule px-4 py-2.5 dsk:px-5">
          {/* Con poco ancho, lo de la derecha (filtros, botones) baja a otra línea: el título no se aprieta. */}
          <h2 className="min-w-48 flex-1 text-md font-bold text-head dark:text-foreground hc:text-lg hc:font-extrabold hc:text-foreground">
            {title}
          </h2>
          {aside && <div className="text-sm text-muted-foreground">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/** Franja de cifras (KPI): celdas separadas por una regla, sin iconos. */
export function KpiStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      aria-label="Resumen"
      className={cn(
        'kpi-strip grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-rule dsk:grid-cols-4 hc:rounded-none hc:border-x-0 hc:border-t-heavy hc:border-b-heavy hc:bg-foreground',
        className,
      )}
    >
      {children}
    </section>
  )
}

/** Qué mide la cifra: pinta la regla de arriba y el valor (sin iconos ni fondos de colores). */
export type KpiTone = 'primary' | 'ok' | 'warn' | 'bad' | 'kg' | 'neutral'

const KPI_TONE: Record<KpiTone, string> = {
  primary: 'before:bg-primary [&_b]:text-primary',
  ok: 'before:bg-ok-fill [&_b]:text-ok',
  warn: 'before:bg-warn-fill [&_b]:text-warn',
  bad: 'before:bg-bad-fill [&_b]:text-bad',
  kg: 'before:bg-chart-2 [&_b]:text-chart-2',
  neutral: 'before:bg-head dark:before:bg-border-strong',
}

/** Una cifra de la franja: etiqueta, valor y una nota opcional. `extra` va a la derecha (p. ej. un anillo). */
export function Kpi({
  label,
  value,
  foot,
  extra,
  tone = 'neutral',
}: {
  label: string
  value: ReactNode
  foot?: ReactNode
  extra?: ReactNode
  tone?: KpiTone
}) {
  return (
    <div
      className={cn(
        'relative flex min-w-0 items-start gap-3 bg-surface px-4 pt-4 pb-3.5 before:absolute before:inset-x-0 before:top-0 before:h-1 dsk:px-5 dsk:pt-5 dsk:pb-4 hc:before:hidden hc:[&_b]:text-foreground',
        KPI_TONE[tone],
      )}
    >
      <div className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink-2 hc:text-sm hc:font-semibold hc:text-foreground">
          {label}
        </span>
        <b className="num title-display mt-1 block text-2xl leading-tight whitespace-nowrap dsk:text-3xl hc:font-extrabold">
          {value}
        </b>
        {foot && (
          <small className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {foot}
          </small>
        )}
      </div>
      {/* En celular la cifra basta: el gráfico chico solo apretaría la etiqueta. */}
      {extra && <div className="hidden flex-none dsk:block">{extra}</div>}
    </div>
  )
}

/** Botones de pie: fijos abajo en celular. */
export function FooterActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex items-center gap-3 border-t border-border bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dsk:static dsk:mx-0 dsk:justify-end dsk:border-0 dsk:bg-transparent dsk:p-0 hc:border-t-heavy hc:border-foreground">
      {children}
    </div>
  )
}
