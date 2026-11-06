package pe.avicola2.app

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import pe.avicola2.app.application.FileSharer

/**
 * Guarda el archivo en la caché de la app y abre «Compartir» de Android (Drive, WhatsApp, Excel,
 * Descargas...). Se comparte con un FileProvider: otras apps solo leen ese archivo.
 */
class AndroidFileSharer(context: Context) : FileSharer {
    private val context = context.applicationContext

    override suspend fun share(fileName: String, mimeType: String, bytes: ByteArray) {
        val file = withContext(Dispatchers.IO) {
            val dir = File(context.cacheDir, EXPORTS_DIR).apply { mkdirs() }
            // Solo el último archivo de cada tipo: la caché no crece con cada exportación.
            dir.listFiles()?.forEach { it.delete() }
            File(dir, fileName.replace(Regex("[^A-Za-z0-9._-]"), "_")).apply { writeBytes(bytes) }
        }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = mimeType
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, file.name)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val chooser = Intent.createChooser(send, "Guardar o compartir el Excel").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(chooser)
    }

    private companion object {
        const val EXPORTS_DIR = "exports"
    }
}
