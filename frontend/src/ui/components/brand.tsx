import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/ui/lib/utils'

export type BrandId = 'noraves' | 'rocio'
export const BRANDS: Record<BrandId, { name: string; tag: string }> = {
  noraves: { name: 'Noraves', tag: 'Proyección inteligente para una mejor producción' },
  rocio: { name: 'Grupo Rocío', tag: 'Transformamos realidades para mejorar vidas' },
}

interface BrandState {
  brand: BrandId
  setBrand: (b: BrandId) => void
}
const BrandContext = createContext<BrandState>({ brand: 'noraves', setBrand: () => {} })

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

// eslint-disable-next-line react-refresh/only-export-components
export const useBrand = () => useContext(BrandContext)

/** Mascota de Noraves en un círculo con borde dorado (y salto opcional). */
export function Mascot({ size, animated, shadow }: { size: number; animated?: boolean; shadow?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          'relative flex-none overflow-hidden rounded-full border-brand-accent bg-white',
          animated && 'animate-hop',
        )}
        style={{ width: size, height: size, borderWidth: Math.max(2, Math.round(size * 0.04)) }}
      >
        <img src="/mascot.png" alt="" className="absolute top-0 h-full w-auto max-w-none" style={{ left: '-17.3%' }} />
      </div>
      {shadow && <div className={cn('mt-2 h-2 w-[56%] rounded-full bg-head/20', animated && 'animate-shad')} />}
    </div>
  )
}

/** Isotipo de 3 aspas de Grupo Rocío (geometría del mockup). */
const ISO_PATHS = (() => {
  const C = { x: 50, y: 52 }
  const R = 46
  const rad = (d: number) => (d * Math.PI) / 180
  type P = { x: number; y: number }
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
            fill={onDark ? '#fff' : '#E2231A'}
            stroke={onDark ? '#1F1D1B' : '#fff'}
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

export function Logo({ onDark }: { onDark?: boolean }) {
  const { brand } = useBrand()
  return (
    <div className="flex items-center gap-2.5">
      {brand === 'rocio' ? <IsoMark size={34} onDark={onDark} /> : <Mascot size={44} />}
      <span
        className={cn(
          'font-extrabold tracking-[-0.04em]',
          brand === 'rocio' ? 'text-[22px]' : 'text-[26px]',
          onDark ? 'text-white' : 'text-foreground',
        )}
      >
        {BRANDS[brand].name}
      </span>
    </div>
  )
}
