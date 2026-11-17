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
import { sheetRounds } from '@/features/dashboards/domain/sheets'
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
  return (
    <svg aria-hidden width="20" height="8" viewBox="0 0 20 8" className="inline-block flex-none">
      <line
        x1="0"
        x2="20"
        y1="4"
        y2="4"
        strokeWidth={prev ? 2 : 2.5}
        strokeOpacity={prev ? 0.6 : 1}
        stroke={dashed ? 'var(--chart-2)' : 'var(--chart-1)'}
        strokeDasharray={prev ? EARLIER_DASH[(round - 1) % EARLIER_DASH.length] : dashed ? '5 3' : undefined}
      />
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
  // Hojas de cada día (un vendedor puede volver a registrar 2 o 3 veces): una línea por ronda.
  const history = useHistory(period.from, period.to)
  const sheets = sheetRounds(period.dates, sellers, source.projections, history.data ?? [], catalog)
  const rounds = sheets.rounds
  const earlierRounds = Array.from({ length: rounds - 1 }, (_, i) => i + 1)
  const vs = versusReal(days, catalog)
  const withReal = days.filter((d) => d.real)
  // Sin ventas del ERP no hay desviación ni exactitud que mostrar (0 % sería engañoso).
  const noReal = vs.daysWithReal === 0
  const points = days
    .filter((d) => d.confirmed)
    .map((d) => {
      const rk = d.real ? catalog.kg(d.real) : null
      return { date: d.date, pk: d.kg, rk, earlier: rounds > 1 ? sheets.kg[d.date].slice(0, -1) : [] }
    })

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
          <Section title="Evolución semanal (kg)">
            <div className="px-4 pt-3 pb-4 dsk:px-5">
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
              {points.length > 1 ? (
                <LineChart
                  label="Kilogramos proyectados y vendidos por día"
                  points={points.map((p) => ({
                    key: p.date,
                    label: dDow(p.date),
                    sublabel: dDM(p.date),
                    a: p.pk,
                    b: p.rk,
                    earlier: p.earlier,
                    tip: (
                      <>
                        <b>{dShort(p.date)}</b>
                        {p.earlier.map((kg, i) => (
                          <span key={i}>
                            <br />
                            {roundLabel(i + 1, rounds)}: {kgAmount(kg)}
                          </span>
                        ))}
                        <br />
                        {roundLabel(rounds, rounds)}: {kgAmount(p.pk)}
                        <br />
                        {p.rk == null ? (
                          'Venta real: sin datos aún'
                        ) : (
                          <>
                            Venta real: {kgAmount(p.rk)}
                            <br />
                            Diferencia: {pct1(((p.rk - p.pk) / p.pk) * 100)}
                          </>
                        )}
                      </>
                    ),
                  }))}
                />
              ) : (
                <EmptyState title="Aún no hay suficientes días">
                  Cuando haya ventas registradas en el ERP verás la comparación aquí.
                </EmptyState>
              )}
              {points.length > 0 && (
                <div className="relative -mx-4 mt-3 overflow-x-auto dsk:-mx-5">
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
