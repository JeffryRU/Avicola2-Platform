import { MAX_DAYS } from '@/features/projections/domain/draft'
import { cn } from '@/shared/ui/lib/utils'
import { daysCount } from '@/shared/types/labels'

/** Selector de 1 a `max` días: una fila de botones numerados (grandes para el dedo). */
export function DaysSlider({
  value,
  onChange,
  max = MAX_DAYS,
}: {
  value: number
  onChange: (n: number) => void
  max?: number
}) {
  const steps = Array.from({ length: max }, (_, i) => i + 1)
  return (
    <div role="radiogroup" aria-label="Días de proyección" className="flex gap-1.5">
      {steps.map((n) => {
        const current = n === value
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={current}
            aria-label={daysCount(n)}
            onClick={() => onChange(n)}
            className={cn(
              'num min-h-touch min-w-0 flex-1 rounded-md border-control border-border-strong bg-surface text-md font-medium text-ink-2 transition-colors hover:bg-muted dsk:min-h-10',
              n < value &&
                'border-primary/40 bg-selected text-selected-foreground hc:border-foreground hc:bg-muted hc:text-foreground',
              current &&
                'border-primary bg-primary font-semibold text-primary-foreground hover:bg-primary hc:border-foreground hc:bg-nav-active hc:font-bold hc:text-nav-active-foreground',
            )}
          >
            {n}
          </button>
        )
      })}
    </div>
  )
}
