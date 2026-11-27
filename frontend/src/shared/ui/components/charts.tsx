import type { ReactNode } from 'react'
import { cn } from '@/shared/ui/lib/utils'
import { PART_COLOR, PREV_COLOR } from '@/shared/ui/lib/chart-dash'
import { nf0, nf1 } from '@/shared/domain/format'
import { niceMax } from '@/shared/domain/chart-scale'
import { useTooltip } from '@/shared/ui/hooks/use-tooltip'
import { useElementWidth } from '@/shared/ui/hooks/use-element-width'
import { useElementSize } from '@/shared/ui/hooks/use-element-size'

/** Por debajo de este ancho (px) el gráfico usa su versión compacta. */
const COMPACT = 560

export interface Bar {
  key: string
  value: number
  label: string
  sublabel: string
  tip: ReactNode
  /** Día sin confirmar: la barra va más tenue (no solo el color: también lo dice el detalle). */
  pending?: boolean
}

/** Barras (unidades por día). */
export function BarChart({
  bars,
  onSelect,
  width = 760,
  height = 270,
  label,
  empty,
  unitLabel,
}: {
  bars: Bar[]
  onSelect?: (key: string) => void
  width?: number
  height?: number
  label: string
  /** Se muestra sobre la cuadrícula cuando todas las barras están en cero. */
  empty?: ReactNode
  /** Medida del eje (p. ej. «unid.» o «kg»), arriba de las cifras. */
  unitLabel?: string
}) {
  // Se dibuja al ancho real de su tarjeta: textos y barras no se agrandan con la pantalla.
  const [ref, measured] = useElementWidth<HTMLDivElement>()
  const { bind, node } = useTooltip()
  const W = measured || width
  const mob = W < COMPACT
  const H = mob ? 230 : height
  const L = mob ? 30 : 44
  const R = 8
  const T = unitLabel ? 34 : 26
  const B = mob ? 40 : 46
  const max = niceMax(Math.max(...bars.map((b) => b.value), 0) * 1.08, 4)
  const iw = W - L - R
  const ih = H - T - B
  const step = iw / bars.length
  const bw = Math.min(mob ? 30 : 92, step * 0.58)
  // Con muchos días (rango personalizado) se muestra una etiqueta cada tanto, sin encimarse.
  const every = Math.max(1, Math.ceil((mob ? 34 : 84) / step))
  // Sin ningún dato, los «0» sobre cada barra solo ensucian (lo explica el aviso vacío).
  const showValues = step >= (mob ? 22 : 30) && bars.some((b) => b.value)
  const y = (v: number) => T + ih - (v / max) * ih
  return (
    <div ref={ref} className="chart relative">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {unitLabel && (
          <text className="ax2" x={L - 8} y={12} textAnchor="end">
            {unitLabel}
          </text>
        )}
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line className="gl" x1={L} x2={W - R} y1={y((max * i) / 4)} y2={y((max * i) / 4)} />
            <text className="ax" x={L - 8} y={y((max * i) / 4) + 4} textAnchor="end">
              {nf0((max * i) / 4)}
            </text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={T + ih} y2={T + ih} stroke="var(--rule-strong)" />
        {bars.map((b, i) => {
          const cx = L + step * i + step / 2
          const h = Math.max((b.value / max) * ih, 3)
          const x = cx - bw / 2
          const top = T + ih - h
          const d = `M${x} ${T + ih} V${top} H${x + bw} V${T + ih} Z`
          return (
            <g
              key={b.key}
              className="col"
              style={{ cursor: onSelect ? 'pointer' : undefined }}
              onClick={() => onSelect?.(b.key)}
              {...bind(b.tip)}
            >
              <rect fill="transparent" x={L + step * i} y={T} width={step} height={ih} />
              <path className={cn('bar', !b.value && 'zero', b.pending && 'pending')} d={d} />
              {showValues && (
                <text className="val" x={cx} y={top - 8} textAnchor="middle">
                  {nf0(b.value)}
                </text>
              )}
              {i % every === 0 && (
                <text className="ax2" x={cx} y={H - B + 20} textAnchor="middle">
                  {mob ? b.label : `${b.label} ${b.sublabel}`}
                </text>
              )}
              {mob && i % every === 0 && (
                <text className="ax" x={cx} y={H - B + 35} textAnchor="middle">
                  {b.sublabel}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {empty && bars.every((b) => !b.value) && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 grid place-items-center px-6 text-center"
          style={{ bottom: B }}
        >
          <div className="rounded-md bg-surface/85 px-4 py-3">{empty}</div>
        </div>
      )}
      {node}
    </div>
  )
}

export interface LinePoint {
  key: string
  label: string
  sublabel: string
  /** Serie A (proyección vigente); null = el día no tiene dato (la línea se corta). */
  a: number | null
  b: number | null
  /** Serie C (lo que habría sugerido el modelo); null = sin dato ese día. */
  c?: number | null
  /** Rondas anteriores de la serie A (hojas 1, 2… antes de la vigente), en orden. */
  earlier?: (number | null)[]
  /** Partes de A apiladas bajo la línea (p. ej. kg por tamaño de brasa), de abajo hacia arriba. */
  parts?: number[]
  tip: ReactNode
}

type Pt = readonly [number, number]

/**
 * Proyección vs venta real: línea continua (A), discontinua (B) y, tenues, las rondas anteriores
 * de A. Bajo A, franjas apiladas con sus partes. Ocupa todo el alto de su contenedor (que debe
 * tener altura: p. ej. flex-1 con un mínimo) y, sin datos, muestra `empty` sobre la cuadrícula.
 */
/**
 * Serie del gráfico de líneas: `a` (proyección vigente), `b` (pedido real), `c` (modelo),
 * `e0`, `e1`… (rondas anteriores de A) y `parts` (franjas apiladas bajo A).
 */
export type LineSeriesId = 'a' | 'b' | 'c' | 'parts' | `e${number}`

export function LineChart({
  points,
  label,
  empty,
  show = () => true,
  focus = null,
  unitLabel,
}: {
  points: LinePoint[]
  label: string
  empty?: ReactNode
  /** Qué series se dibujan (el filtro «Líneas»); por defecto, todas. */
  show?: (id: LineSeriesId) => boolean
  /** Serie resaltada (p. ej. al pasar el mouse por su fila de la tabla): las demás se atenúan. */
  focus?: LineSeriesId | null
  /** Medida del eje (p. ej. «unid.» o «kg»), arriba de las cifras. */
  unitLabel?: string
}) {
  const [ref, size] = useElementSize<HTMLDivElement>()
  const { bind, node } = useTooltip()
  const W = size.width || 720
  const mob = W < COMPACT
  const H = Math.max(size.height, mob ? 240 : 280)
  const L = mob ? 40 : 56
  const R = 14
  const T = unitLabel ? 26 : 16
  const B = 44
  // La escala sigue a lo que se ve: con una sola línea, ocupa todo el alto.
  const values = points.flatMap((p) => [
    show('a') ? (p.a ?? 0) : 0,
    show('b') ? (p.b ?? 0) : 0,
    show('c') ? (p.c ?? 0) : 0,
    ...(p.earlier ?? []).map((v, r) => (show(`e${r}`) ? (v ?? 0) : 0)),
    show('parts') ? (p.parts ?? []).reduce((s, v) => s + v, 0) : 0,
  ])
  const max = niceMax(Math.max(...values, 1) * 1.05, 5)
  const iw = W - L - R
  const ih = H - T - B
  // Cada día en el centro de su columna: con 1 solo día, igual queda centrado.
  const step = iw / Math.max(points.length, 1)
  // Ancho de un rótulo del eje (día y fecha): si no caben todos, uno de cada `every`.
  const every = Math.max(1, Math.ceil(52 / step))
  const x = (i: number) => L + step * (i + 0.5)
  const y = (v: number) => T + ih - (v / max) * ih
  const base = T + ih
  // Los días sin dato se saltan: la línea une los días que sí tienen (sin cortarse).
  const runs = (vals: (number | null)[]): Pt[][] => {
    const pts = vals.flatMap((v, i) => (v == null ? [] : [[x(i), y(v)] as const]))
    return pts.length ? [pts] : []
  }
  const path = (pts: readonly Pt[]) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const area = (top: readonly Pt[], bottom: readonly Pt[]) =>
    `${path(top)} ${[...bottom]
      .reverse()
      .map((p) => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
      .join(' ')} Z`
  const a = points.map((p) => p.a)
  const aRuns = runs(a)
  const b = runs(points.map((p) => p.b))
  const c = runs(points.map((p) => p.c ?? null))
  const rounds = Math.max(0, ...points.map((p) => p.earlier?.length ?? 0))
  const earlier = Array.from({ length: rounds }, (_, r) =>
    runs(points.map((p) => (p.a == null ? null : (p.earlier?.[r] ?? p.a)))),
  )
  // Franjas apiladas: la parte k va entre la suma de las anteriores y la suma hasta ella.
  const nParts = Math.max(0, ...points.map((p) => p.parts?.length ?? 0))
  const cum = (p: LinePoint, k: number) => (p.parts ?? []).slice(0, k).reduce((s, v) => s + v, 0)
  const withParts = points.flatMap((p, i) => (p.a != null && p.parts ? [{ p, i }] : []))
  const bands = Array.from({ length: nParts }, (_, k) =>
    withParts.length
      ? [
          area(
            withParts.map(({ p, i }) => [x(i), y(cum(p, k + 1))] as const),
            withParts.map(({ p, i }) => [x(i), y(cum(p, k))] as const),
          ),
        ]
      : [],
  )
  const hasData = points.some((p) => p.a != null || p.b != null || p.c != null)
  /** Clase de una serie: atenuada si otra está resaltada, marcada si es ella. */
  const dim = (id: LineSeriesId) => (focus == null ? 'series' : focus === id ? 'series focus' : 'series dim')
  return (
    <div ref={ref} className="chart absolute inset-0">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label} className="block">
        {unitLabel && (
          <text className="ax2" x={L - 8} y={12} textAnchor="end">
            {unitLabel}
          </text>
        )}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <g key={i}>
            <line className="gl" x1={L} x2={W - R} y1={y((max * i) / 5)} y2={y((max * i) / 5)} />
            <text className="ax" x={L - 8} y={y((max * i) / 5) + 4} textAnchor="end">
              {nf0((max * i) / 5)}
            </text>
          </g>
        ))}
        {show('parts') && nParts ? (
          <g className={dim('parts')}>
            {bands.map((ds, k) =>
              ds.map((d, j) => (
                <path key={`${k}-${j}`} className="band" d={d} style={{ fill: PART_COLOR[k % PART_COLOR.length] }} />
              )),
            )}
          </g>
        ) : (
          show('a') &&
          !nParts && (
            <g className={dim('a')}>
              {aRuns.map((run, j) => (
                <path
                  key={j}
                  className="area"
                  d={area(
                    run,
                    run.map((p) => [p[0], base] as const),
                  )}
                />
              ))}
            </g>
          )
        )}
        {points.map((p, i) => (
          <g key={p.key} className="col" {...(p.a != null || p.b != null || p.c != null ? bind(p.tip) : {})}>
            <rect fill="transparent" x={x(i) - step / 2} y={T} width={step} height={ih} />
            <line className="guide" x1={x(i)} x2={x(i)} y1={T} y2={T + ih} />
            {/* Con muchos puntos (un mes) se rotula uno de cada `every` para que no se encimen. */}
            {i % every === 0 && (
              <>
                <text className="ax2" x={x(i)} y={H - B + 20} textAnchor="middle">
                  {p.label}
                </text>
                <text className="ax" x={x(i)} y={H - B + 35} textAnchor="middle">
                  {p.sublabel}
                </text>
              </>
            )}
          </g>
        ))}
        {earlier.map(
          (rs, r) =>
            show(`e${r}`) && (
              <g key={`r${r}`} className={dim(`e${r}`)}>
                {rs.map((pts, j) => (
                  <g key={j}>
                    <path className="halo" d={path(pts)} />
                    <path
                      className="ln prev"
                      d={path(pts)}
                      style={{
                        strokeDasharray: `var(--dash-chart-prev-${String((r % 3) + 1)})`,
                        stroke: PREV_COLOR[r % PREV_COLOR.length],
                      }}
                    />
                    {pts.map((p, i) => (
                      <circle
                        key={i}
                        className="pt prev"
                        cx={p[0]}
                        cy={p[1]}
                        r={3}
                        style={{ stroke: PREV_COLOR[r % PREV_COLOR.length] }}
                      />
                    ))}
                  </g>
                ))}
              </g>
            ),
        )}
        {show('a') && (
          <g className={dim('a')}>
            {aRuns.map((run, j) => (
              <g key={j}>
                <path className="halo" d={path(run)} />
                <path className="ln s1" d={path(run)} />
              </g>
            ))}
            {aRuns.flat().map((p, i) => (
              <circle key={`ap${i}`} className="pt s1" cx={p[0]} cy={p[1]} r={4} />
            ))}
          </g>
        )}
        {show('c') && (
          <g className={dim('c')}>
            {c.map((run, j) => (
              <g key={j}>
                <path className="halo" d={path(run)} />
                <path className="ln s3" d={path(run)} />
              </g>
            ))}
            {c.flat().map((p, i) => (
              <path
                key={`cp${i}`}
                className="pt s3"
                d={`M${p[0]} ${p[1] - 5} L${p[0] + 5} ${p[1]} L${p[0]} ${p[1] + 5} L${p[0] - 5} ${p[1]} Z`}
              />
            ))}
          </g>
        )}
        {show('b') && (
          <g className={dim('b')}>
            {b.map((run, j) => (
              <g key={j}>
                <path className="halo" d={path(run)} />
                <path className="ln s2" d={path(run)} />
              </g>
            ))}
            {b.flat().map((p, i) => (
              <rect key={`bp${i}`} className="pt s2" x={p[0] - 3.5} y={p[1] - 3.5} width={7} height={7} />
            ))}
          </g>
        )}
      </svg>
      {!hasData && empty && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 grid place-items-center px-6 text-center"
          style={{ bottom: B }}
        >
          <div className="rounded-md bg-surface/85 px-4 py-3">{empty}</div>
        </div>
      )}
      {node}
    </div>
  )
}

/** Cifra formateada (sin animación: el dato se lee al instante). */
export function CountUp({ value, decimals = 0, suffix = '' }: { value: number; decimals?: number; suffix?: string }) {
  return (
    <span>
      {decimals ? nf1(value) : nf0(value)}
      {suffix}
    </span>
  )
}
