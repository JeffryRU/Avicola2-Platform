import type { Role } from '@/shared/domain/session'
import { cn } from '@/shared/ui/lib/utils'
import { ROLE_HINT, ROLE_LABEL } from '@/shared/types/roles'

/** Elegir un rol entre los que el backend permite (con qué hace cada uno). */
export function RolePicker({
  name,
  roles,
  value,
  onChange,
  current,
}: {
  name: string
  roles: Role[]
  value: Role
  onChange: (role: Role) => void
  /** Rol actual de la cuenta (se marca como tal). */
  current?: string
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1.5 text-sm font-semibold">Rol</legend>
      {roles.map((role) => (
        <label
          key={role}
          className={cn(
            'flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors',
            value === role && 'border-primary bg-secondary',
          )}
        >
          <input
            type="radio"
            name={name}
            value={role}
            checked={value === role}
            onChange={() => onChange(role)}
            className="mt-0.5 size-[18px] accent-primary"
          />
          <span className="grid gap-0.5">
            <b className="text-sm">
              {ROLE_LABEL[role]}
              {role === current && <small className="font-semibold text-muted-foreground"> · actual</small>}
            </b>
            <small className="text-muted-foreground">{ROLE_HINT[role]}</small>
          </span>
        </label>
      ))}
    </fieldset>
  )
}
