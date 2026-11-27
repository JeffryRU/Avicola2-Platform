import { Moon, Sun } from 'lucide-react'
import { useAppearance } from '@/shared/ui/hooks/use-appearance'
import { cn } from '@/shared/ui/lib/utils'

/** Botón sol/luna: alterna claro y oscuro (queda guardado como elección del usuario). */
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, resolved, setPreference } = useAppearance()
  const dark = resolved.theme === 'dark'
  const label = dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'
  return (
    <button
      type="button"
      onClick={() => setPreference({ ...preference, theme: dark ? 'light' : 'dark' })}
      aria-label={label}
      title={label}
      className={cn(
        'relative grid size-control flex-none place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground',
        className,
      )}
    >
      <Sun
        aria-hidden
        className={cn(
          'absolute size-[1.15rem] transition-all duration-300 motion-reduce:transition-none',
          dark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0',
        )}
      />
      <Moon
        aria-hidden
        className={cn(
          'absolute size-[1.15rem] transition-all duration-300 motion-reduce:transition-none',
          dark ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100',
        )}
      />
    </button>
  )
}
