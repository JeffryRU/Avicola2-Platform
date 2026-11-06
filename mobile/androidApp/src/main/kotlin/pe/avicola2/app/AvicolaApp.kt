package pe.avicola2.app

import android.app.Application

/** Un solo contenedor por proceso: sobrevive a rotaciones y cambios de tema. */
class AvicolaApp : Application() {
    val container: AppContainer by lazy { androidContainer(this) }
}
