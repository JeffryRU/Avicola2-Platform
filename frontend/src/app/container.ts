import { ErrorReporter } from '@/shared/application/error-reporter'
import type { AppInstaller, KeyValueStore } from '@/shared/application/ports'
import { BrowserAppInstaller } from '@/shared/infrastructure/browser-app-installer'
import { BrowserStore } from '@/shared/infrastructure/browser-store'
import { clearCachedApiData } from '@/shared/infrastructure/cached-data'
import { AxiosHttpClient } from '@/shared/infrastructure/axios-http-client'
import { installGlobalErrorCapture } from '@/shared/infrastructure/global-error-capture'
import { HttpLogSink } from '@/shared/infrastructure/http-log-sink'
import type { AccountsGateway } from '@/features/accounts/application/ports'
import { HttpAccountsGateway } from '@/features/accounts/infrastructure/http-accounts-gateway'
import { AuthService } from '@/features/auth/application/auth-service'
import type { EventStream, NotificationsGateway } from '@/features/notifications/application/ports'
import { HttpNotificationsGateway } from '@/features/notifications/infrastructure/http-notifications-gateway'
import { SseEventStream } from '@/features/notifications/infrastructure/sse-event-stream'
import { HttpAuthGateway } from '@/features/auth/infrastructure/http-auth-gateway'
import { StoredSessionRepository } from '@/features/auth/infrastructure/stored-session-repository'
import type { DraftRepository, ProjectionsGateway, SubmissionQueue } from '@/features/projections/application/ports'
import type { TableExporter } from '@/shared/application/ports'
import { PlanningService } from '@/features/projections/application/planning-service'
import { HttpProjectionsGateway } from '@/features/projections/infrastructure/http-projections-gateway'
import type { CatalogGateway } from '@/features/catalog/application/ports'
import { HttpCatalogGateway } from '@/features/catalog/infrastructure/http-catalog-gateway'
import type { StatusGateway } from '@/features/connection/application/ports'
import { HttpStatusGateway } from '@/features/connection/infrastructure/http-status-gateway'
import type { SellersGateway } from '@/features/dashboards/application/ports'
import { HttpSellersGateway } from '@/features/dashboards/infrastructure/http-sellers-gateway'
import type { EditingGateway } from '@/features/editing/application/ports'
import type { HistoryGateway } from '@/features/history/application/ports'
import { HttpHistoryGateway } from '@/features/history/infrastructure/http-history-gateway'
import { HttpEditingGateway } from '@/features/editing/infrastructure/http-editing-gateway'
import type { StockGateway } from '@/features/stock/application/ports'
import { HttpStockGateway } from '@/features/stock/infrastructure/http-stock-gateway'
import { BrowserTableExporter } from '@/shared/infrastructure/table-exporter'
import { StoredDraftRepository, StoredSubmissionQueue } from '@/features/projections/infrastructure/stored-repositories'

/** Lo que la interfaz puede usar: solo casos de uso y puertos, nunca adaptadores concretos. */
export interface Container {
  auth: AuthService
  planning: PlanningService
  catalog: CatalogGateway
  projections: ProjectionsGateway
  sellers: SellersGateway
  status: StatusGateway
  queue: SubmissionQueue
  drafts: DraftRepository
  notifications: NotificationsGateway
  events: EventStream
  exporter: TableExporter
  preferences: KeyValueStore
  errors: ErrorReporter
  accounts: AccountsGateway
  editing: EditingGateway
  history: HistoryGateway
  stock: StockGateway
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
  const http = new AxiosHttpClient({
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
  const projections = new HttpProjectionsGateway(http)
  const queue = new StoredSubmissionQueue(local)
  return {
    auth,
    catalog: new HttpCatalogGateway(http),
    projections,
    sellers: new HttpSellersGateway(http),
    status: new HttpStatusGateway(http),
    queue,
    planning: new PlanningService(projections, queue, () => crypto.randomUUID()),
    drafts,
    notifications: new HttpNotificationsGateway(http),
    events: new SseEventStream(`${baseUrl}/events`),
    exporter: new BrowserTableExporter(),
    preferences: local,
    errors,
    accounts: new HttpAccountsGateway(http),
    editing: new HttpEditingGateway(http),
    history: new HttpHistoryGateway(http),
    stock: new HttpStockGateway(http),
    installer: new BrowserAppInstaller(window, import.meta.env.VITE_ANDROID_APK_URL),
  }
}
