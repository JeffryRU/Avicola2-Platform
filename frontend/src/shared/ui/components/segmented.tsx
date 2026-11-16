import { cn } from '@/shared/ui/lib/utils'

/** Segmentos (Semana actual / Historial, categorías...). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  full,
  className,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  full?: boolean
  className?: string
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex gap-0.5 rounded-md border border-border bg-muted p-0.5 hc:border-control hc:bg-surface',
        full && 'flex',
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-touch rounded-sm px-3.5 text-sm font-medium text-ink-2 transition-colors hover:text-foreground dsk:min-h-8',
            full && 'flex-1',
            value === o.value &&
              'bg-surface font-semibold text-foreground ring-1 ring-border hc:bg-nav-active hc:text-nav-active-foreground hc:ring-0',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
