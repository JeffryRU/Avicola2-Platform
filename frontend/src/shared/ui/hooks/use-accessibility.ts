import { createContext, useContext } from 'react'
import { DEFAULT_A11Y, type A11yPreference } from '@/shared/domain/accessibility'

interface AccessibilityState {
  preference: A11yPreference
  setPreference: (p: A11yPreference) => void
}

/** Opciones de accesibilidad activas; las provee AccessibilityProvider (shared/ui/components/accessibility.tsx). */
export const AccessibilityContext = createContext<AccessibilityState>({
  preference: DEFAULT_A11Y,
  setPreference: () => {},
})

export const useAccessibility = () => useContext(AccessibilityContext)
