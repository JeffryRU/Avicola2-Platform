package pe.avicola2.app.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Warning
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextButton
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
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
import pe.avicola2.app.application.ServerEvent
import pe.avicola2.app.domain.Account
import pe.avicola2.app.domain.Catalog
import pe.avicola2.app.domain.Product
import pe.avicola2.app.domain.arrivalModelLabel
import pe.avicola2.app.domain.parseSacaPlus
import pe.avicola2.app.domain.sacaFormula
import pe.avicola2.app.domain.SacaGroup
import pe.avicola2.app.domain.Saca
import pe.avicola2.app.domain.SacaLine
import pe.avicola2.app.domain.formatKg
import pe.avicola2.app.domain.formatNumber
import pe.avicola2.app.domain.plusDays
import pe.avicola2.app.domain.sacaDays
import pe.avicola2.app.domain.short
import pe.avicola2.app.domain.today
import pe.avicola2.app.ui.Load
import pe.avicola2.app.ui.components.DayStrip
import pe.avicola2.app.ui.components.ErrorState
import pe.avicola2.app.ui.components.GroupHeader
import pe.avicola2.app.ui.components.Loading
import pe.avicola2.app.ui.components.SectionCard
import pe.avicola2.app.ui.theme.Success
import pe.avicola2.app.ui.theme.Warning
import pe.avicola2.app.ui.userMessage

data class SacaData(val products: List<Product>, val plan: Saca)

class SacaViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow<Load<SacaData>>(Load.Loading)
    val state: StateFlow<Load<SacaData>> = _state.asStateFlow()

    /** Día del cálculo; por defecto, hoy (resta los pedidos de mañana y suma la proyección de pasado mañana). */
    var day by mutableStateOf(today())
        private set

    init {
        load()
        // Si un vendedor registra o corrige, el pedido cambia.
        viewModelScope.launch { c.changes.collect { if (it == ServerEvent.ProjectionsChanged) load() } }
    }

    fun select(date: LocalDate) {
        day = date
        _state.value = Load.Loading
        load()
    }

    /** Edición del plus por tipo (supervisores): null = cerrada. */
    var plusDraft by mutableStateOf<Map<String, String>?>(null)
        private set
    var plusError by mutableStateOf<String?>(null)
        private set
    var savingPlus by mutableStateOf(false)
        private set

    fun editPlus(plan: Saca) {
        plusError = null
        plusDraft = plan.groups.associate { it.name to it.plus.toString() }
    }

    fun setPlus(name: String, raw: String) {
        plusDraft = plusDraft?.plus(name to raw.filter { it.isDigit() || it in " ,." }.take(9))
    }

    fun closePlus() {
        plusDraft = null
        plusError = null
    }

    fun savePlus() {
        val plus = plusDraft?.let(::parseSacaPlus)
        if (plus == null) {
            plusError = "Escribe un número entero entre 0 y 100 000 en cada tipo (por ejemplo 4000)."
            return
        }
        plusError = null
        savingPlus = true
        viewModelScope.launch {
            try {
                c.saca.setPlus(plus)
                plusDraft = null
                load()
            } catch (e: Exception) {
                plusError = e.userMessage()
            } finally {
                savingPlus = false
            }
        }
    }

    fun load() {
        val current = _state.value
        if (current is Load.Ready) _state.value = current.copy(refreshing = true)
        val asked = day
        viewModelScope.launch {
            try {
                val catalog = async { Catalog(c.planningGateway.catalog()) }
                val plan = c.saca.plan(asked)
                // Si cambió de día mientras llegaba la respuesta, se descarta.
                if (asked == day) _state.value = Load.Ready(SacaData(catalog.await().products, plan))
            } catch (e: Exception) {
                if (asked == day) _state.value = Load.Failed(e.userMessage())
            }
        }
    }
}

