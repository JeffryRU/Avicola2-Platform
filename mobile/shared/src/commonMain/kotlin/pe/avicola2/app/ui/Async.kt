package pe.avicola2.app.ui

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import pe.avicola2.app.application.ApiError
import pe.avicola2.app.application.ValidationError
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

/** Estado de una carga en pantalla. */
sealed interface Load<out T> {
    data object Loading : Load<Nothing>

    /**
     * Lo que se dibuja. `pending`: aún no llegó nada del servidor y `value` son datos en cero.
     * `offline`: la última consulta falló (el mensaje); se sigue mostrando `value` y se reintenta sola.
     */
    data class Ready<T>(
        val value: T,
        val refreshing: Boolean = false,
        val pending: Boolean = false,
        val offline: String? = null,
    ) : Load<T>

    data class Failed(val message: String) : Load<Nothing>
}

/** Datos en cero mientras llega la primera respuesta del servidor. */
fun <T> placeholder(value: T): Load.Ready<T> = Load.Ready(value, refreshing = true, pending = true)

/** La consulta falló: se conserva lo que había en pantalla y se marca sin conexión. */
fun <T> Load.Ready<T>.failed(message: String): Load.Ready<T> = copy(refreshing = false, offline = message)

/** Reintenta sola cada cierto tiempo mientras el servidor no responde. */
class AutoRetry(private val scope: CoroutineScope, private val every: Duration = 20.seconds) {
    private var job: Job? = null

    fun schedule(action: () -> Unit) {
        job?.cancel()
        job = scope.launch {
            delay(every)
            action()
        }
    }

    fun cancel() {
        job?.cancel()
    }
}

/** Mensaje para la persona: los de la API ya vienen en español. */
fun Throwable.userMessage(): String = when (this) {
    is ApiError, is ValidationError -> message ?: "Ocurrió un error."
    else -> "Ocurrió un error inesperado. Intenta de nuevo."
}
