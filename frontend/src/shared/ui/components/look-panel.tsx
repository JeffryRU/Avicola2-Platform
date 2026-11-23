import { useId, useState, type CSSProperties, type ReactNode } from 'react'
import { Check, ChevronDown, Copy, Palette, Pencil, Plus, Shapes, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  DEFAULT_LOOK,
  FONT_IDS,
  FONTS,
  MAX_ICONS,
  MAX_SAVED_LOOKS,
  PATTERN_IDS,
  PATTERN_SIZE,
  PRESET_IDS,
  PRESETS,
  isHex,
  lookOf,
  primaryOf,
  primaryOptions,
  patternUrl,
  readableOn,
  type ColorRef,
  type FontId,
  type Look,
  type PatternId,
  type PatternSetting,
  type PresetId,
  type SavedLook,
} from '@/shared/domain/look'
import { PATTERN_ICONS } from '@/shared/domain/pattern-icons'
import { BRAND_ACCENT, LOOK_TEXT as T, PATTERN_NAMES, PRESET_HINTS } from '@/shared/types/appearance'
import { ColorPicker } from '@/shared/ui/components/color-picker'
import { Segmented } from '@/shared/ui/components/segmented'
import { Button } from '@/shared/ui/components/shadcn/button'
import { Input } from '@/shared/ui/components/shadcn/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/shared/ui/components/shadcn/sheet'
import { Switch } from '@/shared/ui/components/shadcn/switch'
import { useAppearance } from '@/shared/ui/hooks/use-appearance'
import { useBrand } from '@/shared/ui/hooks/use-brand'
import { resolveHex } from '@/shared/ui/lib/css-color'
import { useLook } from '@/shared/ui/hooks/use-look'
import { cn } from '@/shared/ui/lib/utils'

/** Color de muestra de cada zona (los temas «marca» y «blanco» usan los del sistema). */
const sample = {
  menu: (c: ColorRef) => (c === 'brand' ? 'var(--head)' : c === 'surface' ? 'var(--side)' : c),
  active: (c: ColorRef) => (c === 'brand' ? 'var(--brand-accent)' : c === 'surface' ? 'var(--nav-active)' : c),
  background: (c: ColorRef) =>
    c === 'brand' ? 'color-mix(in oklab, var(--head) 11%, #f7f8fa)' : c === 'surface' ? '#f6f6f3' : c,
}

/** Miniatura de un tema: el menú con su ítem activo y la pantalla con su fondo y figuras. */
function LookPreview({ look, className }: { look: Look; className?: string }) {
  const menuLight = look.menu === 'surface' || (isHex(look.menu) && readableOn(look.menu) !== '#ffffff')
  const ink = menuLight ? 'rgb(20 35 61 / 0.35)' : 'rgb(255 255 255 / 0.55)'
  const page: CSSProperties = {
    background: sample.background(look.background),
    backgroundImage: patternUrl(look.pagePattern, look.pageColor, 0.22, look.pageIcons),
    backgroundSize: '64px 64px',
  }
  const menu: CSSProperties = {
    background: sample.menu(look.menu),
    backgroundImage: patternUrl(look.menuPattern, look.menuColor, 0.2, look.menuIcons),
    backgroundSize: '64px 64px',
  }
  return (
    <div
      aria-hidden
      className={cn('flex h-16 overflow-hidden rounded-md border border-border', className)}
      style={page}
    >
      <div className="grid w-[34%] content-start gap-1.5 p-2" style={menu}>
        <i
          className={cn('block h-2', look.shape === 'soft' ? 'rounded-full' : 'rounded-sm')}
          style={{ background: sample.active(look.active) }}
        />
        <i className="block h-1.5 w-3/4 rounded-sm" style={{ background: ink }} />
        <i className="block h-1.5 w-2/3 rounded-sm" style={{ background: ink }} />
      </div>
      <div className="flex flex-1 flex-col">
        {/* Franja de arriba con la cuenta (un círculo) a la derecha. */}
        <div
          className="flex h-3.5 flex-none items-center justify-end border-b border-black/5 px-1.5"
          style={{ background: look.topbar === 'surface' ? 'var(--surface)' : look.topbar }}
        >
          <i className="block size-2 rounded-full" style={{ background: sample.active(look.active) }} />
        </div>
        <div className="flex-1 p-2">
          <i
            className={cn(
              'block h-6 bg-white',
              look.shape === 'soft' ? 'rounded-lg shadow-md' : 'rounded-sm shadow-sm ring-1 ring-black/5',
            )}
          />
        </div>
      </div>
    </div>
  )
}

