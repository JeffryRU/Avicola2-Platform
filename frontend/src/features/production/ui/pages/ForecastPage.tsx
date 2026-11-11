import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { dShort } from '@/shared/domain/dates'
import { nf0 } from '@/shared/domain/format'
import { paths } from '@/app/routes'
import { useCatalog } from '@/features/catalog/ui/hooks'
import {
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
  BY_DAY_TITLE,
  CHECK_COLUMNS,
  CHECK_TITLE,
  DATA_TITLE,
  EXPECTED_LABEL,
  FORECAST_SUBTITLE,
  FORECAST_TITLE,
  METHOD_TEXT,
  NO_HISTORY_TITLE,
  QUALITY_A_LABEL,
  REQUEST_HINT,
  REQUEST_TITLE,
  RESET_LABEL,
  RESULT_TITLE,
  TOTAL_LABEL,
  noHistoryBody,
} from '@/features/production/types/forecast'
import { useArrivalForecast } from '@/features/production/ui/hooks'
import { EmptyState } from '@/shared/ui/components/feedback'
import { PageBody, PageHeader, Section } from '@/shared/ui/components/layout'
import { cn } from '@/shared/ui/lib/utils'

const splitCls = 'grid items-start gap-4 @4xl/main:grid-cols-[minmax(0,1fr)_340px]'
const inputCls =
  'h-12 w-full min-w-0 rounded-[10px] border-[1.5px] border-border bg-white px-3 text-[17px] font-bold tabular-nums outline-none transition-colors placeholder:text-faint focus:border-primary focus:ring-4 focus:ring-primary-ring'
const rowCls =
  'grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-x-3 sm:grid-cols-[minmax(0,1fr)_6rem_6rem]'
const headCls = 'text-[12px] font-bold tracking-[0.04em] text-muted-foreground uppercase'
const pct0 = (share: number) => `${nf0(share * 100)} %`

/** Pronóstico de llegada: lo que se pida a granja de cada tipo, repartido por rango según el modelo. */
export function ForecastPage() {
  const { catalog } = useCatalog()
  const query = useArrivalForecast()
  const forecast = query.data
  const names = new Map((catalog?.products ?? []).map((p) => [p.id, p.name]))
  return (
    <div>
      <PageHeader title={FORECAST_TITLE} subtitle={FORECAST_SUBTITLE} back={paths.production} />
      <PageBody>
        {!forecast || !catalog ? null : !forecast.available ? (
          <Section>
            <EmptyState title={NO_HISTORY_TITLE}>{noHistoryBody(forecast.min_days)}</EmptyState>
          </Section>
        ) : (
          <Projector forecast={forecast} name={(id) => names.get(id) ?? id} />
        )}
      </PageBody>
    </div>
  )
}

