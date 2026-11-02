import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, BarChart3, Calendar, Clock, Send, Tag } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useContainer } from '@/app/di'
import { paths } from '@/app/routes'
import { dFull, dShort } from '@/core/domain/dates'
import { nf0, nf1 } from '@/core/domain/format'
import { useRequiredSession } from '@/modules/auth/ui/use-session'
import type { SubmitOutcome } from '@/modules/planning/application/planning-service'
import { sumUnits } from '@/modules/planning/domain/catalog'
import type { Draft } from '@/modules/planning/domain/draft'
import { useCatalog, useQueue } from '@/modules/planning/ui/hooks'
import { SummaryRow } from '@/modules/planning/ui/components/review-dialog'
import { CountUp } from '@/ui/components/charts'
import { Confetti, Note } from '@/ui/components/feedback'
import { PageBody, PageHeader, Section, tableCls } from '@/ui/components/layout'
import { Button } from '@/ui/components/shadcn/button'
import { cn } from '@/ui/lib/utils'

export function SuccessPage() {
  const state = useLocation().state as { outcome: SubmitOutcome; draft: Draft } | null
  const { catalog } = useCatalog()
  const { planning } = useContainer()
  const { seller } = useRequiredSession()
  const queue = useQueue()
  const navigate = useNavigate()
  const client = useQueryClient()
  // Si la cola se vació (se reintentó con éxito), el envío ya está sincronizado.
  const pending =
    state?.outcome.sync === 'pending' && queue.some((q) => q.submission_id === state.outcome.submission.submission_id)
  if (!state || !catalog) return <Navigate to={paths.home} replace />

  const { outcome } = state
  const days = outcome.submission.days
  const units = days.reduce((s, d) => s + sumUnits(d.units), 0)
  const kg = days.reduce((s, d) => s + catalog.kg(d.units), 0)

  async function retry() {
    const r = await planning.flush(seller.username)
    if (r.sent) {
      await client.invalidateQueries({ queryKey: ['window'] })
      toast.success('Proyección sincronizada')
    } else toast('No se pudo sincronizar. Se intentará de nuevo.')
  }

  return (
    <div>
      <PageHeader title="Confirmar proyección" />
      <PageBody>
        <div className="mx-auto max-w-[560px] pt-6 text-center">
          <div
            className={cn(
              'relative mx-auto mt-2 mb-[18px] grid size-[104px] animate-popin place-items-center rounded-full shadow-[0_0_0_10px_var(--ok-soft)]',
              pending ? 'bg-warn shadow-[0_0_0_10px_var(--warn-soft)]' : 'bg-ok',
            )}
          >
            <svg
              width="52"
              height="52"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path className="tick-path" d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <h1 className="text-[30px] font-extrabold">{pending ? 'Proyección guardada' : '¡Proyección enviada!'}</h1>
          <p className="mt-2 mb-[22px] text-[17px] text-ink-2">
            {pending
              ? 'Quedó guardada en este dispositivo y se enviará en cuanto haya conexión.'
              : 'Tu proyección fue registrada y enviada a planificación.'}
          </p>
          {pending && outcome.sync === 'pending' && (
            <Note tone="warn" icon={<AlertCircle />} className="mb-4 text-left">
              <div className="min-w-0 flex-1">
                <b>No se pudo enviar.</b>
                <br />
                {outcome.error}
              </div>
              <Button className="h-10 font-bold" onClick={retry}>
                Reintentar
              </Button>
            </Note>
          )}
          <Section className="text-left">
            <div className="grid px-4 pt-3 pb-4 dsk:px-5 dsk:pb-5">
              <SummaryRow icon={<Calendar />} label="Fecha de inicio">
                {dFull(state.draft.start)}
              </SummaryRow>
              <SummaryRow icon={<Clock />} label="Días de proyección">
                {days.length} {days.length === 1 ? 'día' : 'días'}
              </SummaryRow>
              <SummaryRow icon={<Tag />} label="Categoría">
                {outcome.submission.category}
              </SummaryRow>
              <SummaryRow icon={<BarChart3 />} label="Total proyectado">
                <CountUp value={units} /> unidades<small>{nf1(kg)} kg (aprox.)</small>
              </SummaryRow>
              <SummaryRow icon={<Send />} label="Destino">
                {pending ? 'En este dispositivo (por sincronizar)' : 'Base de datos'}
              </SummaryRow>
            </div>
          </Section>
          <h2 className="mt-5 mb-2.5 text-left text-[19px] font-extrabold">Total por día</h2>
          <Section>
            <div className="p-2.5">
              <table
                className={cn(
                  tableCls.table,
                  '[&_td:not(:first-child)]:text-right [&_th:not(:first-child)]:text-right',
                )}
              >
                <thead>
                  <tr>
                    <th className={tableCls.th}>Fecha</th>
                    <th className={tableCls.th}>Unidades</th>
                    <th className={tableCls.th}>Kg (aprox.)</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr
                      key={d.date}
                      className={cn(tableCls.row, 'cursor-pointer')}
                      onClick={() => navigate(paths.day(d.date))}
                    >
                      <td className={tableCls.td}>{dShort(d.date)}</td>
                      <td className={tableCls.td}>{nf0(sumUnits(d.units))} unid.</td>
                      <td className={tableCls.td}>{nf1(catalog.kg(d.units))} kg</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <div className="mt-5 grid gap-2.5">
            <Button
              asChild
              variant="outline"
              className="h-[54px] rounded-[14px] border-[1.5px] border-primary text-[16.5px] font-bold text-primary"
            >
              <Link to={paths.mine}>Ver mis proyecciones</Link>
            </Button>
            <Button asChild className="h-[54px] rounded-[14px] text-[16.5px] font-bold">
              <Link to={paths.register}>Nueva proyección</Link>
            </Button>
          </div>
        </div>
      </PageBody>
      {state.outcome.sync === 'ok' && <Confetti />}
    </div>
  )
}
