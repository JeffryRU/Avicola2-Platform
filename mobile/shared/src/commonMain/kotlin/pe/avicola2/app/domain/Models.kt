package pe.avicola2.app.domain

import kotlinx.datetime.LocalDate
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Unidades por producto (id del producto → unidades). */
typealias Units = Map<String, Int>

@Serializable
data class Seller(
    val username: String,
    val name: String,
    val zone: String? = null,
    val role: String,
) {
    /** Vista de supervisión: supervisor y supervisor general. Qué puede hacer cada uno lo
     *  decide el backend (domain/permissions.py) y llega en `Account.permissions`. */
    val isSupervisor: Boolean get() = role == "supervisor" || role == "general_supervisor"

    val roleLabel: String
        get() = when (role) {
            "seller" -> "Vendedor"
            "dispatch_chief" -> "Jefe de despacho"
            "supervisor" -> "Supervisor"
            "general_supervisor" -> "Supervisor general"
            else -> role
        }
}

@Serializable
data class Account(
    val seller: Seller,
    @SerialName("must_change_password") val mustChangePassword: Boolean,
    /** Permisos resueltos por el backend. Una cuenta guardada antes de existir llega sin ellos:
     *  hasta que /auth/me la refresca, se deduce del rol. */
    val permissions: List<String> = emptyList(),
) {
    private fun can(permission: String, vararg roles: String): Boolean =
        if (permissions.isNotEmpty()) permission in permissions else seller.role in roles

    val canViewStock: Boolean get() = can("view_stock", "dispatch_chief", "supervisor", "general_supervisor")
    val canManageStock: Boolean get() = can("manage_stock", "dispatch_chief", "general_supervisor")
    val canViewSaca: Boolean get() = can("view_saca", "supervisor", "general_supervisor")

    /** Supervisores: pueden cambiar por cuánto se multiplica el pedido de cada tipo. */
    val canEditSacaFactors: Boolean get() = can("manage_editing", "supervisor", "general_supervisor")
    val canViewProduction: Boolean
        get() = can("view_production", "dispatch_chief", "supervisor", "general_supervisor")
    val canManageProduction: Boolean get() = can("manage_production", "dispatch_chief", "general_supervisor")

    /** Jefe de despacho: su app es solo el stock (no proyecta ni ve al equipo). */
    val stockOnly: Boolean get() = canViewStock && !seller.isSupervisor && seller.role != "seller"
}

@Serializable
data class TokenResponse(
    val seller: Seller,
    @SerialName("must_change_password") val mustChangePassword: Boolean,
    val token: String,
    @SerialName("expires_in") val expiresIn: Long,
    val permissions: List<String> = emptyList(),
) {
    val account: Account get() = Account(seller, mustChangePassword, permissions)
}

@Serializable
data class Product(
    val id: String,
    val category: String,
    val name: String,
    @SerialName("kg_per_unit") val kgPerUnit: Double,
    @SerialName("sort_order") val sortOrder: Int,
    val subcategory: String? = null,
)

@Serializable
data class Projection(
    val id: String,
    @SerialName("submission_id") val submissionId: String,
    val seller: String,
    val date: LocalDate,
    val category: String,
    val status: String,
    @SerialName("total_units") val totalUnits: Int,
    @SerialName("total_kg") val totalKg: Double,
    @SerialName("submitted_at") val submittedAt: String,
    val units: Units,
    /** Hoja de registro vigente: 1 la primera; cada registro nuevo abre otra que la reemplaza. */
    val sheet: Int = 1,
) {
    val confirmed: Boolean get() = status == CONFIRMED

    companion object {
        const val CONFIRMED = "confirmed"
    }
}

@Serializable
data class DayUnits(val date: LocalDate, val units: Units)

@Serializable
data class SubmissionRequest(
    @SerialName("submission_id") val submissionId: String,
    val category: String,
    val days: List<DayUnits>,
    val seller: String? = null,
)

@Serializable
data class SubmissionResult(
    @SerialName("submission_id") val submissionId: String,
    val days: Int,
    @SerialName("total_units") val totalUnits: Int,
    @SerialName("total_kg") val totalKg: Double,
)

