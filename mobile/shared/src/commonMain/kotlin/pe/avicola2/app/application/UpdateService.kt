package pe.avicola2.app.application

/** Compara la versión instalada con la última publicada en GitHub. */
class UpdateService(private val source: ReleaseSource, private val installed: String) {
    suspend fun check(): AppRelease? = source.latest()?.takeIf { isNewer(it.version, installed) }

    companion object {
        /** "v1.10.0" > "1.9.3". Ignora sufijos como "-debug". */
        fun isNewer(candidate: String, current: String): Boolean {
            val a = parse(candidate)
            val b = parse(current)
            for (i in 0 until maxOf(a.size, b.size)) {
                val x = a.getOrElse(i) { 0 }
                val y = b.getOrElse(i) { 0 }
                if (x != y) return x > y
            }
            return false
        }

        private fun parse(v: String) =
            v.trim().removePrefix("v").substringBefore('-').split('.').map { it.toIntOrNull() ?: 0 }
    }
}
