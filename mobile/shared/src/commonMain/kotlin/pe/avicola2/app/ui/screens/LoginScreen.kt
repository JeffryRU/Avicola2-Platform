package pe.avicola2.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import pe.avicola2.app.AppContainer
import pe.avicola2.app.ServerConfig
import pe.avicola2.app.ui.components.BrandMark
import pe.avicola2.app.ui.components.Centered
import pe.avicola2.app.ui.userMessage

@Composable
fun LoginScreen(container: AppContainer, reason: String?) {
    val scope = rememberCoroutineScope()
    var username by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf(reason) }
    var serverDialog by remember { mutableStateOf(false) }
    val server by container.server.url.collectAsState()

    fun submit() {
        if (busy) return
        if (username.isBlank() || password.isBlank()) {
            error = "Ingresa tu usuario y contraseña."
            return
        }
        busy = true
        error = null
        scope.launch {
            try {
                container.session.login(username, password)
            } catch (e: Exception) {
                error = e.userMessage()
            } finally {
                busy = false
            }
        }
    }

    Scaffold { padding ->
        Centered(Modifier.padding(padding), maxWidth = 440) {
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Spacer(Modifier.height(32.dp))
                BrandMark(72)
                Text("Noraves", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 16.dp))
                Text(
                    "Proyección inteligente para una mejor producción",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(32.dp))
                OutlinedTextField(
                    value = username,
                    onValueChange = { username = it },
                    label = { Text("Usuario") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii, imeAction = ImeAction.Next),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Contraseña") },
                    singleLine = true,
                    visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                    trailingIcon = {
                        TextButton(onClick = { showPassword = !showPassword }) { Text(if (showPassword) "Ocultar" else "Ver") }
                    },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { submit() }),
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                )
                error?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.fillMaxWidth().padding(top = 12.dp))
                }
                Button(onClick = ::submit, enabled = !busy, modifier = Modifier.fillMaxWidth().padding(top = 20.dp).height(52.dp)) {
                    if (busy) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp) else Text("Ingresar")
                }
                TextButton(onClick = { serverDialog = true }, modifier = Modifier.padding(top = 12.dp)) {
                    Text("Servidor: ${container.server.label(server)}", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }

    if (serverDialog) ServerDialog(container.server, server) { serverDialog = false }
}

/** Elegir servidor (producción, pruebas o una URL propia, p. ej. la PC en la misma red). */
@Composable
fun ServerDialog(config: ServerConfig, current: String, onDismiss: () -> Unit) {
    val preset = ServerConfig.Preset.entries.firstOrNull { it.url == current }
    var choice by remember { mutableStateOf(preset?.url ?: CUSTOM) }
    var custom by remember { mutableStateOf(if (preset == null) current else "https://") }
    val valid = choice != CUSTOM || custom.trim().let { it.startsWith("https://") || it.startsWith("http://") } && custom.length > 10
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Servidor") },
        text = {
            Column {
                ServerConfig.Preset.entries.forEach { p ->
                    RadioRow(p.label, choice == p.url) { choice = p.url }
                }
                RadioRow("Otro", choice == CUSTOM) { choice = CUSTOM }
                if (choice == CUSTOM) {
                    OutlinedTextField(
                        value = custom,
                        onValueChange = { custom = it },
                        label = { Text("URL de la API (termina en /api)") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        },
        confirmButton = {
            TextButton(enabled = valid, onClick = {
                config.set(if (choice == CUSTOM) custom else choice)
                onDismiss()
            }) { Text("Guardar") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@Composable
private fun RadioRow(label: String, selected: Boolean, onClick: () -> Unit) {
    androidx.compose.foundation.layout.Row(
        Modifier.fillMaxWidth().padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected = selected, onClick = onClick)
        Text(label)
    }
}

private const val CUSTOM = "custom"
