import { useState } from 'react'
import { ChevronRight, Clock, Plus, RefreshCw } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useContainer } from '@/app/di'
import { paths } from '@/app/routes'
import {
  addDays,
  dDM,
  dDow,
  today,
  weekDates,
  weekLabel,
  weekStart,
  type IsoDate,
  clockTime,
} from '@/shared/domain/dates'
import { nf0, nf1 } from '@/shared/domain/format'
import { useRequiredSession } from '@/features/auth'
import { versusReal, weekAgg, type MyDay } from '@/features/projections/domain/aggregation'
import { sumUnits } from '@/shared/domain/products'
import { type Catalog, useCatalog } from '@/features/catalog'
import { projectionsTable } from '@/features/projections/domain/export'
import { type ExportFormat } from '@/shared/domain/export'
import { Segmented } from '@/shared/ui/components/segmented'
import { ExportMenu } from '@/shared/ui/components/export-menu'
import { useFlushQueue, useMyDays, useQueue, useWindowData } from '@/features/projections/ui/hooks'
import { Note, StatusBadge } from '@/shared/ui/components/feedback'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { Button } from '@/shared/ui/components/shadcn/button'
import { useIsMobile } from '@/shared/ui/hooks/use-is-mobile'
import { cn } from '@/shared/ui/lib/utils'
import { NOT_REGISTERED, RETRY_LABEL, kgAmount } from '@/shared/types/labels'

/** Una fila por día de la semana: fecha, qué se proyectó, estado y hora de envío. */
function ProjectionRow({ date, day, catalog }: { date: IsoDate; day?: MyDay; catalog: Catalog }) {
  const now = today()
  const units = day ? sumUnits(day.units) : 0
  const kg = day ? catalog.kg(day.units) : 0
  return (
    <li className="border-b border-rule last:border-0">
      <Link
        to={paths.day(date)}
        aria-current={date === now ? 'date' : undefined}
        className={cn(
          'grid grid-cols-[3.5rem_minmax(0,1fr)_1rem] items-center gap-x-3 gap-y-1 px-4 py-3 transition-colors hover:bg-muted dsk:grid-cols-[4.5rem_minmax(0,1fr)_8rem_10rem_1rem] dsk:gap-4 dsk:px-5',
          date === now && 'bg-selected/50 hc:bg-muted',
        )}
      >
        <span className="row-span-2 dsk:row-span-1">
          <span
            className={cn(
              'block text-sm text-muted-foreground',
              date === now && 'font-semibold text-primary hc:text-foreground',
            )}
          >
            {date === now ? 'Hoy' : dDow(date)}
          </span>
          <b className="num text-md font-medium">{dDM(date)}</b>
        </span>
        <span className="min-w-0">
          <span className={cn('block font-medium', !day && 'text-muted-foreground')}>
            {day ? catalog.dayLabel(day.category, day.units) : NOT_REGISTERED}
          </span>
          {day && (
            <span className="num text-sm text-ink-2">
              {nf0(units)} unid. · {kgAmount(kg)} (aprox.)
            </span>
          )}
        </span>
        <span className="col-start-2 row-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 dsk:contents">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 dsk:grid dsk:gap-1">
            <StatusBadge kind={day ? 'confirmed' : 'pending'} />
            {day && <StatusBadge kind={day.sync === 'ok' ? 'synced' : 'queued'} />}
          </span>
          <small className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="size-3.5" aria-hidden />
            {day ? <span className="num">{clockTime(day.submittedAt)}</span> : date >= now ? 'Por enviar' : 'Sin envío'}
          </small>
        </span>
        <ChevronRight
          aria-hidden
          className="col-start-3 row-span-2 row-start-1 size-4 text-muted-foreground dsk:col-start-auto dsk:row-span-1 dsk:row-start-auto"
        />
      </Link>
    </li>
  )
}

