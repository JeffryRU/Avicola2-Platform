import { useState, type ReactNode } from 'react'
import { Paintbrush, RotateCcw } from 'lucide-react'
import {
  DEFAULT_LINE_STYLE,
  LINE_STYLES,
  isLineKey,
  type ChartKey,
  type LineKey,
  type LineStyle,
} from '@/shared/domain/look'
import { CHART_COLORS_TEXT as T, CHART_SERIES_NAMES, LINE_STYLE_NAMES } from '@/shared/types/appearance'
import { ColorPicker } from '@/shared/ui/components/color-picker'
import { Button } from '@/shared/ui/components/shadcn/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/components/shadcn/dialog'
import { useAppearance } from '@/shared/ui/hooks/use-appearance'
import { useLook } from '@/shared/ui/hooks/use-look'
import { resolveHex } from '@/shared/ui/lib/css-color'
import { cn } from '@/shared/ui/lib/utils'

/** Una serie del gráfico: su color (variable CSS), su nombre y su muestra (línea, franja…). */
export interface ChartSeries {
  key: ChartKey
  name: string
  sample: ReactNode
  /** Se pinta relleno (barras, franjas): solo tiene color, no trazo. */
  fill?: boolean
}

/** Trazos que se pueden elegir para una línea, cada uno dibujado. */
function LineStylePicker({
  value,
  onChange,
  label,
}: {
  value: LineStyle
  onChange: (s: LineStyle) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {(Object.keys(LINE_STYLES) as LineStyle[]).map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          aria-label={LINE_STYLE_NAMES[s]}
          title={LINE_STYLE_NAMES[s]}
          onClick={() => onChange(s)}
          className={cn(
            'grid h-8 w-10 place-items-center rounded-md border border-border bg-surface text-ink-2 hover:bg-muted',
            value === s && 'border-primary bg-selected text-selected-foreground hover:bg-selected',
          )}
        >
          <svg aria-hidden width="26" height="6" viewBox="0 0 26 6">
            <line
              x1="2"
              x2="24"
              y1="3"
              y2="3"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeDasharray={LINE_STYLES[s] === 'none' ? undefined : LINE_STYLES[s]}
            />
          </svg>
        </button>
      ))}
    </div>
  )
}

/**
 * Color (y trazo, si es una línea) de cada serie. Se guarda en la cuenta y vale para todos los
 * gráficos. Lo usan el botón «Colores» del gráfico y Perfil → Apariencia.
 */
