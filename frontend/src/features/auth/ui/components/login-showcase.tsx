import { Bell, Check, ClipboardList, TrendingUp, WifiOff } from 'lucide-react'
import { Logo } from '@/shared/ui/components/brand'

/** Ilustración de la vista previa (no son datos reales): proyectado vs. venta por día. */
const WEEK = [
  { d: 'L', p: 62, r: 58 },
  { d: 'M', p: 48, r: 50 },
  { d: 'M', p: 74, r: 70 },
  { d: 'J', p: 66, r: 63 },
  { d: 'V', p: 92, r: 88 },
  { d: 'S', p: 84, r: 86 },
  { d: 'D', p: 54, r: 49 },
]

const FEATURES = [
  { icon: ClipboardList, text: 'Registra tu proyección en minutos' },
  { icon: TrendingUp, text: 'Compárala con la venta real' },
  { icon: WifiOff, text: 'Funciona aunque no tengas señal' },
]

/** Panel izquierdo del login (solo escritorio): marca, vista previa de la app y beneficios. */
export function LoginShowcase() {
  return (
    <div className="relative hidden flex-col justify-between overflow-hidden bg-head p-12 text-white dsk:flex">
      {/* Fondo: brillo de marca, cuadrícula de puntos y anillos. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-32 size-[560px] rounded-full bg-primary/40 blur-[130px]" />
        <div className="absolute -right-24 -bottom-48 size-[480px] rounded-full bg-primary/25 blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle,rgb(255_255_255/0.09)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent_85%)] bg-[size:22px_22px]" />
        <div className="absolute top-1/4 -right-44 size-[540px] rounded-full border-[52px] border-white/[0.04]" />
      </div>

      <div className="relative z-10">
        <Logo onDark />
      </div>

      {/* Vista previa de la app. */}
      <div aria-hidden className="relative z-10 mx-auto my-14 w-full max-w-[440px]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-5 shadow-[0_30px_80px_rgb(0_0_0/0.35)] backdrop-blur-md">
          {/* La etiqueta va a la izquierda: a la derecha flota la tarjeta "Proyección confirmada". */}
          <div className="flex items-center gap-2">
            <small className="text-[12px] font-semibold tracking-wide text-white/60 uppercase">Esta semana</small>
            <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11.5px] font-bold text-emerald-200">
              Exactitud 96 %
            </span>
          </div>
          <b className="mt-1 block text-[17px]">Proyección vs. venta real</b>
          <div className="mt-5 grid h-[132px] grid-cols-7 items-end gap-2.5">
            {WEEK.map((w, i) => (
              <div key={i} className="flex h-full flex-col items-center justify-end gap-1.5">
                <div className="flex h-full w-full items-end justify-center gap-[3px]">
                  <span className="w-[40%] rounded-t-[4px] bg-white/85" style={{ height: `${w.p}%` }} />
                  <span className="w-[40%] rounded-t-[4px] bg-primary" style={{ height: `${w.r}%` }} />
                </div>
                <small className="text-[11px] font-semibold text-white/55">{w.d}</small>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end gap-4 text-[12px] text-white/65">
            <span className="flex items-center gap-1.5">
              <i className="size-2 rounded-full bg-white/85" /> Proyectado
            </span>
            <span className="flex items-center gap-1.5">
              <i className="size-2 rounded-full bg-primary" /> Venta real
            </span>
          </div>
        </div>

        <div className="absolute -top-14 -right-10 flex animate-float items-center gap-3 rounded-2xl bg-white px-4 py-3 text-foreground shadow-sheet">
          <span className="grid size-9 place-items-center rounded-full bg-ok-soft text-ok">
            <Check className="size-5" strokeWidth={3} />
          </span>
          <span>
            <b className="block text-[14px]">Proyección confirmada</b>
            <small className="text-muted-foreground">443 unid. · 816 kg</small>
          </span>
        </div>

        <div className="absolute -bottom-8 -left-10 flex animate-float-slow items-center gap-3 rounded-2xl bg-white px-4 py-3 text-foreground shadow-sheet">
          <span className="grid size-9 place-items-center rounded-full bg-secondary text-primary">
            <Bell className="size-[18px]" />
          </span>
          <span>
            <b className="block text-[14px]">Aviso al instante</b>
            <small className="text-muted-foreground">Tu supervisor ve tu envío</small>
          </span>
        </div>
      </div>

      <div className="relative z-10">
        <h2 className="max-w-[16ch] text-[40px] leading-[1.05] font-extrabold tracking-[-0.03em]">
          Planifica la demanda de cada día
        </h2>
        <p className="mt-3 max-w-[44ch] text-[16px] text-white/80">
          Registra tu proyección por producto y compárala con la venta real de la semana.
        </p>
        <ul className="mt-6 flex flex-wrap gap-2.5">
          {FEATURES.map(({ icon: Icon, text }) => (
            <li
              key={text}
              className="flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3.5 py-2 text-[13.5px] font-semibold text-white/90"
            >
              <Icon className="size-4 text-white/70" /> {text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
