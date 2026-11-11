package pe.avicola2.app.infrastructure

import io.ktor.http.encodeURLPathPart
import kotlinx.datetime.LocalDate
import pe.avicola2.app.application.AuthGateway
import pe.avicola2.app.application.NotificationsGateway
import pe.avicola2.app.application.PlanningGateway
import pe.avicola2.app.application.ProductionGateway
import pe.avicola2.app.application.SacaGateway
import pe.avicola2.app.application.StockGateway
import pe.avicola2.app.domain.Account
import pe.avicola2.app.domain.ChangePasswordRequest
import pe.avicola2.app.domain.DailyUnits
import pe.avicola2.app.domain.EditingWindow
import pe.avicola2.app.domain.EmptyBody
import pe.avicola2.app.domain.ExportFormat
import pe.avicola2.app.domain.GrantRequest
import pe.avicola2.app.domain.LoginRequest
import pe.avicola2.app.domain.MarkRead
import pe.avicola2.app.domain.MarkReadResult
import pe.avicola2.app.domain.Notifications
import pe.avicola2.app.domain.Product
import pe.avicola2.app.domain.ProfileRequest
import pe.avicola2.app.domain.ProductionDay
import pe.avicola2.app.domain.ProductionEntry
import pe.avicola2.app.domain.ProductionRequest
import pe.avicola2.app.domain.Projection
import pe.avicola2.app.domain.Saca
import pe.avicola2.app.domain.SacaFactors
import pe.avicola2.app.domain.Seller
import pe.avicola2.app.domain.StockDay
import pe.avicola2.app.domain.StockEntry
import pe.avicola2.app.domain.StockRequest
import pe.avicola2.app.domain.SubmissionRequest
import pe.avicola2.app.domain.SubmissionResult
import pe.avicola2.app.domain.Suggestion
import pe.avicola2.app.domain.TokenResponse
import pe.avicola2.app.domain.Unlock
import pe.avicola2.app.domain.UnlockRequest

class HttpAuthGateway(private val api: ApiClient) : AuthGateway {
    override suspend fun login(username: String, password: String): TokenResponse =
        api.post("/auth/token", LoginRequest(username, password))

    override suspend fun me(): Account = api.get("/auth/me")

    override suspend fun changePassword(current: String, new: String): Account =
        api.post("/auth/password", ChangePasswordRequest(current, new))

    override suspend fun updateProfile(name: String): Account = api.patch("/auth/profile", ProfileRequest(name))
}

class HttpPlanningGateway(private val api: ApiClient) : PlanningGateway {
    override suspend fun catalog(): List<Product> = api.get("/catalog")

    override suspend fun sellers(): List<Seller> = api.get("/sellers")

    override suspend fun projections(from: LocalDate, to: LocalDate, seller: String?): List<Projection> =
        api.get("/projections", mapOf("date_from" to from, "date_to" to to, "seller" to seller))

    override suspend fun submit(request: SubmissionRequest): SubmissionResult = api.post("/projections", request)

    override suspend fun suggestions(category: String, start: LocalDate, days: Int, onBehalf: String?): Suggestion =
        api.get("/suggestions", mapOf("category" to category, "start" to start, "days" to days, "on_behalf" to onBehalf))

    override suspend fun sales(from: LocalDate, to: LocalDate, seller: String?): List<DailyUnits> =
        api.get("/sales", mapOf("date_from" to from, "date_to" to to, "seller" to seller))

    override suspend fun editingWindow(): EditingWindow = api.get("/editing")

    override suspend fun requestUnlock(date: LocalDate, reason: String): Unlock =
        api.post("/editing/unlocks", UnlockRequest(date, reason))

    override suspend fun unlocks(): List<Unlock> = api.get("/editing/unlocks")

    override suspend fun grantEditing(username: String, dates: List<LocalDate>): List<Unlock> =
        api.post("/admin/editing/sellers/${username.encodeURLPathPart()}/grant", GrantRequest(dates))

    override suspend fun revokeEditing(username: String): List<Unlock> =
        api.post("/admin/editing/sellers/${username.encodeURLPathPart()}/revoke", EmptyBody())

    override suspend fun exportProjections(from: LocalDate, to: LocalDate, seller: String?, format: ExportFormat): ByteArray =
        api.bytes(
            "/projections/export",
            mapOf("date_from" to from, "date_to" to to, "seller" to seller, "format" to format.extension),
        )
}

class HttpNotificationsGateway(private val api: ApiClient) : NotificationsGateway {
    override suspend fun list(): Notifications = api.get("/notifications")

    override suspend fun markRead(ids: List<Int>?): Int =
        api.post<MarkReadResult, MarkRead>("/notifications/read", MarkRead(ids)).updated
}

class HttpStockGateway(private val api: ApiClient) : StockGateway {
    override suspend fun list(from: LocalDate, to: LocalDate): List<StockDay> =
        api.get("/stock", mapOf("date_from" to from, "date_to" to to))

    override suspend fun register(day: LocalDate, lines: List<StockEntry>): StockDay =
        api.put("/stock/$day", StockRequest(lines))
}

class HttpSacaGateway(private val api: ApiClient) : SacaGateway {
    override suspend fun plan(day: LocalDate, method: String): Saca = api.get("/saca", mapOf("date" to day, "method" to method))

    override suspend fun setFactors(factors: Map<String, Double>): Map<String, Double> =
        api.put<SacaFactors, SacaFactors>("/saca/factors", SacaFactors(factors)).factors
}

class HttpProductionGateway(private val api: ApiClient) : ProductionGateway {
    override suspend fun list(from: LocalDate, to: LocalDate): List<ProductionDay> =
        api.get("/production", mapOf("date_from" to from, "date_to" to to))

    override suspend fun register(day: LocalDate, lines: List<ProductionEntry>, weights: Map<String, Double>): ProductionDay =
        api.put("/production/$day", ProductionRequest(lines, weights))
}
