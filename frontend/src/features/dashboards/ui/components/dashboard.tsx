import { ArrowDown, ArrowUp } from 'lucide-react'
import { NavLink, useSearchParams } from 'react-router'
import { pct1 } from '@/shared/domain/format'
import { DASHBOARDS } from '@/app/routes'
import { cn } from '@/shared/ui/lib/utils'

/** Pestañas entre dashboards (solo celular; en escritorio están en el menú). */
export function DashboardTabs() {
  const [params] = useSearchParams()
  return (
    <nav
      aria-label="Dashboards"
      className="flex border-b border-border px-4 dsk:hidden hc:border-b-2 hc:border-foreground"
    >
      {DASHBOARDS.map((d) => (
        <NavLink
          key={d.to}
          to={{ pathname: d.to, search: params.toString() }}
          className={({ isActive }) =>
            cn(
              'relative flex h-touch flex-1 items-center justify-center px-2 text-center text-sm font-medium text-ink-2 transition-colors hover:text-foreground',
              isActive &&
                'font-semibold text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-primary hc:bg-nav-active hc:font-extrabold hc:text-nav-active-foreground hc:after:hidden',
            )
          }
        >
          {d.short}
        </NavLink>
      ))}
    </nav>
  )
}

/** Variación porcentual: flecha y signo (no solo color), verde si sube y rojo si baja. */
export function Delta({
  current,
  previous,
  note = 'vs. mismos días',
}: {
  current: number
  previous: number
  note?: string
}) {
  if (!previous) return null
  const v = ((current - previous) / previous) * 100
  return (
    <>
      <span className={cn('num inline-flex items-center gap-0.5 font-medium', v >= 0 ? 'text-ok' : 'text-bad')}>
        {v >= 0 ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />}
        {pct1(v)}
      </span>
      <span className="hidden dsk:inline">{note}</span>
    </>
  )
}
