import { useState, type ReactNode } from 'react'
import { Columns2, Maximize2, RectangleHorizontal } from 'lucide-react'
import { granularityOf, sumDays, type DayTotals } from '@/features/dashboards/domain/buckets'
import { bucketLabels } from '@/features/dashboards/types/buckets'
import {
  BARS_ARIA,
  BARS_EMPTY_BODY,
  BARS_EMPTY_TITLE,
  BARS_SERIES_NAME,
  BAR_MEASURE_LABEL,
  BAR_UNIT,
  LEGEND_CONFIRMED,
  LEGEND_PENDING,
  MEASURE_GROUP_LABEL,
  barsTitle,
  type BarMeasure,
} from '@/features/dashboards/types/projection-bars'
import { EXPAND_LABEL, EXPAND_TITLE, WIDE_OFF_LABEL, WIDE_ON_LABEL } from '@/features/dashboards/types/versus'
import { nf0 } from '@/shared/domain/format'
import { kgAmount, STATUS_LABEL } from '@/shared/types/labels'
import { BarChart } from '@/shared/ui/components/charts'
import { ChartColorsButton } from '@/shared/ui/components/chart-colors'
import { Section } from '@/shared/ui/components/layout'
import { Segmented } from '@/shared/ui/components/segmented'
import { Button } from '@/shared/ui/components/shadcn/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/components/shadcn/dialog'

/** Muestra de la leyenda: barra llena (confirmado) o tenue con borde punteado (sin confirmar). */
function BarKey({ pending }: { pending?: boolean }) {
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 14 14" className="flex-none">
      <rect
        x="1"
        y="1"
        width="12"
        height="12"
        rx="2"
        style={{
          fill: 'var(--chart-1)',
          fillOpacity: pending ? 0.35 : 1,
          stroke: 'var(--chart-1)',
          strokeDasharray: pending ? '3 2' : undefined,
        }}
      />
    </svg>
  )
}

/**
 * Proyección por día en barras, con lo mismo que «Proyección vs pedido real»: medida (unidades
 * por defecto, o kg), colores, ancho completo (si la pantalla lo permite) y ver en grande.
 */
export function ProjectionBars({
  title,
  days,
  hint,
  onSelect,
  wide,
  period,
}: {
  /** Título sin la medida (se agrega sola: «… (unidades)»). */
  title: string
  days: DayTotals[]
  /** Texto a la derecha del título (p. ej. «Elige una barra para ver el día»). */
  hint?: ReactNode
  onSelect?: (key: string) => void
  /** Ancho completo: el valor y cómo cambiarlo (sin esto, no hay botón). */
  wide?: [boolean, (w: boolean) => void]
  /** Período, para el título del gráfico en grande. */
  period: string
}) {
  const [measure, setMeasure] = useState<BarMeasure>('units')
  const g = granularityOf(days.length)
  const buckets = sumDays(days)
  const bars = buckets.map((d) => {
    const labels = bucketLabels(d, g)
    return {
      key: d.key,
      value: measure === 'units' ? d.u : d.kg,
      label: labels.label,
      sublabel: labels.sublabel,
      pending: !d.confirmed,
      tip: (
        <>
          <b>{labels.title}</b>
          <br />
          {nf0(d.u)} unidades, {kgAmount(d.kg)}
          <br />
          {STATUS_LABEL[d.confirmed ? 'confirmed' : 'pending']}
        </>
      ),
    }
  })
  const anyPending = bars.some((b) => b.pending && b.value)
  const empty = (
    <>
      <b className="block font-semibold text-foreground">{BARS_EMPTY_TITLE}</b>
      <span className="text-sm text-muted-foreground">{BARS_EMPTY_BODY}</span>
    </>
  )
  const legend = anyPending && (
    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm text-ink-2">
      <span className="flex items-center gap-1.5">
        <BarKey />
        {LEGEND_CONFIRMED}
      </span>
      <span className="flex items-center gap-1.5">
        <BarKey pending />
        {LEGEND_PENDING}
      </span>
    </div>
  )
  const fullTitle = barsTitle(title, measure)
  return (
    <Section
      title={fullTitle}
      aside={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {hint && <span className="hidden text-sm text-muted-foreground @5xl/main:inline">{hint}</span>}
          <Segmented
            value={measure}
            onChange={setMeasure}
            options={(['units', 'kg'] as const).map((m) => ({ value: m, label: BAR_MEASURE_LABEL[m] }))}
            className="[&_button]:min-h-8"
          />
          <span className="sr-only">{MEASURE_GROUP_LABEL}</span>
          <ChartColorsButton
            iconOnly
            series={[{ key: 'chart-1', name: BARS_SERIES_NAME, sample: <BarKey />, fill: true }]}
          />
          {wide && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hidden @4xl/main:inline-flex"
              aria-pressed={wide[0]}
              title={wide[0] ? WIDE_OFF_LABEL : WIDE_ON_LABEL}
              onClick={() => wide[1](!wide[0])}
            >
              {wide[0] ? (
                <Columns2 aria-hidden className="size-4" />
              ) : (
                <RectangleHorizontal aria-hidden className="size-4" />
              )}
              <span className="sr-only">{wide[0] ? WIDE_OFF_LABEL : WIDE_ON_LABEL}</span>
            </Button>
          )}
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm" title={EXPAND_TITLE}>
                <Maximize2 aria-hidden className="size-4" />
                <span className="sr-only">{EXPAND_LABEL}</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="flex h-[92dvh] w-[96vw] max-w-none flex-col gap-3 sm:max-w-none">
              <div className="pr-12">
                <DialogTitle className="text-xl font-bold">{fullTitle}</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">{period}</DialogDescription>
              </div>
              {legend}
              <div className="min-h-0 flex-1">
                <BarChart
                  label={BARS_ARIA[measure]}
                  unitLabel={BAR_UNIT[measure]}
                  width={1200}
                  height={560}
                  bars={bars}
                  empty={empty}
                  onSelect={onSelect}
                />
              </div>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      <div className="grid gap-2 px-4 pt-3 pb-4 dsk:px-5">
        {legend}
        <BarChart
          label={BARS_ARIA[measure]}
          unitLabel={BAR_UNIT[measure]}
          width={560}
          height={330}
          bars={bars}
          empty={empty}
          onSelect={onSelect}
        />
      </div>
    </Section>
  )
}
