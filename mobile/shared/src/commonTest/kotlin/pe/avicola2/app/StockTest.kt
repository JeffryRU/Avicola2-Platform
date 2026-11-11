package pe.avicola2.app

import kotlinx.datetime.LocalDate
import pe.avicola2.app.domain.Account
import pe.avicola2.app.domain.Product
import pe.avicola2.app.domain.Seller
import pe.avicola2.app.domain.StockCell
import pe.avicola2.app.domain.StockDay
import pe.avicola2.app.domain.StockEntry
import pe.avicola2.app.domain.StockLine
import pe.avicola2.app.domain.dayMonth
import pe.avicola2.app.domain.editableStockDays
import pe.avicola2.app.domain.hasInvalidStockKg
import pe.avicola2.app.domain.isEditableStockDay
import pe.avicola2.app.domain.parseStockKg
import pe.avicola2.app.domain.parseStockUnits
import pe.avicola2.app.domain.sacaDays
import pe.avicola2.app.domain.stockDraftOf
import pe.avicola2.app.domain.stockEntries
import pe.avicola2.app.domain.stockTotals
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class StockTest {
    private val today = LocalDate(2026, 11, 10)
    private val products = listOf(
        Product("P0001", "BRASA", "Brasa 1", 1.0, 1, "Brasa chica"),
        Product("P0006", "BRASA", "Brasa 6", 1.6, 6, "Brasa mediana"),
    )

    @Test
    fun onlyTodayAndTheLastSevenDaysAreEditable() {
        assertEquals(8, editableStockDays(today).size)
        assertEquals(today, editableStockDays(today).first())
        assertTrue(isEditableStockDay(LocalDate(2026, 11, 3), today))
        assertFalse(isEditableStockDay(LocalDate(2026, 11, 2), today))
        assertFalse(isEditableStockDay(LocalDate(2026, 11, 11), today))
    }

    @Test
    fun sacaGoesFromYesterdayToAWeekAhead() {
        val days = sacaDays(today)
        assertEquals(9, days.size)
        assertEquals(LocalDate(2026, 11, 9), days.first())
        assertEquals(LocalDate(2026, 11, 17), days.last())
        assertEquals("09/11", days.first().dayMonth())
    }

    @Test
    fun readsUnitsAndKgAsTyped() {
        assertEquals(1250, parseStockUnits("1.250"))
        assertNull(parseStockUnits(""))
        assertEquals(118.4, parseStockKg("118,4"))
        assertEquals(64.25, parseStockKg("64.25"))
        assertNull(parseStockKg(""))
        assertNull(parseStockKg("12.345"))
        assertNull(parseStockKg("1.2.3"))
        assertTrue(hasInvalidStockKg(mapOf("P0001" to StockCell("1", "1.234"))))
        assertFalse(hasInvalidStockKg(mapOf("P0001" to StockCell("1", ""))))
    }

    @Test
    fun withoutKgUsesTheAverageWeightAndBlankCountsAsZero() {
        val draft = mapOf("P0001" to StockCell("120", "118,4"), "P0006" to StockCell("40", ""))
        val totals = stockTotals(products, draft)
        assertEquals(160, totals.units)
        assertEquals(182.4, totals.kg)
        assertEquals(
            listOf(StockEntry("P0001", 120, 118.4), StockEntry("P0006", 40, null)),
            stockEntries(products, draft),
        )
        assertEquals(
            listOf(StockEntry("P0001", 0, null), StockEntry("P0006", 0, null)),
            stockEntries(products, stockDraftOf(products, null)),
        )
    }

    @Test
    fun loadsWhatWasRegisteredAndShowsSavedZerosAsBlank() {
        val day = StockDay(today, listOf(StockLine("P0001", 5, 4.9), StockLine("P0006", 0, 0.0)), 5, 4.9, "despacho", "2026-11-10T23:30:00Z")
        assertEquals(
            mapOf("P0001" to StockCell("5", "4.9"), "P0006" to StockCell("", "")),
            stockDraftOf(products, day),
        )
        // Un kg entero se muestra sin ".0".
        assertEquals("64", stockDraftOf(products, day.copy(lines = listOf(StockLine("P0006", 40, 64.0))))["P0006"]?.kg)
    }

    @Test
    fun permissionsComeFromTheBackendOrFallBackToTheRole() {
        fun account(role: String, vararg permissions: String) = Account(Seller("u", "U", null, role), false, permissions.toList())
        val chief = account("dispatch_chief", "view_stock", "manage_stock")
        assertTrue(chief.stockOnly && chief.canManageStock && !chief.canViewSaca)
        assertEquals("Jefe de despacho", chief.seller.roleLabel)
        assertFalse(chief.seller.isSupervisor)

        val supervisor = account("supervisor", "view_team", "view_stock", "view_saca")
        assertTrue(supervisor.canViewStock && supervisor.canViewSaca)
        assertFalse(supervisor.canManageStock || supervisor.stockOnly)

        val seller = account("seller")
        assertFalse(seller.canViewStock || seller.canViewSaca || seller.stockOnly)
        // Cuenta guardada antes de existir los permisos: se deduce del rol.
        assertTrue(account("dispatch_chief").stockOnly)
        assertTrue(account("general_supervisor").canManageStock)
    }
}
