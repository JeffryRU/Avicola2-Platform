package pe.avicola2.app.application

import kotlinx.coroutines.flow.Flow
import kotlinx.datetime.LocalDate
import pe.avicola2.app.domain.Account
import pe.avicola2.app.domain.DailyUnits
import pe.avicola2.app.domain.EditingWindow
import pe.avicola2.app.domain.ExportFormat
import pe.avicola2.app.domain.Notifications
import pe.avicola2.app.domain.Product
import pe.avicola2.app.domain.ProductionDay
import pe.avicola2.app.domain.ProductionEntry
import pe.avicola2.app.domain.Projection
import pe.avicola2.app.domain.SACA_METHOD_DEFAULT
import pe.avicola2.app.domain.Saca
import pe.avicola2.app.domain.Seller
import pe.avicola2.app.domain.StockDay
import pe.avicola2.app.domain.StockEntry
import pe.avicola2.app.domain.StockOptions
import pe.avicola2.app.domain.SubmissionRequest
import pe.avicola2.app.domain.SubmissionResult
import pe.avicola2.app.domain.Suggestion
import pe.avicola2.app.domain.TokenResponse
import pe.avicola2.app.domain.Unlock

/** Error de la API con el código HTTP (0 = sin conexión, sin respuesta o cancelado). */
class ApiError(message: String, val status: Int) : Exception(message) {
    /** Sin conexión: conviene reintentar más tarde (cola offline). */
    val isNetwork: Boolean get() = status == 0

    /** 4xx: la petición es inválida y reintentarla no sirve. */
    val isRejected: Boolean get() = status in 400..499 && status != 408 && status != 429
}

/** Sesión de la app: login con token (no cookies) y datos de la cuenta. */
interface AuthGateway {
    suspend fun login(username: String, password: String): TokenResponse
    suspend fun me(): Account
    suspend fun changePassword(current: String, new: String): Account
    suspend fun updateProfile(name: String): Account
}

interface PlanningGateway {
    suspend fun catalog(): List<Product>
    suspend fun sellers(): List<Seller>
    suspend fun projections(from: LocalDate, to: LocalDate, seller: String? = null): List<Projection>
    suspend fun submit(request: SubmissionRequest): SubmissionResult
    suspend fun suggestions(category: String, start: LocalDate, days: Int, onBehalf: String? = null): Suggestion
    suspend fun sales(from: LocalDate, to: LocalDate, seller: String? = null): List<DailyUnits>
    suspend fun editingWindow(): EditingWindow
    suspend fun requestUnlock(date: LocalDate, reason: String): Unlock
    /** Supervisor: las solicitudes y habilitaciones de todos (últimos 30 días). */
    suspend fun unlocks(): List<Unlock>
    /** Supervisor: habilita la edición de un vendedor aunque haya pasado el corte. */
    suspend fun grantEditing(username: String, dates: List<LocalDate>): List<Unlock>
    /** Supervisor: cierra las habilitaciones vigentes de un vendedor. */
    suspend fun revokeEditing(username: String): List<Unlock>
    /** Proyecciones del período en Excel, PDF o CSV (el vendedor, lo suyo; el supervisor, todos o uno). */
    suspend fun exportProjections(from: LocalDate, to: LocalDate, seller: String? = null, format: ExportFormat = ExportFormat.Excel): ByteArray
}

/** Stock de despacho (el backend decide quién lo ve y quién lo registra). */
interface StockGateway {
    /** Días con registro en el rango, del más reciente al más antiguo. */
    suspend fun list(from: LocalDate, to: LocalDate): List<StockDay>
    /** Artículos (con calidad B) y ubicaciones para armar el formulario. */
    suspend fun options(): StockOptions

    /** Registra o corrige el stock de un día en una ubicación (reemplaza lo de esa ubicación). */
    suspend fun register(day: LocalDate, location: String, lines: List<StockEntry>): StockDay
}

/** Producción diaria (el backend decide quién la ve y quién la registra). */
interface ProductionGateway {
    suspend fun list(from: LocalDate, to: LocalDate): List<ProductionDay>
    suspend fun register(day: LocalDate, lines: List<ProductionEntry>, weights: Map<String, Double> = emptyMap()): ProductionDay
}

/** Cuánto pedir a granja para un día. */
interface SacaGateway {
    suspend fun plan(day: LocalDate, method: String = SACA_METHOD_DEFAULT): Saca

    /** Solo supervisores: por cuánto se multiplica lo que hace falta de cada tipo. */
    suspend fun setFactors(factors: Map<String, Double>): Map<String, Double>
}

/** Entrega un archivo generado al sistema para guardarlo o mandarlo (menú «Compartir»). */
fun interface FileSharer {
    suspend fun share(fileName: String, mimeType: String, bytes: ByteArray)
}

interface NotificationsGateway {
    suspend fun list(): Notifications
    suspend fun markRead(ids: List<Int>? = null): Int
}

/** Cambios en el servidor (SSE): solo avisan; los datos se vuelven a pedir. */
interface EventStream {
    fun events(): Flow<ServerEvent>
}

enum class ServerEvent { Notification, ProjectionsChanged, EditingChanged, SessionRevoked, Connected }

/** Token de la sesión guardado cifrado en el dispositivo (Keystore / Keychain). */
interface TokenStore {
    fun read(): String?
    fun write(token: String)
    fun clear()
}

/** Almacenamiento clave-valor simple (preferencias, cola offline). */
interface KeyValueStore {
    fun getString(key: String): String?
    fun putString(key: String, value: String)
    fun remove(key: String)
}

/** Versión publicada más reciente (GitHub Releases). */
data class AppRelease(val version: String, val apkUrl: String?, val pageUrl: String, val notes: String)

interface ReleaseSource {
    suspend fun latest(): AppRelease?
}
