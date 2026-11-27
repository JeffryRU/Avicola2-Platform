package pe.avicola2.app.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import pe.avicola2.app.domain.ExportFormat

/**
 * Botón «Exportar» con menú de formatos (Excel, PDF, CSV), como `ExportMenu` en la web.
 * `onExport` descarga y abre «Compartir»; mientras trabaja, el botón muestra un indicador.
 */
@Composable
fun ExportMenu(onExport: suspend (ExportFormat) -> Unit, enabled: Boolean = true, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf<ExportFormat?>(null) }
    val scope = rememberCoroutineScope()
    androidx.compose.foundation.layout.Box(modifier) {
        TextButton(onClick = { open = true }, enabled = enabled && busy == null) {
            if (busy != null) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
            else Icon(Icons.Filled.Share, null, Modifier.size(18.dp))
            Text("Exportar", Modifier.padding(start = 6.dp))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            Text(
                "Exportar como",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
            )
            ExportFormat.entries.forEach { format ->
                DropdownMenuItem(
                    text = {
                        Column {
                            Text(format.label, fontWeight = FontWeight.SemiBold)
                            Text(format.hint, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    },
                    onClick = {
                        open = false
                        busy = format
                        scope.launch {
                            try {
                                onExport(format)
                            } finally {
                                busy = null
                            }
                        }
                    },
                )
            }
        }
    }
}
