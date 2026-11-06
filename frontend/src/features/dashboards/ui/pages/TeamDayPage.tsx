import { ChevronLeft, ChevronRight, Package, Pencil, ShoppingBag, ShoppingCart, Users } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router'
import { paths } from '@/app/routes'
import { addDays, dDowLong, dFull, formatTime, hhmm, today, type IsoDate } from '@/shared/domain/dates'
import { nf0, nf1 } from '@/shared/domain/format'
import { isoDateSchema } from '@/shared/domain/schemas'
import { sumUnits } from '@/features/catalog/domain/catalog'
import { useCatalog } from '@/features/catalog/ui/hooks'
import { teamDay } from '@/features/dashboards/domain/team-day'
import { useSellers } from '@/features/dashboards/ui/hooks'
import { dataWindow, useWindowData } from '@/features/projections/ui/hooks'
import { CountUp, Donut } from '@/shared/ui/components/charts'
import { Note, StatusBadge } from '@/shared/ui/components/feedback'
import { Kpi, PageBody, PageHeader, Section, tableCls } from '@/shared/ui/components/layout'
import { Button } from '@/shared/ui/components/shadcn/button'
import { cn } from '@/shared/ui/lib/utils'
import { useFirstEditableDay } from '@/features/editing/ui/hooks'
import { NOT_REGISTERED, UNITS_SHORT } from '@/shared/types/labels'

/** Ruta /dashboards/dia/:date: detalle de un día para el supervisor. */
export function TeamDayPage() {
  const { date = '' } = useParams()
  if (!isoDateSchema.safeParse(date).success) return <Navigate to={paths.dashSummary} replace />
  return (
    <TeamDayView
      date={date}
      title="Detalle del día"
      subtitle={`${dDowLong(date)} ${dFull(date)} · todo el equipo`}
      back={paths.dashSummary}
    />
  )
}

