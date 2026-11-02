import { useEffect, useState, type ReactNode } from 'react'
import { Check, Clock, Package, RefreshCw } from 'lucide-react'
import { BRANDS, BrandMark, useBrand } from '@/ui/components/brand'
import { cn } from '@/ui/lib/utils'

/** Pantalla de carga con la marca (al abrir la app y al iniciar sesión). */
export function Splash({ visible, durationS = 2.2 }: { visible: boolean; durationS?: number }) {
  const { brand } = useBrand()
  return (
    <div
      aria-hidden={!visible}
      className={cn(
        'fixed inset-0 z-[90] grid place-items-center overflow-hidden bg-head text-white transition-[opacity,visibility] duration-500',
        visible ? 'visible opacity-100' : 'invisible opacity-0',
      )}
    >
      {[420, 640, 880].map((s, i) => (
        <span
          key={s}
          className="splash-ring absolute rounded-full border border-white/10"
          style={{
            width: s,
            height: s,
            left: '50%',
            top: '50%',
            margin: `-${s / 2}px 0 0 -${s / 2}px`,
            animationDelay: `${i * 0.6}s`,
          }}
        />
      ))}
      <div className="relative z-10 grid justify-items-center gap-2">
        <BrandMark size={128} onDark animated shadow />
        <div className="mt-2 text-[40px] font-extrabold tracking-[-0.04em]">{BRANDS[brand].name}</div>
        <div className="opacity-80">Planificación de Demanda</div>
        <div className="mt-[18px] h-1 w-[180px] overflow-hidden rounded bg-white/20">
          {visible && (
            <i
              className="splash-bar block h-full w-full bg-brand-accent"
              style={{ '--dur': `${durationS}s` } as React.CSSProperties}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/** Capa de espera con la mascota saltando ("Enviando proyección"). */
export function LoadingOverlay({ label }: { label: string | null }) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-[70] grid place-items-center bg-background/90 backdrop-blur-sm transition-opacity',
        label ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <div className="grid justify-items-center gap-3.5 font-bold text-ink-2">
        {label && <BrandMark size={92} animated shadow />}
        <span>{label}</span>
      </div>
    </div>
  )
}

const CONFETTI = ['var(--primary)', 'var(--brand-accent)', 'var(--ok)', 'var(--head)', 'var(--series-2)']

/** Confeti de celebración: se muestra al montarse y desaparece solo. */
export function Confetti() {
  const [pieces] = useState(() =>
    matchMedia('(prefers-reduced-motion: reduce)').matches
      ? []
      : [...Array(46)].map(() => ({
          left: Math.random() * 100,
          x: (Math.random() - 0.5) * 160,
          r: Math.random() * 720 - 360,
          delay: Math.random() * 0.35,
        })),
  )
  const [done, setDone] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setDone(true), 2400)
    return () => clearTimeout(t)
  }, [])
  if (done || !pieces.length) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <i
          key={i}
          className="confetti-piece absolute -top-3 h-3 w-2 rounded-[2px]"
          style={
            {
              left: `${p.left}%`,
              background: CONFETTI[i % CONFETTI.length],
              '--x': `${p.x}px`,
              '--r': `${p.r}deg`,
              animationDelay: `${p.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}

export function Note({
  tone = 'info',
  icon,
  children,
  className,
}: {
  tone?: 'info' | 'warn' | 'bad' | 'ok'
  icon: ReactNode
  children: ReactNode
  className?: string
}) {
  const tones = {
    info: 'bg-secondary [&>svg]:text-primary',
    warn: 'bg-warn-soft [&>svg]:text-warn',
    bad: 'bg-bad-soft [&>svg]:text-destructive',
    ok: 'bg-ok-soft [&>svg]:text-ok',
  }
  return (
    <div
      role={tone === 'bad' ? 'alert' : undefined}
      className={cn(
        'flex flex-wrap items-start gap-3.5 rounded-[14px] p-4 [overflow-wrap:anywhere] text-ink-2 [&_b]:text-foreground [&>svg]:mt-0.5 [&>svg]:size-[22px] [&>svg]:flex-none',
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-4 py-9 text-center text-muted-foreground">
      <b className="mb-1 block text-base text-foreground">{title}</b>
      {children}
    </div>
  )
}

/** Insignia redonda con ícono (Confirmada, Pendiente, Sincronizada...). */
export function StatusBadge({ kind }: { kind: 'confirmed' | 'pending' | 'synced' | 'queued' | 'local' }) {
  const map = {
    confirmed: ['Confirmada', 'bg-ok-soft text-ok', 'bg-ok', Check],
    pending: ['Pendiente', 'bg-pend-soft text-slate-500', 'bg-pend', Clock],
    synced: ['Sincronizada', 'bg-ok-soft text-ok', 'bg-ok', Check],
    queued: ['Por sincronizar', 'bg-warn-soft text-warn', 'bg-warn', RefreshCw],
    local: ['En este dispositivo', 'bg-pend-soft text-slate-500', 'bg-pend', Package],
  } as const
  const [label, wrap, dot, Icon] = map[kind]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-[12.5px] font-bold whitespace-nowrap',
        wrap,
      )}
    >
      <span className={cn('grid size-5 place-items-center rounded-full text-white', dot)}>
        <Icon className="size-3" strokeWidth={3} />
      </span>
      {label}
    </span>
  )
}
