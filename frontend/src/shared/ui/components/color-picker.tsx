import { useState, type ReactNode } from 'react'
import { HexColorInput, HexColorPicker } from 'react-colorful'
import { isHex, readableOn } from '@/shared/domain/look'
import { COLOR_PICKER_TEXT as T } from '@/shared/types/appearance'
import { Button } from '@/shared/ui/components/shadcn/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/components/shadcn/dialog'
import { cn } from '@/shared/ui/lib/utils'

/** Colores de partida: tonos con cuerpo que combinan con la app. */
const SUGGESTED = [
  '#0b2c61',
  '#1557c0',
  '#0f766e',
  '#1f6b3a',
  '#6b8e23',
  '#a16207',
  '#c2410c',
  '#b42318',
  '#be185d',
  '#6b2a70',
  '#4338ca',
  '#334155',
]

/**
 * Selector de color propio de la app (no el del sistema): ventana centrada con un cuadro de
 * saturación, una barra de tono, el código del color y sugerencias. Solo se aplica al pulsar
 * «Usar color». `children` es el botón que lo abre.
 */
export function ColorPicker({
  value,
  onChange,
  title,
  children,
}: {
  value: string
  onChange: (hex: string) => void
  title: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const color = isHex(draft) ? draft : value
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setDraft(value)
        setOpen(o)
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="gap-4 sm:max-w-sm">
        <div className="grid gap-1 pr-10">
          <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">{T.hint}</DialogDescription>
        </div>
        <HexColorPicker color={color} onChange={setDraft} className="color-picker" />
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-control w-16 flex-none place-items-center rounded-md text-xs font-semibold ring-1 ring-black/10"
            style={{ background: color, color: readableOn(color) }}
          >
            Aa
          </span>
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border-control border-input bg-surface px-3 focus-within:border-ring focus-within:outline-2 focus-within:outline-ring">
            <span className="text-muted-foreground">#</span>
            <HexColorInput
              color={color}
              onChange={setDraft}
              aria-label={T.code}
              className="num h-touch min-w-0 flex-1 bg-transparent text-md uppercase outline-none dsk:h-control dsk:text-base"
            />
          </label>
        </div>
        <div className="grid gap-2">
          <span className="text-xs font-semibold text-muted-foreground">{T.suggested}</span>
          <div className="grid grid-cols-6 gap-2">
            {SUGGESTED.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                title={c}
                onClick={() => setDraft(c)}
                className={cn(
                  'aspect-square rounded-full ring-1 ring-black/10 transition-transform hover:scale-110',
                  c === color.toLowerCase() && 'ring-2 ring-foreground ring-offset-2 ring-offset-surface',
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <DialogFooter className="flex-row justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {T.cancel}
          </Button>
          <Button
            type="button"
            onClick={() => {
              onChange(color.toLowerCase())
              setOpen(false)
            }}
          >
            {T.use}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
