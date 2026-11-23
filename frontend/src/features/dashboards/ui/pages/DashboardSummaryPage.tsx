import { SyncStatus } from '@/shared/ui/components/sync-status'
import { granularityOf } from '@/features/dashboards/domain/buckets'
import { ProjectionBars } from '@/features/dashboards/ui/components/projection-bars'
import { useNavigate } from 'react-router'
import { rangeLabel } from '@/shared/domain/dates'
import { periodAgg } from '@/features/projections'
import { previousDates } from '@/features/dashboards/domain/period'
import { DashboardTabs, Delta } from '@/features/dashboards/ui/components/dashboard'
import { useCatalog } from '@/features/catalog'
import { CountUp } from '@/shared/ui/components/charts'
import { Kpi, KpiStrip, PageBody, PageHeader } from '@/shared/ui/components/layout'
import { UNITS_SHORT } from '@/shared/types/labels'
import {
  useDayPath,
  useDetailSelection,
  usePeriodData,
  useDashboardFilters,
  useStoreEntries,
} from '@/features/dashboards/ui/hooks'
import { addStores } from '@/features/dashboards/domain/product-matrix'
import { DetailFilterMenus, ProductDetail } from '@/features/dashboards/ui/components/product-detail'
import { DashboardFilterBar } from '@/features/dashboards/ui/components/filter-bar'
import { onlyProducts } from '@/features/dashboards/domain/sheets'
import type { Units } from '@/shared/domain/products'
import {
  MONTH_SUMMARY_TITLE,
  NO_ZONE_LABEL,
  PERIOD_SUMMARY_TITLE,
  WEEK_SUMMARY_TITLE,
} from '@/features/dashboards/types/product-detail'

const SUMMARY_TITLE = { week: WEEK_SUMMARY_TITLE, month: MONTH_SUMMARY_TITLE, custom: PERIOD_SUMMARY_TITLE }

/** Vendedor que no existe: para que un filtro sin coincidencias no muestre a todos. */
const NO_SELLER = '·'

export function DashboardSummaryPage() {
  const { period, sellers } = useDashboardFilters()
  // Lo que se proyecta (brasas y pollo sin menudencia); el resto del catálogo es del stock.
  const { projection: catalog } = useCatalog()
  const data = usePeriodData(period)
  const navigate = useNavigate()
  const dayPath = useDayPath()
  const detail = useDetailSelection(period.dates, catalog)
  const subtitle = SUMMARY_TITLE[period.kind]
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
  // Lo que piden las tiendas se suma a los totales y al gráfico (no a los días confirmados).
  const stores = onlyProducts(useStoreEntries(period.dates, sellers, detail.zones), ids)
  const kgOf = (u: Units) => catalog.kg(u)
  const allDays = addStores(periodAgg(period.dates, scope, projections, sales, catalog), stores, kgOf)
  const days = detail.days.length ? allDays.filter((d) => detail.days.includes(d.date)) : allDays
  const prevAll = addStores(periodAgg(previousDates(period), scope, projections, sales, catalog), stores, kgOf)
  const prev = detail.days.length ? prevAll.filter((_, i) => detail.days.includes(allDays[i].date)) : prevAll
  // Variación contra los mismos días confirmados del período anterior.
  const same = prev.filter((_, i) => days[i].confirmed)
  const units = days.reduce((s, d) => s + d.u, 0)
  const kg = days.reduce((s, d) => s + d.kg, 0)
  const confirmed = days.filter((d) => d.confirmed).length

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
            tone="primary"
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
            tone="kg"
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
            tone={confirmed === days.length && days.length > 0 ? 'ok' : 'warn'}
            label="Días confirmados"
            value={
              <>
                {confirmed}{' '}
                <span className="font-sans text-md font-normal text-muted-foreground">de {days.length}</span>
              </>
            }
          />
          <Kpi label="Productos" value={catalog.products.length} foot="en la proyección" />
        </KpiStrip>
        <div className="mb-4">
          <ProjectionBars
            title="Proyección por día"
            hint="Elige una barra para ver el día"
            days={days}
            period={rangeLabel(period.from, period.to, true)}
            // Por día, la barra lleva al detalle del día; por semana o mes, no.
            onSelect={granularityOf(days.length) === 'day' ? (d) => void navigate(dayPath(d)) : undefined}
          />
        </div>
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
