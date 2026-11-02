import type { Session } from '@/modules/auth/domain/session'

export interface AuthGateway {
  login(username: string, password: string): Promise<Session>
}

export interface SessionRepository {
  load(): Session | null
  save(session: Session, remember: boolean): void
  clear(): void
}
