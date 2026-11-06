package pe.avicola2.app

import kotlinx.coroutines.test.runTest
import pe.avicola2.app.application.ApiError
import pe.avicola2.app.application.AuthGateway
import pe.avicola2.app.application.SessionService
import pe.avicola2.app.application.SessionState
import pe.avicola2.app.domain.Account
import pe.avicola2.app.domain.Seller
import pe.avicola2.app.domain.TokenResponse
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull

private val ANA = Account(Seller("ana", "Ana", "Norte", "seller"), mustChangePassword = false)

private class FakeAuth : AuthGateway {
    var meError: ApiError? = null
    var passwords = mutableListOf<Pair<String, String>>()
    override suspend fun login(username: String, password: String) = TokenResponse(ANA.seller, false, "tok-$password", 3600)
    override suspend fun me(): Account = meError?.let { throw it } ?: ANA
    override suspend fun changePassword(current: String, new: String): Account {
        passwords += current to new
        return ANA
    }
    override suspend fun updateProfile(name: String) = ANA.copy(seller = ANA.seller.copy(name = name))
}

class SessionServiceTest {
    @Test
    fun loginStoresTokenAndAccount() = runTest {
        val tokens = MemoryTokens()
        val s = SessionService(FakeAuth(), tokens, MemoryStore())
        s.login(" ana ", "demo")
        assertEquals("tok-demo", tokens.token)
        assertEquals(ANA, s.account)
    }

    @Test
    fun restoreWithoutTokenSignsOut() = runTest {
        val s = SessionService(FakeAuth(), MemoryTokens(), MemoryStore())
        s.restore()
        assertIs<SessionState.SignedOut>(s.state.value)
    }

    @Test
    fun restoreOfflineUsesLastKnownAccount() = runTest {
        val auth = FakeAuth()
        val store = MemoryStore()
        val tokens = MemoryTokens()
        SessionService(auth, tokens, store).login("ana", "demo")
        auth.meError = ApiError("sin red", 0)
        val reopened = SessionService(auth, tokens, store)
        reopened.restore()
        assertEquals(ANA, reopened.account)
    }

    @Test
    fun rejectedTokenSignsOutAndClearsEverything() = runTest {
        val auth = FakeAuth().apply { meError = ApiError("vencida", 401) }
        val tokens = MemoryTokens("viejo")
        val store = MemoryStore()
        var cleaned = 0
        val s = SessionService(auth, tokens, store) { cleaned++ }
        s.restore()
        assertIs<SessionState.SignedOut>(s.state.value)
        assertNull(tokens.token)
        assertEquals(1, cleaned)
    }

    @Test
    fun changePasswordRenewsToken() = runTest {
        val auth = FakeAuth()
        val tokens = MemoryTokens()
        val s = SessionService(auth, tokens, MemoryStore())
        s.login("ana", "temporal")
        s.changePassword("temporal", "nueva-clave")
        assertEquals(listOf("temporal" to "nueva-clave"), auth.passwords)
        assertEquals("tok-nueva-clave", tokens.token)
    }

    @Test
    fun expireOnlyWhenSignedIn() = runTest {
        val s = SessionService(FakeAuth(), MemoryTokens(), MemoryStore())
        s.expire()
        assertIs<SessionState.Restoring>(s.state.value)
        s.login("ana", "x")
        s.expire()
        assertEquals("Tu sesión venció. Vuelve a iniciar sesión.", (s.state.value as SessionState.SignedOut).reason)
    }
}
