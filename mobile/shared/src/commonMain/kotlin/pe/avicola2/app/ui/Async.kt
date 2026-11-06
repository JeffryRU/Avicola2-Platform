package pe.avicola2.app.ui

import pe.avicola2.app.application.ApiError
import pe.avicola2.app.application.ValidationError

/** Estado de una carga en pantalla. */
sealed interface Load<out T> {
    data object Loading : Load<Nothing>
    data class Ready<T>(val value: T, val refreshing: Boolean = false) : Load<T>
    data class Failed(val message: String) : Load<Nothing>
}

/** Mensaje para la persona: los de la API ya vienen en español. */
fun Throwable.userMessage(): String = when (this) {
    is ApiError, is ValidationError -> message ?: "Ocurrió un error."
    else -> "Ocurrió un error inesperado. Intenta de nuevo."
}
