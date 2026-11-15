package pe.avicola2.app

import kotlinx.coroutines.test.runTest
import kotlinx.datetime.LocalDate
import pe.avicola2.app.application.ApiError
import pe.avicola2.app.application.MasterDataCache
import pe.avicola2.app.domain.DEFAULT_PRODUCTS
import pe.avicola2.app.domain.DEFAULT_STOCK_OPTIONS
import pe.avicola2.app.domain.Product
import pe.avicola2.app.domain.StockOptions
import pe.avicola2.app.domain.emptySaca
import pe.avicola2.app.domain.plusDays
import pe.avicola2.app.ui.Load
import pe.avicola2.app.ui.failed
import pe.avicola2.app.ui.placeholder
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/** Sin servidor las pantallas se dibujan con datos en cero y lo último guardado en el equipo. */
class OfflineTest {
    private val day = LocalDate(2026, 11, 15)

    @Test
    fun sinNadaGuardadoSeUsaElRespaldo() {
        val cache = MasterDataCache(MemoryStore())
        assertEquals(DEFAULT_PRODUCTS, cache.products())
        assertEquals(DEFAULT_STOCK_OPTIONS, cache.stockOptions())
        assertEquals(10, DEFAULT_PRODUCTS.count { it.name.startsWith("Brasa") })
    }

    @Test
    fun loQueLlegaDelServidorSeGuardaYSeUsaDespues() = runTest {
        val store = MemoryStore()
        val server = listOf(Product("X1", "BRASA", "Brasa nueva", 1.5, 0, "Brasa chica"))
        MasterDataCache(store).fetchProducts { server }
        MasterDataCache(store).fetchStockOptions { StockOptions(server, listOf("Lima"), 2) }
        val again = MasterDataCache(store)
        assertEquals(server, again.products())
        assertEquals(listOf("Lima"), again.stockOptions().locations)
    }

    @Test
    fun siElServidorFallaNoSeBorraLoGuardado() = runTest {
        val store = MemoryStore()
        val cache = MasterDataCache(store)
        val server = DEFAULT_PRODUCTS.take(2)
        cache.fetchProducts { server }
        assertFailsWith<ApiError> { cache.fetchProducts { throw ApiError("Sin conexión", 0) } }
        assertEquals(server, cache.products())
    }

    @Test
    fun laSacaVaciaTieneLosTiposEnCero() {
        val s = emptySaca(day, DEFAULT_PRODUCTS)
        assertEquals(DEFAULT_PRODUCTS.size, s.lines.size)
        assertEquals(listOf("Brasa chica", "Brasa mediana", "Brasa grande", "Pollo de mercado"), s.groups.map { it.name })
        assertTrue(s.groups.all { it.farmOrder == 0 })
        assertEquals(day.plusDays(1), s.ordersDate)
        assertEquals(day.plusDays(2), s.projectionDate)
    }

    @Test
    fun unaFallaConservaLoQueSeVe() {
        val shown: Load.Ready<Int> = placeholder(0)
        assertTrue(shown.pending && shown.refreshing)
        val down = shown.failed("El servidor no respondió")
        assertEquals(0, down.value)
        assertEquals("El servidor no respondió", down.offline)
        assertTrue(down.pending && !down.refreshing)
    }
}
