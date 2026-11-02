import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/ui/lib/utils'

/** Encabezado de pantalla: en celular es fijo arriba y trae botón "Volver". */
export function PageHeader({
  title,
  subtitle,
  back = '/',
  actions,
  mobileActions,
}: {
  title: string
  subtitle?: string
  back?: string
  actions?: ReactNode
  mobileActions?: ReactNode
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2.5 bg-background/95 px-4 pt-3.5 pb-3 backdrop-blur-md dsk:static dsk:mb-[22px] dsk:flex-wrap dsk:items-end dsk:gap-4 dsk:bg-transparent dsk:p-0 dsk:backdrop-blur-none">
      <Link
        to={back}
        aria-label="Volver"
        className="-ml-2 grid size-[38px] place-items-center rounded-[10px] text-primary dsk:hidden"
      >
        <ChevronLeft className="size-6" strokeWidth={2.4} />
      </Link>
      <div className="min-w-0 flex-1">
        <h1 className="text-[22px] font-extrabold tracking-[-0.02em] dsk:text-[34px] dsk:tracking-[-0.035em]">
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-2 dsk:mt-1.5 dsk:text-base">{subtitle}</p>}
      </div>
      {mobileActions && <div className="dsk:hidden">{mobileActions}</div>}
      {actions && <div className="hidden dsk:block">{actions}</div>}
    </header>
  )
}

/** Contenido de la pantalla con los márgenes del mockup. */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-4 pt-3 dsk:p-0', className)}>{children}</div>
}

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
    <section className={cn('min-w-0 rounded-[18px] bg-card shadow-card', className)}>
      {title && (
        <div className="flex flex-wrap items-center gap-3 px-4 pt-4 pb-1.5 dsk:px-5 dsk:pt-[18px] dsk:pb-2">
          <h2 className="min-w-0 flex-1 text-[17px] font-extrabold dsk:text-[19px]">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  )
}

/** Tarjeta de indicador (KPI) con ícono de color. */
export function Kpi({
  icon,
  tone,
  label,
  value,
  foot,
  extra,
  index = 0,
}: {
  icon?: ReactNode
  tone?: string
  label: string
  value: ReactNode
  foot?: ReactNode
  extra?: ReactNode
  index?: number
}) {
  return (
    <div
      className="relative flex animate-rise flex-wrap items-start gap-2.5 rounded-[18px] bg-card p-3.5 shadow-card dsk:min-h-[118px] dsk:flex-nowrap dsk:items-center dsk:gap-4 dsk:p-5"
      style={{ animationDelay: `${index * 0.06}s` }}
    >
      {!extra && icon && (
        <div
          className={cn(
            'grid size-10 flex-none place-items-center rounded-xl dsk:size-[58px] dsk:rounded-2xl [&>svg]:size-5 dsk:[&>svg]:size-7',
            tone,
          )}
        >
          {icon}
        </div>
      )}
      <div className={cn('min-w-0 flex-1', extra && 'pr-[58px] dsk:pr-0')}>
        <span className="block text-[14.5px] font-semibold text-ink-2">{label}</span>
        <b className="mt-0.5 block text-[21px] font-extrabold tracking-[-0.03em] whitespace-nowrap dsk:text-[28px]">
          {value}
        </b>
        {foot && (
          <small className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">{foot}</small>
        )}
      </div>
      {extra && <div className="absolute top-2.5 right-2.5 dsk:static dsk:ml-auto">{extra}</div>}
    </div>
  )
}

/** Tabla con el estilo del mockup (cabecera celeste, fila total). */
export const tableCls = {
  table: 'w-full border-separate border-spacing-0 text-sm',
  th: 'bg-secondary px-3 py-[11px] text-center font-bold whitespace-nowrap text-foreground first:rounded-tl-[10px] first:text-left last:rounded-tr-[10px]',
  td: 'border-b border-muted px-3 py-2.5 text-center whitespace-nowrap first:text-left',
  total:
    '[&>td]:border-0 [&>td]:bg-secondary [&>td]:py-[13px] [&>td]:text-[15.5px] [&>td]:font-extrabold [&>td:first-child]:rounded-bl-[10px] [&>td:last-child]:rounded-br-[10px]',
  row: 'transition-colors hover:[&>td]:bg-[#F8FBFF]',
}

/** Botones de pie: fijos abajo en celular. */
export function FooterActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex items-center gap-3 border-t bg-white/95 px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] backdrop-blur-md dsk:static dsk:mx-0 dsk:justify-end dsk:border-0 dsk:bg-transparent dsk:p-0 dsk:backdrop-blur-none">
      {children}
    </div>
  )
}
