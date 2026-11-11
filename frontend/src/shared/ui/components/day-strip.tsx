import { dDM, dDow, type IsoDate } from '@/shared/domain/dates'
import { cn } from '@/shared/ui/lib/utils'

/**
 * Selector de día en tira: se ve todo el rango de un vistazo y se cambia con un toque.
 * En pantallas angostas se desliza de lado sin mover la página.
 */
export function DayStrip({
  days,
  value,
  onChange,
  label,
  marked,
  markedLabel,
  caption,
}: {
  days: IsoDate[]
  value: IsoDate
  onChange: (day: IsoDate) => void
  /** Nombre accesible del grupo (p. ej. "Día del stock"). */
  label: string
  /** Días con un punto (p. ej. los que ya tienen registro). */
  marked?: ReadonlySet<IsoDate>
  markedLabel?: string
  /** Texto corto sobre el día ("Hoy", "Mañana"). */
  caption?: (day: IsoDate) => string | undefined
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="-mx-4 flex snap-x scroll-px-4 [scrollbar-width:none] gap-2 overflow-x-auto px-4 pt-1 pb-4 dsk:-mx-3 dsk:scroll-px-3 dsk:px-3 [&::-webkit-scrollbar]:hidden"
    >
      {days.map((d) => {
        const active = d === value
        const isMarked = marked?.has(d)
        const note = caption?.(d)
        return (
          <button
            key={d}
            type="button"
            aria-pressed={active}
            aria-label={`${note ? `${note}, ` : ''}${dDow(d)} ${dDM(d)}${isMarked && markedLabel ? `, ${markedLabel}` : ''}`}
            onClick={() => onChange(d)}
            className={cn(
              'relative flex min-w-[68px] flex-none snap-start flex-col items-center rounded-[14px] border-[1.5px] px-3 pt-2 pb-2.5 transition-colors',
              active
                ? 'border-primary bg-primary text-white shadow-[0_6px_16px_var(--primary-ring)]'
                : 'border-border bg-card text-foreground hover:border-primary/50',
            )}
          >
            <span
              className={cn(
                'text-[11px] leading-4 font-bold tracking-[0.04em] uppercase',
                active ? 'text-white/85' : note ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {note ?? dDow(d)}
            </span>
            <span className="text-[17px] leading-6 font-extrabold tabular-nums">{dDM(d)}</span>
            <span
              aria-hidden
              className={cn(
                'mt-1 size-1.5 rounded-full',
                isMarked ? (active ? 'bg-white' : 'bg-ok') : 'bg-transparent',
              )}
            />
          </button>
        )
      })}
    </div>
  )
}