/** Tarjeta para elegir un tema (predefinido o propio). */
function ThemeCard({
  look,
  name,
  hint,
  active,
  onSelect,
  actions,
}: {
  look: Look
  name: string
  hint?: string
  active: boolean
  onSelect: () => void
  actions?: ReactNode
}) {
  return (
    <div className="relative">
      <button
        type="button"
        role="radio"
        aria-checked={active}
        onClick={onSelect}
        className={cn(
          'grid w-full gap-1.5 rounded-lg border-2 border-transparent p-1.5 text-left transition-colors hover:bg-muted',
          active && 'border-primary bg-selected hover:bg-selected',
        )}
      >
        <LookPreview look={look} />
        <span className="flex items-center gap-1 px-0.5 text-sm font-semibold">
          <span className="min-w-0 flex-1 truncate">{name}</span>
          {active && <Check aria-hidden className="size-4 flex-none text-primary" />}
        </span>
        {hint && <small className="-mt-1 px-0.5 text-xs leading-snug text-muted-foreground">{hint}</small>}
      </button>
      {actions && <div className="absolute top-2.5 right-2.5 flex gap-1">{actions}</div>}
    </div>
  )
}

/** Botón chico sobre la tarjeta de un tema (editar, duplicar, borrar). */
function CardAction({
  label,
  title,
  onClick,
  danger,
  children,
}: {
  label: string
  title: string
  onClick: () => void
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      onClick={onClick}
      className={cn(
        'grid size-7 place-items-center rounded-md bg-surface/90 shadow-sm hover:bg-surface',
        danger ? 'text-bad' : 'text-foreground',
      )}
    >
      {children}
    </button>
  )
}

/** Tipo de letra: cada opción se muestra con su propia letra. */
function FontPicker() {
  const { preference, setPreference } = useLook()
  const pick = (font: FontId) => setPreference({ ...preference, font })
  return (
    <div role="radiogroup" aria-label={T.font} className="grid gap-1.5 sm:grid-cols-2">
      {FONT_IDS.map((id) => {
        const active = preference.font === id
        const family = FONTS[id].family || undefined
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => pick(id)}
            className={cn(
              'relative grid min-h-touch gap-0.5 rounded-md border border-border bg-surface py-1.5 pr-7 pl-2.5 text-left transition-colors hover:bg-muted',
              active && 'border-primary bg-selected text-selected-foreground hover:bg-selected',
            )}
          >
            <span className="text-sm leading-tight font-semibold" style={{ fontFamily: family }}>
              {FONTS[id].name}
            </span>
            <small className="text-xs leading-tight text-muted-foreground" style={{ fontFamily: family }}>
              {T.fontSample}
            </small>
            {active && <Check aria-hidden className="absolute top-1/2 right-2 size-4 -translate-y-1/2" />}
          </button>
        )
      })}
    </div>
  )
}

/** Figuras de una zona: si se ven y de qué tamaño. */
function PatternControl({
  label,
  value,
  onChange,
}: {
  label: string
  value: PatternSetting
  onChange: (v: PatternSetting) => void
}) {
  const id = useId()
  const pct = Math.round(value.size * 100)
  return (
    <div className="grid gap-2 rounded-md border border-border bg-surface p-3">
      <div className="flex items-center gap-3">
        <label htmlFor={`${id}-on`} className="flex-1 text-sm font-medium">
          {label}
        </label>
        <Switch id={`${id}-on`} checked={value.show} onCheckedChange={(show) => onChange({ ...value, show })} />
      </div>
      <div className={cn('flex items-center gap-3', !value.show && 'opacity-50')}>
        <label htmlFor={`${id}-size`} className="w-14 flex-none text-xs text-muted-foreground">
          {T.size}
        </label>
        <input
          id={`${id}-size`}
          type="range"
          min={PATTERN_SIZE.min}
          max={PATTERN_SIZE.max}
          step={PATTERN_SIZE.step}
          value={value.size}
          disabled={!value.show}
          aria-valuetext={`${pct} %`}
          onChange={(e) => onChange({ ...value, size: Number(e.target.value) })}
          className="h-touch min-w-0 flex-1 accent-primary dsk:h-8"
        />
        <span className="num w-11 flex-none text-right text-sm">{pct} %</span>
      </div>
    </div>
  )
}

