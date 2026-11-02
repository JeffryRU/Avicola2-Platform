import { ArrowDown, ArrowUp, Calendar, Users } from 'lucide-react'
import { NavLink, useSearchParams } from 'react-router'
import { addDays, today, weekLabel, weekStart, type IsoDate } from '@/core/domain/dates'
import { pct1 } from '@/core/domain/format'
import { DASHBOARDS } from '@/app/routes'
import { isSupervisor } from '@/modules/auth/domain/session'
import { useRequiredSession } from '@/modules/auth/ui/use-session'
import { useSellers } from '@/modules/planning/ui/hooks'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/shadcn/select'
import { cn } from '@/ui/lib/utils'

export const weekOptions = (ref = today()) => [0, 1, 2, 3].map((i) => addDays(weekStart(ref), -7 * i))

/** Semana y vendedor elegidos, guardados en la URL (?semana=&vendedor=) para poder compartirla. */
export function useDashboardFilters() {
  const [params, setParams] = useSearchParams()
  const weeks = weekOptions()
  const week = weeks.includes(params.get('semana') ?? '') ? (params.get('semana') as IsoDate) : weeks[0]
  const seller = params.get('vendedor') || 'all'
  const set = (key: 'semana' | 'vendedor', value: string) => {
    const next = new URLSearchParams(params)
    next.set(key, value)
    setParams(next, { replace: true })
  }
  return { week, seller, setWeek: (w: string) => set('semana', w), setSeller: (s: string) => set('vendedor', s) }
}

const boxCls =
  'min-w-0 flex-1 rounded-[14px] bg-card px-2.5 pt-2 pb-2.5 shadow-card dsk:min-w-[220px] dsk:flex-none dsk:px-3 dsk:pt-2.5 dsk:pb-3'
const triggerCls =
  'h-11 w-full rounded-[10px] border-[1.5px] bg-white font-semibold [&>span]:flex [&>span]:items-center [&>span]:gap-2.5'

export function DashboardFilters() {
  const { week, seller, setWeek, setSeller } = useDashboardFilters()
  const sellers = useSellers().data ?? []
  // Un vendedor solo ve sus datos (lo filtra el backend): el selector es solo del supervisor.
  const me = useRequiredSession().seller
  const team = isSupervisor(me)
  return (
    <div className="flex flex-wrap gap-2 px-4 pb-1 dsk:gap-3 dsk:p-0">
      <div className={boxCls}>
        <label className="mb-1.5 ml-0.5 block text-[13px] font-bold" id="f-week">
          Semana
        </label>
        <Select value={week} onValueChange={setWeek}>
          <SelectTrigger aria-labelledby="f-week" className={triggerCls}>
            <Calendar className="size-[18px] text-ink-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {weekOptions().map((w) => (
              <SelectItem key={w} value={w}>
                {weekLabel(w)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!team && (
        <div className={boxCls}>
          <span className="mb-1.5 ml-0.5 block text-[13px] font-bold">Vendedor</span>
          <div className={cn(triggerCls, 'flex items-center gap-2.5 border px-3')}>
            <Users className="size-[18px] flex-none text-ink-2" />
            <span className="min-w-0 truncate">
              {me.name} <small className="hidden font-normal text-muted-foreground dsk:inline">· solo tus proyecciones</small>
            </span>
          </div>
        </div>
      )}
      {team && (
        <div className={boxCls}>
          <label className="mb-1.5 ml-0.5 block text-[13px] font-bold" id="f-seller">
            Vendedor
          </label>
          <Select value={seller} onValueChange={setSeller}>
            <SelectTrigger aria-labelledby="f-seller" className={triggerCls}>
              <Users className="size-[18px] text-ink-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los vendedores</SelectItem>
              {sellers.map((s) => (
                <SelectItem key={s.username} value={s.username}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
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

/** Segmentos (Semana actual / Historial, BRASA / BROASTER...). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  full,
  className,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  full?: boolean
  className?: string
}) {
  return (
    <div role="tablist" className={cn('inline-flex gap-0.5 rounded-xl bg-muted p-1', full && 'flex', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-[9px] px-[18px] py-[9px] font-bold text-ink-2 transition-colors',
            full && 'flex-1',
            value === o.value && 'bg-white text-primary shadow-sm',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
