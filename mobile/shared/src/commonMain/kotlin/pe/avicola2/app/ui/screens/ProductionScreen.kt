package pe.avicola2.app.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
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
import pe.avicola2.app.domain.Account
import pe.avicola2.app.domain.Catalog
import pe.avicola2.app.domain.Product
import pe.avicola2.app.domain.ProductionCell
import pe.avicola2.app.domain.ProductionDay
import pe.avicola2.app.domain.ProductionDraft
import pe.avicola2.app.domain.ProductionTotals
import pe.avicola2.app.domain.editableStockDays
import pe.avicola2.app.domain.formatNumber
import pe.avicola2.app.domain.invalidProductionQuality
import pe.avicola2.app.domain.isEditableStockDay
import pe.avicola2.app.domain.parseServerTime
import pe.avicola2.app.domain.plusDays
import pe.avicola2.app.domain.productionDraftOf
import pe.avicola2.app.domain.productionEntries
import pe.avicola2.app.domain.productionTotals
import pe.avicola2.app.domain.short
import pe.avicola2.app.domain.shortWithTime
import pe.avicola2.app.domain.today
import pe.avicola2.app.ui.Load
import pe.avicola2.app.ui.components.DayStrip
import pe.avicola2.app.ui.components.ErrorState
import pe.avicola2.app.ui.components.GroupHeader
import pe.avicola2.app.ui.components.Loading
import pe.avicola2.app.ui.components.Pill
import pe.avicola2.app.ui.components.SectionCard
import pe.avicola2.app.ui.theme.Success
import pe.avicola2.app.ui.theme.Warning
import pe.avicola2.app.ui.userMessage

private const val HISTORY_DAYS = 30

data class ProductionData(val products: List<Product>, val days: List<ProductionDay>)

class ProductionViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow<Load<ProductionData>>(Load.Loading)
    val state: StateFlow<Load<ProductionData>> = _state.asStateFlow()

    var day by mutableStateOf(today())
        private set
    var draft by mutableStateOf<ProductionDraft>(emptyMap())
        private set
    private var saved: ProductionDraft = emptyMap()
    var busy by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    var message by mutableStateOf<String?>(null)

    val dirty: Boolean get() = draft != saved

    init {
        load()
    }

    private val data: ProductionData? get() = (_state.value as? Load.Ready)?.value

    fun record(of: LocalDate = day): ProductionDay? = data?.days?.firstOrNull { it.date == of }

    fun load() {
        val current = _state.value
        _state.value = if (current is Load.Ready) current.copy(refreshing = true) else Load.Loading
        viewModelScope.launch {
            try {
                val catalog = async { Catalog(c.planningGateway.catalog()) }
                val days = c.production.list(today().plusDays(-(HISTORY_DAYS - 1)), today())
                _state.value = Load.Ready(ProductionData(catalog.await().products, days))
                reset()
            } catch (e: Exception) {
                _state.value = Load.Failed(e.userMessage())
            }
        }
    }

    fun select(date: LocalDate) {
        day = date
        reset()
    }

    private fun reset() {
        saved = productionDraftOf(data?.products.orEmpty(), record())
        draft = saved
        error = null
    }

    fun set(product: String, cell: ProductionCell) {
        draft = draft + (product to cell)
    }

    fun save() {
        val products = data?.products ?: return
        val bad = invalidProductionQuality(products, draft)
        if (bad.isNotEmpty()) {
            error = "La calidad B no puede superar lo producido en ${bad.joinToString { it.name }}."
            return
        }
        error = null
        busy = true
        viewModelScope.launch {
            try {
                val stored = c.production.register(day, productionEntries(products, draft))
                val days = (data?.days.orEmpty().filter { it.date != stored.date } + stored).sortedByDescending { it.date }
                _state.value = Load.Ready(ProductionData(products, days))
                reset()
                message = "Producción guardada."
            } catch (e: Exception) {
                error = e.userMessage()
            } finally {
                busy = false
            }
        }
    }
}

