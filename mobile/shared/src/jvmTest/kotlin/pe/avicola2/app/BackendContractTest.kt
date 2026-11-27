package pe.avicola2.app

import io.ktor.client.engine.java.Java
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import pe.avicola2.app.application.ApiError
import pe.avicola2.app.application.PlanningService
import pe.avicola2.app.application.ServerEvent
import pe.avicola2.app.application.SessionService
import pe.avicola2.app.application.SubmissionQueue
import pe.avicola2.app.application.SubmitOutcome
import pe.avicola2.app.domain.ExportFormat
import pe.avicola2.app.domain.Catalog
import pe.avicola2.app.domain.DayUnits
import pe.avicola2.app.domain.StockEntry
import pe.avicola2.app.domain.plusDays
import pe.avicola2.app.infrastructure.ApiClient
import pe.avicola2.app.infrastructure.HttpAuthGateway
import pe.avicola2.app.infrastructure.HttpNotificationsGateway
import pe.avicola2.app.infrastructure.HttpPlanningGateway
import pe.avicola2.app.infrastructure.HttpSacaGateway
import pe.avicola2.app.infrastructure.HttpStockGateway
import pe.avicola2.app.infrastructure.SseEventStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Contrato con el backend real (no corre en el CI por defecto). Para correrlo:
 *   AVICOLA_E2E_URL=http://127.0.0.1:8000/api ./gradlew :shared:jvmTest
 * con la base local inicializada (`cli init`, usuarios de prueba con contraseña demo1234).
 */
class BackendContractTest {
    private val url = System.getenv("AVICOLA_E2E_URL")

    private class Session(url: String) {
        val tokens = MemoryTokens()
        var expired = 0
        // HTTP/1.1: el motor Java intenta HTTP/2 sin cifrar (h2c) y uvicorn rechaza el "upgrade".
        // En Android se usa OkHttp y en producción HTTPS, así que esto solo aplica a la prueba.
        val api = ApiClient(
            { url },
            tokens,
            { expired++ },
            Java.create { protocolVersion = java.net.http.HttpClient.Version.HTTP_1_1 },
        )
        val auth = HttpAuthGateway(api)
        val planning = HttpPlanningGateway(api)
        val session = SessionService(auth, tokens, MemoryStore())
    }

    @Test
    fun sellerFlowAgainstRealBackend() = runBlocking<Unit> {
        if (url == null) return@runBlocking println("AVICOLA_E2E_URL no definido: se omite")
        val s = Session(url)

        // Contraseña equivocada: 401 con mensaje en español, sin token guardado.
        val bad = assertFailsWith<ApiError> { s.session.login("rnavarro", "incorrecta") }
        assertEquals(401, bad.status)
        assertEquals(null, s.tokens.token)

        s.session.login("rnavarro", "demo1234")
        assertNotNull(s.tokens.token)
        assertEquals("rnavarro", s.auth.me().seller.username)

        val catalog = Catalog(s.planning.catalog())
        assertTrue(catalog.categories.isNotEmpty())
        val window = s.planning.editingWindow()
        val open = window.days.first { it.open }
        val category = catalog.categories.first()
        val product = catalog.of(category).first()

        // Registrar con la cola offline (en línea: se envía directo).
        val service = PlanningService(s.planning, SubmissionQueue(MemoryStore()), { kotlin.uuid.Uuid.random().toString() }, { "" })
        val outcome = service.submit("rnavarro", category, listOf(DayUnits(open.date, mapOf(product.id to 12))))
        assertIs<SubmitOutcome.Sent>(outcome)
        assertEquals(12, outcome.result.totalUnits)
        assertEquals(product.kgPerUnit * 12, outcome.result.totalKg, 0.01)

        val saved = s.planning.projections(open.date, open.date).filter { it.seller == "rnavarro" && it.category == category }
        assertEquals(mapOf(product.id to 12), saved.single { it.confirmed }.units.filterValues { it > 0 })

        val suggestion = s.planning.suggestions(category, open.date, 1)
        assertTrue(suggestion.method.isNotBlank())
        s.planning.sales(open.date, open.date)
        HttpNotificationsGateway(s.api).list()

        // Los mismos formatos que la web: Excel (un zip, «PK»), PDF («%PDF») y CSV (con BOM).
        val xlsx = s.planning.exportProjections(open.date, open.date, format = ExportFormat.Excel)
        assertTrue(xlsx.size > 1000 && xlsx.decodeToString(0, 2) == "PK")
        val pdf = s.planning.exportProjections(open.date, open.date, format = ExportFormat.Pdf)
        assertTrue(pdf.decodeToString(0, 4) == "%PDF")
        val csv = s.planning.exportProjections(open.date, open.date, format = ExportFormat.Csv).decodeToString()
        assertTrue(csv.startsWith("\uFEFF\"Fecha\"") && "Roberto Navarro" in csv)
    }

