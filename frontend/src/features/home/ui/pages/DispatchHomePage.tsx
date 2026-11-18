import { ChevronRight, Factory, TrendingUp, Warehouse } from 'lucide-react'
import { Link } from 'react-router'
import { paths } from '@/app/routes'
import { addDays, clockTime, dDowLong, dFull, dShort, today, type IsoDate } from '@/shared/domain/dates'
import { nf0 } from '@/shared/domain/format'
import { FORECAST_NAV_LABEL, PRODUCTION_TITLE, useProduction } from '@/features/production'
import { STOCK_TITLE, useStock } from '@/features/stock'
import { StatusDot } from '@/shared/ui/components/feedback'
import { Kpi, KpiStrip, PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { kgAmount, unitsCount } from '@/shared/types/labels'
import { cn } from '@/shared/ui/lib/utils'
import { DataTable } from '@/shared/ui/components/data-table'

/** Días que muestra la tabla «Últimos días». */
const DAYS = 7

const PENDING = 'Pendiente'
const RECORDED = 'Registrado'

/** Acceso directo a una pantalla de trabajo. */
function Shortcut({ to, icon: Icon, title, sub }: { to: string; icon: typeof Warehouse; title: string; sub: string }) {
  return (
    <Link
      to={to}
      className="flex min-h-touch items-center gap-3 border-b border-rule px-4 py-3 transition-colors last:border-0 hover:bg-muted dsk:px-5"
    >
      <span className="grid size-9 flex-none place-items-center rounded-md bg-selected text-selected-foreground hc:bg-brand-accent hc:text-foreground">
        <Icon aria-hidden className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block font-medium">{title}</b>
        <small className="block text-sm text-muted-foreground">{sub}</small>
      </span>
      <ChevronRight aria-hidden className="size-4 flex-none text-muted-foreground" />
    </Link>
  )
}

function State({ done }: { done: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', !done && 'font-medium text-warn hc:font-bold')}>
      <StatusDot tone={done ? 'ok' : 'warn'} />
      {done ? RECORDED : PENDING}
    </span>
  )
}

/** Inicio del jefe de despacho: qué falta registrar hoy, cómo van los últimos días y accesos directos. */
export function DispatchHomePage() {
  const now = today()
  const from = addDays(now, -(DAYS - 1))
  const stock = useStock(from, now)
  const production = useProduction(from, now)
  const stockByDay = new Map((stock.data ?? []).map((d) => [d.date, d]))
  const prodByDay = new Map((production.data ?? []).map((d) => [d.date, d]))
  const stockToday = stockByDay.get(now)
  const prodToday = prodByDay.get(now)
  const days: IsoDate[] = Array.from({ length: DAYS }, (_, i) => addDays(now, -i))
  const loading = stock.isLoading || production.isLoading
  const pendingDays = days.filter((d) => !stockByDay.has(d) || !prodByDay.has(d)).length

  return (
    <div>
      <PageHeader title="Despacho de hoy" subtitle={`${dDowLong(now)} ${dFull(now)}`} back={null} />
      <PageBody className="grid gap-4">
        <KpiStrip>
          <Kpi
            label={`${STOCK_TITLE} · hoy`}
            value={stockToday ? unitsCount(stockToday.total_units) : loading ? '…' : '—'}
            foot={
              <>
                <State done={!!stockToday} />
                {stockToday && <span>{kgAmount(stockToday.total_kg)}</span>}
              </>
            }
          />
          <Kpi
            label={`${PRODUCTION_TITLE} · hoy`}
            value={prodToday ? unitsCount(prodToday.produced) : loading ? '…' : '—'}
            foot={
              <>
                <State done={!!prodToday} />
                {prodToday && <span>de {nf0(prodToday.ordered)} pedidas</span>}
              </>
            }
          />
          <Kpi
            label="Calidad B · hoy"
            value={prodToday ? unitsCount(prodToday.quality_b) : '—'}
            foot={
              prodToday && prodToday.produced > 0
                ? `${nf0((prodToday.quality_b / prodToday.produced) * 100)} % de lo producido`
                : undefined
            }
          />
          <Kpi
            label="Días con algo pendiente"
            value={loading ? '…' : `${String(pendingDays)} de ${String(DAYS)}`}
            foot="Stock o producción sin registrar"
          />
        </KpiStrip>

        <div className="grid items-start gap-4 dsk:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <Section title="Últimos días" aside={`${dShort(from)} – ${dShort(now)}`}>
            <DataTable
              dense
              rows={days}
              rowKey={(d) => d}
              columns={[
                {
                  key: 'day',
                  header: 'Día',
                  cell: (d) => <b className="font-medium">{d === now ? 'Hoy' : dShort(d)}</b>,
                },
                {
                  key: 'stock',
                  header: 'Stock',
                  cell: (d) => {
                    const s = stockByDay.get(d)
                    return s ? (
                      <span className="num">
                        {unitsCount(s.total_units)}
                        <small className="block text-xs text-muted-foreground">
                          {s.recorded_by} · {clockTime(s.recorded_at)}
                        </small>
                      </span>
                    ) : (
                      <State done={false} />
                    )
                  },
                },
                {
                  key: 'production',
                  header: 'Producción',
                  cell: (d) => {
                    const p = prodByDay.get(d)
                    return p ? <span className="num">{unitsCount(p.produced)}</span> : <State done={false} />
                  },
                },
              ]}
            />
          </Section>

          <Section title="Accesos directos">
            <Shortcut
              to={paths.stock}
              icon={Warehouse}
              title={stockToday ? 'Corregir el stock de hoy' : 'Registrar el stock de hoy'}
              sub="Lo que quedó en despacho al cierre, por lote"
            />
            <Shortcut
              to={paths.production}
              icon={Factory}
              title={prodToday ? 'Corregir la producción de hoy' : 'Registrar la producción de hoy'}
              sub="Lo pedido a granja y lo que llegó"
            />
            <Shortcut
              to={paths.forecast}
              icon={TrendingUp}
              title={FORECAST_NAV_LABEL}
              sub="Cuánto llegará en los próximos días"
            />
          </Section>
        </div>
      </PageBody>
    </div>
  )
}
