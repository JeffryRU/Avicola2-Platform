package pe.avicola2.app.application

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json
import pe.avicola2.app.domain.Account

sealed interface SessionState {
    data object Restoring : SessionState
    data class SignedOut(val reason: String? = null) : SessionState
    data class SignedIn(val account: Account) : SessionState
}

/**
 * Sesión del vendedor. El token vive cifrado en el dispositivo; al abrir la app se valida con
 * /auth/me. Sin señal se entra con la última cuenta conocida (la cola offline sigue funcionando).
 * Si el servidor rechaza el token (401), la sesión se cierra y se avisa por qué.
 */
class SessionService(
    private val auth: AuthGateway,
    private val tokens: TokenStore,
    private val cache: KeyValueStore,
    private val onSignOut: () -> Unit = {},
) {
    private val _state = MutableStateFlow<SessionState>(SessionState.Restoring)
    val state: StateFlow<SessionState> = _state.asStateFlow()

    val account: Account? get() = (state.value as? SessionState.SignedIn)?.account

    suspend fun restore() {
        if (tokens.read() == null) {
            _state.value = SessionState.SignedOut()
            return
        }
        try {
            signedIn(auth.me())
        } catch (e: ApiError) {
            val cached = cachedAccount()
            when {
                e.isNetwork && cached != null -> _state.value = SessionState.SignedIn(cached)
                e.isNetwork -> _state.value = SessionState.SignedOut("Sin conexión. Revisa tu señal e intenta de nuevo.")
                else -> signOut("Tu sesión venció. Vuelve a iniciar sesión.")
            }
        }
    }

    suspend fun login(username: String, password: String) {
        val response = auth.login(username.trim(), password)
        tokens.write(response.token)
        signedIn(response.account)
    }

    /** Cambia la contraseña y renueva el token (el servidor cierra las demás sesiones). */
    suspend fun changePassword(current: String, new: String) {
        val username = account?.seller?.username ?: return
        auth.changePassword(current, new)
        login(username, new)
    }

    suspend fun updateProfile(name: String) {
        signedIn(auth.updateProfile(name.trim()))
    }

    /** El servidor rechazó el token (401). */
    fun expire() {
        if (state.value is SessionState.SignedIn) signOut("Tu sesión venció. Vuelve a iniciar sesión.")
    }

    fun signOut(reason: String? = null) {
        tokens.clear()
        cache.remove(ACCOUNT_KEY)
        onSignOut()
        _state.value = SessionState.SignedOut(reason)
    }

    private fun signedIn(account: Account) {
        cache.putString(ACCOUNT_KEY, Json.encodeToString(Account.serializer(), account))
        _state.value = SessionState.SignedIn(account)
    }

    private fun cachedAccount(): Account? = cache.getString(ACCOUNT_KEY)?.let {
        runCatching { Json.decodeFromString(Account.serializer(), it) }.getOrNull()
    }

    private companion object {
        const val ACCOUNT_KEY = "session.account"
    }
}
