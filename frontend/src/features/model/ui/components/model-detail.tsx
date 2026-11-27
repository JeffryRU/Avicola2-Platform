import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { dDM, dShort, weekStart } from '@/shared/domain/dates'
import { nf0, nf1 } from '@/shared/domain/format'
import { LEVELS, type ModelResult, type ModelSummary } from '@/features/model/domain/model'
import {
  BASELINE_KEY,
  DETAIL,
  DETAIL_MISSING,
  IN_USE,
  LEVEL_LABEL,
  MODEL_DESCRIPTION,
  PARAM_LABEL,
  SERIES,
  USE_SHORT,
  WEEKDAYS_SHORT,
} from '@/features/model/types/model'
import { LineChart } from '@/shared/ui/components/charts'
import { DataTable } from '@/shared/ui/components/data-table'
import { Kpi, KpiStrip } from '@/shared/ui/components/layout'
import { cn } from '@/shared/ui/lib/utils'

const pct = (v: number) => `${v.toFixed(1)} %`
const signed = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} %`

/** Fondo de una celda del mapa de calor: más error, más rojo (relativo al mayor de la matriz). */
const heat = (v: number, max: number) =>
  `color-mix(in oklab, var(--bad) ${String(Math.round(8 + 62 * Math.min(1, v / Math.max(max, 1e-9))))}%, var(--surface))`

/** Subtítulo de un bloque del detalle. */
function Block({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 content-start gap-2">
      <div>
        <h4 className="text-sm font-bold text-head dark:text-foreground">{title}</h4>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
      {children}
    </div>
  )
}

/** Lo que trae un modelo con detalle (corridas nuevas). */
type Detailed = ModelResult & Required<Pick<ModelResult, 'split_metrics' | 'matriz' | 'por_tamano' | 'team'>>
const hasDetail = (m: ModelResult): m is Detailed =>
  m.split_metrics != null && m.matriz != null && m.por_tamano != null && m.team != null

function DetailBody({ m, s, baseline }: { m: Detailed; s: ModelSummary; baseline?: ModelResult }) {
  const sizes = s.sizes ?? m.por_tamano.map((_, i) => `Tamaño ${String(i + 1)}`)
  const max = Math.max(0, ...m.matriz.flat().map((v) => v ?? 0))
  // Por semana, como el gráfico de arriba (solo semanas completas).
  const weeks: { start: string; days: number; real: number; model: number }[] = []
  s.series.forEach((p, i) => {
    const start = weekStart(p.date)
    const last = weeks.at(-1)
    if (last?.start === start) {
      last.days += 1
      last.real += p.real
      last.model += m.team[i] ?? 0
    } else weeks.push({ start, days: 1, real: p.real, model: m.team[i] ?? 0 })
  })
  const fullWeeks = weeks.filter((w) => w.days === 7)
  const params = Object.entries(m.params ?? {})
  const boosting = params.some(([k]) => k === 'learning_rate')
  const vsBase = baseline ? m.metrics.vendedor_dia - baseline.metrics.vendedor_dia : null
  return (
    <div className="grid gap-5 border-t border-rule px-4 pt-4 pb-5 dsk:px-5">
      <p className="text-sm text-ink-2">{MODEL_DESCRIPTION[m.key] ?? ''}</p>
      <KpiStrip className="dsk:grid-cols-4">
        <Kpi tone="primary" label={DETAIL.mae} value={m.mae != null ? nf1(m.mae) : '—'} foot={DETAIL.maeFoot} />
        <Kpi tone="kg" label={DETAIL.rmse} value={m.rmse != null ? nf1(m.rmse) : '—'} foot={DETAIL.rmseFoot} />
        <Kpi
          tone={Math.abs(m.metrics.sesgo) < 3 ? 'ok' : 'warn'}
          label={DETAIL.bias}
          value={signed(m.metrics.sesgo)}
          foot={DETAIL.biasFoot(m.metrics.sesgo)}
        />
        <Kpi
          tone={vsBase == null ? 'neutral' : vsBase <= 0 ? 'ok' : 'bad'}
          label={DETAIL.vsBaseline}
          value={vsBase == null || m.key === BASELINE_KEY ? '—' : `${vsBase > 0 ? '+' : ''}${vsBase.toFixed(1)} pts`}
          foot={DETAIL.vsBaselineFoot}
        />
      </KpiStrip>

      <div className="grid gap-5 @5xl/main:grid-cols-2">
        <Block title={DETAIL.splitTitle} note={DETAIL.splitNote}>
          <div className="overflow-x-auto rounded-md border border-border">
            <DataTable
              density="compact"
              rows={[...LEVELS, 'sesgo' as const]}
              rowKey={(l) => l}
              columns={[
                {
                  key: 'level',
                  header: DETAIL.level,
                  cell: (l) => (l === 'sesgo' ? DETAIL.bias : LEVEL_LABEL[l]),
                },
                {
                  key: 'val',
                  header: DETAIL.validation,
                  numeric: true,
                  cell: (l) => (l === 'sesgo' ? signed : pct)(m.split_metrics.validacion[l]),
                },
                {
                  key: 'test',
                  header: DETAIL.test,
                  numeric: true,
                  tone: (l) =>
                    l !== 'sesgo' && m.split_metrics.prueba[l] > m.split_metrics.validacion[l] * 1.25 && 'bad',
                  cell: (l) => (l === 'sesgo' ? signed : pct)(m.split_metrics.prueba[l]),
                },
                {
                  key: 'total',
                  header: DETAIL.total,
                  numeric: true,
                  tone: 'strong',
                  cell: (l) => (l === 'sesgo' ? signed : pct)(m.metrics[l]),
                },
              ]}
            />
          </div>
        </Block>

        <Block title={DETAIL.matrixTitle} note={DETAIL.matrixNote}>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-sm">
              <thead>
                <tr>
                  <th className="text-left text-xs font-semibold text-muted-foreground">{DETAIL.size}</th>
                  {WEEKDAYS_SHORT.map((d) => (
                    <th key={d} className="text-center text-xs font-semibold text-muted-foreground">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.matriz.map((row, r) => (
                  <tr key={sizes[r] ?? r}>
                    <th className="pr-2 text-left text-xs font-medium whitespace-nowrap">{sizes[r]}</th>
                    {row.map((v, d) => (
                      <td
                        key={d}
                        title={v == null ? '' : `${sizes[r]}, ${WEEKDAYS_SHORT[d]}: ${pct(v)}`}
                        className="num h-9 min-w-12 rounded-sm text-center text-xs font-semibold"
                        style={v == null ? undefined : { background: heat(v, max) }}
                      >
                        {v == null ? '—' : v.toFixed(0)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Block>

        <Block title={DETAIL.sizeTitle}>
          <ul className="grid gap-2">
            {m.por_tamano.map((v, i) => {
              const top = Math.max(1e-9, ...m.por_tamano.map((x) => x ?? 0))
              return (
                <li key={sizes[i] ?? i} className="grid grid-cols-[8rem_1fr_4.5rem] items-center gap-2 text-sm">
                  <span className="truncate">{sizes[i]}</span>
                  <span className="h-3 overflow-hidden rounded-full bg-muted">
                    {v != null && (
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${String(Math.min(100, (100 * v) / top))}%` }}
                      />
                    )}
                  </span>
                  <span className={cn('num text-right', v == null && 'text-xs text-muted-foreground')}>
                    {v == null ? DETAIL.noOrders : pct(v)}
                  </span>
                </li>
              )
            })}
          </ul>
        </Block>

        <Block title={DETAIL.params}>
          {params.length ? (
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 rounded-md border border-border text-sm">
              {params.map(([k, v]) => (
                <div
                  key={k}
                  className="col-span-2 grid grid-cols-subgrid border-b border-rule px-3 py-1.5 last:border-0"
                >
                  <dt className="text-ink-2">{PARAM_LABEL[k] ?? k}</dt>
                  <dd className="num text-right font-medium">{String(v)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </Block>
      </div>

      {fullWeeks.length > 0 && (
        <Block title={DETAIL.chartTitle}>
          <div className="relative min-h-72">
            <LineChart
              label={`${DETAIL.chartTitle}: ${m.name}`}
              unitLabel="unid."
              points={fullWeeks.map((w) => ({
                key: w.start,
                label: 'Sem.',
                sublabel: dDM(w.start),
                a: w.model,
                b: w.real,
                tip: (
                  <>
                    <b>Semana del {dShort(w.start)}</b>
                    <br />
                    {m.name}: {nf0(w.model)}
                    <br />
                    {SERIES.real}: {nf0(w.real)}
                  </>
                ),
              }))}
            />
          </div>
        </Block>
      )}

      {boosting && s.features && (
        <Block title={DETAIL.features} note={DETAIL.featuresNote}>
          <ul className="flex flex-wrap gap-1.5">
            {s.features.map((f) => (
              <li key={f} className="rounded-sm bg-muted px-2 py-0.5 text-xs text-ink-2">
                {f}
              </li>
            ))}
          </ul>
        </Block>
      )}
    </div>
  )
}

/** Un modelo plegable: arriba su nombre, para qué se usa y su error; al abrir, todo su detalle. */
function ModelFold({ m, s, baseline }: { m: ModelResult; s: ModelSummary; baseline?: ModelResult }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const uses = (Object.keys(s.chosen) as (keyof typeof s.chosen)[])
    .filter((u) => s.chosen[u] === m.key)
    .map((u) => USE_SHORT[u])
  return (
    <section className="panel overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="flex min-h-14 w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-muted dsk:px-5"
      >
        <ChevronDown aria-hidden className={cn('size-5 flex-none transition-transform', !open && '-rotate-90')} />
        <span className="min-w-0 flex-1">
          <b className="block font-semibold">{m.name}</b>
          {uses.length > 0 && <small className="block text-xs text-ok">★ {IN_USE(uses)}</small>}
        </span>
        <span className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
          <span>
            {LEVEL_LABEL.vendedor_dia}:{' '}
            <b className="num font-semibold text-foreground">{pct(m.metrics.vendedor_dia)}</b>
          </span>
          <span>
            {LEVEL_LABEL.equipo_semana}:{' '}
            <b className="num font-semibold text-foreground">{pct(m.metrics.equipo_semana)}</b>
          </span>
          <span>
            {DETAIL.bias}: <b className="num font-semibold text-foreground">{signed(m.metrics.sesgo)}</b>
          </span>
        </span>
      </button>
      <div id={id} hidden={!open}>
        {open &&
          (hasDetail(m) ? (
            <DetailBody m={m} s={s} baseline={baseline} />
          ) : (
            <p className="border-t border-rule px-4 py-4 text-sm text-muted-foreground dsk:px-5">{DETAIL_MISSING}</p>
          ))}
      </div>
    </section>
  )
}

/** Detalle de todos los modelos: uno plegable por modelo (los que están en uso, primero). */
export function ModelDetails({ s }: { s: ModelSummary }) {
  const inUse = new Set(Object.values(s.chosen))
  const baseline = s.models.find((m) => m.key === BASELINE_KEY)
  const ordered = [...s.models.filter((m) => inUse.has(m.key)), ...s.models.filter((m) => !inUse.has(m.key))]
  return (
    <div className="grid gap-2">
      {ordered.map((m) => (
        <ModelFold key={m.key} m={m} s={s} baseline={baseline} />
      ))}
    </div>
  )
}
