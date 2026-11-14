package pe.avicola2.app

import kotlinx.datetime.LocalDate
import pe.avicola2.app.domain.Account
import pe.avicola2.app.domain.Product
import pe.avicola2.app.domain.Seller
import pe.avicola2.app.domain.StockDay
import pe.avicola2.app.domain.StockEntry
import pe.avicola2.app.domain.StockLine
import pe.avicola2.app.domain.linesAt
import pe.avicola2.app.domain.dayMonth
import pe.avicola2.app.domain.editableStockDays
import pe.avicola2.app.domain.isEditableStockDay
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
    fun readsUnitsAsTyped() {
        assertEquals(1250, parseStockUnits("1.250"))
        assertNull(parseStockUnits(""))
    }

    private val yesterday = LocalDate(2026, 11, 9)
    private val chicaB = Product("P0101", "BRASA", "Brasa chica B", 1.3, 20, "Brasa chica", "B")
    private val stockDay = StockDay(
        today,
        listOf(
            StockLine("P0001", 100, 100.0, "Trujillo", today),
            StockLine("P0001", 30, 30.0, "Trujillo", yesterday),
            StockLine("P0101", 40, 52.0, "Trujillo", today),
            StockLine("P0006", 0, 0.0, "Trujillo", today),
            StockLine("P0001", 5, 5.0, "Piura", today),
        ),
        175, 187.0, "despacho", "2026-11-10T23:30:00Z",
    )

    @Test
    fun stockIsKeptByLocationAndLot() {
        val items = products + chicaB
        val draft = stockDraftOf(stockDay.linesAt("Trujillo"), today)
        // Un cero guardado se muestra vacío; cada lote es una celda aparte.
        assertEquals(mapOf("P0001|2026-11-10" to "100", "P0001|2026-11-09" to "30", "P0101|2026-11-10" to "40"), draft)
        assertEquals(30, pe.avicola2.app.domain.stockUnitsAt(draft, "P0001", yesterday))
        val totals = stockTotals(items, draft)
        assertEquals(170, totals.units)
        assertEquals(182.0, totals.kg)
        assertEquals(130 to 40, totals.unitsA to totals.unitsB)
        assertEquals(listOf("Trujillo", "Chiclayo", "Piura"), pe.avicola2.app.domain.stockLocations(listOf("Trujillo", "Chiclayo"), listOf(stockDay)))
        assertEquals(1, stockDay.linesAt("Piura").size)
    }

    @Test
    fun sendsOnlyCellsWithUnitsOrAZeroToLeaveARecord() {
        val draft = mapOf("P0001|2026-11-09" to "100", "P0006|2026-11-10" to "")
        assertEquals(listOf(StockEntry("P0001", 100, yesterday)), stockEntries(products, draft, today))
        assertEquals(listOf(StockEntry("P0001", 0, today)), stockEntries(products, emptyMap(), today))
    }

    @Test
    fun offersRecentLotsAndThoseThatAlreadyHaveUnits() {
        val old = LocalDate(2026, 11, 2)
        val lots = pe.avicola2.app.domain.stockLots(today, listOf(StockLine("P0001", 9, 9.0, "Trujillo", old)), back = 2)
        assertEquals(listOf(today, yesterday, LocalDate(2026, 11, 8), old), lots)
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
    fun sacaFormulaFollowsTheBusinessOrder() {
        assertEquals(
            "Pedir a granja = stock − pedidos de mañana + proyección de pasado mañana + plus. Nunca menos de 0.",
            pe.avicola2.app.domain.sacaFormula(),
        )
        assertEquals("Suavizado exponencial, vida media 3 días", pe.avicola2.app.domain.arrivalModelLabel("ewma_3"))
        assertTrue("peso de la parvada" in pe.avicola2.app.domain.arrivalModelLabel("hybrid_weight"))
    }

    @Test
    fun sacaPlusAcceptsThousandSeparatorsAndRejectsTheRest() {
        val parse = { d: Map<String, String> -> pe.avicola2.app.domain.parseSacaPlus(d) }
        assertEquals(
            mapOf("a" to 4000, "b" to 4000, "c" to 4000, "d" to 4000, "e" to 0, "f" to 100_000),
            parse(mapOf("a" to "4000", "b" to "4,000", "c" to "4 000", "d" to " 4.000 ", "e" to "0", "f" to "100000")),
        )
        for (bad in listOf("", "  ", "-5", "2.5", "2,50", "4,0000", "1e3", "abc", "100001")) {
            assertEquals(null, parse(mapOf("Brasa chica" to bad)), bad)
        }
    }

    @Test
    fun sacaDecodesTheStockOrdersProjectionPlusPayload() {
        val json = pe.avicola2.app.infrastructure.ApiJson
        val plan = json.decodeFromString<pe.avicola2.app.domain.Saca>(
            """
            {"date":"2026-11-12","orders_date":"2026-11-13","projection_date":"2026-11-14",
             "lines":[{"product_id":"p1","projected":300,"ordered":800,"demand":-100,"stock":400,"request":0,"request_kg":0.0,"expected":null,"expected_a":null}],
             "projected":300,"ordered":800,"demand":-100,"stock":400,"plus":4000,"request":0,"request_kg":0.0,
             "live_kg":0.0,"yield_factor":0.8,"method":"stock_orders_projection_plus","farm_order":3900,
             "stock_b":50,"stock_old":0,"stock_lot_days":3,"stock_date":"2026-11-12",
             "sellers_registered":2,"sellers_total":3,"orders_available":true,"forecast":null,
             "groups":[{"name":"Brasa chica","stock":400,"stock_b":50,"ordered":800,"projected":300,"plus":4000,
                        "balance":-100,"farm_order":3900,"demand":-100,"need":3900,"factor":1.0}]}
            """,
        )
        assertEquals(LocalDate(2026, 11, 13), plan.ordersDate)
        assertEquals(LocalDate(2026, 11, 14), plan.projectionDate)
        assertEquals(4000, plan.plus)
        assertEquals("stock_orders_projection_plus", plan.method)
        assertEquals(-100, plan.lines.single().demand)
        val g = plan.groups.single()
        assertEquals(listOf(400, 50, 800, 300, 4000, -100, 3900), listOf(g.stock, g.stockB, g.ordered, g.projected, g.plus, g.balance, g.farmOrder))
        assertEquals(g.stock - g.ordered + g.projected + g.plus, g.farmOrder)
    }
}
