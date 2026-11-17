import { Check, ChevronRight } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { paths } from '@/app/routes'
import {
  dDM,
  dDow,
  dDowLong,
  dFull,
  dShort,
  relativeDay,
  today,
  weekDates,
  weekStart,
  type IsoDate,
} from '@/shared/domain/dates'
import { closesLabel, useEditingWindow, MY_REQUESTS_SUBTITLE, MY_REQUESTS_TITLE } from '@/features/editing'
import { sumUnits } from '@/shared/domain/products'
import { roleLabel } from '@/shared/domain/session'
import { useRequiredSession } from '@/features/auth'
import { useCatalog } from '@/features/catalog'
import { useMyDays } from '@/features/projections'
import { useUnreadCount } from '@/features/notifications'
import { CountUp } from '@/shared/ui/components/charts'
import { Note, StatusDot } from '@/shared/ui/components/feedback'
import { Section } from '@/shared/ui/components/layout'
import { Button } from '@/shared/ui/components/shadcn/button'
import { cn } from '@/shared/ui/lib/utils'
import { UNITS_SHORT } from '@/shared/types/labels'
import { SyncStatus } from '@/shared/ui/components/sync-status'

/** "de mañana", "de pasado mañana" o "del Jue 05/11". */
function dayPhrase(date: IsoDate, ref: IsoDate): string {
  const rel = relativeDay(date, ref)
  return rel ? `de ${rel.toLowerCase()}` : `del ${dShort(date)}`
}

