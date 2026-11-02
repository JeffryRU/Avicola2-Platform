import { useSyncExternalStore } from 'react'
import { useContainer } from '@/app/di'
import type { Session } from '@/modules/auth/domain/session'

export function useSession(): Session | null {
  const { auth } = useContainer()
  return useSyncExternalStore(auth.subscribe, auth.current)
}

/** Sesión obligatoria (las pantallas internas solo se montan con sesión). */
export function useRequiredSession(): Session {
  const session = useSession()
  if (!session) throw new Error('Sin sesión.')
  return session
}
