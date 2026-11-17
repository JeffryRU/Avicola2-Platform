import { PersonStanding, RotateCcw } from 'lucide-react'
import { activeA11yCount, DEFAULT_A11Y, type A11yPreference } from '@/shared/domain/accessibility'
import { contrastFromSwitch } from '@/shared/domain/appearance'
import {
  A11Y_LABEL,
  A11Y_OPTIONS,
  A11Y_READER_UNAVAILABLE,
  A11Y_RESET_LABEL,
  A11Y_TEXT_SIZE_LABEL,
  A11Y_TEXT_SIZES,
  HIGH_CONTRAST_HINT,
  HIGH_CONTRAST_LABEL,
} from '@/shared/types/appearance'
import { useAccessibility } from '@/shared/ui/hooks/use-accessibility'
import { canSpeak } from '@/shared/ui/lib/reader'
import { useAppearance } from '@/shared/ui/hooks/use-appearance'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/components/shadcn/dropdown-menu'
import { cn } from '@/shared/ui/lib/utils'

/** El menú no se cierra al marcar una opción: se pueden combinar varias seguidas. */
const keepOpen = (e: Event) => e.preventDefault()

function Toggle({
  checked,
  onChange,
  title,
  hint,
  disabled,
}: {
  checked: boolean
  onChange: (on: boolean) => void
  title: string
  hint: string
  disabled?: boolean
}) {
  return (
    <DropdownMenuCheckboxItem
      disabled={disabled}
      checked={checked}
      onCheckedChange={onChange}
      onSelect={keepOpen}
      className="items-start py-2"
    >
      <span className="grid gap-0.5">
        <b className="font-medium">{title}</b>
        <small className="text-xs text-muted-foreground">{hint}</small>
      </span>
    </DropdownMenuCheckboxItem>
  )
}

/**
 * Botón de accesibilidad: tamaño del texto, alto contraste (misma regla que Perfil → Apariencia),
 * animaciones, enlaces subrayados, espaciado, letra legible y foco resaltado. Se guarda en este equipo.
 */
export function AccessibilityMenu({
  className,
  side = 'bottom',
}: {
  className?: string
  /** Hacia dónde abre el menú: abajo (barra superior) o arriba (pie del menú lateral). */
  side?: 'bottom' | 'top'
}) {
  const appearance = useAppearance()
  const { preference, setPreference } = useAccessibility()
  const high = appearance.resolved.contrast === 'high'
  const set = (patch: Partial<A11yPreference>) => setPreference({ ...preference, ...patch })
  const setHigh = (on: boolean) =>
    appearance.setPreference({ ...appearance.preference, contrast: contrastFromSwitch(on, appearance.system) })
  const active = activeA11yCount(preference) + Number(high)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={
          active > 0
            ? `${A11Y_LABEL}: ${String(active)} ${active === 1 ? 'opción activa' : 'opciones activas'}`
            : A11Y_LABEL
        }
        title={A11Y_LABEL}
        className={cn(
          'relative grid size-control flex-none place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground',
          className,
        )}
      >
        <PersonStanding aria-hidden className="size-[1.2rem]" />
        {active > 0 && (
          <i
            aria-hidden
            className="absolute top-1 right-1 size-1.5 rounded-full bg-primary hc:size-2 hc:bg-brand-accent hc:ring-1 hc:ring-foreground"
          />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={side}
        align={side === 'top' ? 'start' : 'end'}
        sideOffset={side === 'top' ? 8 : 4}
        className="w-72"
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">{A11Y_LABEL}</DropdownMenuLabel>

        <div className="px-2 pt-1 pb-2">
          <span className="mb-1.5 block text-sm font-medium">{A11Y_TEXT_SIZE_LABEL}</span>
          <div role="radiogroup" aria-label={A11Y_TEXT_SIZE_LABEL} className="grid grid-cols-3 gap-1">
            {A11Y_TEXT_SIZES.map((s) => {
              const on = preference.textSize === s.value
              return (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={s.name}
                  onClick={() => set({ textSize: s.value })}
                  className={cn(
                    'h-control rounded-md border border-border text-sm font-semibold transition-colors hover:bg-muted',
                    on && 'border-primary bg-selected text-selected-foreground hover:bg-selected',
                  )}
                >
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>
        <DropdownMenuSeparator />

        <Toggle checked={high} onChange={setHigh} title={HIGH_CONTRAST_LABEL} hint={HIGH_CONTRAST_HINT} />
        {(Object.keys(A11Y_OPTIONS) as (keyof typeof A11Y_OPTIONS)[]).map((k) => (
          <Toggle
            key={k}
            checked={preference[k]}
            onChange={(on) => set({ [k]: on })}
            title={A11Y_OPTIONS[k].title}
            hint={k === 'readAloud' && !canSpeak ? A11Y_READER_UNAVAILABLE : A11Y_OPTIONS[k].hint}
            disabled={k === 'readAloud' && !canSpeak}
          />
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={active === 0}
          onSelect={(e) => {
            keepOpen(e)
            setPreference(DEFAULT_A11Y)
            if (high) setHigh(false)
          }}
          className="gap-2"
        >
          <RotateCcw aria-hidden className="size-4" />
          {A11Y_RESET_LABEL}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
