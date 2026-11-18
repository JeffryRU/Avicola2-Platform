import { dDM, dFull, dShort, weekStart } from '@/shared/domain/dates'
import { nf0 } from '@/shared/domain/format'
import { bestPerLevel, LEVELS } from '@/features/model/domain/model'
import { useModelSummary } from '@/features/model/ui/hooks'
import {
  BASELINE_KEY,
  BIAS_LABEL,
  CHART_TITLE,
  EMPTY_BODY,
  EMPTY_TITLE,
  LEVEL_LABEL,
  MODEL_COLUMN,
  MODEL_SUBTITLE,
  MODEL_TITLE,
  SERIES,
  SPLIT_LABEL,
  SPLIT_NOTE,
  SPLIT_TITLE,
  TABLE_NOTE,
  TABLE_TITLE,
  USES,
  VS_BASELINE,
  trainedNote,
} from '@/features/model/types/model'
import { LineChart } from '@/shared/ui/components/charts'
import { EmptyState } from '@/shared/ui/components/feedback'
import { Kpi, KpiStrip, PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { SyncStatus } from '@/shared/ui/components/sync-status'
import { DataTable } from '@/shared/ui/components/data-table'
import { cn } from '@/shared/ui/lib/utils'

const pct = (v: number) => `${v.toFixed(1)} %`
const SPLIT_COLOR = { entrenamiento: 'bg-primary/25', validacion: 'bg-warn-soft', prueba: 'bg-ok-soft' } as const

/** Supervisión: el modelo de demanda que usa la app, cómo se eligió y cuánto se equivoca. */
export function ModelPage() {
  const query = useModelSummary()
  const s = query.data
  if (!s) {
    return (
      <div>
        <PageHeader title={MODEL_TITLE} subtitle={MODEL_SUBTITLE} />
        <PageBody>
          <SyncStatus queries={[query]} />
          {query.data === null && (
            <Section>
              <EmptyState title={EMPTY_TITLE}>{EMPTY_BODY}</EmptyState>
            </Section>
          )}
        </PageBody>
      </div>
    )
  }
  const byKey = Object.fromEntries(s.models.map((m) => [m.key, m]))
  const baseline = byKey[BASELINE_KEY]
  const best = bestPerLevel(s.models)
  const chosen = new Set(Object.values(s.chosen))
  const total = Object.values(s.split).reduce((a, p) => a + p[2], 0)
  // Por semana: 63 días no se leen día a día y la semana es el nivel de planificación.
  const weeks: { start: string; days: number; real: number; model: number; actual: number }[] = []
  for (const p of s.series) {
    const start = weekStart(p.date)
    const last = weeks.at(-1)
    if (last?.start === start) {
      last.days += 1
      last.real += p.real
      last.model += p.semana
      last.actual += p.actual
    } else weeks.push({ start, days: 1, real: p.real, model: p.semana, actual: p.actual })
  }
  // El gráfico es semanal: muestra el modelo elegido para la semana.
  const weekModel = `${byKey[s.chosen.semana]?.name ?? ''} (en uso)`
  // Solo semanas completas: una semana a medias parecería una caída de la demanda.
  const fullWeeks = weeks.filter((w) => w.days === 7)
  return (
    <div>
      <PageHeader title={MODEL_TITLE} subtitle={MODEL_SUBTITLE} />
      <PageBody>
        <SyncStatus queries={[query]} />
        <KpiStrip className="mb-4 grid-cols-1 sm:grid-cols-3 dsk:grid-cols-3">
          {USES.map((u) => {
            const model = byKey[s.chosen[u.key]]
            return (
              <Kpi
                key={u.key}
                label={u.title}
                value={
                  <>
                    {model ? pct(model.metrics[u.level]) : '—'}{' '}
                    <span className="font-sans text-sm font-normal text-muted-foreground">de error</span>
                  </>
                }
                foot={
                  <>
                    <b className="font-medium text-foreground">{model?.name}</b> · {LEVEL_LABEL[u.level]}
                    {baseline && <> · {VS_BASELINE(baseline.metrics[u.level])}</>}
                  </>
                }
              />
            )
          })}
        </KpiStrip>

        <Section title={SPLIT_TITLE} className="mb-4">
          <div className="px-4 py-3 dsk:px-5">
            <div className="flex h-9 overflow-hidden rounded-md border border-border text-xs">
              {(Object.keys(SPLIT_LABEL) as (keyof typeof SPLIT_LABEL)[]).map((k) => (
                <div
                  key={k}
                  className={cn('flex min-w-0 items-center justify-center px-2 font-medium', SPLIT_COLOR[k])}
                  style={{ width: `${String((100 * s.split[k][2]) / total)}%` }}
                  title={`${SPLIT_LABEL[k]}: ${dShort(s.split[k][0])} – ${dShort(s.split[k][1])}`}
                >
                  <span className="truncate">
                    {SPLIT_LABEL[k]} · {s.split[k][2]} días
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
              {(Object.keys(SPLIT_LABEL) as (keyof typeof SPLIT_LABEL)[]).map((k) => (
                <span key={k}>
                  {dShort(s.split[k][0])} – {dShort(s.split[k][1])}
                </span>
              ))}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{SPLIT_NOTE}</p>
          </div>
        </Section>

        <Section title={TABLE_TITLE} aside={TABLE_NOTE} className="mb-4">
          <DataTable
            density="compact"
            rows={s.models}
            rowKey={(m) => m.key}
            rowClassName={(m) => chosen.has(m.key) && 'font-semibold'}
            columns={[
              {
                key: 'model',
                header: MODEL_COLUMN,
                cell: (m) => (
                  <>
                    {chosen.has(m.key) && <span aria-label="en uso">★ </span>}
                    {m.name}
                  </>
                ),
              },
              ...LEVELS.map((l) => ({
                key: l,
                header: LEVEL_LABEL[l],
                numeric: true,
                tone: (m: (typeof s.models)[number]) => best[l] === m.key && 'best',
                cell: (m: (typeof s.models)[number]) => pct(m.metrics[l]),
              })),
              {
                key: 'bias',
                header: BIAS_LABEL,
                numeric: true,
                tone: 'muted',
                cell: (m) => `${m.metrics.sesgo > 0 ? '+' : ''}${pct(m.metrics.sesgo)}`,
              },
            ]}
          />
        </Section>

        <Section title={CHART_TITLE} className="mb-4">
          <div className="px-4 pt-3 pb-4 dsk:px-5">
            <div className="mb-2 flex flex-wrap justify-end gap-x-4 gap-y-1 text-sm text-ink-2">
              <span>— {weekModel}</span>
              <span className="text-[var(--chart-2)]">- - {SERIES.real}</span>
              <span className="text-[var(--chart-model)]">— — {SERIES.actual}</span>
            </div>
            <div className="relative min-h-72 dsk:min-h-80">
              <LineChart
                label={CHART_TITLE}
                points={fullWeeks.map((p) => ({
                  key: p.start,
                  label: 'Sem.',
                  sublabel: dDM(p.start),
                  a: p.model,
                  b: p.real,
                  c: p.actual,
                  tip: (
                    <>
                      <b>Semana del {dShort(p.start)}</b>
                      <br />
                      {SERIES.real}: {nf0(p.real)}
                      <br />
                      {weekModel}: {nf0(p.model)}
                      <br />
                      {SERIES.actual}: {nf0(p.actual)}
                    </>
                  ),
                }))}
              />
            </div>
          </div>
        </Section>
        <p className="mx-1 text-sm text-muted-foreground">
          {trainedNote(
            dFull(s.trained_at.slice(0, 10)),
            dFull(s.data_from),
            dFull(s.data_to),
            s.sellers.length,
            s.series_teacher,
          )}
        </p>
      </PageBody>
    </div>
  )
}
