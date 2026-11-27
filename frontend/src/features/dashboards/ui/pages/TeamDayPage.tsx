import { SyncStatus } from '@/shared/ui/components/sync-status'
import { ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router'
import { paths } from '@/app/routes'
import { addDays, dDowLong, dFull, today, type IsoDate, clockTime } from '@/shared/domain/dates'
import { nf0, nf1 } from '@/shared/domain/format'
import { isoDateSchema } from '@/shared/domain/schemas'
import { sumUnits, type Product } from '@/shared/domain/products'
import { useCatalog } from '@/features/catalog'
import { teamDay } from '@/features/dashboards/domain/team-day'
import { useSellers } from '@/features/sellers'
import { dataWindow, useWindowData } from '@/features/projections'
import { CountUp } from '@/shared/ui/components/charts'
import { EmptyState, Note, StatusBadge } from '@/shared/ui/components/feedback'
import { Kpi, KpiStrip, PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { DataTable } from '@/shared/ui/components/data-table'
import { Button } from '@/shared/ui/components/shadcn/button'
import { cn } from '@/shared/ui/lib/utils'
import { NOT_REGISTERED, UNITS_SHORT, kgAmount } from '@/shared/types/labels'
import { col } from '@/shared/ui/lib/table-columns'

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
  const sellersQuery = useSellers()
  const sellers = sellersQuery.data ?? []
  const data = useWindowData()
  const source = data.data ?? { projections: [], sales: [] }
  // Sin datos todavía (cargando o sin red) no se dibujan ceros: parecerían «nadie confirmó».
  const ready = data.data !== undefined && sellersQuery.data !== undefined

  const day = teamDay(date, sellers, source.projections, source.sales, catalog)
  const pending = day.rows.filter((r) => !r.confirmed)
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
        <SyncStatus queries={[data, sellersQuery]} />
        {ready && (
          <>
            <KpiStrip className="mb-4">
              <Kpi
                tone={day.confirmed === day.rows.length && day.rows.length > 0 ? 'ok' : 'warn'}
                label="Vendedores que confirmaron"
                value={
                  <>
                    {day.confirmed}{' '}
                    <span className="font-sans text-md font-normal text-muted-foreground">de {day.rows.length}</span>
                  </>
                }
              />
              <Kpi
                tone="primary"
                label="Total proyectado"
                value={
                  <>
                    <CountUp value={day.u} />{' '}
                    <span className="font-sans text-md font-normal text-muted-foreground">{UNITS_SHORT}</span>
                  </>
                }
              />
              <Kpi
                tone="kg"
                label="Total en kilos (aprox.)"
                value={
                  <>
                    <CountUp value={day.kg} decimals={1} />{' '}
                    <span className="font-sans text-md font-normal text-muted-foreground">kg</span>
                  </>
                }
              />
              <Kpi
                label="Pedido real (ERP)"
                value={
                  day.realKg === null ? (
                    <span className="font-sans text-md font-normal text-muted-foreground">Sin datos todavía</span>
                  ) : (
                    kgAmount(day.realKg)
                  )
                }
                foot={day.realKg === null ? undefined : 'de los vendedores con pedido'}
              />
            </KpiStrip>

            {pending.length > 0 && date >= today() && (
              <Note tone="warn" icon={<Users />} className="mb-4">
                <div className="min-w-0 flex-1">
                  <b className="block">
                    Falta{pending.length === 1 ? '' : 'n'} {pending.length} por confirmar
                  </b>
                  {pending.map((r) => r.seller.name).join(', ')}.
                </div>
              </Note>
            )}

            <div className="grid grid-cols-1 items-start gap-4 @7xl/main:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
              <Section title="Por vendedor" aside={`${day.confirmed} de ${day.rows.length} confirmaron`}>
                {/* Celular: una fila por vendedor con lo esencial (la tabla no entra en 390 px). */}
                <ul className="dsk:hidden">
                  {day.rows.map((r) => (
                    <li
                      key={r.seller.username}
                      className={cn(
                        'flex items-center gap-3 border-b border-rule px-4 py-3 last:border-0',
                        !r.confirmed && 'hc:bg-warn-soft',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <span className="block truncate font-medium hc:font-semibold">{r.seller.name}</span>
                        <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                          <StatusBadge kind={r.confirmed ? 'confirmed' : 'pending'} />
                          <span>{r.seller.zone ?? r.seller.username}</span>
                        </span>
                      </div>
                      <div className="text-right">
                        <span className={cn('num block font-medium', !r.confirmed && 'text-faint')}>
                          {r.confirmed ? `${nf0(r.u)} ${UNITS_SHORT}` : '—'}
                        </span>
                        {r.confirmed && <span className="num block text-sm text-muted-foreground">{nf1(r.kg)} kg</span>}
                      </div>
                    </li>
                  ))}
                  <li className="flex items-center justify-between gap-3 border-t border-rule-strong bg-muted px-4 py-3 font-semibold hc:border-t-heavy hc:border-foreground">
                    <span>Total</span>
                    <span className="num">
                      {nf0(day.u)} {UNITS_SHORT} · {nf1(day.kg)} kg
                    </span>
                  </li>
                </ul>
                <DataTable
                  wrapperClassName="hidden dsk:block"
                  rows={day.rows}
                  rowKey={(r) => r.seller.username}
                  rowTone={(r) => !r.confirmed && 'attention'}
                  totalLabel="Total"
                  columns={[
                    {
                      key: 'seller',
                      header: 'Vendedor',
                      cell: (r) => (
                        <>
                          <span className="block font-medium hc:font-semibold">{r.seller.name}</span>
                          <small className="text-xs text-muted-foreground">{r.seller.zone ?? r.seller.username}</small>
                        </>
                      ),
                    },
                    {
                      key: 'status',
                      header: 'Estado',
                      cell: (r) => <StatusBadge kind={r.confirmed ? 'confirmed' : 'pending'} />,
                      total: <span className="num">{`${String(day.confirmed)}/${String(day.rows.length)}`}</span>,
                    },
                    {
                      key: 'category',
                      header: 'Categoría',
                      tone: (r) => !r.category && 'muted',
                      cell: (r) => (r.category ? catalog.dayLabel(r.category, r.units) : NOT_REGISTERED),
                      total: null,
                    },
                    {
                      key: 'units',
                      header: 'Unidades',
                      numeric: true,
                      faint: (r) => !r.confirmed,
                      cell: (r) => (r.confirmed ? nf0(r.u) : '—'),
                      total: nf0(day.u),
                    },
                    {
                      key: 'kg',
                      header: 'Kg aprox.',
                      numeric: true,
                      faint: (r) => !r.confirmed,
                      cell: (r) => (r.confirmed ? nf1(r.kg) : '—'),
                      total: nf1(day.kg),
                    },
                    {
                      key: 'real',
                      header: 'Pedido real (kg)',
                      numeric: true,
                      faint: (r) => r.realKg === null,
                      cell: (r) => (r.realKg === null ? '—' : nf1(r.realKg)),
                      total: day.realKg === null ? '—' : nf1(day.realKg),
                    },
                    {
                      key: 'sent',
                      header: 'Enviado',
                      numeric: true,
                      tone: 'muted',
                      cell: (r) => (r.submittedAt ? clockTime(r.submittedAt) : '—'),
                      total: null,
                    },
                  ]}
                />
              </Section>

              <Section title="Por producto" aside="Todo el equipo">
                {products.length ? (
                  <DataTable
                    rows={products}
                    rowKey={(p) => p.id}
                    totalLabel="Total"
                    columns={[
                      {
                        key: 'name',
                        header: 'Producto',
                        cell: (p) => (
                          <>
                            <span className="block font-medium">{p.name}</span>
                            {p.subcategory && <small className="text-xs text-muted-foreground">{p.subcategory}</small>}
                          </>
                        ),
                      },
                      col.units<Product>('units', 'Unidades', (p) => day.units[p.id] ?? 0, { total: nf0(day.u) }),
                      col.kg<Product>('kg', 'Kg aprox.', (p) => (day.units[p.id] ?? 0) * p.kg_per_unit, {
                        total: nf1(day.kg),
                      }),
                      ...(day.real
                        ? [
                            {
                              key: 'real',
                              header: 'Pedido real (unid.)',
                              numeric: true,
                              cell: (p: Product) => nf0(day.real?.[p.id] ?? 0),
                              total: nf0(sumUnits(day.real)),
                            },
                          ]
                        : []),
                    ]}
                  />
                ) : (
                  <EmptyState title="Sin proyecciones">Nadie registró proyección para este día.</EmptyState>
                )}
              </Section>
            </div>
          </>
        )}
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
