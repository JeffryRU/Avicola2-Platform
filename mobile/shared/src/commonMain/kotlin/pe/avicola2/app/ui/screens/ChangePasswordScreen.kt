package pe.avicola2.app.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import pe.avicola2.app.AppContainer
import pe.avicola2.app.ui.components.Centered
import pe.avicola2.app.ui.userMessage

/** Mismas reglas que el backend: 8 a 128 caracteres, con letras y números. */
fun passwordProblem(new: String, confirm: String, current: String): String? = when {
    new.length !in 8..128 -> "La contraseña debe tener entre 8 y 128 caracteres."
    !(new.any { it.isLetter() } && new.any { it.isDigit() }) -> "La contraseña debe combinar letras y números."
    new == current -> "La nueva contraseña debe ser distinta de la actual."
    new != confirm -> "Las contraseñas no coinciden."
    else -> null
}

/**
 * Cambio de contraseña. `forced`: la cuenta tiene contraseña temporal y no puede seguir sin
 * cambiarla (solo puede cerrar sesión).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChangePasswordScreen(container: AppContainer, forced: Boolean, onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    var current by remember { mutableStateOf("") }
    var new by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun submit() {
        error = passwordProblem(new, confirm, current)
        if (error != null || busy) return
        busy = true
        scope.launch {
            try {
                container.session.changePassword(current, new)
                onDone()
            } catch (e: Exception) {
                error = e.userMessage()
            } finally {
                busy = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (forced) "Crea tu contraseña" else "Cambiar contraseña") },
                navigationIcon = {
                    if (!forced) {
                        IconButton(onClick = onDone) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Volver") }
                    }
                },
            )
        },
    ) { padding ->
        Centered(Modifier.padding(padding), maxWidth = 480) {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(20.dp)) {
                if (forced) {
                    Text(
                        "Tu cuenta tiene una contraseña temporal. Elige una nueva para continuar.",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(bottom = 12.dp),
                    )
                }
                listOf(
                    Triple("Contraseña actual", current) { v: String -> current = v },
                    Triple("Nueva contraseña", new) { v: String -> new = v },
                    Triple("Repite la nueva contraseña", confirm) { v: String -> confirm = v },
                ).forEach { (label, value, set) ->
                    OutlinedTextField(
                        value = value,
                        onValueChange = set,
                        label = { Text(label) },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    )
                }
                Text(
                    "Mínimo 8 caracteres, con letras y números.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 6.dp),
                )
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 12.dp)) }
                Button(onClick = ::submit, enabled = !busy, modifier = Modifier.fillMaxWidth().padding(top = 20.dp).height(52.dp)) {
                    if (busy) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp) else Text("Guardar contraseña")
                }
                if (forced) {
                    TextButton(onClick = { container.session.signOut() }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                        Text("Cerrar sesión")
                    }
                }
            }
        }
    }
}
