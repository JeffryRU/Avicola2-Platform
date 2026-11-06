import { BarChart3, Calendar, Check, Pencil, Plus, ShoppingCart, Tag } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router'
import { paths } from '@/app/routes'
import { dDM, dDow, dFull, dShort, today } from '@/shared/domain/dates'
import { nf0, nf1, pct1 } from '@/shared/domain/format'
import { useRequiredSession } from '@/features/auth/ui/use-session'
import { sumUnits } from '@/features/catalog/domain/catalog'
import { isoDateSchema } from '@/shared/domain/schemas'
import { useCatalog } from '@/features/catalog/ui/hooks'
import { useMyDays, useWindowData } from '@/features/projections/ui/hooks'
import { CountUp } from '@/shared/ui/components/charts'
import { EmptyState, Note, StatusBadge } from '@/shared/ui/components/feedback'
import { PageBody, PageHeader, Section, tableCls } from '@/shared/ui/components/layout'
import { Button } from '@/shared/ui/components/shadcn/button'
import { cn } from '@/shared/ui/lib/utils'
import { STATUS_LABEL } from '@/shared/types/labels'
import { useFirstEditableDay } from '@/features/editing/ui/hooks'

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
                  <Button asChild className="h-[46px] font-bold">
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
  const sent = new Date(day.submittedAt)

  return (
    <div>
      <PageHeader
        title="Detalle de proyección"
        back={paths.mine}
        actions={
          editable && (
            <Button asChild variant="outline" className="h-[46px] border-[1.5px] border-primary font-bold text-primary">
              <Link to={editLink}>
                <Pencil /> Editar
              </Link>
            </Button>
          )
        }
        mobileActions={
          editable && (
            <Button asChild variant="ghost" size="icon" aria-label="Editar">
              <Link to={editLink}>
                <Pencil />
              </Link>
            </Button>
          )
        }
      />
      <PageBody>
        <div className="mb-4 flex flex-wrap items-center gap-3 dsk:gap-[18px]">
          <div className="flex items-center gap-3">
            <Calendar className="size-[30px]" />
            <div>
              <b className="block text-[19px] font-extrabold">
                {dDow(date)} {dFull(date)}
              </b>
              <small className="text-muted-foreground">Fecha de proyección</small>
            </div>
          </div>
          <span className="h-[38px] w-px bg-border" />
          <div className="flex items-center gap-3">
            <Tag className="size-7" />
            <div>
              <b className="block text-[19px] font-extrabold">{catalog.dayLabel(day.category, day.units)}</b>
              <small className="text-muted-foreground">Categoría</small>
            </div>
          </div>
          <span className="flex-1" />
          <StatusBadge kind={day.sync === 'ok' ? 'synced' : 'queued'} />
        </div>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <Section className="flex flex-col items-start gap-2.5 p-3.5 dsk:flex-row dsk:gap-3.5 dsk:p-[18px]">
            <span className="grid size-[46px] flex-none place-items-center rounded-xl bg-secondary text-primary">
              <BarChart3 className="size-6" />
            </span>
            <div>
              <span className="block text-sm font-semibold text-ink-2">Total proyectado</span>
              <b className="block text-xl font-extrabold dsk:text-2xl">
                <CountUp value={units} /> unid.
              </b>
              <small className="text-muted-foreground">{nf1(kg)} kg</small>
            </div>
          </Section>
          <Section className="flex flex-col items-start gap-2.5 p-3.5 dsk:flex-row dsk:gap-3.5 dsk:p-[18px]">
            <span className="grid size-[46px] flex-none place-items-center rounded-full bg-ok text-white">
              <Check className="size-6" strokeWidth={3} />
            </span>
            <div>
              <span className="block text-sm font-semibold text-ink-2">Estado</span>
              <b className="block text-xl font-extrabold text-ok dsk:text-2xl">{STATUS_LABEL.confirmed}</b>
              <small className="text-muted-foreground">
                {dDM(day.submittedAt.slice(0, 10))} {sent.toTimeString().slice(0, 5)}
              </small>
            </div>
          </Section>
        </div>
        {real && (
          <Note icon={<ShoppingCart />} className="mb-4">
            <div>
              Venta real (ERP): <b>{nf1(realKg)} kg</b>, {pct1(((realKg - kg) / kg) * 100)} frente a lo proyectado.
            </div>
          </Note>
        )}
        <h2 className="mb-2.5 text-xl font-extrabold">Detalle por producto</h2>
        <Section>
          <div className="overflow-x-auto p-2.5">
            <table className={tableCls.table}>
              <thead>
                <tr>
                  <th className={tableCls.th}>Producto</th>
                  <th className={tableCls.th}>Unidades</th>
                  <th className={tableCls.th}>Kg (aprox.)</th>
                  {real && (
                    <>
                      <th className={tableCls.th}>Venta real</th>
                      <th className={tableCls.th}>Dif.</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const u = day.units[p.id] ?? 0
                  const r = real?.[p.id] ?? 0
                  const diff = u ? ((r - u) / u) * 100 : 0
                  return (
                    <tr key={p.id} className={tableCls.row}>
                      <td className={tableCls.td}>{p.name}</td>
                      <td className={tableCls.td}>{u}</td>
                      <td className={tableCls.td}>{nf1(u * p.kg_per_unit)}</td>
                      {real && (
                        <>
                          <td className={tableCls.td}>{r}</td>
                          <td className={cn(tableCls.td, 'font-bold', diff < 0 ? 'text-destructive' : 'text-ok')}>
                            {pct1(diff)}
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
                <tr className={tableCls.total}>
                  <td>Total</td>
                  <td className="text-center">{nf0(units)}</td>
                  <td className="text-center">{nf1(kg)}</td>
                  {real && (
                    <>
                      <td className="text-center">{nf0(sumUnits(real))}</td>
                      <td className={cn('text-center', realKg < kg ? 'text-destructive' : 'text-ok')}>
                        {pct1(((sumUnits(real) - units) / units) * 100)}
                      </td>
                    </>
                  )}
                </tr>
              </tbody>
            </table>
          </div>
        </Section>
      </PageBody>
    </div>
  )
}
