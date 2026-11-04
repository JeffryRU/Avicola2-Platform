import { ArrowDown, ArrowUp } from 'lucide-react'
import { NavLink, useSearchParams } from 'react-router'
import { pct1 } from '@/shared/domain/format'
import { DASHBOARDS } from '@/app/routes'
import { weekOptions } from '@/features/dashboards/domain/weeks'
import { checkPeriod, customPeriod, weekPeriod } from '@/features/dashboards/domain/period'
import { isoDateSchema } from '@/shared/domain/schemas'
import { cn } from '@/shared/ui/lib/utils'

/**
 * Filtros de los dashboards guardados en la URL para poder compartirla:
 * ?semana= o ?desde=&hasta= (rango personalizado), &vendedor=a,b (vacío = todos)&dia=&zona=&tamano=.
 */
export function useDashboardFilters() {
  const [params, setParams] = useSearchParams()
  const weeks = weekOptions()
  const asked = params.get('semana') ?? ''
  const week = weeks.includes(asked) ? asked : weeks[0]
  const sellers = (params.get('vendedor') ?? '').split(',').filter((v) => v && v !== 'all')
  const from = params.get('desde') ?? ''
  const to = params.get('hasta') ?? ''
  const valid = isoDateSchema.safeParse(from).success && isoDateSchema.safeParse(to).success
  const period = valid && !checkPeriod(from, to) ? customPeriod(from, to) : weekPeriod(week)
  /** Cambia varios filtros a la vez (null o '' los quita). Se puede llamar varias veces seguidas. */
  const update = (patch: Record<string, string | null>) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        return next
      },
      { replace: true },
    )
  }
  return {
    week,
    period,
    sellers,
    param: (key: string) => params.get(key),
    update,
    setWeek: (w: string) => update({ semana: w, desde: null, hasta: null }),
    setCustom: (a: string, b: string) => update({ desde: a, hasta: b }),
    setSellers: (list: string[]) => update({ vendedor: list.join(',') || null }),
  }
}

/** Pestañas entre dashboards (solo celular; en escritorio están en el menú). */
export function DashboardTabs() {
  const [params] = useSearchParams()
  return (
    <div className="flex px-4 pt-2 pb-2.5 dsk:hidden">
      <div className="flex flex-1 gap-0.5 rounded-xl bg-muted p-1">
        {DASHBOARDS.map((d) => (
          <NavLink
            key={d.to}
            to={{ pathname: d.to, search: params.toString() }}
            className={({ isActive }) =>
              cn(
                'flex-1 rounded-[9px] px-2 py-[9px] text-center text-sm font-bold text-ink-2 transition-colors',
                isActive && 'bg-white text-primary shadow-sm',
              )
            }
          >
            {d.short}
          </NavLink>
        ))}
      </div>
    </div>
  )
}

/** Variación porcentual con flecha (verde sube, rojo baja). */
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
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-[9px] py-[3px] text-xs font-bold',
          v >= 0 ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-destructive',
        )}
      >
        {v >= 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
        {pct1(v)}
      </span>
      <span className="hidden dsk:inline">{note}</span>
    </>
  )
}
