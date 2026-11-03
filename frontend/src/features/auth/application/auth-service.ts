import { ApiError } from '@/shared/application/ports'
import type { AuthGateway, LogoutCleanup, SessionRepository } from '@/features/auth/application/ports'
import { credentialsSchema, type Credentials, type Session } from '@/features/auth/domain/session'

type Listener = (session: Session | null) => void

/** Casos de uso de sesión: iniciar, verificar, cambiar contraseña y cerrar. */
export class AuthService {
  private session: Session | null
  private remember: boolean
  private readonly listeners = new Set<Listener>()
  private readonly gateway: AuthGateway
  private readonly sessions: SessionRepository
  private readonly cleanup: LogoutCleanup

  constructor(gateway: AuthGateway, sessions: SessionRepository, cleanup: LogoutCleanup = () => {}) {
    this.gateway = gateway
    this.sessions = sessions
    this.cleanup = cleanup
    const stored = sessions.load()
    this.session = stored?.session ?? null
    this.remember = stored?.remember ?? false
  }

  current = () => this.session

  async login(input: Credentials): Promise<Session> {
    const { username, password, remember } = credentialsSchema.parse(input)
    const session = await this.gateway.login(username, password, remember)
    this.store(session, remember)
    return session
  }

  /** Al abrir la app: confirma con el servidor que la cookie sigue vigente. Sin red, se
   *  conserva el perfil guardado (la PWA funciona offline y la cola se envía después). */
  async verify() {
    if (!this.session) return
    try {
      this.store(await this.gateway.me(), this.remember)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) this.clearLocal()
    }
  }

  async changePassword(current: string, next: string): Promise<Session> {
    const session = await this.gateway.changePassword(current, next, this.remember)
    this.store(session, this.remember)
    return session
  }

  logout = async () => {
    this.clearLocal()
    await Promise.allSettled([this.gateway.logout(), this.cleanup()])
  }

  /** El servidor rechazó la sesión (vencida, contraseña cambiada en otro equipo, cuenta desactivada). */
  expire = () => {
    if (this.session) this.clearLocal()
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  private store(session: Session, remember: boolean) {
    this.remember = remember
    this.sessions.save(session, remember)
    this.set(session)
  }

  private clearLocal() {
    this.sessions.clear()
    this.set(null)
  }

  private set(session: Session | null) {
    this.session = session
    this.listeners.forEach((l) => l(session))
  }
}
