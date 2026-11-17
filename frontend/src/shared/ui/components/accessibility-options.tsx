import { useId } from 'react'
import { TEXT_SIZES, type TextSize } from '@/shared/domain/accessibility'
import { A11Y_OPTIONS, A11Y_READER_UNAVAILABLE, A11Y_TEXT_SIZE_LABEL, A11Y_TEXT_SIZES } from '@/shared/types/appearance'
import { canSpeak } from '@/shared/ui/lib/reader'
import { Segmented } from '@/shared/ui/components/segmented'
import { Switch } from '@/shared/ui/components/shadcn/switch'
import { useAccessibility } from '@/shared/ui/hooks/use-accessibility'

const SIZE_OPTIONS: { value: TextSize; label: string }[] = TEXT_SIZES.map((v) => ({
  value: v,
  label: A11Y_TEXT_SIZES.find((s) => s.value === v)?.name ?? v,
}))

function Row({ k }: { k: keyof typeof A11Y_OPTIONS }) {
  const { preference, setPreference } = useAccessibility()
  const id = useId()
  const disabled = k === 'readAloud' && !canSpeak
  return (
    <div className="flex items-start gap-4 border-b border-rule px-4 py-3.5 dsk:px-5 dsk:odd:border-r">
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <b className="block font-medium">{A11Y_OPTIONS[k].title}</b>
        <small className="block text-sm text-muted-foreground">
          {disabled ? A11Y_READER_UNAVAILABLE : A11Y_OPTIONS[k].hint}
        </small>
      </label>
      <Switch
        id={id}
        checked={preference[k]}
        disabled={disabled}
        onCheckedChange={(on) => setPreference({ ...preference, [k]: on })}
        className="mt-1"
      />
    </div>
  )
}

/** Perfil → Accesibilidad: las mismas opciones que el botón de accesibilidad de arriba. */
export function AccessibilityOptions() {
  const { preference, setPreference } = useAccessibility()
  return (
    <>
      <div className="grid gap-2 border-b border-rule px-4 py-3.5 dsk:px-5">
        <span className="font-medium">{A11Y_TEXT_SIZE_LABEL}</span>
        <Segmented
          value={preference.textSize}
          options={SIZE_OPTIONS}
          onChange={(textSize) => setPreference({ ...preference, textSize })}
          className="w-full dsk:max-w-md"
          full
        />
      </div>
      {/* En escritorio, los interruptores en dos columnas. */}
      <div className="-mb-px grid dsk:grid-cols-2">
        {(Object.keys(A11Y_OPTIONS) as (keyof typeof A11Y_OPTIONS)[]).map((k) => (
          <Row key={k} k={k} />
        ))}
      </div>
    </>
  )
}
