package pe.avicola2.app.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import pe.avicola2.app.AppContainer
import pe.avicola2.app.application.ServerEvent
import pe.avicola2.app.domain.Notification
import pe.avicola2.app.domain.Notifications
import pe.avicola2.app.domain.parseServerTime
import pe.avicola2.app.domain.shortWithTime
import pe.avicola2.app.ui.Load
import pe.avicola2.app.ui.components.Centered
import pe.avicola2.app.ui.components.EmptyState
import pe.avicola2.app.ui.components.ErrorState
import pe.avicola2.app.ui.components.Loading
import pe.avicola2.app.ui.userMessage

/** Notificaciones y contador de no leídas (lo usa también la barra de navegación). */
class NotificationsViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow<Load<Notifications>>(Load.Loading)
    val state: StateFlow<Load<Notifications>> = _state.asStateFlow()

    init {
        load()
        viewModelScope.launch {
            c.changes.collect { if (it == ServerEvent.Notification || it == ServerEvent.Connected) load() }
        }
    }

    fun load() {
        val current = _state.value
        if (current is Load.Ready) _state.value = current.copy(refreshing = true)
        viewModelScope.launch {
            _state.value = try {
                Load.Ready(c.notifications.list())
            } catch (e: Exception) {
                if (current is Load.Ready) current.copy(refreshing = false) else Load.Failed(e.userMessage())
            }
        }
    }

    fun markRead(ids: List<Int>? = null) {
        viewModelScope.launch {
            runCatching { c.notifications.markRead(ids) }.onSuccess { load() }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(vm: NotificationsViewModel) {
    val state by vm.state.collectAsState()
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Notificaciones") },
                actions = {
                    val unread = (state as? Load.Ready)?.value?.unread ?: 0
                    if (unread > 0) TextButton(onClick = { vm.markRead() }) { Text("Marcar todo leído") }
                },
            )
        },
    ) { padding ->
        Centered(Modifier.padding(padding)) {
            when (val s = state) {
                Load.Loading -> Loading()
                is Load.Failed -> ErrorState(s.message, onRetry = vm::load)
                is Load.Ready -> PullToRefreshBox(isRefreshing = s.refreshing, onRefresh = vm::load) {
                    LazyColumn(contentPadding = PaddingValues(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        if (s.value.items.isEmpty()) item { EmptyState("Todo al día", "Aquí llegarán los recordatorios y avisos del supervisor.") }
                        items(s.value.items, key = { it.id }) { n -> NotificationRow(n) { if (n.unread) vm.markRead(listOf(n.id)) } }
                    }
                }
            }
        }
    }
}

@Composable
private fun NotificationRow(n: Notification, onClick: () -> Unit) {
    val bg = if (n.unread) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f) else MaterialTheme.colorScheme.background
    Surface(color = bg, modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.Top) {
            Box(Modifier.padding(top = 6.dp, end = 12.dp).size(8.dp)) {
                if (n.unread) Surface(color = MaterialTheme.colorScheme.primary, shape = CircleShape, modifier = Modifier.size(8.dp)) {}
            }
            Column(Modifier.weight(1f)) {
                Text(n.title, fontWeight = if (n.unread) FontWeight.SemiBold else FontWeight.Normal)
                Text(n.body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                parseServerTime(n.createdAt)?.let {
                    Text(it.shortWithTime(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
                }
            }
        }
    }
}
