package pe.avicola2.app.infrastructure

import io.ktor.client.plugins.HttpTimeoutConfig
import io.ktor.client.plugins.sse.SSEClientException
import io.ktor.client.plugins.sse.sse
import io.ktor.client.plugins.timeout
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import pe.avicola2.app.application.EventStream
import pe.avicola2.app.application.ServerEvent

/**
 * GET /api/events (Server-Sent Events) con el token Bearer. Se reconecta sola con espera
 * creciente; termina si la sesión se cierra en el servidor o el token deja de valer.
 */
class SseEventStream(private val api: ApiClient) : EventStream {
    override fun events(): Flow<ServerEvent> = channelFlow {
        var backoff = MIN_BACKOFF_MS
        while (true) {
            var stop = false
            try {
                api.http.sse(
                    urlString = api.url("/events"),
                    request = {
                        with(api) { authorize() }
                        timeout {
                            requestTimeoutMillis = HttpTimeoutConfig.INFINITE_TIMEOUT_MS
                            socketTimeoutMillis = 90_000 // el servidor envía un ping cada 20 s
                        }
                    },
                ) {
                    backoff = MIN_BACKOFF_MS
                    send(ServerEvent.Connected)
                    incoming.collect { event ->
                        val parsed = when (event.event) {
                            "notification" -> ServerEvent.Notification
                            "projections.changed" -> ServerEvent.ProjectionsChanged
                            "editing.changed" -> ServerEvent.EditingChanged
                            "session.revoked" -> ServerEvent.SessionRevoked
                            else -> null
                        }
                        if (parsed != null) send(parsed)
                        if (parsed == ServerEvent.SessionRevoked) stop = true
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: SSEClientException) {
                val status = e.response?.status?.value
                if (status == 401 || status == 403) {
                    if (status == 401) send(ServerEvent.SessionRevoked)
                    stop = true
                }
            } catch (_: Exception) {
                // corte de red: se reintenta
            }
            if (stop) break
            delay(backoff)
            backoff = (backoff * 2).coerceAtMost(MAX_BACKOFF_MS)
        }
    }

    private companion object {
        const val MIN_BACKOFF_MS = 3_000L
        const val MAX_BACKOFF_MS = 60_000L
    }
}
