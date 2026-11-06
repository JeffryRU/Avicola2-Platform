package pe.avicola2.app

import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.toByteArray
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.OutgoingContent
import io.ktor.http.headersOf
import io.ktor.utils.io.errors.IOException
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.LocalDate
import pe.avicola2.app.application.ApiError
import pe.avicola2.app.infrastructure.ApiClient
import pe.avicola2.app.infrastructure.HttpAuthGateway
import pe.avicola2.app.infrastructure.HttpPlanningGateway
import pe.avicola2.app.domain.Product
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

private val JSON = headersOf(HttpHeaders.ContentType, "application/json")

class ApiClientTest {
    private fun client(tokens: MemoryTokens = MemoryTokens("tok"), onUnauthorized: () -> Unit = {}, engine: MockEngine) =
        ApiClient({ "https://api.test/api/" }, tokens, onUnauthorized, engine)

    @Test
    fun sendsBearerTokenAndParsesResponse() = runTest {
        var auth: String? = null
        var url = ""
        val engine = MockEngine { req ->
            auth = req.headers[HttpHeaders.Authorization]
            url = req.url.toString()
            respond("""[{"id":"p1","category":"Brasa","name":"Pollo","kg_per_unit":2.5,"sort_order":1,"extra":true}]""", headers = JSON)
        }
        val products = HttpPlanningGateway(client(engine = engine)).catalog()
        assertEquals("Bearer tok", auth)
        assertEquals("https://api.test/api/catalog", url)
        assertEquals(listOf(Product("p1", "Brasa", "Pollo", 2.5, 1)), products)
    }

    @Test
    fun omitsAuthorizationWithoutTokenAndNullQueryParams() = runTest {
        var auth: String? = "x"
        var query = ""
        val engine = MockEngine { req ->
            auth = req.headers[HttpHeaders.Authorization]
            query = req.url.encodedQuery
            respond("[]", headers = JSON)
        }
        HttpPlanningGateway(client(MemoryTokens(null), engine = engine))
            .projections(LocalDate(2026, 11, 5), LocalDate(2026, 11, 12), seller = null)
        assertNull(auth)
        assertEquals("date_from=2026-11-05&date_to=2026-11-12", query)
    }

    @Test
    fun loginPostsJsonToTokenEndpoint() = runTest {
        var body = ""
        val engine = MockEngine { req ->
            body = (req.body as OutgoingContent).toByteArray().decodeToString()
            respond(
                """{"seller":{"username":"rnavarro","name":"R","zone":null,"role":"seller"},"must_change_password":false,"token":"t","token_type":"bearer","expires_in":43200}""",
                headers = JSON,
            )
        }
        val response = HttpAuthGateway(client(engine = engine)).login("rnavarro", "demo1234")
        assertEquals("""{"username":"rnavarro","password":"demo1234"}""", body)
        assertEquals("t", response.token)
        assertEquals("rnavarro", response.account.seller.username)
    }

    @Test
    fun translatesFastApiErrorsAndNotifies401() = runTest {
        var expired = 0
        val engine = MockEngine { respond("""{"detail":"Inicia sesión para continuar."}""", HttpStatusCode.Unauthorized, JSON) }
        val error = assertFailsWith<ApiError> { HttpAuthGateway(client(onUnauthorized = { expired++ }, engine = engine)).me() }
        assertEquals(401, error.status)
        assertEquals("Inicia sesión para continuar.", error.message)
        assertEquals(1, expired)
        assertTrue(error.isRejected)
    }

    @Test
    fun validationErrorsShowFirstMessage() {
        assertEquals("Datos inválidos: campo requerido", ApiClient.errorMessage("""{"detail":[{"msg":"campo requerido"}]}"""))
        assertNull(ApiClient.errorMessage("<html>"))
    }

    @Test
    fun networkFailureIsStatusZero() = runTest {
        val engine = MockEngine { throw IOException("sin red") }
        val error = assertFailsWith<ApiError> { HttpPlanningGateway(client(engine = engine)).catalog() }
        assertEquals(0, error.status)
        assertTrue(error.isNetwork)
        assertEquals("No se pudo conectar con el servidor.", error.message)
    }

    @Test
    fun unexpectedShapeIsReported() = runTest {
        val engine = MockEngine { respond("""{"nope":1}""", headers = JSON) }
        val error = assertFailsWith<ApiError> { HttpPlanningGateway(client(engine = engine)).catalog() }
        assertEquals("La respuesta del servidor no tiene el formato esperado.", error.message)
    }

    @Test
    fun uploadsMultipartWithProgress() = runTest {
        var contentType = ""
        var auth: String? = null
        val engine = MockEngine { req ->
            contentType = req.body.contentType.toString()
            auth = req.headers[HttpHeaders.Authorization]
            (req.body as OutgoingContent).toByteArray()
            respond("""{"ok":true}""", headers = JSON)
        }
        val api = client(engine = engine)
        val result: Map<String, Boolean> = api.upload("/ingest/upload", "pedidos.xlsx", ByteArray(1000), "application/octet-stream")
        assertEquals(mapOf("ok" to true), result)
        assertTrue(contentType.startsWith("multipart/form-data"))
        assertEquals("Bearer tok", auth)
    }
}
