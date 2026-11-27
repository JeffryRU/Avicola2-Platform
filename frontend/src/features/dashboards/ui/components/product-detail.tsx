import { useState, type ReactNode } from 'react'
import { bucketsOf, granularityOf } from '@/features/dashboards/domain/buckets'
import { bucketLabels } from '@/features/dashboards/types/buckets'
import { CalendarDays, Layers, MapPin } from 'lucide-react'
import { dShort, type IsoDate } from '@/shared/domain/dates'
import { nf0, nf1, toggleIn } from '@/shared/domain/format'
import { isSupervisor } from '@/shared/domain/session'
import { useRequiredSession } from '@/features/auth'
import type { Catalog } from '@/features/catalog'
import {
  dayColumns,
  isStores,
  productMatrix,
  sellerColumns,
  zoneColumns,
  zoneOfStores,
  type MatrixEntry,
  type MatrixRow,
} from '@/features/dashboards/domain/product-matrix'
import { FilterMenu } from '@/features/dashboards/ui/components/filter-bar'
import { choiceKey, useDetailSelection, useStoreEntries } from '@/features/dashboards/ui/hooks'
import type { Projection } from '@/features/projections'
import {
  ALL_ZONES_LABEL,
  DAY_FILTER_LABEL,
  DETAIL_VIEW_LABEL,
  EMPTY_DETAIL_LABEL,
  NO_ZONE_LABEL,
  PRODUCT_COLUMN_LABEL,
  SIZE_COLUMN_LABEL,
  SIZE_FILTER_LABEL,
  STORES_COLUMN_LABEL,
  TOTAL_KG_LABEL,
  TOTAL_UNITS_LABEL,
  WHOLE_PERIOD_LABEL,
  WHOLE_WEEK_LABEL,
  ZONE_FILTER_LABEL,
  zonesCount,
  sizesCount,
  type DetailView,
} from '@/features/dashboards/types/product-detail'
import { Section } from '@/shared/ui/components/layout'
import { EmptyState } from '@/shared/ui/components/feedback'
import { DataTable } from '@/shared/ui/components/data-table'
import { Segmented } from '@/shared/ui/components/segmented'
import { DropdownMenuCheckboxItem, DropdownMenuSeparator } from '@/shared/ui/components/shadcn/dropdown-menu'
import { daysCount } from '@/shared/types/labels'

/**
 * «Detalle por producto»: filas por tamaño y producto; columnas por vendedor (agrupados por zona, con
 * las tiendas de cada zona al final) o por día.
 */
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
  // Las tiendas no son vendedores: si se filtra por vendedor, no van.
  const stores = useStoreEntries(periodDates, sellers, f.zones)
  // Solo las zonas con pedidos en los días que se muestran (el hook trae también el período anterior).
  const storeZones = [...new Set(stores.filter((e) => dates.includes(e.date)).map((e) => zoneOfStores(e.seller)))]
  const entries: MatrixEntry[] = [...projections, ...stores]
  const inScope = (p: MatrixEntry) => isStores(p.seller) || shown.some((s) => s.username === p.seller)

  const columns = bySeller
    ? sellerColumns(shown, dates, NO_ZONE_LABEL, [], { zones: storeZones, label: STORES_COLUMN_LABEL })
    : supervisor && view === 'zone'
      ? zoneColumns(shown, dates, NO_ZONE_LABEL, [], storeZones)
      : granularityOf(dates.length) === 'day'
        ? dayColumns(dates, null, dShort).map((c) => ({
            ...c,
            match: (p: MatrixEntry) => c.match(p) && inScope(p),
          }))
        : // Período largo: una columna por semana o por mes.
          bucketsOf(dates).map((b) => ({
            key: b.key,
            label: bucketLabels(b, granularityOf(dates.length)).title,
            group: null,
            match: (p: MatrixEntry) => b.dates.includes(p.date) && inScope(p),
          }))
  const m = productMatrix(columns, f.products, entries)
  const title = f.days.length
    ? `Detalle por producto · ${f.days.length > 2 ? daysCount(f.days.length) : f.days.map(dShort).join(', ')}`
    : `Detalle por producto (${custom ? 'período' : 'semana'})`
  const viewSwitch = (
    <Segmented
      value={view}
      onChange={setView}
      full
      className="w-full dsk:inline-flex dsk:w-auto [&>button]:whitespace-nowrap"
      options={(['seller', 'zone', 'day'] as const).map((v) => ({ value: v, label: DETAIL_VIEW_LABEL[v] }))}
    />
  )

  return (
    <Section title={title} aside={supervisor && <div className="hidden dsk:block">{viewSwitch}</div>}>
      {supervisor && <div className="border-b border-rule px-4 py-2.5 dsk:hidden">{viewSwitch}</div>}
      {m.columns.length === 0 ? (
        <EmptyState title="Sin datos">{EMPTY_DETAIL_LABEL}</EmptyState>
      ) : (
        <DataTable
          groups={m.groups.map((g) => ({
            key: g.name ?? g.rows[0]?.product.category ?? '',
            label: g.name ?? g.rows[0]?.product.category,
            rows: g.rows,
          }))}
          groupHeader={SIZE_COLUMN_LABEL}
          rowKey={(r) => r.product.id}
          totalLabel="Total"
          columns={[
            // En celular el tamaño ya va en el nombre del grupo: el producto queda fijo al deslizar.
            {
              key: 'product',
              header: PRODUCT_COLUMN_LABEL,
              sticky: true,
              className: 'font-medium',
              cell: (r) => r.product.name,
            },
            ...m.columns.map((c, j) => ({
              key: c.key,
              // Por vendedor: el nombre de pila bajo su zona (el completo, al pasar el mouse).
              header: bySeller ? c.label.split(' ')[0] : c.label,
              title: c.label,
              group: bySeller ? c.group : null,
              numeric: true,
              faint: (r: MatrixRow) => r.cells[j] === 0,
              cell: (r: MatrixRow) => (r.cells[j] === 0 ? '—' : nf0(r.cells[j])),
              total: nf0(m.cells[j]),
            })),
            {
              key: 'total-units',
              header: TOTAL_UNITS_LABEL,
              numeric: true,
              tone: (r) => (r.total === 0 ? 'faint' : 'strong'),
              cell: (r) => (r.total === 0 ? '—' : nf0(r.total)),
              total: nf0(m.total),
            },
            {
              key: 'total-kg',
              header: TOTAL_KG_LABEL,
              numeric: true,
              faint: (r) => r.total === 0,
              cell: (r) => (r.total === 0 ? '—' : nf1(r.kg)),
              total: nf1(m.kg),
            },
          ]}
        />
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
      {/* Día: también para el vendedor (filtra las columnas de su vista por día). */}
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
export function CheckItem({
  checked,
  onToggle,
  children,
}: {
  checked: boolean
  onToggle: () => void
  children: ReactNode
}) {
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
