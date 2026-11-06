package pe.avicola2.app.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import pe.avicola2.app.AppContainer
import pe.avicola2.app.BuildConfig
import pe.avicola2.app.application.AppRelease
import pe.avicola2.app.domain.Account
import pe.avicola2.app.ui.components.Centered
import pe.avicola2.app.ui.components.KeyValueRow
import pe.avicola2.app.ui.components.SectionCard
import pe.avicola2.app.ui.userMessage

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    container: AppContainer,
    account: Account,
    onChangePassword: () -> Unit,
    onUpdate: (AppRelease) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val server by container.server.url.collectAsState()
    var editName by remember { mutableStateOf(false) }
    var checking by remember { mutableStateOf(false) }
    var info by remember { mutableStateOf<String?>(null) }
    var confirmLogout by remember { mutableStateOf(false) }
    val queue by container.planning.queue.items.collectAsState()
    val pending = queue.count { it.owner == account.seller.username }

    Scaffold(topBar = { TopAppBar(title = { Text("Perfil") }) }) { padding ->
        Centered(Modifier.padding(padding), maxWidth = 560) {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
                SectionCard {
                    Text(account.seller.name, style = MaterialTheme.typography.titleLarge)
                    Text(
                        listOfNotNull(if (account.seller.isSupervisor) "Supervisor" else "Vendedor", account.seller.zone).joinToString(" · "),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    HorizontalDivider(Modifier.padding(vertical = 10.dp))
                    KeyValueRow("Usuario", account.seller.username)
                    KeyValueRow("Servidor", container.server.label(server))
                    KeyValueRow("Versión de la app", BuildConfig.VERSION_NAME)
                    TextButton(onClick = { editName = true }) { Text("Cambiar mi nombre") }
                }
                OutlinedButton(onClick = onChangePassword, modifier = Modifier.fillMaxWidth().padding(top = 16.dp)) { Text("Cambiar contraseña") }
                OutlinedButton(
                    enabled = !checking,
                    onClick = {
                        checking = true
                        scope.launch {
                            val release = container.updates.check()
                            checking = false
                            if (release != null) onUpdate(release) else info = "Tienes la última versión (${BuildConfig.VERSION_NAME})."
                        }
                    },
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                ) { Text(if (checking) "Buscando…" else "Buscar actualizaciones") }
                Button(
                    onClick = { confirmLogout = true },
                    modifier = Modifier.fillMaxWidth().padding(top = 24.dp),
                ) { Text("Cerrar sesión") }
            }
        }
    }

    if (editName) NameDialog(account.seller.name, onDismiss = { editName = false }) { name -> container.session.updateProfile(name) }
    info?.let {
        AlertDialog(onDismissRequest = { info = null }, text = { Text(it) }, confirmButton = { TextButton(onClick = { info = null }) { Text("Entendido") } })
    }
    if (confirmLogout) {
        AlertDialog(
            onDismissRequest = { confirmLogout = false },
            title = { Text("¿Cerrar sesión?") },
            text = {
                Text(
                    if (pending > 0) "Tienes $pending envío(s) sin enviar. Se quedan guardados en este celular y se enviarán cuando vuelvas a entrar."
                    else "Tendrás que ingresar tu usuario y contraseña de nuevo.",
                )
            },
            confirmButton = { TextButton(onClick = { container.session.signOut() }) { Text("Cerrar sesión") } },
            dismissButton = { TextButton(onClick = { confirmLogout = false }) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun NameDialog(current: String, onDismiss: () -> Unit, onSave: suspend (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(current) }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Tu nombre") },
        text = {
            Column {
                OutlinedTextField(value = name, onValueChange = { if (it.length <= 100) name = it }, singleLine = true, modifier = Modifier.fillMaxWidth())
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp)) }
            }
        },
        confirmButton = {
            TextButton(enabled = name.isNotBlank(), onClick = {
                scope.launch {
                    try {
                        onSave(name)
                        onDismiss()
                    } catch (e: Exception) {
                        error = e.userMessage()
                    }
                }
            }) { Text("Guardar") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}