/**
 * Producción diaria: el jefe de despacho registra lo pedido a granja, lo que llegó y la calidad B
 * por producto; quien solo puede verla (el supervisor) la consulta.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProductionScreen(container: AppContainer, account: Account, onBack: (() -> Unit)? = null) {
    val vm = viewModel { ProductionViewModel(container) }
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(vm.message) {
        vm.message?.let {
            snackbar.showSnackbar(it)
            vm.message = null
        }
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Producción") },
                navigationIcon = {
                    if (onBack != null) IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Volver") }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        when (val s = state) {
            Load.Loading -> Loading(Modifier.padding(padding))
            is Load.Failed -> ErrorState(s.message, onRetry = vm::load, modifier = Modifier.padding(padding))
            is Load.Ready -> Content(vm, s.value, account.canManageProduction, Modifier.padding(padding))
        }
    }
}

private fun totalsOf(day: ProductionDay) = ProductionTotals(kotlin.math.round(day.ordered).toInt(), day.produced, day.qualityB)

@Composable
private fun Content(vm: ProductionViewModel, data: ProductionData, canManage: Boolean, modifier: Modifier) {
    val ref = today()
    val editable = canManage && isEditableStockDay(vm.day, ref)
    val record = vm.record()
    val strip = editableStockDays(ref).let { if (vm.day in it) it else it + vm.day }
    val totals = if (editable) productionTotals(data.products, vm.draft) else record?.let(::totalsOf)

    BoxWithConstraints(modifier.fillMaxSize().imePadding()) {
        val wide = maxWidth >= 840.dp
        Column(Modifier.fillMaxSize()) {
            DayStrip(
                days = strip,
                selected = vm.day,
                onSelect = vm::select,
                marked = data.days.map { it.date }.toSet(),
                caption = { if (it == ref) "Hoy" else if (it == ref.plusDays(-1)) "Ayer" else null },
                modifier = Modifier.padding(top = 4.dp, bottom = 10.dp),
            )
            Row(Modifier.weight(1f)) {
                LazyColumn(
                    Modifier.weight(1f),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    if (!wide && totals != null) item(key = "summary") { Summary(totals, record, vm.dirty && editable) }
                    item(key = "rows") {
                        SectionCard {
                            if (!editable && record == null) {
                                Text("Sin registro", style = MaterialTheme.typography.titleMedium)
                                Text(
                                    "Aún no se registró la producción de este día.",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(top = 4.dp),
                                )
                            } else {
                                Rows(vm, data.products, record, editable)
                            }
                        }
                    }
                    if (!wide) history(data.days, vm)
                }
                if (wide) {
                    LazyColumn(
                        Modifier.width(360.dp),
                        contentPadding = PaddingValues(end = 16.dp, bottom = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        if (totals != null) item(key = "summary") { Summary(totals, record, vm.dirty && editable) }
                        history(data.days, vm)
                    }
                }
            }
            if (editable && totals != null) SaveBar(vm, totals, update = record != null)
        }
    }
}

private fun LazyListScope.history(days: List<ProductionDay>, vm: ProductionViewModel) {
    item(key = "history-title") {
        Text("Últimos registros", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 6.dp))
    }
    if (days.isEmpty()) {
        item(key = "history-empty") {
            Text("Todavía no hay registros en los últimos 30 días.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    items(days, key = { "h-${it.date}" }) { d ->
        val selected = d.date == vm.day
        Surface(
            color = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
            shape = MaterialTheme.shapes.medium,
            modifier = Modifier.fillMaxWidth().clickable { vm.select(d.date) },
        ) {
            Row(Modifier.padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(d.date.short(), fontWeight = FontWeight.SemiBold)
                    Text(
                        "pedido ${formatNumber(d.ordered)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(formatNumber(d.produced.toDouble()), fontWeight = FontWeight.SemiBold)
                    Text(
                        "B ${formatNumber(totalsOf(d).qualityBShare * 100, 1)} %",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun Summary(totals: ProductionTotals, record: ProductionDay?, dirty: Boolean) {
    SectionCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Resumen del día", style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
            when {
                dirty -> Pill("Sin guardar", Warning)
                record != null -> Pill("Registrado", Success)
                else -> Pill("Sin registrar", MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Text(
            formatNumber(totals.produced.toDouble()),
            style = MaterialTheme.typography.displaySmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 8.dp),
        )
        Text("aves que llegaron", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        HorizontalDivider(Modifier.padding(vertical = 10.dp))
        Row(Modifier.fillMaxWidth()) {
            Figure(formatNumber(totals.ordered.toDouble()), "pedidas", Modifier.weight(1f))
            Figure(
                (if (totals.difference > 0) "+" else "") + formatNumber(totals.difference.toDouble()),
                "diferencia",
                Modifier.weight(1f),
                warn = totals.difference < 0,
            )
            Figure("${formatNumber(totals.qualityBShare * 100, 1)} %", "calidad B", Modifier.weight(1f))
        }
        record?.let { r ->
            Text(
                "Registró ${r.recordedBy}" + (parseServerTime(r.recordedAt)?.let { " · ${it.shortWithTime()}" } ?: ""),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 10.dp),
            )
        }
    }
}

@Composable
private fun Figure(value: String, label: String, modifier: Modifier = Modifier, warn: Boolean = false) {
    Column(modifier) {
        Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = if (warn) Warning else MaterialTheme.colorScheme.onSurface)
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** Por producto: el nombre arriba y debajo las tres cifras (pedido, llegó, calidad B). */
@Composable
private fun Rows(vm: ProductionViewModel, products: List<Product>, record: ProductionDay?, editable: Boolean) {
    val saved = record?.lines.orEmpty().associateBy { it.productId }
    fun cellOf(p: Product): ProductionCell =
        if (editable) vm.draft[p.id] ?: ProductionCell()
        else saved[p.id]?.let { ProductionCell(kotlin.math.round(it.ordered).toInt().toString(), it.produced.toString(), it.qualityB.toString()) } ?: ProductionCell()
    fun num(text: String) = text.toIntOrNull() ?: 0

    products.groupBy { it.subcategory }.entries.forEachIndexed { index, (group, items) ->
        val ordered = items.sumOf { num(cellOf(it).ordered) }
        val produced = items.sumOf { num(cellOf(it).produced) }
        GroupHeader(
            group ?: "Otros",
            "pedido ${formatNumber(ordered.toDouble())} · llegó ${formatNumber(produced.toDouble())}",
            Modifier.fillMaxWidth().padding(top = if (index == 0) 0.dp else 8.dp),
        )
        items.forEach { p ->
            val cell = cellOf(p)
            Column(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                Text(p.name, fontWeight = FontWeight.SemiBold)
                Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Field("Pedido", cell.ordered, editable, Modifier.weight(1f)) { vm.set(p.id, cell.copy(ordered = it)) }
                    Field("Llegó", cell.produced, editable, Modifier.weight(1f), bold = true) { vm.set(p.id, cell.copy(produced = it)) }
                    Field("Cal. B", cell.qualityB, editable, Modifier.weight(1f)) { vm.set(p.id, cell.copy(qualityB = it)) }
                }
            }
        }
    }
    if (editable) {
        Text(
            "Calidad A se calcula sola: producido menos calidad B. Lo que dejes en blanco cuenta como 0.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

@Composable
private fun Field(label: String, value: String, editable: Boolean, modifier: Modifier, bold: Boolean = false, onChange: (String) -> Unit) {
    val style = MaterialTheme.typography.bodyLarge.copy(textAlign = TextAlign.Center, fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal)
    if (editable) {
        OutlinedTextField(
            value = value,
            onValueChange = { t -> onChange(t.filter { it.isDigit() }.take(7)) },
            label = { Text(label) },
            placeholder = { Text("0", textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.outline) },
            singleLine = true,
            textStyle = style,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = modifier,
        )
    } else {
        Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
            Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                formatNumber((value.toIntOrNull() ?: 0).toDouble()),
                style = style,
                color = if ((value.toIntOrNull() ?: 0) > 0) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outline,
            )
        }
    }
}

@Composable
private fun SaveBar(vm: ProductionViewModel, totals: ProductionTotals, update: Boolean) {
    Surface(tonalElevation = 3.dp, shadowElevation = 8.dp) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp, vertical = 12.dp)) {
            vm.error?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(bottom = 8.dp))
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(formatNumber(totals.produced.toDouble()), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium, maxLines = 1)
                    Text(
                        "llegaron de ${formatNumber(totals.ordered.toDouble())}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                    )
                }
                Button(onClick = vm::save, enabled = !vm.busy, modifier = Modifier.height(50.dp)) {
                    if (vm.busy) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                    else Text(if (update) "Guardar corrección" else "Guardar")
                }
            }
        }
    }
}
