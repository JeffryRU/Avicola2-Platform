import { useState } from 'react'
import { Calendar, Layers, Package, ShoppingBag } from 'lucide-react'
import { useNavigate } from 'react-router'
import { paths } from '@/app/routes'
import { addDays, dDM, dDow, dShort } from '@/core/domain/dates'
import { nf0, nf1 } from '@/core/domain/format'
import { weekAgg } from '@/modules/planning/domain/aggregation'
import {
  DashboardFilters,
  DashboardTabs,
  Delta,
  Segmented,
  useDashboardFilters,
} from '@/modules/planning/ui/components/dashboard'
import { useCatalog, useWindowData } from '@/modules/planning/ui/hooks'
import { BarChart, CountUp, Donut } from '@/ui/components/charts'
import { Kpi, PageBody, PageHeader, Section, tableCls } from '@/ui/components/layout'
import { useIsMobile } from '@/ui/hooks/use-is-mobile'
import { cn } from '@/ui/lib/utils'

export function DashboardSummaryPage() {
  const { week, seller } = useDashboardFilters()
  const { catalog } = useCatalog()
  const data = useWindowData()
  const mobile = useIsMobile()
  const navigate = useNavigate()
  const [category, setCategory] = useState<string | null>(null)
  if (!catalog || !data.data) return <PageHeader title="Planificación de Demanda" subtitle="Resumen semanal" />

  const { projections, sales } = data.data
  const days = weekAgg(week, seller, projections, sales, catalog)
  const prev = weekAgg(addDays(week, -7), seller, projections, sales, catalog)
  // Variación contra los mismos días confirmados de la semana anterior.
  const same = prev.filter((_, i) => days[i].confirmed)
  const units = days.reduce((s, d) => s + d.u, 0)
  const kg = days.reduce((s, d) => s + d.kg, 0)
  const confirmed = days.filter((d) => d.confirmed).length
  const cat = category ?? catalog.categories[0]
  const products = catalog.of(cat)

  return (
    <div>
      <PageHeader title="Planificación de Demanda" subtitle="Resumen semanal" actions={<DashboardFilters />} />
      {mobile && <DashboardFilters />}
      <DashboardTabs />
      <PageBody>
        <div className="mb-3 grid grid-cols-2 gap-2.5 min-[1201px]:grid-cols-4 dsk:mb-4 dsk:gap-4">
          <Kpi
            icon={<Package />}
            tone="bg-secondary text-primary"
            label="Total proyectado"
            value={
              <>
                <CountUp value={units} /> unid.
              </>
            }
            foot={<Delta current={units} previous={same.reduce((s, d) => s + d.u, 0)} />}
            index={0}
          />
          <Kpi
            icon={<ShoppingBag />}
            tone="bg-ok-soft text-ok"
            label="Total en kilos (aprox.)"
            value={
              <>
                <CountUp value={kg} decimals={1} /> kg
              </>
            }
            foot={<Delta current={kg} previous={same.reduce((s, d) => s + d.kg, 0)} />}
            index={1}
          />
          <Kpi
            icon={<Calendar />}
            label="Días confirmados"
            value={`${confirmed} de 7`}
            extra={<Donut pct={(confirmed / 7) * 100} />}
            index={2}
          />
          <Kpi
            icon={<Layers />}
            tone="bg-[#EDE9FE] text-[#6D28D9]"
            label={`Productos ${cat}`}
            value={products.length}
            foot="en la proyección"
            index={3}
          />
        </div>
        <Section
          title="Proyección por día (unidades)"
          aside={<span className="hidden text-muted-foreground dsk:inline">Toca una barra para ver el día</span>}
          className="mb-4"
        >
          <div className="px-4 pt-1.5 pb-4 dsk:px-5 dsk:pb-5">
            <BarChart
              label="Unidades proyectadas por día"
              onSelect={(d) => navigate(paths.day(d))}
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
                    <br />
                    {d.confirmed ? 'Confirmada' : 'Pendiente'}
                  </>
                ),
              }))}
            />
          </div>
        </Section>
        <Section
          title="Detalle por producto (semana)"
          aside={
            catalog.categories.length > 1 && (
              <Segmented
                value={cat}
                onChange={setCategory}
                options={catalog.categories.map((c) => ({ value: c, label: c }))}
              />
            )
          }
        >
          <div className="overflow-x-auto px-3 pb-3.5">
            <table className={tableCls.table}>
              <thead>
                <tr>
                  <th className={tableCls.th}>Producto</th>
                  {days.map((d) => (
                    <th key={d.date} className={tableCls.th}>
                      {dShort(d.date)}
                    </th>
                  ))}
                  <th className={tableCls.th}>Total (unid.)</th>
                  <th className={tableCls.th}>Total (kg)</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const total = days.reduce((s, d) => s + (d.confirmed ? (d.units[p.id] ?? 0) : 0), 0)
                  return (
                    <tr key={p.id} className={tableCls.row}>
                      <td className={tableCls.td}>{p.name}</td>
                      {days.map((d) => (
                        <td key={d.date} className={cn(tableCls.td, !d.confirmed && 'text-faint')}>
                          {d.confirmed ? (d.units[p.id] ?? 0) : '-'}
                        </td>
                      ))}
                      <td className={cn(tableCls.td, 'font-extrabold')}>{nf0(total)}</td>
                      <td className={tableCls.td}>{nf1(total * p.kg_per_unit)}</td>
                    </tr>
                  )
                })}
                <tr className={tableCls.total}>
                  <td>Total</td>
                  {days.map((d) => (
                    <td key={d.date} className="text-center">
                      {nf0(d.u)}
                    </td>
                  ))}
                  <td className="text-center">{nf0(units)}</td>
                  <td className="text-center">{nf1(kg)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>
      </PageBody>
    </div>
  )
}
