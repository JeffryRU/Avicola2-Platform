import { createContext, useContext } from 'react'
import {
  DEFAULT_APPEARANCE,
  type AppearancePreference,
  type ResolvedAppearance,
  type SystemAppearance,
} from '@/shared/domain/appearance'

interface AppearanceState {
  /** Lo que eligió el usuario (o «sistema»). */
  preference: AppearancePreference
  /** Lo que se ve ahora (tema y contraste efectivos). */
  resolved: ResolvedAppearance
  /** Lo que pide el sistema operativo. */
  system: SystemAppearance
  setPreference: (p: AppearancePreference) => void
}

/** Apariencia activa; la provee AppearanceProvider (shared/ui/components/appearance.tsx). */
export const AppearanceContext = createContext<AppearanceState>({
  preference: DEFAULT_APPEARANCE,
  resolved: { theme: 'light', contrast: 'normal' },
  system: { prefersDark: false, prefersMoreContrast: false },
  setPreference: () => {},
})

export const useAppearance = () => useContext(AppearanceContext)
