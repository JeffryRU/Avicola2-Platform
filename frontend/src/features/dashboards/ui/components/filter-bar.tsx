import { useState, type ReactNode } from 'react'
import { Calendar, CalendarRange, ChevronDown, SlidersHorizontal, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useContainer } from '@/app/di'
import { rangeLabel, weekLabel } from '@/shared/domain/dates'
import type { ExportFormat } from '@/shared/domain/export'
import { ExportMenu } from '@/shared/ui/components/export-menu'
import { useCatalog } from '@/features/catalog'
import { teamProjectionsTable } from '@/features/dashboards/domain/export'
import { isSupervisor } from '@/shared/domain/session'
import { useRequiredSession } from '@/features/auth'
import { weekOptions } from '@/features/dashboards/domain/weeks'
import { usePeriodData, useDashboardFilters } from '@/features/dashboards/ui/hooks'
import { useTeamSellers } from '@/features/sellers'
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
import { toggleIn } from '@/shared/domain/format'

/**
 * Barra de filtros fija arriba al hacer scroll: cada filtro es un menú desplegable.
 * `extra` son los menús propios de cada pantalla y `chips` sus filtros activos (para «Limpiar»).
 */
export function DashboardFilterBar({ extra, chips = [] }: { extra?: ReactNode; chips?: FilterChip[] }) {
  const { week, period, sellers, setWeek, setCustom, setSellers, update } = useDashboardFilters()
  const [customOpen, setCustomOpen] = useState(false)
  const me = useRequiredSession().seller
  const team = isSupervisor(me)
  const list = useTeamSellers()

  const chosen = list.filter((s) => sellers.includes(s.username))
  const sellersLabel =
    chosen.length === 0 ? ALL_SELLERS_LABEL : chosen.length === 1 ? chosen[0].name : sellersCount(chosen.length)
  const anyActive = period.custom || chosen.length > 0 || chips.length > 0
  // Una sola actualización de la URL: varias seguidas se pisarían entre sí.
  const clearAll = () => {
    update({ vendedor: null, desde: null, hasta: null, ...Object.fromEntries(chips.map((c) => [c.key, null])) })
  }
  const toggle = (username: string) => setSellers(toggleIn(sellers, username))

  return (
    <div
      role="group"
      aria-label="Filtros"
      className="sticky top-0 z-20 border-b border-border bg-background px-4 py-2 dsk:-mx-9 dsk:mb-4 dsk:px-9 dsk:py-2.5 hc:border-b-2 hc:border-foreground"
    >
      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto dsk:flex-wrap dsk:overflow-visible">
        <SlidersHorizontal className="size-4 flex-none text-muted-foreground" aria-hidden />
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
            className={cn(period.custom && 'font-semibold text-primary')}
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
          <span className="flex h-touch flex-none items-center gap-1.5 px-1 text-sm text-ink-2 dsk:h-control">
            <Users className="size-4 text-muted-foreground" aria-hidden />
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
            className="h-touch flex-none px-2 text-sm font-medium text-primary underline-offset-4 hover:underline dsk:h-control"
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
  const all = useTeamSellers()
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

  return <ExportMenu onExport={run} disabled={!catalog || !data || !team.length} className="flex-none" />
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
          'flex h-touch flex-none items-center gap-1.5 rounded-md border-control border-border-strong bg-surface px-3 text-sm whitespace-nowrap text-foreground transition-colors hover:bg-muted dsk:h-control [&_svg]:size-4',
          active &&
            'border-primary bg-selected font-medium text-selected-foreground hover:bg-selected hc:border-foreground',
        )}
      >
        {icon && (
          <span className={cn('grid', active ? 'text-selected-foreground' : 'text-muted-foreground')}>{icon}</span>
        )}
        {label}
        <ChevronDown className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[min(70dvh,26rem)] min-w-56 overflow-y-auto">
        <DropdownMenuLabel>{title}</DropdownMenuLabel>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