/** Supervisor: cuánto pedir a granja para un día, por producto, y con qué datos se calculó. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SacaScreen(container: AppContainer, account: Account, onOpenStock: () -> Unit) {
    val vm = viewModel { SacaViewModel(container) }
    val state by vm.state.collectAsState()
    val ref = today()

    Scaffold(topBar = { TopAppBar(title = { Text("Cálculo de saca") }) }) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            Text(
                "DÍA DEL CÁLCULO",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 16.dp, top = 4.dp),
            )
            DayStrip(
                days = sacaDays(ref),
                selected = vm.day,
                onSelect = vm::select,
                caption = { if (it == ref) "Hoy" else if (it == ref.plusDays(1)) "Mañana" else null },
                modifier = Modifier.padding(top = 4.dp, bottom = 10.dp),
            )
            when (val s = state) {
                Load.Loading -> Loading()
                is Load.Failed -> ErrorState(s.message, onRetry = vm::load)
                is Load.Ready -> PullToRefreshBox(isRefreshing = s.refreshing, onRefresh = vm::load) {
                    SacaContent(s.value, onOpenStock.takeIf { account.canViewStock }, vm.takeIf { account.canEditSacaPlus })
                }
            }
        }
    }
}

@Composable
private fun SacaContent(data: SacaData, onOpenStock: (() -> Unit)?, editor: SacaViewModel?) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val wide = maxWidth >= 840.dp
        Row(Modifier.fillMaxSize()) {
            LazyColumn(
                Modifier.weight(1f),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item(key = "hero") { Hero(data.plan) }
                if (data.plan.groups.isNotEmpty()) item(key = "types") { ByType(data.plan, editor) }
                if (!wide) item(key = "sources") { Sources(data.plan, onOpenStock) }
                item(key = "products") { ByProduct(data) }
            }
            if (wide) {
                LazyColumn(Modifier.width(360.dp), contentPadding = PaddingValues(end = 16.dp, bottom = 16.dp)) {
                    item(key = "sources") { Sources(data.plan, onOpenStock) }
                }
            }
        }
    }
}

/** El número que importa, grande; lo demás, al lado. */
@Composable
private fun Hero(plan: Saca) {
    val scheme = MaterialTheme.colorScheme
    Surface(color = scheme.primary, contentColor = scheme.onPrimary, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp)) {
            Text(
                "PEDIDO FINAL A GRANJA · CÁLCULO DEL ${plan.date.short().uppercase()}",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = scheme.onPrimary.copy(alpha = 0.8f),
            )
            Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.Bottom) {
                Text(formatNumber((plan.farmOrder ?: plan.request).toDouble()), style = MaterialTheme.typography.displayLarge, fontWeight = FontWeight.Bold)
                Text("aves", style = MaterialTheme.typography.titleMedium, color = scheme.onPrimary.copy(alpha = 0.85f), modifier = Modifier.padding(start = 8.dp, bottom = 10.dp))
            }
            Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                HeroStat(formatNumber(plan.request.toDouble()), "aves según los productos")
                HeroStat(formatNumber(plan.requestKg, 1), "kg de producto")
                HeroStat(formatNumber(plan.liveKg, 1), "kg vivos")
            }
        }
    }
}

private val TYPE_COLUMNS = listOf("Stock", "− Pedidos", "+ Proyección", "+ Plus", "= Pedir")

/** Pedido a granja por tipo, en el orden de la regla: stock − pedidos + proyección + plus = pedir. */
@Composable
private fun ByType(plan: Saca, editor: SacaViewModel?) {
    val draft = editor?.plusDraft
    SectionCard {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Pedido a granja por tipo", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            if (editor != null && draft == null) {
                IconButton(onClick = { editor.editPlus(plan) }, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.Filled.Edit, "Cambiar el plus de cada tipo", modifier = Modifier.size(20.dp))
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 4.dp)) {
            TypeCell("Tipo", header = true, first = true)
            TYPE_COLUMNS.forEach { TypeCell(it, header = true) }
        }
        HorizontalDivider()
        plan.groups.forEach { g -> TypeRow(g, draft?.get(g.name), editor) }
        HorizontalDivider()
        Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            TypeCell("Total", bold = true, first = true)
            TypeCell(formatNumber(plan.groups.sumOf { it.stock }.toDouble()), bold = true)
            TypeCell("−" + formatNumber(plan.groups.sumOf { it.ordered }.toDouble()), bold = true)
            TypeCell("+" + formatNumber(plan.groups.sumOf { it.projected }.toDouble()), bold = true)
            TypeCell("+" + formatNumber(plan.groups.sumOf { it.plus }.toDouble()), bold = true)
            TypeCell(formatNumber((plan.farmOrder ?: plan.groups.sumOf { it.farmOrder }).toDouble()), bold = true, accent = true)
        }
        if (editor != null && draft != null) {
            editor.plusError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = editor::closePlus) { Text("Cancelar") }
                TextButton(onClick = editor::savePlus, enabled = !editor.savingPlus) { Text("Guardar") }
            }
        }
        Text(
            sacaFormula(),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 6.dp),
        )
    }
}

