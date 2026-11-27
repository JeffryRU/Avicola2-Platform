package pe.avicola2.app

import kotlinx.datetime.LocalDate
import pe.avicola2.app.domain.Unlock
import pe.avicola2.app.ui.screens.activeGrants
import kotlin.test.Test
import kotlin.test.assertEquals

class HomeLogicTest {
    private fun unlock(id: Int, seller: String, day: Int, status: String) =
        Unlock(id, seller, LocalDate(2026, 11, day), "x", status, "2026-11-05T10:00:00-05:00")

    @Test
    fun soloCuentaLaUltimaHabilitacionDeCadaDia() {
        val grants = activeGrants(
            listOf(
                unlock(1, "rnavarro", 6, "approved"),
                unlock(2, "rnavarro", 6, "closed"), // la cerró después
                unlock(3, "hdias", 6, "approved"),
                unlock(4, "gfernandez", 4, "approved"), // ya pasó
                unlock(5, "mcordova", 7, "requested"),
            ),
            from = LocalDate(2026, 11, 6),
        )
        assertEquals(setOf("hdias"), grants)
    }
}
