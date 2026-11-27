package pe.avicola2.app.infrastructure

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.plugins.HttpRequestTimeoutException
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.onUpload
import io.ktor.client.plugins.sse.SSE
import io.ktor.client.plugins.timeout
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.forms.formData
import io.ktor.client.request.forms.submitFormWithBinaryData
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsBytes
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.serialization.ContentConvertException
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import pe.avicola2.app.application.ApiError
import pe.avicola2.app.application.TokenStore

val ApiJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = true
}

/** Progreso de una subida, de 0 a 100. */
fun interface UploadProgress {
    fun onProgress(percent: Int)
}

/**
 * Cliente HTTP de la API: token Bearer (solo hacia la API, nunca a terceros), timeout, errores
 * en español y respuestas validadas por los modelos (kotlinx.serialization). También sube
 * archivos con progreso, para la carga de Excel u otros archivos.
 */
class ApiClient(
    private val baseUrl: () -> String,
    private val tokens: TokenStore,
    private val onUnauthorized: () -> Unit,
    engine: HttpClientEngine? = null,
    timeoutMs: Long = 15_000,
) {
    val http: HttpClient = (if (engine != null) HttpClient(engine) { setup(timeoutMs) } else HttpClient { setup(timeoutMs) })

    private fun io.ktor.client.HttpClientConfig<*>.setup(timeoutMs: Long) {
        expectSuccess = false
        install(ContentNegotiation) { json(ApiJson) }
        install(HttpTimeout) {
            requestTimeoutMillis = timeoutMs
            connectTimeoutMillis = 10_000
        }
        install(SSE)
    }

    fun url(path: String) = baseUrl().trimEnd('/') + path

    fun HttpRequestBuilder.authorize() {
        tokens.read()?.let { header(HttpHeaders.Authorization, "Bearer $it") }
    }

    suspend inline fun <reified T> get(path: String, query: Map<String, Any?> = emptyMap()): T =
        send(HttpMethod.Get, path) { query.forEach { (k, v) -> if (v != null) parameter(k, v) } }

    suspend inline fun <reified T, reified B : Any> post(path: String, body: B): T =
        send(HttpMethod.Post, path) { json(body) }

    suspend inline fun <reified T, reified B : Any> patch(path: String, body: B): T =
        send(HttpMethod.Patch, path) { json(body) }

    suspend inline fun <reified T, reified B : Any> put(path: String, body: B): T =
        send(HttpMethod.Put, path) { json(body) }

    /** Descarga un archivo (p. ej., el Excel); los errores llegan como ApiError igual que en JSON. */
    suspend fun bytes(path: String, query: Map<String, Any?> = emptyMap()): ByteArray {
        val response = call {
            http.request(url(path)) {
                method = HttpMethod.Get
                authorize()
                query.forEach { (k, v) -> if (v != null) parameter(k, v) }
                timeout { requestTimeoutMillis = DOWNLOAD_TIMEOUT_MS }
            }
        }
        checkStatus(response)
        return response.bodyAsBytes()
    }

    inline fun <reified B : Any> HttpRequestBuilder.json(body: B) {
        contentType(ContentType.Application.Json)
        setBody(body)
    }

    /** Sube un archivo (multipart/form-data, campo `file`) informando el progreso. */
    suspend inline fun <reified T> upload(
        path: String,
        fileName: String,
        bytes: ByteArray,
        mimeType: String,
        fields: Map<String, String> = emptyMap(),
        progress: UploadProgress? = null,
    ): T = parse(
        call {
            http.submitFormWithBinaryData(
                url = url(path),
                formData = formData {
                    fields.forEach { (k, v) -> append(k, v) }
                    append(
                        "file",
                        bytes,
                        Headers.build {
                            append(HttpHeaders.ContentType, mimeType)
                            append(HttpHeaders.ContentDisposition, "filename=\"${fileName.replace("\"", "")}\"")
                        },
                    )
                },
            ) {
                authorize()
                timeout { requestTimeoutMillis = UPLOAD_TIMEOUT_MS }
                if (progress != null) {
                    onUpload { sent, total ->
                        val size = total ?: bytes.size.toLong()
                        if (size > 0) progress.onProgress(((sent * 100) / size).toInt().coerceIn(0, 100))
                    }
                }
            }
        },
    )

    suspend inline fun <reified T> send(method: HttpMethod, path: String, crossinline block: HttpRequestBuilder.() -> Unit): T =
        parse(
            call {
                http.request(url(path)) {
                    this.method = method
                    authorize()
                    block()
                }
            },
        )

    /** Ejecuta la petición y traduce los fallos de red. */
    suspend fun call(block: suspend () -> HttpResponse): HttpResponse = try {
        block()
    } catch (e: CancellationException) {
        throw e
    } catch (e: HttpRequestTimeoutException) {
        throw ApiError("El servidor no respondió a tiempo.", 0)
    } catch (e: Exception) {
        throw ApiError("No se pudo conectar con el servidor.", 0)
    }

    suspend inline fun <reified T> parse(response: HttpResponse): T {
        checkStatus(response)
        if (T::class == Unit::class) return Unit as T
        return try {
            response.body<T>()
        } catch (e: CancellationException) {
            throw e
        } catch (e: SerializationException) {
            throw ApiError("La respuesta del servidor no tiene el formato esperado.", response.status.value)
        } catch (e: ContentConvertException) {
            throw ApiError("La respuesta del servidor no tiene el formato esperado.", response.status.value)
        }
    }

    suspend fun checkStatus(response: HttpResponse) {
        if (response.status.isSuccess()) return
        val code = response.status.value
        if (code == 401) onUnauthorized()
        val text = runCatching { response.bodyAsText() }.getOrDefault("")
        throw ApiError(errorMessage(text) ?: "El servidor respondió $code.", code)
    }

    companion object {
        const val UPLOAD_TIMEOUT_MS = 5 * 60_000L
        const val DOWNLOAD_TIMEOUT_MS = 60_000L

        /** FastAPI responde {"detail": "texto"} o {"detail": [{"msg": ...}]} en validaciones. */
        fun errorMessage(body: String): String? {
            val detail = runCatching { ApiJson.parseToJsonElement(body).jsonObject["detail"] }.getOrNull() ?: return null
            return when (detail) {
                is JsonPrimitive -> detail.contentOrNull
                is JsonArray -> (detail.firstOrNull() as? JsonObject)?.get("msg")?.let { (it as? JsonPrimitive)?.contentOrNull }
                    ?.let { "Datos inválidos: $it" }
                else -> null
            }
        }
    }
}
