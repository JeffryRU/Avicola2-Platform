package pe.avicola2.app

import kotlinx.datetime.LocalDate
import pe.avicola2.app.application.UpdateService
import pe.avicola2.app.domain.Catalog
import pe.avicola2.app.domain.Product
import pe.avicola2.app.domain.formatKg
import pe.avicola2.app.domain.formatNumber
import pe.avicola2.app.domain.plus
import pe.avicola2.app.domain.relative
import pe.avicola2.app.domain.short
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class DomainTest {
    private val catalog = Catalog(
        listOf(
            Product("b2", "Brasa", "Mediana", 2.2, 2, "Brasa mediana"),
            Product("b1", "Brasa", "Chica", 1.8, 1, "Brasa chica"),
            Product("e1", "Entero", "Entero", 2.5, 1),
        ),
    )

    @Test
    fun catalogSortsGroupsAndComputesKg() {
        assertEquals(listOf("Brasa", "Entero"), catalog.categories)
        assertEquals(listOf("b1", "b2"), catalog.of("Brasa").map { it.id })
        assertEquals(listOf("Brasa chica", "Brasa mediana"), catalog.grouped("Brasa").map { it.first })
        assertEquals(1.8 * 10 + 2.5 * 2, catalog.kg(mapOf("b1" to 10, "e1" to 2, "desconocido" to 5)), 1e-9)
    }

    @Test
    fun unitsAdd() {
        assertEquals(mapOf("a" to 3, "b" to 2), mapOf("a" to 1) + mapOf("a" to 2, "b" to 2))
    }

    @Test
    fun formatsPeruvianNumbers() {
        assertEquals("1 234,5 kg", formatKg(1234.54))
        assertEquals("0,0 kg", formatKg(0.0))
        assertEquals("12 000", formatNumber(12000.0))
        assertEquals("-3,5", formatNumber(-3.5, 1))
    }

    @Test
    fun formatsDates() {
        val ref = LocalDate(2026, 11, 5)
        assertEquals("jue 5 nov", ref.short())
        assertEquals("Hoy", ref.relative(ref))
        assertEquals("Mañana", LocalDate(2026, 11, 6).relative(ref))
        assertEquals("sáb 7 nov", LocalDate(2026, 11, 7).relative(ref))
    }

    @Test
    fun comparesVersions() {
        assertTrue(UpdateService.isNewer("v1.10.0", "1.9.3"))
        assertTrue(UpdateService.isNewer("0.2.0", "0.1.0-debug"))
        assertFalse(UpdateService.isNewer("v0.1.0", "0.1.0"))
        assertFalse(UpdateService.isNewer("0.9", "1.0.0"))
    }
}
