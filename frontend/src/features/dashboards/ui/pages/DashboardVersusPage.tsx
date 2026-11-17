import { SyncStatus } from '@/shared/ui/components/sync-status'
import { dDM, dDow, dShort } from '@/shared/domain/dates'
import { nf0, nf1, pct1 } from '@/shared/domain/format'
import { periodAgg, versusReal } from '@/features/projections'
import { DashboardTabs } from '@/features/dashboards/ui/components/dashboard'
import { tableCls } from '@/shared/ui/lib/table-styles'
import { DashboardFilterBar } from '@/features/dashboards/ui/components/filter-bar'
import { kgPerUnitLabel, useCatalog } from '@/features/catalog'
import { usePeriodData, useDashboardFilters } from '@/features/dashboards/ui/hooks'
import { CountUp, LineChart } from '@/shared/ui/components/charts'
import { EARLIER_DASH } from '@/shared/ui/lib/chart-dash'
import { useHistory } from '@/features/history'
import { onlyProducts, onlyProductsChanged, projectionParts, sheetRounds } from '@/features/dashboards/domain/sheets'
import { PART_COLOR, PREV_COLOR } from '@/shared/ui/lib/chart-dash'
import { FilterMenu } from '@/features/dashboards/ui/components/filter-bar'
import { CheckItem } from '@/features/dashboards/ui/components/product-detail'
import { DropdownMenuLabel, DropdownMenuSeparator } from '@/shared/ui/components/shadcn/dropdown-menu'
import { bySubcategory } from '@/shared/domain/products'
import { toggleIn } from '@/shared/domain/format'
import { Package } from 'lucide-react'
import { useState } from 'react'
import { EmptyState } from '@/shared/ui/components/feedback'
import { Kpi, KpiStrip, PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { cn } from '@/shared/ui/lib/utils'
import { kgAmount } from '@/shared/types/labels'

const tone = (v: number) => (v < 0 ? 'text-bad' : 'text-ok')

/**
 * Muestra de una serie: línea continua (proyección vigente), discontinua (venta real) o, para
 * una ronda anterior (`round` 1, 2…), el trazo tenue de esa ronda. No depende solo del color.
 */
function SeriesKey({ dashed, round }: { dashed?: boolean; round?: number }) {
  const prev = round !== undefined
  const color = prev ? PREV_COLOR[(round - 1) % PREV_COLOR.length] : dashed ? 'var(--chart-2)' : 'var(--chart-1)'
  return (
    <svg aria-hidden width="28" height="12" viewBox="0 0 28 12" className="inline-block flex-none">
      <line
        x1="1"
        x2="27"
        y1="6"
        y2="6"
        strokeWidth={2.5}
        strokeLinecap="round"
        stroke={color}
        strokeDasharray={prev ? EARLIER_DASH[(round - 1) % EARLIER_DASH.length] : dashed ? '5 3' : undefined}
      />
      {/* El mismo marcador del gráfico: círculo (proyección; hueco si es anterior) o cuadrado (venta). */}
      {dashed ? (
        <rect x="10.5" y="2.5" width="7" height="7" fill={color} stroke="var(--surface)" strokeWidth="1.5" />
      ) : (
        <circle
          cx="14"
          cy="6"
          r="3.5"
          fill={prev ? 'var(--surface)' : color}
          stroke={prev ? color : 'var(--surface)'}
          strokeWidth="1.75"
        />
      )}
    </svg>
  )
}

/** Nombre de cada ronda: «Proyección 1», «Proyección 2»…; la última es la vigente. */
const roundLabel = (r: number, rounds: number) =>
  rounds === 1 ? 'Proyección' : r === rounds ? `Proyección ${String(r)} (vigente)` : `Proyección ${String(r)}`

export function DashboardVersusPage() {
  const { period, sellers } = useDashboardFilters()
  const { catalog } = useCatalog()
  const data = usePeriodData(period)
  const title = 'Proyección vs venta real'
  const subtitle = 'Comparativo de proyección y ventas reales por producto'
  const source = data.data ?? { projections: [], sales: [] }

  const days = periodAgg(period.dates, sellers, source.projections, source.sales, catalog)
  // Productos del gráfico (vacía = el total de todos). Solo cambia la evolución semanal.
  const [picked, setPicked] = useState<string[]>([])
  const chartProducts = catalog.forProjection().products
  const pickedNames = chartProducts.filter((p) => picked.includes(p.id)).map((p) => p.name)
  const chartDays = picked.length
    ? periodAgg(
        period.dates,
        sellers,
        onlyProducts(source.projections, picked),
        onlyProducts(source.sales, picked),
        catalog,
      )
    : days
  // Hojas de cada día (un vendedor puede volver a registrar 2 o 3 veces): una línea por ronda.
  const history = useHistory(period.from, period.to)
  const sheets = sheetRounds(
    period.dates,
    sellers,
    onlyProducts(source.projections, picked),
    onlyProductsChanged(history.data ?? [], picked),
    catalog,
  )
  const rounds = sheets.rounds
  const earlierRounds = Array.from({ length: rounds - 1 }, (_, i) => i + 1)
  const vs = versusReal(days, catalog)
  const withReal = days.filter((d) => d.real)
  // Sin ventas del ERP no hay desviación ni exactitud que mostrar (0 % sería engañoso).
  const noReal = vs.daysWithReal === 0
  // De qué está hecha cada día la proyección vigente: franjas por tamaño (o por producto).
  const parts = projectionParts(period.dates, sellers, source.projections, chartProducts, picked)
  // Todos los días del período (el gráfico ocupa la semana entera); sin dato, la línea se corta.
  const allPoints = chartDays.map((d) => {
    const rk = d.real ? catalog.kg(d.real) : null
    const earlier = rounds > 1 ? sheets.kg[d.date].slice(0, -1) : []
    return { date: d.date, confirmed: d.confirmed, pk: d.kg, rk, earlier, parts: parts.kg[d.date] }
  })
  // La tabla, solo con los días que tienen proyección.
  const points = allPoints.filter((p) => p.confirmed)

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} sticky={false} />
      <DashboardFilterBar />
      <DashboardTabs />
      <PageBody>
        <SyncStatus queries={[data, history]} />
        <KpiStrip className="mb-4">
          <Kpi
            label="Proyección"
            value={
              <>
                <CountUp value={vs.projected} />{' '}
                <span className="font-sans text-md font-normal text-muted-foreground">kg</span>
              </>
            }
            foot={`${vs.daysWithReal} días con venta registrada`}
          />
          <Kpi
            label="Venta real (ERP)"
            value={
              <>
                <CountUp value={vs.real} />{' '}
                <span className="font-sans text-md font-normal text-muted-foreground">kg</span>
              </>
            }
          />
          <Kpi
            label="Desviación"
            value={
              noReal ? (
                <span className="text-faint">—</span>
              ) : (
                <span className={tone(vs.deviationPct)}>
                  <CountUp value={vs.deviationPct} decimals={1} suffix="%" />
                </span>
              )
            }
            foot={noReal ? 'sin ventas del ERP' : `${nf0(vs.real - vs.projected)} kg`}
          />
          <Kpi
            label="Exactitud"
            value={
              noReal ? (
                <span className="text-faint">—</span>
              ) : (
                <CountUp value={vs.accuracyPct} decimals={1} suffix="%" />
              )
            }
            foot="según días con venta"
          />
        </KpiStrip>
        <div className="grid grid-cols-1 gap-4 @7xl/main:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <Section
            className="flex flex-col overflow-hidden"
            title="Evolución semanal (kg)"
            aside={
              <FilterMenu
                icon={<Package />}
                title="Productos del gráfico"
                label={
                  !picked.length
                    ? 'Total de productos'
                    : picked.length > 2
                      ? `${String(picked.length)} productos`
                      : pickedNames.join(', ')
                }
                active={picked.length > 0}
              >
                <CheckItem checked={!picked.length} onToggle={() => setPicked([])}>
                  Total de productos
                </CheckItem>
                {bySubcategory(chartProducts).map((g) => (
                  <div key={g.name ?? ''}>
                    <DropdownMenuSeparator />
                    {g.name && (
                      <DropdownMenuLabel className="text-xs text-muted-foreground">{g.name}</DropdownMenuLabel>
                    )}
                    {g.products.map((p) => (
                      <CheckItem
                        key={p.id}
                        checked={picked.includes(p.id)}
                        onToggle={() => setPicked(toggleIn(picked, p.id))}
                      >
                        {p.name}
                      </CheckItem>
                    ))}
                  </div>
                ))}
              </FilterMenu>
            }
          >
            <div className="flex flex-1 flex-col px-4 pt-3 pb-4 dsk:px-5">
              <div className="mb-2 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm text-ink-2">
                {earlierRounds.map((r) => (
                  <span key={r} className="flex items-center gap-1.5">
                    <SeriesKey round={r} />
                    {roundLabel(r, rounds)}
                  </span>
                ))}
                <span className="flex items-center gap-1.5">
                  <SeriesKey />
                  {roundLabel(rounds, rounds)}
                </span>
                <span className="flex items-center gap-1.5">
                  <SeriesKey dashed />
                  Venta real (ERP)
                </span>
              </div>
              {parts.names.length > 1 && points.length > 0 && (
                <div className="mb-2 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Proyección vigente por {picked.length > 0 && picked.length <= 4 ? 'producto' : 'tamaño'}:</span>
                  {parts.names.map((name, k) => (
                    <span key={name} className="flex items-center gap-1.5">
                      <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" className="flex-none">
                        <rect
                          width="12"
                          height="12"
                          rx="2"
                          fill={PART_COLOR[k % PART_COLOR.length]}
                          fillOpacity={0.45}
                          stroke={PART_COLOR[k % PART_COLOR.length]}
                        />
                      </svg>
                      {name}
                    </span>
                  ))}
                </div>
              )}
              {/* Ocupa el alto que deja la tarjeta (con un mínimo): sin huecos blancos. */}
              <div className="relative min-h-64 flex-1 dsk:min-h-80">
                <LineChart
                  label="Kilogramos proyectados y vendidos por día"
                  empty={
                    <>
                      <b className="block font-semibold text-foreground">Sin proyecciones en este período</b>
                      <span className="text-sm text-muted-foreground">
                        Cuando se registren, verás aquí la proyección y la venta real de cada día.
                      </span>
                    </>
                  }
                  points={allPoints.map((p) => ({
                    key: p.date,
                    label: dDow(p.date),
                    sublabel: dDM(p.date),
                    a: p.confirmed ? p.pk : null,
                    b: p.rk,
                    earlier: p.confirmed ? p.earlier : undefined,
                    parts: p.confirmed && parts.names.length > 1 ? p.parts : undefined,
                    tip: (
                      <>
                        <b>{dShort(p.date)}</b>
                        {p.confirmed &&
                          p.earlier.map((kg, i) => (
                            <span key={i}>
                              <br />
                              {roundLabel(i + 1, rounds)}: {kgAmount(kg)}
                            </span>
                          ))}
                        <br />
                        {p.confirmed ? `${roundLabel(rounds, rounds)}: ${kgAmount(p.pk)}` : 'Sin proyección'}
                        {p.confirmed &&
                          parts.names.length > 1 &&
                          parts.names.map((name, k) => (
                            <span key={name}>
                              <br />
                              <span className="opacity-80">
                                · {name}: {kgAmount(p.parts[k])}
                              </span>
                            </span>
                          ))}
                        <br />
                        {p.rk == null ? (
                          'Venta real: sin datos aún'
                        ) : (
                          <>
                            Venta real: {kgAmount(p.rk)}
                            {p.confirmed && p.pk > 0 && (
                              <>
                                <br />
                                Diferencia: {pct1(((p.rk - p.pk) / p.pk) * 100)}
                              </>
                            )}
                          </>
                        )}
                      </>
                    ),
                  }))}
                />
              </div>
              {points.length > 0 && (
                <div className="relative -mx-4 mt-3 -mb-4 overflow-x-auto dsk:-mx-5">
                  <table className={cn(tableCls.table, 'text-sm')}>
                    <thead>
                      <tr>
                        <th className={tableCls.th}>
                          <span className="sr-only">Serie</span>
                        </th>
                        {points.map((p) => (
                          <th key={p.date} className={tableCls.th}>
                            {dDow(p.date)}
                            <br />
                            <span className="num">{dDM(p.date)}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {earlierRounds.map((r) => (
                        <tr key={r} className="text-muted-foreground">
                          <td className={tableCls.td}>
                            <span className="flex items-center gap-2">
                              <SeriesKey round={r} />
                              {roundLabel(r, rounds)} (kg)
                            </span>
                          </td>
                          {points.map((p) => (
                            <td key={p.date} className={cn(tableCls.td, 'num')}>
                              {nf0(p.earlier[r - 1])}
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr>
                        <td className={tableCls.td}>
                          <span className="flex items-center gap-2">
                            <SeriesKey />
                            {roundLabel(rounds, rounds)} (kg)
                          </span>
                        </td>
                        {points.map((p) => (
                          <td key={p.date} className={cn(tableCls.td, 'num')}>
                            {nf0(p.pk)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className={tableCls.td}>
                          <span className="flex items-center gap-2">
                            <SeriesKey dashed />
                            Venta real (kg)
                          </span>
                        </td>
                        {points.map((p) => (
                          <td key={p.date} className={cn(tableCls.td, 'num', p.rk == null && 'text-faint')}>
                            {p.rk == null ? '—' : nf0(p.rk)}
                          </td>
                        ))}
                      </tr>
                      <tr className={tableCls.total}>
                        <td className={tableCls.td}>Dif. (%)</td>
                        {points.map((p) => (
                          <td
                            key={p.date}
                            className={cn(tableCls.td, 'num', p.rk == null ? 'text-faint' : tone(p.rk - p.pk))}
                          >
                            {p.rk == null ? '—' : pct1(((p.rk - p.pk) / p.pk) * 100)}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Section>
          <Section title="Desviación por producto (semana)">
            <div className="relative overflow-x-auto">
              {withReal.length ? (
                <table className={cn(tableCls.table, 'text-sm')}>
                  <thead>
                    <tr>
                      <th className={tableCls.th}>Producto</th>
                      <th className={tableCls.th}>
                        Proyección
                        <br />
                        (kg)
                      </th>
                      <th className={tableCls.th}>
                        Venta real
                        <br />
                        (kg)
                      </th>
                      <th className={tableCls.th}>Dif. (kg)</th>
                      <th className={tableCls.th}>Dif. (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.products
                      .map((p) => {
                        const pk = withReal.reduce((s, d) => s + (d.units[p.id] ?? 0) * p.kg_per_unit, 0)
                        const rk = withReal.reduce((s, d) => s + (d.real?.[p.id] ?? 0) * p.kg_per_unit, 0)
                        return { p, pk, rk }
                      })
                      .filter((r) => r.pk || r.rk)
                      .map(({ p, pk, rk }) => {
                        const dp = pk ? ((rk - pk) / pk) * 100 : 0
                        return (
                          <tr key={p.id} className={tableCls.row}>
                            <td className={tableCls.td}>
                              <span className="block font-medium">{p.name}</span>
                              <small className="block text-xs text-muted-foreground">
                                {kgPerUnitLabel(p.kg_per_unit)}
                              </small>
                            </td>
                            <td className={cn(tableCls.td, 'num')}>{nf1(pk)}</td>
                            <td className={cn(tableCls.td, 'num')}>{nf1(rk)}</td>
                            <td className={cn(tableCls.td, 'num', tone(rk - pk))}>{nf1(rk - pk)}</td>
                            <td className={cn(tableCls.td, 'num font-medium', tone(dp))}>{pct1(dp)}</td>
                          </tr>
                        )
                      })}
                    <tr className={tableCls.total}>
                      <td className={tableCls.td}>Total</td>
                      <td className={cn(tableCls.td, 'num')}>{nf1(vs.projected)}</td>
                      <td className={cn(tableCls.td, 'num')}>{nf1(vs.real)}</td>
                      <td className={cn(tableCls.td, 'num', tone(vs.real - vs.projected))}>
                        {nf1(vs.real - vs.projected)}
                      </td>
                      <td className={cn(tableCls.td, 'num', tone(vs.deviationPct))}>{pct1(vs.deviationPct)}</td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <EmptyState title="Sin ventas registradas">Esta semana aún no tiene ventas del ERP.</EmptyState>
              )}
            </div>
          </Section>
        </div>
      </PageBody>
    </div>
  )
}
