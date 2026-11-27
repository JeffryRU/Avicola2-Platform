package pe.avicola2.app

import pe.avicola2.app.application.KeyValueStore
import pe.avicola2.app.application.TokenStore

class MemoryStore : KeyValueStore {
    val data = mutableMapOf<String, String>()
    override fun getString(key: String) = data[key]
    override fun putString(key: String, value: String) { data[key] = value }
    override fun remove(key: String) { data.remove(key) }
}

class MemoryTokens(var token: String? = null) : TokenStore {
    override fun read() = token
    override fun write(token: String) { this.token = token }
    override fun clear() { token = null }
}
