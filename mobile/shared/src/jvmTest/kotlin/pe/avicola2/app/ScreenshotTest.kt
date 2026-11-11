package pe.avicola2.app

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.ImageComposeScene
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.unit.Density
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.viewmodel.compose.LocalViewModelStoreOwner
import com.russhwolf.settings.MapSettings
import java.io.File
import javax.swing.SwingUtilities
import kotlinx.coroutines.runBlocking
import org.jetbrains.skia.EncodedImageFormat
import pe.avicola2.app.domain.Account
import pe.avicola2.app.ui.screens.NewProjectionScreen
import pe.avicola2.app.ui.screens.NotificationsScreen
import pe.avicola2.app.ui.screens.NotificationsViewModel
import pe.avicola2.app.ui.screens.ProfileScreen
import pe.avicola2.app.ui.screens.ProductionScreen
import pe.avicola2.app.ui.screens.ProjectionsScreen
import pe.avicola2.app.ui.screens.SacaScreen
import pe.avicola2.app.ui.screens.StockScreen
import pe.avicola2.app.ui.theme.AppTheme
import kotlin.test.Test

/**
 * Capturas de las pantallas reales contra un backend local. No corre en el CI por defecto:
 *   AVICOLA_E2E_URL=http://127.0.0.1:8000/api AVICOLA_SCREENSHOTS=build/screens ./gradlew :shared:jvmTest
 */
/** Ver BackendContractTest: el motor Java usa HTTP/2 sin cifrar y uvicorn no lo acepta. */
fun http11() = io.ktor.client.engine.java.Java.create { protocolVersion = java.net.http.HttpClient.Version.HTTP_1_1 }

class ScreenshotTest {
    private val url = System.getenv("AVICOLA_E2E_URL")
    private val out = System.getenv("AVICOLA_SCREENSHOTS")?.let(::File)

    private fun container(user: String): Pair<AppContainer, Account> {
        val c = AppContainer(MemoryTokens(), MapSettings(), http11())
        c.server.set(url!!)
        runBlocking { c.session.login(user, "demo1234") }
        return c to c.session.account!!
    }

    private fun shot(
        name: String,
        width: Int,
        height: Int,
        dark: Boolean = false,
        taps: List<Offset> = emptyList(),
        content: @Composable () -> Unit,
    ) {
        val owner = object : ViewModelStoreOwner {
            override val viewModelStore = ViewModelStore()
        }
        // Compose y Navigation corren en el hilo principal (Swing); la espera, fuera de él, para que
        // las corrutinas de las pantallas avancen y lleguen los datos del servidor.
        fun <T> ui(block: () -> T): T {
            var result: Result<T>? = null
            SwingUtilities.invokeAndWait { result = runCatching(block) }
            return result!!.getOrThrow()
        }
        val scene = ui {
            ImageComposeScene(width, height, Density(2f)) {
                CompositionLocalProvider(LocalViewModelStoreOwner provides owner) {
                    AppTheme(dark = dark) { content() }
                }
            }
        }
        var t = 0L
        fun frames(n: Int) = repeat(n) {
            ui { scene.render(t) }
            t += 100_000_000L
            Thread.sleep(100)
        }
        frames(30)
        // Toques en píxeles de la imagen, para llegar a pasos que no son la pantalla inicial.
        taps.forEach { at ->
            ui {
                scene.sendPointerEvent(PointerEventType.Press, at)
                scene.sendPointerEvent(PointerEventType.Release, at)
            }
            frames(20)
        }
        val png = ui { scene.render(t).encodeToData(EncodedImageFormat.PNG)!!.bytes }
        out!!.mkdirs()
        File(out, "$name.png").writeBytes(png)
        ui {
            scene.close()
            owner.viewModelStore.clear()
        }
    }

    @Test
    fun screens() {
        if (url == null || out == null) return println("AVICOLA_E2E_URL / AVICOLA_SCREENSHOTS no definidos: se omite")
        val phoneW = 393 * 2
        val phoneH = 852 * 2
        val (seller, sellerAccount) = container("rnavarro")
        shot("01-login", phoneW, phoneH) { pe.avicola2.app.ui.screens.LoginScreen(AppContainer(MemoryTokens(), MapSettings(), http11()), null) }
        shot("02-inicio-vendedor", phoneW, phoneH) { App(seller) }
        shot("03-registrar", phoneW, phoneH) { NewProjectionScreen(seller, sellerAccount, null, onClose = {}) }
        // Elige también "sáb" y continúa al paso de cantidades.
        shot("03b-registrar-cantidades", phoneW, phoneH, taps = listOf(Offset(386f, 416f), Offset(393f, 755f))) {
            NewProjectionScreen(seller, sellerAccount, null, onClose = {})
        }
        shot("04-mis-proyecciones", phoneW, phoneH) { ProjectionsScreen(seller, sellerAccount) }
        // Abre «Exportar»: los mismos formatos que la web.
        shot("04b-exportar", phoneW, phoneH, taps = listOf(Offset(672f, 65f))) { ProjectionsScreen(seller, sellerAccount) }
        shot("05-avisos", phoneW, phoneH) { NotificationsScreen(NotificationsViewModel(seller)) }
        shot("06-perfil-oscuro", phoneW, phoneH, dark = true) { ProfileScreen(seller, sellerAccount, {}, {}) }
        val (sup, _) = container("supervisor")
        shot("07-supervisor-tablet", 1280 * 2, 800 * 2) { App(sup) }
        shot("08-supervisor-celular", phoneW, phoneH) { App(sup) }
        val (_, supAccount) = container("supervisor")
        shot("09-saca-celular", phoneW, phoneH) { SacaScreen(sup, supAccount, onOpenStock = {}) }
        shot("09b-saca-tablet", 1280 * 2, 800 * 2) { SacaScreen(sup, supAccount, onOpenStock = {}) }
        shot("10-stock-supervisor", phoneW, phoneH) { StockScreen(sup, supAccount, onBack = {}) }
        val (chief, chiefAccount) = container("despacho")
        shot("11-stock-jefe-despacho", phoneW, phoneH) { App(chief) }
        shot("11b-stock-chico", 320 * 2, 568 * 2) { StockScreen(chief, chiefAccount) }
        shot("11c-stock-tablet", 1280 * 2, 800 * 2) { App(chief) }
        shot("11d-stock-oscuro", phoneW, phoneH, dark = true) { StockScreen(chief, chiefAccount) }
        shot("12-produccion-jefe-despacho", phoneW, phoneH) { ProductionScreen(chief, chiefAccount) }
        shot("12b-produccion-chico", 320 * 2, 568 * 2) { ProductionScreen(chief, chiefAccount) }
        shot("12c-produccion-tablet", 1280 * 2, 800 * 2) { ProductionScreen(chief, chiefAccount) }
        shot("12d-produccion-supervisor", phoneW, phoneH) { ProductionScreen(sup, supAccount, onBack = {}) }
    }
}
