import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Link } from 'react-router'
import { dShort } from '@/shared/domain/dates'
import { nf0, keepDigits, RECORD_MAX_DIGITS } from '@/shared/domain/format'
import { paths } from '@/app/routes'
import { useCatalog } from '@/features/catalog'
import {
  emptyForecast,
  project,
  projectionTotals,
  requestDraftOf,
  type ArrivalForecast,
  type RequestDraft,
} from '@/features/production/domain/forecast'
import {
  ACCURACY_MODEL,
  ACCURACY_NAIVE,
  ACCURACY_NOTE,
  ACCURACY_TITLE,
  accuracyVerdict,
  BAR_LEGEND_A,
  GO_PRODUCTION_LABEL,
  BAR_LEGEND_B,
  BARS_NOTE,
  REQUEST_UNIT,
  WHAT_BODY,
  WHAT_TITLE,
  BY_DAY_TITLE,
  CHECK_COLUMNS,
  CHECK_TITLE,
  DATA_TITLE,
  EXPECTED_LABEL,
  FORECAST_SUBTITLE,
  FORECAST_TITLE,
  MODEL_NOTE,
  MODEL_TITLE,
  MODEL_WEIGHT_NOTE,
  modelLabel,
  NO_HISTORY_TITLE,
  noHistoryBody,
  QUALITY_A_LABEL,
  QUALITY_B_LABEL,
  REQUEST_HINT,
  REQUEST_TITLE,
  RESET_LABEL,
  RESULT_TITLE,
  TOTAL_LABEL,
  WEIGHTS_HINT,
  WEIGHTS_TITLE,
  WEIGHTS_UNUSED,
} from '@/features/production/types/forecast'
import {
  cleanKg,
  invalidWeights,
  parseKg,
  weightDraftOf,
  type WeightDraft,
} from '@/features/production/domain/production'
import { SyncStatus } from '@/shared/ui/components/sync-status'
import { useArrivalForecast } from '@/features/production/ui/hooks'
import { EmptyState } from '@/shared/ui/components/feedback'
import { Button } from '@/shared/ui/components/shadcn/button'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { cn } from '@/shared/ui/lib/utils'

const splitCls = 'grid items-start gap-4 @4xl/main:grid-cols-[minmax(0,1fr)_21rem]'
const inputCls =
  'num h-touch w-full min-w-0 rounded-md border-control border-input bg-surface px-3 text-right text-lg text-foreground outline-none transition-colors placeholder:text-faint focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring dsk:h-10 dsk:text-md'
const rowCls = 'grid grid-cols-3 items-center gap-x-3 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_repeat(3,5.5rem)]'
const COLUMNS = [
  { key: 'expected', label: EXPECTED_LABEL },
  { key: 'expectedA', label: QUALITY_A_LABEL },
  { key: 'expectedB', label: QUALITY_B_LABEL },
] as const
const headCls =
  'border-b border-rule-strong text-xs font-medium text-muted-foreground hc:border-b-heavy hc:font-bold hc:text-foreground'
const pct0 = (share: number) => `${nf0(share * 100)}\u00a0%`

/** Pronóstico de llegada: lo que se pida a granja de cada tipo, repartido por rango según el modelo. */
export function ForecastPage() {
  const { catalog } = useCatalog()
  // Pesos de la parvada: `edited` es lo que se escribe; `applied`, lo ya enviado al modelo.
  const [edited, setEdited] = useState<WeightDraft | null>(null)
  const [applied, setApplied] = useState<number[]>([])
  const query = useArrivalForecast(applied)
  // Sin respuesta del servidor se dibuja en cero con los tipos del catálogo.
  const forecast = query.data ?? emptyForecast(catalog.products)
  const groupNames = forecast.groups.map((g) => g.name)
  const weights =
    edited ?? weightDraftOf(groupNames, Object.fromEntries(forecast.groups.map((g) => [g.name, g.last_weight ?? 0])))
  const applyWeights = () => {
    if (invalidWeights(weights).length) return
    const next = groupNames.map((g) => parseKg(weights[g] ?? '') ?? 0)
    setApplied(next.some((kg) => kg > 0) ? next : [])
  }
  const names = new Map(catalog.products.map((p) => [p.id, p.name]))
  return (
    <div>
      <PageHeader title={FORECAST_TITLE} subtitle={FORECAST_SUBTITLE} back={paths.production} />
      <PageBody>
        <SyncStatus queries={[query]} />
        {!forecast.available ? (
          <div className="grid max-w-3xl gap-4">
            <Section title={WHAT_TITLE}>
              <p className="px-4 py-3 text-sm text-ink-2 dsk:px-5">{WHAT_BODY}</p>
            </Section>
            <Section>
              <EmptyState title={NO_HISTORY_TITLE}>
                {noHistoryBody(forecast.min_days)}
                <span className="mt-4 block">
                  <Button asChild variant="outline">
                    <Link to={paths.production}>{GO_PRODUCTION_LABEL}</Link>
                  </Button>
                </span>
              </EmptyState>
            </Section>
          </div>
        ) : (
          <Projector
            // Al llegar los datos, el formulario parte de lo último que se pidió.
            key={query.data ? 'server' : 'empty'}
            forecast={forecast}
            name={(id) => names.get(id) ?? id}
            weights={weights}
            onWeight={(group, raw) => setEdited({ ...weights, [group]: raw })}
            onApplyWeights={applyWeights}
          />
        )}
      </PageBody>
    </div>
  )
}

