package pe.avicola2.app.infrastructure

import com.russhwolf.settings.Settings
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.http.isSuccess
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import pe.avicola2.app.application.AppRelease
import pe.avicola2.app.application.KeyValueStore
import pe.avicola2.app.application.ReleaseSource

/** Preferencias y cola offline sobre multiplatform-settings (SharedPreferences / NSUserDefaults). */
class SettingsStore(private val settings: Settings) : KeyValueStore {
    override fun getString(key: String): String? = settings.getStringOrNull(key)
    override fun putString(key: String, value: String) = settings.putString(key, value)
    override fun remove(key: String) = settings.remove(key)
}

/** Última Release de GitHub (sin token: el repositorio es público; nunca se envía el de la API). */
class GithubReleaseSource(private val api: ApiClient, private val repo: String) : ReleaseSource {
    @Serializable
    private data class Asset(val name: String, @SerialName("browser_download_url") val url: String)

    @Serializable
    private data class Release(
        @SerialName("tag_name") val tag: String,
        @SerialName("html_url") val page: String,
        val body: String? = null,
        val assets: List<Asset> = emptyList(),
    )

    override suspend fun latest(): AppRelease? = try {
        val response = api.http.get("https://api.github.com/repos/$repo/releases/latest") {
            header("Accept", "application/vnd.github+json")
        }
        if (!response.status.isSuccess()) {
            null
        } else {
            val r = response.body<Release>()
            AppRelease(
                version = r.tag.removePrefix("v"),
                apkUrl = r.assets.firstOrNull { it.name.endsWith(".apk") }?.url,
                pageUrl = r.page,
                notes = r.body.orEmpty(),
            )
        }
    } catch (e: CancellationException) {
        throw e
    } catch (_: Exception) {
        null
    }
}
