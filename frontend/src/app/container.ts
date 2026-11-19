import { ErrorReporter } from '@/shared/application/error-reporter'
import type { AppInstaller, KeyValueStore, TableExporter } from '@/shared/application/ports'
import { BrowserAppInstaller } from '@/shared/infrastructure/browser-app-installer'
import { BrowserStore } from '@/shared/infrastructure/browser-store'
import { clearCachedApiData } from '@/shared/infrastructure/cached-data'
import { AxiosHttpClient } from '@/shared/infrastructure/axios-http-client'
import { apiUrl, endpoints } from '@/shared/infrastructure/api/endpoints'
import { installGlobalErrorCapture } from '@/shared/infrastructure/global-error-capture'
import { HttpLogSink } from '@/shared/infrastructure/http-log-sink'
import type { AccountsGateway } from '@/features/accounts'
import { HttpAccountsGateway } from '@/features/accounts/infrastructure/http-accounts-gateway'
import { AuthService } from '@/features/auth/application/auth-service'
import type { EventStream, NotificationsGateway } from '@/features/notifications'
import { HttpNotificationsGateway } from '@/features/notifications/infrastructure/http-notifications-gateway'
import { SseEventStream } from '@/features/notifications/infrastructure/sse-event-stream'
import { HttpAuthGateway } from '@/features/auth/infrastructure/http-auth-gateway'
import { StoredSessionRepository } from '@/features/auth/infrastructure/stored-session-repository'
import type { DraftRepository, ProjectionsGateway, SubmissionQueue } from '@/features/projections'
import { PlanningService } from '@/features/projections/application/planning-service'
import { HttpProjectionsGateway } from '@/features/projections/infrastructure/http-projections-gateway'
import type { CatalogGateway } from '@/features/catalog'
import { HttpCatalogGateway } from '@/features/catalog/infrastructure/http-catalog-gateway'
import type { StatusGateway } from '@/features/connection'
import { HttpStatusGateway } from '@/features/connection/infrastructure/http-status-gateway'
import type { SellersGateway } from '@/features/sellers'
import { HttpSellersGateway } from '@/features/sellers/infrastructure/http-sellers-gateway'
import type { EditingGateway } from '@/features/editing'
import type { HistoryGateway } from '@/features/history'
import { HttpHistoryGateway } from '@/features/history/infrastructure/http-history-gateway'
import { HttpEditingGateway } from '@/features/editing/infrastructure/http-editing-gateway'
import type { StockGateway } from '@/features/stock'
import { HttpStockGateway } from '@/features/stock/infrastructure/http-stock-gateway'
import type { VersionsGateway } from '@/features/versions'
import { GithubVersionsGateway } from '@/features/versions/infrastructure/github-versions'
import type { ProductionGateway } from '@/features/production'
import { HttpProductionGateway } from '@/features/production/infrastructure/http-production-gateway'
import type { SacaGateway } from '@/features/saca'
import type { ModelGateway } from '@/features/model'
import type { ArisGateway } from '@/features/aris'
import { HttpArisGateway } from '@/features/aris/infrastructure/http-aris-gateway'
import { HttpModelGateway } from '@/features/model/infrastructure/http-model-gateway'
import { HttpSacaGateway } from '@/features/saca/infrastructure/http-saca-gateway'
import { BrowserTableExporter } from '@/shared/infrastructure/table-exporter'
import { StoredDraftRepository, StoredSubmissionQueue } from '@/features/projections/infrastructure/stored-repositories'
import { assistantUrl } from '@/shared/domain/assistant'

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
  /** Versiones publicadas (MVP 1, MVP 2…) y sus novedades. */
  versions: VersionsGateway
  saca: SacaGateway
  model: ModelGateway
  aris: ArisGateway
  production: ProductionGateway
  installer: AppInstaller
  /** Chat del asistente (n8n); null si no está configurado. */
  assistantUrl: string | null
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
    onForbidden: () => void auth?.verify(),
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
    events: new SseEventStream(apiUrl(baseUrl, endpoints.events.stream)),
    exporter: new BrowserTableExporter(),
    preferences: local,
    errors,
    accounts: new HttpAccountsGateway(http),
    editing: new HttpEditingGateway(http),
    history: new HttpHistoryGateway(http),
    stock: new HttpStockGateway(http),
    versions: new GithubVersionsGateway(),
    saca: new HttpSacaGateway(http),
    model: new HttpModelGateway(http),
    aris: new HttpArisGateway(http),
    production: new HttpProductionGateway(http),
    installer: new BrowserAppInstaller(window, import.meta.env.VITE_ANDROID_APK_URL),
    assistantUrl: assistantUrl(import.meta.env.VITE_ASSISTANT_URL),
  }
}
