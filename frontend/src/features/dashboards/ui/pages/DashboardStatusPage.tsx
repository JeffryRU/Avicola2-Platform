import { SyncStatus } from '@/shared/ui/components/sync-status'
import { useNavigate } from 'react-router'
import { dDM, dDow, dFull, dShort, rangeLabel } from '@/shared/domain/dates'
import { nf0, nf1 } from '@/shared/domain/format'
import { periodAgg } from '@/features/projections'
import { DashboardTabs } from '@/features/dashboards/ui/components/dashboard'
import { useTooltip } from '@/shared/ui/hooks/use-tooltip'
import { tableCls } from '@/shared/ui/lib/table-styles'
import { DashboardFilterBar } from '@/features/dashboards/ui/components/filter-bar'
import { useCatalog } from '@/features/catalog'
import { BarChart } from '@/shared/ui/components/charts'
import { StatusBadge, StatusDot } from '@/shared/ui/components/feedback'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { cn } from '@/shared/ui/lib/utils'
import { kgAmount, STATUS_LABEL, unitsCount } from '@/shared/types/labels'
import { useDayPath, usePeriodData, useDashboardFilters } from '@/features/dashboards/ui/hooks'

export function DashboardStatusPage() {
  const { period, sellers } = useDashboardFilters()
  const { catalog } = useCatalog()
  const data = usePeriodData(period)
  const navigate = useNavigate()
  const dayPath = useDayPath()
  const { bind, node } = useTooltip()
  const title = 'Estado de proyecciones'
  const subtitle = rangeLabel(period.from, period.to, true)
  const source = data.data ?? { projections: [], sales: [] }

  const days = periodAgg(period.dates, sellers, source.projections, source.sales, catalog)
  const units = days.reduce((s, d) => s + d.u, 0)
  const kg = days.reduce((s, d) => s + d.kg, 0)

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} sticky={false} />
      <DashboardFilterBar />
      <DashboardTabs />
      <PageBody>
        <SyncStatus queries={[data]} />
        <section
          aria-label="Estado por día"
          className="mb-4 grid grid-cols-7 gap-px overflow-hidden rounded-md border border-border bg-rule hc:rounded-none hc:border-x-0 hc:border-t-heavy hc:border-b-heavy hc:bg-foreground"
        >
          {days.map((d) => (
            <button
              key={d.date}
              type="button"
              aria-label={`${dShort(d.date)}: ${STATUS_LABEL[d.confirmed ? 'confirmed' : 'pending']}`}
              onClick={() => void navigate(dayPath(d.date))}
              {...bind(
                <>
                  <b>{dShort(d.date)}</b>
                  <br />
                  {d.confirmed ? `${unitsCount(d.u)}, ${kgAmount(d.kg)}` : STATUS_LABEL.pending}
                </>,
              )}
              className={cn(
                'flex min-h-touch flex-col items-center gap-1 bg-surface px-0.5 py-3 text-center transition-colors hover:bg-muted dsk:items-start dsk:px-4 dsk:text-left',
                !d.confirmed && 'hc:bg-warn-soft',
              )}
            >
              <span className="text-xs text-muted-foreground hc:font-semibold hc:text-foreground">{dDow(d.date)}</span>
              <span className="num text-sm font-medium dsk:text-lg">{dDM(d.date)}</span>
              <span className="mt-1 flex items-center gap-1.5">
                <StatusDot tone={d.confirmed ? 'ok' : 'warn'} />
                <span
                  className={cn(
                    'hidden text-sm dsk:inline',
                    d.confirmed ? 'text-foreground' : 'font-medium text-warn hc:font-bold',
                  )}
                >
                  {STATUS_LABEL[d.confirmed ? 'confirmed' : 'pending']}
                </span>
              </span>
            </button>
          ))}
        </section>
        {node}
        <div className="grid grid-cols-1 items-start gap-4 @6xl/main:grid-cols-2">
          <Section title="Total proyectado por día (unidades)">
            <div className="px-4 pt-3 pb-4 dsk:px-5">
              <BarChart
                label="Unidades proyectadas por día"
                width={560}
                height={330}
                onSelect={(d) => void navigate(dayPath(d))}
                bars={days.map((d) => ({
                  key: d.date,
                  value: d.u,
                  label: dDow(d.date),
                  sublabel: dDM(d.date),
                  tip: (
                    <>
                      <b>{dShort(d.date)}</b>
                      <br />
                      {nf0(d.u)} unidades, {kgAmount(d.kg)}
                    </>
                  ),
                }))}
              />
            </div>
          </Section>
          <Section title="Detalle por día (unidades y kg)">
            <div className="relative overflow-x-auto">
              <table className={tableCls.table}>
                <thead>
                  <tr>
                    <th className={tableCls.th}>Fecha</th>
                    <th className={tableCls.th}>Unidades</th>
                    <th className={tableCls.th}>Kilos (aprox.)</th>
                    <th className={cn(tableCls.th, 'text-left')}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr
                      key={d.date}
                      className={cn(tableCls.row, 'cursor-pointer')}
                      onClick={() => void navigate(dayPath(d.date))}
                    >
                      <td className={tableCls.td}>
                        {dDow(d.date)} <span className="num dsk:hidden">{dDM(d.date)}</span>
                        <span className="num hidden dsk:inline">{dFull(d.date)}</span>
                      </td>
                      <td className={cn(tableCls.td, 'num', !d.u && 'text-faint')}>{nf0(d.u)}</td>
                      <td className={cn(tableCls.td, 'num', !d.u && 'text-faint')}>{d.u ? nf1(d.kg) : '—'}</td>
                      <td className={cn(tableCls.td, 'text-left')}>
                        <StatusBadge kind={d.confirmed ? 'confirmed' : 'pending'} />
                      </td>
                    </tr>
                  ))}
                  <tr className={tableCls.total}>
                    <td className={tableCls.td}>Total</td>
                    <td className={cn(tableCls.td, 'num')}>{nf0(units)}</td>
                    <td className={cn(tableCls.td, 'num')}>{nf1(kg)}</td>
                    <td className={tableCls.td} />
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      </PageBody>
    </div>
  )
}
