import { useState, type ReactNode } from 'react'
import { CalendarDays, Layers, MapPin } from 'lucide-react'
import { dShort, type IsoDate } from '@/shared/domain/dates'
import { nf0, nf1 } from '@/shared/domain/format'
import { isSupervisor } from '@/features/auth/domain/session'
import { useRequiredSession } from '@/features/auth/ui/use-session'
import type { Catalog } from '@/features/catalog/domain/catalog'
import { dayColumns, productMatrix, sellerColumns } from '@/features/dashboards/domain/product-matrix'
import { FilterMenu } from '@/features/dashboards/ui/components/filter-bar'
import { choiceKey, toggleIn, useDetailSelection } from '@/features/dashboards/ui/hooks'
import type { Projection } from '@/features/projections/domain/schemas'
import {
  ALL_ZONES_LABEL,
  DAY_FILTER_LABEL,
  DETAIL_VIEW_LABEL,
  EMPTY_DETAIL_LABEL,
  NO_ZONE_LABEL,
  PRODUCT_COLUMN_LABEL,
  SIZE_COLUMN_LABEL,
  SIZE_FILTER_LABEL,
  TOTAL_KG_LABEL,
  TOTAL_UNITS_LABEL,
  WHOLE_PERIOD_LABEL,
  WHOLE_WEEK_LABEL,
  ZONE_FILTER_LABEL,
  zonesCount,
  sizesCount,
  type DetailView,
} from '@/features/dashboards/types/product-detail'
import { Section, tableCls } from '@/shared/ui/components/layout'
import { Segmented } from '@/shared/ui/components/segmented'
import { DropdownMenuCheckboxItem, DropdownMenuSeparator } from '@/shared/ui/components/shadcn/dropdown-menu'
import { daysCount } from '@/shared/types/labels'
import { cn } from '@/shared/ui/lib/utils'

/** Color de cada tamaño (chica, mediana, grande...), como en la planilla de Comercial. */
const SIZE_TONES = [
  'bg-[#DBEAFE] text-[#1D4ED8]',
  'bg-ok-soft text-ok',
  'bg-[#CCFBF1] text-[#0F766E]',
  'bg-warn-soft text-warn',
]
const ZONE_TONES = ['bg-[#FEF9C3]', 'bg-[#DCFCE7]', 'bg-[#FFEDD5]', 'bg-[#E0F2FE]', 'bg-[#F3E8FF]', 'bg-[#FCE7F3]']

