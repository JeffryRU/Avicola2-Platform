import { Pencil, Plus, ShoppingCart } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router'
import { paths } from '@/app/routes'
import { dDM, dDow, dFull, dShort, today } from '@/shared/domain/dates'
import { nf0, nf1, pct1 } from '@/shared/domain/format'
import { useRequiredSession } from '@/features/auth'
import { sumUnits, type Product } from '@/shared/domain/products'
import { isoDateSchema } from '@/shared/domain/schemas'
import { useCatalog } from '@/features/catalog'
import { useMyDays, useWindowData } from '@/features/projections/ui/hooks'
import { CountUp } from '@/shared/ui/components/charts'
import { EmptyState, Note, StatusBadge, StatusDot } from '@/shared/ui/components/feedback'
import { Kpi, KpiStrip, PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { DataTable } from '@/shared/ui/components/data-table'
import { Button } from '@/shared/ui/components/shadcn/button'
import { cn } from '@/shared/ui/lib/utils'
import { STATUS_LABEL, kgAmount, UNITS_SHORT } from '@/shared/types/labels'
import { useFirstEditableDay } from '@/features/editing'

export function DayDetailPage() {
  const { date = '' } = useParams()
  const { seller } = useRequiredSession()
  const { catalog } = useCatalog()
  const { days } = useMyDays()
  const data = useWindowData()
  // Desde el primer día que se puede registrar (mañana): hoy ya no se proyecta.
  const firstEditable = useFirstEditableDay()
  if (!isoDateSchema.safeParse(date).success) return <Navigate to={paths.mine} replace />
  const editable = date >= firstEditable
  const editLink = `${paths.register}?dia=${date}`
  const day = days.get(date)

  if (!day || !catalog) {
    return (
      <div>
        <PageHeader title="Detalle de proyección" back={paths.mine} />
        <PageBody>
          <Section>
            <EmptyState title={`${dShort(date)} aún no tiene proyección confirmada`}>
              {editable
                ? 'Regístrala para que entre a planificación.'
                : date >= today()
                  ? 'Las proyecciones se registran para los días siguientes.'
                  : 'Este día ya pasó sin proyección.'}
              {editable && (
                <div className="mt-4">
                  <Button asChild>
                    <Link to={editLink}>
                      <Plus /> Registrar {dShort(date)}
                    </Link>
                  </Button>
                </div>
              )}
            </EmptyState>
          </Section>
        </PageBody>
      </div>
    )
  }

  const sale = data.data?.sales.find((s) => s.seller === seller.username && s.date === date)
  const real = sale?.units ?? null
  const products = catalog.of(day.category)
  const units = sumUnits(day.units)
  const kg = catalog.kg(day.units)
  const realKg = real ? catalog.kg(real) : 0
  // Venta real frente a lo proyectado de cada producto (%).
  const diffOf = (p: Product) => {
    const u = day.units[p.id] ?? 0
    return u ? (((real?.[p.id] ?? 0) - u) / u) * 100 : 0
  }
  const sent = new Date(day.submittedAt)

  return (
    <div>
      <PageHeader
        title="Detalle de proyección"
        back={paths.mine}
        actions={
          editable && (
            <Button asChild variant="outline">
              <Link to={editLink}>
                <Pencil /> Editar
              </Link>
            </Button>
          )
        }
        mobileActions={
          editable && (
            <Button asChild variant="ghost" size="icon">
              <Link to={editLink} aria-label="Editar">
                <Pencil />
              </Link>
            </Button>
          )
        }
      />
      <PageBody>
        <div className="mb-4">
          <p className="text-sm text-muted-foreground">Fecha de proyección</p>
          <h2 className="text-xl font-semibold hc:text-2xl hc:font-extrabold">
            {dDow(date)} {dFull(date)} · {catalog.dayLabel(day.category, day.units)}
          </h2>
        </div>
        <KpiStrip className="mb-4 dsk:grid-cols-3">
          <Kpi
            label="Total proyectado"
            value={
              <>
                <CountUp value={units} />{' '}
                <span className="font-sans text-md font-normal text-muted-foreground">{UNITS_SHORT}</span>
              </>
            }
            foot={<span className="num">{kgAmount(kg)}</span>}
          />
          <Kpi
            label="Estado"
            value={
              <span className="flex items-center gap-2 font-sans text-xl">
                <StatusDot tone="ok" />
                {STATUS_LABEL.confirmed}
              </span>
            }
            foot={
              <span className="num">
                {dDM(day.submittedAt.slice(0, 10))} {sent.toTimeString().slice(0, 5)}
              </span>
            }
          />
          <Kpi
            label="Envío"
            value={
              <span className="font-sans text-md">
                <StatusBadge kind={day.sync === 'ok' ? 'synced' : 'queued'} />
              </span>
            }
          />
        </KpiStrip>
        {real && (
          <Note icon={<ShoppingCart />} className="mb-4">
            <div className="min-w-0 flex-1">
              Venta real (ERP): <b className="num">{kgAmount(realKg)}</b>,{' '}
              <span className="num">{pct1(((realKg - kg) / kg) * 100)}</span> frente a lo proyectado.
            </div>
          </Note>
        )}
        <Section title="Detalle por producto">
          <DataTable
            rows={products}
            rowKey={(p) => p.id}
            totalLabel="Total"
            columns={[
              { key: 'name', header: 'Producto', cell: (p) => p.name },
              {
                key: 'units',
                header: 'Unidades',
                numeric: true,
                faint: (p) => !day.units[p.id],
                cell: (p) => day.units[p.id] ?? 0,
                total: nf0(units),
              },
              {
                key: 'kg',
                header: 'Kg (aprox.)',
                numeric: true,
                faint: (p) => !day.units[p.id],
                cell: (p) => nf1((day.units[p.id] ?? 0) * p.kg_per_unit),
                total: nf1(kg),
              },
              ...(real
                ? [
                    {
                      key: 'real',
                      header: 'Venta real',
                      numeric: true,
                      cell: (p: Product) => real[p.id] ?? 0,
                      total: nf0(sumUnits(real)),
                    },
                    {
                      key: 'diff',
                      header: 'Dif.',
                      numeric: true,
                      className: (p: Product) => cn('font-medium', diffOf(p) < 0 ? 'text-bad' : 'text-ok'),
                      cell: (p: Product) => pct1(diffOf(p)),
                      total: pct1(((sumUnits(real) - units) / units) * 100),
                      totalClassName: realKg < kg ? 'text-bad' : 'text-ok',
                    },
                  ]
                : []),
            ]}
          />
        </Section>
      </PageBody>
    </div>
  )
}
