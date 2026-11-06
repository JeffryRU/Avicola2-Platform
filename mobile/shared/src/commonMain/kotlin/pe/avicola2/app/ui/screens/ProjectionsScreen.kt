package pe.avicola2.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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
import pe.avicola2.app.AppContainer
import pe.avicola2.app.application.QueuedSubmission
import pe.avicola2.app.application.ServerEvent
import pe.avicola2.app.domain.Account
import pe.avicola2.app.domain.Catalog
import pe.avicola2.app.domain.Projection
import pe.avicola2.app.domain.Seller
import pe.avicola2.app.domain.formatKg
import pe.avicola2.app.domain.formatNumber
import pe.avicola2.app.domain.parseServerTime
import pe.avicola2.app.domain.plusDays
import pe.avicola2.app.domain.relative
import pe.avicola2.app.domain.shortWithTime
import pe.avicola2.app.domain.today
import pe.avicola2.app.domain.total
import pe.avicola2.app.ui.Load
import pe.avicola2.app.ui.components.Centered
import pe.avicola2.app.ui.components.ChoiceChip
import pe.avicola2.app.ui.components.EmptyState
import pe.avicola2.app.ui.components.ErrorState
import pe.avicola2.app.ui.components.Loading
import pe.avicola2.app.ui.components.Pill
import pe.avicola2.app.ui.components.SectionCard
import pe.avicola2.app.ui.theme.Success
import pe.avicola2.app.ui.theme.Warning
import pe.avicola2.app.ui.userMessage

data class ProjectionsData(val catalog: Catalog, val projections: List<Projection>, val sellers: List<Seller>)

class ProjectionsViewModel(private val c: AppContainer, private val account: Account) : ViewModel() {
    private val _state = MutableStateFlow<Load<ProjectionsData>>(Load.Loading)
    val state: StateFlow<Load<ProjectionsData>> = _state.asStateFlow()
    private val _seller = MutableStateFlow<String?>(null)
    val seller: StateFlow<String?> = _seller.asStateFlow()

    init {
        load()
        viewModelScope.launch { c.changes.collect { if (it == ServerEvent.ProjectionsChanged) load() } }
    }

    fun filter(seller: String?) {
        _seller.value = seller
        load()
    }

    fun load() {
        val current = _state.value
        _state.value = if (current is Load.Ready) current.copy(refreshing = true) else Load.Loading
        viewModelScope.launch {
            try {
                val catalog = async { Catalog(c.planningGateway.catalog()) }
                val sellers = async { if (account.seller.isSupervisor) c.planningGateway.sellers() else emptyList() }
                // Dos semanas atrás y una adelante: lo que un vendedor revisa en el día a día.
                val list = c.planningGateway.projections(today().plusDays(-14), today().plusDays(7), _seller.value)
                    .filter { it.confirmed }
                    .sortedWith(compareByDescending<Projection> { it.date }.thenBy { it.seller })
                _state.value = Load.Ready(ProjectionsData(catalog.await(), list, sellers.await()))
            } catch (e: Exception) {
                _state.value = Load.Failed(e.userMessage())
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProjectionsScreen(container: AppContainer, account: Account) {
    val vm = viewModel { ProjectionsViewModel(container, account) }
    val state by vm.state.collectAsState()
    val seller by vm.seller.collectAsState()
    val queue by container.planning.queue.items.collectAsState()
    val mine = queue.filter { it.owner == account.seller.username }
    val supervisor = account.seller.isSupervisor

    Scaffold(topBar = { TopAppBar(title = { Text(if (supervisor) "Proyecciones" else "Mis proyecciones") }) }) { padding ->
        Centered(Modifier.padding(padding)) {
            when (val s = state) {
                Load.Loading -> Loading()
                is Load.Failed -> ErrorState(s.message, onRetry = vm::load)
                is Load.Ready -> PullToRefreshBox(isRefreshing = s.refreshing, onRefresh = vm::load) {
                    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (supervisor) {
                            item {
                                androidx.compose.foundation.lazy.LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    item { ChoiceChip("Todos", seller == null) { vm.filter(null) } }
                                    items(s.value.sellers.filter { !it.isSupervisor }, key = { it.username }) { v ->
                                        ChoiceChip(v.name, seller == v.username) { vm.filter(v.username) }
                                    }
                                }
                            }
                        }
                        if (mine.isNotEmpty()) {
                            item { Text("En el celular", style = MaterialTheme.typography.titleMedium) }
                            items(mine, key = { it.request.submissionId }) { q -> QueuedCard(q, s.value.catalog, container) }
                            item { Text("En el servidor", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
                        }
                        if (s.value.projections.isEmpty()) {
                            item { EmptyState("Sin proyecciones", "Aquí verás lo registrado en las últimas dos semanas.") }
                        }
                        items(s.value.projections, key = { it.id }) { p ->
                            ProjectionCard(p, s.value.catalog, s.value.sellers.firstOrNull { it.username == p.seller }?.name.takeIf { supervisor })
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ProjectionCard(p: Projection, catalog: Catalog, sellerName: String?) {
    SectionCard {
        Row(Modifier.fillMaxWidth()) {
            Column(Modifier.weight(1f)) {
                Text("${p.date.relative()} · ${p.category}", fontWeight = FontWeight.SemiBold)
                sellerName?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            }
            Pill("Enviada", Success)
        }
        Text(
            "${formatNumber(p.totalUnits.toDouble())} unidades · ${formatKg(p.totalKg)}",
            modifier = Modifier.padding(top = 6.dp),
        )
        val detail = p.units.filterValues { it > 0 }.entries.joinToString(" · ") { (id, n) -> "${catalog.product(id)?.name ?: id}: $n" }
        if (detail.isNotEmpty()) Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        parseServerTime(p.submittedAt)?.let {
            Text("Enviada el ${it.shortWithTime()}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
        }
    }
}

@Composable
private fun QueuedCard(q: QueuedSubmission, catalog: Catalog, container: AppContainer) {
    SectionCard {
        Row(Modifier.fillMaxWidth()) {
            Text(
                "${q.request.category} · ${q.request.days.joinToString { it.date.relative() }}",
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            if (q.error != null) Pill("Rechazada", MaterialTheme.colorScheme.error) else Pill("Pendiente", Warning)
        }
        val units = q.request.days.sumOf { it.units.total() }
        val kg = q.request.days.sumOf { catalog.kg(it.units) }
        Text("${formatNumber(units.toDouble())} unidades · ${formatKg(kg)}", modifier = Modifier.padding(top = 6.dp))
        q.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        Row {
            if (q.error != null) {
                TextButton(onClick = {
                    container.planning.retry(q.request.submissionId)
                    container.notifyChanged(ServerEvent.Connected)
                }) { Text("Reintentar") }
            }
            TextButton(onClick = { container.planning.discard(q.request.submissionId) }) { Text("Descartar") }
        }
    }
}
