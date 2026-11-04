import { Check, Clock } from 'lucide-react'
import { useNavigate } from 'react-router'
import { dDM, dDow, dFull, dShort, weekLabel } from '@/shared/domain/dates'
import { nf0, nf1 } from '@/shared/domain/format'
import { weekAgg } from '@/features/projections/domain/aggregation'
import { DashboardFilters, DashboardTabs, useDashboardFilters } from '@/features/dashboards/ui/components/dashboard'
import { useCatalog } from '@/features/catalog/ui/hooks'
import { useWindowData } from '@/features/projections/ui/hooks'
import { BarChart, useTooltip } from '@/shared/ui/components/charts'
import { StatusBadge } from '@/shared/ui/components/feedback'
import { PageBody, PageHeader, Section, tableCls } from '@/shared/ui/components/layout'
import { useIsMobile } from '@/shared/ui/hooks/use-is-mobile'
import { cn } from '@/shared/ui/lib/utils'
import { STATUS_LABEL } from '@/shared/types/labels'
import { kgAmount, unitsCount } from '@/shared/types/labels'
import { useDayPath } from '@/features/dashboards/ui/hooks'

export function DashboardStatusPage() {
  const { week, seller } = useDashboardFilters()
  const { catalog } = useCatalog()
  const data = useWindowData()
  const mobile = useIsMobile()
  const navigate = useNavigate()
  const dayPath = useDayPath()
  const { bind, node } = useTooltip()
  const title = 'Estado de proyecciones'
  if (!catalog || !data.data) return <PageHeader title={title} subtitle={weekLabel(week, true)} />

  const days = weekAgg(week, seller, data.data.projections, data.data.sales, catalog)
  const units = days.reduce((s, d) => s + d.u, 0)
  const kg = days.reduce((s, d) => s + d.kg, 0)
  const legend = (
    <div className="mb-3 flex justify-start gap-[18px] text-sm font-semibold text-ink-2 dsk:-mt-2 dsk:mb-3.5 dsk:justify-end">
      <span className="flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-full bg-ok text-white">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
        Confirmada
      </span>
      <span className="flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-full bg-pend text-white">
          <Clock className="size-3.5" strokeWidth={2.5} />
        </span>
        Pendiente
      </span>
    </div>
  )

  return (
    <div>
      <PageHeader title={title} subtitle={weekLabel(week, true)} actions={<DashboardFilters />} />
      {mobile && <DashboardFilters />}
      <DashboardTabs />
      <PageBody>
        {legend}
        <div className="mb-3 grid grid-cols-7 gap-[5px] dsk:mb-4 dsk:gap-3">
          {days.map((d, i) => (
            <button
              key={d.date}
              type="button"
              onClick={() => void navigate(dayPath(d.date))}
              {...bind(
                <>
                  <b>{dShort(d.date)}</b>
                  <br />
                  {d.confirmed ? `${unitsCount(d.u)}, ${kgAmount(d.kg)}` : STATUS_LABEL.pending}
                </>,
              )}
              className={cn(
                'grid justify-items-center gap-0.5 rounded-xl bg-card px-0.5 py-2.5 text-center shadow-card transition dsk:rounded-2xl dsk:px-2 dsk:py-4',
                'hover:-translate-y-[3px]',
              )}
            >
              <b className="text-[13px] font-extrabold dsk:text-[19px]">{dDow(d.date)}</b>
              <span className="text-[11.5px] text-ink-2 dsk:text-base">{dDM(d.date)}</span>
              <span
                className={cn(
                  'mt-1.5 grid size-[30px] animate-popin place-items-center rounded-full text-white dsk:mt-2.5 dsk:size-14',
                  d.confirmed ? 'bg-ok' : 'bg-pend',
                )}
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                {d.confirmed ? (
                  <Check className="size-4 dsk:size-7" strokeWidth={3} />
                ) : (
                  <Clock className="size-4 dsk:size-7" strokeWidth={3} />
                )}
              </span>
              <small className="mt-1.5 hidden text-[12.5px] text-muted-foreground dsk:block">
                {STATUS_LABEL[d.confirmed ? 'confirmed' : 'pending']}
              </small>
            </button>
          ))}
        </div>
        {node}
        <div className="grid gap-4 @6xl/main:grid-cols-2">
          <Section title="Total proyectado por día (unidades)">
            <div className="px-4 pt-1.5 pb-4 dsk:px-5 dsk:pb-5">
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
                      {nf0(d.u)} unidades, {nf1(d.kg)} kg
                    </>
                  ),
                }))}
              />
            </div>
          </Section>
          <Section title="Detalle por día (unidades y kg)">
            <div className="overflow-x-auto px-3 pb-3.5">
              <table className={tableCls.table}>
                <thead>
                  <tr>
                    <th className={tableCls.th}>Fecha</th>
                    <th className={tableCls.th}>Unidades</th>
                    <th className={tableCls.th}>Kilos (aprox.)</th>
                    <th className={tableCls.th}>Estado</th>
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
                        {dDow(d.date)} {dFull(d.date)}
                      </td>
                      <td className={tableCls.td}>{nf0(d.u)}</td>
                      <td className={cn(tableCls.td, !d.u && 'text-faint')}>{d.u ? nf1(d.kg) : '-'}</td>
                      <td className={cn(tableCls.td, '!text-left')}>
                        <StatusBadge kind={d.confirmed ? 'confirmed' : 'pending'} />
                      </td>
                    </tr>
                  ))}
                  <tr className={tableCls.total}>
                    <td>Total</td>
                    <td className="text-center">{nf0(units)}</td>
                    <td className="text-center">{nf1(kg)}</td>
                    <td className="text-center">-</td>
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
