import { MAX_DAYS } from '@/features/projections/domain/draft'
import { cn } from '@/shared/ui/lib/utils'
import { daysCount } from '@/shared/types/labels'

/** Selector de 1 a `max` días con riel (como el del mockup). */
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
    <div role="radiogroup" aria-label="Días de proyección" className="relative px-1.5 pt-2">
      <div className="absolute top-6 right-[18px] left-[18px] h-1 rounded bg-border" />
      <div
        className="absolute top-6 left-[18px] h-1 rounded bg-primary transition-[width] duration-300"
        style={{ width: `calc((100% - 36px) * ${max > 1 ? (value - 1) / (max - 1) : 1})` }}
      />
      <div className="relative flex justify-between">
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
                'flex w-9 flex-col items-center gap-2.5 text-base font-semibold text-ink-2',
                current && 'font-extrabold text-primary',
              )}
            >
              <span
                className={cn(
                  'mt-2.5 grid size-3.5 place-items-center rounded-full bg-border text-[15px] font-extrabold text-white transition-all duration-300',
                  n < value && 'bg-primary',
                  current && 'mt-0 -mb-2.5 size-[34px] bg-primary shadow-[0_0_0_6px_var(--primary-ring)]',
                )}
              >
                {current ? n : ''}
              </span>
              <span className={cn(current && 'invisible')}>{n}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
