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
    val isSupervisor: Boolean get() = role == "supervisor"
}

@Serializable
data class Account(
    val seller: Seller,
    @SerialName("must_change_password") val mustChangePassword: Boolean,
)

@Serializable
data class TokenResponse(
    val seller: Seller,
    @SerialName("must_change_password") val mustChangePassword: Boolean,
    val token: String,
    @SerialName("expires_in") val expiresIn: Long,
) {
    val account: Account get() = Account(seller, mustChangePassword)
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
)

@Serializable
data class EditingWindow(val policy: CutoffPolicy, val days: List<EditingDay>)

@Serializable
data class UnlockRequest(val date: LocalDate, val reason: String)

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