/** Punto de partida del editor: el tema actual con todos sus colores en `#rrggbb`. */
function toDraft(look: Look, name: string): Look & { name: string } {
  const hex = (ref: ColorRef, css: string, fallback: string) => (isHex(ref) ? ref : resolveHex(css, fallback))
  return {
    ...look,
    name,
    primary: hex(look.primary, 'var(--primary)', '#1557c0'),
    menu: hex(look.menu, sample.menu(look.menu), '#0b2c61'),
    active: hex(look.active, sample.active(look.active), '#fbbb21'),
    background: hex(look.background, sample.background(look.background), '#eef1f6'),
    topbar: hex(look.topbar, 'var(--surface)', '#ffffff'),
  }
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId()
  return (
    <div className="flex items-center gap-3">
      <span id={id} className="flex-1 text-sm font-medium">
        {label}
      </span>
      <ColorPicker value={value} onChange={onChange} title={label}>
        <button
          type="button"
          aria-labelledby={id}
          aria-describedby={`${id}-hex`}
          className="flex h-touch flex-none items-center gap-2 rounded-md border border-border bg-surface pr-3 pl-1.5 transition-colors hover:bg-muted dsk:h-9"
        >
          <span aria-hidden className="size-6 rounded-sm ring-1 ring-black/10" style={{ background: value }} />
          <span id={`${id}-hex`} className="num text-xs text-muted-foreground uppercase">
            {value}
          </span>
        </button>
      </ColorPicker>
    </div>
  )
}

/** Elegir figura: una muestra por figura, con su nombre. */
function PatternPicker({
  label,
  value,
  color,
  base,
  onChange,
  icons,
  onIcons,
}: {
  label: string
  value: PatternId
  color: string
  base: string
  onChange: (p: PatternId) => void
  icons: string[]
  onIcons: (icons: string[]) => void
}) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-1.5">
        {PATTERN_IDS.filter((p) => p !== 'icons').map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={value === p}
            aria-label={PATTERN_NAMES[p]}
            title={PATTERN_NAMES[p]}
            onClick={() => onChange(p)}
            className={cn(
              'grid h-12 place-items-end rounded-md border-2 border-border p-0.5 text-[0.65rem] leading-none',
              value === p && 'border-primary',
            )}
            style={{
              background: base,
              backgroundImage: patternUrl(p, color, 0.45, icons),
              backgroundSize: '56px 56px',
            }}
          >
            <span className="w-full truncate rounded-sm bg-surface/90 px-0.5 py-0.5 text-center text-foreground">
              {PATTERN_NAMES[p]}
            </span>
          </button>
        ))}
      </div>
      {/* Íconos: aparte y a lo ancho, porque se arma con los íconos que uno elige. */}
      <button
        type="button"
        role="radio"
        aria-checked={value === 'icons'}
        onClick={() => onChange('icons')}
        className={cn(
          'flex min-h-touch items-center gap-3 rounded-md border-2 border-dashed border-primary/50 bg-selected/60 px-3 py-2 text-left transition-colors hover:bg-selected',
          value === 'icons' && 'border-solid border-primary bg-selected',
        )}
      >
        <span className="grid size-8 flex-none place-items-center rounded-md bg-primary text-primary-foreground">
          <Shapes aria-hidden className="size-4.5" />
        </span>
        <span className="grid min-w-0 flex-1 leading-tight">
          <b className="text-sm font-semibold text-selected-foreground">{PATTERN_NAMES.icons}</b>
          <small className="text-xs text-muted-foreground">{T.iconsPick}</small>
        </span>
        <span aria-hidden className="flex flex-none gap-1 text-selected-foreground">
          {icons.map((id) => {
            const icon = PATTERN_ICONS.find((i) => i.id === id)
            return icon ? <IconGlyph key={id} body={icon.body} className="size-4" /> : null
          })}
        </span>
        {value === 'icons' && <Check aria-hidden className="size-4 flex-none text-primary" />}
      </button>
      {value === 'icons' && <IconChooser value={icons} onChange={onIcons} />}
    </div>
  )
}