export function ChartStyleList({ series }: { series: ChartSeries[] }) {
  const { preference, setPreference } = useLook()
  const high = useAppearance().resolved.contrast === 'high'
  const setColor = (key: ChartKey, color: string) =>
    setPreference({ ...preference, chart: { ...preference.chart, [key]: color } })
  const setDash = (key: LineKey, dash: LineStyle) =>
    setPreference({ ...preference, chartDash: { ...preference.chartDash, [key]: dash } })
  const reset = () => {
    const keys = new Set<string>(series.map((s) => s.key))
    // Las barras no tienen trazo: no tocan el de la línea que comparte su color.
    const lines = new Set<string>(series.filter((s) => !s.fill).map((s) => s.key))
    setPreference({
      ...preference,
      chart: Object.fromEntries(Object.entries(preference.chart).filter(([k]) => !keys.has(k))),
      chartDash: Object.fromEntries(Object.entries(preference.chartDash).filter(([k]) => !lines.has(k))),
    })
  }
  const custom = series.some(
    (s) =>
      preference.chart[s.key] !== undefined ||
      (!s.fill && isLineKey(s.key) && preference.chartDash[s.key] !== undefined),
  )
  return (
    <div className="grid gap-3">
      {high && <p className="rounded-md bg-muted p-3 text-sm">{T.hcNote}</p>}
      <ul className="grid divide-y divide-rule rounded-md border border-border bg-surface">
        {series.map((s) => {
          const color = preference.chart[s.key] ?? resolveHex(`var(--${s.key})`, '#1557c0')
          return (
            <li key={s.key} className="grid gap-2 px-3 py-2.5">
              <div className="flex items-center gap-3">
                <span className="flex w-8 flex-none justify-center">{s.sample}</span>
                <span className="min-w-0 flex-1 text-sm font-medium">{s.name}</span>
                <ColorPicker value={color} onChange={(c) => setColor(s.key, c)} title={s.name}>
                  <button
                    type="button"
                    aria-label={`${T.change}: ${s.name}`}
                    className="flex h-touch flex-none items-center gap-2 rounded-md border border-border bg-surface pr-3 pl-1.5 transition-colors hover:bg-muted dsk:h-9"
                  >
                    <span
                      aria-hidden
                      className="size-6 rounded-sm ring-1 ring-black/10"
                      style={{ background: color }}
                    />
                    <span className="num text-xs text-muted-foreground uppercase">{color}</span>
                  </button>
                </ColorPicker>
              </div>
              {isLineKey(s.key) && !s.fill && (
                <div className="flex flex-wrap items-center gap-2 pl-11">
                  <span className="text-xs text-muted-foreground">{T.lineStyle}</span>
                  <LineStylePicker
                    label={`${T.lineStyle}: ${s.name}`}
                    value={preference.chartDash[s.key] ?? DEFAULT_LINE_STYLE[s.key]}
                    onChange={(d) => setDash(s.key as LineKey, d)}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={!custom}>
          <RotateCcw aria-hidden className="size-4" />
          {T.reset}
        </Button>
      </div>
    </div>
  )
}

/** Botón «Colores» de un gráfico: abre la lista de series con su color y su trazo. */
export function ChartColorsButton({
  series,
  className,
  iconOnly = false,
}: {
  series: ChartSeries[]
  className?: string
  /** Solo el ícono (cabeceras con muchos botones). */
  iconOnly?: boolean
}) {
  // Se vuelve a pintar al abrir: el color efectivo depende del tema (claro/oscuro).
  const [, setOpened] = useState(0)
  return (
    <Dialog onOpenChange={(o) => o && setOpened((n) => n + 1)}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={className} title={T.title}>
          <Paintbrush aria-hidden className="size-4" />
          {iconOnly ? (
            <span className="sr-only">{T.title}</span>
          ) : (
            <>
              <span className="hidden sm:inline">{T.button}</span>
              <span className="sr-only sm:hidden">{T.title}</span>
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-4 sm:max-w-lg">
        <div className="grid gap-1 pr-10">
          <DialogTitle className="text-lg font-bold">{T.title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {series.every((s) => s.fill) ? T.hintFill : T.hint}
          </DialogDescription>
        </div>
        <ChartStyleList series={series} />
      </DialogContent>
    </Dialog>
  )
}

/** Muestra genérica de una serie: línea con su color y su trazo, o franja. */
function SeriesSample({ k }: { k: ChartKey }) {
  if (!isLineKey(k))
    return (
      <svg aria-hidden width="14" height="14" viewBox="0 0 14 14">
        <rect
          x="1"
          y="1"
          width="12"
          height="12"
          rx="2"
          fill={`var(--${k})`}
          fillOpacity={0.45}
          stroke={`var(--${k})`}
        />
      </svg>
    )
  return (
    <svg aria-hidden width="28" height="8" viewBox="0 0 28 8">
      <line
        x1="2"
        x2="26"
        y1="4"
        y2="4"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={{ stroke: `var(--${k})`, strokeDasharray: `var(--dash-${k})` }}
      />
    </svg>
  )
}

/** Todas las series de los gráficos de la app, con su color y trazo (Perfil → Apariencia). */
export function AllChartStyles() {
  const series = (Object.keys(CHART_SERIES_NAMES) as ChartKey[]).map((k) => ({
    key: k,
    name: CHART_SERIES_NAMES[k],
    sample: <SeriesSample k={k} />,
  }))
  return <ChartStyleList series={series} />
}
