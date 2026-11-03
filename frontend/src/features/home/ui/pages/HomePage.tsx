import { AlertCircle, BarChart3, Bell, Box, ChevronRight, Clock, Check, Package, Plus, ShoppingBag } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { paths } from '@/app/routes'
import { dDM, dDow, greeting, today, weekDates, weekStart } from '@/shared/domain/dates'
import { sumUnits } from '@/features/catalog/domain/catalog'
import { roleLabel } from '@/features/auth/domain/session'
import { useRequiredSession } from '@/features/auth/ui/use-session'
import { useCatalog } from '@/features/catalog/ui/hooks'
import { useMyDays } from '@/features/projections/ui/hooks'
import { useUnreadCount } from '@/features/notifications/ui/hooks'
import { BRANDS, BrandMark, useBrand } from '@/shared/ui/components/brand'
import { CountUp } from '@/shared/ui/components/charts'
import { Note } from '@/shared/ui/components/feedback'
import { Section } from '@/shared/ui/components/layout'
import { Button } from '@/shared/ui/components/shadcn/button'
import { cn } from '@/shared/ui/lib/utils'

/** Hora límite para confirmar la proyección del día (mensaje informativo del mockup). */

export function HomePage() {
  const { seller } = useRequiredSession()
  const { brand } = useBrand()
  const navigate = useNavigate()
  const { days } = useMyDays()
  const { catalog } = useCatalog()
  const unread = useUnreadCount()
  const now = today()
  const week = weekDates(weekStart(now))
  const confirmed = week.filter((d) => days.has(d)).length
  const weekUnits = week.reduce((s, d) => s + sumUnits(days.get(d)?.units), 0)
  const weekKg = catalog ? week.reduce((s, d) => s + catalog.kg(days.get(d)?.units ?? {}), 0) : 0

  const menu = [
    { to: paths.register, icon: Plus, color: 'bg-t-blue', title: 'Nueva proyección', sub: 'Proyecta por producto' },
    { to: paths.mine, icon: Clock, color: 'bg-t-green', title: 'Mis proyecciones', sub: 'Proyecciones confirmadas' },
    {
      to: paths.dashVersus,
      icon: BarChart3,
      color: 'bg-t-purple',
      title: 'Historial y seguimiento',
      sub: 'Ventas reales vs. proyección',
    },
    { to: paths.products, icon: Box, color: 'bg-t-amber', title: 'Productos', sub: 'Información y conversiones' },
    {
      to: paths.notifications,
      icon: Bell,
      color: 'bg-t-red',
      title: 'Notificaciones',
      sub: unread ? `${unread} sin leer` : 'Alertas y mensajes',
    },
  ]

  return (
    <div>
      <section className="relative overflow-hidden bg-head px-[18px] pt-[18px] pb-[54px] text-white dsk:hidden">
        <div className="absolute -top-[70px] -right-[60px] size-[220px] rounded-full border-[30px] border-white/5" />
        <div className="relative z-10 flex items-center gap-3">
          <BrandMark size={48} onDark />
          <span className="text-[30px] font-extrabold tracking-[-0.04em]">{BRANDS[brand].name}</span>
          <Link
            to={paths.notifications}
            aria-label="Notificaciones"
            className="relative ml-auto grid size-[42px] place-items-center rounded-xl"
          >
            <Bell className={cn('size-[26px]', unread && 'animate-ring')} />
            {unread > 0 && (
              <span className="absolute top-2 right-[9px] size-[9px] rounded-full border-2 border-head bg-destructive" />
            )}
          </Link>
        </div>
      </section>
      <div className="relative -mt-[30px] rounded-t-3xl bg-background px-4 pt-5 pb-1 dsk:m-0 dsk:mb-1 dsk:rounded-none dsk:bg-transparent dsk:p-0">
        <h1 className="text-[27px] font-extrabold">
          {greeting()}, {seller.name.split(' ')[0]}!
        </h1>
        <p className="mt-1 text-base text-muted-foreground">{roleLabel(seller)}</p>
      </div>

      <div className="mt-3.5 px-4 dsk:px-0">
        {!days.has(now) && (
          <Note tone="warn" icon={<AlertCircle />} className="mb-3.5">
            <div className="min-w-0 flex-1">
              <b>Tu proyección de hoy está pendiente.</b>
              <br />
              Confírmala para que entre a la planificación de producción.
            </div>
            <Button
              className="h-10 w-full font-bold dsk:w-auto"
              onClick={() => navigate(`${paths.register}?dia=${now}`)}
            >
              Completar
            </Button>
          </Note>
        )}

        <div className="grid gap-3 dsk:grid-cols-3 dsk:gap-4">
          {menu.map((m, i) => (
            <Link
              key={m.to}
              to={m.to}
              className="flex animate-rise items-center gap-4 rounded-2xl bg-card px-4 py-3.5 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-lift dsk:p-5"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <span className={cn('grid size-[58px] flex-none place-items-center rounded-[14px] text-white', m.color)}>
                <m.icon className="size-7" strokeWidth={2.2} />
              </span>
              <span className="min-w-0 flex-1">
                <b className="block text-[17.5px] font-extrabold">{m.title}</b>
                <small className="mt-0.5 block text-[14.5px] text-muted-foreground">{m.sub}</small>
              </span>
              <ChevronRight className="size-[22px] text-ink-2" />
            </Link>
          ))}
        </div>

        <div className="mt-3 grid gap-3 dsk:mt-4 dsk:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] dsk:gap-4">
          <Section
            title="Tu semana"
            aside={<span className="text-muted-foreground">{confirmed} de 7 días confirmados</span>}
          >
            <div className="grid grid-cols-7 gap-1 px-4 pt-1.5 pb-4 dsk:gap-2 dsk:px-5 dsk:pb-5">
              {week.map((d, i) => {
                const ok = days.has(d)
                return (
                  <Link
                    key={d}
                    to={paths.day(d)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-[10px] bg-card px-0.5 py-2 text-center shadow-card transition hover:-translate-y-0.5 dsk:rounded-[14px] dsk:px-1 dsk:py-3',
                      d === now && 'outline-2 -outline-offset-2 outline-primary',
                    )}
                  >
                    <b className="text-xs dsk:text-sm">{dDow(d)}</b>
                    <small className="text-[10.5px] text-muted-foreground dsk:text-xs">{dDM(d)}</small>
                    <span
                      className={cn(
                        'mt-1 grid size-6 animate-popin place-items-center rounded-full text-white dsk:size-[30px]',
                        ok ? 'bg-ok' : 'bg-pend',
                      )}
                      style={{ animationDelay: `${0.2 + i * 0.06}s` }}
                    >
                      {ok ? (
                        <Check className="size-4" strokeWidth={2.6} />
                      ) : (
                        <Clock className="size-4" strokeWidth={2.6} />
                      )}
                    </span>
                  </Link>
                )
              })}
            </div>
          </Section>
          <Section
            title="Esta semana"
            aside={
              <Link to={paths.dashSummary} className="font-bold text-primary hover:underline">
                Ver resumen
              </Link>
            }
          >
            <div className="grid px-4 pb-4 dsk:px-5 dsk:pb-5">
              <div className="grid grid-cols-[24px_1fr_auto] items-center gap-3 border-b border-muted py-[13px]">
                <Package className="size-5" />
                <span className="text-ink-2">Total proyectado</span>
                <b>
                  <CountUp value={weekUnits} /> unid.
                </b>
              </div>
              <div className="grid grid-cols-[24px_1fr_auto] items-center gap-3 py-[13px]">
                <ShoppingBag className="size-5" />
                <span className="text-ink-2">Total en kilos</span>
                <b>
                  <CountUp value={weekKg} decimals={1} /> kg
                </b>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}
