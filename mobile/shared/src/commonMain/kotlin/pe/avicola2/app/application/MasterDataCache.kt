package pe.avicola2.app.application

import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import pe.avicola2.app.domain.DEFAULT_PRODUCTS
import pe.avicola2.app.domain.DEFAULT_STOCK_OPTIONS
import pe.avicola2.app.domain.Product
import pe.avicola2.app.domain.StockOptions

/**
 * Último catálogo y opciones de stock recibidos, guardados en el equipo: sin servidor, las
 * pantallas se dibujan con esto (o con el respaldo de fábrica si nunca llegó nada).
 */
class MasterDataCache(private val store: KeyValueStore) {
    private val json = Json { ignoreUnknownKeys = true }
    private val products = ListSerializer(Product.serializer())

    fun products(): List<Product> = read(CATALOG, products) ?: DEFAULT_PRODUCTS

    fun stockOptions(): StockOptions = read(STOCK_OPTIONS, StockOptions.serializer()) ?: DEFAULT_STOCK_OPTIONS

    /** Pide el catálogo al servidor y lo guarda. */
    suspend fun fetchProducts(fetch: suspend () -> List<Product>): List<Product> =
        fetch().also { write(CATALOG, products, it) }

    suspend fun fetchStockOptions(fetch: suspend () -> StockOptions): StockOptions =
        fetch().also { write(STOCK_OPTIONS, StockOptions.serializer(), it) }

    private fun <T> read(key: String, serializer: KSerializer<T>): T? =
        store.getString(key)?.let { runCatching { json.decodeFromString(serializer, it) }.getOrNull() }

    private fun <T> write(key: String, serializer: KSerializer<T>, value: T) =
        store.putString(key, json.encodeToString(serializer, value))

    private companion object {
        const val CATALOG = "cache.catalog"
        const val STOCK_OPTIONS = "cache.stock_options"
    }
}
