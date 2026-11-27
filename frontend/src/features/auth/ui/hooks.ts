import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import { queryKeys } from '@/shared/application/query-keys'
import type { Session } from '@/shared/domain/session'
import type { Credentials } from '@/features/auth/domain/credentials'
import { preferencesKey, type UiPreferences } from '@/shared/domain/preferences'
import { useAccessibility } from '@/shared/ui/hooks/use-accessibility'
import { useAppearance } from '@/shared/ui/hooks/use-appearance'
import { useLook } from '@/shared/ui/hooks/use-look'

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

/**
 * Al abrir la app, confirma la cookie con el servidor (GET /auth/me) una sola vez por usuario.
 * La sesión vive en AuthService (useSession); esta consulta solo dispara y recuerda la
 * verificación. Un login, un cambio de perfil o de contraseña dejan la respuesta en la caché.
 */
export function useVerifySession(username: string | undefined) {
  const { auth } = useContainer()
  return useQuery({
    queryKey: queryKeys.auth.session(username ?? ''),
    queryFn: async () => {
      await auth.verify()
      return auth.current()
    },
    enabled: !!username,
    staleTime: Infinity,
    retry: false,
  })
}

/** Guarda la sesión recibida como ya verificada: no hace falta volver a pedir /auth/me. */
function useRememberSession() {
  const client = useQueryClient()
  return (session: Session) => client.setQueryData(queryKeys.auth.session(session.seller.username), session)
}

export function useLogin() {
  const { auth } = useContainer()
  const remember = useRememberSession()
  return useMutation({ mutationFn: (input: Credentials) => auth.login(input), onSuccess: remember })
}

export function useUpdateProfile() {
  const { auth } = useContainer()
  const remember = useRememberSession()
  return useMutation({ mutationFn: (name: string) => auth.updateProfile(name), onSuccess: remember })
}

export function useChangePassword() {
  const { auth } = useContainer()
  const remember = useRememberSession()
  return useMutation({
    mutationFn: ({ current, next }: { current: string; next: string }) => auth.changePassword(current, next),
    onSuccess: remember,
  })
}

/** Cierra la sesión (POST /auth/logout); al quedar sin usuario, App vacía la caché. */
export function useLogout() {
  const { auth } = useContainer()
  return useMutation({ mutationFn: () => auth.logout() })
}

/** Espera tras el último cambio antes de guardarlo en la cuenta (agrupa los clics seguidos). */
const SAVE_DELAY_MS = 600

/**
 * Las preferencias de la interfaz siguen a la cuenta. Al entrar, mandan las de la cuenta; si aún
 * no tiene, se le guardan las de este dispositivo. Después, cada cambio se guarda en la cuenta.
 * El dispositivo conserva la última elección: el login y el primer pintado no esperan a la red,
 * y sin conexión todo sigue funcionando con lo local.
 */
export function usePreferencesSync() {
  const { auth } = useContainer()
  const user = useSession()?.seller.username
  const { preference: appearance, setPreference: setAppearance } = useAppearance()
  const { preference: a11y, setPreference: setA11y } = useAccessibility()
  const { preference: look, setPreference: setLook } = useLook()
  const current = useMemo<UiPreferences>(() => ({ appearance, a11y, look }), [appearance, a11y, look])
  const latest = useRef(current)
  // Lo último que se sabe guardado en la cuenta (null: aún no se leyó la de esta sesión).
  const synced = useRef<{ user: string; key: string } | null>(null)

  useEffect(() => {
    latest.current = current
  }, [current])

  useEffect(() => {
    synced.current = null
    if (!user) return
    let cancelled = false
    auth
      .getPreferences()
      .then((remote) => {
        if (cancelled) return
        if (remote) {
          synced.current = { user, key: preferencesKey(remote) }
          setAppearance(remote.appearance)
          setA11y(remote.a11y)
          // Si la cuenta aún no tiene estilo, se queda el del equipo y el próximo guardado lo sube.
          if (remote.look) setLook(remote.look)
          return
        }
        synced.current = { user, key: preferencesKey(latest.current) }
        void auth.savePreferences(latest.current).catch(() => {})
      })
      .catch(() => {
        // Sin red: se queda lo del dispositivo y los cambios siguientes intentan guardarse.
        if (!cancelled) synced.current = { user, key: preferencesKey(latest.current) }
      })
    return () => {
      cancelled = true
    }
  }, [user, auth, setAppearance, setA11y, setLook])

  useEffect(() => {
    const known = synced.current
    if (!user || known?.user !== user) return
    const key = preferencesKey(current)
    if (key === known.key) return
    const timer = setTimeout(() => {
      synced.current = { user, key }
      auth.savePreferences(current).catch(() => {
        // No se guardó: el próximo cambio lo vuelve a intentar.
        if (synced.current?.key === key) synced.current = known
      })
    }, SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [current, user, auth])
}
