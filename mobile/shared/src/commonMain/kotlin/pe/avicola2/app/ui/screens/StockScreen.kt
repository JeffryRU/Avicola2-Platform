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
import androidx.compose.ui.text.style.TextOverflow
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
import pe.avicola2.app.domain.StockCell
import pe.avicola2.app.domain.StockDay
import pe.avicola2.app.domain.StockDraft
import pe.avicola2.app.domain.editableStockDays
import pe.avicola2.app.domain.formatKg
import pe.avicola2.app.domain.formatNumber
import pe.avicola2.app.domain.hasInvalidStockKg
import pe.avicola2.app.domain.isEditableStockDay
import pe.avicola2.app.domain.parseServerTime
import pe.avicola2.app.domain.parseStockUnits
import pe.avicola2.app.domain.plusDays
import pe.avicola2.app.domain.short
import pe.avicola2.app.domain.shortWithTime
import pe.avicola2.app.domain.stockDraftOf
import pe.avicola2.app.domain.stockEntries
import pe.avicola2.app.domain.stockKg
import pe.avicola2.app.domain.stockTotals
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

/** Se consultan los últimos 30 días (lo mismo que la web). */
private const val HISTORY_DAYS = 30

data class StockData(val products: List<Product>, val days: List<StockDay>)

class StockViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow<Load<StockData>>(Load.Loading)
    val state: StateFlow<Load<StockData>> = _state.asStateFlow()

    var day by mutableStateOf(today())
        private set
    var draft by mutableStateOf<StockDraft>(emptyMap())
        private set
    private var saved: StockDraft = emptyMap()
    var busy by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    var message by mutableStateOf<String?>(null)

    val dirty: Boolean get() = draft != saved

    init {
        load()
    }

    private val data: StockData? get() = (_state.value as? Load.Ready)?.value

    fun record(of: LocalDate = day): StockDay? = data?.days?.firstOrNull { it.date == of }

    fun load() {
        val current = _state.value
        _state.value = if (current is Load.Ready) current.copy(refreshing = true) else Load.Loading
        viewModelScope.launch {
            try {
                val catalog = async { Catalog(c.planningGateway.catalog()) }
                val days = c.stock.list(today().plusDays(-(HISTORY_DAYS - 1)), today())
                _state.value = Load.Ready(StockData(catalog.await().products, days))
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
        saved = stockDraftOf(data?.products.orEmpty(), record())
        draft = saved
        error = null
    }

    fun set(product: String, cell: StockCell) {
        draft = draft + (product to cell)
    }

    fun save() {
        val products = data?.products ?: return
        if (hasInvalidStockKg(draft)) {
            error = "Revisa los kg: usa números con hasta dos decimales."
            return
        }
        error = null
        busy = true
        viewModelScope.launch {
            try {
                val stored = c.stock.register(day, stockEntries(products, draft))
                val days = (data?.days.orEmpty().filter { it.date != stored.date } + stored).sortedByDescending { it.date }
                _state.value = Load.Ready(StockData(products, days))
                reset()
                message = "Stock guardado."
            } catch (e: Exception) {
                error = e.userMessage()
            } finally {
                busy = false
            }
        }
    }
}

/**
 * Stock de despacho. El jefe de despacho lo registra por día (unidades y kg por producto); quien
 * solo puede verlo (el supervisor) lo consulta. `onBack` es null cuando es la pantalla de inicio.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StockScreen(container: AppContainer, account: Account, onBack: (() -> Unit)? = null) {
    val vm = viewModel { StockViewModel(container) }
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    val canManage = account.canManageStock
    LaunchedEffect(vm.message) {
        vm.message?.let {
            snackbar.showSnackbar(it)
            vm.message = null
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Stock de despacho") },
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
            is Load.Ready -> StockContent(vm, s.value, canManage, Modifier.padding(padding))
        }
    }
}

@Composable
private fun StockContent(vm: StockViewModel, data: StockData, canManage: Boolean, modifier: Modifier) {
    val ref = today()
    val editable = canManage && isEditableStockDay(vm.day, ref)
    val record = vm.record()
    val strip = editableStockDays(ref).let { if (vm.day in it) it else it + vm.day }
    val totals = if (editable) stockTotals(data.products, vm.draft) else null
    val units = totals?.units ?: record?.totalUnits ?: 0
    val kg = totals?.kg ?: record?.totalKg ?: 0.0

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
                    if (!wide) item(key = "summary") { SummaryCard(units, kg, record, vm.dirty && editable, canManage && !editable) }
                    item(key = "rows") {
                        SectionCard {
                            if (!editable && record == null) {
                                Text("Sin registro", style = MaterialTheme.typography.titleMedium)
                                Text(
                                    "Aún no se registró el stock de este día.",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(top = 4.dp),
                                )
                            } else {
                                StockRows(vm, data.products, record, editable)
                            }
                        }
                    }
                    if (!wide) historyItems(data.days, vm)
                }
                if (wide) {
                    LazyColumn(
                        Modifier.width(360.dp),
                        contentPadding = PaddingValues(end = 16.dp, bottom = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        item(key = "summary") { SummaryCard(units, kg, record, vm.dirty && editable, canManage && !editable) }
                        historyItems(data.days, vm)
                    }
                }
            }
            if (editable) SaveBar(vm, units, kg, update = record != null)
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.historyItems(days: List<StockDay>, vm: StockViewModel) {
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
                        listOfNotNull(d.recordedBy, parseServerTime(d.recordedAt)?.shortWithTime()).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(formatNumber(d.totalUnits.toDouble()), fontWeight = FontWeight.SemiBold)
                    Text(formatKg(d.totalKg), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun SummaryCard(units: Int, kg: Double, record: StockDay?, dirty: Boolean, locked: Boolean) {
    SectionCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Resumen del día", style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
            when {
                dirty -> Pill("Sin guardar", Warning)
                record != null -> Pill("Registrado", Success)
                else -> Pill("Sin registrar", MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.Bottom) {
            Column {
                Text(formatNumber(units.toDouble()), style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold)
                Text(if (units == 1) "unidad" else "unidades", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Column(Modifier.padding(start = 24.dp, bottom = 2.dp)) {
                Text(formatNumber(kg, 1), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text("kg", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        record?.let { r ->
            HorizontalDivider(Modifier.padding(vertical = 10.dp))
            Text(
                "Registró ${r.recordedBy}" + (parseServerTime(r.recordedAt)?.let { " · ${it.shortWithTime()}" } ?: ""),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (locked) {
            Text(
                "Solo se corrigen los últimos 7 días.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 6.dp),
            )
        }
    }
}

/** Filas por producto, agrupadas por tamaño. Editables para el jefe de despacho. */
@Composable
private fun StockRows(vm: StockViewModel, products: List<Product>, record: StockDay?, editable: Boolean) {
    val saved = record?.lines.orEmpty().associateBy { it.productId }
    Row(Modifier.fillMaxWidth().padding(bottom = 6.dp)) {
        Text("PRODUCTO", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
        Text("UNID.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center, modifier = Modifier.width(UNITS_WIDTH))
        Text("KG", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center, modifier = Modifier.padding(start = 8.dp).width(KG_WIDTH))
    }
    products.groupBy { it.subcategory }.forEach { (group, items) ->
        val groupUnits = items.sumOf { if (editable) parseStockUnits(vm.draft[it.id]?.units.orEmpty()) ?: 0 else saved[it.id]?.units ?: 0 }
        val groupKg = items.sumOf { if (editable) it.stockKg(vm.draft[it.id]) else saved[it.id]?.kg ?: 0.0 }
        GroupHeader(
            group ?: "Otros",
            "${formatNumber(groupUnits.toDouble())} unid. · ${formatKg(groupKg)}",
            Modifier.fillMaxWidth().padding(top = 6.dp),
        )
        items.forEach { p ->
            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(p.name, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("${formatNumber(p.kgPerUnit, 1)} kg c/u", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (editable) {
                    val cell = vm.draft[p.id] ?: StockCell()
                    val estimate = p.stockKg(cell.copy(kg = ""))
                    NumberField(cell.units, "0", KeyboardType.Number, UNITS_WIDTH, bold = true) { t ->
                        vm.set(p.id, cell.copy(units = t.filter { it.isDigit() }.take(7)))
                    }
                    NumberField(cell.kg, if (estimate > 0) formatNumber(estimate, 1) else "—", KeyboardType.Decimal, KG_WIDTH, Modifier.padding(start = 8.dp)) { t ->
                        vm.set(p.id, cell.copy(kg = t.filter { it.isDigit() || it == '.' || it == ',' }.take(11)))
                    }
                } else {
                    val line = saved[p.id]
                    val faint = MaterialTheme.colorScheme.outline
                    Text(
                        formatNumber((line?.units ?: 0).toDouble()),
                        fontWeight = FontWeight.SemiBold,
                        color = if ((line?.units ?: 0) > 0) MaterialTheme.colorScheme.onSurface else faint,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.width(UNITS_WIDTH),
                    )
                    Text(
                        line?.kg?.takeIf { it > 0 }?.let { formatNumber(it, 1) } ?: "—",
                        color = if ((line?.kg ?: 0.0) > 0) MaterialTheme.colorScheme.onSurface else faint,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(start = 8.dp).width(KG_WIDTH),
                    )
                }
            }
        }
    }
    if (editable) {
        Text(
            "Deja los kg en blanco y se calculan con el peso promedio.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

private val UNITS_WIDTH = 84.dp
private val KG_WIDTH = 96.dp

@Composable
private fun NumberField(
    value: String,
    placeholder: String,
    keyboard: KeyboardType,
    width: androidx.compose.ui.unit.Dp,
    modifier: Modifier = Modifier,
    bold: Boolean = false,
    onChange: (String) -> Unit,
) {
    val style = MaterialTheme.typography.bodyLarge.copy(textAlign = TextAlign.Center, fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal)
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        placeholder = { Text(placeholder, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.outline) },
        singleLine = true,
        textStyle = style,
        keyboardOptions = KeyboardOptions(keyboardType = keyboard),
        modifier = modifier.width(width),
    )
}

/** Total y botón siempre a la vista, sobre el teclado. */
@Composable
private fun SaveBar(vm: StockViewModel, units: Int, kg: Double, update: Boolean) {
    Surface(tonalElevation = 3.dp, shadowElevation = 8.dp) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp, vertical = 12.dp)) {
            vm.error?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(bottom = 8.dp))
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("${formatNumber(units.toDouble())} unid.", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                    Text(formatKg(kg), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Button(onClick = vm::save, enabled = !vm.busy, modifier = Modifier.height(50.dp)) {
                    if (vm.busy) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                    else Text(if (update) "Guardar corrección" else "Guardar stock")
                }
            }
        }
    }
}