@Serializable
data class DailyUnits(val seller: String, val date: LocalDate, val units: Units)

@Serializable
data class Suggestion(val method: String, val days: List<DailyUnits>)

@Serializable
data class Unlock(
    val id: Int,
    val seller: String,
    val date: LocalDate,
    val reason: String,
    val status: String,
    @SerialName("requested_at") val requestedAt: String,
    @SerialName("decided_by") val decidedBy: String? = null,
    @SerialName("decided_at") val decidedAt: String? = null,
)

@Serializable
data class EditingDay(
    val date: LocalDate,
    @SerialName("closes_at") val closesAt: String,
    val open: Boolean,
    val unlock: Unlock? = null,
)

@Serializable
data class CutoffPolicy(
    @SerialName("cutoff_time") val cutoffTime: String,
    @SerialName("days_before") val daysBefore: Int,
    @SerialName("open_days") val openDays: Int,
    /** Primer día de la ventana (1 = mañana). */
    @SerialName("starts_in") val startsIn: Int = 0,
    /** Si el bloqueo por horario está activo. */
    val enabled: Boolean = true,
)

@Serializable
data class EditingWindow(val policy: CutoffPolicy, val days: List<EditingDay>)

@Serializable
data class UnlockRequest(val date: LocalDate, val reason: String)

/** El supervisor habilita la edición de un vendedor para esos días. */
@Serializable
data class GrantRequest(val dates: List<LocalDate>)

@Serializable
class EmptyBody

@Serializable
data class Notification(
    val id: Int,
    val kind: String,
    val title: String,
    val body: String,
    val link: String? = null,
    @SerialName("created_at") val createdAt: String,
    @SerialName("read_at") val readAt: String? = null,
) {
    val unread: Boolean get() = readAt == null
}

@Serializable
data class Notifications(val items: List<Notification>, val unread: Int)

@Serializable
data class MarkRead(val ids: List<Int>? = null)

@Serializable
data class MarkReadResult(val updated: Int)

@Serializable
data class LoginRequest(val username: String, val password: String)

@Serializable
data class ChangePasswordRequest(
    @SerialName("current_password") val currentPassword: String,
    @SerialName("new_password") val newPassword: String,
)

@Serializable
data class ProfileRequest(val name: String)

// --- Stock de despacho ---------------------------------------------------------------------

@Serializable
data class StockLine(@SerialName("product_id") val productId: String, val units: Int, val kg: Double)

/** Stock registrado de un día (una línea por producto). */
@Serializable
data class StockDay(
    val date: LocalDate,
    val lines: List<StockLine>,
    @SerialName("total_units") val totalUnits: Int,
    @SerialName("total_kg") val totalKg: Double,
    @SerialName("recorded_by") val recordedBy: String,
    @SerialName("recorded_at") val recordedAt: String,
)

/** Lo que se envía por producto: sin kg, el backend usa el peso promedio. */
@Serializable
data class StockEntry(@SerialName("product_id") val productId: String, val units: Int, val kg: Double? = null)

@Serializable
data class StockRequest(val lines: List<StockEntry>)

// --- Cálculo de saca -----------------------------------------------------------------------

/** Formas de cálculo: proyección + pedidos (la del negocio, por defecto) o el mayor de los dos. */
const val SACA_METHOD_MAX = "max"
const val SACA_METHOD_SUM = "sum"

const val SACA_METHOD_DEFAULT = SACA_METHOD_SUM

fun sacaMethodOf(stored: String?): String = if (stored == SACA_METHOD_MAX) SACA_METHOD_MAX else SACA_METHOD_DEFAULT

fun sacaFormula(method: String): String =
    (if (method == SACA_METHOD_MAX) "Hace falta = el mayor entre proyección y pedidos confirmados, menos el stock."
    else "Hace falta = proyección + pedidos confirmados − stock.") +
        " Nunca menos de 0. A granja se pide por tipo: lo que hace falta de cada uno por su factor."

/** Nombre legible del modelo de llegada en uso (lo elige solo el backend). */
fun arrivalModelLabel(method: String): String {
    if (method == "hybrid_weight") return "Suavizado + árboles con el peso de la parvada"
    val halfLife = method.removePrefix("ewma_")
    return if (method.startsWith("ewma_") && halfLife.toDoubleOrNull() != null) "Suavizado exponencial, vida media $halfLife días" else method
}

