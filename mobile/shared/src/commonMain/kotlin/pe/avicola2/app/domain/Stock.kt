package pe.avicola2.app.domain

import kotlin.math.round
import kotlinx.datetime.LocalDate

/** Días hacia atrás que se pueden registrar o corregir (igual que el backend y la web). */
const val STOCK_BACK_DAYS = 7
private const val MAX_UNITS = 1_000_000

/** Hoy y los 7 días anteriores, del más reciente al más antiguo. Nunca un día futuro. */
fun editableStockDays(ref: LocalDate = today()): List<LocalDate> = (0..STOCK_BACK_DAYS).map { ref.plusDays(-it) }

fun isEditableStockDay(day: LocalDate, ref: LocalDate = today()): Boolean = day in editableStockDays(ref)

/** Días que se consultan para la saca: desde ayer hasta una semana adelante. */
fun sacaDays(ref: LocalDate = today()): List<LocalDate> = (-1..7).map { ref.plusDays(it) }

/** Lo que la persona escribe en una fila (texto, para no pelear con el teclado). */
data class StockCell(val units: String = "", val kg: String = "")

typealias StockDraft = Map<String, StockCell>

data class StockTotals(val units: Int, val kg: Double)

private fun round2(value: Double): Double = round(value * 100) / 100

/** Unidades: solo dígitos. Vacío = sin dato. */
fun parseStockUnits(raw: String): Int? =
    raw.filter { it.isDigit() }.take(7).toIntOrNull()?.coerceAtMost(MAX_UNITS)

/** Kg con hasta dos decimales; acepta coma o punto. Vacío o inválido = sin dato. */
fun parseStockKg(raw: String): Double? {
    val text = raw.trim().replace(',', '.')
    val parts = text.split('.')
    val valid = text.isNotEmpty() && parts.size <= 2 && parts[0].length in 1..8 &&
        parts.all { part -> part.all { it.isDigit() } } && (parts.getOrNull(1)?.length ?: 0) <= 2
    return if (valid) text.toDoubleOrNull() else null
}

/** Borrador a partir de lo ya registrado. Un cero guardado se muestra vacío. */
fun stockDraftOf(products: List<Product>, day: StockDay?): StockDraft {
    val saved = day?.lines.orEmpty().associateBy { it.productId }
    return products.associate { p ->
        val line = saved[p.id]
        p.id to StockCell(
            units = line?.units?.takeIf { it > 0 }?.toString().orEmpty(),
            kg = line?.kg?.takeIf { it > 0 }?.let(::kgText).orEmpty(),
        )
    }
}

/** "118.4" o "64" (sin ceros de más), como se escribe en la celda. */
private fun kgText(kg: Double): String {
    val text = round2(kg).toString()
    return if (text.endsWith(".0")) text.dropLast(2) else text
}

/** Kg de una fila: lo escrito o, si falta, unidades por el peso promedio. */
fun Product.stockKg(cell: StockCell?): Double =
    parseStockKg(cell?.kg.orEmpty()) ?: round2((parseStockUnits(cell?.units.orEmpty()) ?: 0) * kgPerUnit)

fun stockTotals(products: List<Product>, draft: StockDraft): StockTotals = StockTotals(
    units = products.sumOf { parseStockUnits(draft[it.id]?.units.orEmpty()) ?: 0 },
    kg = round2(products.sumOf { it.stockKg(draft[it.id]) }),
)

/** ¿Hay algún kg escrito que no sea un número válido? */
fun hasInvalidStockKg(draft: StockDraft): Boolean =
    draft.values.any { it.kg.isNotBlank() && parseStockKg(it.kg) == null }

/** Una línea por producto del catálogo: lo que queda en blanco se registra como 0. */
fun stockEntries(products: List<Product>, draft: StockDraft): List<StockEntry> = products.map { p ->
    val cell = draft[p.id]
    StockEntry(p.id, parseStockUnits(cell?.units.orEmpty()) ?: 0, parseStockKg(cell?.kg.orEmpty()))
}
