import { ErrorReporter } from '@/core/application/error-reporter'
import type { AppInstaller, KeyValueStore } from '@/core/application/ports'
import { BrowserAppInstaller } from '@/core/infrastructure/browser-app-installer'
import { BrowserStore } from '@/core/infrastructure/browser-store'
import { clearCachedApiData } from '@/core/infrastructure/cached-data'
import { FetchHttpClient } from '@/core/infrastructure/fetch-http-client'
import { installGlobalErrorCapture } from '@/core/infrastructure/global-error-capture'
import { HttpLogSink } from '@/core/infrastructure/http-log-sink'
import type { AccountsGateway } from '@/modules/accounts/application/ports'
import { HttpAccountsGateway } from '@/modules/accounts/infrastructure/http-accounts-gateway'
import { AuthService } from '@/modules/auth/application/auth-service'
import type { EventStream, NotificationsGateway } from '@/modules/notifications/application/ports'
import { HttpNotificationsGateway } from '@/modules/notifications/infrastructure/http-notifications-gateway'
import { SseEventStream } from '@/modules/notifications/infrastructure/sse-event-stream'
import { HttpAuthGateway } from '@/modules/auth/infrastructure/http-auth-gateway'
import { StoredSessionRepository } from '@/modules/auth/infrastructure/stored-session-repository'
import type {
  DraftRepository,
  PlanningGateway,
  SubmissionQueue,
  TableExporter,
} from '@/modules/planning/application/ports'
import { PlanningService } from '@/modules/planning/application/planning-service'
import { HttpPlanningGateway } from '@/modules/planning/infrastructure/http-planning-gateway'
import { BrowserTableExporter } from '@/modules/planning/infrastructure/table-exporter'
import { StoredDraftRepository, StoredSubmissionQueue } from '@/modules/planning/infrastructure/stored-repositories'

/** Lo que la interfaz puede usar: solo casos de uso y puertos, nunca adaptadores concretos. */
export interface Container {
  auth: AuthService
  planning: PlanningService
  gateway: PlanningGateway
  queue: SubmissionQueue
  drafts: DraftRepository
  notifications: NotificationsGateway
  events: EventStream
  exporter: TableExporter
  preferences: KeyValueStore
  errors: ErrorReporter
  accounts: AccountsGateway
  installer: AppInstaller
}

/** Raíz de composición del frontend: el único lugar que conoce los adaptadores. */
export function createContainer(): Container {
  const local = new BrowserStore(() => localStorage)
  const tab = new BrowserStore(() => sessionStorage)
  // El cliente HTTP avisa a la sesión cuando el servidor la rechaza, y la sesión usa el cliente.
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
    onUnauthorized: () => auth?.expire(),
  })
  const drafts = new StoredDraftRepository(local)
  // Al cerrar sesión se borran el borrador y las respuestas guardadas; la cola offline se
  // conserva (es de cada vendedor y aún no llegó al servidor).
  const cleanup = () => {
    drafts.clear()
    return clearCachedApiData()
  }
  auth = new AuthService(new HttpAuthGateway(http), new StoredSessionRepository(local, tab), cleanup)
  const gateway = new HttpPlanningGateway(http)
  const queue = new StoredSubmissionQueue(local)
  return {
    auth,
    gateway,
    queue,
    planning: new PlanningService(gateway, queue, () => crypto.randomUUID()),
    drafts,
    notifications: new HttpNotificationsGateway(http),
    events: new SseEventStream(`${baseUrl}/events`),
    exporter: new BrowserTableExporter(),
    preferences: local,
    errors,
    accounts: new HttpAccountsGateway(http),
    installer: new BrowserAppInstaller(),
  }
}
