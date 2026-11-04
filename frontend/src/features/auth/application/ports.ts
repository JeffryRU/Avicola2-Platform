import type { Session } from '@/features/auth/domain/session'

/** API de sesión. La cookie HttpOnly la pone y la quita el servidor. */
export interface AuthGateway {
  login(username: string, password: string, remember: boolean): Promise<Session>
  logout(): Promise<void>
  /** Sesión vigente según el servidor (lee la cookie); 401 si no hay. */
  me(): Promise<Session>
  changePassword(current: string, next: string, remember: boolean): Promise<Session>
  /** Guarda el nombre visible de la propia cuenta. */
  updateProfile(name: string): Promise<Session>
}

/** Perfil guardado en el dispositivo para abrir la app sin esperar a la red (sin secretos). */
export interface SessionRepository {
  load(): { session: Session; remember: boolean } | null
  save(session: Session, remember: boolean): void
  clear(): void
}

/** Limpieza local al cerrar sesión (p. ej., respuestas guardadas por el service worker). */
export type LogoutCleanup = () => Promise<void> | void