    @Test
    fun supervisorGetsRealtimeNotificationWhenSellerSubmits() = runBlocking<Unit> {
        if (url == null) return@runBlocking println("AVICOLA_E2E_URL no definido: se omite")
        val supervisor = Session(url).apply { session.login("supervisor", "demo1234") }
        val seller = Session(url).apply { session.login("hdias", "demo1234") }
        assertTrue(supervisor.planning.sellers().size > 1)

        withTimeout(20_000) {
            val events = SseEventStream(supervisor.api).events()
            val received = launch {
                val got = events.take(2).toList() // Connected + el aviso
                assertEquals(ServerEvent.Connected, got.first())
            }
            // Espera a estar conectado antes de enviar.
            SseEventStream(supervisor.api).events().first { it == ServerEvent.Connected }
            kotlinx.coroutines.delay(500)
            val catalog = Catalog(seller.planning.catalog())
            val day = seller.planning.editingWindow().days.first { it.open }.date
            val category = catalog.categories.last()
            seller.planning.submit(
                pe.avicola2.app.domain.SubmissionRequest(
                    kotlin.uuid.Uuid.random().toString(),
                    category,
                    listOf(DayUnits(day, mapOf(catalog.of(category).first().id to 5))),
                ),
            )
            received.join()
        }
        val inbox = HttpNotificationsGateway(supervisor.api).list()
        assertTrue(inbox.items.any { it.kind == "projection_submitted" })
    }

    @Test
    fun dispatchChiefRegistersStockAndSupervisorSeesItInTheSaca() = runBlocking<Unit> {
        if (url == null) return@runBlocking println("AVICOLA_E2E_URL no definido: se omite")
        val chief = Session(url).apply { session.login("despacho", "demo1234") }
        val account = chief.session.account!!
        assertTrue(account.stockOnly && account.canManageStock)
        assertTrue(account.permissions.containsAll(listOf("view_stock", "manage_stock")))

        val today = pe.avicola2.app.domain.today()
        val product = chief.planning.catalog().first()
        val stock = HttpStockGateway(chief.api)
        val options = stock.options()
        assertTrue(options.items.any { it.quality == "B" } && options.locations.isNotEmpty())
        val place = options.locations.first()
        // Se guarda una ubicación; el día devuelto trae también las demás.
        val saved = stock.register(today, place, listOf(StockEntry(product.id, 12, today)))
        val here = saved.lines.filter { it.location == place }
        assertEquals(12, here.sumOf { it.units })
        assertEquals(product.kgPerUnit * 12, here.sumOf { it.kg }, 0.01) // kg: peso promedio
        assertEquals(today, here.single().lotDate)
        assertEquals("despacho", saved.recordedBy)
        assertTrue(stock.list(today, today).any { it.date == today })
        // No puede registrar el stock de mañana ni ver la saca.
        assertFailsWith<ApiError> { stock.register(today.plusDays(1), "Trujillo", listOf(StockEntry(product.id, 1))) }
        assertEquals(403, assertFailsWith<ApiError> { HttpSacaGateway(chief.api).plan(today) }.status)

        val supervisor = Session(url).apply { session.login("supervisor", "demo1234") }
        assertTrue(supervisor.session.account!!.canViewSaca)
        val plan = HttpSacaGateway(supervisor.api).plan(today)
        assertEquals(today, plan.stockDate)
        assertEquals(today.plusDays(1), plan.ordersDate)
        assertEquals(today.plusDays(2), plan.projectionDate)
        assertEquals("stock_orders_projection_plus", plan.method)
        plan.groups.forEach { assertEquals((it.stock - it.ordered + it.projected + it.plus).coerceAtLeast(0), it.farmOrder) }
        assertEquals(plan.lines.sumOf { it.request }, plan.request)
        // El supervisor consulta el stock pero no lo registra.
        assertTrue(HttpStockGateway(supervisor.api).list(today, today).isNotEmpty())
        assertEquals(403, assertFailsWith<ApiError> { HttpStockGateway(supervisor.api).register(today, "Trujillo", listOf(StockEntry(product.id, 1))) }.status)
    }

    @Test
    fun invalidTokenSignsOut() = runBlocking<Unit> {
        if (url == null) return@runBlocking println("AVICOLA_E2E_URL no definido: se omite")
        val s = Session(url)
        s.tokens.token = "token-falso"
        s.session.restore()
        assertEquals(null, s.tokens.token)
        assertEquals(1, s.expired)
    }
}
