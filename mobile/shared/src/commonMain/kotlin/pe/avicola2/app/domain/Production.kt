package pe.avicola2.app.domain

/** Lo que la persona escribe por producto (texto; vacío = 0). */
data class ProductionCell(val ordered: String = "", val produced: String = "", val qualityB: String = "")

typealias ProductionDraft = Map<String, ProductionCell>

data class ProductionTotals(val ordered: Int, val produced: Int, val qualityB: Int) {
    /** Diferencia entre lo que llegó y lo pedido. */
    val difference: Int get() = produced - ordered
    val qualityBShare: Double get() = if (produced == 0) 0.0 else qualityB.toDouble() / produced
}

private fun number(raw: String): Int = parseStockUnits(raw) ?: 0

private fun text(value: Int): String = if (value > 0) value.toString() else ""

/** Borrador a partir de lo ya registrado. Los ceros guardados se muestran vacíos. */
fun productionDraftOf(products: List<Product>, day: ProductionDay?): ProductionDraft {
    val saved = day?.lines.orEmpty().associateBy { it.productId }
    return products.associate { p ->
        val line = saved[p.id]
        p.id to if (line == null) ProductionCell()
        else ProductionCell(text(kotlin.math.round(line.ordered).toInt()), text(line.produced), text(line.qualityB))
    }
}

fun productionTotals(products: List<Product>, draft: ProductionDraft): ProductionTotals = ProductionTotals(
    ordered = products.sumOf { number(draft[it.id]?.ordered.orEmpty()) },
    produced = products.sumOf { number(draft[it.id]?.produced.orEmpty()) },
    qualityB = products.sumOf { number(draft[it.id]?.qualityB.orEmpty()) },
)

/** Productos donde la calidad B supera lo producido (no se puede guardar así). */
fun invalidProductionQuality(products: List<Product>, draft: ProductionDraft): List<Product> =
    products.filter { number(draft[it.id]?.qualityB.orEmpty()) > number(draft[it.id]?.produced.orEmpty()) }

/** Una línea por producto del catálogo: lo que queda en blanco se registra como 0. */
fun productionEntries(products: List<Product>, draft: ProductionDraft): List<ProductionEntry> = products.map { p ->
    val cell = draft[p.id] ?: ProductionCell()
    ProductionEntry(p.id, number(cell.ordered).toDouble(), number(cell.produced), number(cell.qualityB))
}