function Projector({
  forecast,
  name,
  weights,
  onWeight,
  onApplyWeights,
}: {
  forecast: ArrivalForecast
  name: (id: string) => string
  weights: WeightDraft
  onWeight: (group: string, raw: string) => void
  onApplyWeights: () => void
}) {
  const [initial] = useState<RequestDraft>(() => requestDraftOf(forecast.groups))
  const [draft, setDraft] = useState<RequestDraft>(initial)
  const groups = project(forecast.groups, draft)
  const t = projectionTotals(groups)
  const changed = JSON.stringify(draft) !== JSON.stringify(initial)

  return (
    <div className={splitCls}>
      <div className="grid min-w-0 gap-4">
        <Section title={WHAT_TITLE}>
          <p className="px-4 py-3 text-sm text-ink-2 dsk:px-5">{WHAT_BODY}</p>
        </Section>
        <Section
          title={REQUEST_TITLE}
          aside={
            changed && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDraft(initial)}
                className="text-primary"
              >
                <RotateCcw /> {RESET_LABEL}
              </Button>
            )
          }
        >
          <div className="grid gap-3 px-4 pt-3 pb-2 sm:grid-cols-3 dsk:px-5">
            {forecast.groups.map((g) => (
              <label key={g.name} className="block min-w-0">
                <span className="mb-1 block text-sm font-medium text-ink-2">
                  {g.name} <span className="font-normal text-muted-foreground">({REQUEST_UNIT})</span>
                </span>
                <input
                  inputMode="numeric"
                  placeholder="0"
                  value={draft[g.name] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [g.name]: keepDigits(e.target.value, RECORD_MAX_DIGITS) }))}
                  className={inputCls}
                />
              </label>
            ))}
          </div>
          <p className="px-4 pb-4 text-sm text-muted-foreground dsk:px-5">{REQUEST_HINT}</p>
        </Section>

        <Section title={WEIGHTS_TITLE}>
          <div className="grid gap-3 px-4 pt-3 pb-2 sm:grid-cols-3 dsk:px-5">
            {forecast.groups.map((g) => (
              <label key={g.name} className="block min-w-0">
                <span className="mb-1 block text-sm font-medium text-ink-2">{g.name}</span>
                <input
                  inputMode="decimal"
                  placeholder="—"
                  value={weights[g.name] ?? ''}
                  onChange={(e) => {
                    const clean = cleanKg(e.target.value)
                    if (clean !== null) onWeight(g.name, clean)
                  }}
                  onBlur={onApplyWeights}
                  onKeyDown={(e) => e.key === 'Enter' && onApplyWeights()}
                  className={inputCls}
                />
              </label>
            ))}
          </div>
          <p className="px-4 pb-4 text-sm text-muted-foreground dsk:px-5">
            {WEIGHTS_HINT}
            {Object.keys(forecast.weights_used).length === 0 && <span className="mt-1 block">{WEIGHTS_UNUSED}</span>}
          </p>
        </Section>

        <Section title={RESULT_TITLE}>
          <div className="pb-1">
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule px-4 py-2 text-xs text-muted-foreground dsk:px-5">
              <span className="flex items-center gap-1.5">
                <i aria-hidden className="size-2.5 bg-chart-1" /> {BAR_LEGEND_A}
              </span>
              <span className="flex items-center gap-1.5">
                <i aria-hidden className="size-2.5 bg-chart-2" /> {BAR_LEGEND_B}
              </span>
              <span>{BARS_NOTE}</span>
            </p>
            {/* En angosto cada cifra lleva su etiqueta encima; la cabecera solo va en ancho. */}
            <div className="hidden sm:block">
              <div className={cn(rowCls, headCls, 'px-4 py-2.5 dsk:px-5')}>
                <span />
                {COLUMNS.map((c) => (
                  <span key={c.key} className="text-right">
                    {c.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid">
              {groups.map((g) => (
                <div key={g.name}>
                  <div className="flex items-baseline gap-3 border-b border-rule bg-muted px-4 py-2 dsk:px-5">
                    <b className="eyebrow min-w-0 flex-1 hc:text-foreground">{g.name}</b>
                    <span className="text-sm text-muted-foreground">
                      pedido <span className="num">{nf0(g.requested)}</span> · llegarán{' '}
                      <b className="num font-medium text-foreground">{nf0(g.expected)}</b>
                    </span>
                  </div>
                  {g.lines.map((l) => (
                    <div
                      key={l.product_id}
                      className={cn(rowCls, 'border-b border-rule px-4 py-2.5 last:border-0 dsk:px-5')}
                    >
                      <span className="col-span-3 min-w-0 sm:col-span-1">
                        <b className={cn('block truncate font-medium', !l.expected && 'text-faint')}>
                          {name(l.product_id)}
                        </b>
                        <Bar value={l.expected} good={l.expectedA} max={t.largest} />
                      </span>
                      {COLUMNS.map((c) => (
                        <span key={c.key} className="min-w-0 sm:text-right">
                          <small className="block text-2xs text-muted-foreground sm:hidden">{c.label}</small>
                          <span
                            className={cn(
                              'num text-base',
                              c.key === 'expected' && 'font-semibold',
                              !l[c.key] && 'font-normal text-faint',
                            )}
                          >
                            {nf0(l[c.key])}
                          </span>
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Section>

        {forecast.accuracy && <Check accuracy={forecast.accuracy} name={name} />}
      </div>

      <aside className="grid gap-4 @4xl/main:sticky @4xl/main:top-6">
        <Section>
          <div className="px-4 py-4 dsk:px-5">
            <b className="num block text-3xl leading-none font-medium hc:font-extrabold">{nf0(t.expected)}</b>
            <small className="mt-1.5 block text-sm text-muted-foreground">{TOTAL_LABEL}</small>
          </div>
          <dl className="grid grid-cols-3 gap-px border-t border-rule bg-rule">
            <div className="flex flex-col-reverse bg-surface px-4 py-3 dsk:px-5">
              <dt className="text-xs text-muted-foreground">pedidas</dt>
              <dd className="num text-lg font-medium hc:font-bold">{nf0(t.requested)}</dd>
            </div>
            <div className="flex flex-col-reverse bg-surface px-4 py-3 dsk:px-5">
              <dt className="text-xs text-muted-foreground">calidad A</dt>
              <dd className="num text-lg font-medium hc:font-bold">{nf0(t.expectedA)}</dd>
            </div>
            <div className="flex flex-col-reverse bg-surface px-4 py-3 dsk:px-5">
              <dt className="text-xs text-muted-foreground">
                calidad B <span className="whitespace-nowrap">({pct0(1 - t.aShare)})</span>
              </dt>
              <dd className="num text-lg font-medium hc:font-bold">{nf0(t.expectedB)}</dd>
            </div>
          </dl>
        </Section>
        {forecast.accuracy && <Accuracy accuracy={forecast.accuracy} />}
        <Section title={DATA_TITLE}>
          <div className="px-4 py-3 text-sm text-ink-2 dsk:px-5">
            <p>
              <b className="font-medium text-foreground">{forecast.days} días</b> con producción registrada
              {forecast.date_from && forecast.date_to && (
                <>
                  , del {dShort(forecast.date_from)} al {dShort(forecast.date_to)}
                </>
              )}
              .
            </p>
          </div>
        </Section>
        <Section title={MODEL_TITLE}>
          <div className="px-4 py-3 dsk:px-5">
            <b className="block font-medium">{modelLabel(forecast.method)}</b>
            <ul className="mt-2 grid gap-px">
              {forecast.candidates.map((c) => (
                <li
                  key={c.name}
                  className={cn(
                    'flex items-baseline gap-2 rounded-sm px-2.5 py-1.5 text-sm',
                    c.name === forecast.method
                      ? 'bg-selected font-medium text-selected-foreground hc:font-bold'
                      : 'text-muted-foreground',
                  )}
                >
                  <span className="min-w-0 flex-1">{modelLabel(c.name)}</span>
                  <span className="num">{pct0(c.error)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">{MODEL_NOTE}</p>
            {!forecast.candidates.some((c) => c.name === 'hybrid_weight') && (
              <p className="mt-1.5 text-xs text-muted-foreground">{MODEL_WEIGHT_NOTE}</p>
            )}
          </div>
        </Section>
      </aside>
    </div>
  )
}

/** Barra del producto: la parte en calidad A (serie 1) y la de calidad B (serie 2). */
function Bar({ value, good, max }: { value: number; good: number; max: number }) {
  const width = (n: number) => `${max ? (n / max) * 100 : 0}%`
  return (
    <span className="mt-1.5 flex h-1.5 gap-px overflow-hidden bg-muted" aria-hidden>
      {good > 0 && <i className="h-full bg-chart-1" style={{ width: width(good) }} />}
      {value - good > 0 && <i className="h-full bg-chart-2" style={{ width: width(value - good) }} />}
    </span>
  )
}

type AccuracyData = NonNullable<ArrivalForecast['accuracy']>

function Accuracy({ accuracy }: { accuracy: AccuracyData }) {
  const top = Math.max(0.01, ...accuracy.by_day.flatMap((d) => [d.error, d.naive_error]))
  const first = accuracy.by_day[0]
  const last = accuracy.by_day[accuracy.by_day.length - 1]
  return (
    <Section title={ACCURACY_TITLE}>
      <div className="px-4 py-3 dsk:px-5">
        <dl className="grid grid-cols-2 gap-3">
          <div className="flex flex-col-reverse">
            <dt className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <i aria-hidden className="size-2.5 flex-none bg-chart-1" /> {ACCURACY_MODEL}
            </dt>
            <dd className="num text-2xl leading-none font-medium hc:font-extrabold">{pct0(accuracy.error)}</dd>
          </div>
          <div className="flex flex-col-reverse">
            <dt className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
              <i aria-hidden className="mt-0.5 size-2.5 flex-none bg-chart-2" /> {ACCURACY_NAIVE}
            </dt>
            <dd className="num text-2xl leading-none font-medium text-ink-2 hc:font-extrabold">
              {pct0(accuracy.naive_error)}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-sm font-medium">{accuracyVerdict(accuracy.error, accuracy.naive_error)}</p>
        <p className="mt-1 text-xs text-muted-foreground">{ACCURACY_NOTE}</p>
        <h3 className="eyebrow mt-4">{BY_DAY_TITLE}</h3>
        <div className="mt-2 flex h-24 items-end gap-1 border-b border-rule-strong">
          {accuracy.by_day.map((d) => (
            <span
              key={d.date}
              title={`${dShort(d.date)}: ${pct0(d.error)} con el pronóstico, ${pct0(d.naive_error)} suponiendo lo pedido`}
              className="flex h-full min-w-0 flex-1 items-end justify-center gap-px"
            >
              <i className="w-1/2 bg-chart-1" style={{ height: `${(d.error / top) * 100}%` }} />
              <i className="w-1/2 bg-chart-2" style={{ height: `${(d.naive_error / top) * 100}%` }} />
            </span>
          ))}
        </div>
        {first && last && (
          <div className="num mt-1 flex justify-between text-xs text-muted-foreground">
            <span>{dShort(first.date)}</span>
            <span>{dShort(last.date)}</span>
          </div>
        )}
      </div>
    </Section>
  )
}

function Check({ accuracy, name }: { accuracy: AccuracyData; name: (id: string) => string }) {
  const cols =
    'grid grid-cols-[minmax(0,1fr)_repeat(4,3.6rem)] items-center gap-x-1.5 sm:grid-cols-[minmax(0,1fr)_repeat(4,6rem)] sm:gap-x-2'
  return (
    <Section title={`${CHECK_TITLE} · últimos ${accuracy.days} días`}>
      <div className="pb-1">
        <div className={cn(cols, headCls, 'px-4 py-2.5 dsk:px-5')}>
          <span>{CHECK_COLUMNS.product}</span>
          <span className="text-right">{CHECK_COLUMNS.ordered}</span>
          <span className="text-right">{CHECK_COLUMNS.expected}</span>
          <span className="text-right">{CHECK_COLUMNS.produced}</span>
          <span className="truncate text-right" title={CHECK_COLUMNS.deviation}>
            {CHECK_COLUMNS.deviation}
          </span>
        </div>
        {accuracy.by_product.map((p) => (
          <div
            key={p.product_id}
            className={cn(cols, 'border-b border-rule px-4 py-2.5 text-base last:border-0 dsk:px-5')}
          >
            <b className="truncate font-medium">{name(p.product_id)}</b>
            <span className={cn('num text-right', !p.ordered && 'text-faint')}>{nf0(p.ordered)}</span>
            <span className="num text-right">{nf0(p.expected)}</span>
            <b className="num text-right font-semibold">{nf0(p.produced)}</b>
            <span className={cn('num text-right', p.produced < p.ordered && 'text-warn hc:font-bold')}>
              {p.produced > p.ordered ? '+' : ''}
              {nf0(p.produced - p.ordered)}
            </span>
          </div>
        ))}
      </div>
    </Section>
  )
}
