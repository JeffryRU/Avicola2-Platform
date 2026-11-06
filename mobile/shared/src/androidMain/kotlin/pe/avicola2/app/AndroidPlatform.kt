package pe.avicola2.app

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.russhwolf.settings.SharedPreferencesSettings
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import pe.avicola2.app.application.TokenStore

/**
 * Token cifrado con una clave AES del Android Keystore: la clave no sale del hardware seguro y
 * el token guardado en las preferencias no sirve copiado a otro equipo.
 */
class KeystoreTokenStore(context: Context) : TokenStore {
    private val prefs = context.getSharedPreferences("avicola2.secure", Context.MODE_PRIVATE)

    override fun read(): String? {
        val stored = prefs.getString(KEY, null) ?: return null
        return runCatching {
            val raw = Base64.decode(stored, Base64.NO_WRAP)
            val iv = raw.copyOfRange(0, IV_BYTES)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
            String(cipher.doFinal(raw, IV_BYTES, raw.size - IV_BYTES), Charsets.UTF_8)
        }.getOrElse {
            clear() // clave perdida (p. ej., se borraron las credenciales del equipo)
            null
        }
    }

    override fun write(token: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val data = cipher.iv + cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        prefs.edit().putString(KEY, Base64.encodeToString(data, Base64.NO_WRAP)).apply()
    }

    override fun clear() {
        prefs.edit().remove(KEY).apply()
    }

    private fun key(): SecretKey {
        val keystore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keystore.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    private companion object {
        const val KEY = "session.token"
        const val ALIAS = "avicola2.session"
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
    }
}

/** Contenedor de la app en Android. */
fun androidContainer(context: Context): AppContainer = AppContainer(
    tokens = KeystoreTokenStore(context.applicationContext),
    settings = SharedPreferencesSettings(context.applicationContext.getSharedPreferences("avicola2", Context.MODE_PRIVATE)),
)
