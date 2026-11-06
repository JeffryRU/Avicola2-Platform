package pe.avicola2.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** Azul de Noraves (el mismo `--primary` de la web). */
val BrandBlue = Color(0xFF1570EF)
val Success = Color(0xFF12B76A)
val Warning = Color(0xFFF79009)

private val Light: ColorScheme = lightColorScheme(
    primary = BrandBlue,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD1E3FF),
    onPrimaryContainer = Color(0xFF0B3A82),
    secondary = Color(0xFF475467),
    secondaryContainer = Color(0xFFEAECF0),
    onSecondaryContainer = Color(0xFF1D2939),
    background = Color(0xFFF8FAFC),
    surface = Color.White,
    surfaceVariant = Color(0xFFF2F4F7),
    onSurfaceVariant = Color(0xFF475467),
    outline = Color(0xFFD0D5DD),
    outlineVariant = Color(0xFFEAECF0),
    error = Color(0xFFD92D20),
    // Superficies neutras (sin el tinte lila por defecto de Material 3).
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFF9FAFB),
    surfaceContainer = Color(0xFFF2F4F7),
    surfaceContainerHigh = Color(0xFFEAECF0),
    surfaceContainerHighest = Color(0xFFE4E7EC),
    surfaceTint = BrandBlue,
)

private val Dark: ColorScheme = darkColorScheme(
    primary = Color(0xFF84B4FF),
    onPrimary = Color(0xFF00285F),
    primaryContainer = Color(0xFF0B3A82),
    onPrimaryContainer = Color(0xFFD1E3FF),
    secondary = Color(0xFFD0D5DD),
    secondaryContainer = Color(0xFF344054),
    onSecondaryContainer = Color(0xFFF2F4F7),
    background = Color(0xFF0C111D),
    surface = Color(0xFF161B26),
    surfaceVariant = Color(0xFF1F242F),
    onSurfaceVariant = Color(0xFF94969C),
    outline = Color(0xFF333741),
    outlineVariant = Color(0xFF1F242F),
    error = Color(0xFFF97066),
    surfaceContainerLowest = Color(0xFF0C111D),
    surfaceContainerLow = Color(0xFF131824),
    surfaceContainer = Color(0xFF161B26),
    surfaceContainerHigh = Color(0xFF1F242F),
    surfaceContainerHighest = Color(0xFF292E3A),
    surfaceTint = Color(0xFF84B4FF),
)

@Composable
fun AppTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (dark) Dark else Light,
        shapes = Shapes(
            small = RoundedCornerShape(10.dp),
            medium = RoundedCornerShape(14.dp),
            large = RoundedCornerShape(20.dp),
        ),
        content = content,
    )
}
