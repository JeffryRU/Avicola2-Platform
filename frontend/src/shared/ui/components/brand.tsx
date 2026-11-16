import { useEffect, useState, type ReactNode } from 'react'
import type { BrandId } from '@/shared/types/brands'
import { BrandContext, useBrand } from '@/shared/ui/hooks/use-brand'
import { BRANDS } from '@/shared/types/brands'
import { cn } from '@/shared/ui/lib/utils'

/** Marca activa (colores y logo); se guarda con la función `persist` que recibe. */
export function BrandProvider({
  initial,
  persist,
  children,
}: {
  initial: BrandId
  persist: (b: BrandId) => void
  children: ReactNode
}) {
  const [brand, setBrand] = useState<BrandId>(initial)
  useEffect(() => {
    document.documentElement.dataset.brand = brand
    persist(brand)
  }, [brand, persist])
  return <BrandContext.Provider value={{ brand, setBrand }}>{children}</BrandContext.Provider>
}

/** Mascota de Noraves en un círculo con borde fino dorado (y salto opcional). Identidad del cliente. */
export function Mascot({ size, animated, shadow }: { size: number; animated?: boolean; shadow?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          'relative flex-none overflow-hidden rounded-full border-brand-accent bg-head-foreground',
          animated && 'animate-hop',
        )}
        style={{ width: size, height: size, borderWidth: Math.max(1.5, Math.round(size * 0.025)) }}
      >
        <img src="/mascot.png" alt="" className="absolute top-0 h-full w-auto max-w-none" style={{ left: '-17.3%' }} />
      </div>
      {shadow && <div className={cn('mt-2 h-1.5 w-1/2 rounded-full bg-foreground/15', animated && 'animate-shad')} />}
    </div>
  )
}

/** Isotipo de 3 aspas de Grupo Rocío (geometría del mockup). */
const ISO_PATHS = (() => {
  const C = { x: 50, y: 52 }
  const R = 46
  const rad = (d: number) => (d * Math.PI) / 180
  interface P {
    x: number
    y: number
  }
  const V: P[] = [0, 1, 2].map((i) => ({
    x: C.x + R * Math.cos(rad(-90 + 120 * i)),
    y: C.y + R * Math.sin(rad(-90 + 120 * i)),
  }))
  const L = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  const RT = (p: P, d: number): P => {
    const a = rad(d)
    const dx = p.x - C.x
    const dy = p.y - C.y
    return { x: C.x + dx * Math.cos(a) - dy * Math.sin(a), y: C.y + dx * Math.sin(a) + dy * Math.cos(a) }
  }
  const bow = 0.08
  const M0 = [0, 1, 2].map((i) => L(V[i], V[(i + 1) % 3], 0.5))
  const M = M0.map((m) => L(C, m, 1 + bow))
  const Q = M0.map((m) => RT(L(C, m, 0.32), 60))
  const K = M0.map((m) => RT(L(C, m, 0.6), 30))
  const f = (p: P) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`
  return [0, 1, 2].map((i) => {
    const pv = (i + 2) % 3
    const P1 = L(V[i], M0[pv], 0.5)
    const P2 = L(V[i], M0[i], 0.5)
    const E1 = L(M[pv], P1, 0.5)
    const E2 = L(M[i], P2, 0.5)
    return `M${f(M[pv])} Q${f(L(C, E1, 1 + bow * 0.6))} ${f(P1)} Q${f(V[i])} ${f(P2)} Q${f(L(C, E2, 1 + bow * 0.6))} ${f(M[i])} Q${f(K[i])} ${f(Q[i])} L${f(Q[pv])} Q${f(K[pv])} ${f(M[pv])} Z`
  })
})()

export function IsoMark({ size, onDark, animated }: { size: number; onDark?: boolean; animated?: boolean }) {
  return (
    <svg className={cn(animated && 'iso-anim')} width={size} height={size} viewBox="4 6 92 92" aria-hidden="true">
      <g className="spin">
        {ISO_PATHS.map((d) => (
          <path
            key={d}
            d={d}
            fill={onDark ? 'var(--head-foreground)' : 'var(--brand-accent)'}
            stroke={onDark ? 'var(--head)' : 'var(--surface)'}
            strokeWidth={4.5}
            strokeLinejoin="round"
          />
        ))}
      </g>
    </svg>
  )
}

/** Marca gráfica según la marca activa. */
export function BrandMark({
  size,
  onDark,
  animated,
  shadow,
}: {
  size: number
  onDark?: boolean
  animated?: boolean
  shadow?: boolean
}) {
  const { brand } = useBrand()
  return brand === 'rocio' ? (
    <IsoMark size={Math.round(size * 0.75)} onDark={onDark} animated={animated} />
  ) : (
    <Mascot size={size} animated={animated} shadow={shadow} />
  )
}

/** Marca del producto: cuadro con la inicial, «AviPlanner» y la marca del cliente debajo. */
export function Logo({ onDark, compact }: { onDark?: boolean; compact?: boolean }) {
  const { brand } = useBrand()
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className={cn(
          'grid size-6.5 flex-none place-items-center rounded-md text-sm font-semibold hc:font-extrabold',
          onDark ? 'bg-brand-accent text-head' : 'bg-head text-brand-accent',
        )}
      >
        A
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span
          className={cn('text-md font-semibold hc:font-extrabold', onDark ? 'text-head-foreground' : 'text-foreground')}
        >
          AviPlanner
        </span>
        {!compact && (
          <span className={cn('text-xs', onDark ? 'text-head-muted' : 'text-muted-foreground')}>
            {BRANDS[brand].name}
          </span>
        )}
      </span>
    </div>
  )
}
