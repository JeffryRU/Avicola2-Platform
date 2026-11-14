import { SyncStatus } from '@/shared/ui/components/sync-status'
import { Calendar, Layers, Package, ShoppingBag } from 'lucide-react'
import { useNavigate } from 'react-router'
import { dDM, dDow, dShort } from '@/shared/domain/dates'
import { nf0, nf1 } from '@/shared/domain/format'
import { periodAgg } from '@/features/projections/domain/aggregation'
import { previousDates } from '@/features/dashboards/domain/period'
import { DashboardTabs, Delta, useDashboardFilters } from '@/features/dashboards/ui/components/dashboard'
import { useCatalog } from '@/features/catalog/ui/hooks'
import { BarChart, CountUp, Donut } from '@/shared/ui/components/charts'
import { Kpi, PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { STATUS_LABEL } from '@/shared/types/labels'
import { useDayPath } from '@/features/dashboards/ui/hooks'
import { DetailFilterMenus, ProductDetail } from '@/features/dashboards/ui/components/product-detail'
import { DashboardFilterBar } from '@/features/dashboards/ui/components/filter-bar'
import { useDetailSelection, usePeriodData } from '@/features/dashboards/ui/hooks'

export function DashboardSummaryPage() {
  const { period, sellers } = useDashboardFilters()
  const { catalog } = useCatalog()
  const data = usePeriodData(period)
  const navigate = useNavigate()
  const dayPath = useDayPath()
  const detail = useDetailSelection(period.dates, catalog)
  const subtitle = period.custom ? 'Resumen del período' : 'Resumen semanal'
  const source = data.data ?? { projections: [], sales: [] }

  const { projections, sales } = source
  const days = periodAgg(period.dates, sellers, projections, sales, catalog)
  const prev = periodAgg(previousDates(period), sellers, projections, sales, catalog)
  // Variación contra los mismos días confirmados del período anterior.
  const same = prev.filter((_, i) => days[i].confirmed)
  const units = days.reduce((s, d) => s + d.u, 0)
  const kg = days.reduce((s, d) => s + d.kg, 0)
  const confirmed = days.filter((d) => d.confirmed).length
  const cat = catalog.categories[0]
  const products = catalog.of(cat)

  return (
    <div>
      <PageHeader title="Planificación de Demanda" subtitle={subtitle} sticky={false} />
      <SyncStatus queries={[data]} className="mx-4 mt-3 dsk:mx-8" />
      <DashboardFilterBar
        extra={<DetailFilterMenus dates={period.dates} custom={period.custom} catalog={catalog} />}
        chips={detail.chips}
      />
      <DashboardTabs />
      <PageBody>
        <div className="mb-3 grid grid-cols-2 gap-2.5 dsk:mb-4 dsk:gap-4 @4xl/main:grid-cols-4">
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
            value={`${String(confirmed)} de ${String(days.length)}`}
            extra={<Donut pct={(confirmed / days.length) * 100} />}
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
                    <br />
                    {STATUS_LABEL[d.confirmed ? 'confirmed' : 'pending']}
                  </>
                ),
              }))}
            />
          </div>
        </Section>
        <ProductDetail
          dates={period.dates}
          custom={period.custom}
          sellers={sellers}
          catalog={catalog}
          projections={projections}
        />
      </PageBody>
    </div>
  )
}
