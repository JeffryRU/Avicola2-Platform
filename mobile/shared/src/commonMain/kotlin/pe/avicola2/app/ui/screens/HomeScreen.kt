package pe.avicola2.app.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.datetime.LocalDate
import pe.avicola2.app.AppContainer
import pe.avicola2.app.application.AppRelease
import pe.avicola2.app.application.QueuedSubmission
import pe.avicola2.app.application.ServerEvent
import pe.avicola2.app.domain.Account
import pe.avicola2.app.domain.Catalog
import pe.avicola2.app.domain.EditingDay
import pe.avicola2.app.domain.Projection
import pe.avicola2.app.domain.Seller
import pe.avicola2.app.domain.formatKg
import pe.avicola2.app.domain.formatNumber
import pe.avicola2.app.domain.hhmm
import pe.avicola2.app.domain.parseServerTime
import pe.avicola2.app.domain.plusDays
import pe.avicola2.app.domain.relative
import pe.avicola2.app.domain.short
import pe.avicola2.app.domain.today
import pe.avicola2.app.ui.Load
import pe.avicola2.app.ui.components.Centered
import pe.avicola2.app.ui.components.ErrorState
import pe.avicola2.app.ui.components.Loading
import pe.avicola2.app.ui.components.Pill
import pe.avicola2.app.ui.components.SectionCard
import pe.avicola2.app.ui.components.Stat
import pe.avicola2.app.ui.theme.Success
import pe.avicola2.app.ui.theme.Warning
import pe.avicola2.app.ui.userMessage

data class HomeData(
    val catalog: Catalog,
    val days: List<EditingDay>,
    val projections: List<Projection>,
    val sellers: List<Seller>,
)

class HomeViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow<Load<HomeData>>(Load.Loading)
    val state: StateFlow<Load<HomeData>> = _state.asStateFlow()

    init {
        load()
        viewModelScope.launch {
            c.changes.collect { if (it != ServerEvent.Notification) load(silent = true) }
        }
    }

    fun load(silent: Boolean = false) {
        val current = _state.value
        if (!silent || current !is Load.Ready) _state.value = if (current is Load.Ready) current.copy(refreshing = true) else Load.Loading
        viewModelScope.launch {
            try {
                val catalog = async { Catalog(c.planningGateway.catalog()) }
                val window = async { c.planningGateway.editingWindow() }
                val sellers = async { c.planningGateway.sellers() }
                val days = window.await().days
                val from = days.minOfOrNull { it.date } ?: today()
                val to = days.maxOfOrNull { it.date } ?: today().plusDays(6)
                val projections = c.planningGateway.projections(from, to)
                _state.value = Load.Ready(HomeData(catalog.await(), days, projections, sellers.await()))
            } catch (e: Exception) {
                if (current is Load.Ready && silent) _state.value = current.copy(refreshing = false)
                else _state.value = Load.Failed(e.userMessage())
            }
        }
    }

    suspend fun requestUnlock(date: LocalDate, reason: String) {
        c.planningGateway.requestUnlock(date, reason)
        load(silent = true)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    container: AppContainer,
    account: Account,
    update: AppRelease?,
    onRegister: (LocalDate?) -> Unit,
    onOpenUpdate: (AppRelease) -> Unit,
) {
    val vm = viewModel { HomeViewModel(container) }
    val state by vm.state.collectAsState()
    val queue by container.planning.queue.items.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    var unlockFor by remember { mutableStateOf<LocalDate?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Hola, ${account.seller.name.substringBefore(' ')}", fontWeight = FontWeight.SemiBold)
                        Text(
                            today().short().replaceFirstChar { it.uppercase() },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                actions = { IconButton(onClick = { vm.load() }) { Icon(Icons.Filled.Refresh, "Actualizar") } },
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { onRegister(null) },
                icon = { Icon(Icons.Filled.Add, null) },
                text = { Text("Registrar proyección") },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Centered(Modifier.padding(padding)) {
            when (val s = state) {
                Load.Loading -> Loading()
                is Load.Failed -> ErrorState(s.message, onRetry = { vm.load() })
                is Load.Ready -> PullToRefreshBox(isRefreshing = s.refreshing, onRefresh = { vm.load() }) {
                    HomeContent(
                        data = s.value,
                        account = account,
                        queue = queue.filter { it.owner == account.seller.username },
                        update = update,
                        onRegister = onRegister,
                        onUnlock = { unlockFor = it },
                        onOpenUpdate = onOpenUpdate,
                        onFlush = {
                            container.notifyChanged(ServerEvent.Connected)
                        },
                    )
                }
            }
        }
    }

    unlockFor?.let { date ->
        UnlockDialog(
            date = date,
            onDismiss = { unlockFor = null },
            onSend = { reason ->
                vm.requestUnlock(date, reason)
                unlockFor = null
                snackbar.showSnackbar("Solicitud enviada. Te avisaremos cuando el supervisor responda.")
            },
        )
    }
}

@Composable
private fun HomeContent(
    data: HomeData,
    account: Account,
    queue: List<QueuedSubmission>,
    update: AppRelease?,
    onRegister: (LocalDate?) -> Unit,
    onUnlock: (LocalDate) -> Unit,
    onOpenUpdate: (AppRelease) -> Unit,
    onFlush: () -> Unit,
) {
    val me = account.seller.username
    val supervisor = account.seller.isSupervisor
    LazyColumn(
        contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 96.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (update != null) {
            item {
                SectionCard {
                    Text("Nueva versión ${update.version} disponible", fontWeight = FontWeight.SemiBold)
                    Text("Incluye mejoras y correcciones.", style = MaterialTheme.typography.bodySmall)
                    Button(onClick = { onOpenUpdate(update) }, modifier = Modifier.padding(top = 8.dp)) { Text("Actualizar") }
                }
            }
        }
        if (queue.isNotEmpty()) {
            item {
                SectionCard {
                    val rejected = queue.count { it.error != null }
                    Text(
                        "${queue.size} envío(s) guardado(s) en el celular",
                        fontWeight = FontWeight.SemiBold,
                        color = if (rejected > 0) MaterialTheme.colorScheme.error else Warning,
                    )
                    Text(
                        if (rejected > 0) "$rejected fue(ron) rechazado(s). Revísalos en Mis proyecciones."
                        else "Se enviarán solos cuando vuelva la señal.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    if (rejected < queue.size) OutlinedButton(onClick = onFlush, modifier = Modifier.padding(top = 8.dp)) { Text("Enviar ahora") }
                }
            }
        }
        if (supervisor) {
            item { TeamToday(data) }
        }
        item {
            Text(
                if (supervisor) "Días abiertos para registrar" else "Tus próximos días",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
        items(data.days, key = { it.date.toString() }) { day ->
            val mine = data.projections.filter { it.seller == me && it.date == day.date && it.confirmed }
            val pending = queue.any { q -> q.request.days.any { it.date == day.date } }
            DayCard(day, mine, pending, data.catalog, supervisor, onRegister = { onRegister(day.date) }, onUnlock = { onUnlock(day.date) })
        }
    }
}

@Composable
private fun DayCard(
    day: EditingDay,
    mine: List<Projection>,
    pending: Boolean,
    catalog: Catalog,
    supervisor: Boolean,
    onRegister: () -> Unit,
    onUnlock: () -> Unit,
) {
    val closes = parseServerTime(day.closesAt)
    SectionCard(Modifier.clickable(enabled = day.open, onClick = onRegister)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(day.date.relative(), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(
                    when {
                        day.open && closes != null -> "Puedes registrar hasta las ${closes.hhmm()}"
                        day.open -> "Abierto"
                        day.unlock?.status == "pending" -> "Cerrado · solicitud enviada"
                        else -> "Cerrado para cambios"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            when {
                supervisor -> if (day.open) Pill("Abierto", MaterialTheme.colorScheme.primary) else Pill("Cerrado", MaterialTheme.colorScheme.onSurfaceVariant)
                pending -> Pill("Pendiente de envío", Warning)
                mine.isNotEmpty() -> Pill("Registrado", Success)
                day.open -> Pill("Falta", MaterialTheme.colorScheme.primary)
                else -> Pill("Cerrado", MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (mine.isNotEmpty()) {
            HorizontalDivider(Modifier.padding(vertical = 10.dp))
            mine.forEach { p ->
                Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
                    Text(p.category, Modifier.weight(1f))
                    Text("${formatNumber(p.totalUnits.toDouble())} u · ${formatKg(catalog.kg(p.units).takeIf { it > 0 } ?: p.totalKg)}")
                }
            }
        }
        if (!supervisor && !day.open && day.unlock?.status != "pending") {
            TextButton(onClick = onUnlock, modifier = Modifier.padding(top = 4.dp)) { Text("Pedir habilitación") }
        }
    }
}

/** Supervisor: quién ya registró hoy y cuántos kg suma el equipo. */
@Composable
private fun TeamToday(data: HomeData) {
    val day = today()
    val sellers = data.sellers.filter { !it.isSupervisor }
    val todays = data.projections.filter { it.date == day && it.confirmed }
    val done = sellers.filter { s -> todays.any { it.seller == s.username } }
    SectionCard {
        Text("Equipo hoy", style = MaterialTheme.typography.titleMedium)
        Row(Modifier.fillMaxWidth().padding(vertical = 12.dp)) {
            Stat("Registraron", "${done.size} de ${sellers.size}", Modifier.weight(1f))
            Stat("Total", formatKg(todays.sumOf { it.totalKg }), Modifier.weight(1f))
        }
        sellers.forEach { s ->
            val kg = todays.filter { it.seller == s.username }.sumOf { it.totalKg }
            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(s.name)
                    s.zone?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                if (kg > 0) Pill(formatKg(kg), Success) else Pill("Falta", Warning)
            }
        }
    }
}

@Composable
private fun UnlockDialog(date: LocalDate, onDismiss: () -> Unit, onSend: suspend (String) -> Unit) {
    var reason by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var sending by remember { mutableStateOf(false) }
    var submit by remember { mutableStateOf(0) }
    LaunchedEffect(submit) {
        if (submit == 0) return@LaunchedEffect
        sending = true
        try {
            onSend(reason.trim())
        } catch (e: Exception) {
            error = e.userMessage()
        } finally {
            sending = false
        }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Pedir habilitación") },
        text = {
            Column {
                Text("El día ${date.relative()} está cerrado. Cuéntale al supervisor por qué necesitas cambiarlo.")
                OutlinedTextField(
                    value = reason,
                    onValueChange = { if (it.length <= 300) reason = it },
                    label = { Text("Motivo") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                )
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp)) }
            }
        },
        confirmButton = {
            TextButton(enabled = reason.isNotBlank() && !sending, onClick = { submit++ }) { Text("Enviar") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}