/** Inicio del vendedor: primero lo que falta (la proyección pendiente), después su semana. */
export function HomePage() {
  const { seller } = useRequiredSession()
  const navigate = useNavigate()
  const { days, isLoading: daysLoading } = useMyDays()
  const { catalog } = useCatalog()
  const unread = useUnreadCount()
  const now = today()
  const editingWindow = useEditingWindow()
  // El próximo día que todavía se puede registrar (mañana, salvo que ya haya pasado el corte).
  const next = editingWindow.data?.days.find((d) => d.open)
  // El aviso y la semana dependen de las dos consultas: hasta tenerlas no se dibujan, para no
  // anunciar por un instante "falta" lo que ya está confirmado ni mover la página al llegar.
  // Pero no se espera para siempre: sin red (consulta en pausa) o con el servidor fallando
  // (ya hubo un intento fallido), se dibuja con lo que hay y SyncStatus avisa.
  const windowSettled =
    !editingWindow.isPending || editingWindow.fetchStatus === 'paused' || editingWindow.failureCount > 0
  const ready = !daysLoading && windowSettled
  const week = weekDates(weekStart(now))
  const confirmed = week.filter((d) => days.has(d)).length
  const weekUnits = week.reduce((s, d) => s + sumUnits(days.get(d)?.units), 0)
  const weekKg = catalog ? week.reduce((s, d) => s + catalog.kg(days.get(d)?.units ?? {}), 0) : 0

  const links = [
    { to: paths.mine, title: 'Mis proyecciones', sub: 'Lo que ya confirmaste, día por día' },
    { to: paths.requests, title: MY_REQUESTS_TITLE, sub: MY_REQUESTS_SUBTITLE },
    { to: paths.dashVersus, title: 'Historial y seguimiento', sub: 'Ventas reales vs. proyección' },
    { to: paths.products, title: 'Productos', sub: 'Presentaciones y conversión a kilos' },
    { to: paths.notifications, title: 'Notificaciones', sub: unread ? `${unread} sin leer` : 'Alertas y mensajes' },
  ]

  return (
    <div className="px-4 pt-5 dsk:p-0">
      <header className="mb-4 dsk:mb-6">
        <p className="text-sm text-muted-foreground">
          {seller.name} · {roleLabel(seller)}
        </p>
        <h1 className="text-2xl font-semibold hc:text-3xl hc:font-extrabold">
          {dDowLong(now)} {dFull(now)}
        </h1>
      </header>

      <SyncStatus queries={[editingWindow]} />
      {!ready ? (
        <p role="status" className="sr-only">
          Cargando tu semana…
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 @4xl/main:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] @4xl/main:items-start">
          <div className="grid gap-4">
            {next && !days.has(next.date) && (
              <section
                aria-label="Pendiente"
                className="grid gap-3 rounded-md border border-warn-border bg-warn-soft p-4 hc:p-5"
              >
                <div>
                  <b className="block font-semibold hc:text-lg hc:font-extrabold">
                    Falta tu proyección {dayPhrase(next.date, now)}
                  </b>
                  <span className="text-sm text-warn-foreground hc:text-md">
                    {closesLabel(next.closes_at, true, now)}. Confírmala para que entre a la planificación.
                  </span>
                </div>
                <Button
                  className="w-full dsk:w-auto dsk:justify-self-start"
                  onClick={() => navigate(`${paths.register}?dia=${next.date}`)}
                >
                  Registrar proyección
                </Button>
              </section>
            )}
            {next && days.has(next.date) && (
              <Note tone="ok" icon={<Check />}>
                <span>
                  Tu proyección {dayPhrase(next.date, now)} ya está confirmada.{' '}
                  <Link
                    to={paths.day(next.date)}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Ver detalle
                  </Link>
                </span>
              </Note>
            )}

            <Section
              title="Tu semana"
              aside={
                <span>
                  <span className="num">{confirmed}/7</span> confirmados
                </span>
              }
            >
              <ol className="grid grid-cols-7 px-1 py-2 text-center">
                {week.map((d) => {
                  const ok = days.has(d)
                  const due = !ok && d === next?.date
                  const state = ok ? 'confirmado' : due ? 'pendiente' : 'sin registrar'
                  return (
                    <li key={d}>
                      <Link
                        to={paths.day(d)}
                        aria-label={`${dShort(d)}: ${state}`}
                        className={cn(
                          // Esquinas redondeadas y un borde tenue para el día de hoy.
                          'flex min-h-touch flex-col items-center gap-1 rounded-xl py-2 text-sm transition-colors hover:bg-muted',
                          due && 'font-semibold text-warn hc:bg-warn-soft hc:text-foreground',
                          d === now && 'ring-1 ring-border ring-inset hc:ring-border-strong',
                        )}
                      >
                        <span className={cn('text-xs', !due && 'text-muted-foreground')}>{dDow(d)}</span>
                        <span className="num">{dDM(d).slice(0, 2)}</span>
                        {/* Punto en A; en alto contraste, texto (el estado no depende del color). */}
                        <span className="hc:hidden">
                          {ok ? (
                            <StatusDot tone="ok" />
                          ) : due ? (
                            <StatusDot tone="warn" />
                          ) : (
                            <span aria-hidden className="block size-2 rounded-full bg-control-line" />
                          )}
                        </span>
                        <span aria-hidden className="hidden text-xs font-bold hc:block">
                          {ok ? '✓' : due ? 'falta' : '—'}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ol>
            </Section>

            <Section
              title="Esta semana"
              aside={
                <Link to={paths.dashSummary} className="font-medium text-primary underline-offset-4 hover:underline">
                  Ver resumen
                </Link>
              }
            >
              <dl className="grid">
                <div className="flex items-baseline justify-between gap-3 border-b border-rule px-4 py-3 dsk:px-5">
                  <dt className="text-ink-2">Proyectado</dt>
                  <dd className="num font-medium hc:text-lg hc:font-extrabold">
                    <CountUp value={weekUnits} /> {UNITS_SHORT}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 px-4 py-3 dsk:px-5">
                  <dt className="text-ink-2">Kilos aprox.</dt>
                  <dd className="num font-medium hc:text-lg hc:font-extrabold">
                    <CountUp value={weekKg} decimals={1} /> kg
                  </dd>
                </div>
              </dl>
            </Section>
          </div>

          <Section title="Accesos">
            <ul>
              {links.map((l) => (
                <li key={l.to} className="border-b border-rule last:border-0">
                  <Link
                    to={l.to}
                    className="flex min-h-touch items-center gap-3 px-4 py-3 transition-colors hover:bg-muted dsk:px-5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{l.title}</span>
                      <small className="block text-sm text-muted-foreground">{l.sub}</small>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}
    </div>
  )
}
