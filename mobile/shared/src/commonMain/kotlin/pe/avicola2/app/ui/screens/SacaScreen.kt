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
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.ExperimentalMaterial3Api
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

    /** Por defecto, mañana: la saca se decide el día anterior. */
    var day by mutableStateOf(today().plusDays(1))
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
                    SacaContent(s.value, onOpenStock.takeIf { account.canViewStock })
                }
            }
        }
    }
}

@Composable
private fun SacaContent(data: SacaData, onOpenStock: (() -> Unit)?) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val wide = maxWidth >= 840.dp
        Row(Modifier.fillMaxSize()) {
            LazyColumn(
                Modifier.weight(1f),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item(key = "hero") { Hero(data.plan) }
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
                "PEDIR A GRANJA · ${plan.date.short().uppercase()}",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = scheme.onPrimary.copy(alpha = 0.8f),
            )
            Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.Bottom) {
                Text(formatNumber(plan.request.toDouble()), style = MaterialTheme.typography.displayLarge, fontWeight = FontWeight.Bold)
                Text("aves", style = MaterialTheme.typography.titleMedium, color = scheme.onPrimary.copy(alpha = 0.85f), modifier = Modifier.padding(start = 8.dp, bottom = 10.dp))
            }
            Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                HeroStat(formatNumber(plan.requestKg, 1), "kg de producto")
                HeroStat(formatNumber(plan.liveKg, 1), "kg vivos · rend. ${formatNumber(plan.yieldFactor * 100)} %")
            }
        }
    }
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
            label = "Proyecciones",
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
            label = "Stock de despacho",
            value = plan.stockDate?.let { "${formatNumber(plan.stock.toDouble())} unid." },
            note = plan.stockDate?.let { "Registro del ${it.short()}." } ?: "Sin registro en los 3 días anteriores: no se descuenta nada.",
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
            label = "Pedidos confirmados",
            value = if (plan.ordersAvailable) "${formatNumber(plan.ordered.toDouble())} unid." else null,
            note = if (plan.ordersAvailable) "Conectados." else "Sin conectar (ARIS aún no se integra): se usan solo las proyecciones.",
        )
        HorizontalDivider()
        SourceRow(
            ok = if (plan.forecast != null) true else null,
            label = "Llegada estimada por rango",
            value = null,
            note = plan.forecast?.let { "Con ${it.days} días de producción, del ${it.dateFrom.short()} al ${it.dateTo.short()}." }
                ?: "Sin historia de producción suficiente (mínimo 14 días registrados).",
        )
        Text(
            "Pedir = el mayor entre proyección y pedidos confirmados, menos el stock. Nunca menos de 0.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 10.dp),
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
        if (plan.sellersRegistered == 0) {
            Text(
                "Nadie registró proyecciones para este día.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 6.dp),
            )
            return@SectionCard
        }
        val lines = plan.lines.associateBy { it.productId }
        val max = plan.lines.maxOfOrNull { it.request }?.coerceAtLeast(1) ?: 1
        data.products.groupBy { it.subcategory }.forEach { (group, items) ->
            val request = items.sumOf { lines[it.id]?.request ?: 0 }
            GroupHeader(group ?: "Otros", "${formatNumber(request.toDouble())} a pedir", Modifier.fillMaxWidth().padding(top = 8.dp))
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
    val idle = line.demand == 0 && line.stock == 0 && (line.expected ?: 0) == 0
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
                "${formatNumber(line.demand.toDouble())} proy." + if (line.stock > 0) " − ${formatNumber(line.stock.toDouble())} stock" else "",
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