@Composable
private fun TypeRow(g: SacaGroup, draft: String?, editor: SacaViewModel?) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1.4f)) {
            Text(g.name, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (g.stockB > 0) {
                Text("incl. ${formatNumber(g.stockB.toDouble())} en B", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        TypeCell(formatNumber(g.stock.toDouble()))
        TypeCell("−" + formatNumber(g.ordered.toDouble()))
        TypeCell("+" + formatNumber(g.projected.toDouble()))
        if (draft != null && editor != null) {
            OutlinedTextField(
                value = draft,
                onValueChange = { editor.setPlus(g.name, it) },
                singleLine = true,
                textStyle = MaterialTheme.typography.bodySmall,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.weight(1f).padding(horizontal = 2.dp),
            )
        } else {
            TypeCell("+" + formatNumber(g.plus.toDouble()))
        }
        TypeCell(formatNumber(g.farmOrder.toDouble()), bold = true, accent = g.farmOrder > 0)
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.TypeCell(
    text: String,
    header: Boolean = false,
    bold: Boolean = false,
    accent: Boolean = false,
    first: Boolean = false,
) {
    Text(
        text,
        style = if (header) MaterialTheme.typography.labelSmall else MaterialTheme.typography.bodySmall,
        fontWeight = if (bold) FontWeight.Bold else null,
        color = when {
            header -> MaterialTheme.colorScheme.onSurfaceVariant
            accent -> MaterialTheme.colorScheme.primary
            else -> MaterialTheme.colorScheme.onSurface
        },
        textAlign = if (first) TextAlign.Start else TextAlign.End,
        maxLines = 2,
        modifier = Modifier.weight(if (first) 1.4f else 1f),
    )
}

@Composable
private fun HeroStat(value: String, label: String) {
    Column {
        Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.8f))
    }
}

/** Qué entró al cálculo y qué falta. */
@Composable
private fun Sources(plan: Saca, onOpenStock: (() -> Unit)?) {
    SectionCard {
        Text("Con qué datos se calculó", style = MaterialTheme.typography.titleMedium)
        val missing = plan.missingSellers
        SourceRow(
            ok = missing == 0,
            label = "Proyecciones" + (plan.projectionDate?.let { " del ${it.short()}" } ?: ""),
            value = "${plan.sellersRegistered} de ${plan.sellersTotal}",
            note = when (missing) {
                0 -> "Registraron todos los vendedores."
                1 -> "Falta 1 vendedor: el pedido puede quedar corto."
                else -> "Faltan $missing vendedores: el pedido puede quedar corto."
            },
        ) {
            LinearProgressIndicator(
                progress = { if (plan.sellersTotal == 0) 0f else plan.sellersRegistered.toFloat() / plan.sellersTotal },
                color = if (missing == 0) Success else Warning,
                trackColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                drawStopIndicator = {},
                gapSize = 0.dp,
                modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
            )
        }
        HorizontalDivider()
        SourceRow(
            ok = plan.stockDate != null,
            label = plan.stockDate?.let { "Stock al ${it.short()}" } ?: "Stock de despacho",
            value = plan.stockDate?.let { "${formatNumber(plan.stock.toDouble())} unid." },
            note = if (plan.stockDate != null) "Último registro de despacho (hasta el día del cálculo)." else "Sin registro de stock entre anteayer y hoy: se toma como 0.",
        ) {
            if (onOpenStock != null) {
                Text(
                    "Ver stock",
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(top = 2.dp).clickable(role = Role.Button, onClick = onOpenStock).padding(vertical = 6.dp),
                )
            }
        }
        HorizontalDivider()
        SourceRow(
            ok = if (plan.ordersAvailable) true else null,
            label = "Pedidos" + (plan.ordersDate?.let { " del ${it.short()}" } ?: " de mañana"),
            value = if (plan.ordersAvailable) "${formatNumber(plan.ordered.toDouble())} unid." else null,
            note = if (plan.ordersAvailable) "Pedidos de ARIS cargados para mañana (pollo entero para brasa)." else "No hay pedidos de ARIS cargados para mañana: se toman como 0.",
        )
        HorizontalDivider()
        SourceRow(
            ok = if (plan.forecast != null) true else null,
            label = "Llegada estimada por rango",
            value = null,
            note = plan.forecast?.let { "Con ${it.days} días de producción, del ${it.dateFrom.short()} al ${it.dateTo.short()}. Modelo en uso: ${arrivalModelLabel(it.method)}." }
                ?: "Sin historia de producción suficiente (mínimo 14 días registrados).",
        )
    }
}

/** `ok`: true = bien, false = atención, null = no aplica todavía. */
@Composable
private fun SourceRow(ok: Boolean?, label: String, value: String?, note: String?, extra: @Composable () -> Unit = {}) {
    val color = when (ok) {
        true -> Success
        false -> Warning
        null -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    val icon: ImageVector = when (ok) {
        true -> Icons.Filled.Check
        false -> Icons.Filled.Warning
        null -> Icons.Filled.Info
    }
    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp)) {
        Surface(color = color.copy(alpha = 0.14f), shape = CircleShape, modifier = Modifier.padding(top = 2.dp).size(28.dp)) {
            Icon(icon, null, tint = color, modifier = Modifier.padding(6.dp))
        }
        Column(Modifier.padding(start = 12.dp).weight(1f)) {
            Row {
                Text(label, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                value?.let { Text(it, fontWeight = FontWeight.SemiBold) }
            }
            note?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            extra()
        }
    }
}

@Composable
private fun ByProduct(data: SacaData) {
    val plan = data.plan
    SectionCard {
        Text("Por producto", style = MaterialTheme.typography.titleMedium)
        if (plan.lines.all { it.stock == 0 && it.ordered == 0 && it.projected == 0 } && plan.plus == 0) {
            Text(
                "No hay stock, pedidos de mañana, proyecciones de pasado mañana ni plus para este cálculo.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 6.dp),
            )
            return@SectionCard
        }
        val lines = plan.lines.associateBy { it.productId }
        val max = plan.lines.maxOfOrNull { it.request }?.coerceAtLeast(1) ?: 1
        data.products.groupBy { it.subcategory }.forEach { (group, items) ->
            val request = items.sumOf { lines[it.id]?.request ?: 0 }
            GroupHeader(group ?: "Otros", "${formatNumber(request.toDouble())} resultado", Modifier.fillMaxWidth().padding(top = 8.dp))
            items.forEach { p -> lines[p.id]?.let { ProductLine(p, it, max) } }
        }
        Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = MaterialTheme.shapes.small, modifier = Modifier.fillMaxWidth().padding(top = 10.dp)) {
            Row(Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
                Text("Total", fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Text("${formatNumber(plan.request.toDouble())} · ${formatKg(plan.requestKg)}", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun ProductLine(product: Product, line: SacaLine, max: Int) {
    val idle = line.demand == 0 && line.stock == 0 && line.ordered == 0 && line.projected == 0 && (line.expected ?: 0) == 0
    Row(
        Modifier.fillMaxWidth().padding(vertical = 8.dp).alpha(if (idle) 0.45f else 1f),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(product.name, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            line.expected?.let { expected ->
                Text(
                    "Llegarán ${formatNumber(expected.toDouble())}" +
                        (line.expectedA?.let { a -> " · A ${formatNumber(a.toDouble())} · B ${formatNumber((expected - a).coerceAtLeast(0).toDouble())}" } ?: ""),
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                    color = if (expected > 0) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outline,
                )
            }
            Text(
                "Stock ${formatNumber(line.stock.toDouble())} − ped. ${formatNumber(line.ordered.toDouble())} + proy. ${formatNumber(line.projected.toDouble())} = ${formatNumber(line.demand.toDouble())}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Column(Modifier.width(110.dp), horizontalAlignment = Alignment.End) {
            Text(
                formatNumber(line.request.toDouble()),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = if (line.request > 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
            )
            LinearProgressIndicator(
                progress = { line.request.toFloat() / max },
                trackColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                drawStopIndicator = {},
                gapSize = 0.dp,
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
            )
            if (line.request > 0) {
                Text(formatKg(line.requestKg), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
