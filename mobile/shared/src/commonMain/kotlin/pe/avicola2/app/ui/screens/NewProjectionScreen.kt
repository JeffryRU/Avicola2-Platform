package pe.avicola2.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryScrollableTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.datetime.LocalDate
import pe.avicola2.app.AppContainer
import pe.avicola2.app.application.PlanningService
import pe.avicola2.app.application.SubmitOutcome
import pe.avicola2.app.domain.Account
import pe.avicola2.app.domain.Catalog
import pe.avicola2.app.domain.DayUnits
import pe.avicola2.app.domain.EditingDay
import pe.avicola2.app.domain.Product
import pe.avicola2.app.domain.Seller
import pe.avicola2.app.domain.Units
import pe.avicola2.app.domain.formatKg
import pe.avicola2.app.domain.formatNumber
import pe.avicola2.app.domain.relative
import pe.avicola2.app.domain.short
import pe.avicola2.app.domain.total
import pe.avicola2.app.ui.Load
import pe.avicola2.app.ui.components.Centered
import pe.avicola2.app.ui.components.ChoiceChip
import pe.avicola2.app.ui.components.ErrorState
import pe.avicola2.app.ui.components.Loading
import pe.avicola2.app.ui.userMessage

data class ProjectionSetup(val catalog: Catalog, val openDays: List<EditingDay>, val sellers: List<Seller>)

class NewProjectionViewModel(private val c: AppContainer, private val account: Account, start: LocalDate?) : ViewModel() {
    var setup by mutableStateOf<Load<ProjectionSetup>>(Load.Loading)
        private set
    var step by mutableStateOf(0)
    var category by mutableStateOf("")
    var dates by mutableStateOf(setOfNotNull(start))
    var onBehalf by mutableStateOf<String?>(null)
    var units by mutableStateOf<Map<LocalDate, Units>>(emptyMap())
        private set
    var activeDay by mutableStateOf(0)
    var busy by mutableStateOf(false)
        private set
    var message by mutableStateOf<String?>(null)
    var suggestionNote by mutableStateOf<String?>(null)
        private set
    var result by mutableStateOf<SubmitOutcome?>(null)
        private set

    val supervisor = account.seller.isSupervisor
    val sortedDates: List<LocalDate> get() = dates.sorted()

    init {
        load()
    }

    fun load() {
        setup = Load.Loading
        viewModelScope.launch {
            try {
                val catalog = async { Catalog(c.planningGateway.catalog()) }
                val window = async { c.planningGateway.editingWindow() }
                val sellers = async { if (supervisor) c.planningGateway.sellers().filter { !it.isSupervisor } else emptyList() }
                val open = window.await().days.filter { it.open }
                val s = ProjectionSetup(catalog.await(), open, sellers.await())
                if (category.isBlank()) category = s.catalog.categories.firstOrNull().orEmpty()
                dates = dates.filter { d -> open.any { it.date == d } }.toSet().ifEmpty { setOfNotNull(open.firstOrNull()?.date) }
                setup = Load.Ready(s)
            } catch (e: Exception) {
                setup = Load.Failed(e.userMessage())
            }
        }
    }

    fun toggleDate(date: LocalDate) {
        dates = if (date in dates) dates - date else if (dates.size < PlanningService.MAX_DAYS) dates + date else dates
    }

    /** Paso 2: trae lo ya registrado de esos días para editarlo en vez de empezar de cero. */
    fun next() {
        if (category.isBlank() || dates.isEmpty()) {
            message = "Elige la categoría y al menos un día."
            return
        }
        if (supervisor && onBehalf == null) {
            message = "Elige el vendedor."
            return
        }
        busy = true
        viewModelScope.launch {
            try {
                val seller = onBehalf ?: account.seller.username
                val existing = c.planningGateway.projections(sortedDates.first(), sortedDates.last(), seller)
                    .filter { it.confirmed && it.category == category && it.date in dates }
                units = sortedDates.associateWith { d -> existing.firstOrNull { it.date == d }?.units ?: units[d].orEmpty() }
                activeDay = 0
                step = 1
            } catch (e: Exception) {
                // Sin señal igual se puede registrar: queda en la cola del celular.
                units = sortedDates.associateWith { units[it].orEmpty() }
                step = 1
                if (e !is pe.avicola2.app.application.ApiError || !e.isNetwork) message = e.userMessage()
            } finally {
                busy = false
            }
        }
    }

    fun set(date: LocalDate, product: String, value: Int) {
        val v = value.coerceIn(0, PlanningService.MAX_UNITS)
        units = units + (date to (units[date].orEmpty() + (product to v)))
    }