/** Dibujo de un ícono del catálogo (trazos fijos de pattern-icons.ts, no datos del usuario). */
function IconGlyph({ body, className }: { body: string; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  )
}

/** Íconos de la figura «Íconos»: por grupos, se marcan hasta MAX_ICONS (al menos uno). */
function IconChooser({ value, onChange }: { value: string[]; onChange: (icons: string[]) => void }) {
  const groups = [...new Set(PATTERN_ICONS.map((i) => i.group))]
  const toggle = (id: string) => {
    if (value.includes(id)) {
      if (value.length > 1) onChange(value.filter((i) => i !== id))
    } else if (value.length < MAX_ICONS) onChange([...value, id])
    else onChange([...value.slice(1), id])
  }
  return (
    <div className="grid gap-2 rounded-md border border-border bg-muted/50 p-3">
      <div className="flex items-baseline gap-2">
        <span className="flex-1 text-sm font-medium">{T.icons}</span>
        <span className="num text-xs text-muted-foreground">
          {value.length}/{MAX_ICONS}
        </span>
      </div>
      <p className="-mt-1 text-xs text-muted-foreground">{T.iconsHint}</p>
      {groups.map((g) => (
        <div key={g} className="grid gap-1">
          <span className="text-xs font-semibold text-muted-foreground">{g}</span>
          <div role="group" aria-label={g} className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
            {PATTERN_ICONS.filter((i) => i.group === g).map((i) => {
              const on = value.includes(i.id)
              return (
                <button
                  key={i.id}
                  type="button"
                  aria-pressed={on}
                  aria-label={i.name}
                  title={i.name}
                  onClick={() => toggle(i.id)}
                  className={cn(
                    'grid aspect-square place-items-center rounded-md border border-border bg-surface text-ink-2 transition-colors hover:bg-muted',
                    on && 'border-primary bg-selected text-selected-foreground hover:bg-selected',
                  )}
                >
                  <IconGlyph body={i.body} className="size-5" />
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Editor del tema propio: colores, figuras y nombre, con vista previa. */
function LookEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: Look & { name: string }
  onSave: (look: Look & { name: string }) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const set = (patch: Partial<Look & { name: string }>) => setDraft((d) => ({ ...d, ...patch }))
  const nameId = useId()
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ ...draft, name: draft.name.trim() || T.defaultName })
      }}
    >
      <div className="grid gap-1">
        <span className="text-xs font-semibold text-muted-foreground">{T.preview}</span>
        <LookPreview look={draft} className="h-24" />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={nameId} className="text-sm font-medium">
          {T.name}
        </label>
        <Input id={nameId} value={draft.name} maxLength={30} onChange={(e) => set({ name: e.target.value })} />
      </div>
      <div className="grid gap-2">
        <ColorField label={T.primary} value={draft.primary} onChange={(primary) => set({ primary })} />
        <ColorField label={T.menuColor} value={draft.menu} onChange={(menu) => set({ menu })} />
        <ColorField label={T.activeColor} value={draft.active} onChange={(active) => set({ active })} />
        <ColorField label={T.backgroundColor} value={draft.background} onChange={(background) => set({ background })} />
        <ColorField label={T.topbarColor} value={draft.topbar} onChange={(topbar) => set({ topbar })} />
      </div>
      <div className="grid gap-2">
        <span className="text-sm font-medium">{T.shape}</span>
        <Segmented
          value={draft.shape}
          onChange={(shape) => set({ shape })}
          options={[
            { value: 'soft', label: T.shapeSoft },
            { value: 'crisp', label: T.shapeCrisp },
          ]}
          full
        />
      </div>
      <PatternPicker
        label={T.pagePattern}
        value={draft.pagePattern}
        color={draft.pageColor}
        base={draft.background}
        onChange={(pagePattern) => set({ pagePattern })}
        icons={draft.pageIcons}
        onIcons={(pageIcons) => set({ pageIcons })}
      />
      <ColorField label={T.figureColor} value={draft.pageColor} onChange={(pageColor) => set({ pageColor })} />
      <PatternPicker
        label={T.menuPattern}
        value={draft.menuPattern}
        color={draft.menuColor}
        base={draft.menu}
        onChange={(menuPattern) => set({ menuPattern })}
        icons={draft.menuIcons}
        onIcons={(menuIcons) => set({ menuIcons })}
      />
      <ColorField label={T.figureColor} value={draft.menuColor} onChange={(menuColor) => set({ menuColor })} />
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {T.cancel}
        </Button>
        <Button type="submit">{T.save}</Button>
      </div>
    </form>
  )
}

/** Copia sin una clave. */
const without = (o: Record<string, string>, key: string) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => k !== key))

/** Muestra de «otro color»: la rueda de tonos. */
const RAINBOW = 'conic-gradient(#e53935, #fbbb21, #43a047, #00acc1, #1e63d6, #8e24aa, #e53935)'

const newId = () => `mio-${Date.now().toString(36)}`

/** Encabezado de una sección que se abre y se cierra (se recuerda cómo se dejó). */
function Fold({
  title,
  open,
  onToggle,
  aside,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  aside?: ReactNode
  children: ReactNode
}) {
  const id = useId()
  return (
    <section className="grid gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
          className="-ml-1 flex min-h-touch flex-1 items-center gap-1.5 rounded-md px-1 text-left text-sm font-bold hover:bg-muted dsk:min-h-8"
        >
          <ChevronDown aria-hidden className={cn('size-4 transition-transform', !open && '-rotate-90')} />
          {title}
        </button>
        {aside}
      </div>
      <div id={id} hidden={!open}>
        {children}
      </div>
    </section>
  )
}

/**
 * Color principal del tema elegido: el del tema y tonos que combinan con él, más uno a elección.
 * Se recuerda por tema. Lo usan los botones, enlaces, cabeceras de tablas y avisos.
 */
export function PrimaryPicker() {
  const { preference, setPreference } = useLook()
  const appearance = useAppearance()
  const { brand } = useBrand()
  const look = lookOf(preference)
  const current = primaryOf(preference)
  const options = primaryOptions(look, BRAND_ACCENT[brand].swatch)
  const isCustom = !options.some((o) => o.value === current)
  const pick = (value: string) => {
    const primaries =
      value === look.primary
        ? without(preference.primaries, preference.theme)
        : { ...preference.primaries, [preference.theme]: value }
    setPreference({ ...preference, primaries })
    // El color anterior (por cuenta) deja de aplicarse: manda el del tema.
    if (appearance.preference.accent !== 'brand')
      appearance.setPreference({ ...appearance.preference, accent: 'brand' })
  }
  const shown = isHex(current) ? current : BRAND_ACCENT[brand].swatch
  const tile =
    'relative flex min-h-touch w-full items-center gap-2 rounded-md border border-border bg-surface py-1.5 pr-7 pl-2.5 text-left text-sm leading-tight transition-colors hover:bg-muted dsk:min-h-control'
  const on = 'border-primary bg-selected font-medium text-selected-foreground hover:bg-selected'
  const mark = <Check aria-hidden className="absolute top-1/2 right-2 size-4 -translate-y-1/2" />
  return (
    <div role="radiogroup" aria-label={T.primary} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {options.map((o) => {
        const active = o.value === current
        return (
          <button
            key={o.swatch}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => pick(o.value)}
            className={cn(tile, active && on)}
          >
            <span
              aria-hidden
              className="size-5 flex-none rounded-full ring-1 ring-black/10"
              style={{ background: o.swatch }}
            />
            <span className="min-w-0 flex-1">{o.name}</span>
            {active && mark}
          </button>
        )
      })}
      <ColorPicker value={shown} onChange={pick} title={T.primary}>
        <button type="button" role="radio" aria-checked={isCustom} className={cn(tile, isCustom && on)}>
          <span
            aria-hidden
            className="grid size-5 flex-none place-items-center rounded-full ring-1 ring-black/10"
            style={{ background: isCustom ? shown : RAINBOW }}
          >
            {!isCustom && <Plus className="size-3.5 rounded-full bg-surface/90 text-foreground" />}
          </span>
          <span className="min-w-0 flex-1">{isCustom ? T.yourColor : T.otherColor}</span>
          {isCustom ? mark : null}
        </button>
      </ColorPicker>
    </div>
  )
}

