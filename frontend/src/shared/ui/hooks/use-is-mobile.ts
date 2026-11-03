import { useSyncExternalStore } from 'react'

const QUERY = '(max-width: 959px)'

/** true en celular (mismo corte de 960 px que el mockup). */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia(QUERY)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => matchMedia(QUERY).matches,
    () => false,
  )
}
