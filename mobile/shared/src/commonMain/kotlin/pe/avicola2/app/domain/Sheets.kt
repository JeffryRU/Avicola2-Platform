package pe.avicola2.app.domain

import kotlinx.datetime.LocalDate

/**
 * Hojas de registro (INS-06): registrar de nuevo un día abre una hoja nueva en blanco. Al enviarla
 * reemplaza a la anterior (vale la última; no se suman). Igual que en la web.
 */

/** La hoja vigente de cada día elegido, si ya tiene proyección de esa categoría. */
fun previousSheets(existing: List<Projection>, category: String, dates: Collection<LocalDate>): Map<LocalDate, Projection> =
    existing.filter { it.confirmed && it.category == category && it.date in dates }.associateBy { it.date }

/** "mié 11 nov: hoja 2 · jue 12 nov: hoja 3" — el número de la hoja que se está abriendo. */
fun newSheetsLabel(previous: Map<LocalDate, Projection>): String =
    previous.values.sortedBy { it.date }.joinToString(" · ") { "${it.date.short()}: hoja ${it.sheet + 1}" }

/** Copia a la hoja nueva lo de la anterior, solo en los días donde aún no se escribió nada. */
fun copyPreviousSheets(units: Map<LocalDate, Units>, previous: Map<LocalDate, Projection>): Map<LocalDate, Units> =
    units.mapValues { (date, typed) ->
        val before = previous[date]?.units
        if (before != null && typed.total() == 0) before.filterValues { it > 0 } else typed
    }
