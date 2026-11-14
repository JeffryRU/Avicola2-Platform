import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import { queryKeys } from '@/shared/application/query-keys'
import type { Credentials, Session } from '@/features/auth/domain/session'

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
