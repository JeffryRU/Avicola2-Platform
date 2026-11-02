import { createContext, useContext, type ReactNode } from 'react'
import type { Container } from '@/app/container'

const ContainerContext = createContext<Container | null>(null)

export function ContainerProvider({ container, children }: { container: Container; children: ReactNode }) {
  return <ContainerContext.Provider value={container}>{children}</ContainerContext.Provider>
}

/** Acceso de la interfaz a los casos de uso y puertos. */
// eslint-disable-next-line react-refresh/only-export-components
export function useContainer(): Container {
  const c = useContext(ContainerContext)
  if (!c) throw new Error('ContainerProvider no está montado.')
  return c
}
