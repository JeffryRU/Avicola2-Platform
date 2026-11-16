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
              'relative flex min-w-16 flex-none snap-start flex-col items-center rounded-md border border-border bg-surface px-3 pt-2 pb-2 text-foreground transition-colors hover:border-border-strong',
              active &&
                'border-primary bg-selected text-selected-foreground ring-1 ring-primary hover:border-primary hc:border-foreground hc:bg-nav-active hc:text-nav-active-foreground hc:ring-foreground',
            )}
          >
            <span
              className={cn(
                'text-2xs font-medium tracking-wide uppercase',
                active
                  ? 'text-selected-foreground hc:text-nav-active-foreground'
                  : note
                    ? 'text-primary'
                    : 'text-muted-foreground',
              )}
            >
              {note ?? dDow(d)}
            </span>
            <span className="num text-md font-medium hc:font-bold">{dDM(d)}</span>
            <span aria-hidden className={cn('mt-1 size-1.5 rounded-full', isMarked ? 'bg-ok' : 'bg-transparent')} />
          </button>
        )
      })}
    </div>
  )
}
