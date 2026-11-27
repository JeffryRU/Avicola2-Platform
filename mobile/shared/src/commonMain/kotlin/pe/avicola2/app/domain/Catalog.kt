package pe.avicola2.app.domain

import kotlin.math.roundToLong

/** Catálogo indexado: los kg siempre salen del peso por unidad de cada producto. */
class Catalog(products: List<Product>) {
    val products: List<Product> = products.sortedWith(compareBy({ it.category }, { it.sortOrder }))
    private val byId = this.products.associateBy { it.id }

    val categories: List<String> get() = products.map { it.category }.distinct()

    fun of(category: String): List<Product> = products.filter { it.category == category }

    /** Productos de la categoría agrupados por subcategoría (null = sin grupo), en orden. */
    fun grouped(category: String): List<Pair<String?, List<Product>>> =
        of(category).groupBy { it.subcategory }.toList()

    fun product(id: String): Product? = byId[id]

    fun kg(units: Units): Double = units.entries.sumOf { (id, n) -> (byId[id]?.kgPerUnit ?: 0.0) * n }

    companion object {
        val EMPTY = Catalog(emptyList())
    }
}

fun Units.total(): Int = values.sum()

/** Suma dos conjuntos de unidades producto por producto. */
operator fun Units.plus(other: Units): Units =
    (keys + other.keys).associateWith { (this[it] ?: 0) + (other[it] ?: 0) }

/** "1 234,5 kg" con una cifra decimal (formato peruano). */
fun formatKg(kg: Double): String = "${formatNumber(kg, 1)} kg"

fun formatNumber(value: Double, decimals: Int = 0): String {
    var factor = 1L
    repeat(decimals) { factor *= 10 }
    val scaled = (kotlin.math.abs(value) * factor).roundToLong()
    val whole = (scaled / factor).toString().reversed().chunked(3).joinToString(" ").reversed()
    val sign = if (value < 0 && scaled != 0L) "-" else ""
    if (decimals == 0) return sign + whole
    val fraction = (scaled % factor).toString().padStart(decimals, '0')
    return "$sign$whole,$fraction"
}
