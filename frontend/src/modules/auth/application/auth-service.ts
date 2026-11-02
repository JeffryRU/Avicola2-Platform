import type { AuthGateway, SessionRepository } from '@/modules/auth/application/ports'
import { credentialsSchema, type Credentials, type Session } from '@/modules/auth/domain/session'

type Listener = (session: Session | null) => void

/** Casos de uso de sesión: iniciar, cerrar y observar la sesión actual. */
export class AuthService {
  private session: Session | null
  private readonly listeners = new Set<Listener>()
  private readonly gateway: AuthGateway
  private readonly sessions: SessionRepository

  constructor(gateway: AuthGateway, sessions: SessionRepository) {
    this.gateway = gateway
    this.sessions = sessions
    this.session = sessions.load()
  }

  current = () => this.session
  token = () => this.session?.token ?? null

  async login(input: Credentials): Promise<Session> {
    const { username, password, remember } = credentialsSchema.parse(input)
    const session = await this.gateway.login(username, password)
    this.sessions.save(session, remember)
    this.set(session)
    return session
  }

  logout = () => {
    this.sessions.clear()
    this.set(null)
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  private set(session: Session | null) {
    this.session = session
    this.listeners.forEach((l) => l(session))
  }
}
