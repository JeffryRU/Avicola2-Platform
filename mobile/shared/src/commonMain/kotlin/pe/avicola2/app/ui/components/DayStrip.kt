package pe.avicola2.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.datetime.LocalDate
import pe.avicola2.app.domain.dayMonth
import pe.avicola2.app.domain.short
import pe.avicola2.app.domain.weekdayShort
import pe.avicola2.app.ui.theme.Success

/**
 * Selector de día en tira (el mismo de la web): se ve el rango de un vistazo y se cambia con
 * un toque. `marked` pone un punto en los días con registro.
 */
@Composable
fun DayStrip(
    days: List<LocalDate>,
    selected: LocalDate,
    onSelect: (LocalDate) -> Unit,
    modifier: Modifier = Modifier,
    marked: Set<LocalDate> = emptySet(),
    caption: (LocalDate) -> String? = { null },
) {
    LazyRow(
        modifier = modifier,
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(days, key = { it.toString() }) { day ->
            val active = day == selected
            val note = caption(day)
            val scheme = MaterialTheme.colorScheme
            Surface(
                onClick = { onSelect(day) },
                shape = MaterialTheme.shapes.medium,
                color = if (active) scheme.primary else scheme.surface,
                contentColor = if (active) scheme.onPrimary else scheme.onSurface,
                border = if (active) null else BorderStroke(1.dp, scheme.outline),
                modifier = Modifier.semantics {
                    role = Role.Tab
                    this.selected = active
                    contentDescription = listOfNotNull(note, day.short(), "con registro".takeIf { day in marked }).joinToString(", ")
                },
            ) {
                Column(
                    Modifier.widthIn(min = 64.dp).padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        (note ?: day.weekdayShort()).uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = when {
                            active -> scheme.onPrimary.copy(alpha = 0.85f)
                            note != null -> scheme.primary
                            else -> scheme.onSurfaceVariant
                        },
                    )
                    Text(day.dayMonth(), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Box(
                        Modifier.padding(top = 4.dp).size(6.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (day in marked) Surface(color = if (active) scheme.onPrimary else Success, shape = CircleShape, modifier = Modifier.size(6.dp)) {}
                        else Surface(color = Color.Transparent, modifier = Modifier.size(6.dp)) {}
                    }
                }
            }
        }
    }
}

/** Cabecera de grupo (Brasa chica...) con su subtotal a la derecha. */
@Composable
fun GroupHeader(name: String, trailing: String, modifier: Modifier = Modifier) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainer, shape = MaterialTheme.shapes.small, modifier = modifier) {
        androidx.compose.foundation.layout.Row(
            Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                name.uppercase(),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            Text(trailing, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
