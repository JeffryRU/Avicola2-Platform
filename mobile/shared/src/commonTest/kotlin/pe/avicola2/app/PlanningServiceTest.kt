package pe.avicola2.app

import kotlinx.coroutines.test.runTest
import kotlinx.datetime.LocalDate
import pe.avicola2.app.application.ApiError
import pe.avicola2.app.application.PlanningGateway
import pe.avicola2.app.application.PlanningService
import pe.avicola2.app.application.SubmissionQueue
import pe.avicola2.app.application.SubmitOutcome
import pe.avicola2.app.application.ValidationError
import pe.avicola2.app.domain.DailyUnits
import pe.avicola2.app.domain.DayUnits
import pe.avicola2.app.domain.EditingWindow
import pe.avicola2.app.domain.Product
import pe.avicola2.app.domain.Projection
import pe.avicola2.app.domain.Seller
import pe.avicola2.app.domain.SubmissionRequest
import pe.avicola2.app.domain.SubmissionResult
import pe.avicola2.app.domain.Suggestion
import pe.avicola2.app.domain.Unlock
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertNull

private class FakePlanning : PlanningGateway {
    var failWith: ApiError? = null
    val sent = mutableListOf<SubmissionRequest>()
    override suspend fun submit(request: SubmissionRequest): SubmissionResult {
        failWith?.let { throw it }
        sent += request
        return SubmissionResult(request.submissionId, request.days.size, 1, 1.0)
    }
    override suspend fun catalog(): List<Product> = emptyList()
    override suspend fun sellers(): List<Seller> = emptyList()
    override suspend fun projections(from: LocalDate, to: LocalDate, seller: String?): List<Projection> = emptyList()
    override suspend fun suggestions(category: String, start: LocalDate, days: Int, onBehalf: String?) = Suggestion("x", emptyList())
    override suspend fun sales(from: LocalDate, to: LocalDate, seller: String?): List<DailyUnits> = emptyList()
    override suspend fun editingWindow(): EditingWindow = error("no usado")
    override suspend fun requestUnlock(date: LocalDate, reason: String): Unlock = error("no usado")
}

class PlanningServiceTest {
    private val day = DayUnits(LocalDate(2026, 11, 6), mapOf("p1" to 3))
    private var ids = 0
    private fun service(gateway: FakePlanning, store: MemoryStore = MemoryStore()) =
        PlanningService(gateway, SubmissionQueue(store), { "id-${++ids}" }, { "2026-11-05T10:00:00Z" })

    @Test
    fun sendsWhenOnline() = runTest {
        val gateway = FakePlanning()
        val outcome = service(gateway).submit("ana", "Brasa", listOf(day))
        assertIs<SubmitOutcome.Sent>(outcome)
        assertEquals("id-1", gateway.sent.single().submissionId)
    }

    @Test
    fun queuesOfflineAndFlushesLaterWithSameId() = runTest {
        val gateway = FakePlanning().apply { failWith = ApiError("sin red", 0) }
        val store = MemoryStore()
        val s = service(gateway, store)
        assertIs<SubmitOutcome.Queued>(s.submit("ana", "Brasa", listOf(day)))
        assertEquals(1, s.queue.of("ana").size)
        // La cola sobrevive a cerrar la app.
        assertEquals(1, SubmissionQueue(store).items.value.size)

        gateway.failWith = null
        assertEquals(1, s.flush("ana"))
        assertEquals("id-1", gateway.sent.single().submissionId)
        assertEquals(0, s.queue.items.value.size)
    }

    @Test
    fun serverErrorsAreQueuedButRejectionsAreNot() = runTest {
        val gateway = FakePlanning().apply { failWith = ApiError("caído", 503) }
        val s = service(gateway)
        assertIs<SubmitOutcome.Queued>(s.submit("ana", "Brasa", listOf(day)))
        gateway.failWith = ApiError("El día está cerrado.", 409)
        assertFailsWith<ApiError> { s.submit("ana", "Brasa", listOf(day)) }
        assertEquals(1, s.queue.items.value.size)
    }

    @Test
    fun rejectedFlushIsMarkedAndNotRetriedUntilAsked() = runTest {
        val gateway = FakePlanning().apply { failWith = ApiError("sin red", 0) }
        val s = service(gateway)
        s.submit("ana", "Brasa", listOf(day))
        gateway.failWith = ApiError("El día está cerrado.", 409)
        assertEquals(0, s.flush("ana"))
        assertEquals("El día está cerrado.", s.queue.items.value.single().error)
        gateway.failWith = null
        assertEquals(0, s.flush("ana")) // con error no se reintenta sola
        s.retry("id-1")
        assertNull(s.queue.items.value.single().error)
        assertEquals(1, s.flush("ana"))
    }

    @Test
    fun queueIsPerOwner() = runTest {
        val gateway = FakePlanning().apply { failWith = ApiError("sin red", 0) }
        val s = service(gateway)
        s.submit("ana", "Brasa", listOf(day))
        gateway.failWith = null
        assertEquals(0, s.flush("luis"))
        assertEquals(1, s.queue.items.value.size)
    }

    @Test
    fun validatesBeforeSending() = runTest {
        val s = service(FakePlanning())
        assertFailsWith<ValidationError> { s.submit("ana", "", listOf(day)) }
        assertFailsWith<ValidationError> { s.submit("ana", "Brasa", emptyList()) }
        assertFailsWith<ValidationError> { s.submit("ana", "Brasa", listOf(day.copy(units = mapOf("p1" to 0)))) }
        assertFailsWith<ValidationError> { s.submit("ana", "Brasa", listOf(day.copy(units = mapOf("p1" to 10_000)))) }
    }
}
