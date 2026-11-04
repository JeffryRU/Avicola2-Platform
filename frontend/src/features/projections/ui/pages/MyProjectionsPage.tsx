import { useState } from 'react'
import { ChevronRight, Clock, Package, Plus, Scale } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import { paths } from '@/app/routes'
import {
  addDays,
  dDM,
  dDow,
  formatTime,
  today,
  weekDates,
  weekLabel,
  weekStart,
  type IsoDate,
} from '@/shared/domain/dates'
import { nf0, nf1 } from '@/shared/domain/format'
import { useRequiredSession } from '@/features/auth/ui/use-session'
import { versusReal, weekAgg, type MyDay } from '@/features/projections/domain/aggregation'
import { sumUnits, type Catalog } from '@/features/catalog/domain/catalog'
import { projectionsTable } from '@/features/projections/domain/export'
import { type ExportFormat } from '@/shared/domain/export'
import { Segmented } from '@/shared/ui/components/segmented'
import { ExportMenu } from '@/shared/ui/components/export-menu'
import { useCatalog } from '@/features/catalog/ui/hooks'
import { useMyDays, useQueue, useWindowData } from '@/features/projections/ui/hooks'
import { StatusBadge } from '@/shared/ui/components/feedback'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { Button } from '@/shared/ui/components/shadcn/button'
import { useIsMobile } from '@/shared/ui/hooks/use-is-mobile'
import { cn } from '@/shared/ui/lib/utils'
import { NOT_REGISTERED } from '@/shared/types/labels'

/** Hora local "HH:MM" de un instante ISO. */
const hhmm = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function ProjectionCard({
  date,
  day,
  catalog,
  index,
}: {
  date: IsoDate
  day?: MyDay
  catalog: Catalog
  index: number
}) {
  const now = today()
  const units = day ? sumUnits(day.units) : 0
  const kg = day ? catalog.kg(day.units) : 0
  return (
    <Link
      to={paths.day(date)}
      className={cn(
        'grid animate-rise grid-cols-[56px_minmax(0,1fr)_14px] items-center gap-x-3 gap-y-2.5 rounded-2xl bg-card px-3 py-3.5 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-lift dsk:grid-cols-[72px_minmax(0,1fr)_auto_18px] dsk:gap-3.5 dsk:p-4',
        date === now && 'shadow-[0_0_0_2px_var(--primary),var(--shadow-card)]',
      )}
      style={{ animationDelay: `${index * 0.04}s` }}
    >
      <span className="row-span-2 border-r pr-2.5 dsk:row-span-1">
        <span className="block font-semibold text-ink-2">{dDow(date)}</span>
        <b className="text-lg font-extrabold dsk:text-[21px]">{dDM(date)}</b>
      </span>
      <span>
        <div className="mb-1.5 font-extrabold">{day ? catalog.dayLabel(day.category, day.units) : NOT_REGISTERED}</div>
        <div className="grid gap-1 text-sm text-ink-2 [&_b]:text-foreground [&>span]:flex [&>span]:items-center [&>span]:gap-2">
          <span>
            <Package className="size-4" />
            <b>{nf0(units)}</b> unidades
          </span>
          <span>
            <Scale className="size-4" />
            <b>{nf1(kg)} kg</b> (aprox.)
          </span>
        </div>
      </span>
      <span className="col-start-2 row-start-2 flex flex-wrap items-center gap-3 dsk:col-start-auto dsk:row-start-auto dsk:grid dsk:justify-items-start dsk:gap-2.5">
        <StatusBadge kind={day ? 'confirmed' : 'pending'} />
        {day && <StatusBadge kind={day.sync === 'ok' ? 'synced' : 'queued'} />}
        <small className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="size-[15px]" />
          {day ? formatTime(hhmm(day.submittedAt)) : date >= now ? 'Por enviar' : 'Sin envío'}
        </small>
      </span>
      <ChevronRight className="col-start-3 row-span-2 row-start-1 size-[18px] dsk:col-start-auto dsk:row-span-1 dsk:row-start-auto" />
    </Link>
  )
}

export function MyProjectionsPage() {
  const [tab, setTab] = useState<'week' | 'hist'>('week')
  const { catalog } = useCatalog()
  const { days } = useMyDays()
  const { seller } = useRequiredSession()
  const data = useWindowData()
  const queue = useQueue().filter((q) => q.seller === seller.username)
  const { planning, exporter } = useContainer()
  const client = useQueryClient()
  const mobile = useIsMobile()
  const navigate = useNavigate()
  const current = weekStart(today())

  async function retry() {
    const r = await planning.flush(seller.username)
    if (r.sent) await client.invalidateQueries({ queryKey: ['window'] })
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
            <Button asChild className="h-[46px] rounded-xl font-bold">
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
          <div className="mb-3.5 flex flex-wrap items-center gap-3 rounded-[14px] bg-warn-soft px-3.5 py-2.5 text-[13.5px] text-warn">
            <b className="flex-1">
              {queue.length} {queue.length === 1 ? 'envío por sincronizar' : 'envíos por sincronizar'} en este
              dispositivo
            </b>
            <button type="button" className="font-bold hover:underline" onClick={retry}>
              Reintentar
            </button>
          </div>
        )}
        <Segmented
          full
          className="mb-3.5 max-w-[420px]"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'week', label: 'Semana actual' },
            { value: 'hist', label: 'Historial' },
          ]}
        />
        {!catalog ? null : tab === 'week' ? (
          <>
            <p className="mb-3 font-semibold text-muted-foreground">{weekLabel(current, true)}</p>
            <div className="grid gap-3 @5xl/main:grid-cols-2">
              {weekDates(current).map((d, i) => (
                <ProjectionCard key={d} date={d} day={days.get(d)} catalog={catalog} index={i} />
              ))}
            </div>
          </>
        ) : (
          <Section>
            {[1, 2, 3].map((i) => {
              const ws = addDays(current, -7 * i)
              const agg = weekAgg(ws, seller.username, data.data?.projections ?? [], data.data?.sales ?? [], catalog)
              const vs = versusReal(agg, catalog)
              return (
                <button
                  key={ws}
                  type="button"
                  onClick={() => navigate(`${paths.dashVersus}?semana=${ws}&vendedor=${seller.username}`)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto_14px] items-center gap-3 border-b border-muted px-[18px] py-4 text-left hover:bg-[#F8FBFF] dsk:grid-cols-[minmax(0,1fr)_repeat(3,auto)_18px] dsk:gap-5"
                >
                  <span>
                    <b className="block">Semana del {weekLabel(ws)}</b>
                    <small className="text-muted-foreground">
                      {agg.filter((d) => d.confirmed).length} de 7 días confirmados
                    </small>
                  </span>
                  <span className="hidden text-right dsk:block">
                    <b className="block">{nf0(agg.reduce((s, d) => s + d.u, 0))}</b>
                    <small className="text-muted-foreground">unidades</small>
                  </span>
                  <span className="hidden text-right dsk:block">
                    <b className="block">{nf1(agg.reduce((s, d) => s + d.kg, 0))} kg</b>
                    <small className="text-muted-foreground">proyectado</small>
                  </span>
                  <span className="text-right">
                    <b className="block text-ok">{nf1(vs.accuracyPct)}%</b>
                    <small className="text-muted-foreground">exactitud</small>
                  </span>
                  <ChevronRight className="size-[18px]" />
                </button>
              )
            })}
          </Section>
        )}
      </PageBody>
    </div>
  )
}
