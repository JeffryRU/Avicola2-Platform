package pe.avicola2.app.application

import kotlinx.coroutines.flow.Flow
import kotlinx.datetime.LocalDate
import pe.avicola2.app.domain.Account
import pe.avicola2.app.domain.DailyUnits
import pe.avicola2.app.domain.EditingWindow
import pe.avicola2.app.domain.Notifications
import pe.avicola2.app.domain.Product
import pe.avicola2.app.domain.Projection
import pe.avicola2.app.domain.Seller
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
