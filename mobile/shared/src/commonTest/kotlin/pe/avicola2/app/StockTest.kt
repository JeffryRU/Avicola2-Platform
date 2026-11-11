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
        assertFalse(chief.canManageProduction) // el backend no se lo dio en esta sesión
        assertTrue(account("dispatch_chief").canManageProduction) // sin permisos guardados: por rol
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

    @Test
    fun productionTotalsAndValidation() {
        val draft = mapOf(
            "P0001" to pe.avicola2.app.domain.ProductionCell("4050", "1174", "120"),
            "P0006" to pe.avicola2.app.domain.ProductionCell("", "1668", "400"),
        )
        val totals = pe.avicola2.app.domain.productionTotals(products, draft)
        assertEquals(Triple(4050, 2842, 520), Triple(totals.ordered, totals.produced, totals.qualityB))
        assertEquals(-1208, totals.difference)
        assertEquals(520.0 / 2842, totals.qualityBShare, 1e-9)
        assertEquals(
            listOf(
                pe.avicola2.app.domain.ProductionEntry("P0001", 4050.0, 1174, 120),
                pe.avicola2.app.domain.ProductionEntry("P0006", 0.0, 1668, 400),
            ),
            pe.avicola2.app.domain.productionEntries(products, draft),
        )
        assertTrue(pe.avicola2.app.domain.invalidProductionQuality(products, draft).isEmpty())
        val bad = draft + ("P0006" to pe.avicola2.app.domain.ProductionCell("", "10", "11"))
        assertEquals(listOf("Brasa 6"), pe.avicola2.app.domain.invalidProductionQuality(products, bad).map { it.name })
    }

    @Test
    fun productionDraftShowsSavedZerosAsBlank() {
        val day = pe.avicola2.app.domain.ProductionDay(
            today,
            listOf(pe.avicola2.app.domain.ProductionLine("P0001", 4050.0, 1174, 1174, 0)),
            4050.0, 1174, 0, "despacho", "2026-11-10T23:30:00Z",
        )
        assertEquals(
            mapOf(
                "P0001" to pe.avicola2.app.domain.ProductionCell("4050", "1174", ""),
                "P0006" to pe.avicola2.app.domain.ProductionCell(),
            ),
            pe.avicola2.app.domain.productionDraftOf(products, day),
        )
    }

    @Test
    fun flockWeightsAcceptCommaOrDotAndSkipBlanks() {
        assertEquals(mapOf("Brasa chica" to "1.72", "Brasa grande" to ""), pe.avicola2.app.domain.flockWeightDraftOf(listOf("Brasa chica", "Brasa grande"), mapOf("Brasa chica" to 1.72)))
        assertEquals(2.33, pe.avicola2.app.domain.parseFlockKg("2,33"))
        assertEquals(null, pe.avicola2.app.domain.parseFlockKg("abc"))
        assertEquals(mapOf("a" to 1.72, "c" to 2.45), pe.avicola2.app.domain.flockWeights(mapOf("a" to "1,72", "b" to "", "c" to "2.45")))
        assertEquals(listOf("a", "b"), pe.avicola2.app.domain.invalidFlockWeights(mapOf("a" to "0.2", "b" to "9", "c" to "2.4", "d" to "")))
        assertEquals("2.345", pe.avicola2.app.domain.cleanFlockKg("2.345"))
        assertEquals(null, pe.avicola2.app.domain.cleanFlockKg("12"))
        assertEquals(null, pe.avicola2.app.domain.cleanFlockKg("2.3456"))
    }

    @Test
    fun deviationIsWhatArrivedMinusWhatWasOrdered() {
        assertEquals("+1 668", pe.avicola2.app.domain.deviationText(0, 1668))
        assertEquals("-2 876", pe.avicola2.app.domain.deviationText(4050, 1174))
        assertEquals("0", pe.avicola2.app.domain.deviationText(10, 10))
    }

    @Test
    fun sacaMethodDefaultsToTheBusinessRule() {
        assertEquals("sum", pe.avicola2.app.domain.sacaMethodOf(null))
        assertEquals("sum", pe.avicola2.app.domain.sacaMethodOf("otra"))
        assertEquals("max", pe.avicola2.app.domain.sacaMethodOf("max"))
        assertTrue("proyección + pedidos" in pe.avicola2.app.domain.sacaFormula("sum"))
        assertTrue("el mayor" in pe.avicola2.app.domain.sacaFormula("max"))
        assertEquals("Suavizado exponencial, vida media 3 días", pe.avicola2.app.domain.arrivalModelLabel("ewma_3"))
        assertTrue("peso de la parvada" in pe.avicola2.app.domain.arrivalModelLabel("hybrid_weight"))
    }

    @Test
    fun sacaFactorsAcceptCommaOrDotAndRejectTheRest() {
        assertEquals(mapOf("Brasa chica" to 0.8, "Brasa grande" to 1.0), pe.avicola2.app.domain.parseSacaFactors(mapOf("Brasa chica" to "0,8", "Brasa grande" to "1")))
        assertEquals(null, pe.avicola2.app.domain.parseSacaFactors(mapOf("Brasa chica" to "")))
        assertEquals(null, pe.avicola2.app.domain.parseSacaFactors(mapOf("Brasa chica" to "2.5")))
    }
}