    fun copyToAll(from: LocalDate) {
        val source = units[from].orEmpty()
        units = sortedDates.associateWith { source }
        message = "Copiado a los ${dates.size} días."
    }

    /** Rellena con el pronóstico del servidor (el vendedor ajusta lo que quiera). */
    fun suggest() {
        busy = true
        viewModelScope.launch {
            try {
                val first = sortedDates.first()
                val span = sortedDates.last().toEpochDays() - first.toEpochDays() + 1
                val suggestion = c.planningGateway.suggestions(category, first, span.toInt(), onBehalf)
                val products = (setup as? Load.Ready)?.value?.catalog?.of(category)?.map { it.id }?.toSet().orEmpty()
                var filled = 0
                units = sortedDates.associateWith { d ->
                    val s = suggestion.days.firstOrNull { it.date == d }?.units.orEmpty().filterKeys { it in products }
                    if (s.total() > 0) filled++
                    if (s.total() > 0) s else units[d].orEmpty()
                }
                suggestionNote = if (filled > 0) "Sugerencia según tu historial (${suggestion.method}). Revísala antes de enviar." else "Aún no hay historial suficiente para sugerir."
            } catch (e: Exception) {
                message = e.userMessage()
            } finally {
                busy = false
            }
        }
    }

    fun submit() {
        busy = true
        viewModelScope.launch {
            try {
                val days = sortedDates.map { DayUnits(it, units[it].orEmpty().filterValues { n -> n > 0 }) }
                result = c.planning.submit(account.seller.username, category, days, onBehalf)
                c.notifyChanged(pe.avicola2.app.application.ServerEvent.ProjectionsChanged)
            } catch (e: Exception) {
                message = e.userMessage()
            } finally {
                busy = false
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewProjectionScreen(container: AppContainer, account: Account, start: LocalDate?, onClose: () -> Unit) {
    val vm = viewModel { NewProjectionViewModel(container, account, start) }
    val queue by container.planning.queue.items.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (vm.step == 0) "Nueva proyección" else vm.category) },
                navigationIcon = {
                    IconButton(onClick = { if (vm.step == 1) vm.step = 0 else onClose() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Volver")
                    }
                },
            )
        },
    ) { padding ->
        Centered(Modifier.padding(padding)) {
            when (val s = vm.setup) {
                Load.Loading -> Loading()
                is Load.Failed -> ErrorState(s.message, onRetry = vm::load)
                is Load.Ready -> if (vm.step == 0) SetupStep(vm, s.value) else UnitsStep(vm, s.value.catalog)
            }
        }
    }

