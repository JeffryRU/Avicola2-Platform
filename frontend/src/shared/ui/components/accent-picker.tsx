import { Check, Palette } from 'lucide-react'
import { ACCENT_IDS, type Accent } from '@/shared/domain/appearance'
import { ACCENT_LABEL, ACCENTS, BRAND_ACCENT } from '@/shared/types/appearance'
import { useAppearance } from '@/shared/ui/hooks/use-appearance'
import { useBrand } from '@/shared/ui/hooks/use-brand'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/shared/ui/components/shadcn/dropdown-menu'
import { cn } from '@/shared/ui/lib/utils'

/** Botón de paleta: elige el color principal de la app (se guarda en este equipo). */
export function AccentPicker({
  className,
  side = 'bottom',
}: {
  className?: string
  /** Hacia dónde abre el menú: abajo (barra superior) o arriba (pie del menú lateral). */
  side?: 'bottom' | 'top'
}) {
  const { preference, setPreference } = useAppearance()
  const { brand } = useBrand()
  const info = (a: Accent) => (a === 'brand' ? BRAND_ACCENT[brand] : ACCENTS[a])
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${ACCENT_LABEL}: ${info(preference.accent).name}`}
        title={ACCENT_LABEL}
        className={cn(
          'grid size-control flex-none place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground',
          className,
        )}
      >
        <Palette aria-hidden className="size-[1.15rem]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={side}
        align={side === 'top' ? 'start' : 'end'}
        sideOffset={side === 'top' ? 8 : 4}
        className="w-52"
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">{ACCENT_LABEL}</DropdownMenuLabel>
        {ACCENT_IDS.map((a) => {
          const { name, swatch } = info(a)
          const active = preference.accent === a
          return (
            <DropdownMenuItem
              key={a}
              onSelect={() => setPreference({ ...preference, accent: a })}
              className="gap-2.5"
              aria-checked={active}
              role="menuitemradio"
            >
              <span
                aria-hidden
                className="size-4 flex-none rounded-full ring-1 ring-black/10"
                style={{ background: swatch }}
              />
              <span className="flex-1">{name}</span>
              {active && <Check aria-hidden className="size-4 text-primary" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Muestras del color principal en fila (Perfil → Apariencia): una por color, la elegida marcada. */
export function AccentSwatches() {
  const { preference, setPreference } = useAppearance()
  const { brand } = useBrand()
  return (
    <div role="radiogroup" aria-label={ACCENT_LABEL} className="flex flex-wrap gap-2">
      {ACCENT_IDS.map((a) => {
        const { name, swatch } = a === 'brand' ? BRAND_ACCENT[brand] : ACCENTS[a]
        const active = preference.accent === a
        return (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setPreference({ ...preference, accent: a })}
            className={cn(
              'dsk:min-h-control flex min-h-touch items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm transition-colors hover:bg-muted',
              active && 'border-primary bg-selected font-medium text-selected-foreground hover:bg-selected',
            )}
          >
            <span
              aria-hidden
              className="size-4 flex-none rounded-full ring-1 ring-black/10"
              style={{ background: swatch }}
            />
            {name}
            {active && <Check aria-hidden className="size-4" />}
          </button>
        )
      })}
    </div>
  )
}
