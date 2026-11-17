import { SyncStatus } from '@/shared/ui/components/sync-status'
import { granularityOf, sumDays } from '@/features/dashboards/domain/buckets'
import { bucketLabels } from '@/features/dashboards/types/buckets'
import { useNavigate } from 'react-router'
import { rangeLabel } from '@/shared/domain/dates'
import { nf0 } from '@/shared/domain/format'
import { periodAgg } from '@/features/projections'
import { previousDates } from '@/features/dashboards/domain/period'
import { DashboardTabs, Delta } from '@/features/dashboards/ui/components/dashboard'
import { useCatalog } from '@/features/catalog'
import { BarChart, CountUp } from '@/shared/ui/components/charts'
import { Kpi, KpiStrip, PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { STATUS_LABEL, kgAmount, UNITS_SHORT } from '@/shared/types/labels'
import { useDayPath, useDetailSelection, usePeriodData, useDashboardFilters } from '@/features/dashboards/ui/hooks'
import { DetailFilterMenus, ProductDetail } from '@/features/dashboards/ui/components/product-detail'
import { DashboardFilterBar } from '@/features/dashboards/ui/components/filter-bar'
import { onlyProducts } from '@/features/dashboards/domain/sheets'
import { NO_ZONE_LABEL } from '@/features/dashboards/types/product-detail'

/** Vendedor que no existe: para que un filtro sin coincidencias no muestre a todos. */
const NO_SELLER = '·'

export function DashboardSummaryPage() {
  const { period, sellers } = useDashboardFilters()
  const { catalog } = useCatalog()
  const data = usePeriodData(period)
  const navigate = useNavigate()
  const dayPath = useDayPath()
  const detail = useDetailSelection(period.dates, catalog)
  const subtitle = period.custom ? 'Resumen del período' : 'Resumen semanal'
  const source = data.data ?? { projections: [], sales: [] }

  // Los filtros de la barra (vendedor, zona, tamaño y días) cambian también los totales y el
  // gráfico, no solo la tabla de detalle.
  const byZone = detail.zones.length
    ? detail.team.filter((s) => detail.zones.includes(s.zone ?? NO_ZONE_LABEL)).map((s) => s.username)
    : null
  const picked = byZone ? (sellers.length ? sellers.filter((s) => byZone.includes(s)) : byZone) : sellers
  // Una zona sin vendedores no debe caer en «todos» (lista vacía = todos en periodAgg).
  const scope = byZone && !picked.length ? [NO_SELLER] : picked
  const ids = detail.selectedSizes.length ? detail.products.map((p) => p.id) : []
  const projections = onlyProducts(source.projections, ids)
  const sales = onlyProducts(source.sales, ids)
  const allDays = periodAgg(period.dates, scope, projections, sales, catalog)
  const days = detail.days.length ? allDays.filter((d) => detail.days.includes(d.date)) : allDays
  const prevAll = periodAgg(previousDates(period), scope, projections, sales, catalog)
  const prev = detail.days.length ? prevAll.filter((_, i) => detail.days.includes(allDays[i].date)) : prevAll
  // Variación contra los mismos días confirmados del período anterior.
  const same = prev.filter((_, i) => days[i].confirmed)
  const units = days.reduce((s, d) => s + d.u, 0)
  const kg = days.reduce((s, d) => s + d.kg, 0)
  const confirmed = days.filter((d) => d.confirmed).length
  const cat = catalog.categories[0]
  const products = catalog.of(cat)

  return (
    <div>
      <PageHeader title={subtitle} subtitle={rangeLabel(period.from, period.to, true)} sticky={false} />
      <DashboardFilterBar
        extra={<DetailFilterMenus dates={period.dates} custom={period.custom} catalog={catalog} />}
        chips={detail.chips}
      />
      <DashboardTabs />
      <PageBody>
        <SyncStatus queries={[data]} />
        <KpiStrip className="mb-4">
          <Kpi
            label="Total proyectado"
            value={
              <>
                <CountUp value={units} />{' '}
                <span className="font-sans text-md font-normal text-muted-foreground">{UNITS_SHORT}</span>
              </>
            }
            foot={<Delta current={units} previous={same.reduce((s, d) => s + d.u, 0)} />}
          />
          <Kpi
            label="Total en kilos (aprox.)"
            value={
              <>
                <CountUp value={kg} decimals={1} />{' '}
                <span className="font-sans text-md font-normal text-muted-foreground">kg</span>
              </>
            }
            foot={<Delta current={kg} previous={same.reduce((s, d) => s + d.kg, 0)} />}
          />
          <Kpi
            label="Días confirmados"
            value={
              <>
                {confirmed}{' '}
                <span className="font-sans text-md font-normal text-muted-foreground">de {days.length}</span>
              </>
            }
          />
          <Kpi label={`Productos ${cat}`} value={products.length} foot="en la proyección" />
        </KpiStrip>
        <Section title="Proyección por día (unidades)" aside="Elige una barra para ver el día" className="mb-4">
          <div className="px-4 pt-3 pb-4 dsk:px-5">
            <BarChart
              label="Unidades proyectadas por día"
              // Por día, la barra lleva al detalle del día; por semana o mes, no.
              onSelect={granularityOf(days.length) === 'day' ? (d) => void navigate(dayPath(d)) : undefined}
              bars={sumDays(days).map((d) => {
                const g = granularityOf(days.length)
                const labels = bucketLabels(d, g)
                return {
                  key: d.key,
                  value: d.u,
                  label: labels.label,
                  sublabel: labels.sublabel,
                  tip: (
                    <>
                      <b>{labels.title}</b>
                      <br />
                      {nf0(d.u)} unidades, {kgAmount(d.kg)}
                      <br />
                      {STATUS_LABEL[d.confirmed ? 'confirmed' : 'pending']}
                    </>
                  ),
                }
              })}
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
