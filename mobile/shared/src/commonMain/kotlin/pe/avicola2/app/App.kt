package pe.avicola2.app

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import kotlin.reflect.KClass
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.datetime.LocalDate
import kotlinx.serialization.Serializable
import pe.avicola2.app.application.AppRelease
import pe.avicola2.app.application.ServerEvent
import pe.avicola2.app.application.SessionState
import pe.avicola2.app.domain.Account
import pe.avicola2.app.ui.Load
import pe.avicola2.app.ui.components.Loading
import pe.avicola2.app.ui.screens.ChangePasswordScreen
import pe.avicola2.app.ui.screens.HomeScreen
import pe.avicola2.app.ui.screens.LoginScreen
import pe.avicola2.app.ui.screens.NewProjectionScreen
import pe.avicola2.app.ui.screens.NotificationsScreen
import pe.avicola2.app.ui.screens.NotificationsViewModel
import pe.avicola2.app.ui.screens.ProfileScreen
import pe.avicola2.app.ui.screens.ProductionScreen
import pe.avicola2.app.ui.screens.ProjectionsScreen
import pe.avicola2.app.ui.screens.SacaScreen
import pe.avicola2.app.ui.screens.StockScreen
import pe.avicola2.app.ui.theme.AppTheme

@Serializable object HomeRoute
@Serializable object ProjectionsRoute
@Serializable object NotificationsRoute
@Serializable object ProfileRoute
@Serializable data class NewProjectionRoute(val start: String? = null)
@Serializable object ChangePasswordRoute
@Serializable object StockRoute
@Serializable object SacaRoute
@Serializable object ProductionRoute

private data class TopLevel(val label: String, val icon: ImageVector, val route: Any, val type: KClass<*>)

private val HOME = TopLevel("Inicio", Icons.Filled.Home, HomeRoute, HomeRoute::class)
private val PROJECTIONS = TopLevel("Proyecciones", Icons.AutoMirrored.Filled.List, ProjectionsRoute, ProjectionsRoute::class)
private val SACA = TopLevel("Saca", Icons.Filled.ShoppingCart, SacaRoute, SacaRoute::class)
private val STOCK = TopLevel("Stock", Icons.Filled.Home, StockRoute, StockRoute::class)
private val PRODUCTION = TopLevel("Producción", Icons.Filled.DateRange, ProductionRoute, ProductionRoute::class)
private val NOTICES = TopLevel("Avisos", Icons.Filled.Notifications, NotificationsRoute, NotificationsRoute::class)
private val PROFILE = TopLevel("Perfil", Icons.Filled.Person, ProfileRoute, ProfileRoute::class)

/** Pestañas según lo que la cuenta puede hacer (lo decide el backend, no el nombre del rol). */
private fun topLevel(account: Account): List<TopLevel> = when {
    // Jefe de despacho: su inicio es el stock; no proyecta ni ve al equipo.
    account.stockOnly -> listOfNotNull(STOCK, PRODUCTION.takeIf { account.canViewProduction }, NOTICES, PROFILE)
    account.canViewSaca -> listOf(HOME, PROJECTIONS, SACA, NOTICES, PROFILE)
    else -> listOf(HOME, PROJECTIONS, NOTICES, PROFILE)
}

/** Punto de entrada común (Android e iOS). */
@Composable
fun App(container: AppContainer) {
    AppTheme {
        Surface(Modifier.fillMaxSize()) {
            val state by container.session.state.collectAsState()
            LaunchedEffect(Unit) { container.session.restore() }
            when (val s = state) {
                SessionState.Restoring -> Loading()
                is SessionState.SignedOut -> LoginScreen(container, s.reason)
                is SessionState.SignedIn ->
                    if (s.account.mustChangePassword) ChangePasswordScreen(container, forced = true, onDone = {})
                    else MainShell(container, s.account)
            }
        }
    }
}

