import { BarChart3, ShoppingCart, Target, TrendingDown } from 'lucide-react'
import { dDM, dDow, dShort } from '@/shared/domain/dates'
import { nf0, nf1, pct1 } from '@/shared/domain/format'
import { periodAgg, versusReal } from '@/features/projections/domain/aggregation'
import { DashboardTabs, useDashboardFilters } from '@/features/dashboards/ui/components/dashboard'
import { DashboardFilterBar } from '@/features/dashboards/ui/components/filter-bar'
import { useCatalog } from '@/features/catalog/ui/hooks'
import { usePeriodData } from '@/features/dashboards/ui/hooks'
import { CountUp, LineChart } from '@/shared/ui/components/charts'
import { EmptyState } from '@/shared/ui/components/feedback'
import { Kpi, PageBody, PageHeader, Section, tableCls } from '@/shared/ui/components/layout'
import { cn } from '@/shared/ui/lib/utils'
import { kgPerUnitLabel } from '@/features/catalog/types/catalog'

const tone = (v: number) => (v < 0 ? 'text-destructive' : 'text-ok')

export function DashboardVersusPage() {
  const { period, sellers } = useDashboardFilters()
  const { catalog } = useCatalog()
  const data = usePeriodData(period)
  const title = 'Proyección vs Venta Real'
  const subtitle = 'Comparativo de proyección y ventas reales por producto'
  if (!catalog || !data.data) return <PageHeader title={title} subtitle={subtitle} />

  const days = periodAgg(period.dates, sellers, data.data.projections, data.data.sales, catalog)
  const vs = versusReal(days, catalog)
  const withReal = days.filter((d) => d.real)
  const points = days
    .filter((d) => d.confirmed)
    .map((d) => {
      const rk = d.real ? catalog.kg(d.real) : null
      return { date: d.date, pk: d.kg, rk }
    })

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} sticky={false} />
      <DashboardFilterBar />
      <DashboardTabs />
      <PageBody>
        <div className="mb-3 grid grid-cols-2 gap-2.5 dsk:mb-4 dsk:gap-4 @4xl/main:grid-cols-4">
          <Kpi
            icon={<BarChart3 />}
            tone="bg-secondary text-primary"
            label="Proyección"
            value={
              <>
                <CountUp value={vs.projected} /> kg
              </>
            }
            foot={`${vs.daysWithReal} días con venta registrada`}
            index={0}
          />
          <Kpi
            icon={<ShoppingCart />}
            tone="bg-ok-soft text-ok"
            label="Venta real (ERP)"
            value={
              <>
                <CountUp value={vs.real} /> kg
              </>
            }
            index={1}
          />
          <Kpi
            icon={<TrendingDown />}
            tone={vs.deviationPct < 0 ? 'bg-bad-soft text-destructive' : 'bg-ok-soft text-ok'}
            label="Desviación"
            value={
              <span className={tone(vs.deviationPct)}>
                <CountUp value={vs.deviationPct} decimals={1} suffix="%" />
              </span>
            }
            foot={`${nf0(vs.real - vs.projected)} kg`}
            index={2}
          />
          <Kpi
            icon={<Target />}
            tone="bg-ok-soft text-ok"
            label="Exactitud"
            value={
              <span className="text-ok">
                <CountUp value={vs.accuracyPct} decimals={1} suffix="%" />
              </span>
            }
            foot="según días con venta"
            index={3}
          />
        </div>
        <div className="grid gap-4 @7xl/main:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <Section
            title="Evolución semanal (kg)"
            aside={
              <div className="flex w-full items-center gap-[18px] text-[13px] font-semibold text-ink-2 dsk:w-auto dsk:text-sm">
                <span>
                  <i className="mr-[7px] inline-block size-[11px] rounded-full bg-primary align-[-1px]" />
                  Proyección
                </span>
                <span>
                  <i className="mr-[7px] inline-block size-[11px] rounded-full bg-series-2 align-[-1px]" />
                  Venta real (ERP)
                </span>
              </div>
            }
          >
            <div className="px-4 pt-1.5 pb-4 dsk:px-5 dsk:pb-5">
              {points.length > 1 ? (
                <LineChart
                  label="Kilogramos proyectados y vendidos por día"
                  points={points.map((p) => ({
                    key: p.date,
                    label: dDow(p.date),
                    sublabel: dDM(p.date),
                    a: p.pk,
                    b: p.rk,
                    tip: (
                      <>
                        <b>{dShort(p.date)}</b>
                        <br />
                        Proyección: {nf1(p.pk)} kg
                        <br />
                        {p.rk == null ? (
                          'Venta real: sin datos aún'
                        ) : (
                          <>
                            Venta real: {nf1(p.rk)} kg
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
                <div className="mt-2.5 overflow-x-auto">
                  <table className={cn(tableCls.table, 'text-[13.5px]')}>
                    <thead>
                      <tr>
                        <th className={tableCls.th} />
                        {points.map((p) => (
                          <th key={p.date} className={tableCls.th}>
                            {dDow(p.date)}
                            <br />
                            <span className="font-medium">{dDM(p.date)}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className={tableCls.td}>
                          <i className="mr-2 inline-block size-2.5 rounded-full bg-primary" />
                          Proyección (kg)
                        </td>
                        {points.map((p) => (
                          <td key={p.date} className={tableCls.td}>
                            {nf0(p.pk)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className={tableCls.td}>
                          <i className="mr-2 inline-block size-2.5 rounded-full bg-series-2" />
                          Venta real (kg)
                        </td>
                        {points.map((p) => (
                          <td key={p.date} className={cn(tableCls.td, p.rk == null && 'text-faint')}>
                            {p.rk == null ? '-' : nf0(p.rk)}
                          </td>
                        ))}
                      </tr>
                      <tr className={tableCls.total}>
                        <td>Dif. (%)</td>
                        {points.map((p) => (
                          <td key={p.date} className={cn('text-center', p.rk != null && tone(p.rk - p.pk))}>
                            {p.rk == null ? '-' : pct1(((p.rk - p.pk) / p.pk) * 100)}
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
            <div className="overflow-x-auto px-3 pb-3.5">
              {withReal.length ? (
                <table className={cn(tableCls.table, 'text-[13.5px]')}>
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
                              <b className="font-bold">{p.name}</b>
                              <small className="block text-xs text-muted-foreground">
                                {kgPerUnitLabel(p.kg_per_unit)}
                              </small>
                            </td>
                            <td className={tableCls.td}>{nf1(pk)}</td>
                            <td className={tableCls.td}>{nf1(rk)}</td>
                            <td className={cn(tableCls.td, tone(rk - pk))}>{nf1(rk - pk)}</td>
                            <td className={cn(tableCls.td, 'font-bold', tone(dp))}>{pct1(dp)}</td>
                          </tr>
                        )
                      })}
                    <tr className={tableCls.total}>
                      <td>Total</td>
                      <td className="text-center">{nf1(vs.projected)}</td>
                      <td className="text-center">{nf1(vs.real)}</td>
                      <td className={cn('text-center', tone(vs.real - vs.projected))}>{nf1(vs.real - vs.projected)}</td>
                      <td className={cn('text-center', tone(vs.deviationPct))}>{pct1(vs.deviationPct)}</td>
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
