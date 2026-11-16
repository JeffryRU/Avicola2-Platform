/** Punto de entrada público de la feature: otras features y app/ importan solo desde aquí (ADR 0008). */
export type { AuthGateway, LogoutCleanup, SessionRepository } from '@/features/auth/application/ports'
export { useLogout, useRequiredSession, useSession, useUpdateProfile, useVerifySession } from '@/features/auth/ui/hooks'