/** «Detalle por producto»: filas por tamaño y producto; columnas por vendedor (agrupados por zona) o por día. */
export function ProductDetail({
  dates: periodDates,
  custom,
  sellers,
  catalog,
  projections,
}: {
  dates: IsoDate[]
  custom: boolean
  /** Vendedores elegidos en los filtros (vacío = todos). */
  sellers: string[]
  catalog: Catalog
  projections: Projection[]
}) {
  const me = useRequiredSession().seller
  const supervisor = isSupervisor(me)
  const f = useDetailSelection(periodDates, catalog)
  const [view, setView] = useState<DetailView>(supervisor ? 'seller' : 'day')
  const bySeller = supervisor && view === 'seller'
  const pickZones = new Set(f.zones)
  const shown = supervisor
    ? f.team.filter(
        (s) =>
          (sellers.length === 0 || sellers.includes(s.username)) &&
          (pickZones.size === 0 || pickZones.has(s.zone ?? NO_ZONE_LABEL)),
      )
    : [me]
  const dates = f.days.length ? f.days : f.weekDays

  const columns = bySeller
    ? sellerColumns(shown, dates, NO_ZONE_LABEL)
    : dayColumns(dates, null, dShort).map((c) => ({
        ...c,
        match: (p: Projection) => c.match(p) && shown.some((s) => s.username === p.seller),
      }))
  const m = productMatrix(columns, f.products, projections)
  const zoneTone = (name: string | null) => ZONE_TONES[Math.max(0, f.allZones.indexOf(name ?? '')) % ZONE_TONES.length]
  const sizeTone = (category: string, name: string | null) =>
    SIZE_TONES[Math.max(0, catalog.subcategories(category).indexOf(name ?? '')) % SIZE_TONES.length]
  const title = f.days.length
    ? `Detalle por producto · ${f.days.length > 2 ? daysCount(f.days.length) : f.days.map(dShort).join(', ')}`
    : `Detalle por producto (${custom ? 'período' : 'semana'})`
  const span = bySeller ? 2 : 1

  return (
    <Section
      title={title}
      aside={
        supervisor && (
          <Segmented
            value={view}
            onChange={setView}
            full
            className="w-full dsk:inline-flex dsk:w-auto [&>button]:whitespace-nowrap"
            options={(['seller', 'day'] as const).map((v) => ({ value: v, label: DETAIL_VIEW_LABEL[v] }))}
          />
        )
      }
    >
      {m.columns.length === 0 ? (
        <p className="px-5 pb-5 text-muted-foreground">{EMPTY_DETAIL_LABEL}</p>
      ) : (
        <div className="overflow-x-auto px-3 pt-1.5 pb-3.5">
          <table className={tableCls.table}>
            <thead>
              <tr>
                <th rowSpan={span} className={cn(tableCls.th, 'text-left')}>
                  {SIZE_COLUMN_LABEL}
                </th>
                <th rowSpan={span} className={cn(tableCls.th, 'text-left')}>
                  {PRODUCT_COLUMN_LABEL}
                </th>
                {bySeller
                  ? m.headerGroups.map((g, i) => (
                      <th
                        key={`${g.name ?? ''}-${String(i)}`}
                        colSpan={g.span}
                        className={cn(
                          'border-x-2 border-card px-3 py-2 text-center text-xs font-extrabold tracking-wide whitespace-nowrap uppercase',
                          zoneTone(g.name),
                        )}
                      >
                        {g.name}
                      </th>
                    ))
                  : m.columns.map((c) => (
                      <th key={c.key} className={tableCls.th}>
                        {c.label}
                      </th>
                    ))}
                <th rowSpan={span} className={tableCls.th}>
                  {TOTAL_UNITS_LABEL}
                </th>
                <th rowSpan={span} className={tableCls.th}>
                  {TOTAL_KG_LABEL}
                </th>
              </tr>
              {bySeller && (
                <tr>
                  {m.columns.map((c) => (
                    <th
                      key={c.key}
                      title={c.label}
                      className="border-x-2 border-card bg-secondary px-3 py-2 text-center text-[13px] font-bold whitespace-nowrap"
                    >
                      {c.label.split(' ')[0]}
                    </th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {m.groups.map((g) =>
                g.rows.map((r, i) => (
                  <tr key={r.product.id} className={tableCls.row}>
                    {i === 0 && (
                      <td
                        rowSpan={g.rows.length}
                        className={cn(
                          'border-b-2 border-card px-3 py-2 text-left text-[12.5px] font-extrabold whitespace-nowrap uppercase',
                          sizeTone(r.product.category, g.name),
                        )}
                      >
                        {g.name ?? r.product.category}
                      </td>
                    )}
                    <td className={cn(tableCls.td, 'text-left font-semibold')}>{r.product.name}</td>
                    {r.cells.map((u, j) => (
                      <td key={m.columns[j].key} className={cn(tableCls.td, u === 0 && 'text-faint')}>
                        {u === 0 ? '-' : nf0(u)}
                      </td>
                    ))}
                    <td className={cn(tableCls.td, 'font-extrabold', r.total === 0 && 'text-faint')}>{nf0(r.total)}</td>
                    <td className={cn(tableCls.td, r.total === 0 && 'text-faint')}>{nf1(r.kg)}</td>
                  </tr>
                )),
              )}
              <tr className={tableCls.total}>
                <td colSpan={2}>Total</td>
                {m.cells.map((u, j) => (
                  <td key={m.columns[j].key} className="text-center">
                    {nf0(u)}
                  </td>
                ))}
                <td className="text-center">{nf0(m.total)}</td>
                <td className="text-center">{nf1(m.kg)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

/** Filtros de la tabla como menús de la barra: Día, Zona y Tamaño. */
export function DetailFilterMenus({ dates, custom, catalog }: { dates: IsoDate[]; custom: boolean; catalog: Catalog }) {
  const whole = custom ? WHOLE_PERIOD_LABEL : WHOLE_WEEK_LABEL
  const supervisor = isSupervisor(useRequiredSession().seller)
  const f = useDetailSelection(dates, catalog)
  return (
    <>
      {supervisor && (
        <FilterMenu
          icon={<CalendarDays />}
          label={
            f.days.length === 0 ? whole : f.days.length > 2 ? daysCount(f.days.length) : f.days.map(dShort).join(', ')
          }
          title={DAY_FILTER_LABEL}
          active={f.days.length > 0}
        >
          <CheckItem checked={f.days.length === 0} onToggle={() => f.setDays([])}>
            {whole}
          </CheckItem>
          <DropdownMenuSeparator />
          {f.weekDays.map((d) => (
            <CheckItem key={d} checked={f.days.includes(d)} onToggle={() => f.setDays(toggleIn(f.days, d))}>
              {dShort(d)}
            </CheckItem>
          ))}
        </FilterMenu>
      )}
      {supervisor && f.allZones.length > 1 && (
        <FilterMenu
          icon={<MapPin />}
          label={
            f.zones.length === 0
              ? ALL_ZONES_LABEL
              : f.zones.length > 2
                ? zonesCount(f.zones.length)
                : f.zones.join(', ')
          }
          title={ZONE_FILTER_LABEL}
          active={f.zones.length > 0}
        >
          <CheckItem checked={f.zones.length === 0} onToggle={() => f.setZones([])}>
            {ALL_ZONES_LABEL}
          </CheckItem>
          <DropdownMenuSeparator />
          {f.allZones.map((z) => (
            <CheckItem key={z} checked={f.zones.includes(z)} onToggle={() => f.setZones(toggleIn(f.zones, z))}>
              {z}
            </CheckItem>
          ))}
        </FilterMenu>
      )}
      <FilterMenu
        icon={<Layers />}
        label={
          f.selectedSizes.length === 0
            ? f.allSizesLabel
            : f.selectedSizes.length > 2
              ? sizesCount(f.selectedSizes.length)
              : f.selectedSizes.map((c) => c.label).join(', ')
        }
        title={SIZE_FILTER_LABEL}
        active={f.selectedSizes.length > 0}
      >
        <CheckItem checked={f.selectedSizes.length === 0} onToggle={() => f.setSizes([])}>
          {f.allSizesLabel}
        </CheckItem>
        {f.sizeOptions.length > 0 && <DropdownMenuSeparator />}
        {f.sizeOptions.map((c) => {
          const key = choiceKey(c.category, c.subcategory)
          return (
            <CheckItem key={key} checked={f.sizes.includes(key)} onToggle={() => f.setSizes(toggleIn(f.sizes, key))}>
              {c.label}
            </CheckItem>
          )
        })}
      </FilterMenu>
    </>
  )
}

/** Opción marcable de un menú que queda abierto para elegir varias. */
function CheckItem({ checked, onToggle, children }: { checked: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <DropdownMenuCheckboxItem
      checked={checked}
      onCheckedChange={onToggle}
      onSelect={(e) => {
        e.preventDefault()
      }}
    >
      {children}
    </DropdownMenuCheckboxItem>
  )
}
