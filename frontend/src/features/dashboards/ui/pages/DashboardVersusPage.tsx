import { SyncStatus } from '@/shared/ui/components/sync-status'
import { bucketsOf, granularityOf } from '@/features/dashboards/domain/buckets'
import { GRANULARITY_NOTE, bucketLabels } from '@/features/dashboards/types/buckets'
import { nf0, nf1, pct1 } from '@/shared/domain/format'
import { periodAgg, useModelProjections, versusReal } from '@/features/projections'
import { DashboardTabs } from '@/features/dashboards/ui/components/dashboard'
import { DataTable, type RowTone } from '@/shared/ui/components/data-table'
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
import { useState, type ReactNode } from 'react'
import { EmptyState } from '@/shared/ui/components/feedback'
import { Kpi, KpiStrip, PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { cn } from '@/shared/ui/lib/utils'
import { kgAmount } from '@/shared/types/labels'

const tone = (v: number) => (v < 0 ? 'text-bad' : 'text-ok')

/** Una fila de la tabla bajo el gráfico: una serie con su valor de cada día. */
interface SeriesRow<P> {
  key: string
  label: ReactNode
  tone?: RowTone
  value: (p: P) => number | null
  cell: (p: P) => ReactNode
  className?: (p: P) => string | false | undefined
}

/**
 * Muestra de una serie: línea continua (proyección vigente), discontinua (venta real) o, para
 * una ronda anterior (`round` 1, 2…), el trazo tenue de esa ronda. No depende solo del color.
 */
function SeriesKey({ dashed, round, model }: { dashed?: boolean; round?: number; model?: boolean }) {
  const prev = round !== undefined
  const color = model
    ? 'var(--chart-model)'
    : prev
      ? PREV_COLOR[(round - 1) % PREV_COLOR.length]
      : dashed
        ? 'var(--chart-2)'
        : 'var(--chart-1)'
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
        strokeDasharray={
          model ? '10 4' : prev ? EARLIER_DASH[(round - 1) % EARLIER_DASH.length] : dashed ? '5 3' : undefined
        }
      />
      {/* El mismo marcador del gráfico: círculo (proyección; hueco si es anterior) o cuadrado (venta). */}
      {model ? (
        <path d="M14 1.5 L18.5 6 L14 10.5 L9.5 6 Z" fill={color} stroke="var(--surface)" strokeWidth="1.25" />
      ) : dashed ? (
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
  // Lo que el modelo habría sugerido cada día (mediana de los pedidos de ARIS de las 4 semanas
  // anteriores), con los mismos filtros de vendedor y productos.
  const model = useModelProjections(period.from, period.to)
  const modelKg = new Map<string, number>()
  for (const row of onlyProducts(model.data ?? [], picked)) {
    if (sellers.length && !sellers.includes(row.seller)) continue
    modelKg.set(row.date, (modelKg.get(row.date) ?? 0) + catalog.kg(row.units))
  }
  const hasModel = modelKg.size > 0
  const dailyPoints = chartDays.map((d) => {
    const rk = d.real ? catalog.kg(d.real) : null
    const earlier = rounds > 1 ? sheets.kg[d.date].slice(0, -1) : []
    const mk = modelKg.get(d.date) ?? null
    return { date: d.date, confirmed: d.confirmed, pk: d.kg, rk, mk, earlier, parts: parts.kg[d.date] }
  })
  // Un período largo se grafica por semana o por mes (un año día a día no se lee).
  const granularity = granularityOf(period.dates.length)
  const allPoints = bucketsOf(period.dates, granularity).map((b) => {
    const ps = dailyPoints.filter((p) => b.dates.includes(p.date))
    const conf = ps.filter((p) => p.confirmed)
    const add = (xs: number[]) => xs.reduce((a, v) => a + v, 0)
    const known = (xs: (number | null)[]) => {
      const vals = xs.filter((v): v is number => v != null)
      return vals.length ? add(vals) : null
    }
    return {
      date: b.start,
      ...bucketLabels(b, granularity),
      confirmed: conf.length > 0,
      pk: add(conf.map((p) => p.pk)),
      rk: known(ps.map((p) => p.rk)),
      mk: known(ps.map((p) => p.mk)),
      earlier: Array.from({ length: Math.max(0, rounds - 1) }, (_, r) => add(conf.map((p) => p.earlier[r] ?? p.pk))),
      parts: parts.names.map((_, k) => add(conf.map((p) => p.parts[k] ?? 0))),
    }
  })
  // La tabla, solo con los días que tienen proyección.
  const points = allPoints.filter((p) => p.confirmed)
  // Tabla bajo el gráfico: una fila por serie (rondas, modelo, venta real) y una columna por día.
  type Point = (typeof points)[number]
  const kgCell = (value: (p: Point) => number | null) => (p: Point) => {
    const v = value(p)
    return v == null ? '—' : nf0(v)
  }
  const series = (
    key: string,
    label: ReactNode,
    value: (p: Point) => number | null,
    tone?: RowTone,
  ): SeriesRow<Point> => ({ key, label, value, tone, cell: kgCell(value) })
  const seriesRows: SeriesRow<Point>[] = [
    ...earlierRounds.map((r) =>
      series(
        `round-${String(r)}`,
        <>
          <SeriesKey round={r} />
          {roundLabel(r, rounds)} (kg)
        </>,
        (p) => p.earlier[r - 1] ?? null,
        'muted',
      ),
    ),
    series(
      'projected',
      <>
        <SeriesKey />
        {roundLabel(rounds, rounds)} (kg)
      </>,
      (p) => p.pk,
    ),
    ...(hasModel
      ? [
          series(
            'model',
            <>
              <SeriesKey model />
              Modelo (kg)
            </>,
            (p) => p.mk ?? null,
          ),
        ]
      : []),
    series(
      'real',
      <>
        <SeriesKey dashed />
        Venta real (kg)
      </>,
      (p) => p.rk ?? null,
    ),
    {
      key: 'diff',
      label: 'Dif. (%)',
      tone: 'total',
      value: (p) => p.rk ?? null,
      cell: (p) => (p.rk == null ? '—' : pct1(((p.rk - p.pk) / p.pk) * 100)),
      className: (p) => p.rk != null && tone(p.rk - p.pk),
    },
  ]
  const productRows = catalog.products
    .map((p) => {
      const pk = withReal.reduce((s, d) => s + (d.units[p.id] ?? 0) * p.kg_per_unit, 0)
      const rk = withReal.reduce((s, d) => s + (d.real?.[p.id] ?? 0) * p.kg_per_unit, 0)
      return { p, pk, rk, dp: pk ? ((rk - pk) / pk) * 100 : 0 }
    })
    .filter((r) => r.pk || r.rk)

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} sticky={false} />
      <DashboardFilterBar />
      <DashboardTabs />
      <PageBody>
        <SyncStatus queries={[data, history, model]} />
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
        <div className="grid grid-cols-1 items-start gap-4 @7xl/main:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
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
                {hasModel && (
                  <span className="flex items-center gap-1.5">
                    <SeriesKey model />
                    Modelo (sugerencia)
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <SeriesKey dashed />
                  Venta real (ERP)
                </span>
              </div>
              {GRANULARITY_NOTE[granularity] && (
                <p className="mb-2 text-right text-xs text-muted-foreground">{GRANULARITY_NOTE[granularity]}</p>
              )}
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
                    label: p.label,
                    sublabel: p.sublabel,
                    a: p.confirmed ? p.pk : null,
                    b: p.rk,
                    c: p.mk,
                    earlier: p.confirmed ? p.earlier : undefined,
                    parts: p.confirmed && parts.names.length > 1 ? p.parts : undefined,
                    tip: (
                      <>
                        <b>{p.title}</b>
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
                        {p.mk != null && (
                          <>
                            <br />
                            Modelo: {kgAmount(p.mk)}
                          </>
                        )}
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
                  <DataTable
                    dense
                    rows={seriesRows}
                    rowKey={(r) => r.key}
                    rowTone={(r) => r.tone}
                    columns={[
                      {
                        key: 'series',
                        header: <span className="sr-only">Serie</span>,
                        cell: (r) => <span className="flex items-center gap-2">{r.label}</span>,
                      },
                      ...points.map((p) => ({
                        key: p.date,
                        header: (
                          <>
                            {p.label}
                            <br />
                            <span className="num">{p.sublabel}</span>
                          </>
                        ),
                        numeric: true,
                        faint: (r: SeriesRow<Point>) => r.value(p) == null,
                        className: (r: SeriesRow<Point>) => r.className?.(p),
                        cell: (r: SeriesRow<Point>) => r.cell(p),
                      })),
                    ]}
                  />
                </div>
              )}
            </div>
          </Section>
          <Section title="Desviación por producto (semana)">
            <div className="relative overflow-x-auto">
              {withReal.length ? (
                <DataTable
                  dense
                  rows={productRows}
                  rowKey={(r) => r.p.id}
                  totalLabel="Total"
                  columns={[
                    {
                      key: 'name',
                      header: 'Producto',
                      cell: ({ p }) => (
                        <>
                          <span className="block font-medium">{p.name}</span>
                          <small className="block text-xs text-muted-foreground">{kgPerUnitLabel(p.kg_per_unit)}</small>
                        </>
                      ),
                    },
                    {
                      key: 'pk',
                      header: (
                        <>
                          Proyección
                          <br />
                          (kg)
                        </>
                      ),
                      numeric: true,
                      cell: (r) => nf1(r.pk),
                      total: nf1(vs.projected),
                    },
                    {
                      key: 'rk',
                      header: (
                        <>
                          Venta real
                          <br />
                          (kg)
                        </>
                      ),
                      numeric: true,
                      cell: (r) => nf1(r.rk),
                      total: nf1(vs.real),
                    },
                    {
                      key: 'diff',
                      header: 'Dif. (kg)',
                      numeric: true,
                      className: (r) => tone(r.rk - r.pk),
                      cell: (r) => nf1(r.rk - r.pk),
                      total: nf1(vs.real - vs.projected),
                      totalClassName: tone(vs.real - vs.projected),
                    },
                    {
                      key: 'pct',
                      header: 'Dif. (%)',
                      numeric: true,
                      className: (r) => cn('font-medium', tone(r.dp)),
                      cell: (r) => pct1(r.dp),
                      total: pct1(vs.deviationPct),
                      totalClassName: tone(vs.deviationPct),
                    },
                  ]}
                />
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
