import { createContext, useContext } from 'react'
import type { Container } from '@/app/container'

/** Contenedor de la app; App lo provee con `<ContainerContext value={container}>`. */
export const ContainerContext = createContext<Container | null>(null)

/** Acceso de la interfaz a los casos de uso y puertos. */
export function useContainer(): Container {
  const c = useContext(ContainerContext)
  if (!c) throw new Error('Falta el contenedor: App debe envolver la interfaz con ContainerContext.')
  return c
}
