import { ErrorReporter } from '@/core/application/error-reporter'
import type { KeyValueStore } from '@/core/application/ports'
import { BrowserStore } from '@/core/infrastructure/browser-store'
import { FetchHttpClient } from '@/core/infrastructure/fetch-http-client'
import { installGlobalErrorCapture } from '@/core/infrastructure/global-error-capture'
import { HttpLogSink } from '@/core/infrastructure/http-log-sink'
import { AuthService } from '@/modules/auth/application/auth-service'
import { HttpAuthGateway } from '@/modules/auth/infrastructure/http-auth-gateway'
import { StoredSessionRepository } from '@/modules/auth/infrastructure/stored-session-repository'
import type {
  DraftRepository,
  FileSaver,
  PlanningGateway,
  ReadNotificationsRepository,
  SubmissionQueue,
} from '@/modules/planning/application/ports'
import { PlanningService } from '@/modules/planning/application/planning-service'
import { BrowserFileSaver } from '@/modules/planning/infrastructure/file-download'
import { HttpPlanningGateway } from '@/modules/planning/infrastructure/http-planning-gateway'
import {
  StoredDraftRepository,
  StoredReadNotifications,
  StoredSubmissionQueue,
} from '@/modules/planning/infrastructure/stored-repositories'

/** Lo que la interfaz puede usar: solo casos de uso y puertos, nunca adaptadores concretos. */
export interface Container {
  auth: AuthService
  planning: PlanningService
  gateway: PlanningGateway
  queue: SubmissionQueue
  drafts: DraftRepository
  readNotifications: ReadNotificationsRepository
  files: FileSaver
  preferences: KeyValueStore
  errors: ErrorReporter
}

/** Raíz de composición del frontend: el único lugar que conoce los adaptadores. */
export function createContainer(): Container {
  const local = new BrowserStore(() => localStorage)
  const tab = new BrowserStore(() => sessionStorage)
  // El cliente HTTP necesita el token de la sesión y la sesión necesita el cliente: se enlazan aquí.
  let auth: AuthService | null = null
  const baseUrl = import.meta.env.VITE_API_BASE ?? '/api'
  const errors = new ErrorReporter(new HttpLogSink(baseUrl), {
    context: () => ({ route: location.pathname, user: auth?.current()?.seller.username }),
    version: __APP_VERSION__,
  })
  installGlobalErrorCapture(errors)
  const http = new FetchHttpClient({
    baseUrl,
    timeoutMs: 15_000,
    getToken: () => auth?.token() ?? null,
    onUnauthorized: () => auth?.logout(),
  })
  auth = new AuthService(new HttpAuthGateway(http), new StoredSessionRepository(local, tab))
  const gateway = new HttpPlanningGateway(http)
  const queue = new StoredSubmissionQueue(local)
  return {
    auth,
    gateway,
    queue,
    planning: new PlanningService(gateway, queue, () => crypto.randomUUID()),
    drafts: new StoredDraftRepository(local),
    readNotifications: new StoredReadNotifications(local),
    files: new BrowserFileSaver(),
    preferences: local,
    errors,
  }
}
