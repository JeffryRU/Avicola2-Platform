package pe.avicola2.app.domain

import kotlinx.datetime.LocalDate

/*
 * Datos de respaldo (los mismos de backend/config/planning_seed.yaml y de la web): solo se usan
 * mientras el servidor no responde y aún no hay nada guardado en el equipo, para que las
 * pantallas se dibujen. En cuanto llega lo del servidor, manda eso.
 */

private fun brasa(n: Int, subcategory: String, kg: Double) = Product(
    id = "P" + n.toString().padStart(4, '0'),
    category = "BRASA",
    name = "Brasa $n",
    kgPerUnit = kg,
    sortOrder = n - 1,
    subcategory = subcategory,
)

val DEFAULT_PRODUCTS: List<Product> = listOf(
    brasa(1, "Brasa chica", 1.0),
    brasa(2, "Brasa chica", 1.2),
    brasa(3, "Brasa chica", 1.3),
    brasa(4, "Brasa chica", 1.4),
    brasa(5, "Brasa chica", 1.5),
    brasa(6, "Brasa mediana", 1.6),
    brasa(7, "Brasa mediana", 1.7),
    brasa(8, "Brasa grande", 1.8),
    brasa(9, "Brasa grande", 1.9),
    brasa(10, "Brasa grande", 2.0),
    Product("P0011", "Pollo de mercado", "Pollo entero con menudencia", 2.07, 10),
    Product("P0012", "Pollo de mercado", "Pollo entero carne sin menudencia", 1.8, 11),
)

/** Artículos de calidad B, que solo aparecen en el stock. */
val DEFAULT_QUALITY_B: List<Product> = listOf(
    Product("P0101", "BRASA", "Brasa chica B", 1.3, 13, "Brasa chica", "B"),
    Product("P0102", "BRASA", "Brasa mediana B", 1.65, 14, "Brasa mediana", "B"),
    Product("P0103", "BRASA", "Brasa grande B", 1.9, 15, "Brasa grande", "B"),
    Product("P0112", "Pollo de mercado", "Pollo entero carne sin menudencia B", 1.8, 16, null, "B"),
)

val DEFAULT_STOCK_OPTIONS = StockOptions(
    items = DEFAULT_PRODUCTS + DEFAULT_QUALITY_B,
    locations = listOf("Trujillo", "Piura", "Chiclayo", "Chimbote", "San Martín"),
    lotDays = 3,
)

/** Saca en cero para dibujar la pantalla mientras el servidor no responde. */
fun emptySaca(day: LocalDate, products: List<Product>): Saca = Saca(
    date = day,
    lines = products.map { SacaLine(it.id, projected = 0, ordered = 0, demand = 0, stock = 0, request = 0, requestKg = 0.0) },
    projected = 0,
    ordered = 0,
    demand = 0,
    stock = 0,
    request = 0,
    requestKg = 0.0,
    liveKg = 0.0,
    yieldFactor = 0.75,
    sellersRegistered = 0,
    sellersTotal = 0,
    ordersAvailable = false,
    ordersDate = day.plusDays(1),
    projectionDate = day.plusDays(2),
    farmOrder = 0,
    groups = products.map { it.subcategory ?: it.category }.distinct().map { SacaGroup(it, farmOrder = 0) },
)