function Projector({ forecast, name }: { forecast: ArrivalForecast; name: (id: string) => string }) {
  const [initial] = useState<RequestDraft>(() => requestDraftOf(forecast.groups))
  const [draft, setDraft] = useState<RequestDraft>(initial)
  const groups = project(forecast.groups, draft)
  const t = projectionTotals(groups)
  const changed = JSON.stringify(draft) !== JSON.stringify(initial)

  return (
    <div className={splitCls}>
      <div className="grid min-w-0 gap-4">
        <Section
          title={REQUEST_TITLE}
          aside={
            changed && (
              <button
                type="button"
                onClick={() => setDraft(initial)}
                className="inline-flex items-center gap-1.5 text-[13px] font-bold text-primary"
              >
                <RotateCcw className="size-3.5" /> {RESET_LABEL}
              </button>
            )
          }
        >
          <div className="grid gap-3 px-4 pt-1 pb-2 sm:grid-cols-3 dsk:px-5">
            {forecast.groups.map((g) => (
              <label key={g.name} className="block min-w-0">
                <span className="mb-1 block text-[13px] font-semibold text-ink-2">{g.name}</span>
                <input
                  inputMode="numeric"
                  placeholder="0"
                  value={draft[g.name] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [g.name]: e.target.value.replace(/\D/g, '').slice(0, 7) }))}
                  className={inputCls}
                />
              </label>
            ))}
          </div>
          <p className="px-4 pb-4 text-[13px] text-muted-foreground dsk:px-5">{REQUEST_HINT}</p>
        </Section>

        <Section title={RESULT_TITLE}>
          <div className="px-3 pt-1 pb-4 dsk:px-4">
            <div className={cn(rowCls, headCls, 'px-3 pb-1.5')}>
              <span />
              <span className="text-right">{EXPECTED_LABEL}</span>
              <span className="text-right">{QUALITY_A_LABEL}</span>
            </div>
            <div className="grid gap-3">
              {groups.map((g) => (
                <div key={g.name}>
                  <div className="flex items-baseline gap-3 rounded-[10px] bg-muted/70 px-3 py-2">
                    <b className="min-w-0 flex-1 text-[13px] tracking-[0.02em] text-ink-2 uppercase">{g.name}</b>
                    <span className="text-[13px] text-muted-foreground tabular-nums">
                      pedido {nf0(g.requested)} · llegarán <b className="text-foreground">{nf0(g.expected)}</b>
                    </span>
                  </div>
                  {g.lines.map((l) => (
                    <div key={l.product_id} className={cn(rowCls, 'border-b border-muted px-3 py-2.5 last:border-0')}>
                      <span className="min-w-0">
                        <b className={cn('block truncate text-[15px]', !l.expected && 'font-semibold text-faint')}>
                          {name(l.product_id)}
                        </b>
                        <Bar value={l.expected} good={l.expectedA} max={t.largest} />
                      </span>
                      <b className={cn('text-right text-[15px] tabular-nums', !l.expected && 'font-normal text-faint')}>
                        {nf0(l.expected)}
                      </b>
                      <span className={cn('text-right text-[15px] tabular-nums', !l.expected && 'text-faint')}>
                        {nf0(l.expectedA)}
                      </span>
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
          <div className="p-4 dsk:p-5">
            <b className="block text-[34px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
              {nf0(t.expected)}
            </b>
            <small className="mt-1 block text-[13px] text-muted-foreground">{TOTAL_LABEL}</small>
            <dl className="mt-3.5 grid grid-cols-3 gap-2 border-t border-muted pt-3 text-[13px]">
              <div>
                <dd className="text-[16px] font-extrabold tabular-nums">{nf0(t.requested)}</dd>
                <dt className="text-muted-foreground">pedidas</dt>
              </div>
              <div>
                <dd className="text-[16px] font-extrabold tabular-nums">{nf0(t.expectedA)}</dd>
                <dt className="text-muted-foreground">calidad A</dt>
              </div>
              <div>
                <dd className="text-[16px] font-extrabold tabular-nums">{pct0(1 - t.aShare)}</dd>
                <dt className="text-muted-foreground">calidad B</dt>
              </div>
            </dl>
          </div>
        </Section>
        {forecast.accuracy && <Accuracy accuracy={forecast.accuracy} />}
        <Section title={DATA_TITLE}>
          <div className="px-4 pt-1 pb-4 text-[13.5px] text-ink-2 dsk:px-5">
            <p>
              <b className="text-foreground">{forecast.days} días</b> con producción registrada
              {forecast.date_from && forecast.date_to && (
                <>
                  , del {dShort(forecast.date_from)} al {dShort(forecast.date_to)}
                </>
              )}
              .
            </p>
            <p className="mt-2 text-muted-foreground">{METHOD_TEXT(forecast.half_life_days)}</p>
          </div>
        </Section>
      </aside>
    </div>
  )
}

/** Barra del producto: la parte en calidad A, sólida; la de calidad B, tenue. */
function Bar({ value, good, max }: { value: number; good: number; max: number }) {
  const width = (n: number) => `${max ? (n / max) * 100 : 0}%`
  return (
    <span className="mt-1.5 flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
      {good > 0 && <i className="h-full rounded-full bg-primary" style={{ width: width(good) }} />}
      {value - good > 0 && <i className="h-full rounded-full bg-primary/35" style={{ width: width(value - good) }} />}
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
      <div className="px-4 pt-1 pb-4 dsk:px-5">
        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dd className="text-[26px] leading-none font-extrabold tabular-nums">{pct0(accuracy.error)}</dd>
            <dt className="mt-1 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
              <i className="size-2.5 flex-none rounded-[3px] bg-primary" /> {ACCURACY_MODEL}
            </dt>
          </div>
          <div>
            <dd className="text-[26px] leading-none font-extrabold text-ink-2 tabular-nums">
              {pct0(accuracy.naive_error)}
            </dd>
            <dt className="mt-1 flex items-start gap-1.5 text-[12.5px] text-muted-foreground">
              <i className="mt-[3px] size-2.5 flex-none rounded-[3px] bg-faint" /> {ACCURACY_NAIVE}
            </dt>
          </div>
        </dl>
        <p className="mt-3 text-[12.5px] text-muted-foreground">{ACCURACY_NOTE}</p>
        <h3 className="mt-4 text-[12px] font-bold tracking-[0.04em] text-muted-foreground uppercase">{BY_DAY_TITLE}</h3>
        <div className="mt-2 flex h-24 items-end gap-1 border-b border-border">
          {accuracy.by_day.map((d) => (
            <span
              key={d.date}
              title={`${dShort(d.date)}: ${pct0(d.error)} con el pronóstico, ${pct0(d.naive_error)} suponiendo lo pedido`}
              className="flex h-full min-w-0 flex-1 items-end justify-center gap-px"
            >
              <i className="w-1/2 rounded-t-[3px] bg-primary" style={{ height: `${(d.error / top) * 100}%` }} />
              <i className="w-1/2 rounded-t-[3px] bg-faint" style={{ height: `${(d.naive_error / top) * 100}%` }} />
            </span>
          ))}
        </div>
        {first && last && (
          <div className="mt-1 flex justify-between text-[12px] text-muted-foreground">
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
    'grid grid-cols-[minmax(0,1fr)_repeat(3,4.5rem)] items-center gap-x-2 sm:grid-cols-[minmax(0,1fr)_repeat(3,6rem)]'
  return (
    <Section title={`${CHECK_TITLE} · últimos ${accuracy.days} días`}>
      <div className="px-3 pt-1 pb-4 dsk:px-4">
        <div className={cn(cols, headCls, 'px-3 pb-1.5')}>
          <span>{CHECK_COLUMNS.product}</span>
          <span className="text-right">{CHECK_COLUMNS.ordered}</span>
          <span className="text-right">{CHECK_COLUMNS.expected}</span>
          <span className="text-right">{CHECK_COLUMNS.produced}</span>
        </div>
        {accuracy.by_product.map((p) => (
          <div key={p.product_id} className={cn(cols, 'border-b border-muted px-3 py-2.5 text-[15px] last:border-0')}>
            <b className="truncate">{name(p.product_id)}</b>
            <span className={cn('text-right tabular-nums', !p.ordered && 'text-faint')}>{nf0(p.ordered)}</span>
            <span className="text-right tabular-nums">{nf0(p.expected)}</span>
            <b className="text-right tabular-nums">{nf0(p.produced)}</b>
          </div>
        ))}
      </div>
    </Section>
  )
}
