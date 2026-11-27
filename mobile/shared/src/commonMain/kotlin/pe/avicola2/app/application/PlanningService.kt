package pe.avicola2.app.application

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import pe.avicola2.app.domain.DayUnits
import pe.avicola2.app.domain.SubmissionRequest
import pe.avicola2.app.domain.SubmissionResult
import pe.avicola2.app.domain.total

/** Envío guardado en el dispositivo hasta que el servidor lo confirme. */
@Serializable
data class QueuedSubmission(
    val request: SubmissionRequest,
    /** Dueño de la cola: el vendedor que la creó (o el supervisor que registró por él). */
    val owner: String,
    val createdAt: String,
    /** El servidor la rechazó (4xx): no se reintenta sola, la persona decide. */
    val error: String? = null,
)

/** Cola offline persistente. El `submission_id` lo genera la app: reenviar es idempotente. */
class SubmissionQueue(private val store: KeyValueStore) {
    private val serializer = ListSerializer(QueuedSubmission.serializer())
    private val _items = MutableStateFlow(load())
    val items: StateFlow<List<QueuedSubmission>> = _items.asStateFlow()

    fun of(owner: String) = items.value.filter { it.owner == owner }

    fun add(item: QueuedSubmission) = save(items.value.filterNot { it.request.submissionId == item.request.submissionId } + item)

    fun remove(submissionId: String) = save(items.value.filterNot { it.request.submissionId == submissionId })

    fun markError(submissionId: String, error: String) =
        save(items.value.map { if (it.request.submissionId == submissionId) it.copy(error = error) else it })

    private fun load(): List<QueuedSubmission> =
        store.getString(KEY)?.let { runCatching { Json.decodeFromString(serializer, it) }.getOrNull() } ?: emptyList()

    private fun save(items: List<QueuedSubmission>) {
        store.putString(KEY, Json.encodeToString(serializer, items))
        _items.value = items
    }

    private companion object {
        const val KEY = "planning.queue"
    }
}

sealed interface SubmitOutcome {
    data class Sent(val result: SubmissionResult) : SubmitOutcome

    /** Sin conexión: quedó en el celular y se enviará sola al volver la señal. */
    data object Queued : SubmitOutcome
}

class ValidationError(message: String) : Exception(message)

/** Registrar proyecciones con cola offline (mismo comportamiento que la web). */
class PlanningService(
    private val gateway: PlanningGateway,
    val queue: SubmissionQueue,
    private val newId: () -> String,
    private val now: () -> String,
) {
    private val flushing = Mutex()

    suspend fun submit(owner: String, category: String, days: List<DayUnits>, onBehalf: String? = null): SubmitOutcome {
        validate(category, days)
        val request = SubmissionRequest(newId(), category, days.sortedBy { it.date }, onBehalf)
        return try {
            SubmitOutcome.Sent(gateway.submit(request))
        } catch (e: ApiError) {
            if (e.isRejected) throw e
            queue.add(QueuedSubmission(request, owner, now()))
            SubmitOutcome.Queued
        }
    }

    /** Envía lo pendiente (en orden). Devuelve cuántos se confirmaron. */
    suspend fun flush(owner: String): Int = flushing.withLock {
        var sent = 0
        for (item in queue.of(owner).filter { it.error == null }) {
            try {
                gateway.submit(item.request)
                queue.remove(item.request.submissionId)
                sent++
            } catch (e: ApiError) {
                if (!e.isRejected) break // sigue sin señal: se reintenta después
                queue.markError(item.request.submissionId, e.message ?: "El servidor rechazó el envío.")
            }
        }
        sent
    }

    /** Reintenta un envío rechazado (p. ej., después de pedir habilitación del día). */
    fun retry(submissionId: String) {
        queue.items.value.find { it.request.submissionId == submissionId }?.let { queue.add(it.copy(error = null)) }
    }

    fun discard(submissionId: String) = queue.remove(submissionId)

    private fun validate(category: String, days: List<DayUnits>) {
        if (category.isBlank()) throw ValidationError("Elige una categoría.")
        if (days.isEmpty()) throw ValidationError("Elige al menos un día.")
        days.firstOrNull { it.units.values.any { n -> n < 0 || n > MAX_UNITS } }?.let {
            throw ValidationError("Las unidades deben estar entre 0 y $MAX_UNITS.")
        }
        days.firstOrNull { it.units.total() == 0 }?.let {
            throw ValidationError("Ingresa al menos un producto para cada día elegido.")
        }
    }

    companion object {
        const val MAX_UNITS = 9999
        const val MAX_DAYS = 7
    }
}