@Serializable
data class SacaLine(
    @SerialName("product_id") val productId: String,
    val projected: Int,
    val ordered: Int,
    val demand: Int,
    val stock: Int,
    val request: Int,
    @SerialName("request_kg") val requestKg: Double,
    /** Aves que se espera que lleguen en este rango y cuántas en calidad A (null: sin historia). */
    val expected: Int? = null,
    @SerialName("expected_a") val expectedA: Int? = null,
)

/** Con qué se estimó la llegada por rango. */
@Serializable
data class SacaForecast(
    val method: String,
    val days: Int,
    @SerialName("date_from") val dateFrom: LocalDate,
    @SerialName("date_to") val dateTo: LocalDate,
)

/** Un tipo de pedido a granja (Brasa chica...): lo que hace falta y el pedido final con su factor. */
@Serializable
data class SacaGroup(
    val name: String,
    val need: Int,
    val factor: Double,
    @SerialName("farm_order") val farmOrder: Int,
)

@Serializable
data class SacaFactors(val factors: Map<String, Double>)

const val MAX_SACA_FACTOR = 2.0

/** Factores escritos por el supervisor (texto) → números; null si alguno no es válido. */
fun parseSacaFactors(draft: Map<String, String>): Map<String, Double>? {
    val out = mutableMapOf<String, Double>()
    for ((name, raw) in draft) {
        val text = raw.trim().replace(',', '.')
        if (!Regex("""\d+(\.\d+)?""").matches(text)) return null
        val value = text.toDouble()
        if (value > MAX_SACA_FACTOR) return null
        out[name] = value
    }
    return out
}

/** Cuánto pedir a granja para un día y con qué datos se calculó (lo resuelve el backend). */
@Serializable
data class Saca(
    val date: LocalDate,
    val lines: List<SacaLine>,
    val projected: Int,
    val ordered: Int,
    val demand: Int,
    val stock: Int,
    val request: Int,
    @SerialName("request_kg") val requestKg: Double,
    @SerialName("live_kg") val liveKg: Double,
    @SerialName("yield_factor") val yieldFactor: Double,
    @SerialName("stock_date") val stockDate: LocalDate? = null,
    @SerialName("sellers_registered") val sellersRegistered: Int,
    @SerialName("sellers_total") val sellersTotal: Int,
    @SerialName("orders_available") val ordersAvailable: Boolean,
    val forecast: SacaForecast? = null,
    /** Forma de cálculo usada: «sum» o «max». */
    val method: String = SACA_METHOD_DEFAULT,
    /** Pedido final a granja: por tipo, lo que hace falta por su factor (null: backend anterior). */
    @SerialName("farm_order") val farmOrder: Int? = null,
    val groups: List<SacaGroup> = emptyList(),
) {
    val missingSellers: Int get() = (sellersTotal - sellersRegistered).coerceAtLeast(0)
}

// --- Producción diaria ---------------------------------------------------------------------

@Serializable
data class ProductionLine(
    @SerialName("product_id") val productId: String,
    val ordered: Double,
    val produced: Int,
    @SerialName("quality_a") val qualityA: Int,
    @SerialName("quality_b") val qualityB: Int,
)

/** Lo pedido a granja y lo que llegó en un día (una línea por producto). */
@Serializable
data class ProductionDay(
    val date: LocalDate,
    val lines: List<ProductionLine>,
    val ordered: Double,
    val produced: Int,
    @SerialName("quality_b") val qualityB: Int,
    @SerialName("recorded_by") val recordedBy: String,
    @SerialName("recorded_at") val recordedAt: String,
    /** Peso vivo promedio (kg) de la parvada por tipo; solo los que se anotaron. */
    val weights: Map<String, Double> = emptyMap(),
)

@Serializable
data class ProductionEntry(
    @SerialName("product_id") val productId: String,
    val ordered: Double,
    val produced: Int,
    @SerialName("quality_b") val qualityB: Int,
)

@Serializable
data class ProductionRequest(val lines: List<ProductionEntry>, val weights: Map<String, Double> = emptyMap())
