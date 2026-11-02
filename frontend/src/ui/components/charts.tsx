import { useState, type ReactNode } from 'react'
import { useCountUp } from '@/ui/hooks/use-count-up'
import { useIsMobile } from '@/ui/hooks/use-is-mobile'

/** Tooltip que sigue al mouse (gráficos y tarjetas del mockup). */
export function useTooltip() {
  const [tip, setTip] = useState<{ x: number; y: number; content: ReactNode } | null>(null)
  const bind = (content: ReactNode) => ({
    onMouseMove: (e: React.MouseEvent) => setTip({ x: e.clientX, y: e.clientY, content }),
    onMouseLeave: () => setTip(null),
  })
  const node = tip && (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[80] -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-[10px] bg-head px-[11px] py-2 text-[13px] leading-snug whitespace-nowrap text-white shadow-lg [&_b]:font-extrabold"
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.content}
    </div>
  )
  return { bind, node }
}

function niceMax(m: number) {
  if (m <= 0) return 10
  const p = Math.pow(10, Math.floor(Math.log10(m)))
  return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => m / p <= s) ?? 10) * p
}

const fmt0 = (n: number) => Math.round(n).toLocaleString('es-PE')

export interface Bar {
  key: string
  value: number
  label: string
  sublabel: string
  tip: ReactNode
}

/** Barras animadas (unidades por día). */
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
  const mob = useIsMobile()
  const { bind, node } = useTooltip()
  const W = mob ? 360 : width
  const H = mob ? 230 : height
  const L = mob ? 30 : 44
  const R = 8
  const T = 26
  const B = mob ? 40 : 46
  const max = niceMax(Math.max(...bars.map((b) => b.value), 0) * 1.08)
  const iw = W - L - R
  const ih = H - T - B
  const step = iw / bars.length
  const bw = Math.min(mob ? 30 : 92, step * 0.58)
  const y = (v: number) => T + ih - (v / max) * ih
  return (
    <div className="chart relative">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line className="gl" x1={L} x2={W - R} y1={y((max * i) / 4)} y2={y((max * i) / 4)} />
            <text className="ax" x={L - 8} y={y((max * i) / 4) + 4} textAnchor="end">
              {fmt0((max * i) / 4)}
            </text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={T + ih} y2={T + ih} stroke="var(--border)" />
        {bars.map((b, i) => {
          const cx = L + step * i + step / 2
          const h = Math.max((b.value / max) * ih, 3)
          const x = cx - bw / 2
          const top = T + ih - h
          const r = Math.min(6, h)
          const d = `M${x} ${T + ih} V${top + r} Q${x} ${top} ${x + r} ${top} H${x + bw - r} Q${x + bw} ${top} ${x + bw} ${top + r} V${T + ih} Z`
          const delay = { '--d': `${i * 0.06}s` } as React.CSSProperties
          return (
            <g
              key={b.key}
              className="col"
              style={{ cursor: onSelect ? 'pointer' : undefined }}
              onClick={() => onSelect?.(b.key)}
              {...bind(b.tip)}
            >
              <rect fill="transparent" x={L + step * i} y={T} width={step} height={ih} />
              <path className={b.value ? 'bar' : 'bar zero'} style={delay} d={d} />
              <text className="val" style={delay} x={cx} y={top - 8} textAnchor="middle">
                {fmt0(b.value)}
              </text>
              <text className="ax2" x={cx} y={H - B + 20} textAnchor="middle">
                {mob ? b.label : `${b.label} ${b.sublabel}`}
              </text>
              {mob && (
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
  tip: ReactNode
}

/** Dos series (proyección vs venta real) con área y puntos animados. */
export function LineChart({ points, label }: { points: LinePoint[]; label: string }) {
  const mob = useIsMobile()
  const { bind, node } = useTooltip()
  const W = mob ? 360 : 720
  const H = mob ? 250 : 330
  const L = mob ? 40 : 56
  const R = 14
  const T = 16
  const B = 44
  const max = niceMax(Math.max(...points.flatMap((p) => [p.a, p.b ?? 0]), 1) * 1.05)
  const iw = W - L - R
  const ih = H - T - B
  const step = iw / Math.max(points.length - 1, 1)
  const x = (i: number) => L + step * i
  const y = (v: number) => T + ih - (v / max) * ih
  const p1 = points.map((p, i) => [x(i), y(p.a)] as const)
  const p2 = points.flatMap((p, i) => (p.b == null ? [] : [[x(i), y(p.b)] as const]))
  const path = (pts: readonly (readonly [number, number])[]) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const area = `${path(p1)} L${p1.at(-1)![0]} ${T + ih} L${p1[0][0]} ${T + ih} Z`
  return (
    <div className="chart relative">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <g key={i}>
            <line className="gl" x1={L} x2={W - R} y1={y((max * i) / 5)} y2={y((max * i) / 5)} />
            <text className="ax" x={L - 8} y={y((max * i) / 5) + 4} textAnchor="end">
              {fmt0((max * i) / 5)}
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
        <path className="ln s1" pathLength={1} d={path(p1)} />
        {p2.length > 1 && <path className="ln s2" pathLength={1} d={path(p2)} />}
        {p1.map((p, i) => (
          <circle
            key={`a${i}`}
            className="pt s1"
            style={{ '--d': `${0.25 + i * 0.12}s` } as React.CSSProperties}
            cx={p[0]}
            cy={p[1]}
            r={5}
          />
        ))}
        {p2.map((p, i) => (
          <circle
            key={`b${i}`}
            className="pt s2"
            style={{ '--d': `${0.25 + i * 0.12}s` } as React.CSSProperties}
            cx={p[0]}
            cy={p[1]}
            r={5}
          />
        ))}
      </svg>
      {node}
    </div>
  )
}

export function Donut({ pct }: { pct: number }) {
  return (
    <div className="relative size-[60px] flex-none dsk:size-[72px]">
      <svg viewBox="0 0 84 84" className="size-full -rotate-90">
        <circle cx="42" cy="42" r="34" fill="none" stroke="var(--border)" strokeWidth="9" />
        <circle
          className="donut-value"
          cx="42"
          cy="42"
          r="34"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="9"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${pct} 100`}
        />
      </svg>
      <b className="absolute inset-0 grid place-items-center text-[13px] font-extrabold dsk:text-base">
        {Math.round(pct)}%
      </b>
    </div>
  )
}

/** Número que cuenta hacia arriba al aparecer. */
export function CountUp({ value, decimals = 0, suffix = '' }: { value: number; decimals?: number; suffix?: string }) {
  const v = useCountUp(value)
  const text = decimals
    ? (Math.round(v * 10) / 10).toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : fmt0(v)
  return (
    <span>
      {text}
      {suffix}
    </span>
  )
}
