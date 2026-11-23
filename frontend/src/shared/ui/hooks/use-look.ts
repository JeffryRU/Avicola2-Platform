import { createContext, useContext } from 'react'
import { DEFAULT_LOOK, type LookPreference } from '@/shared/domain/look'

interface LookState {
  preference: LookPreference
  setPreference: (p: LookPreference) => void
}

/** Estilo de la app (tema, figuras de fondo); lo provee LookProvider (shared/ui/components/look.tsx). */
export const LookContext = createContext<LookState>({ preference: DEFAULT_LOOK, setPreference: () => {} })

export const useLook = () => useContext(LookContext)
