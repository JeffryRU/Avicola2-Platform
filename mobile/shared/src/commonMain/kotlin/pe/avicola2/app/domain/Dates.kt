package pe.avicola2.app.domain

import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.datetime.DatePeriod
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.todayIn

/** La operación es en Perú: "hoy" y las horas de corte se ven en hora de Lima. */
val BusinessZone: TimeZone = TimeZone.of("America/Lima")

fun today(clock: Clock = Clock.System): LocalDate = clock.todayIn(BusinessZone)

fun LocalDate.plusDays(days: Int): LocalDate = plus(DatePeriod(days = days))

private val WEEKDAYS = mapOf(
    DayOfWeek.MONDAY to "lun", DayOfWeek.TUESDAY to "mar", DayOfWeek.WEDNESDAY to "mié",
    DayOfWeek.THURSDAY to "jue", DayOfWeek.FRIDAY to "vie", DayOfWeek.SATURDAY to "sáb",
    DayOfWeek.SUNDAY to "dom",
)
private val MONTHS = listOf("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")

/** "lun 5 nov" */
fun LocalDate.short(): String = "${WEEKDAYS.getValue(dayOfWeek)} $day ${MONTHS[month.ordinal]}"

/** "mié" */
fun LocalDate.weekdayShort(): String = WEEKDAYS.getValue(dayOfWeek)

/** "11/11" */
fun LocalDate.dayMonth(): String =
    "${day.toString().padStart(2, '0')}/${(month.ordinal + 1).toString().padStart(2, '0')}"

/** "Hoy", "Mañana" o "lun 5 nov". */
fun LocalDate.relative(ref: LocalDate = today()): String = when (this) {
    ref -> "Hoy"
    ref.plusDays(1) -> "Mañana"
    else -> short()
}

/** Fecha y hora ISO del servidor (con zona) en hora de Lima; null si no se puede leer. */
fun parseServerTime(value: String): LocalDateTime? =
    runCatching { Instant.parse(value) }.getOrNull()?.toLocalDateTime(BusinessZone)

/** "18:00" */
fun LocalDateTime.hhmm(): String = "${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}"

/** "lun 5 nov, 18:00" */
fun LocalDateTime.shortWithTime(): String = "${date.short()}, ${hhmm()}"
