package pe.avicola2.app

import kotlinx.cinterop.BetaInteropApi
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.usePinned
import platform.Foundation.NSData
import platform.Foundation.NSTemporaryDirectory
import platform.Foundation.NSURL
import platform.Foundation.create
import platform.Foundation.writeToURL
import platform.UIKit.UIActivityViewController
import platform.UIKit.UIApplication
import platform.UIKit.popoverPresentationController
import pe.avicola2.app.application.ApiError
import pe.avicola2.app.application.FileSharer

/** Guarda el archivo en la carpeta temporal y abre la hoja «Compartir» de iOS (Archivos, Mail...). */
class IosFileSharer : FileSharer {
    @OptIn(ExperimentalForeignApi::class, BetaInteropApi::class)
    override suspend fun share(fileName: String, mimeType: String, bytes: ByteArray) {
        val url = NSURL.fileURLWithPath(NSTemporaryDirectory() + fileName.replace(Regex("[^A-Za-z0-9._-]"), "_"))
        val data = bytes.usePinned { NSData.create(bytes = it.addressOf(0), length = bytes.size.toULong()) }
        if (!data.writeToURL(url, atomically = true)) throw ApiError("No se pudo guardar el archivo.", 0)
        @Suppress("DEPRECATION")
        val root = UIApplication.sharedApplication.keyWindow?.rootViewController
            ?: throw ApiError("No se pudo abrir el menú para compartir.", 0)
        val sheet = UIActivityViewController(activityItems = listOf(url), applicationActivities = null)
        // En iPad la hoja sale como globo: necesita un punto de anclaje.
        sheet.popoverPresentationController?.sourceView = root.view
        var top = root
        while (true) top = top.presentedViewController ?: break
        top.presentViewController(sheet, animated = true, completion = null)
    }
}
