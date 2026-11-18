import { AlertCircle, BarChart3, Calendar, Check, Clock, Send, Tag } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { paths } from '@/app/routes'
import { dFull, dShort } from '@/shared/domain/dates'
import { useRequiredSession } from '@/features/auth'
import type { SubmitOutcome } from '@/features/projections/application/planning-service'
import { sumUnits, type Units } from '@/shared/domain/products'
import type { Draft } from '@/features/projections/domain/draft'
import { useCatalog } from '@/features/catalog'
import { useFlushQueue, useQueue } from '@/features/projections/ui/hooks'
import { SummaryRow } from '@/shared/ui/components/summary-row'
import { CountUp } from '@/shared/ui/components/charts'
import { Note } from '@/shared/ui/components/feedback'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { DataTable } from '@/shared/ui/components/data-table'
import { Button } from '@/shared/ui/components/shadcn/button'
import { cn } from '@/shared/ui/lib/utils'
import { daysCount, kgAmount, unitsCount, RETRY_LABEL } from '@/shared/types/labels'

export function SuccessPage() {
  const state = useLocation().state as { outcome: SubmitOutcome; draft: Draft } | null
  const { catalog } = useCatalog()
  const flushQueue = useFlushQueue()
  const { seller } = useRequiredSession()
  const queue = useQueue()
  const navigate = useNavigate()
  // Si la cola se vació (se reintentó con éxito), el envío ya está sincronizado.
  const pending =
    state?.outcome.sync === 'pending' && queue.some((q) => q.submission_id === state.outcome.submission.submission_id)
  if (!state || !catalog) return <Navigate to={paths.home} replace />

  const { outcome, draft } = state
  const days = outcome.submission.days
  // Con un tamaño elegido (Brasa chica...), los totales son solo de sus productos.
  const selection = { category: outcome.submission.category, subcategory: draft.subcategory ?? null }
  const shown = (u: Units) => catalog.pick(u, selection)
  const units = days.reduce((s, d) => s + sumUnits(shown(d.units)), 0)
  const kg = days.reduce((s, d) => s + catalog.kg(shown(d.units)), 0)

  async function retry() {
    const r = await flushQueue.mutateAsync(seller.username)
    if (r.sent) {
      toast.success('Proyección sincronizada')
    } else toast('No se pudo sincronizar. Se intentará de nuevo.')
  }

  return (
    <div>
      <PageHeader title="Confirmar proyección" back={paths.home} />
      <PageBody>
        <div className="mx-auto grid max-w-xl gap-4 dsk:mx-0">
          <div role="status" className="flex items-start gap-3">
            <span
              aria-hidden
              className={cn(
                'mt-0.5 grid size-9 flex-none place-items-center rounded-full border-2',
                pending ? 'border-warn text-warn' : 'border-ok text-ok',
              )}
            >
              {pending ? <Clock className="size-4.5" /> : <Check className="size-5" strokeWidth={2.5} />}
            </span>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold hc:text-2xl hc:font-extrabold">
                {pending ? 'Proyección guardada' : '¡Proyección enviada!'}
              </h2>
              <p className="text-ink-2">
                {pending
                  ? 'Quedó guardada en este dispositivo y se enviará en cuanto haya conexión.'
                  : 'Tu proyección fue registrada y enviada a planificación.'}
              </p>
            </div>
          </div>
          {pending && outcome.sync === 'pending' && (
            <Note tone="warn" icon={<AlertCircle />}>
              <div className="min-w-0 flex-1">
                <b className="block">No se pudo enviar.</b>
                {outcome.error}
              </div>
              <Button variant="outline" onClick={retry}>
                {RETRY_LABEL}
              </Button>
            </Note>
          )}
          <Section title="Resumen">
            <div className="grid px-4 pb-1 dsk:px-5">
              <SummaryRow icon={<Calendar />} label="Fecha de inicio">
                {dFull(state.draft.start)}
              </SummaryRow>
              <SummaryRow icon={<Clock />} label="Días de proyección">
                {daysCount(days.length)}
              </SummaryRow>
              <SummaryRow icon={<Tag />} label="Categoría">
                {catalog.detailedLabel(selection)}
              </SummaryRow>
              <SummaryRow icon={<BarChart3 />} label="Total proyectado">
                <span className="num">
                  <CountUp value={units} />
                </span>{' '}
                unidades<small className="num">{kgAmount(kg, true)}</small>
              </SummaryRow>
              <SummaryRow icon={<Send />} label="Destino">
                {pending ? 'En este dispositivo (por sincronizar)' : 'Base de datos'}
              </SummaryRow>
            </div>
          </Section>
          <Section title="Total por día">
            <DataTable
              rows={days}
              rowKey={(d) => d.date}
              onRowClick={(d) => void navigate(paths.day(d.date))}
              columns={[
                {
                  key: 'date',
                  header: 'Fecha',
                  cell: (d) => (
                    <Link to={paths.day(d.date)} className="font-medium underline-offset-4 hover:underline">
                      {dShort(d.date)}
                    </Link>
                  ),
                },
                { key: 'units', header: 'Unidades', numeric: true, cell: (d) => unitsCount(sumUnits(shown(d.units))) },
                { key: 'kg', header: 'Kg (aprox.)', numeric: true, cell: (d) => kgAmount(catalog.kg(shown(d.units))) },
              ]}
            />
          </Section>
          <div className="grid gap-2.5 dsk:flex dsk:justify-end">
            <Button asChild variant="outline" className="h-12 text-md dsk:h-control dsk:text-base">
              <Link to={paths.mine}>Ver mis proyecciones</Link>
            </Button>
            <Button asChild className="h-12 text-md dsk:h-control dsk:text-base">
              <Link to={paths.register}>Nueva proyección</Link>
            </Button>
          </div>
        </div>
      </PageBody>
    </div>
  )
}