/** Qué proyectó cada vendedor en un día y el total del equipo (también es el Inicio del supervisor). */
export function TeamDayView({
  date,
  title,
  subtitle,
  back,
}: {
  date: IsoDate
  title: string
  subtitle: string
  back: string | null
}) {
  const { catalog } = useCatalog()
  const sellers = useSellers().data
  const data = useWindowData()
  const firstEditable = useFirstEditableDay()
  if (!catalog || !sellers || !data.data) return <PageHeader title={title} subtitle={subtitle} back={back} />

  const day = teamDay(date, sellers, data.data.projections, data.data.sales, catalog)
  const pending = day.rows.filter((r) => !r.confirmed)
  // El supervisor edita cualquier día de la ventana (aunque haya cerrado): desde mañana.
  const editable = date >= firstEditable
  const { from, to } = dataWindow()
  const prev = addDays(date, -1)
  const next = addDays(date, 1)
  const products = catalog.products.filter((p) => (day.units[p.id] ?? 0) > 0 || (day.real?.[p.id] ?? 0) > 0)
  const dayNav = (
    <div className="flex items-center gap-2">
      <DayLink to={prev} disabled={prev < from} label="Día anterior" icon={<ChevronLeft />} />
      <DayLink to={next} disabled={next > to} label="Día siguiente" icon={<ChevronRight />} />
    </div>
  )

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} back={back} actions={dayNav} mobileActions={dayNav} />
      <PageBody>
        <div className="mb-3 grid grid-cols-2 gap-2.5 dsk:mb-4 dsk:gap-4 @4xl/main:grid-cols-4">
          <Kpi
            icon={<Package />}
            tone="bg-secondary text-primary"
            label="Total proyectado"
            value={
              <>
                <CountUp value={day.u} /> {UNITS_SHORT}
              </>
            }
            index={0}
          />
          <Kpi
            icon={<ShoppingBag />}
            tone="bg-ok-soft text-ok"
            label="Total en kilos (aprox.)"
            value={
              <>
                <CountUp value={day.kg} decimals={1} /> kg
              </>
            }
            index={1}
          />
          <Kpi
            label="Vendedores que confirmaron"
            value={`${day.confirmed} de ${day.rows.length}`}
            extra={<Donut pct={day.rows.length ? (day.confirmed / day.rows.length) * 100 : 0} />}
            index={2}
          />
          <Kpi
            icon={<ShoppingCart />}
            tone="bg-warn-soft text-warn"
            label="Venta real (ERP)"
            value={day.realKg === null ? '-' : `${nf1(day.realKg)} kg`}
            foot={day.realKg === null ? 'aún sin datos' : 'de los vendedores con venta'}
            index={3}
          />
        </div>

        {pending.length > 0 && date >= today() && (
          <Note tone="warn" icon={<Users />} className="mb-3 dsk:mb-4">
            <div>
              Falta{pending.length === 1 ? '' : 'n'} <b>{pending.length}</b> por confirmar:{' '}
              {pending.map((r) => r.seller.name).join(', ')}.
            </div>
          </Note>
        )}

        <div className="grid gap-4 @7xl/main:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Section title="Por vendedor" aside={<span className="text-muted-foreground">{day.rows.length}</span>}>
            <div className="overflow-x-auto px-3 pb-3.5">
              <table className={tableCls.table}>
                <thead>
                  <tr>
                    <th className={tableCls.th}>Vendedor</th>
                    <th className={tableCls.th}>Estado</th>
                    <th className={tableCls.th}>Categoría</th>
                    <th className={tableCls.th}>Unidades</th>
                    <th className={tableCls.th}>Kg (aprox.)</th>
                    <th className={tableCls.th}>Venta real (kg)</th>
                    <th className={tableCls.th}>Enviado</th>
                    {editable && <th className={tableCls.th} aria-label="Acciones" />}
                  </tr>
                </thead>
                <tbody>
                  {day.rows.map((r) => (
                    <tr key={r.seller.username} className={tableCls.row}>
                      <td className={tableCls.td}>
                        <b className="block">{r.seller.name}</b>
                        <small className="text-muted-foreground">{r.seller.zone ?? r.seller.username}</small>
                      </td>
                      <td className={tableCls.td}>
                        <StatusBadge kind={r.confirmed ? 'confirmed' : 'pending'} />
                      </td>
                      <td className={tableCls.td}>
                        {r.category ? catalog.dayLabel(r.category, r.units) : NOT_REGISTERED}
                      </td>
                      <td className={cn(tableCls.td, 'font-bold')}>{r.confirmed ? nf0(r.u) : '-'}</td>
                      <td className={tableCls.td}>{r.confirmed ? nf1(r.kg) : '-'}</td>
                      <td className={tableCls.td}>{r.realKg === null ? '-' : nf1(r.realKg)}</td>
                      <td className={cn(tableCls.td, 'text-muted-foreground')}>
                        {r.submittedAt ? formatTime(hhmm(r.submittedAt)) : '-'}
                      </td>
                      {editable && (
                        <td className={tableCls.td}>
                          <Button asChild variant="outline" size="sm" className="font-bold">
                            <Link to={`${paths.register}?vendedor=${r.seller.username}&dia=${date}`}>
                              <Pencil /> {r.confirmed ? 'Editar' : 'Registrar'}
                            </Link>
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                  <tr className={tableCls.total}>
                    <td>Total</td>
                    <td className="text-center">
                      {day.confirmed}/{day.rows.length}
                    </td>
                    <td />
                    <td className="text-center">{nf0(day.u)}</td>
                    <td className="text-center">{nf1(day.kg)}</td>
                    <td className="text-center">{day.realKg === null ? '-' : nf1(day.realKg)}</td>
                    <td />
                    {editable && <td />}
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Por producto" aside={<span className="text-muted-foreground">equipo</span>}>
            {products.length ? (
              <div className="overflow-x-auto px-3 pb-3.5">
                <table className={tableCls.table}>
                  <thead>
                    <tr>
                      <th className={tableCls.th}>Producto</th>
                      <th className={tableCls.th}>Unidades</th>
                      <th className={tableCls.th}>Kg (aprox.)</th>
                      {day.real && <th className={tableCls.th}>Venta real (unid.)</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => {
                      const u = day.units[p.id] ?? 0
                      return (
                        <tr key={p.id} className={tableCls.row}>
                          <td className={tableCls.td}>
                            <b className="block">{p.name}</b>
                            {p.subcategory && <small className="text-muted-foreground">{p.subcategory}</small>}
                          </td>
                          <td className={cn(tableCls.td, 'font-bold')}>{nf0(u)}</td>
                          <td className={tableCls.td}>{nf1(u * p.kg_per_unit)}</td>
                          {day.real && <td className={tableCls.td}>{nf0(day.real[p.id] ?? 0)}</td>}
                        </tr>
                      )
                    })}
                    <tr className={tableCls.total}>
                      <td>Total</td>
                      <td className="text-center">{nf0(day.u)}</td>
                      <td className="text-center">{nf1(day.kg)}</td>
                      {day.real && <td className="text-center">{nf0(sumUnits(day.real))}</td>}
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-5 pb-5 text-muted-foreground">Nadie registró proyección para este día.</p>
            )}
          </Section>
        </div>
      </PageBody>
    </div>
  )
}

function DayLink({
  to,
  disabled,
  label,
  icon,
}: {
  to: string
  disabled: boolean
  label: string
  icon: React.ReactNode
}) {
  if (disabled) {
    return (
      <Button variant="outline" size="icon" disabled aria-label={label}>
        {icon}
      </Button>
    )
  }
  return (
    <Button asChild variant="outline" size="icon" aria-label={label}>
      <Link to={paths.teamDay(to)}>{icon}</Link>
    </Button>
  )
}
