import { Check, Pencil } from 'lucide-react'
import { Button } from '@/shared/ui/components/shadcn/button'

/**
 * Lápiz para pasar a edición: la supervisión ve los datos y solo registra o corrige tras tocarlo
 * (si se lo piden). Al editar, cambia a «Listo» para volver a solo ver.
 */
export function EditToggle({ editing, onChange }: { editing: boolean; onChange: (editing: boolean) => void }) {
  return (
    <Button variant={editing ? 'default' : 'outline'} aria-pressed={editing} onClick={() => onChange(!editing)}>
      {editing ? <Check /> : <Pencil />} {editing ? 'Listo' : 'Editar'}
    </Button>
  )
}
