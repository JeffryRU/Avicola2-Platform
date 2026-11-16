import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  DARK_QUERY,
  MORE_CONTRAST_QUERY,
  resolveAppearance,
  themeColor,
  type AppearancePreference,
  type SystemAppearance,
} from '@/shared/domain/appearance'
import { AppearanceContext } from '@/shared/ui/hooks/use-appearance'
import { useBrand } from '@/shared/ui/hooks/use-brand'

const matches = (query: string) => {
  try {
    return window.matchMedia(query).matches
  } catch {
    return false
  }
}

const readSystem = (): SystemAppearance => ({
  prefersDark: matches(DARK_QUERY),
  prefersMoreContrast: matches(MORE_CONTRAST_QUERY),
})

/** Lo que pide el sistema operativo, al día: cambia si el usuario cambia el tema del equipo. */
function useSystemAppearance(): SystemAppearance {
  const [system, setSystem] = useState(readSystem)
  useEffect(() => {
    const lists = [DARK_QUERY, MORE_CONTRAST_QUERY].map((q) => window.matchMedia(q))
    const update = () => setSystem(readSystem())
    lists.forEach((l) => l.addEventListener('change', update))
    return () => lists.forEach((l) => l.removeEventListener('change', update))
  }, [])
  return system
}

/**
 * Tema y alto contraste: los aplica en <html> (data-theme, data-contrast) y guarda la elección
 * con `persist`. El primer pintado ya lo resolvió public/appearance-boot.js con la misma regla.
 */
export function AppearanceProvider({
  initial,
  persist,
  children,
}: {
  initial: AppearancePreference
  persist: (p: AppearancePreference) => void
  children: ReactNode
}) {
  const [preference, setPreference] = useState(initial)
  const system = useSystemAppearance()
  const { brand } = useBrand()
  const resolved = useMemo(() => resolveAppearance(preference, system), [preference, system])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = resolved.theme
    root.dataset.contrast = resolved.contrast
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor(resolved, brand))
  }, [resolved, brand])

  useEffect(() => persist(preference), [preference, persist])

  const value = useMemo(() => ({ preference, resolved, system, setPreference }), [preference, resolved, system])
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
}
