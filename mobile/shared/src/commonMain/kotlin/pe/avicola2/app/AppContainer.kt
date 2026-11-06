package pe.avicola2.app

import com.russhwolf.settings.Settings
import io.ktor.client.engine.HttpClientEngine
import kotlin.time.Clock
import kotlin.uuid.Uuid
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import pe.avicola2.app.application.ApiError
import pe.avicola2.app.application.FileSharer
import pe.avicola2.app.application.KeyValueStore
import pe.avicola2.app.application.PlanningService
import pe.avicola2.app.application.ServerEvent
import pe.avicola2.app.application.SessionService
import pe.avicola2.app.application.SubmissionQueue
import pe.avicola2.app.application.TokenStore
import pe.avicola2.app.application.UpdateService
import pe.avicola2.app.infrastructure.ApiClient
import pe.avicola2.app.infrastructure.GithubReleaseSource
import pe.avicola2.app.infrastructure.HttpAuthGateway
import pe.avicola2.app.infrastructure.HttpNotificationsGateway
import pe.avicola2.app.infrastructure.HttpPlanningGateway
import pe.avicola2.app.infrastructure.SettingsStore
import pe.avicola2.app.infrastructure.SseEventStream

/** Servidor al que se conecta la app: producción, pruebas o uno escrito a mano. */
class ServerConfig(private val prefs: KeyValueStore) {
    enum class Preset(val label: String, val url: String) {
        Production("Producción", BuildConfig.API_URL),
        Staging("Pruebas", BuildConfig.API_URL_DEV),
    }

    private val _url = MutableStateFlow(prefs.getString(KEY) ?: Preset.Production.url)
    val url: StateFlow<String> = _url.asStateFlow()

    fun set(url: String) {
        val clean = url.trim().trimEnd('/')
        prefs.putString(KEY, clean)
        _url.value = clean
    }

    fun label(url: String = this.url.value): String = Preset.entries.firstOrNull { it.url == url }?.label ?: url

    private companion object {
        const val KEY = "server.url"
    }
}

/**
 * Raíz de composición de la app: el único lugar que conoce los adaptadores (igual que
 * `container.ts` en la web). Cada plataforma entrega el almacenamiento seguro del token y las
 * preferencias.
 */
class AppContainer(
    tokens: TokenStore,
    settings: Settings,
    engine: HttpClientEngine? = null,
    /** Menú «Compartir» del sistema para los archivos que genera la app (el Excel). */
    val files: FileSharer = FileSharer { _, _, _ -> throw ApiError("Compartir archivos no está disponible aquí.", 0) },
) {
    val prefs: KeyValueStore = SettingsStore(settings)
    val server = ServerConfig(prefs)

    private var expire: () -> Unit = {}
    val api = ApiClient({ server.url.value }, tokens, onUnauthorized = { expire() }, engine = engine)

    val planningGateway = HttpPlanningGateway(api)
    val notifications = HttpNotificationsGateway(api)
    val events = SseEventStream(api)
    val updates = UpdateService(GithubReleaseSource(api, BuildConfig.GITHUB_REPO), BuildConfig.VERSION_NAME)

    val planning = PlanningService(
        gateway = planningGateway,
        queue = SubmissionQueue(prefs),
        newId = { Uuid.random().toString() },
        now = { Clock.System.now().toString() },
    )

    val session = SessionService(HttpAuthGateway(api), tokens, prefs).also { s -> expire = { s.expire() } }

    /** Avisos del servidor (SSE) o de la propia app para que cada pantalla recargue lo suyo. */
    private val _changes = MutableSharedFlow<ServerEvent>(extraBufferCapacity = 16)
    val changes: SharedFlow<ServerEvent> = _changes.asSharedFlow()

    fun notifyChanged(event: ServerEvent) {
        _changes.tryEmit(event)
    }
}
