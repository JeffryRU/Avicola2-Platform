import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useContainer } from '@/app/di'
import { queryKeys } from '@/shared/application/query-keys'
import type { NewAccount } from '@/features/accounts/domain/accounts'
import type { Role } from '@/shared/domain/session'

/** Cuentas que la sesión puede ver en Usuarios. */
export function useAccounts() {
  const { accounts } = useContainer()
  return useQuery({ queryKey: queryKeys.accounts.all, queryFn: () => accounts.list() })
}

/** Vuelve a pedir la lista de cuentas (tras crear, restablecer, activar o cambiar el rol). */
export function useRefreshAccounts() {
  const client = useQueryClient()
  return () => void client.invalidateQueries({ queryKey: queryKeys.accounts.all })
}

export function useCreateAccount() {
  const { accounts } = useContainer()
  return useMutation({ mutationFn: (account: NewAccount) => accounts.create(account) })
}

export function useChangeRole() {
  const { accounts } = useContainer()
  return useMutation({
    mutationFn: (next: { username: string; role: Role }) => accounts.changeRole(next.username, next.role),
  })
}

export function useResetPassword(username: string) {
  const { accounts } = useContainer()
  return useMutation({ mutationFn: () => accounts.resetPassword(username) })
}

export function useSetActive(username: string, active: boolean) {
  const { accounts } = useContainer()
  return useMutation({ mutationFn: () => accounts.setActive(username, active) })
}