    vm.message?.let { msg ->
        AlertDialog(
            onDismissRequest = { vm.message = null },
            text = { Text(msg) },
            confirmButton = { TextButton(onClick = { vm.message = null }) { Text("Entendido") } },
        )
    }
    vm.result?.let { outcome ->
        AlertDialog(
            onDismissRequest = onClose,
            title = { Text(if (outcome is SubmitOutcome.Sent) "¡Proyección enviada!" else "Guardada en el celular") },
            text = {
                Text(
                    when (outcome) {
                        is SubmitOutcome.Sent -> "Se registraron ${outcome.result.days} día(s): ${formatNumber(outcome.result.totalUnits.toDouble())} unidades, ${formatKg(outcome.result.totalKg)}."
                        SubmitOutcome.Queued -> "No hay conexión. Se enviará sola cuando vuelva la señal (${queue.size} pendiente(s))."
                    },
                )
            },
            confirmButton = { TextButton(onClick = onClose) { Text("Listo") } },
        )
    }
}

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
private fun SetupStep(vm: NewProjectionViewModel, setup: ProjectionSetup) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        if (vm.supervisor) {
            Text("Vendedor", style = MaterialTheme.typography.titleSmall)
            SellerPicker(setup.sellers, vm.onBehalf) { vm.onBehalf = it }
            Spacer16()
        }
        Text("Categoría", style = MaterialTheme.typography.titleSmall)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            setup.catalog.categories.forEach { cat ->
                ChoiceChip(cat, vm.category == cat) { vm.category = cat }
            }
        }
        Spacer16()
        Text("Días (hasta ${PlanningService.MAX_DAYS})", style = MaterialTheme.typography.titleSmall)
        if (setup.openDays.isEmpty()) {
            Text(
                "No hay días abiertos para registrar ahora. Puedes pedir habilitación desde Inicio.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(vertical = 8.dp),
            )
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            setup.openDays.forEach { d ->
                ChoiceChip(d.date.relative(), d.date in vm.dates) { vm.toggleDate(d.date) }
            }
        }
        Button(
            onClick = vm::next,
            enabled = !vm.busy && vm.dates.isNotEmpty() && vm.category.isNotBlank(),
            modifier = Modifier.fillMaxWidth().padding(top = 24.dp).height(52.dp),
        ) {
            if (vm.busy) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp) else Text("Continuar")
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SellerPicker(sellers: List<Seller>, selected: String?, onSelect: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }, modifier = Modifier.padding(vertical = 8.dp)) {
        OutlinedTextField(
            value = sellers.firstOrNull { it.username == selected }?.name ?: "Elige un vendedor",
            onValueChange = {},
            readOnly = true,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(open) },
            modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
        )
        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            sellers.forEach { s ->
                DropdownMenuItem(
                    text = { Text(listOfNotNull(s.name, s.zone).joinToString(" · ")) },
                    onClick = {
                        onSelect(s.username)
                        open = false
                    },
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun UnitsStep(vm: NewProjectionViewModel, catalog: Catalog) {
    val dates = vm.sortedDates
    val day = dates.getOrElse(vm.activeDay) { dates.first() }
    val dayUnits = vm.units[day].orEmpty()
    val totalUnits = dates.sumOf { vm.units[it].orEmpty().total() }
    val totalKg = dates.sumOf { catalog.kg(vm.units[it].orEmpty()) }
    val empty = dates.filter { vm.units[it].orEmpty().total() == 0 }

    Column(Modifier.fillMaxSize().imePadding()) {
        if (dates.size > 1) {
            PrimaryScrollableTabRow(selectedTabIndex = vm.activeDay.coerceAtMost(dates.lastIndex), edgePadding = 8.dp) {
                dates.forEachIndexed { i, d ->
                    Tab(
                        selected = i == vm.activeDay,
                        onClick = { vm.activeDay = i },
                        text = {
                            val n = vm.units[d].orEmpty().total()
                            Text(if (n == 0) d.short() else "${d.short()} · $n", color = if (n == 0) MaterialTheme.colorScheme.error else androidx.compose.ui.graphics.Color.Unspecified)
                        },
                    )
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = vm::suggest, enabled = !vm.busy) { Text("Sugerir cantidades") }
            if (dates.size > 1) TextButton(onClick = { vm.copyToAll(day) }) { Text("Copiar a todos los días") }
        }
        vm.suggestionNote?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 16.dp))
        }
        LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)) {
            catalog.grouped(vm.category).forEach { (group, products) ->
                if (group != null) {
                    item(key = "g-$group") {
                        Text(group, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 12.dp, bottom = 4.dp))
                    }
                }
                items(products, key = { it.id }) { p ->
                    ProductRow(p, dayUnits[p.id] ?: 0) { vm.set(day, p.id, it) }
                    HorizontalDivider()
                }
            }
        }
        Surface(tonalElevation = 3.dp, shadowElevation = 8.dp) {
            Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp)) {
                Row(Modifier.fillMaxWidth()) {
                    Text("${dates.size} día(s) · ${formatNumber(totalUnits.toDouble())} u", Modifier.weight(1f))
                    Text(formatKg(totalKg), fontWeight = FontWeight.SemiBold)
                }
                if (empty.isNotEmpty()) {
                    Text(
                        "Falta ingresar: ${empty.joinToString { it.short() }}",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
                Button(
                    onClick = vm::submit,
                    enabled = !vm.busy && empty.isEmpty(),
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp).height(52.dp),
                ) {
                    if (vm.busy) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp) else Text("Enviar proyección")
                }
            }
        }
    }
}

/** Producto con botones − / + y el número editable (teclado numérico). */
@Composable
private fun ProductRow(product: Product, value: Int, onChange: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(product.name, style = MaterialTheme.typography.bodyLarge)
            Text(
                "${formatNumber(product.kgPerUnit, 2)} kg/u" + if (value > 0) " · ${formatKg(product.kgPerUnit * value)}" else "",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        FilledTonalIconButton(onClick = { onChange(value - 1) }, enabled = value > 0) { Text("−", style = MaterialTheme.typography.titleLarge) }
        OutlinedTextField(
            value = if (value == 0) "" else value.toString(),
            onValueChange = { t -> onChange(t.filter { it.isDigit() }.take(4).toIntOrNull() ?: 0) },
            placeholder = { Text("0", textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) },
            singleLine = true,
            textStyle = MaterialTheme.typography.bodyLarge.copy(textAlign = TextAlign.Center),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.width(84.dp).padding(horizontal = 6.dp),
        )
        FilledTonalIconButton(onClick = { onChange(value + 1) }) { Text("+", style = MaterialTheme.typography.titleLarge) }
    }
}

@Composable
private fun Spacer16() = androidx.compose.foundation.layout.Spacer(Modifier.height(16.dp))
