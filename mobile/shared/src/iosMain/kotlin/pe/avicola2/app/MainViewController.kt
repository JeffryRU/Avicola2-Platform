package pe.avicola2.app

import androidx.compose.ui.window.ComposeUIViewController
import com.russhwolf.settings.ExperimentalSettingsImplementation
import com.russhwolf.settings.KeychainSettings
import com.russhwolf.settings.NSUserDefaultsSettings
import platform.Foundation.NSUserDefaults
import platform.UIKit.UIViewController
import pe.avicola2.app.application.TokenStore

/** Token en el Keychain de iOS (cifrado por el sistema, solo para esta app). */
@OptIn(ExperimentalSettingsImplementation::class)
class KeychainTokenStore : TokenStore {
    private val keychain = KeychainSettings(service = "pe.avicola2.app")

    override fun read(): String? = keychain.getStringOrNull(KEY)
    override fun write(token: String) = keychain.putString(KEY, token)
    override fun clear() = keychain.remove(KEY)

    private companion object {
        const val KEY = "session.token"
    }
}

private val container by lazy {
    AppContainer(
        tokens = KeychainTokenStore(),
        settings = NSUserDefaultsSettings(NSUserDefaults.standardUserDefaults),
    )
}

/** La usa la app de Xcode (iosApp/iosApp/ContentView.swift). */
@Suppress("FunctionName", "unused")
fun MainViewController(): UIViewController = ComposeUIViewController { App(container) }
