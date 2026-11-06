import { useState, type ReactNode } from 'react'
import { Calendar, CalendarRange, ChevronDown, SlidersHorizontal, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useContainer } from '@/app/di'
import { rangeLabel, weekLabel } from '@/shared/domain/dates'
import type { ExportFormat } from '@/shared/domain/export'
import { ExportMenu } from '@/shared/ui/components/export-menu'
import { useCatalog } from '@/features/catalog/ui/hooks'
import { teamProjectionsTable } from '@/features/dashboards/domain/export'
import { isSupervisor } from '@/features/auth/domain/session'
import { useRequiredSession } from '@/features/auth/ui/use-session'
import { weekOptions } from '@/features/dashboards/domain/weeks'
import { useDashboardFilters } from '@/features/dashboards/ui/components/dashboard'
import { usePeriodData, useSellers } from '@/features/dashboards/ui/hooks'
import { CustomPeriodDialog } from '@/features/dashboards/ui/components/custom-period-dialog'
import {
  ALL_SELLERS_LABEL,
  CLEAR_FILTERS_LABEL,
  CUSTOM_PERIOD_LABEL,
  ONLY_MINE_LABEL,
  SELLERS_FILTER_LABEL,
  WEEK_FILTER_LABEL,
  sellersCount,
  type FilterChip,
} from '@/features/dashboards/types/product-detail'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/components/shadcn/dropdown-menu'
import { cn } from '@/shared/ui/lib/utils'

/**
 * Barra de filtros fija arriba al hacer scroll: cada filtro es un menú desplegable.
 * `extra` son los menús propios de cada pantalla y `chips` sus filtros activos (para «Limpiar»).
 */