@Composable
private fun MainShell(container: AppContainer, account: Account) {
    val nav = rememberNavController()
    val snackbar = remember { SnackbarHostState() }
    val notifications = viewModel { NotificationsViewModel(container) }
    val notificationsState by notifications.state.collectAsState()
    val unread = (notificationsState as? Load.Ready)?.value?.unread ?: 0
    var update by remember { mutableStateOf<AppRelease?>(null) }
    var updateDialog by remember { mutableStateOf<AppRelease?>(null) }
    val uri = LocalUriHandler.current
    val me = account.seller.username

    // Tiempo real: el servidor avisa y cada pantalla recarga lo suyo.
    LaunchedEffect(me) {
        container.events.events().collect { event ->
            if (event == ServerEvent.SessionRevoked) container.session.signOut("Tu sesión se cerró (cambio de contraseña o cuenta desactivada).")
            else container.notifyChanged(event)
        }
    }
    // Cola offline: se envía al reconectar, al pedirlo y cada minuto mientras haya pendientes.
    LaunchedEffect(me) {
        launch {
            container.changes.collect { if (it == ServerEvent.Connected) flush(container, me, snackbar) }
        }
        while (true) {
            if (container.planning.queue.of(me).any { it.error == null }) flush(container, me, snackbar)
            delay(60_000)
        }
    }
    LaunchedEffect(Unit) { update = container.updates.check() }

    val backStack by nav.currentBackStackEntryAsState()
    val destination = backStack?.destination
    val tabs = remember(account) { topLevel(account) }
    val showNav = tabs.any { t -> destination?.hasRoute(t.type) == true }

    fun go(route: Any) = nav.navigate(route) {
        popUpTo(nav.graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        val wide = maxWidth >= 600.dp
        Scaffold(
            snackbarHost = { SnackbarHost(snackbar) },
            bottomBar = {
                if (showNav && !wide) {
                    NavigationBar {
                        tabs.forEach { t ->
                            NavigationBarItem(
                                selected = destination?.hasRoute(t.type) == true,
                                onClick = { go(t.route) },
                                icon = { NavIcon(t, unread) },
                                label = { Text(t.label) },
                            )
                        }
                    }
                }
            },
        ) { inner ->
            Row(Modifier.fillMaxSize().padding(inner).consumeWindowInsets(inner)) {
                if (showNav && wide) {
                    NavigationRail {
                        tabs.forEach { t ->
                            NavigationRailItem(
                                selected = destination?.hasRoute(t.type) == true,
                                onClick = { go(t.route) },
                                icon = { NavIcon(t, unread) },
                                label = { Text(t.label) },
                            )
                        }
                    }
                }
                AppNavHost(nav, container, account, update, notifications, onUpdate = { updateDialog = it })
            }
        }
    }

    updateDialog?.let { r ->
        AlertDialog(
            onDismissRequest = { updateDialog = null },
            title = { Text("Versión ${r.version}") },
            text = {
                Text(
                    (r.notes.take(600).ifBlank { "Hay una nueva versión de la app." }) +
                        "\n\nAl abrir el archivo, Android puede pedirte permitir instalar apps de esta fuente.",
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    uri.openUri(r.apkUrl ?: r.pageUrl)
                    updateDialog = null
                }) { Text("Descargar") }
            },
            dismissButton = { TextButton(onClick = { updateDialog = null }) { Text("Después") } },
        )
    }
}

@Composable
private fun NavIcon(t: TopLevel, unread: Int) {
    if (t.route == NotificationsRoute && unread > 0) {
        BadgedBox(badge = { Badge { Text(if (unread > 99) "99+" else unread.toString()) } }) { Icon(t.icon, t.label) }
    } else {
        Icon(t.icon, t.label)
    }
}

@Composable
private fun AppNavHost(
    nav: NavHostController,
    container: AppContainer,
    account: Account,
    update: AppRelease?,
    notifications: NotificationsViewModel,
    onUpdate: (AppRelease) -> Unit,
) {
    val start: Any = if (account.stockOnly) StockRoute else HomeRoute
    NavHost(nav, startDestination = start) {
        composable<StockRoute> {
            // Para el jefe de despacho es el inicio (sin "Volver"); el supervisor llega desde Saca.
            StockScreen(container, account, onBack = if (account.stockOnly) null else ({ nav.popBackStack() }))
        }
        composable<ProductionRoute> {
            ProductionScreen(container, account, onBack = if (account.stockOnly) null else ({ nav.popBackStack() }))
        }
        composable<SacaRoute> { SacaScreen(container, account, onOpenStock = { nav.navigate(StockRoute) }) }
        composable<HomeRoute> {
            HomeScreen(
                container,
                account,
                update,
                onRegister = { date -> nav.navigate(NewProjectionRoute(date?.toString())) },
                onOpenUpdate = onUpdate,
            )
        }
        composable<ProjectionsRoute> { ProjectionsScreen(container, account) }
        composable<NotificationsRoute> { NotificationsScreen(notifications) }
        composable<ProfileRoute> {
            ProfileScreen(container, account, onChangePassword = { nav.navigate(ChangePasswordRoute) }, onUpdate = onUpdate)
        }
        composable<NewProjectionRoute> { entry ->
            val start = entry.toRoute<NewProjectionRoute>().start?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
            NewProjectionScreen(container, account, start, onClose = { nav.popBackStack() })
        }
        composable<ChangePasswordRoute> {
            ChangePasswordScreen(container, forced = false, onDone = { nav.popBackStack() })
        }
    }
}

private suspend fun flush(container: AppContainer, me: String, snackbar: SnackbarHostState) {
    val sent = container.planning.flush(me)
    if (sent > 0) {
        container.notifyChanged(ServerEvent.ProjectionsChanged)
        snackbar.showSnackbar(if (sent == 1) "Se envió 1 proyección guardada." else "Se enviaron $sent proyecciones guardadas.")
    }
}
