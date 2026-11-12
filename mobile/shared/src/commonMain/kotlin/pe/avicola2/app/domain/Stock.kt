package pe.avicola2.app.domain

import kotlin.math.round
import kotlinx.datetime.LocalDate

/** Días hacia atrás que se pueden registrar o corregir (igual que el backend y la web). */
const val STOCK_BACK_DAYS = 7
private const val MAX_UNITS = 1_000_000

/** Hoy y los 7 días anteriores, del más reciente al más antiguo. Nunca un día futuro. */
fun editableStockDays(ref: LocalDate = today()): List<LocalDate> = (0..STOCK_BACK_DAYS).map { ref.plusDays(-it) }

fun isEditableStockDay(day: LocalDate, ref: LocalDate = today()): Boolean = day in editableStockDays(ref)

/** Días del cálculo de saca que se pueden consultar: desde ayer hasta una semana adelante (por defecto, hoy). */
fun sacaDays(ref: LocalDate = today()): List<LocalDate> = (-1..7).map { ref.plusDays(it) }

/** Lo escrito en el formulario: «producto|lote» → unidades (texto, para no pelear con el teclado). */
typealias StockDraft = Map<String, String>

fun stockKey(productId: String, lot: LocalDate): String = "$productId|$lot"

data class StockTotals(val units: Int, val kg: Double, val unitsA: Int = units, val unitsB: Int = 0)

private fun round2(value: Double): Double = round(value * 100) / 100

/** Unidades: solo dígitos. Vacío = sin dato. */
fun parseStockUnits(raw: String): Int? =
    raw.filter { it.isDigit() }.take(7).toIntOrNull()?.coerceAtMost(MAX_UNITS)

/** Tipo de un artículo: su tamaño (Brasa chica…) o, si no tiene, su categoría. */
val Product.stockType: String get() = subcategory ?: category

/** Líneas del día en una ubicación. */
fun StockDay?.linesAt(location: String): List<StockLine> = this?.lines.orEmpty().filter { it.location == location }

/** Ubicaciones a ofrecer: las configuradas y cualquiera que ya tenga stock registrado. */
fun stockLocations(configured: List<String>, days: List<StockDay>): List<String> =
    (configured + days.flatMap { d -> d.lines.map { it.location } }).distinct()

/** Lotes que se ofrecen para un día: el propio día y los anteriores, más los que ya tienen cantidades. */
fun stockLots(day: LocalDate, lines: List<StockLine>, back: Int = 4): List<LocalDate> =
    ((0..back).map { day.plusDays(-it) } + lines.filter { it.units > 0 }.mapNotNull { it.lotDate }).distinct().sortedDescending()

/** Borrador a partir de lo registrado en una ubicación. Un cero guardado se muestra vacío. */
fun stockDraftOf(lines: List<StockLine>, day: LocalDate): StockDraft =
    lines.filter { it.units > 0 }
        .groupBy { stockKey(it.productId, it.lotDate ?: day) }
        .mapValues { (_, same) -> same.sumOf { it.units }.toString() }

fun stockUnitsAt(draft: StockDraft, productId: String, lot: LocalDate): Int =
    parseStockUnits(draft[stockKey(productId, lot)].orEmpty()) ?: 0

fun Product.stockKg(units: Int): Double = round2(units * kgPerUnit)

/** Totales de lo escrito (todos los lotes), con calidad A y B por separado. */
fun stockTotals(items: List<Product>, draft: StockDraft): StockTotals {
    val byId = items.associateBy { it.id }
    var units = 0
    var kg = 0.0
    var b = 0
    draft.forEach { (key, raw) ->
        val product = byId[key.substringBefore('|')] ?: return@forEach
        val n = parseStockUnits(raw) ?: 0
        units += n
        kg += n * product.kgPerUnit
        if (product.quality == "B") b += n
    }
    return StockTotals(units, round2(kg), units - b, b)
}

/** Lo que se guarda: una línea por celda con cantidad. Sin ninguna, un cero para dejar constancia. */
fun stockEntries(items: List<Product>, draft: StockDraft, day: LocalDate): List<StockEntry> {
    val ids = items.map { it.id }.toSet()
    val entries = draft.mapNotNull { (key, raw) ->
        val units = parseStockUnits(raw) ?: 0
        val productId = key.substringBefore('|')
        if (units > 0 && productId in ids) StockEntry(productId, units, LocalDate.parse(key.substringAfter('|'))) else null
    }
    return entries.ifEmpty { items.take(1).map { StockEntry(it.id, 0, day) } }
}