export function DashboardFilterBar({ extra, chips = [] }: { extra?: ReactNode; chips?: FilterChip[] }) {
  const { week, period, sellers, setWeek, setCustom, setSellers, update } = useDashboardFilters()
  const [customOpen, setCustomOpen] = useState(false)
  const me = useRequiredSession().seller
  const team = isSupervisor(me)
  const list = (useSellers().data ?? []).filter((s) => !isSupervisor(s))

  const chosen = list.filter((s) => sellers.includes(s.username))
  const sellersLabel =
    chosen.length === 0 ? ALL_SELLERS_LABEL : chosen.length === 1 ? chosen[0].name : sellersCount(chosen.length)
  const anyActive = period.custom || chosen.length > 0 || chips.length > 0
  // Una sola actualización de la URL: varias seguidas se pisarían entre sí.
  const clearAll = () => {
    update({ vendedor: null, desde: null, hasta: null, ...Object.fromEntries(chips.map((c) => [c.key, null])) })
  }
  const toggle = (username: string) =>
    setSellers(sellers.includes(username) ? sellers.filter((u) => u !== username) : [...sellers, username])

  return (
    <div className="sticky top-0 z-20 border-b border-border/60 bg-background/95 px-4 py-2.5 backdrop-blur-md dsk:-mx-[30px] dsk:mb-4 dsk:px-[30px] dsk:py-3">
      <div className="flex [scrollbar-width:none] items-center gap-2 overflow-x-auto dsk:flex-wrap dsk:overflow-visible">
        <span className="grid size-9 flex-none place-items-center rounded-full bg-primary text-white" aria-hidden>
          <SlidersHorizontal className="size-4" />
        </span>
        <FilterMenu
          icon={period.custom ? <CalendarRange /> : <Calendar />}
          label={rangeLabel(period.from, period.to)}
          title={WEEK_FILTER_LABEL}
          active={period.custom}
        >
          <DropdownMenuRadioGroup value={period.custom ? '' : week} onValueChange={setWeek}>
            {weekOptions().map((w) => (
              <DropdownMenuRadioItem key={w} value={w}>
                {weekLabel(w)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            // Se abre después de que el menú termine de cerrarse (si no, el foco queda atrapado).
            onSelect={() => setTimeout(() => setCustomOpen(true), 0)}
            className={cn('font-semibold', period.custom && 'text-primary')}
          >
            <CalendarRange /> {CUSTOM_PERIOD_LABEL}
          </DropdownMenuItem>
        </FilterMenu>
        {team ? (
          <FilterMenu icon={<Users />} label={sellersLabel} title={SELLERS_FILTER_LABEL} active={chosen.length > 0}>
            <DropdownMenuCheckboxItem
              checked={sellers.length === 0}
              onCheckedChange={() => setSellers([])}
              onSelect={(e) => e.preventDefault()}
            >
              {ALL_SELLERS_LABEL}
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            {list.map((s) => (
              <DropdownMenuCheckboxItem
                key={s.username}
                checked={sellers.includes(s.username)}
                onCheckedChange={() => toggle(s.username)}
                // Queda abierto para marcar varios vendedores seguidos.
                onSelect={(e) => e.preventDefault()}
              >
                <span className="flex-1">{s.name}</span>
                {s.zone && <small className="text-muted-foreground">{s.zone}</small>}
              </DropdownMenuCheckboxItem>
            ))}
          </FilterMenu>
        ) : (
          <span className="flex h-9 flex-none items-center gap-1.5 rounded-full bg-card px-3 text-[13.5px] font-semibold shadow-card">
            <Users className="size-4 text-ink-2" />
            {ONLY_MINE_LABEL}
          </span>
        )}
        {extra}
        <span className="hidden flex-1 dsk:block" />
        <ExportPeriod />
        {anyActive && (
          <button
            type="button"
            onClick={clearAll}
            className="h-9 flex-none px-2 text-[13.5px] font-bold text-ink-2 hover:text-primary"
          >
            {CLEAR_FILTERS_LABEL}
          </button>
        )}
      </div>
      <CustomPeriodDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        period={period}
        onApply={(a, b) => {
          setCustom(a, b)
          setCustomOpen(false)
        }}
      />
    </div>
  )
}

/** Descarga en Excel (o PDF/CSV) las proyecciones del período y vendedores filtrados. */
function ExportPeriod() {
  const { period, sellers } = useDashboardFilters()
  const { catalog } = useCatalog()
  const data = usePeriodData(period).data
  const { exporter } = useContainer()
  const me = useRequiredSession().seller
  const all = (useSellers().data ?? []).filter((s) => !isSupervisor(s))
  const team = isSupervisor(me) ? all.filter((s) => !sellers.length || sellers.includes(s.username)) : [me]

  async function run(format: ExportFormat) {
    if (!catalog || !data) return
    const range = rangeLabel(period.from, period.to, true)
    const table = teamProjectionsTable({
      dates: period.dates,
      sellers: team,
      projections: data.projections.filter((p) => period.dates.includes(p.date)),
      sales: data.sales,
      catalog,
      period: range,
      generatedAt: new Date(),
    })
    try {
      await exporter.export(table, format, `proyecciones_${period.from}_${period.to}`)
      toast.success(`Archivo descargado (${String(table.rows.length)} filas)`)
    } catch {
      toast.error('No se pudo generar el archivo. Inténtalo de nuevo.')
    }
  }

  return (
    <ExportMenu onExport={run} disabled={!catalog || !data || !team.length} className="h-9 flex-none rounded-full" />
  )
}

/** Un filtro de la barra: botón con el valor actual que abre su menú. `active` = distinto del valor por defecto. */
export function FilterMenu({
  icon,
  label,
  title,
  active = false,
  children,
}: {
  icon?: ReactNode
  label: string
  title: string
  active?: boolean
  children: ReactNode
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${title}: ${label}`}
        className={cn(
          'flex h-9 flex-none items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold shadow-card outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4',
          active ? 'bg-secondary text-primary' : 'bg-card',
        )}
      >
        {icon && <span className={cn('grid', active ? 'text-primary' : 'text-ink-2')}>{icon}</span>}
        {label}
        <ChevronDown className="text-ink-2" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[min(70dvh,420px)] min-w-[14rem] overflow-y-auto">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{title}</DropdownMenuLabel>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