export function MyProjectionsPage() {
  const [tab, setTab] = useState<'week' | 'hist'>('week')
  const { catalog } = useCatalog()
  const { days } = useMyDays()
  const { seller } = useRequiredSession()
  const data = useWindowData()
  const queue = useQueue().filter((q) => q.seller === seller.username)
  const { exporter } = useContainer()
  const flushQueue = useFlushQueue()
  const mobile = useIsMobile()
  const navigate = useNavigate()
  const current = weekStart(today())

  async function retry() {
    const r = await flushQueue.mutateAsync(seller.username)
    toast(
      r.sent
        ? `${r.sent} ${r.sent === 1 ? 'envío sincronizado' : 'envíos sincronizados'}`
        : 'No se pudo sincronizar. Se intentará de nuevo.',
    )
  }

  async function exportAs(format: ExportFormat) {
    if (!catalog) return
    const table = projectionsTable([...days.values()], catalog, seller.name, new Date())
    try {
      await exporter.export(table, format, `proyecciones_${seller.username}_${today()}`)
      toast.success(`Archivo descargado (${table.rows.length} filas)`)
    } catch {
      toast.error('No se pudo generar el archivo. Inténtalo de nuevo.')
    }
  }
  const nothing = days.size === 0

  return (
    <div>
      <PageHeader
        title="Mis proyecciones"
        subtitle={mobile ? undefined : 'Tus proyecciones confirmadas y pendientes por día.'}
        actions={
          <div className="flex gap-2.5">
            <ExportMenu onExport={exportAs} disabled={!catalog || nothing} />
            <Button asChild>
              <Link to={paths.register}>
                <Plus /> Nueva proyección
              </Link>
            </Button>
          </div>
        }
        mobileActions={<ExportMenu compact onExport={exportAs} disabled={!catalog || nothing} />}
      />
      <PageBody>
        {queue.length > 0 && (
          <Note tone="warn" icon={<RefreshCw />} className="mb-4 items-center">
            <b className="min-w-0 flex-1">
              {queue.length} {queue.length === 1 ? 'envío por sincronizar' : 'envíos por sincronizar'} en este
              dispositivo
            </b>
            <Button variant="outline" size="sm" onClick={retry}>
              {RETRY_LABEL}
            </Button>
          </Note>
        )}
        <Segmented
          full
          className="mb-4 max-w-md"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'week', label: 'Semana actual' },
            { value: 'hist', label: 'Historial' },
          ]}
        />
        {!catalog ? null : tab === 'week' ? (
          <Section title={weekLabel(current, true)}>
            <ul>
              {weekDates(current).map((d) => (
                <ProjectionRow key={d} date={d} day={days.get(d)} catalog={catalog} />
              ))}
            </ul>
          </Section>
        ) : (
          <Section title="Semanas anteriores">
            {[1, 2, 3].map((i) => {
              const ws = addDays(current, -7 * i)
              const agg = weekAgg(ws, [seller.username], data.data?.projections ?? [], data.data?.sales ?? [], catalog)
              const vs = versusReal(agg, catalog)
              return (
                <button
                  key={ws}
                  type="button"
                  onClick={() => navigate(`${paths.dashVersus}?semana=${ws}&vendedor=${seller.username}`)}
                  className="grid min-h-touch w-full grid-cols-[minmax(0,1fr)_auto_1rem] items-center gap-3 border-b border-rule px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted dsk:grid-cols-[minmax(0,1fr)_repeat(3,8rem)_1rem] dsk:gap-5 dsk:px-5"
                >
                  <span>
                    <b className="block font-medium">Semana del {weekLabel(ws)}</b>
                    <small className="text-muted-foreground">
                      {agg.filter((d) => d.confirmed).length} de 7 días confirmados
                    </small>
                  </span>
                  <span className="hidden text-right dsk:block">
                    <b className="num block font-medium">{nf0(agg.reduce((s, d) => s + d.u, 0))}</b>
                    <small className="text-muted-foreground">unidades</small>
                  </span>
                  <span className="hidden text-right dsk:block">
                    <b className="num block font-medium">{kgAmount(agg.reduce((s, d) => s + d.kg, 0))}</b>
                    <small className="text-muted-foreground">proyectado</small>
                  </span>
                  <span className="text-right">
                    <b className="num block font-medium">{nf1(vs.accuracyPct)}%</b>
                    <small className="text-muted-foreground">exactitud</small>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </button>
              )
            })}
          </Section>
        )}
      </PageBody>
    </div>
  )
}
