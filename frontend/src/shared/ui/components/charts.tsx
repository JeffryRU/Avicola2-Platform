import type { ReactNode } from 'react'
import { EARLIER_DASH } from '@/shared/ui/lib/chart-dash'
import { nf0, nf1 } from '@/shared/domain/format'
import { niceMax } from '@/shared/domain/chart-scale'
import { useTooltip } from '@/shared/ui/hooks/use-tooltip'
import { useElementWidth } from '@/shared/ui/hooks/use-element-width'

/** Por debajo de este ancho (px) el gráfico usa su versión compacta. */
const COMPACT = 560

export interface Bar {
  key: string
  value: number
  label: string
  sublabel: string
  tip: ReactNode
}

/** Barras (unidades por día). */
export function BarChart({
  bars,
  onSelect,
  width = 760,
  height = 270,
  label,
}: {
  bars: Bar[]
  onSelect?: (key: string) => void
  width?: number
  height?: number
  label: string
}) {
  // Se dibuja al ancho real de su tarjeta: textos y barras no se agrandan con la pantalla.
  const [ref, measured] = useElementWidth<HTMLDivElement>()
  const { bind, node } = useTooltip()
  const W = measured || width
  const mob = W < COMPACT
  const H = mob ? 230 : height
  const L = mob ? 30 : 44
  const R = 8
  const T = 26
  const B = mob ? 40 : 46
  const max = niceMax(Math.max(...bars.map((b) => b.value), 0) * 1.08, 4)
  const iw = W - L - R
  const ih = H - T - B
  const step = iw / bars.length
  const bw = Math.min(mob ? 30 : 92, step * 0.58)
  // Con muchos días (rango personalizado) se muestra una etiqueta cada tanto, sin encimarse.
  const every = Math.max(1, Math.ceil((mob ? 34 : 84) / step))
  const showValues = step >= (mob ? 22 : 30)
  const y = (v: number) => T + ih - (v / max) * ih
  return (
    <div ref={ref} className="chart relative">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
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
              <path className={b.value ? 'bar' : 'bar zero'} d={d} />
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
      {node}
    </div>
  )
}

export interface LinePoint {
  key: string
  label: string
  sublabel: string
  a: number
  b: number | null
  /** Rondas anteriores de la serie A (hojas 1, 2… antes de la vigente), en orden. */
  earlier?: number[]
  tip: ReactNode
}

/** Dos series (proyección vs venta real): línea continua y línea discontinua, para no depender del color. */
export function LineChart({ points, label }: { points: LinePoint[]; label: string }) {
  const [ref, measured] = useElementWidth<HTMLDivElement>()
  const { bind, node } = useTooltip()
  const W = measured || 720
  const mob = W < COMPACT
  const H = mob ? 250 : 330
  const L = mob ? 40 : 56
  const R = 14
  const T = 16
  const B = 44
  const max = niceMax(Math.max(...points.flatMap((p) => [p.a, p.b ?? 0, ...(p.earlier ?? [])]), 1) * 1.05, 5)
  const iw = W - L - R
  const ih = H - T - B
  const step = iw / Math.max(points.length - 1, 1)
  const x = (i: number) => L + step * i
  const y = (v: number) => T + ih - (v / max) * ih
  const p1 = points.map((p, i) => [x(i), y(p.a)] as const)
  const p2 = points.flatMap((p, i) => (p.b == null ? [] : [[x(i), y(p.b)] as const]))
  const path = (pts: readonly (readonly [number, number])[]) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const area = `${path(p1)} L${p1[p1.length - 1][0]} ${T + ih} L${p1[0][0]} ${T + ih} Z`
  const rounds = Math.max(0, ...points.map((p) => p.earlier?.length ?? 0))
  const earlier = Array.from({ length: rounds }, (_, r) =>
    points.map((p, i) => [x(i), y(p.earlier?.[r] ?? p.a)] as const),
  )
  return (
    <div ref={ref} className="chart relative">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <g key={i}>
            <line className="gl" x1={L} x2={W - R} y1={y((max * i) / 5)} y2={y((max * i) / 5)} />
            <text className="ax" x={L - 8} y={y((max * i) / 5) + 4} textAnchor="end">
              {nf0((max * i) / 5)}
            </text>
          </g>
        ))}
        <path className="area" d={area} />
        {points.map((p, i) => (
          <g key={p.key} className="col" {...bind(p.tip)}>
            <rect fill="transparent" x={x(i) - step / 2} y={T} width={step} height={ih} />
            <line className="guide" x1={x(i)} x2={x(i)} y1={T} y2={T + ih} />
            <text className="ax2" x={x(i)} y={H - B + 20} textAnchor="middle">
              {p.label}
            </text>
            <text className="ax" x={x(i)} y={H - B + 35} textAnchor="middle">
              {p.sublabel}
            </text>
          </g>
        ))}
        {earlier.map((pts, r) => (
          <g key={`r${r}`}>
            <path
              className="ln prev"
              d={path(pts)}
              style={{ strokeDasharray: EARLIER_DASH[r % EARLIER_DASH.length] }}
            />
            {pts.map((p, i) => (
              <circle key={i} className="pt prev" cx={p[0]} cy={p[1]} r={3} />
            ))}
          </g>
        ))}
        <path className="ln s1" d={path(p1)} />
        {p2.length > 1 && <path className="ln s2" d={path(p2)} />}
        {p1.map((p, i) => (
          <circle key={`a${i}`} className="pt s1" cx={p[0]} cy={p[1]} r={4} />
        ))}
        {p2.map((p, i) => (
          <rect key={`b${i}`} className="pt s2" x={p[0] - 3.5} y={p[1] - 3.5} width={7} height={7} />
        ))}
      </svg>
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
