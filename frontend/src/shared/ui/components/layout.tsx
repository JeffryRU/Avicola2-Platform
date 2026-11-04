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
}: {
  title: string
  subtitle?: string
  /** null: pantalla raíz, sin botón Volver. */
  back?: string | null
  actions?: ReactNode
  mobileActions?: ReactNode
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2.5 bg-background/95 px-4 pt-3.5 pb-3 backdrop-blur-md dsk:static dsk:mb-[22px] dsk:flex-wrap dsk:items-end dsk:gap-4 dsk:bg-transparent dsk:p-0 dsk:backdrop-blur-none">
      {back !== null && (
        <Link
          to={back}
          aria-label="Volver"
          className="-ml-2 grid size-[38px] place-items-center rounded-[10px] text-primary dsk:hidden"
        >
          <ChevronLeft className="size-6" strokeWidth={2.4} />
        </Link>
      )}
      <div className="min-w-0 flex-1 dsk:flex-[1_1_auto]">
        <h1 className="text-[22px] font-extrabold tracking-[-0.02em] dsk:text-[34px] dsk:tracking-[-0.035em]">
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-2 dsk:mt-1.5 dsk:text-base">{subtitle}</p>}
      </div>
      {mobileActions && <div className="dsk:hidden">{mobileActions}</div>}
      {actions && <div className="hidden max-w-full dsk:block">{actions}</div>}
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
  // Angosta (celular, 4 por fila): todo centrado y apilado. Ancha: ícono a la izquierda y texto al lado.
  // El gráfico (extra) ocupa el lugar del ícono, así todas las tarjetas siguen el mismo orden.
  const badge =
    extra ??
    (icon && (
      <div
        className={cn(
          'grid size-12 place-items-center rounded-2xl @[16rem]:size-[58px] [&>svg]:size-6 @[16rem]:[&>svg]:size-7',
          tone,
        )}
      >
        {icon}
      </div>
    ))
  return (
    <div
      className="@container animate-rise rounded-[18px] bg-card shadow-card dsk:min-h-[118px]"
      style={{ animationDelay: `${index * 0.06}s` }}
    >
      <div className="flex h-full flex-col items-center justify-center gap-2.5 p-4 text-center dsk:p-5 @[16rem]:flex-row @[16rem]:justify-start @[16rem]:gap-4 @[16rem]:text-left">
        {badge && <div className="flex-none">{badge}</div>}
        <div className="w-full min-w-0 @[16rem]:flex-1">
          <span className="block text-[14px] leading-snug font-semibold text-ink-2 @[16rem]:text-[14.5px]">
            {label}
          </span>
          <b className="mt-1 block text-[22px] leading-tight font-extrabold tracking-[-0.03em] whitespace-nowrap @[16rem]:text-[25px] @[20rem]:text-[28px]">
            {value}
          </b>
          {foot && (
            <small className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground @[16rem]:justify-start">
              {foot}
            </small>
          )}
        </div>
      </div>
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