/** Contenido del panel: temas, color principal, figuras de fondo y tema propio. */
function LookPanel() {
  const { preference, setPreference } = useLook()
  const high = useAppearance().resolved.contrast === 'high'
  /** null: lista de temas; si no, el tema que se está editando (id vacío: uno nuevo). */
  const [editing, setEditing] = useState<{ id: string; from?: string; draft: Look & { name: string } } | null>(null)

  const select = (theme: string) => setPreference({ ...preference, theme })
  const toggle = (key: 'presets' | 'mine') =>
    setPreference({ ...preference, open: { ...preference.open, [key]: !preference.open[key] } })
  const save = (look: Look & { name: string }) => {
    if (!editing) return
    const id = editing.id || newId()
    const entry: SavedLook = { ...look, id }
    const exists = preference.saved.some((s) => s.id === id)
    if (!exists && preference.saved.length >= MAX_SAVED_LOOKS) {
      toast.error(T.limit)
      return
    }
    const saved = exists ? preference.saved.map((s) => (s.id === id ? entry : s)) : [...preference.saved, entry]
    // El color principal del editor es el del tema: se quita el elegido aparte.
    const primaries = without(preference.primaries, id)
    setPreference({ ...preference, saved, primaries, theme: id, open: { ...preference.open, mine: true } })
    setEditing(null)
    toast.success(T.saved)
  }
  /** Borra un tema propio (los predefinidos no se borran); se puede deshacer desde el aviso. */
  const remove = (theme: SavedLook) => {
    const before = preference
    setPreference({
      ...preference,
      saved: preference.saved.filter((s) => s.id !== theme.id),
      primaries: without(preference.primaries, theme.id),
      theme: preference.theme === theme.id ? DEFAULT_LOOK.theme : preference.theme,
    })
    toast.success(T.deleted(theme.name), { action: { label: T.undo, onClick: () => setPreference(before) } })
  }
  /** Abre el editor con una copia de un tema (predefinido o propio) para guardarla como uno nuevo. */
  const duplicate = (look: Look, name: string, primary: string) => {
    if (preference.saved.length >= MAX_SAVED_LOOKS) {
      toast.error(T.limit)
      return
    }
    setEditing({ id: '', from: name, draft: toDraft({ ...look, primary }, T.copyName(name)) })
  }

  if (editing)
    return (
      <div className="grid gap-3 px-4 pb-6">
        <h3 className="text-md font-bold">
          {editing.id ? T.editTheme : editing.from ? T.newFromTitle(editing.from) : T.editorTitle}
        </h3>
        <LookEditor initial={editing.draft} onSave={save} onCancel={() => setEditing(null)} />
      </div>
    )

  const themeName = PRESET_IDS.includes(preference.theme as PresetId)
    ? PRESETS[preference.theme as PresetId].name
    : (preference.saved.find((s) => s.id === preference.theme)?.name ?? PRESETS.marca.name)

  return (
    <div className="grid gap-6 px-4 pb-6">
      {high && <p className="rounded-md bg-muted p-3 text-sm">{T.hcNote}</p>}
      <Fold title={T.themes} open={preference.open.presets} onToggle={() => toggle('presets')}>
        <div role="radiogroup" aria-label={T.themes} className="grid grid-cols-2 gap-1">
          {PRESET_IDS.map((id) => (
            <ThemeCard
              key={id}
              look={PRESETS[id]}
              name={PRESETS[id].name}
              hint={PRESET_HINTS[id]}
              active={preference.theme === id}
              onSelect={() => select(id)}
              actions={
                <CardAction
                  label={`${T.duplicateTheme}: ${PRESETS[id].name}`}
                  title={T.duplicateTheme}
                  onClick={() =>
                    duplicate(PRESETS[id], PRESETS[id].name, preference.primaries[id] ?? PRESETS[id].primary)
                  }
                >
                  <Copy aria-hidden className="size-3.5" />
                </CardAction>
              }
            />
          ))}
        </div>
      </Fold>

      <Fold
        title={`${T.myThemes}${preference.saved.length ? ` (${preference.saved.length})` : ''}`}
        open={preference.open.mine}
        onToggle={() => toggle('mine')}
        aside={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setEditing({
                id: '',
                draft: toDraft({ ...lookOf(preference), primary: primaryOf(preference) }, T.defaultName),
              })
            }
          >
            <Plus aria-hidden className="size-4" />
            {T.customize}
          </Button>
        }
      >
        {preference.saved.length === 0 ? (
          <p className="text-sm text-muted-foreground">{T.noThemes}</p>
        ) : (
          <div role="radiogroup" aria-label={T.myThemes} className="grid grid-cols-2 gap-1">
            {preference.saved.map((s) => (
              <ThemeCard
                key={s.id}
                look={s}
                name={s.name}
                active={preference.theme === s.id}
                onSelect={() => select(s.id)}
                actions={
                  <>
                    <CardAction
                      label={`${T.editTheme}: ${s.name}`}
                      title={T.editTheme}
                      onClick={() =>
                        setEditing({
                          id: s.id,
                          draft: toDraft({ ...s, primary: preference.primaries[s.id] ?? s.primary }, s.name),
                        })
                      }
                    >
                      <Pencil aria-hidden className="size-3.5" />
                    </CardAction>
                    <CardAction
                      label={`${T.duplicateTheme}: ${s.name}`}
                      title={T.duplicateTheme}
                      onClick={() => duplicate(s, s.name, preference.primaries[s.id] ?? s.primary)}
                    >
                      <Copy aria-hidden className="size-3.5" />
                    </CardAction>
                    <CardAction
                      label={`${T.deleteTheme}: ${s.name}`}
                      title={T.deleteTheme}
                      onClick={() => remove(s)}
                      danger
                    >
                      <Trash2 aria-hidden className="size-3.5" />
                    </CardAction>
                  </>
                }
              />
            ))}
          </div>
        )}
      </Fold>

      <section className="grid gap-2">
        <h3 className="text-sm font-bold">{T.primary}</h3>
        <p className="-mt-1 text-xs text-muted-foreground">{T.primaryHint(themeName)}</p>
        <PrimaryPicker />
      </section>

      <section className="grid gap-2">
        <h3 className="text-sm font-bold">{T.font}</h3>
        <p className="-mt-1 text-xs text-muted-foreground">{T.fontHint}</p>
        <FontPicker />
      </section>

      <section className="grid gap-2">
        <h3 className="text-sm font-bold">{T.patterns}</h3>
        <PatternControl
          label={T.page}
          value={preference.page}
          onChange={(page) => setPreference({ ...preference, page })}
        />
        <PatternControl
          label={T.menu}
          value={preference.menu}
          onChange={(menu) => setPreference({ ...preference, menu })}
        />
      </section>
    </div>
  )
}

/** Botón de paleta: abre el panel de apariencia (tema, figuras, color principal, tema propio). */
export function LookButton({ className }: { className?: string }) {
  return (
    <Sheet>
      <SheetTrigger
        aria-label={T.panel}
        title={T.panel}
        className={cn(
          'grid size-control flex-none place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground',
          className,
        )}
      >
        <Palette aria-hidden className="size-[1.15rem]" />
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-2 overflow-y-auto sm:max-w-md">
        <SheetHeader className="pr-14">
          <SheetTitle className="text-lg">{T.panel}</SheetTitle>
          <SheetDescription>{T.panelHint}</SheetDescription>
        </SheetHeader>
        <LookPanel />
      </SheetContent>
    </Sheet>
  )
}
