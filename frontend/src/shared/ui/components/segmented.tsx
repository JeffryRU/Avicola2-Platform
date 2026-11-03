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
    <div role="tablist" className={cn('inline-flex gap-0.5 rounded-xl bg-muted p-1', full && 'flex', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-[9px] px-[18px] py-[9px] font-bold text-ink-2 transition-colors',
            full && 'flex-1',
            value === o.value && 'bg-white text-primary shadow-sm',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
